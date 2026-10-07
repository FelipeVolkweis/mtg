import type { CardAbility } from "../../shared/model.js";
import {
  rulesAbilitySchema,
  type ContinuousChange as V1Change,
  type ObjectFilter,
  type RulesAbility,
  type RulesCost,
  type RulesValue,
} from "../../shared/rules.js";
import {
  turnSteps,
  type Condition,
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
import { grantKeyword, v1Change, v1Keyword } from "./lowering.js";
import { unsupportedEffect } from "./vm/effects/registry.js";

// Down-compiler: Core AST → the runtime ability shapes the engine executes
// today (dsl-redesign.md §9 step 3). Effects stay Core AST: the effect
// handlers run them (roadmap issue 7), and an effect the handlers can't run
// fails here. Targets, triggers, costs and static abilities are still lowered
// to version 1 shapes until the VM reads the Core AST (roadmap issue 8).
// Anything the current runtime can't run fails with an error naming the
// construct; nothing is approximated.

export type DownCompileResult =
  | { ok: true; abilities: CardAbility[] }
  | { ok: false; errors: CompileError[] };

type V1Keyword = RulesAbility["keyword"];

/** Does an instruction read the chosen X? */
const readsX = (effects: Effect[]) =>
  JSON.stringify(effects).includes('{"variable":"X"}');

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
  private usesX = false;

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
    this.usesX = false;
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
        const lowered: RulesAbility["produce"] = {
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
            produce: lowered,
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
          produce: lowered,
          manaAbility: true,
        });
      }
      case "replacement":
        if (
          ability.replace.kind === "enter-tapped" &&
          ability.event.event === "would-enter" &&
          same(ability.event.object, { is: "source" })
        )
          return card("static", { entersTapped: true });
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
    return v1Keyword(keyword, (what) => this.unsupported(what));
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
            changes.push(
              ...grant.changes.map((c) =>
                v1Change(
                  c,
                  (v) => this.value(v),
                  (what) => this.unsupported(what),
                ),
              ),
            );
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
          case "cant-be-countered":
            if (grant.spells !== "this")
              this.unsupported("Can't be countered for other spells");
            rules.cantBeCountered = true;
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

  private grantKeyword(grant: StaticGrant) {
    return grantKeyword(grant, (what) => this.unsupported(what));
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
    const effects = ability.effects ?? [];
    this.at("effects", () =>
      effects.forEach((effect, i) =>
        this.at(`[${i}]`, () => {
          const what = unsupportedEffect(effect);
          if (what) this.unsupported(what);
        }),
      ),
    );
    if (readsX(effects)) this.usesX = true;
    return {
      ...(target
        ? {
            target: this.at("targets[0].filter", () =>
              this.filter(target.filter),
            ),
          }
        : {}),
      effects,
    };
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
