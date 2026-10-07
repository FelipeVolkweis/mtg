import type { CardAbility } from "../../shared/model.js";
import {
  rulesAbilitySchema,
  supportedKeywordSchema,
  type ContinuousChange as V1Change,
  type MovementEffect,
  type ObjectFilter,
  type RulesAbility,
  type RulesCost,
  type RulesEffect,
  type RulesValue,
} from "../../shared/rules.js";
import {
  turnSteps,
  type Condition,
  type ContinuousChange,
  type Cost,
  type Effect,
  type PlayerRef,
  type Predicate,
  type PredicateFields,
  type Selector,
  type StaticGrant,
  type TargetClause,
  type Trigger,
  type Value,
} from "../../shared/rules-v2.js";
import type { CompileError, CoreAbility } from "./compiler.js";

// Down-compiler: Core AST → the version 1 runtime shapes the engine executes
// today (dsl-redesign.md §9 step 3). It exists until the effect handlers and
// the VM read the Core AST (roadmap issues 7 and 8). Anything the current
// runtime can't run fails with an error naming the construct; nothing is
// approximated.

export type DownCompileResult =
  | { ok: true; abilities: CardAbility[] }
  | { ok: false; errors: CompileError[] };

type V1Keyword = RulesAbility["keyword"];
type V1Token = Extract<RulesEffect, { kind: "create-token" }>["token"];

const v1Tokens: Record<string, V1Token> = {
  "thopter-1-1-flying": "thopter",
  "myr-1-1": "myr",
  "phyrexian-germ-0-0": "germ",
};
const sourceFilter: ObjectFilter = { zone: "battlefield", self: "only" };
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

class Unsupported extends Error {
  constructor(
    message: string,
    readonly path: string,
  ) {
    super(message);
  }
}

class DownCompiler {
  private path = "";
  private targets: TargetClause[] = [];
  private usesX = false;
  private payments = 0;

  unsupported(what: string): never {
    throw new Unsupported(
      `${what} is not supported by the current runtime.`,
      this.path,
    );
  }

  at<T>(field: string, run: () => T): T {
    const previous = this.path;
    this.path =
      !previous || field.startsWith("[")
        ? `${previous}${field}`
        : `${previous}.${field}`;
    try {
      return run();
    } finally {
      this.path = previous;
    }
  }

  ability(ability: CoreAbility): CardAbility {
    this.targets = [];
    this.usesX = false;
    this.payments = 0;
    const base = {
      id: ability.id,
      ...(ability.description ? { description: ability.description } : {}),
      origin: "printed" as const,
    };
    const card = (
      kind: CardAbility["kind"],
      rules: Partial<RulesAbility>,
      applicableZone?: CardAbility["applicableZone"],
    ): CardAbility => ({
      ...base,
      kind,
      ...(applicableZone ? { applicableZone } : {}),
      rules: rulesAbilitySchema.parse(rules),
    });
    switch (ability.kind) {
      case "keyword": {
        const keyword = ability.keyword;
        if (typeof keyword === "string")
          return card("static", { keyword: this.keyword(keyword) });
        if (keyword.name === "enchant")
          return card("static", {
            aura: this.at("keyword.filter", () => this.filter(keyword.filter)),
          });
        if (keyword.name === "improvise")
          return card("static", { improvise: true });
        return this.unsupported(`The ${keyword.name} keyword`);
      }
      case "mana": {
        const produce = ability.produce;
        if (produce.colors && !Array.isArray(produce.colors))
          if (produce.colors.commanderColors !== "you")
            this.unsupported("Commander colors of another player");
        const effect: RulesEffect = {
          kind: "add-mana",
          quantity: produce.quantity,
          colors: Array.isArray(produce.colors)
            ? produce.colors
            : "commander-colors",
          ...(produce.restriction ? { restriction: produce.restriction } : {}),
        };
        if ("costs" in ability.activation)
          return card("activated", {
            costs: this.at("activation.costs", () =>
              this.costs((ability.activation as { costs: Cost[] }).costs),
            ),
            effects: [effect],
            manaAbility: true,
          });
        const trigger = ability.activation.trigger;
        if (trigger.produced)
          this.unsupported("A produced-mana trigger filter");
        return card("triggered", {
          trigger: {
            event: "mana",
            filter: this.at("activation.trigger.object", () =>
              this.filter(trigger.object),
            ),
          },
          effects: [effect],
          manaAbility: true,
        });
      }
      case "replacement":
        if (
          ability.replace.kind === "enter-tapped" &&
          ability.event.event === "would-enter" &&
          same(ability.event.object, { is: "source" })
        )
          return card("static", { effects: [{ kind: "enter-tapped" }] });
        return this.unsupported(
          `A ${ability.replace.kind} replacement of ${ability.event.event}`,
        );
      case "static":
        return card("static", this.static(ability));
      case "spell": {
        const body = this.body(ability);
        return card("spell", { ...body, ...this.chosen() });
      }
      case "triggered": {
        const trigger = this.at("trigger", () => this.trigger(ability.trigger));
        const intervening = ability.interveningIf
          ? this.at("interveningIf", () =>
              this.intervening(ability.interveningIf!),
            )
          : undefined;
        return card("triggered", {
          trigger,
          ...(intervening ? { intervening } : {}),
          ...this.body(ability),
        });
      }
      case "activated": {
        const costs = this.at("costs", () => this.costs(ability.costs));
        if (ability.limit && ability.limit.perTurn !== 1)
          this.unsupported("A limit other than once per turn");
        if (ability.activeFrom && ability.activeFrom !== "hand")
          this.unsupported(`Activation from ${ability.activeFrom}`);
        if (costs.some((c) => c.kind === "mana" && c.symbols.includes("{X}")))
          this.usesX = true;
        const body = this.body(ability);
        return card(
          "activated",
          {
            costs,
            ...(ability.timing ? { timing: ability.timing } : {}),
            ...(ability.limit ? { oncePerTurn: true } : {}),
            ...body,
            ...this.chosen(),
          },
          ability.activeFrom === "hand" ? "hand" : "battlefield",
        );
      }
    }
  }

  private chosen(): Partial<RulesAbility> {
    return this.usesX ? { chosenVariables: ["X"] } : {};
  }

  private keyword(keyword: string): V1Keyword {
    const name = keyword[0].toUpperCase() + keyword.slice(1);
    const parsed = supportedKeywordSchema.safeParse(name);
    if (!parsed.success) this.unsupported(`The ${keyword} keyword`);
    return parsed.data;
  }

  // -------------------------------------------------------------- statics

  private static(ability: Extract<CoreAbility, { kind: "static" }>) {
    const rules: Partial<RulesAbility> = {};
    const changes: V1Change[] = [];
    let objects: Selector | undefined;
    const sameObjects = (selector: Selector) => {
      if (objects && !same(objects, selector))
        this.unsupported("Grants over different objects in one ability");
      objects = selector;
    };
    let keywordGrants = 0;
    ability.grants.forEach((grant, i) =>
      this.at(`grants[${i}]`, () => {
        const keyword = this.grantKeyword(grant);
        if (keyword) {
          sameObjects(keyword.objects);
          changes.push({ kind: "grant-keyword", keyword: keyword.keyword });
          keywordGrants++;
          return;
        }
        switch (grant.kind) {
          case "continuous":
            sameObjects(grant.objects);
            changes.push(...grant.changes.map((c) => this.change(c)));
            return;
          case "cost-modifier": {
            if (grant.increase !== undefined || grant.condition)
              this.unsupported("A cost increase or conditional cost modifier");
            const amount = this.value(grant.reduce!);
            rules.costModifiers ??= [];
            if (grant.applies === "this")
              rules.costModifiers.push({
                use: "cast",
                scope: "source",
                component: "generic",
                amount,
              });
            else if ("spells" in grant.applies)
              rules.costModifiers.push({
                use: "cast",
                scope: "controller",
                component: "generic",
                filter: this.filter(grant.applies.spells),
                amount,
              });
            else
              this.unsupported(
                "A cost modifier for another object's abilities",
              );
            return;
          }
          case "attack-tax": {
            const [cost] = grant.costPerAttacker;
            if (
              grant.defender !== "you" ||
              grant.costPerAttacker.length !== 1 ||
              cost.kind !== "mana"
            )
              this.unsupported("An attack tax other than mana to attack you");
            rules.attackCost = {
              symbols: (cost as { symbols: string[] }).symbols,
            };
            return;
          }
          case "cast-timing":
            rules.castingPermission = this.filter(grant.spells);
            return;
          case "maximum-hand-size":
            if (grant.player !== "you" || grant.value !== "unlimited")
              this.unsupported(
                "A maximum hand size other than your unlimited one",
              );
            rules.maximumHandSize = "unlimited";
            return;
          case "untap-restriction":
            if (
              !same(grant, {
                kind: "untap-restriction",
                objects: { attachedTo: "source" },
                unless: { monarch: { controllerOf: { attachedTo: "source" } } },
              })
            )
              this.unsupported(
                "An untap restriction other than the monarch lock",
              );
            rules.monarchUntap = true;
            return;
          default:
            this.unsupported(`The ${grant.kind} grant`);
        }
      }),
    );
    if (changes.length) {
      if (
        objects === "source" &&
        keywordGrants === 1 &&
        changes.length === 1 &&
        !ability.condition
      )
        rules.keyword = (changes[0] as { keyword: V1Keyword }).keyword;
      else
        rules.continuous = {
          filter: this.at("grants.objects", () => this.objectsFilter(objects!)),
          changes,
          ...(ability.characteristicDefining
            ? { characteristicDefining: true }
            : {}),
          ...(ability.condition
            ? {
                condition: this.at("condition", () =>
                  this.staticCondition(ability.condition!),
                ),
              }
            : {}),
        };
    } else if (ability.condition || ability.characteristicDefining)
      this.unsupported(
        "A condition on a static ability without continuous changes",
      );
    return rules;
  }

  /** Version 1 runs "Must attack" and the two block restrictions as keywords. */
  private grantKeyword(
    grant: StaticGrant,
  ): { objects: Selector; keyword: NonNullable<V1Keyword> } | undefined {
    if (grant.kind === "attack-requirement")
      return { objects: grant.objects, keyword: "Must attack" };
    if (grant.kind !== "block-restriction") return undefined;
    if (!grant.by) return { objects: grant.objects, keyword: "Unblockable" };
    if (same(grant.by, { subtype: "Wall" }))
      return { objects: grant.objects, keyword: "Cannot be blocked by Walls" };
    return this.unsupported("A block restriction other than by Walls");
  }

  private staticCondition(condition: Condition) {
    if (
      "compare" in condition &&
      condition.compare[1] === ">=" &&
      typeof condition.compare[2] === "number"
    )
      return {
        value: this.value(condition.compare[0]),
        atLeast: condition.compare[2],
      };
    return this.unsupported("A static condition other than value ≥ number");
  }

  private change(change: ContinuousChange): V1Change {
    const { layer: _layer, ...rest } = change;
    switch (rest.kind) {
      case "add-types":
        return rest;
      case "set-base-stats":
        return {
          kind: "set-stats",
          power: this.value(rest.power),
          toughness: this.value(rest.toughness),
        };
      case "add-stats":
      case "define-stats":
        return {
          kind: rest.kind,
          power: this.value(rest.power),
          toughness: this.value(rest.toughness),
        };
      case "grant-keyword":
        return { kind: "grant-keyword", keyword: this.keyword(rest.keyword)! };
      case "copy-linked":
        return {
          kind: "linked-characteristics",
          link: rest.link,
          retainSubtypes: rest.retainSubtypes,
        };
      case "gain-control":
        return this.unsupported("Gaining control");
    }
  }

  // ----------------------------------------------------- triggers, bodies

  private trigger(trigger: Trigger): NonNullable<RulesAbility["trigger"]> {
    const player = (p: PlayerRef) => {
      if (p === "you") return "you" as const;
      if (p === "opponents") return "opponent" as const;
      return this.unsupported(`Trigger player ${JSON.stringify(p)}`);
    };
    switch (trigger.event) {
      case "zone-change": {
        const filter = this.at("object", () =>
          this.subject(trigger.object as Predicate),
        );
        if (trigger.to === "battlefield" && !trigger.from)
          return {
            event: "enter",
            filter,
            ...(trigger.during
              ? { step: turnSteps.indexOf(trigger.during) }
              : {}),
          };
        if (
          trigger.from === "battlefield" &&
          trigger.to === "graveyard" &&
          !trigger.during
        )
          return { event: "dies", filter };
        return this.unsupported(
          `A zone change from ${trigger.from} to ${trigger.to}`,
        );
      }
      case "attacks":
        return {
          event: "attack",
          filter: this.at("attacker", () =>
            this.subject(trigger.attacker as Predicate),
          ),
        };
      case "cast":
        if (trigger.caster) this.unsupported("A cast trigger with a caster");
        return {
          event: "cast",
          filter: this.at("spell", () => this.filter(trigger.spell)),
        };
      case "deals-damage":
        if (trigger.to && typeof trigger.to === "object")
          this.unsupported("A damage trigger with a recipient predicate");
        return {
          event: "damage",
          filter: this.at("source", () =>
            this.subject(trigger.source as Predicate),
          ),
          ...(trigger.combat !== undefined ? { combat: trigger.combat } : {}),
          ...(trigger.to
            ? { recipientKind: trigger.to as "player" | "object" }
            : {}),
          ...(trigger.batch ? { grouped: true } : {}),
        };
      case "draws":
        return {
          event: "draw",
          player: player(trigger.player),
          ...(trigger.nth ? { ordinal: trigger.nth } : {}),
        };
      case "step":
        if (trigger.step !== "upkeep")
          this.unsupported(`A ${trigger.step} step trigger`);
        if (trigger.player === "next")
          this.unsupported("A next-player step trigger");
        return {
          event: "upkeep",
          ...(trigger.player
            ? { player: player(trigger.player as PlayerRef) }
            : {}),
        };
      case "becomes-target":
        return {
          event: "target",
          filter: this.at("object", () =>
            this.subject(trigger.object as Predicate),
          ),
          ...(trigger.by ? { player: player(trigger.by) } : {}),
        };
      case "state": {
        const c = trigger.condition;
        if ("matches" in c && c.matches.selector === "source") {
          const p = c.matches.predicate as PredicateFields;
          const count = p.counters?.count as { ">="?: Value } | undefined;
          if (Object.keys(p).length === 1 && typeof count?.[">="] === "number")
            return {
              event: "state",
              filter: sourceFilter,
              counter: p.counters!.kind,
              atLeast: count[">="],
            };
        }
        return this.unsupported(
          "A state trigger other than a source counter threshold",
        );
      }
      default:
        return this.unsupported(`The ${trigger.event} trigger`);
    }
  }

  private intervening(
    condition: Condition,
  ): NonNullable<RulesAbility["intervening"]> {
    const compare = (c: Condition) => {
      if (!("compare" in c) || c.compare[1] !== ">=")
        this.unsupported("An intervening-if other than value ≥ value");
      const [left, , right] = (c as { compare: [Value, string, Value] })
        .compare;
      return { value: this.value(left), atLeast: this.value(right) };
    };
    if ("and" in condition) {
      const [first, second] = condition.and;
      if (condition.and.length !== 2 || !("exists" in second))
        return this.unsupported("This intervening-if");
      const exists = second.exists;
      if (typeof exists !== "object" || !("all" in exists))
        return this.unsupported("This intervening-if");
      return { ...compare(first), requireObjects: this.filter(exists.all) };
    }
    return compare(condition);
  }

  private body(ability: {
    targets?: TargetClause[];
    modes?: unknown;
    effects?: Effect[];
  }) {
    if (ability.modes) this.unsupported("Modes");
    if ((ability.targets?.length ?? 0) > 1)
      this.unsupported("More than one target clause");
    const [target] = ability.targets ?? [];
    if (target?.count !== undefined && target.count !== 1)
      this.unsupported("A target clause with a count");
    this.targets = ability.targets ?? [];
    return {
      ...(target
        ? {
            target: this.at("targets[0].filter", () =>
              this.filter(target.filter),
            ),
          }
        : {}),
      effects: this.at("effects", () => this.effects(ability.effects ?? [])),
    };
  }

  // -------------------------------------------------------------- effects

  private effects(effects: Effect[]): RulesEffect[] {
    const out: RulesEffect[] = [];
    effects.forEach((effect, i) =>
      this.at(`[${i}]`, () => {
        if (
          effect.kind === "attach" &&
          effect.object === "source" &&
          typeof effect.to === "object" &&
          "binding" in effect.to
        ) {
          const previous = effects[i - 1];
          if (
            previous?.kind !== "create-token" ||
            previous.bind !== effect.to.binding
          )
            this.unsupported(
              "Attaching to a binding other than the token just created",
            );
          out.push({ kind: "attach", to: "created" });
          return;
        }
        out.push(...this.effect(effect));
      }),
    );
    return out;
  }

  private effect(e: Effect): RulesEffect[] {
    const bind = (b?: string) => (b ? { bind: b } : {});
    switch (e.kind) {
      case "move": {
        const to = e.to as Exclude<typeof e.to, string>;
        if (
          Object.keys(to).length !== 1 ||
          !["hand", "battlefield", "graveyard", "exile"].includes(to.zone)
        )
          this.unsupported(`Moving to ${JSON.stringify(to)}`);
        return [
          {
            kind: "move",
            ...this.subject_(e.objects),
            destination: to.zone as "hand",
            ...bind(e.bind),
          },
        ];
      }
      case "destroy":
      case "sacrifice":
        return [{ kind: e.kind, ...this.subject_(e.objects), ...bind(e.bind) }];
      case "exile":
        if (e.until) this.unsupported("Exile until an event");
        return [
          {
            kind: "exile",
            ...this.subject_(e.objects),
            ...(e.linkAs ? { link: e.linkAs } : {}),
            ...bind(e.bind),
          },
        ];
      case "may": {
        const [inner] = e.effects;
        if (
          e.player ||
          e.bind ||
          e.effects.length !== 1 ||
          !["move", "destroy", "exile", "sacrifice"].includes(inner.kind)
        )
          return this.unsupported(
            "A may other than an optional move, destroy, exile or sacrifice",
          );
        const [effect] = this.effect(inner) as MovementEffect[];
        return [{ ...effect, optional: true }];
      }
      case "for-each-player": {
        const [inner] = e.effects;
        if (
          e.players !== "each-player" ||
          e.effects.length !== 1 ||
          inner.kind !== "sacrifice" ||
          typeof inner.objects !== "object" ||
          !("all" in inner.objects)
        )
          return this.unsupported(
            "A for-each-player other than each player sacrificing a set",
          );
        const all = inner.objects.all;
        const strip = (p: PredicateFields) => {
          if (!same(p.controller, { binding: "player" }))
            this.unsupported(
              "A for-each-player set not controlled by that player",
            );
          const { controller: _controller, ...rest } = p;
          return rest;
        };
        const owned: Predicate =
          "and" in all
            ? {
                and: [
                  strip(all.and[0] as PredicateFields),
                  ...all.and.slice(1),
                ],
              }
            : strip(all as PredicateFields);
        return [
          {
            kind: "sacrifice",
            subject: "set",
            eachPlayer: true,
            filter: this.filter(owned),
          },
        ];
      }
      case "counter":
        if (same(e.objects, { event: "source" }))
          return [{ kind: "counter-event" }];
        if (this.subject_(e.objects).subject === "target")
          return [{ kind: "counter-target" }];
        return this.unsupported(
          "Countering something other than the target or the event source",
        );
      case "library-sequence":
        return [this.inspect(e)];
      case "draw":
        if (e.player && e.player !== "you" && e.player !== "each-player")
          this.unsupported(`Drawing for ${JSON.stringify(e.player)}`);
        return [
          {
            kind: "draw",
            count: this.value(e.count),
            ...(e.player
              ? {
                  player:
                    e.player === "each-player"
                      ? ("each" as const)
                      : ("you" as const),
                }
              : {}),
            ...bind(e.bind),
          },
        ];
      case "discard": {
        if (e.player) this.unsupported("Discard by another player");
        const filter = e.filter as PredicateFields | undefined;
        if (
          filter &&
          (Object.keys(filter).length !== 1 || !Array.isArray(filter.type))
        )
          this.unsupported("A discard filter other than card types");
        return [
          {
            kind: "discard",
            count: this.value(e.count),
            ...(filter ? { types: filter.type as string[] } : {}),
            ...bind(e.bind),
          },
        ];
      }
      case "gain-life":
        if (e.player || typeof e.amount !== "number" || e.amount < 1)
          this.unsupported("Life gain other than a fixed amount for you");
        return [{ kind: "gain-life", amount: e.amount as number }];
      case "lose-life": {
        const player =
          e.player === "you" || e.player === "opponents"
            ? e.player
            : same(e.player, { event: "player" })
              ? ("event-player" as const)
              : this.unsupported(`Life loss for ${JSON.stringify(e.player)}`);
        return [{ kind: "lose-life", amount: this.value(e.amount), player }];
      }
      case "become-monarch":
        if (e.player === "you") return [{ kind: "become-monarch" }];
        if (same(e.player, { controllerOf: { event: "object" } }))
          return [{ kind: "become-monarch", player: "event-controller" }];
        return this.unsupported("Another player becoming the monarch");
      case "damage":
        if (e.source) this.unsupported("Damage from another source");
        if (same(e.to, { attackedBy: "source" }))
          return [
            {
              kind: "damage",
              amount: this.value(e.amount),
              recipient: "defender",
            },
          ];
        if (this.subject_(e.to as Selector).subject !== "target")
          this.unsupported(
            "Damage to something other than the target or the defender",
          );
        return [{ kind: "damage", amount: this.value(e.amount) }];
      case "tap": {
        if (same(e.objects, { attachedTo: "source" }) && !e.bind)
          return [{ kind: "tap-attached" }];
        const objects = e.objects;
        if (
          typeof objects === "object" &&
          "choose" in objects &&
          same(objects.choose.count, { min: 0 }) &&
          !objects.choose.chooser &&
          e.bind
        )
          return [
            {
              kind: "tap-choice",
              filter: this.filter(objects.choose.from),
              bind: e.bind,
            },
          ];
        return this.unsupported(
          "Tapping other than any number of chosen objects or the enchanted object",
        );
      }
      case "add-counters":
        if (
          typeof e.count !== "number" ||
          (e.counter !== "+1/+1" && e.counter !== "-1/-1")
        )
          this.unsupported(
            "Counters other than a fixed number of +1/+1 or -1/-1",
          );
        return [
          {
            kind: "add-counters",
            filter: this.objectsFilter(e.objects),
            counter: e.counter as "+1/+1",
            count: e.count as number,
          },
        ];
      case "attach":
        if (e.object || this.subject_(e.to).subject !== "target")
          this.unsupported("Attaching other than the source to the target");
        return [{ kind: "attach", to: "target" }];
      case "create-token": {
        const token = v1Tokens[e.token];
        if (!token) this.unsupported(`The ${e.token} token`);
        if (e.controller || e.tapped)
          this.unsupported("A token with a controller or tapped");
        const count = e.count ?? 1;
        if (typeof count !== "number")
          this.unsupported("A variable token count");
        return [{ kind: "create-token", token, count: count as number }];
      }
      case "apply-continuous":
        if (e.duration !== "end-of-turn")
          this.unsupported(`A ${JSON.stringify(e.duration)} duration`);
        return [
          {
            kind: "animate-source",
            ...this.recipient(e.objects),
            changes: e.changes.map((c) => this.change(c)),
          },
        ];
      case "apply-grant": {
        if (e.duration !== "end-of-turn")
          this.unsupported(`A ${JSON.stringify(e.duration)} duration`);
        const keyword = this.grantKeyword(e.grant);
        if (!keyword)
          return this.unsupported(`Applying the ${e.grant.kind} grant`);
        return [
          {
            kind: "animate-source",
            ...this.recipient(keyword.objects),
            changes: [{ kind: "grant-keyword", keyword: keyword.keyword }],
          },
        ];
      }
      case "reselect-defender":
        if (this.subject_(e.attacker).subject !== "target")
          this.unsupported(
            "Reselecting the defender of something other than the target",
          );
        return [{ kind: "redirect-attack" }];
      case "may-pay": {
        if (e.costs.some((c) => c.kind !== "mana"))
          this.unsupported("An optional payment other than mana");
        const binding = this.payments++ ? `paid-${this.payments}` : "paid";
        const player = e.player
          ? same(e.player, { event: "player" })
            ? { player: "event-player" as const }
            : this.unsupported(`A payment by ${JSON.stringify(e.player)}`)
          : {};
        return [
          {
            kind: "pay-mana",
            symbols: e.costs.flatMap(
              (c) => (c as { symbols: string[] }).symbols,
            ),
            bind: binding,
            ...player,
          },
          {
            kind: "if",
            condition: { binding, atLeast: 1 },
            then: this.at("then", () => this.effects(e.then ?? [])),
            otherwise: this.at("else", () => this.effects(e.else ?? [])),
          },
        ];
      }
      case "if": {
        const c = e.condition;
        if (
          !("compare" in c) ||
          c.compare[1] !== ">=" ||
          typeof c.compare[2] !== "number"
        )
          return this.unsupported("A condition other than binding ≥ number");
        const left = c.compare[0];
        const binding =
          typeof left === "object" && "binding" in left
            ? left.binding
            : typeof left === "object" &&
                "count" in left &&
                typeof left.count === "object" &&
                "binding" in left.count
              ? left.count.binding
              : this.unsupported(
                  "A condition on something other than a binding",
                );
        return [
          {
            kind: "if",
            condition: { binding, atLeast: c.compare[2] },
            then: this.at("then", () => this.effects(e.then)),
            otherwise: this.at("else", () => this.effects(e.else ?? [])),
          },
        ];
      }
      case "sequence":
        return [
          {
            kind: "sequence",
            effects: this.at("effects", () => this.effects(e.effects)),
          },
        ];
      case "choose-one":
        if (e.chooser) this.unsupported("A choice by another player");
        return [
          {
            kind: "alternative",
            options: e.options.map((option, i) =>
              this.at(`options[${i}]`, () => {
                const [effect] =
                  option.effects.length === 1
                    ? this.effect(option.effects[0])
                    : [];
                if (effect?.kind !== "discard")
                  this.unsupported("A choice option other than one discard");
                return {
                  id: option.id,
                  label: option.label,
                  ...(option.available ? { requireComplete: true } : {}),
                  effect: effect as Extract<RulesEffect, { kind: "discard" }>,
                };
              }),
            ),
          },
        ];
      default:
        return this.unsupported(`The ${e.kind} effect`);
    }
  }

  private inspect(
    e: Extract<Effect, { kind: "library-sequence" }>,
  ): RulesEffect {
    if (
      e.player !== "you" ||
      e.operation !== "look" ||
      typeof e.count !== "number" ||
      !e.select
    )
      return this.unsupported("This library sequence");
    const { select, rest } = e;
    if (
      !select.filter &&
      select.max === e.count &&
      same(select.to, { zone: "library", position: "bottom" }) &&
      same(rest, { to: { zone: "library", position: "top" }, order: "any" })
    )
      return { kind: "inspect", count: e.count };
    if (
      select.filter &&
      select.max === 1 &&
      same(select.to, { zone: "hand" }) &&
      same(rest.to, { zone: "library", position: "bottom" }) &&
      rest.order !== "any"
    )
      return {
        kind: "inspect",
        count: e.count,
        select: this.filter(select.filter),
        ...(rest.order === "random" ? { randomBottom: true } : {}),
        ...(select.reveal ? { revealSelected: true } : {}),
      };
    return this.unsupported("This library sequence");
  }

  /** Effect objects as a version 1 subject. */
  private subject_(
    selector: Selector,
  ): Pick<MovementEffect, "subject" | "filter"> {
    if (selector === "source") return { subject: "source" };
    if (
      typeof selector === "object" &&
      "target" in selector &&
      this.targets.some((t) => t.id === selector.target)
    )
      return { subject: "target" };
    if (typeof selector === "object" && "all" in selector)
      return { subject: "set", filter: this.filter(selector.all) };
    if (
      typeof selector === "object" &&
      "choose" in selector &&
      selector.choose.count === 1 &&
      !selector.choose.chooser
    )
      return { subject: "choice", filter: this.filter(selector.choose.from) };
    return this.unsupported(`The selector ${JSON.stringify(selector)}`);
  }

  private recipient(selector: Selector): { recipient?: "target" } {
    const subject = this.subject_(selector).subject;
    if (subject === "source") return {};
    if (subject === "target") return { recipient: "target" };
    return this.unsupported(
      "Animating something other than the source or the target",
    );
  }

  // -------------------------------------------------- costs, values, filters

  private costs(costs: Cost[]): RulesCost[] {
    return costs.map((cost, i) => this.at(`[${i}]`, () => this.cost(cost)));
  }

  private cost(cost: Cost): RulesCost {
    switch (cost.kind) {
      case "mana":
      case "tap-source":
      case "sacrifice-source":
      case "discard-source":
        return cost;
      case "life":
        if (same(cost.amount, { commanderColors: "you" }))
          return { kind: "life", amount: "commander-colors" };
        if (typeof cost.amount !== "number")
          this.unsupported("A variable life cost");
        return { kind: "life", amount: cost.amount as number };
      case "counter-source":
        if (cost.operation !== "put")
          this.unsupported("Removing counters as a cost");
        return {
          kind: "counter-source",
          counter: cost.counter,
          count: cost.count,
        };
      case "tap":
      case "sacrifice":
      case "discard":
      case "return":
        return {
          kind: cost.kind,
          count: cost.count,
          filter: this.filter(cost.filter),
        };
      case "tap-total-power": {
        // Version 1 crew taps untapped creatures implicitly.
        const filter = this.filter(cost.filter);
        if (!filter.untapped)
          this.unsupported("Crew from possibly tapped creatures");
        const { untapped: _untapped, ...rest } = filter;
        return { kind: "crew", power: cost.power, filter: rest };
      }
      default:
        return this.unsupported(`The ${cost.kind} cost`);
    }
  }

  value(value: Value): RulesValue {
    if (typeof value === "number") return value;
    if ("variable" in value) {
      this.usesX = true;
      return { binding: "X" };
    }
    if ("binding" in value) return { binding: value.binding };
    if ("count" in value) {
      const selector = value.count;
      if (typeof selector === "object" && "binding" in selector)
        return { binding: selector.binding };
      if (typeof selector === "object" && "all" in selector)
        return { count: this.filter(selector.all) };
      return this.unsupported(`Counting ${JSON.stringify(selector)}`);
    }
    if ("sum" in value) return { sum: value.sum.map((v) => this.value(v)) };
    if (
      "cardsIn" in value &&
      same(value.cardsIn, { zone: "hand", player: "you" })
    )
      return { handSize: "you" };
    if ("greatest" in value && value.greatest.name === "manaValue") {
      const of = value.greatest.of;
      if (typeof of === "object" && "all" in of)
        return { greatestManaValue: this.filter(of.all) };
    }
    return this.unsupported(`The value ${JSON.stringify(value)}`);
  }

  /** A trigger subject: `{ is: source }` is the source on the battlefield. */
  private subject(predicate: Predicate): ObjectFilter {
    return same(predicate, { is: "source" })
      ? sourceFilter
      : this.filter(predicate);
  }

  private objectsFilter(selector: Selector): ObjectFilter {
    if (selector === "source") return sourceFilter;
    if (typeof selector === "object" && "all" in selector)
      return this.filter(selector.all);
    return this.unsupported(`The objects ${JSON.stringify(selector)}`);
  }

  filter(predicate: Predicate): ObjectFilter {
    if ("or" in predicate || "not" in predicate)
      this.unsupported("A top-level or/not predicate");
    const [base, ...rest] = "and" in predicate ? predicate.and : [predicate];
    if ("and" in base || "or" in base || "not" in base)
      this.unsupported("A nested predicate");
    const filter = this.fields(base as PredicateFields, {});
    for (const member of rest) {
      if ("not" in member) {
        const inner = member.not as PredicateFields;
        if (Array.isArray(inner.type) && Object.keys(inner).length === 1)
          filter.excludeTypes = inner.type;
        else if (same(inner, { is: "source" })) filter.self = "exclude";
        else if (same(inner, { object: "token" })) filter.nontoken = true;
        else this.unsupported(`The predicate ${JSON.stringify(member)}`);
      } else if ("and" in member || "or" in member)
        this.unsupported("A nested predicate");
      else {
        const fields = member as PredicateFields;
        if (typeof fields.type === "string" && Object.keys(fields).length === 1)
          (filter.allTypes ??= []).push(fields.type);
        else this.fields(fields, filter);
      }
    }
    if (!filter.zone) this.unsupported("A predicate without a zone");
    return filter as ObjectFilter;
  }

  private fields(
    p: PredicateFields,
    into: Partial<ObjectFilter>,
  ): Partial<ObjectFilter> {
    const set = <K extends keyof ObjectFilter>(
      key: K,
      value: ObjectFilter[K],
    ) => {
      if (into[key] !== undefined)
        this.unsupported(`A predicate repeating ${key}`);
      into[key] = value;
    };
    const player = (ref: PlayerRef) =>
      ref === "you"
        ? ("you" as const)
        : ref === "opponents"
          ? ("opponent" as const)
          : this.unsupported(`The player ${JSON.stringify(ref)}`);
    const list = (v: string | string[]) => (Array.isArray(v) ? v : [v]);
    for (const [key, value] of Object.entries(p)) {
      if (value === undefined) continue;
      switch (key as keyof PredicateFields) {
        case "zone":
          set("zone", p.zone as ObjectFilter["zone"]);
          break;
        case "object":
          if (p.object === "token" || p.object === "player")
            this.unsupported(`object: ${p.object}`);
          set("kind", p.object as "card");
          break;
        case "type":
          set("types", list(p.type!));
          break;
        case "subtype":
          set("subtypes", list(p.subtype!));
          break;
        case "controller":
          set("controller", player(p.controller!));
          break;
        case "owner":
          set("owner", player(p.owner!));
          break;
        case "is":
          if (p.is === "source") set("self", "only");
          else if (same(p.is, { attachedTo: "source" })) set("attached", true);
          else this.unsupported(`is: ${JSON.stringify(p.is)}`);
          break;
        case "color":
          if (p.color === "any") set("colored", true);
          else if (p.color === "colorless") set("colorless", true);
          else this.unsupported("A specific color");
          break;
        case "status":
          for (const status of list(p.status!))
            if (status === "untapped" || status === "attacking")
              set(status, true);
            else this.unsupported(`status: ${status}`);
          break;
        case "manaValue": {
          const comparison = p.manaValue as { "="?: Value };
          if (comparison["="] === undefined)
            this.unsupported("A mana value comparison other than =");
          set("manaValue", this.value(comparison["="]!));
          break;
        }
        case "dealtDamageBy":
          if (p.dealtDamageBy !== "source")
            this.unsupported("Damage dealt by another object");
          set("damagedBySource", true);
          break;
        default:
          this.unsupported(`The predicate field ${key}`);
      }
    }
    return into;
  }
}

/**
 * Down-compiles one card's Core abilities into the runtime's version 1
 * abilities. An ability-cost modifier (a static `cost-modifier` on
 * `abilitiesOf: "source"`) folds into the card's one activated ability.
 */
export function downCompile(abilities: CoreAbility[]): DownCompileResult {
  const errors: CompileError[] = [];
  const out: CardAbility[] = [];
  const abilityModifiers: NonNullable<RulesAbility["costModifiers"]> = [];
  const compiler = new DownCompiler();
  abilities.forEach((ability, i) => {
    const path = `abilities[${i}]`;
    try {
      if (
        ability.kind === "static" &&
        ability.grants.every(
          (g) =>
            g.kind === "cost-modifier" &&
            typeof g.applies === "object" &&
            "abilitiesOf" in g.applies,
        )
      ) {
        for (const grant of ability.grants as Extract<
          StaticGrant,
          { kind: "cost-modifier" }
        >[]) {
          if (
            !same(
              (grant.applies as { abilitiesOf: Selector }).abilitiesOf,
              "source",
            ) ||
            grant.increase !== undefined ||
            grant.condition ||
            ability.condition
          )
            compiler.unsupported(
              "A cost modifier for another object's abilities",
            );
          abilityModifiers.push({
            use: "activate",
            scope: "source",
            component: "generic",
            amount: compiler.value(grant.reduce!),
          });
        }
        return;
      }
      out.push(compiler.at(path, () => compiler.ability(ability)));
    } catch (error) {
      if (!(error instanceof Unsupported)) throw error;
      errors.push({ path: error.path || path, message: error.message });
    }
  });
  if (abilityModifiers.length) {
    const activated = out.filter(
      (a) => a.kind === "activated" && !a.rules?.manaAbility,
    );
    if (activated.length !== 1)
      errors.push({
        path: "abilities",
        message:
          "An ability cost modifier needs exactly one activated ability.",
      });
    else
      activated[0].rules = {
        ...activated[0].rules!,
        costModifiers: abilityModifiers,
      };
  }
  return errors.length ? { ok: false, errors } : { ok: true, abilities: out };
}
