import type {
  Ability,
  Condition,
  Cost,
  Effect,
  PlayerRef,
  Predicate,
  PredicateFields,
  Selector,
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
import { astEqual, isAttachedToSource, isSourcePredicate } from "./ast.js";
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
    switch (ability.kind) {
      case "keyword":
        return keywordSupport(ability.keyword, this);
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
        this.at("condition", () => this.staticCondition(ability.condition!));
    } else if (ability.condition || ability.characteristicDefining)
      this.unsupported(
        "A condition on a static ability without continuous changes",
      );
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

  costs(costs: Cost[]) {
    costs.forEach((cost, i) =>
      this.at(`[${i}]`, () => costSupport(cost, this)),
    );
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
      astEqual(value.cardsIn, { zone: "hand", player: "you" })
    )
      return;
    if ("greatest" in value && value.greatest.name === "manaValue") {
      const of = value.greatest.of;
      if (typeof of === "object" && "all" in of) return this.filter(of.all);
    }
    return this.unsupported(`The value ${JSON.stringify(value)}`);
  }

  objects(selector: Selector) {
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
          else if (isAttachedToSource(p.is)) set("attached");
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
          this.value(comparison["="]);
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
