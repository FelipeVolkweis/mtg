import {
  abilitySchema,
  ruleKeywords,
  type Ability,
  type Comparison,
  type Condition,
  type ContinuousChange,
  type Cost,
  type Destination,
  type Duration,
  type Effect,
  type EventPattern,
  type Keyword,
  type Layer,
  type Modes,
  type PlayerRef,
  type Predicate,
  type PredicateFields,
  type Replacement,
  type Selector,
  type StaticGrant,
  type TargetClause,
  type Trigger,
  type Value,
} from "../../shared/rules-v2.js";
import type { Registries } from "./registries.js";

// Rules Compiler: authored AST v2 → Core AST (dsl-redesign.md §7).
//
// The Core AST uses the same types as the authored AST, with these
// invariants:
// - selector shorthand is gone: "target" is `{ target: <id> }`;
// - destinations are objects (a missing `player` means the moved object's owner);
// - comparisons are operator objects; `anyTarget` is an explicit predicate;
// - triggers are never `enters`/`dies`, and every trigger, event-pattern or
//   `would-enter` object is a Predicate (a selector becomes `{ is: selector }`);
// - object costs carry their implied zone and controller;
// - `scry` is a `library-sequence`;
// - macro keywords are expanded; Core keyword abilities are rule keywords or
//   casting options (enchant, improvise, kicker, escalate, flashback);
// - every continuous change carries its CR 613 `layer`.

export interface CompileError {
  path: string;
  message: string;
}
export type CoreAbility = Ability;
export type CompileResult =
  | { ok: true; abilities: CoreAbility[] }
  | { ok: false; errors: CompileError[] };

/** The parts of a card the compiler needs. */
export interface CompileSource {
  components: { name: string; manaCost?: string }[];
  abilities: unknown[];
}

type BindingType = "objects" | "number" | "flag" | "player";

interface Scope {
  path: string;
  targets: string[];
  bindings: Map<string, BindingType>;
  event: boolean;
  x: boolean;
}

const selectorKeys = new Set([
  "target",
  "all",
  "choose",
  "binding",
  "event",
  "attachedTo",
  "attachedBy",
  "linked",
  "attackedBy",
]);

const objectResults = new Set([
  "move",
  "destroy",
  "sacrifice",
  "exile",
  "counter",
  "tap",
  "untap",
  "create-token",
  "search",
  "library-sequence",
]);
const numberResults = new Set([
  "draw",
  "discard",
  "gain-life",
  "lose-life",
  "damage",
  "add-counters",
  "remove-counters",
]);

const layers: Record<ContinuousChange["kind"], Layer[]> = {
  "copy-linked": ["4", "7b"],
  "gain-control": ["2"],
  "add-types": ["4"],
  "grant-keyword": ["6"],
  "define-stats": ["7a"],
  "set-base-stats": ["7b"],
  "add-stats": ["7c"],
};

/** Keywords kept in the Core AST: engine-checked or casting/payment options. */
const coreMacroKeywords = new Set([
  "enchant",
  "improvise",
  "kicker",
  "escalate",
  "flashback",
]);

function isSelector(value: unknown): value is Selector {
  if (typeof value === "string")
    return value === "source" || value === "target";
  return (
    !!value &&
    typeof value === "object" &&
    Object.keys(value).length === 1 &&
    selectorKeys.has(Object.keys(value)[0])
  );
}

class Compiler {
  readonly errors: CompileError[] = [];
  private links = new Set<string>();
  private optionalCosts = new Set<string>();

  constructor(
    private readonly source: CompileSource,
    private readonly registries: Registries,
  ) {}

  fail(path: string, message: string) {
    this.errors.push({ path, message });
  }

  compile(): CompileResult {
    const parsed: Ability[] = [];
    this.source.abilities.forEach((raw, index) => {
      const result = abilitySchema.safeParse(raw);
      if (result.success) parsed.push(result.data);
      else
        for (const issue of result.error.issues)
          this.fail(
            [`abilities[${index}]`, ...issue.path.map(String)].join("."),
            issue.message,
          );
    });
    if (this.errors.length) return { ok: false, errors: this.errors };
    this.collectCardFacts(parsed);
    const ids = new Set<string>();
    const abilities: CoreAbility[] = [];
    parsed.forEach((ability, index) => {
      const path = `abilities[${index}]`;
      if (ids.has(ability.id))
        this.fail(path, `Duplicate ability id "${ability.id}".`);
      ids.add(ability.id);
      for (const expanded of this.expand(ability, path))
        abilities.push(this.ability(expanded, path));
    });
    return this.errors.length
      ? { ok: false, errors: this.errors }
      : { ok: true, abilities };
  }

  // ------------------------------------------------------- card facts

  private collectCardFacts(abilities: Ability[]) {
    const visit = (node: unknown) => {
      if (Array.isArray(node)) node.forEach(visit);
      else if (node && typeof node === "object") {
        const record = node as Record<string, unknown>;
        if (record.kind === "exile" && typeof record.linkAs === "string")
          this.links.add(record.linkAs);
        Object.values(record).forEach(visit);
      }
    };
    visit(abilities);
    for (const ability of abilities)
      if (
        ability.kind === "keyword" &&
        typeof ability.keyword === "object" &&
        (ability.keyword.name === "kicker" ||
          ability.keyword.name === "escalate")
      )
        this.optionalCosts.add(ability.keyword.name);
  }

  // --------------------------------------------------- keyword expansion

  private expand(ability: Ability, path: string): Ability[] {
    if (ability.kind !== "keyword" || typeof ability.keyword === "string")
      return [ability];
    const base = {
      id: ability.id,
      origin: ability.origin,
      description: ability.description,
    };
    const keyword = ability.keyword;
    switch (keyword.name) {
      case "affinity":
        return [
          {
            ...base,
            kind: "static",
            activeFrom: "stack",
            grants: [
              {
                kind: "cost-modifier",
                applies: "this",
                reduce: {
                  count: {
                    all: {
                      and: [
                        { zone: "battlefield", controller: "you" },
                        keyword.for,
                      ],
                    },
                  },
                },
              },
            ],
          },
        ];
      case "ward":
        return [
          {
            ...base,
            kind: "triggered",
            trigger: {
              event: "becomes-target",
              object: "source",
              by: "opponents",
            },
            effects: [
              {
                kind: "may-pay",
                player: { event: "player" },
                costs: keyword.costs,
                else: [{ kind: "counter", objects: { event: "source" } }],
              },
            ],
          },
        ];
      case "cycling":
        return [
          {
            ...base,
            kind: "activated",
            activeFrom: "hand",
            costs: [...keyword.costs, { kind: "discard-source" }],
            effects: [{ kind: "draw", count: 1 }],
          },
        ];
      case "equip":
        return [
          {
            ...base,
            kind: "activated",
            timing: "sorcery",
            costs: keyword.costs,
            targets: [
              {
                id: "target-0",
                filter: {
                  zone: "battlefield",
                  type: "Creature",
                  controller: "you",
                },
              },
            ],
            effects: [{ kind: "attach", to: { target: "target-0" } }],
          },
        ];
      case "crew":
        return [
          {
            ...base,
            kind: "activated",
            costs: [
              {
                kind: "tap-total-power",
                power: keyword.power,
                filter: { type: "Creature", status: "untapped" },
              },
            ],
            effects: [
              {
                kind: "apply-continuous",
                objects: "source",
                changes: [
                  { kind: "add-types", types: ["Artifact", "Creature"] },
                ],
                duration: "end-of-turn",
              },
            ],
          },
        ];
      case "living-weapon":
        return [
          {
            ...base,
            kind: "triggered",
            trigger: { event: "enters", object: "source" },
            effects: [
              {
                kind: "create-token",
                token: "phyrexian-germ-0-0",
                bind: "germ",
              },
              { kind: "attach", object: "source", to: { binding: "germ" } },
            ],
          },
        ];
      default:
        if (!coreMacroKeywords.has(keyword.name))
          this.fail(path, `Unsupported keyword ${keyword.name}.`);
        return [ability];
    }
  }

  // ------------------------------------------------------------ abilities

  private ability(ability: Ability, path: string): CoreAbility {
    const scope = (event: boolean, x: boolean): Scope => ({
      path,
      targets: [],
      bindings: new Map(),
      event,
      x,
    });
    const manaX = (costs: Cost[]) =>
      costs.some((c) => c.kind === "mana" && c.symbols.includes("{X}"));
    switch (ability.kind) {
      case "spell": {
        const s = scope(
          false,
          this.source.components.some((c) => c.manaCost?.includes("{X}")),
        );
        return { ...ability, ...this.body(ability, s) };
      }
      case "activated": {
        const s = scope(false, manaX(ability.costs));
        const costs = ability.costs.map((cost, i) =>
          this.cost(cost, { ...s, path: `${path}.costs[${i}]` }),
        );
        return { ...ability, costs, ...this.body(ability, s) };
      }
      case "triggered": {
        const s = scope(true, false);
        return {
          ...ability,
          trigger: this.trigger(ability.trigger, {
            ...s,
            path: `${path}.trigger`,
          }),
          ...(ability.interveningIf
            ? {
                interveningIf: this.condition(ability.interveningIf, {
                  ...s,
                  path: `${path}.interveningIf`,
                }),
              }
            : {}),
          ...this.body(ability, s),
        };
      }
      case "mana": {
        const s = scope("trigger" in ability.activation, false);
        const activation =
          "costs" in ability.activation
            ? {
                costs: ability.activation.costs.map((cost, i) =>
                  this.cost(cost, {
                    ...s,
                    path: `${path}.activation.costs[${i}]`,
                  }),
                ),
              }
            : {
                trigger: {
                  ...ability.activation.trigger,
                  object: this.predicate(ability.activation.trigger.object, {
                    ...s,
                    path: `${path}.activation.trigger.object`,
                  }),
                },
              };
        const produce = ability.produce;
        return {
          ...ability,
          activation,
          produce: Array.isArray(produce.colors)
            ? produce
            : {
                ...produce,
                colors: {
                  commanderColors: this.player(produce.colors.commanderColors, {
                    ...s,
                    path: `${path}.produce.colors`,
                  }),
                },
              },
        };
      }
      case "static": {
        const s = scope(false, false);
        if (ability.characteristicDefining)
          for (const grant of ability.grants)
            if (
              grant.kind !== "continuous" ||
              grant.objects !== "source" ||
              grant.changes.some((c) => c.kind !== "define-stats")
            )
              this.fail(
                `${path}.grants`,
                "Characteristic-defining abilities only define their own source's stats (CR 604.3).",
              );
        return {
          ...ability,
          ...(ability.condition
            ? {
                condition: this.condition(ability.condition, {
                  ...s,
                  path: `${path}.condition`,
                }),
              }
            : {}),
          grants: ability.grants.map((grant, i) =>
            this.grant(
              grant,
              { ...s, path: `${path}.grants[${i}]` },
              !!ability.characteristicDefining,
            ),
          ),
        };
      }
      case "replacement": {
        const s = scope(true, false);
        return {
          ...ability,
          event: this.eventPattern(ability.event, {
            ...s,
            path: `${path}.event`,
          }),
          replace: this.replacement(ability.replace, {
            ...s,
            path: `${path}.replace`,
          }),
        };
      }
      case "keyword":
        return {
          ...ability,
          keyword: this.coreKeyword(ability.keyword, scope(false, false)),
        };
    }
  }

  private coreKeyword(keyword: Keyword, s: Scope): Keyword {
    if (typeof keyword === "string") return keyword;
    if (keyword.name === "enchant")
      return { ...keyword, filter: this.predicate(keyword.filter, s) };
    if ("costs" in keyword)
      return {
        ...keyword,
        costs: keyword.costs.map((cost) => this.cost(cost, s)),
      };
    return keyword;
  }

  /** Targets, modes and effects shared by spells, activated and triggered abilities. */
  private body(
    ability: { targets?: TargetClause[]; modes?: Modes; effects?: Effect[] },
    s: Scope,
  ) {
    if (ability.modes && ability.effects)
      this.fail(s.path, "Use either modes or effects, not both.");
    if (!ability.modes && !ability.effects)
      this.fail(s.path, "The ability needs effects or modes.");
    const targets = this.targets(ability.targets ?? [], s, `${s.path}.targets`);
    const scoped = { ...s, targets: targets.map((t) => t.id) };
    const out: {
      targets?: TargetClause[];
      modes?: Modes;
      effects?: Effect[];
    } = {};
    if (ability.targets) out.targets = targets;
    if (ability.effects)
      out.effects = this.effects(ability.effects, {
        ...scoped,
        path: `${s.path}.effects`,
      });
    if (ability.modes) {
      const ids = new Set<string>();
      out.modes = {
        ...ability.modes,
        options: ability.modes.options.map((option, i) => {
          const path = `${s.path}.modes.options[${i}]`;
          if (ids.has(option.id))
            this.fail(path, `Duplicate mode id "${option.id}".`);
          ids.add(option.id);
          const own = this.targets(
            option.targets ?? [],
            scoped,
            `${path}.targets`,
          );
          for (const t of own)
            if (scoped.targets.includes(t.id))
              this.fail(path, `Target id "${t.id}" is already declared.`);
          const optionScope = {
            ...scoped,
            targets: [...scoped.targets, ...own.map((t) => t.id)],
            bindings: new Map(scoped.bindings),
          };
          return {
            ...option,
            ...(option.targets ? { targets: own } : {}),
            effects: this.effects(option.effects, {
              ...optionScope,
              path: `${path}.effects`,
            }),
          };
        }),
      };
      const count = ability.modes.choose;
      const max = typeof count === "number" ? count : count.max;
      if (max > ability.modes.options.length)
        this.fail(
          `${s.path}.modes.choose`,
          "Cannot choose more modes than there are options.",
        );
    }
    return out;
  }

  private targets(clauses: TargetClause[], s: Scope, path: string) {
    const seen = new Set<string>();
    return clauses.map((clause, i) => {
      if (seen.has(clause.id))
        this.fail(`${path}[${i}]`, `Duplicate target id "${clause.id}".`);
      seen.add(clause.id);
      return {
        ...clause,
        filter: this.predicate(clause.filter, {
          ...s,
          path: `${path}[${i}].filter`,
        }),
      };
    });
  }

  // ------------------------------------------------------------- effects

  private effects(effects: Effect[], s: Scope): Effect[] {
    return effects.map((effect, i) =>
      this.effect(effect, { ...s, path: `${s.path}[${i}]` }),
    );
  }

  /** A nested block: sees the outer bindings, keeps its own to itself. */
  private block(effects: Effect[] | undefined, s: Scope, path: string) {
    return effects
      ? this.effects(effects, {
          ...s,
          path,
          bindings: new Map(s.bindings),
        })
      : undefined;
  }

  private effect(effect: Effect, s: Scope): Effect {
    const out = this.effectBody(effect, s);
    if (effect.bind) {
      if (s.bindings.has(effect.bind))
        this.fail(s.path, `Binding "${effect.bind}" is already defined.`);
      const type: BindingType | undefined = objectResults.has(effect.kind)
        ? "objects"
        : numberResults.has(effect.kind)
          ? "number"
          : effect.kind === "may"
            ? "flag"
            : undefined;
      if (!type)
        this.fail(
          s.path,
          `A ${effect.kind} instruction produces no result to bind.`,
        );
      else s.bindings.set(effect.bind, type);
    }
    return out;
  }

  private effectBody(effect: Effect, s: Scope): Effect {
    const at = (field: string) => ({ ...s, path: `${s.path}.${field}` });
    switch (effect.kind) {
      case "move":
        return {
          ...effect,
          objects: this.selector(effect.objects, at("objects")),
          to: this.destination(effect.to, at("to")),
        };
      case "destroy":
      case "sacrifice":
      case "counter":
      case "tap":
      case "untap":
        return {
          ...effect,
          objects: this.selector(effect.objects, at("objects")),
        };
      case "exile":
        return {
          ...effect,
          objects: this.selector(effect.objects, at("objects")),
          ...(effect.until
            ? { until: this.eventPattern(effect.until, at("until")) }
            : {}),
        };
      case "library-sequence":
        return {
          ...effect,
          player: this.player(effect.player, at("player")),
          count: this.value(effect.count, at("count")),
          ...(effect.select
            ? {
                select: {
                  ...effect.select,
                  ...(effect.select.filter
                    ? {
                        filter: this.predicate(
                          effect.select.filter,
                          at("select.filter"),
                        ),
                      }
                    : {}),
                  to: this.destination(effect.select.to, at("select.to")),
                },
              }
            : {}),
          rest: {
            ...effect.rest,
            to: this.destination(effect.rest.to, at("rest.to")),
          },
        };
      case "scry": {
        const count = this.value(effect.count, at("count"));
        return {
          kind: "library-sequence",
          ...(effect.bind ? { bind: effect.bind } : {}),
          player: this.player(effect.player ?? "you", at("player")),
          count,
          operation: "look",
          select: {
            max: typeof count === "number" ? count : 100,
            to: { zone: "library", position: "bottom" },
          },
          rest: { to: { zone: "library", position: "top" }, order: "any" },
        };
      }
      case "search":
        return {
          ...effect,
          player: this.player(effect.player, at("player")),
          filter: this.predicate(effect.filter, at("filter")),
          to: this.destination(effect.to, at("to")),
        };
      case "shuffle":
      case "become-monarch":
        return { ...effect, player: this.player(effect.player, at("player")) };
      case "draw":
        return {
          ...effect,
          ...(effect.player
            ? { player: this.player(effect.player, at("player")) }
            : {}),
          count: this.value(effect.count, at("count")),
        };
      case "discard":
        return {
          ...effect,
          ...(effect.player
            ? { player: this.player(effect.player, at("player")) }
            : {}),
          count: this.value(effect.count, at("count")),
          ...(effect.filter
            ? { filter: this.predicate(effect.filter, at("filter")) }
            : {}),
        };
      case "gain-life":
        return {
          ...effect,
          ...(effect.player
            ? { player: this.player(effect.player, at("player")) }
            : {}),
          amount: this.value(effect.amount, at("amount")),
        };
      case "lose-life":
        return {
          ...effect,
          player: this.player(effect.player, at("player")),
          amount: this.value(effect.amount, at("amount")),
        };
      case "damage":
        return {
          ...effect,
          amount: this.value(effect.amount, at("amount")),
          to: this.recipient(effect.to, at("to")),
          ...(effect.source
            ? { source: this.selector(effect.source, at("source")) }
            : {}),
        };
      case "add-counters":
      case "remove-counters":
        this.counter(effect.counter, at("counter"));
        return {
          ...effect,
          objects: this.selector(effect.objects, at("objects")),
          count: this.value(effect.count, at("count")),
        };
      case "attach":
        return {
          ...effect,
          ...(effect.object
            ? { object: this.selector(effect.object, at("object")) }
            : {}),
          to: this.selector(effect.to, at("to")),
        };
      case "create-token":
        if (!this.registries.tokens[effect.token])
          this.fail(`${s.path}.token`, `Unknown token "${effect.token}".`);
        return {
          ...effect,
          ...(effect.count !== undefined
            ? { count: this.value(effect.count, at("count")) }
            : {}),
          ...(effect.controller
            ? { controller: this.player(effect.controller, at("controller")) }
            : {}),
        };
      case "apply-continuous":
        return {
          ...effect,
          objects: this.selector(effect.objects, at("objects")),
          changes: effect.changes.map((change, i) =>
            this.change(change, at(`changes[${i}]`), false),
          ),
          duration: this.duration(effect.duration, at("duration")),
        };
      case "apply-grant":
        return {
          ...effect,
          grant: this.grant(effect.grant, at("grant"), false),
          duration: this.duration(effect.duration, at("duration")),
        };
      case "reselect-defender":
        return {
          ...effect,
          attacker: this.selector(effect.attacker, at("attacker")),
        };
      case "create-delayed-trigger": {
        const delayed = { ...s, event: true, bindings: new Map(s.bindings) };
        return {
          ...effect,
          trigger: this.trigger(effect.trigger, {
            ...delayed,
            path: `${s.path}.trigger`,
          }),
          effects: this.effects(effect.effects, {
            ...delayed,
            path: `${s.path}.effects`,
          }),
        };
      }
      case "sequence":
        return {
          ...effect,
          effects: this.effects(effect.effects, at("effects")),
        };
      case "if":
        return {
          ...effect,
          condition: this.condition(effect.condition, at("condition")),
          then: this.block(effect.then, s, `${s.path}.then`)!,
          ...(effect.else
            ? { else: this.block(effect.else, s, `${s.path}.else`) }
            : {}),
        };
      case "may":
        return {
          ...effect,
          ...(effect.player
            ? { player: this.player(effect.player, at("player")) }
            : {}),
          effects: this.block(effect.effects, s, `${s.path}.effects`)!,
        };
      case "may-pay":
        return {
          ...effect,
          ...(effect.player
            ? { player: this.player(effect.player, at("player")) }
            : {}),
          costs: effect.costs.map((cost, i) =>
            this.cost(cost, at(`costs[${i}]`)),
          ),
          ...(effect.then
            ? { then: this.block(effect.then, s, `${s.path}.then`) }
            : {}),
          ...(effect.else
            ? { else: this.block(effect.else, s, `${s.path}.else`) }
            : {}),
        };
      case "choose-one": {
        const ids = new Set<string>();
        return {
          ...effect,
          ...(effect.chooser
            ? { chooser: this.player(effect.chooser, at("chooser")) }
            : {}),
          options: effect.options.map((option, i) => {
            const path = `${s.path}.options[${i}]`;
            if (ids.has(option.id))
              this.fail(path, `Duplicate option id "${option.id}".`);
            ids.add(option.id);
            return {
              ...option,
              ...(option.available
                ? {
                    available: this.condition(option.available, {
                      ...s,
                      path: `${path}.available`,
                    }),
                  }
                : {}),
              effects: this.block(option.effects, s, `${path}.effects`)!,
            };
          }),
        };
      }
      case "for-each-player": {
        const inner = new Map(s.bindings);
        inner.set("player", "player");
        return {
          ...effect,
          players: this.player(effect.players, at("players")),
          effects: this.effects(effect.effects, {
            ...s,
            path: `${s.path}.effects`,
            bindings: inner,
          }),
        };
      }
    }
  }

  private recipient(to: Selector | PlayerRef, s: Scope): Selector | PlayerRef {
    if (typeof to === "object" && "binding" in to)
      return s.bindings.get(to.binding) === "player"
        ? this.player(to, s)
        : this.selector(to, s);
    if (typeof to === "object" && "target" in to) {
      this.targetRef(to.target, s);
      return to;
    }
    return isSelector(to)
      ? this.selector(to, s)
      : this.player(to as PlayerRef, s);
  }

  private replacement(replacement: Replacement, s: Scope): Replacement {
    if (replacement.kind === "modify-amount")
      return { ...replacement, add: this.value(replacement.add, s) };
    if (replacement.kind === "instead")
      return { ...replacement, effects: this.effects(replacement.effects, s) };
    return replacement;
  }

  // -------------------------------------------------- costs and grants

  private cost(cost: Cost, s: Scope): Cost {
    switch (cost.kind) {
      case "mana":
        if (cost.symbols.includes("{X}") && !s.x)
          this.fail(s.path, "{X} in a cost needs a chosen X.");
        return cost;
      case "life":
        return { ...cost, amount: this.value(cost.amount, s) };
      case "counter-source":
        this.counter(cost.counter, s);
        return cost;
      case "tap":
      case "sacrifice":
      case "return":
        return {
          ...cost,
          filter: this.withDefaults(this.predicate(cost.filter, s), {
            zone: "battlefield",
            controller: "you",
          }),
        };
      case "tap-total-power":
        return {
          ...cost,
          filter: this.withDefaults(this.predicate(cost.filter, s), {
            zone: "battlefield",
            controller: "you",
          }),
        };
      case "discard":
        return {
          ...cost,
          filter: this.withDefaults(this.predicate(cost.filter, s), {
            zone: "hand",
            owner: "you",
          }),
        };
      case "exile":
        if (!this.mentions(cost.filter, "zone"))
          this.fail(
            s.path,
            "An exile cost must say which Zone it exiles from.",
          );
        return {
          ...cost,
          filter: this.withDefaults(this.predicate(cost.filter, s), {
            owner: "you",
          }),
        };
      default:
        return cost;
    }
  }

  /** Adds implied fields the predicate does not already constrain. */
  private withDefaults(
    predicate: Predicate,
    defaults: PredicateFields,
  ): Predicate {
    const missing = Object.fromEntries(
      Object.entries(defaults).filter(
        ([key]) => !this.mentions(predicate, key as keyof PredicateFields),
      ),
    ) as PredicateFields;
    if (!Object.keys(missing).length) return predicate;
    if (!("and" in predicate) && !("or" in predicate) && !("not" in predicate))
      return { ...missing, ...predicate };
    return { and: [missing, predicate] };
  }

  private mentions(predicate: Predicate, key: keyof PredicateFields): boolean {
    if ("and" in predicate)
      return predicate.and.some((p) => this.mentions(p, key));
    if ("or" in predicate)
      return predicate.or.every((p) => this.mentions(p, key));
    if ("not" in predicate) return false;
    return (predicate as PredicateFields)[key] !== undefined;
  }

  private grant(
    grant: StaticGrant,
    s: Scope,
    characteristicDefining: boolean,
  ): StaticGrant {
    const at = (field: string) => ({ ...s, path: `${s.path}.${field}` });
    switch (grant.kind) {
      case "continuous":
        return {
          ...grant,
          objects: this.selector(grant.objects, at("objects")),
          changes: grant.changes.map((change, i) =>
            this.change(change, at(`changes[${i}]`), characteristicDefining),
          ),
        };
      case "cost-modifier":
        if (grant.reduce === undefined && grant.increase === undefined)
          this.fail(s.path, "A cost modifier needs reduce or increase.");
        return {
          ...grant,
          applies:
            grant.applies === "this"
              ? "this"
              : "spells" in grant.applies
                ? {
                    spells: this.predicate(
                      grant.applies.spells,
                      at("applies.spells"),
                    ),
                  }
                : {
                    abilitiesOf: this.selector(
                      grant.applies.abilitiesOf,
                      at("applies.abilitiesOf"),
                    ),
                  },
          ...(grant.reduce !== undefined
            ? { reduce: this.value(grant.reduce, at("reduce")) }
            : {}),
          ...(grant.increase !== undefined
            ? { increase: this.value(grant.increase, at("increase")) }
            : {}),
          ...(grant.condition
            ? { condition: this.condition(grant.condition, at("condition")) }
            : {}),
        };
      case "cast-timing":
        return { ...grant, spells: this.predicate(grant.spells, at("spells")) };
      case "play-permission":
        return {
          ...grant,
          objects: this.selector(grant.objects, at("objects")),
          duration: this.duration(grant.duration, at("duration")),
        };
      case "maximum-hand-size":
        return {
          ...grant,
          player: this.player(grant.player, at("player")),
          value:
            grant.value === "unlimited"
              ? "unlimited"
              : this.value(grant.value, at("value")),
        };
      case "attack-tax":
        return {
          ...grant,
          defender: this.player(grant.defender, at("defender")),
          costPerAttacker: grant.costPerAttacker.map((c, i) =>
            this.cost(c, at(`costPerAttacker[${i}]`)),
          ),
        };
      case "block-tax":
        return {
          ...grant,
          costPerBlocker: grant.costPerBlocker.map((c, i) =>
            this.cost(c, at(`costPerBlocker[${i}]`)),
          ),
        };
      case "attack-requirement":
      case "cant-block":
        return {
          ...grant,
          objects: this.selector(grant.objects, at("objects")),
        };
      case "block-restriction":
        return {
          ...grant,
          objects: this.selector(grant.objects, at("objects")),
          ...(grant.by ? { by: this.predicate(grant.by, at("by")) } : {}),
        };
      case "cant-be-countered":
        return {
          ...grant,
          spells:
            grant.spells === "this"
              ? "this"
              : this.predicate(grant.spells, at("spells")),
        };
      case "untap-restriction":
        return {
          ...grant,
          objects: this.selector(grant.objects, at("objects")),
          ...(grant.unless
            ? { unless: this.condition(grant.unless, at("unless")) }
            : {}),
        };
    }
  }

  private change(
    change: ContinuousChange,
    s: Scope,
    characteristicDefining: boolean,
  ): ContinuousChange {
    if (change.kind === "define-stats" && !characteristicDefining)
      this.fail(
        s.path,
        "define-stats is only allowed in a characteristic-defining ability.",
      );
    const layer = layers[change.kind];
    switch (change.kind) {
      case "set-base-stats":
      case "add-stats":
      case "define-stats":
        return {
          ...change,
          layer,
          power: this.value(change.power, { ...s, path: `${s.path}.power` }),
          toughness: this.value(change.toughness, {
            ...s,
            path: `${s.path}.toughness`,
          }),
        };
      case "gain-control":
        return { ...change, layer, player: this.player(change.player, s) };
      case "copy-linked":
        this.link(change.link, s);
        return { ...change, layer };
      default:
        return { ...change, layer };
    }
  }

  private duration(duration: Duration, s: Scope): Duration {
    return typeof duration === "string"
      ? duration
      : { until: this.eventPattern(duration.until, s) };
  }

  // ----------------------------------------------------- triggers/events

  private trigger(trigger: Trigger, s: Scope): Trigger {
    const object = (value: Selector | Predicate, field: string) =>
      this.subject(value, { ...s, path: `${s.path}.${field}` });
    switch (trigger.event) {
      case "enters":
        return {
          event: "zone-change",
          object: object(trigger.object, "object"),
          to: "battlefield",
          ...(trigger.during ? { during: trigger.during } : {}),
        };
      case "dies":
        return {
          event: "zone-change",
          object: {
            and: [object(trigger.object, "object"), { type: "Creature" }],
          },
          from: "battlefield",
          to: "graveyard",
        };
      case "zone-change":
        return { ...trigger, object: object(trigger.object, "object") };
      case "cast":
        return {
          ...trigger,
          spell: this.predicate(trigger.spell, {
            ...s,
            path: `${s.path}.spell`,
          }),
          ...(trigger.caster ? { caster: this.player(trigger.caster, s) } : {}),
        };
      case "attacks":
        return { ...trigger, attacker: object(trigger.attacker, "attacker") };
      case "deals-damage":
        return {
          ...trigger,
          source: object(trigger.source, "source"),
          ...(trigger.to && typeof trigger.to === "object"
            ? { to: this.predicate(trigger.to, { ...s, path: `${s.path}.to` }) }
            : {}),
        };
      case "becomes-target":
        return {
          ...trigger,
          object: object(trigger.object, "object"),
          ...(trigger.by ? { by: this.player(trigger.by, s) } : {}),
        };
      case "draws":
      case "gains-life":
      case "loses-life":
        return { ...trigger, player: this.player(trigger.player, s) };
      case "step":
        return {
          ...trigger,
          ...(trigger.player && trigger.player !== "next"
            ? { player: this.player(trigger.player, s) }
            : {}),
        };
      case "state":
        return {
          ...trigger,
          condition: this.condition(trigger.condition, { ...s, event: false }),
        };
    }
  }

  private eventPattern(pattern: EventPattern, s: Scope): EventPattern {
    switch (pattern.event) {
      case "would-enter":
        return { ...pattern, object: this.subject(pattern.object, s) };
      case "would-be-dealt-damage":
        return { ...pattern, recipient: this.subject(pattern.recipient, s) };
      case "leaves-battlefield":
        return { ...pattern, object: this.selector(pattern.object, s) };
      default:
        return { ...pattern, player: this.player(pattern.player, s) };
    }
  }

  /** Normalizes "Selector | Predicate" positions to a Predicate. */
  private subject(value: Selector | Predicate, s: Scope): Predicate {
    return isSelector(value)
      ? { is: this.selector(value, s) }
      : this.predicate(value, s);
  }

  // ---------------------------------- selectors, players, predicates

  private targetRef(id: string, s: Scope) {
    if (!s.targets.includes(id)) this.fail(s.path, `Unknown target "${id}".`);
  }

  private selector(selector: Selector, s: Scope): Selector {
    if (selector === "source") return selector;
    if (selector === "target") {
      if (s.targets.length !== 1) {
        this.fail(
          s.path,
          '"target" needs exactly one target clause; name it instead.',
        );
        return selector;
      }
      return { target: s.targets[0] };
    }
    if ("target" in selector) {
      this.targetRef(selector.target, s);
      return selector;
    }
    if ("all" in selector) return { all: this.predicate(selector.all, s) };
    if ("choose" in selector)
      return {
        choose: {
          ...selector.choose,
          ...(selector.choose.chooser
            ? { chooser: this.player(selector.choose.chooser, s) }
            : {}),
          from: this.predicate(selector.choose.from, s),
        },
      };
    if ("binding" in selector) {
      this.binding(selector.binding, "objects", s);
      return selector;
    }
    if ("event" in selector) {
      if (!s.event)
        this.fail(
          s.path,
          "Event selectors need a triggered or replacement ability.",
        );
      return selector;
    }
    if ("attachedTo" in selector)
      return { attachedTo: this.selector(selector.attachedTo, s) };
    if ("attachedBy" in selector)
      return { attachedBy: this.selector(selector.attachedBy, s) };
    if ("attackedBy" in selector)
      return { attackedBy: this.selector(selector.attackedBy, s) };
    this.link(selector.linked, s);
    return selector;
  }

  private player(player: PlayerRef, s: Scope): PlayerRef {
    if (typeof player === "string") return player;
    if ("target" in player) {
      this.targetRef(player.target, s);
      return player;
    }
    if ("controllerOf" in player)
      return { controllerOf: this.selector(player.controllerOf, s) };
    if ("ownerOf" in player)
      return { ownerOf: this.selector(player.ownerOf, s) };
    if ("event" in player) {
      if (!s.event)
        this.fail(
          s.path,
          "Event players need a triggered or replacement ability.",
        );
      return player;
    }
    this.binding(player.binding, "player", s);
    return player;
  }

  private predicate(predicate: Predicate, s: Scope): Predicate {
    if ("and" in predicate)
      return { and: predicate.and.map((p) => this.predicate(p, s)) };
    if ("or" in predicate)
      return { or: predicate.or.map((p) => this.predicate(p, s)) };
    if ("not" in predicate) return { not: this.predicate(predicate.not, s) };
    const { anyTarget, ...fields } = predicate as PredicateFields;
    const out: PredicateFields = { ...fields };
    if (fields.controller) out.controller = this.player(fields.controller, s);
    if (fields.owner) out.owner = this.player(fields.owner, s);
    if (fields.player) out.player = this.player(fields.player, s);
    if (fields.is) out.is = this.selector(fields.is, s);
    if (fields.dealtDamageBy)
      out.dealtDamageBy = this.selector(fields.dealtDamageBy, s);
    for (const stat of ["manaValue", "power", "toughness"] as const)
      if (fields[stat] !== undefined)
        out[stat] = this.comparison(fields[stat]!, s);
    if (fields.counters) {
      this.counter(fields.counters.kind, s);
      out.counters = {
        ...fields.counters,
        count: this.comparison(fields.counters.count, s),
      };
    }
    if (!anyTarget) return out;
    // CR 115.4: "any target" is a creature, player, planeswalker or battle.
    const anyTargetPredicate: Predicate = {
      or: [
        { object: "player" },
        { zone: "battlefield", type: ["Creature", "Planeswalker", "Battle"] },
      ],
    };
    return Object.keys(out).length
      ? { and: [out, anyTargetPredicate] }
      : anyTargetPredicate;
  }

  private comparison(comparison: Comparison, s: Scope): Comparison {
    if (typeof comparison === "object" && comparison !== null) {
      for (const op of ["<", "<=", "=", ">=", ">"] as const)
        if (op in comparison)
          return {
            [op]: this.value((comparison as Record<string, Value>)[op], s),
          } as Comparison;
    }
    return { "=": this.value(comparison as Value, s) };
  }

  private value(value: Value, s: Scope): Value {
    if (typeof value === "number") return value;
    if ("variable" in value) {
      if (!s.x)
        this.fail(s.path, "{ variable: X } needs {X} in a cost or mana cost.");
      return value;
    }
    if ("binding" in value) {
      this.binding(value.binding, "number", s);
      return value;
    }
    if ("count" in value) return { count: this.selector(value.count, s) };
    if ("sum" in value) return { sum: value.sum.map((v) => this.value(v, s)) };
    if ("stat" in value)
      return { stat: { ...value.stat, of: this.selector(value.stat.of, s) } };
    if ("greatest" in value)
      return {
        greatest: {
          ...value.greatest,
          of: this.selector(value.greatest.of, s),
        },
      };
    if ("cardsIn" in value)
      return {
        cardsIn: {
          ...value.cardsIn,
          player: this.player(value.cardsIn.player, s),
        },
      };
    if ("lifeTotal" in value)
      return { lifeTotal: this.player(value.lifeTotal, s) };
    if ("commanderColors" in value)
      return { commanderColors: this.player(value.commanderColors, s) };
    if ("eventAmount" in value) {
      if (!s.event)
        this.fail(
          s.path,
          "eventAmount needs a triggered or replacement ability.",
        );
      return value;
    }
    return {
      if: this.condition(value.if, s),
      then: this.value(value.then, s),
      else: this.value(value.else, s),
    };
  }

  private condition(condition: Condition, s: Scope): Condition {
    if ("and" in condition)
      return { and: condition.and.map((c) => this.condition(c, s)) };
    if ("or" in condition)
      return { or: condition.or.map((c) => this.condition(c, s)) };
    if ("not" in condition) return { not: this.condition(condition.not, s) };
    if ("compare" in condition) {
      const [left, op, right] = condition.compare;
      return { compare: [this.value(left, s), op, this.value(right, s)] };
    }
    if ("exists" in condition)
      return { exists: this.selector(condition.exists, s) };
    if ("matches" in condition)
      return {
        matches: {
          selector: this.selector(condition.matches.selector, s),
          predicate: this.predicate(condition.matches.predicate, s),
        },
      };
    if ("happened" in condition)
      return {
        happened: {
          ...condition.happened,
          ...(condition.happened.player
            ? { player: this.player(condition.happened.player, s) }
            : {}),
        },
      };
    if ("paid" in condition) {
      if (!this.optionalCosts.has(condition.paid))
        this.fail(s.path, `No optional cost "${condition.paid}" on this card.`);
      return condition;
    }
    if ("monarch" in condition)
      return { monarch: this.player(condition.monarch, s) };
    if (!s.bindings.has(condition.didPerform))
      this.fail(s.path, `Unknown binding "${condition.didPerform}".`);
    return condition;
  }

  private destination(destination: Destination, s: Scope): Destination {
    if (typeof destination === "string") return { zone: destination };
    return {
      ...destination,
      ...(destination.player
        ? { player: this.player(destination.player, s) }
        : {}),
      ...(destination.controller
        ? { controller: this.player(destination.controller, s) }
        : {}),
    };
  }

  // --------------------------------------------------------- references

  private binding(name: string, type: BindingType, s: Scope) {
    const actual = s.bindings.get(name);
    if (!actual) this.fail(s.path, `Unknown binding "${name}".`);
    else if (actual !== type && !(type === "number" && actual === "flag"))
      this.fail(s.path, `Binding "${name}" holds ${actual}, not ${type}.`);
  }

  private counter(kind: string, s: Scope) {
    if (!(kind in this.registries.counters))
      this.fail(s.path, `Unknown counter kind "${kind}".`);
  }

  private link(name: string, s: Scope) {
    if (!this.links.has(name))
      this.fail(s.path, `No exile on this card links "${name}".`);
  }
}

/** Compiles one card's authored abilities into Core abilities. */
export function compileCard(
  source: CompileSource,
  registries: Registries,
): CompileResult {
  return new Compiler(source, registries).compile();
}

export const coreKeywords = [...ruleKeywords, ...coreMacroKeywords];
