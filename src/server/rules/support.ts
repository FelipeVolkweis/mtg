import type {
  Ability,
  Condition,
  Cost,
  Effect,
  PlayerRef,
  Predicate,
  PredicateFields,
  Selector,
  StaticGrant,
  TargetClause,
  Trigger,
  Value,
} from "../../shared/card-dsl.js";
import type { CompileError, CoreAbility } from "./compiler.js";
import { grantKeyword, runtimeKeyword, same } from "./abilities.js";
import { unsupportedEffect } from "./vm/effects/registry.js";

// Runtime support check (dsl-redesign.md §9): which Core constructs the
// engine runs today. The engine executes the compiler's Core AST directly; an
// implemented card using anything else fails to load with an error naming the
// construct and its path. Nothing is approximated.

export type SupportResult =
  { ok: true } | { ok: false; errors: CompileError[] };

class Unsupported extends Error {
  constructor(
    message: string,
    readonly path: string,
  ) {
    super(message);
  }
}

class SupportCheck {
  private path = "";

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

  ability(ability: Ability) {
    switch (ability.kind) {
      case "keyword": {
        const keyword = ability.keyword;
        if (typeof keyword === "string") return this.keyword(keyword);
        if (keyword.name === "enchant")
          return this.at("keyword.filter", () => this.filter(keyword.filter));
        if (keyword.name === "improvise") return;
        return this.unsupported(`The ${keyword.name} keyword`);
      }
      case "mana": {
        const produce = ability.produce;
        if (produce.colors && !Array.isArray(produce.colors))
          if (produce.colors.commanderColors !== "you")
            this.unsupported("Commander colors of another player");
        if ("costs" in ability.activation) {
          const costs = ability.activation.costs;
          return this.at("activation.costs", () => this.costs(costs));
        }
        const trigger = ability.activation.trigger;
        if (trigger.produced)
          this.unsupported("A produced-mana trigger filter");
        return this.at("activation.trigger.object", () =>
          this.filter(trigger.object),
        );
      }
      case "replacement":
        if (
          ability.replace.kind === "enter-tapped" &&
          ability.event.event === "would-enter" &&
          same(ability.event.object, { is: "source" })
        )
          return;
        return this.unsupported(
          `A ${ability.replace.kind} replacement of ${ability.event.event}`,
        );
      case "static":
        return this.static(ability);
      case "spell":
        return this.body(ability);
      case "triggered":
        this.at("trigger", () => this.trigger(ability.trigger));
        if (ability.interveningIf)
          this.at("interveningIf", () =>
            this.intervening(ability.interveningIf!),
          );
        return this.body(ability);
      case "activated":
        this.at("costs", () => this.costs(ability.costs));
        if (ability.limit && ability.limit.perTurn !== 1)
          this.unsupported("A limit other than once per turn");
        if (ability.activeFrom && ability.activeFrom !== "hand")
          this.unsupported(`Activation from ${ability.activeFrom}`);
        return this.body(ability);
    }
  }

  private keyword(keyword: string) {
    if (!runtimeKeyword(keyword)) this.unsupported(`The ${keyword} keyword`);
  }

  // -------------------------------------------------------------- statics

  private static(ability: Extract<Ability, { kind: "static" }>) {
    let objects: Selector | undefined;
    let changes = 0;
    const sameObjects = (selector: Selector) => {
      if (objects && !same(objects, selector))
        this.unsupported("Grants over different objects in one ability");
      objects = selector;
    };
    ability.grants.forEach((grant, i) =>
      this.at(`grants[${i}]`, () => {
        const keyword = this.grantKeyword(grant);
        if (keyword) {
          sameObjects(keyword.objects);
          changes++;
          return;
        }
        switch (grant.kind) {
          case "continuous":
            sameObjects(grant.objects);
            grant.changes.forEach((change) => {
              switch (change.kind) {
                case "set-base-stats":
                case "add-stats":
                case "define-stats":
                  this.value(change.power);
                  this.value(change.toughness);
                  break;
                case "grant-keyword":
                  this.keyword(change.keyword);
                  break;
                case "gain-control":
                  this.unsupported("Gaining control");
              }
              changes++;
            });
            return;
          case "cost-modifier":
            if (grant.increase !== undefined || grant.condition)
              this.unsupported("A cost increase or conditional cost modifier");
            this.value(grant.reduce!);
            if (typeof grant.applies === "object" && "spells" in grant.applies)
              this.filter(grant.applies.spells);
            else if (
              typeof grant.applies === "object" &&
              !same(grant.applies.abilitiesOf, "source")
            )
              this.unsupported(
                "A cost modifier for another object's abilities",
              );
            return;
          case "attack-tax": {
            const [cost] = grant.costPerAttacker;
            if (
              grant.defender !== "you" ||
              grant.costPerAttacker.length !== 1 ||
              cost.kind !== "mana"
            )
              this.unsupported("An attack tax other than mana to attack you");
            return;
          }
          case "cast-timing":
            this.filter(grant.spells);
            return;
          case "maximum-hand-size":
            if (grant.player !== "you" || grant.value !== "unlimited")
              this.unsupported(
                "A maximum hand size other than your unlimited one",
              );
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
            return;
          case "cant-be-countered":
            if (grant.spells !== "this")
              this.unsupported("Can't be countered for other spells");
            return;
          default:
            this.unsupported(`The ${grant.kind} grant`);
        }
      }),
    );
    if (changes) {
      this.at("grants.objects", () => this.objects(objects!));
      if (ability.condition)
        this.at("condition", () => this.staticCondition(ability.condition!));
    } else if (ability.condition || ability.characteristicDefining)
      this.unsupported(
        "A condition on a static ability without continuous changes",
      );
  }

  private grantKeyword(grant: StaticGrant) {
    if (grant.kind === "block-restriction" && grant.by && !grantKeyword(grant))
      this.unsupported("A block restriction other than by Walls");
    return grantKeyword(grant);
  }

  private staticCondition(condition: Condition) {
    if (
      "compare" in condition &&
      condition.compare[1] === ">=" &&
      typeof condition.compare[2] === "number"
    )
      return this.value(condition.compare[0]);
    return this.unsupported("A static condition other than value ≥ number");
  }

  // ----------------------------------------------------- triggers, bodies

  private trigger(trigger: Trigger) {
    const player = (p: PlayerRef) => {
      if (p !== "you" && p !== "opponents")
        this.unsupported(`Trigger player ${JSON.stringify(p)}`);
    };
    switch (trigger.event) {
      case "zone-change":
        this.at("object", () => this.subject(trigger.object as Predicate));
        if (trigger.to === "battlefield" && !trigger.from) return;
        if (
          trigger.from === "battlefield" &&
          trigger.to === "graveyard" &&
          !trigger.during
        )
          return;
        return this.unsupported(
          `A zone change from ${trigger.from} to ${trigger.to}`,
        );
      case "attacks":
        return this.at("attacker", () =>
          this.subject(trigger.attacker as Predicate),
        );
      case "cast":
        if (trigger.caster) this.unsupported("A cast trigger with a caster");
        return this.at("spell", () => this.filter(trigger.spell));
      case "deals-damage":
        if (trigger.to && typeof trigger.to === "object")
          this.unsupported("A damage trigger with a recipient predicate");
        return this.at("source", () =>
          this.subject(trigger.source as Predicate),
        );
      case "draws":
        return player(trigger.player);
      case "step":
        if (trigger.step !== "upkeep")
          this.unsupported(`A ${trigger.step} step trigger`);
        if (trigger.player === "next")
          this.unsupported("A next-player step trigger");
        if (trigger.player) player(trigger.player as PlayerRef);
        return;
      case "becomes-target":
        this.at("object", () => this.subject(trigger.object as Predicate));
        if (trigger.by) player(trigger.by);
        return;
      case "state": {
        const c = trigger.condition;
        if ("matches" in c && c.matches.selector === "source") {
          const p = c.matches.predicate as PredicateFields;
          const count = p.counters?.count as { ">="?: Value } | undefined;
          if (Object.keys(p).length === 1 && typeof count?.[">="] === "number")
            return;
        }
        return this.unsupported(
          "A state trigger other than a source counter threshold",
        );
      }
      default:
        return this.unsupported(`The ${trigger.event} trigger`);
    }
  }

  private intervening(condition: Condition) {
    const compare = (c: Condition) => {
      if (!("compare" in c) || c.compare[1] !== ">=")
        this.unsupported("An intervening-if other than value ≥ value");
      const [left, , right] = (c as { compare: [Value, string, Value] })
        .compare;
      this.value(left);
      this.value(right);
    };
    if ("and" in condition) {
      const [first, second] = condition.and;
      if (condition.and.length !== 2 || !("exists" in second))
        return this.unsupported("This intervening-if");
      const exists = second.exists;
      if (typeof exists !== "object" || !("all" in exists))
        return this.unsupported("This intervening-if");
      compare(first);
      return this.filter(exists.all);
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
    this.at("effects", () =>
      (ability.effects ?? []).forEach((effect, i) =>
        this.at(`[${i}]`, () => {
          const what = unsupportedEffect(effect);
          if (what) this.unsupported(what);
        }),
      ),
    );
    if (target) this.at("targets[0].filter", () => this.filter(target.filter));
  }

  // -------------------------------------------------- costs, values, filters

  private costs(costs: Cost[]) {
    costs.forEach((cost, i) => this.at(`[${i}]`, () => this.cost(cost)));
  }

  private cost(cost: Cost) {
    switch (cost.kind) {
      case "mana":
      case "tap-source":
      case "sacrifice-source":
      case "discard-source":
        return;
      case "life":
        if (same(cost.amount, { commanderColors: "you" })) return;
        if (typeof cost.amount !== "number")
          this.unsupported("A variable life cost");
        return;
      case "counter-source":
        if (cost.operation !== "put")
          this.unsupported("Removing counters as a cost");
        return;
      case "tap":
      case "sacrifice":
      case "discard":
      case "return":
        return this.filter(cost.filter);
      case "tap-total-power": {
        const fields = conjuncts(cost.filter);
        if (!fields.some((f) => same(f.status, "untapped")))
          this.unsupported("Crew from possibly tapped creatures");
        return this.filter(cost.filter);
      }
      default:
        return this.unsupported(`The ${cost.kind} cost`);
    }
  }

  value(value: Value): void {
    if (typeof value === "number") return;
    if ("variable" in value || "binding" in value) return;
    if ("count" in value) {
      const selector = value.count;
      if (typeof selector === "object" && "binding" in selector) return;
      if (typeof selector === "object" && "all" in selector)
        return this.filter(selector.all);
      return this.unsupported(`Counting ${JSON.stringify(selector)}`);
    }
    if ("sum" in value) return value.sum.forEach((v) => this.value(v));
    if (
      "cardsIn" in value &&
      same(value.cardsIn, { zone: "hand", player: "you" })
    )
      return;
    if ("greatest" in value && value.greatest.name === "manaValue") {
      const of = value.greatest.of;
      if (typeof of === "object" && "all" in of) return this.filter(of.all);
    }
    return this.unsupported(`The value ${JSON.stringify(value)}`);
  }

  /** A trigger subject: `{ is: source }` is the source on the battlefield. */
  private subject(predicate: Predicate) {
    if (!same(predicate, { is: "source" })) this.filter(predicate);
  }

  private objects(selector: Selector) {
    if (selector === "source") return;
    if (typeof selector === "object" && "all" in selector)
      return this.filter(selector.all);
    return this.unsupported(`The objects ${JSON.stringify(selector)}`);
  }

  filter(predicate: Predicate) {
    if ("or" in predicate || "not" in predicate)
      this.unsupported("A top-level or/not predicate");
    const [base, ...rest] = "and" in predicate ? predicate.and : [predicate];
    if ("and" in base || "or" in base || "not" in base)
      this.unsupported("A nested predicate");
    const seen = new Set<string>();
    this.fields(base as PredicateFields, seen);
    for (const member of rest) {
      if ("not" in member) {
        const inner = member.not as PredicateFields;
        if (Array.isArray(inner.type) && Object.keys(inner).length === 1)
          continue;
        if (same(inner, { is: "source" }) || same(inner, { object: "token" }))
          continue;
        this.unsupported(`The predicate ${JSON.stringify(member)}`);
      } else if ("and" in member || "or" in member)
        this.unsupported("A nested predicate");
      else {
        const fields = member as PredicateFields;
        if (typeof fields.type === "string" && Object.keys(fields).length === 1)
          continue;
        this.fields(fields, seen);
      }
    }
    if (!seen.has("zone")) this.unsupported("A predicate without a zone");
  }

  private fields(p: PredicateFields, seen: Set<string>) {
    const set = (key: string) => {
      if (seen.has(key)) this.unsupported(`A predicate repeating ${key}`);
      seen.add(key);
    };
    const player = (ref: PlayerRef) => {
      if (ref !== "you" && ref !== "opponents")
        this.unsupported(`The player ${JSON.stringify(ref)}`);
    };
    const list = (v: string | string[]) => (Array.isArray(v) ? v : [v]);
    for (const [key, value] of Object.entries(p)) {
      if (value === undefined) continue;
      switch (key as keyof PredicateFields) {
        case "zone":
          set("zone");
          break;
        case "object":
          if (p.object === "token" || p.object === "player")
            this.unsupported(`object: ${p.object}`);
          set("kind");
          break;
        case "type":
          set("types");
          break;
        case "subtype":
          set("subtypes");
          break;
        case "controller":
          player(p.controller!);
          set("controller");
          break;
        case "owner":
          player(p.owner!);
          set("owner");
          break;
        case "is":
          if (p.is === "source") set("self");
          else if (same(p.is, { attachedTo: "source" })) set("attached");
          else this.unsupported(`is: ${JSON.stringify(p.is)}`);
          break;
        case "color":
          if (p.color === "any") set("colored");
          else if (p.color === "colorless") set("colorless");
          else this.unsupported("A specific color");
          break;
        case "status":
          for (const status of list(p.status!))
            if (status === "untapped" || status === "attacking") set(status);
            else this.unsupported(`status: ${status}`);
          break;
        case "manaValue": {
          const comparison = p.manaValue as { "="?: Value };
          if (comparison["="] === undefined)
            this.unsupported("A mana value comparison other than =");
          this.value(comparison["="]!);
          set("manaValue");
          break;
        }
        case "dealtDamageBy":
          if (p.dealtDamageBy !== "source")
            this.unsupported("Damage dealt by another object");
          set("damagedBySource");
          break;
        default:
          this.unsupported(`The predicate field ${key}`);
      }
    }
  }
}

/** The field sets of a predicate's top-level conjuncts. */
export function conjuncts(predicate: Predicate): PredicateFields[] {
  if ("and" in predicate) return predicate.and.flatMap(conjuncts);
  if ("or" in predicate || "not" in predicate) return [];
  return [predicate];
}

/**
 * Checks one card's Core abilities against the runtime. A cost modifier for
 * the card's own abilities needs exactly one activated ability to modify.
 */
export function checkSupport(abilities: CoreAbility[]): SupportResult {
  const errors: CompileError[] = [];
  const check = new SupportCheck();
  abilities.forEach((ability, i) => {
    const path = `abilities[${i}]`;
    try {
      check.at(path, () => check.ability(ability));
    } catch (error) {
      if (!(error instanceof Unsupported)) throw error;
      errors.push({ path: error.path || path, message: error.message });
    }
  });
  const modifiesAbilities = abilities.some(
    (a) =>
      a.kind === "static" &&
      a.grants.some(
        (g) =>
          g.kind === "cost-modifier" &&
          typeof g.applies === "object" &&
          "abilitiesOf" in g.applies,
      ),
  );
  if (
    modifiesAbilities &&
    abilities.filter((a) => a.kind === "activated").length !== 1
  )
    errors.push({
      path: "abilities",
      message: "An ability cost modifier needs exactly one activated ability.",
    });
  return errors.length ? { ok: false, errors } : { ok: true };
}
