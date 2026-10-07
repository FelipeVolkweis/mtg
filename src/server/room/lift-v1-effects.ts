import type {
  Condition,
  ContinuousChange,
  Effect,
  Layer,
  Predicate,
  PredicateFields,
  Selector,
  Value,
} from "../../shared/rules-v2.js";

// Snapshot version 3 (roadmap issue 7): the runtime runs Core AST effects. A
// stored Room still holds the version 1 runtime effects the down-compiler
// used to emit, in Stack objects, waiting triggers, pending procedures and an
// in-flight resolution. These functions lift them back to the Core AST the
// compiler emits for the same cards. Pure: documents in, documents out.

type Doc = Record<string, unknown>;
type V1Filter = Record<string, unknown>;
type V1Value = number | Record<string, unknown>;
type V1Effect = Doc & { kind: string };

const target: Selector = { target: "target-0" };

/** `for-each-player`'s set: the predicate, controlled by the bound player. */
const controlledBy = (p: Predicate): Predicate =>
  "and" in p || "or" in p || "not" in p
    ? { and: [{ controller: { binding: "player" } }, p] }
    : { ...p, controller: { binding: "player" } };

/** The binding a lifted create-token names, for a later "attach to created". */
export const createdBinding = "created";

export function predicate(filter: V1Filter): Predicate {
  const fields: PredicateFields = { zone: filter.zone as "battlefield" };
  const and: Predicate[] = [];
  const player = (p: unknown): "you" | "opponents" =>
    p === "you" ? "you" : "opponents";
  if (filter.kind) fields.object = filter.kind as "card";
  if (filter.types) fields.type = filter.types as string[];
  if (filter.subtypes) fields.subtype = filter.subtypes as string[];
  if (filter.controller) fields.controller = player(filter.controller);
  if (filter.owner) fields.owner = player(filter.owner);
  if (filter.colored) fields.color = "any";
  if (filter.colorless) fields.color = "colorless";
  const status = [
    ...(filter.untapped ? (["untapped"] as const) : []),
    ...(filter.attacking ? (["attacking"] as const) : []),
  ];
  if (status.length) fields.status = status.length === 1 ? status[0] : status;
  if (filter.manaValue !== undefined)
    fields.manaValue = { "=": value(filter.manaValue as V1Value) };
  if (filter.damagedBySource) fields.dealtDamageBy = "source";
  if (filter.self === "only") fields.is = "source";
  if (filter.attached) and.push({ is: { attachedTo: "source" } });
  if (filter.self === "exclude") and.push({ not: { is: "source" } });
  if (filter.nontoken) and.push({ not: { object: "token" } });
  if (filter.excludeTypes)
    and.push({ not: { type: filter.excludeTypes as string[] } });
  for (const type of (filter.allTypes as string[] | undefined) ?? [])
    and.push({ type });
  return and.length ? { and: [fields, ...and] } : fields;
}

export function value(v: V1Value): Value {
  if (typeof v === "number") return v;
  if ("binding" in v)
    return v.binding === "X"
      ? { variable: "X" }
      : { binding: v.binding as string };
  if ("count" in v) return { count: { all: predicate(v.count as V1Filter) } };
  if ("sum" in v) return { sum: (v.sum as V1Value[]).map(value) };
  if ("handSize" in v) return { cardsIn: { zone: "hand", player: "you" } };
  return {
    greatest: {
      of: { all: predicate(v.greatestManaValue as V1Filter) },
      name: "manaValue",
    },
  };
}

const sourceOnly = (filter: V1Filter) =>
  filter.self === "only" &&
  filter.zone === "battlefield" &&
  Object.keys(filter).length === 2;

function objects(effect: V1Effect): Selector {
  const filter = effect.filter as V1Filter | undefined;
  switch (effect.subject) {
    case "source":
      return "source";
    case "target":
      return target;
    case "choice":
      return { choose: { from: predicate(filter!), count: 1 } };
    default:
      return { all: predicate(filter!) };
  }
}

const keywordGrants: Record<string, Effect> = {
  Unblockable: {
    kind: "apply-grant",
    grant: { kind: "block-restriction", objects: "source" },
    duration: "end-of-turn",
  },
  "Must attack": {
    kind: "apply-grant",
    grant: { kind: "attack-requirement", objects: "source" },
    duration: "end-of-turn",
  },
  "Cannot be blocked by Walls": {
    kind: "apply-grant",
    grant: {
      kind: "block-restriction",
      objects: "source",
      by: { subtype: "Wall" },
    },
    duration: "end-of-turn",
  },
};

/** CR 613 layers, as the compiler tags them. */
const layers: Record<string, Layer[]> = {
  "copy-linked": ["4", "7b"],
  "add-types": ["4"],
  "grant-keyword": ["6"],
  "define-stats": ["7a"],
  "set-base-stats": ["7b"],
  "add-stats": ["7c"],
};

function change(c: Doc): ContinuousChange {
  const lifted = untagged(c);
  return { ...lifted, layer: layers[lifted.kind] } as ContinuousChange;
}

function untagged(c: Doc): ContinuousChange {
  switch (c.kind) {
    case "set-stats":
      return {
        kind: "set-base-stats",
        power: value(c.power as V1Value),
        toughness: value(c.toughness as V1Value),
      };
    case "add-stats":
    case "define-stats":
      return {
        kind: c.kind,
        power: value(c.power as V1Value),
        toughness: value(c.toughness as V1Value),
      };
    case "grant-keyword":
      return {
        kind: "grant-keyword",
        keyword: (c.keyword as string).toLowerCase() as "flying",
      };
    case "linked-characteristics":
      return {
        kind: "copy-linked",
        link: c.link as string,
        retainSubtypes: c.retainSubtypes as string[],
      };
    default:
      return c as ContinuousChange;
  }
}

/** One version 1 runtime effect as Core AST effects. */
export function liftEffect(e: V1Effect): Effect[] {
  const bind = e.bind ? { bind: e.bind as string } : {};
  switch (e.kind) {
    case "move":
    case "destroy":
    case "exile":
    case "sacrifice": {
      const selector = objects(e);
      const base =
        e.kind === "move"
          ? {
              kind: "move" as const,
              objects: selector,
              to: { zone: e.destination as "hand" },
            }
          : e.kind === "exile"
            ? {
                kind: "exile" as const,
                objects: selector,
                ...(e.link ? { linkAs: e.link as string } : {}),
              }
            : { kind: e.kind as "destroy", objects: selector };
      if (e.eachPlayer)
        return [
          {
            kind: "for-each-player",
            players: "each-player",
            order: "APNAP",
            effects: [
              {
                kind: "sacrifice",
                objects: {
                  all: controlledBy(predicate(e.filter as V1Filter)),
                },
              },
            ],
          },
        ];
      if (e.optional) return [{ kind: "may", effects: [{ ...base, ...bind }] }];
      return [{ ...base, ...bind } as Effect];
    }
    case "inspect": {
      const count = e.count as number;
      if (!e.select)
        return [
          {
            kind: "library-sequence",
            player: "you",
            count,
            operation: "look",
            select: { max: count, to: { zone: "library", position: "bottom" } },
            rest: { to: { zone: "library", position: "top" }, order: "any" },
          },
        ];
      return [
        {
          kind: "library-sequence",
          player: "you",
          count,
          operation: "look",
          select: {
            filter: predicate(e.select as V1Filter),
            max: 1,
            to: { zone: "hand" },
            ...(e.revealSelected ? { reveal: true } : {}),
          },
          rest: {
            to: { zone: "library", position: "bottom" },
            order: e.randomBottom ? "random" : "keep",
          },
        },
      ];
    }
    case "damage":
      return [
        {
          kind: "damage",
          amount: value(e.amount as V1Value),
          to: e.recipient === "defender" ? { attackedBy: "source" } : target,
        },
      ];
    case "tap-choice":
      return [
        {
          kind: "tap",
          objects: {
            choose: {
              from: predicate(e.filter as V1Filter),
              count: { min: 0 },
            },
          },
          ...bind,
        },
      ];
    case "pay-mana":
      return [mayPay(e, [], [])];
    case "become-monarch":
      return [
        {
          kind: "become-monarch",
          player:
            e.player === "event-controller"
              ? { controllerOf: { event: "object" } }
              : "you",
        },
      ];
    case "tap-attached":
      return [{ kind: "tap", objects: { attachedTo: "source" } }];
    case "counter-event":
      return [{ kind: "counter", objects: { event: "source" } }];
    case "counter-target":
      return [{ kind: "counter", objects: target }];
    case "redirect-attack":
      return [{ kind: "reselect-defender", attacker: target }];
    case "lose-life":
      return [
        {
          kind: "lose-life",
          player:
            e.player === "event-player"
              ? { event: "player" }
              : (e.player as "you"),
          amount: value(e.amount as V1Value),
        },
      ];
    case "gain-life":
      return [{ kind: "gain-life", amount: e.amount as number }];
    case "animate-source": {
      const objects: Selector = e.recipient === "target" ? target : "source";
      const changes = e.changes as Doc[];
      const grants = changes
        .filter(
          (c) =>
            c.kind === "grant-keyword" && keywordGrants[c.keyword as string],
        )
        .map((c) => {
          const grant = structuredClone(
            keywordGrants[c.keyword as string],
          ) as Extract<Effect, { kind: "apply-grant" }>;
          (grant.grant as { objects: Selector }).objects = objects;
          return grant;
        });
      const rest = changes.filter(
        (c) =>
          !(c.kind === "grant-keyword" && keywordGrants[c.keyword as string]),
      );
      return [
        ...(rest.length
          ? [
              {
                kind: "apply-continuous" as const,
                objects,
                changes: rest.map(change),
                duration: "end-of-turn" as const,
              },
            ]
          : []),
        ...grants,
      ];
    }
    case "attach":
      return [
        e.to === "created"
          ? {
              kind: "attach",
              object: "source",
              to: { binding: createdBinding },
            }
          : { kind: "attach", to: target },
      ];
    case "discard":
      return [discard(e)];
    case "add-counters": {
      const filter = e.filter as V1Filter;
      return [
        {
          kind: "add-counters",
          objects: sourceOnly(filter) ? "source" : { all: predicate(filter) },
          counter: e.counter as string,
          count: e.count as number,
        },
      ];
    }
    case "create-token":
      return [
        {
          kind: "create-token",
          token: tokens[e.token as string] ?? (e.token as string),
          count: e.count as number,
        },
      ];
    case "draw":
      return [
        {
          kind: "draw",
          count: value(e.count as V1Value),
          ...(e.player === "each" ? { player: "each-player" as const } : {}),
          ...bind,
        },
      ];
    case "sequence":
      return [
        { kind: "sequence", effects: liftEffects(e.effects as V1Effect[]) },
      ];
    case "if":
      return [
        {
          kind: "if",
          condition: condition(e.condition as Doc),
          then: liftEffects(e.then as V1Effect[]),
          ...((e.otherwise as V1Effect[]).length
            ? { else: liftEffects(e.otherwise as V1Effect[]) }
            : {}),
        },
      ];
    case "alternative":
      return [chooseOne(e.options as Doc[])];
    default:
      // add-mana and enter-tapped are ability fields (liftAbility).
      throw new Error(`Unknown version 1 effect ${e.kind}.`);
  }
}

const tokens: Record<string, string> = {
  thopter: "thopter-1-1-flying",
  myr: "myr-1-1",
  germ: "phyrexian-germ-0-0",
};

function condition(c: Doc): Condition {
  return {
    compare: [{ binding: c.binding as string }, ">=", c.atLeast as number],
  };
}

export function discard(e: Doc): Extract<Effect, { kind: "discard" }> {
  return {
    kind: "discard",
    count: value(e.count as V1Value),
    ...(e.types ? { filter: { type: e.types as string[] } } : {}),
    ...(e.bind ? { bind: e.bind as string } : {}),
  };
}

/** A discard choice; an option that must be complete gets an availability condition. */
export function chooseOne(options: Doc[]): Effect {
  return {
    kind: "choose-one",
    options: options.map((option) => {
      const effect = discard(option.effect as Doc);
      return {
        id: option.id as string,
        label: option.label as string,
        ...(option.requireComplete
          ? {
              available: {
                exists: {
                  all: {
                    zone: "hand" as const,
                    owner: "you" as const,
                    ...(effect.filter as PredicateFields | undefined),
                  },
                },
              },
            }
          : {}),
        effects: [effect],
      };
    }),
  };
}

export function mayPay(
  e: V1Effect,
  then: Effect[],
  otherwise: Effect[],
): Effect {
  return {
    kind: "may-pay",
    ...(e.player === "event-player"
      ? { player: { event: "player" as const } }
      : {}),
    costs: [{ kind: "mana", symbols: e.symbols as string[] }],
    ...(then.length ? { then } : {}),
    ...(otherwise.length ? { else: otherwise } : {}),
  };
}

/** Version 1 wrote "unless pays" as a payment and an `if` on its binding. */
const paidBranch = (pay: V1Effect, next: V1Effect | undefined) =>
  next?.kind === "if" && (next.condition as Doc).binding === pay.bind
    ? next
    : undefined;

export function liftEffects(effects: V1Effect[]): Effect[] {
  const out: Effect[] = [];
  for (let i = 0; i < effects.length; i++) {
    const effect = effects[i];
    const branch =
      effect.kind === "pay-mana"
        ? paidBranch(effect, effects[i + 1])
        : undefined;
    if (branch) {
      out.push(
        mayPay(
          effect,
          liftEffects(branch.then as V1Effect[]),
          liftEffects(branch.otherwise as V1Effect[]),
        ),
      );
      i++;
    } else if (effect.kind === "attach" && effect.to === "created") {
      // Version 1 attached to the token just created; Core binds it.
      const created = [...out].reverse().find((e) => e.kind === "create-token");
      if (created) created.bind = createdBinding;
      out.push(...liftEffect(effect));
    } else out.push(...liftEffect(effect));
  }
  return out;
}

/** A stored runtime ability: effects lifted, mana and enter-tapped as fields. */
export function liftAbility(ability: Doc | undefined) {
  if (!ability || !Array.isArray(ability.effects)) return;
  const effects = ability.effects as V1Effect[];
  const mana = effects.find((e) => e.kind === "add-mana");
  if (mana) {
    const { kind: _kind, ...produce } = mana;
    ability.produce = produce;
  }
  if (effects.some((e) => e.kind === "enter-tapped"))
    ability.entersTapped = true;
  ability.effects = liftEffects(
    effects.filter((e) => e.kind !== "add-mana" && e.kind !== "enter-tapped"),
  );
}

/** An in-flight resolution: its queue and its waiting choice. */
export function liftResolution(progress: Doc) {
  const remaining = (progress.remaining ?? []) as V1Effect[];
  const action = progress.actionChoice as V1Effect | undefined;
  const choice = progress.choiceEffect as V1Effect | undefined;
  const choices = progress.choices as Record<string, Doc> | undefined;
  let waiting: { effect: Effect; state: unknown } | undefined;
  if (action?.kind === "pay-mana") {
    const branch = paidBranch(action, remaining[0]);
    if (branch) remaining.shift();
    waiting = {
      effect: mayPay(
        action,
        liftEffects((branch?.then ?? []) as V1Effect[]),
        liftEffects((branch?.otherwise ?? []) as V1Effect[]),
      ),
      state: null,
    };
  } else if (action) waiting = { effect: liftEffect(action)[0], state: null };
  else if (choice?.kind === "inspect")
    waiting = {
      effect: liftEffect(choice)[0],
      state: { inspected: (progress.inspectedIds ?? []) as string[] },
    };
  else if (choice?.eachPlayer)
    waiting = {
      effect: liftEffect(choice)[0],
      state: {
        players: (progress.selectionPlayers ?? []) as string[],
        chosen: (progress.simultaneousIds ?? []) as string[],
      },
    };
  else if (choice) waiting = { effect: liftEffect(choice)[0], state: null };
  else if (choices) {
    const lifted = Object.fromEntries(
      Object.entries(choices).map(([id, effect]) => [id, discard(effect)]),
    );
    const ids = Object.keys(lifted);
    waiting = {
      effect:
        ids.length === 1 && ids[0] === "discard"
          ? lifted.discard
          : {
              kind: "choose-one",
              options: ids.map((id) => ({
                id,
                label: id,
                effects: [lifted[id]],
              })),
            },
      state: { choices: lifted },
    };
  }
  progress.remaining = liftEffects(remaining);
  if (waiting) progress.waiting = waiting;
  if (progress.createdIds)
    progress.objects = { [createdBinding]: progress.createdIds };
  for (const field of [
    "actionChoice",
    "choiceEffect",
    "choices",
    "createdIds",
    "selectionPlayers",
    "simultaneousIds",
  ])
    delete progress[field];
}
