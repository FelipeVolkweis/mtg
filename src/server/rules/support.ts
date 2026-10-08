import type {
  Ability,
  Comparison,
  Condition,
  Cost,
  Effect,
  Modes,
  PlayerRef,
  Predicate,
  PredicateFields,
  Selector,
  StaticGrant,
  TargetClause,
  Value,
} from "../../shared/card-dsl.js";
import type { CompileError, CoreAbility } from "./compiler.js";
import {
  continuousGrants,
  grantSupport,
  keywordSupport,
  replacementSupport,
  runtimeKeyword,
} from "./abilities.js";
import {
  astEqual,
  isAttachedToSource,
  isSourcePredicate,
  unrunForm,
} from "./ast.js";
import { costSupport } from "./costs/handlers.js";
import type { SupportCheck } from "./support-check.js";
import { triggerSupport } from "./triggers/trigger-runtime.js";
import { unsupportedEffect } from "./vm/effects/registry.js";

// Runtime support check (docs/rules-engine.md): which Core constructs the
// engine runs today. The engine executes the compiler's Core AST directly; an
// implemented card using anything else fails to load with an error naming the
// construct and its path. Nothing is approximated.
//
// The check only walks an ability. Each effect, trigger, cost, static grant,
// replacement and keyword declares its supported forms next to the code that
// runs it (their registries); a kind with no runtime handler is rejected.
// Filters and values are checked here: the evaluator runs them all.

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

/** The static grants whose ability condition the engine reads as they apply. */
const conditionalGrantKinds: StaticGrant["kind"][] = [
  "cant-attack",
  "cant-block",
  "max-blockers",
  "block-restriction",
];

class Walker implements SupportCheck {
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
    const unrun = unrunForm(ability);
    if (unrun) this.at(unrun.path, () => this.unsupported(unrun.what));
    switch (ability.kind) {
      case "keyword":
        return keywordSupport(ability.keyword, this);
      case "mana": {
        this.restriction(ability.activateOnlyIf);
        this.production(ability.produce);
        if (ability.instead) {
          const instead = ability.instead;
          this.at("instead.condition", () => this.condition(instead.condition));
          this.at("instead.produce", () => this.production(instead.produce));
          // The same colors to choose from, so the choice made applies to both.
          if (!astEqual(instead.produce.colors, ability.produce.colors))
            this.unsupported("An instead production of other colors");
        }
        if ("costs" in ability.activation) {
          const costs = ability.activation.costs;
          return this.at("activation.costs", () => this.costs(costs));
        }
        const trigger = ability.activation.trigger;
        return this.at("activation.trigger", () =>
          triggerSupport(trigger, this),
        );
      }
      case "replacement":
        return replacementSupport(ability, this);
      case "static":
        return this.static(ability);
      case "spell":
        return this.body(ability);
      case "triggered":
        this.at("trigger", () => triggerSupport(ability.trigger, this));
        if (ability.interveningIf)
          this.at("interveningIf", () =>
            this.condition(ability.interveningIf!),
          );
        return this.body(ability);
      case "activated":
        this.restriction(ability.activateOnlyIf);
        this.at("costs", () => this.costs(ability.costs));
        if (ability.limit && ability.limit.perTurn !== 1)
          this.unsupported("A limit other than once per turn");
        if (ability.activeFrom && ability.activeFrom !== "hand")
          this.unsupported(`Activation from ${ability.activeFrom}`);
        return this.body(ability);
    }
  }

  /** CR 602.5b: an activation restriction is a condition the player's action reads. */
  private restriction(condition?: Condition) {
    if (condition) this.at("activateOnlyIf", () => this.condition(condition));
  }

  private production(produce: Extract<Ability, { kind: "mana" }>["produce"]) {
    if (produce.colors && !Array.isArray(produce.colors))
      if (produce.colors.commanderColors !== "you")
        this.unsupported("Commander colors of another player");
  }

  keyword(keyword: string) {
    if (!runtimeKeyword(keyword)) this.unsupported(`The ${keyword} keyword`);
  }

  /**
   * Each grant by its own declaration; then what `staticContinuous` builds
   * from them: one continuous effect over one set of objects.
   */
  private static(ability: Extract<Ability, { kind: "static" }>) {
    const continuous = continuousGrants(ability.grants);
    let objects: Selector | undefined;
    let changes = 0;
    ability.grants.forEach((grant, i) =>
      this.at(`grants[${i}]`, () => {
        const applied = continuous[i];
        if (applied) {
          if (objects && !astEqual(objects, applied.objects))
            this.unsupported("Grants over different objects in one ability");
          objects = applied.objects;
          changes += applied.changes;
        }
        grantSupport(grant, this);
      }),
    );
    if (changes) {
      this.at("grants.objects", () => this.objects(objects!));
      if (ability.condition)
        this.at("condition", () => this.condition(ability.condition!));
    } else if (ability.characteristicDefining)
      this.unsupported(
        "A condition on a static ability without continuous changes",
      );
    else if (ability.condition) {
      // Restrictions are read when the player acts, with the engine's
      // characteristics (Combat), so a condition can gate them.
      if (!ability.grants.every((g) => conditionalGrantKinds.includes(g.kind)))
        this.unsupported(
          "A condition on a static ability without continuous changes",
        );
      this.at("condition", () => this.condition(ability.condition!));
    }
  }

  /** A condition the evaluator decides: every form but turn history and optional costs. */
  condition(condition: Condition): void {
    if ("and" in condition)
      return condition.and.forEach((c) => this.condition(c));
    if ("or" in condition)
      return condition.or.forEach((c) => this.condition(c));
    if ("not" in condition) return this.condition(condition.not);
    if ("compare" in condition) {
      this.value(condition.compare[0]);
      return this.value(condition.compare[2]);
    }
    if ("exists" in condition)
      return this.selector(condition.exists, "Existence of");
    if ("matches" in condition) {
      this.selector(condition.matches.selector, "Matching");
      return this.filter(condition.matches.predicate, false);
    }
    if (
      "monarch" in condition ||
      "didPerform" in condition ||
      "paid" in condition
    )
      return;
    const [form] = Object.keys(condition);
    return this.unsupported(`The ${form} condition`);
  }

  private body(ability: {
    targets?: TargetClause[];
    modes?: Modes;
    effects?: Effect[];
  }) {
    this.instructions(ability.targets, ability.effects);
    ability.modes?.options.forEach((option, i) =>
      this.at(`modes.options[${i}]`, () =>
        this.instructions(option.targets, option.effects),
      ),
    );
  }

  /** The target clauses and instructions of an ability or one of its modes. */
  private instructions(
    targets: TargetClause[] | undefined,
    effects: Effect[] | undefined,
  ) {
    this.at("effects", () =>
      (effects ?? []).forEach((effect, i) =>
        this.at(`[${i}]`, () => {
          const what = unsupportedEffect(effect);
          if (what) this.unsupported(what);
        }),
      ),
    );
    (targets ?? []).forEach((clause, i) =>
      this.at(`targets[${i}].filter`, () => this.filter(clause.filter)),
    );
  }

  // -------------------------------------------------- costs, values, filters

  costs(costs: Cost[]) {
    costs.forEach((cost, i) =>
      this.at(`[${i}]`, () => costSupport(cost, this)),
    );
  }

  value(value: Value): void {
    if (typeof value === "number") return;
    if ("variable" in value || "binding" in value) return;
    if ("count" in value) return this.selector(value.count, "Counting");
    if ("sum" in value) return value.sum.forEach((v) => this.value(v));
    if ("product" in value) return value.product.forEach((v) => this.value(v));
    // Fixed as the spell is cast; the compiler allows it in a spell only.
    if ("atCast" in value) return this.value(value.atCast);
    if (
      "cardsIn" in value &&
      astEqual(value.cardsIn, { zone: "hand", player: "you" })
    )
      return;
    if ("stat" in value) return this.selector(value.stat.of, "The stat of");
    if ("greatest" in value)
      return this.selector(value.greatest.of, "The greatest of");
    if ("total" in value) return this.selector(value.total.of, "The total of");
    if ("lifeTotal" in value || "commanderColors" in value) {
      const player =
        "lifeTotal" in value ? value.lifeTotal : value.commanderColors;
      if (player !== "you" && player !== "opponents")
        this.unsupported(`The player ${JSON.stringify(player)}`);
      return;
    }
    if ("eventAmount" in value) return;
    if ("if" in value) {
      this.condition(value.if);
      this.value(value.then);
      return this.value(value.else);
    }
    return this.unsupported(`The value ${JSON.stringify(value)}`);
  }

  /** A selector a value reads: a binding, an event or target reference, or a filter. */
  private selector(selector: Selector, what: string) {
    if (typeof selector === "object" && "all" in selector)
      return this.filter(selector.all);
    if (
      selector === "source" ||
      selector === "target" ||
      (typeof selector === "object" &&
        ("binding" in selector || "target" in selector || "event" in selector))
    )
      return;
    return this.unsupported(`${what} ${JSON.stringify(selector)}`);
  }

  /** A comparison: a value, or one operator over a value. */
  private comparison(comparison: Comparison) {
    const keys = typeof comparison === "object" ? Object.keys(comparison) : [];
    const operator =
      keys.length === 1 && ["<", "<=", "=", ">=", ">"].includes(keys[0]);
    this.value(
      operator
        ? (Object.values(comparison)[0] as Value)
        : (comparison as Value),
    );
  }

  objects(selector: Selector) {
    if (selector === "source") return;
    if (typeof selector === "object" && "all" in selector)
      return this.filter(selector.all);
    return this.unsupported(`The objects ${JSON.stringify(selector)}`);
  }

  filter(predicate: Predicate, requireZone = true) {
    if ("or" in predicate || "not" in predicate)
      this.unsupported("A top-level or/not predicate");
    const [base, ...rest] = "and" in predicate ? predicate.and : [predicate];
    if ("and" in base || "or" in base || "not" in base)
      this.unsupported("A nested predicate");
    const seen = new Set<string>();
    this.fields(base, seen);
    for (const member of rest) {
      if ("not" in member) {
        const inner = member.not as PredicateFields;
        if (Array.isArray(inner.type) && Object.keys(inner).length === 1)
          continue;
        if (isSourcePredicate(inner) || astEqual(inner, { object: "token" }))
          continue;
        this.unsupported(`The predicate ${JSON.stringify(member)}`);
      } else if ("and" in member || "or" in member)
        this.unsupported("A nested predicate");
      else {
        const fields = member;
        if (typeof fields.type === "string" && Object.keys(fields).length === 1)
          continue;
        this.fields(fields, seen);
      }
    }
    // A commander is found by its designation in any Zone it can be in.
    if (requireZone && !seen.has("zone") && !seen.has("commander"))
      this.unsupported("A predicate without a zone");
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
          else if (isAttachedToSource(p.is)) set("attached");
          else this.unsupported(`is: ${JSON.stringify(p.is)}`);
          break;
        case "color":
          set("colors");
          break;
        case "status":
          for (const status of list(p.status!))
            if (status === "untapped" || status === "attacking") set(status);
            else this.unsupported(`status: ${status}`);
          break;
        case "manaValue": {
          this.comparison(p.manaValue!);
          set("manaValue");
          break;
        }
        case "power":
        case "toughness":
          this.comparison(p[key as "power" | "toughness"]!);
          set(key);
          break;
        case "counters":
          this.comparison(p.counters!.count);
          set("counters");
          break;
        case "commander":
          set("commander");
          break;
        case "keyword":
          for (const keyword of list(p.keyword!)) this.keyword(keyword);
          set("keyword");
          break;
        case "attacking":
          player(p.attacking!);
          set("attackingPlayer");
          break;
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

/**
 * Checks one card's Core abilities against the runtime. A cost modifier for
 * the card's own abilities needs exactly one activated ability to modify.
 */
export function checkSupport(abilities: CoreAbility[]): SupportResult {
  const errors: CompileError[] = [];
  const check = new Walker();
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
