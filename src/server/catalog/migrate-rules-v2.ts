import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CardAbility, CardDefinition } from "../../shared/model.js";
import type {
  ContinuousChange as V1Change,
  ObjectFilter,
  RulesAbility,
  RulesCost,
  RulesEffect,
  RulesValue,
} from "../../shared/rules.js";
import {
  cardDefinitionFileSchema,
  ruleKeywords,
  turnSteps,
  type Ability,
  type CardDefinitionFile,
  type CardForm,
  type Condition,
  type ContinuousChange,
  type Cost,
  type Effect,
  type PlayerRef,
  type Predicate,
  type PredicateFields,
  type Selector,
  type StaticGrant,
  type Trigger,
  type Value,
} from "../../shared/rules-v2.js";
import { definitionV1Schema } from "./catalog-files.js";
import { deriveFields } from "./derive.js";

// Version 1 → version 2 definition migration (dsl-redesign.md §6, §9;
// card-model-refactor.md §6). It maps what the engine runs today, not the
// Oracle text: the golden test down-compiles the output and compares it with
// the version 1 runtime shapes. Anything it can't map is reported, never
// guessed.

export interface Unmapped {
  path: string;
  message: string;
}
export type MigrationResult =
  | { ok: true; file: CardDefinitionFile; notes: string[] }
  | { ok: false; errors: Unmapped[] };

/** Version 1 token enum → token definition id (catalog/tokens). */
export const tokenIds = {
  thopter: "thopter-1-1-flying",
  myr: "myr-1-1",
  germ: "phyrexian-germ-0-0",
} as const;

/** Version 1 keywords that are grants, not keywords (dsl-redesign.md §4.10). */
export const grantKeywords = {
  "Must attack": (objects: Selector): StaticGrant => ({
    kind: "attack-requirement",
    objects,
  }),
  Unblockable: (objects: Selector): StaticGrant => ({
    kind: "block-restriction",
    objects,
  }),
  "Cannot be blocked by Walls": (objects: Selector): StaticGrant => ({
    kind: "block-restriction",
    objects,
    by: { subtype: "Wall" },
  }),
} as const;

const sourceFilter: ObjectFilter = { zone: "battlefield", self: "only" };
const same = (a: unknown, b: unknown) =>
  JSON.stringify(sort(a)) === JSON.stringify(sort(b));
function sort(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sort);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sort(v)]),
    );
  return value;
}

class AbilityMigrator {
  /** Bindings that hold objects; version 1 reads them as counts. */
  private objectBindings = new Set<string>();
  private x = false;

  constructor(
    private readonly errors: Unmapped[],
    private readonly notes: string[],
    private path: string,
  ) {}

  fail(path: string, message: string) {
    this.errors.push({ path: `${this.path}.${path}`, message });
  }

  migrate(ability: CardAbility): Ability[] {
    const { id, description } = ability;
    const base = { id, ...(description ? { description } : {}) };
    for (const key of ["trigger", "costs", "conditions", "effects"] as const)
      if (ability[key] !== undefined)
        this.fail(key, `Primitive ability field "${key}" has no mapping.`);
    if (ability.origin !== "printed")
      this.fail("origin", `Origin "${ability.origin}" has no mapping.`);
    if (!ability.rules) {
      this.fail("rules", "The ability has no rules.");
      return [];
    }
    if (ability.keyword)
      this.notes.push(
        `${id}: ability-level keyword "${ability.keyword}" dropped`,
      );
    const zone = ability.applicableZone;
    const r = { ...ability.rules } as Partial<RulesAbility>;
    this.x = !!r.chosenVariables?.includes("X");
    delete r.chosenVariables;
    const result = this.byPattern(ability, r, base);
    const activeFrom =
      zone && zone !== "battlefield" && ability.kind !== "spell"
        ? zone
        : undefined;
    if (zone && !activeFrom)
      this.notes.push(`${id}: applicableZone "${zone}" dropped (implied)`);
    for (const out of result)
      if (activeFrom) {
        if (out.kind === "activated" || out.kind === "static")
          out.activeFrom = activeFrom;
        else if (!(out.kind === "keyword" && activeFrom === "hand"))
          this.fail(
            "applicableZone",
            `applicableZone "${activeFrom}" has no mapping on a ${out.kind} ability.`,
          );
      }
    for (const [key, value] of Object.entries(r))
      if (
        value !== undefined &&
        !(
          Array.isArray(value) &&
          !value.length &&
          ["costs", "effects"].includes(key)
        )
      )
        this.fail(`rules.${key}`, `Unmapped construct rules.${key}.`);
    return result;
  }

  // ------------------------------------------------------------- patterns

  private byPattern(
    ability: CardAbility,
    r: Partial<RulesAbility>,
    base: { id: string; description?: string },
  ): Ability[] {
    const keyword = this.macroKeyword(ability, r);
    if (keyword) {
      this.notes.push(`${base.id}: ${keyword.note}`);
      return [{ ...base, kind: "keyword", keyword: keyword.keyword }];
    }
    if (r.manaAbility) return [this.manaAbility(ability, r, base)];
    switch (ability.kind) {
      case "static":
        return this.staticAbility(r, base);
      case "spell":
        this.noCosts(r);
        return [{ ...base, kind: "spell", ...this.body(r) }];
      case "triggered": {
        this.noCosts(r);
        const trigger = this.trigger(r);
        const intervening = r.intervening;
        delete r.intervening;
        return [
          {
            ...base,
            kind: "triggered",
            trigger,
            ...(intervening
              ? {
                  interveningIf: this.intervening(intervening),
                }
              : {}),
            ...this.body(r),
          },
        ];
      }
      case "activated": {
        const costs = (r.costs ?? []).map((c, i) =>
          this.cost(c, `rules.costs[${i}]`),
        );
        delete r.costs;
        const timing = r.timing;
        const oncePerTurn = r.oncePerTurn;
        const modifiers = r.costModifiers;
        delete r.timing;
        delete r.oncePerTurn;
        delete r.costModifiers;
        const out: Ability[] = [
          {
            ...base,
            kind: "activated",
            costs,
            ...(timing ? { timing } : {}),
            ...(oncePerTurn ? { limit: { perTurn: 1 } } : {}),
            ...this.body(r),
          },
        ];
        if (modifiers?.length) {
          const grants = modifiers.map((m, i) => {
            if (m.use !== "activate" || m.scope !== "source" || m.filter)
              this.fail(
                `rules.costModifiers[${i}]`,
                "Only this-ability cost modifiers map.",
              );
            return {
              kind: "cost-modifier",
              applies: { abilitiesOf: "source" },
              reduce: this.value(m.amount),
            } satisfies StaticGrant;
          });
          out.push({ id: `${base.id}-cost`, kind: "static", grants });
          this.notes.push(
            `${base.id}: activation cost modifier → static "${base.id}-cost" (abilitiesOf source)`,
          );
        }
        return out;
      }
    }
  }

  /** Abilities that are exactly a macro keyword's expansion (§4.10). */
  private macroKeyword(
    ability: CardAbility,
    r: Partial<RulesAbility>,
  ):
    | {
        keyword: Extract<Ability, { kind: "keyword" }>["keyword"];
        note: string;
      }
    | undefined {
    const only = (...keys: (keyof RulesAbility)[]) =>
      Object.entries(r).every(
        ([key, value]) =>
          keys.includes(key as keyof RulesAbility) ||
          value === undefined ||
          (Array.isArray(value) && !value.length),
      );
    const clear = () => {
      for (const key of Object.keys(r)) delete r[key as keyof RulesAbility];
    };
    const effects = r.effects ?? [];
    const costs = r.costs ?? [];
    if (ability.kind === "static" && r.keyword && only("keyword")) {
      const name = r.keyword.toLowerCase();
      if ((ruleKeywords as readonly string[]).includes(name)) {
        clear();
        return {
          keyword: name as (typeof ruleKeywords)[number],
          note: `keyword "${r.keyword}" → keyword "${name}"`,
        };
      }
    }
    if (ability.kind === "static" && r.aura && only("aura")) {
      const filter = this.predicate(r.aura, "rules.aura");
      clear();
      return {
        keyword: { name: "enchant", filter },
        note: "aura → enchant keyword",
      };
    }
    if (ability.kind === "static" && r.improvise && only("improvise")) {
      clear();
      return {
        keyword: { name: "improvise" },
        note: "improvise → improvise keyword",
      };
    }
    // Ward: becomes-target by an opponent → may-pay, else counter (Kappa Cannoneer).
    const [pay, check] = effects;
    if (
      ability.kind === "triggered" &&
      only("trigger", "effects") &&
      same(r.trigger, {
        event: "target",
        player: "opponent",
        filter: sourceFilter,
      }) &&
      effects.length === 2 &&
      pay.kind === "pay-mana" &&
      pay.player === "event-player" &&
      check.kind === "if" &&
      same(check, {
        kind: "if",
        condition: { binding: pay.bind, atLeast: 1 },
        then: [],
        otherwise: [{ kind: "counter-event" }],
      })
    ) {
      clear();
      return {
        keyword: {
          name: "ward",
          costs: [{ kind: "mana", symbols: pay.symbols }],
        },
        note: "ward trigger (pay-mana + counter-event) → ward keyword",
      };
    }
    if (
      ability.kind === "activated" &&
      ability.applicableZone === "hand" &&
      only("costs", "effects") &&
      costs.length >= 2 &&
      costs.at(-1)!.kind === "discard-source" &&
      costs.slice(0, -1).every((c) => c.kind === "mana") &&
      same(effects, [{ kind: "draw", count: 1 }])
    ) {
      const keyword = {
        name: "cycling" as const,
        costs: costs
          .slice(0, -1)
          .map((c, i) => this.cost(c, `rules.costs[${i}]`)),
      };
      clear();
      return { keyword, note: "cycling ability → cycling keyword" };
    }
    if (
      ability.kind === "activated" &&
      only("costs", "effects", "timing", "target") &&
      r.timing === "sorcery" &&
      costs.length &&
      costs.every((c) => c.kind === "mana") &&
      same(r.target, {
        zone: "battlefield",
        types: ["Creature"],
        controller: "you",
      }) &&
      same(effects, [{ kind: "attach", to: "target" }])
    ) {
      const keyword = {
        name: "equip" as const,
        costs: costs.map((c, i) => this.cost(c, `rules.costs[${i}]`)),
      };
      clear();
      return { keyword, note: "equip ability → equip keyword" };
    }
    if (
      ability.kind === "activated" &&
      only("costs", "effects") &&
      costs.length === 1 &&
      costs[0].kind === "crew" &&
      same(costs[0].filter, {
        zone: "battlefield",
        controller: "you",
        types: ["Creature"],
      }) &&
      same(effects, [
        {
          kind: "animate-source",
          changes: [{ kind: "add-types", types: ["Artifact", "Creature"] }],
        },
      ])
    ) {
      const power = costs[0].power;
      clear();
      return {
        keyword: { name: "crew", power },
        note: "crew ability → crew keyword",
      };
    }
    if (
      ability.kind === "triggered" &&
      only("trigger", "effects") &&
      same(r.trigger, { event: "enter", filter: sourceFilter }) &&
      same(effects, [
        { kind: "create-token", token: "germ", count: 1 },
        { kind: "attach", to: "created" },
      ])
    ) {
      clear();
      return {
        keyword: { name: "living-weapon" },
        note: "Germ + attach → living-weapon keyword",
      };
    }
    const [modifier] = r.costModifiers ?? [];
    const counted =
      modifier &&
      typeof modifier.amount === "object" &&
      "count" in modifier.amount
        ? modifier.amount.count
        : undefined;
    if (
      ability.kind === "static" &&
      only("costModifiers") &&
      r.costModifiers?.length === 1 &&
      modifier.use === "cast" &&
      modifier.scope === "source" &&
      !modifier.filter &&
      counted &&
      counted.zone === "battlefield" &&
      counted.controller === "you" &&
      Object.keys(counted).length === 3 &&
      (counted.types || counted.subtypes)
    ) {
      const keyword = {
        name: "affinity" as const,
        for: counted.types
          ? { type: counted.types }
          : { subtype: counted.subtypes! },
      };
      clear();
      return {
        keyword,
        note: "self cost modifier by count → affinity keyword",
      };
    }
    return undefined;
  }

  private manaAbility(
    ability: CardAbility,
    r: Partial<RulesAbility>,
    base: { id: string; description?: string },
  ): Ability {
    delete r.manaAbility;
    const effects = r.effects ?? [];
    delete r.effects;
    const [effect] = effects;
    if (effects.length !== 1 || effect.kind !== "add-mana") {
      this.fail("rules.effects", "A mana ability must only add mana.");
      return {
        ...base,
        kind: "mana",
        activation: { costs: [] },
        produce: { quantity: 1, colors: ["C"] },
      };
    }
    const produce = {
      quantity: effect.quantity,
      colors:
        effect.colors === "commander-colors"
          ? { commanderColors: "you" as const }
          : effect.colors,
      ...(effect.restriction ? { restriction: effect.restriction } : {}),
    };
    if (ability.kind === "activated") {
      const costs = (r.costs ?? []).map((c, i) =>
        this.cost(c, `rules.costs[${i}]`),
      );
      delete r.costs;
      return { ...base, kind: "mana", activation: { costs }, produce };
    }
    const trigger = r.trigger;
    delete r.trigger;
    this.noCosts(r);
    if (
      ability.kind !== "triggered" ||
      trigger?.event !== "mana" ||
      !trigger.filter
    ) {
      this.fail(
        "rules.trigger",
        "A triggered mana ability needs a mana trigger.",
      );
      return { ...base, kind: "mana", activation: { costs: [] }, produce };
    }
    const { event: _event, filter, ...rest } = trigger;
    for (const key of Object.keys(rest))
      this.fail(`rules.trigger.${key}`, `Unmapped mana trigger field ${key}.`);
    return {
      ...base,
      kind: "mana",
      activation: {
        trigger: {
          event: "tapped-for-mana",
          object: this.predicate(filter, "rules.trigger.filter"),
        },
      },
      produce,
    };
  }

  private staticAbility(
    r: Partial<RulesAbility>,
    base: { id: string; description?: string },
  ): Ability[] {
    this.noCosts(r);
    const effects = r.effects ?? [];
    delete r.effects;
    if (effects.length) {
      if (!same(effects, [{ kind: "enter-tapped" }]))
        this.fail(
          "rules.effects",
          "A static ability's effects must be enter-tapped.",
        );
      this.notes.push(`${base.id}: enter-tapped → replacement`);
      return [
        {
          ...base,
          kind: "replacement",
          event: { event: "would-enter", object: "source" },
          replace: { kind: "enter-tapped" },
        },
      ];
    }
    const grants: StaticGrant[] = [];
    let condition: Condition | undefined;
    let characteristicDefining = false;
    if (r.keyword) {
      const grant = grantKeywords[r.keyword as keyof typeof grantKeywords];
      if (grant) grants.push(grant("source"));
      else this.fail("rules.keyword", `Keyword "${r.keyword}" has no mapping.`);
      delete r.keyword;
    }
    if (r.continuous) {
      const c = r.continuous;
      delete r.continuous;
      const objects = this.objects(c.filter, "rules.continuous.filter");
      grants.push(
        ...this.changes(c.changes, objects, "rules.continuous.changes"),
      );
      if (c.condition)
        condition = {
          compare: [this.value(c.condition.value), ">=", c.condition.atLeast],
        };
      characteristicDefining = !!c.characteristicDefining;
    }
    for (const [i, m] of (r.costModifiers ?? []).entries()) {
      const path = `rules.costModifiers[${i}]`;
      if (m.use !== "cast")
        this.fail(
          path,
          "Activation cost modifiers belong on the activated ability.",
        );
      if (m.scope === "controller") {
        if (!m.filter)
          this.fail(path, "A controller cost modifier needs a filter.");
        grants.push({
          kind: "cost-modifier",
          applies: {
            spells: this.predicate(
              m.filter ?? { zone: "stack" },
              `${path}.filter`,
            ),
          },
          reduce: this.value(m.amount),
        });
      } else {
        if (m.filter) this.fail(path, "A source cost modifier can't filter.");
        grants.push({
          kind: "cost-modifier",
          applies: "this",
          reduce: this.value(m.amount),
        });
      }
    }
    delete r.costModifiers;
    if (r.attackCost) {
      grants.push({
        kind: "attack-tax",
        defender: "you",
        costPerAttacker: [{ kind: "mana", symbols: r.attackCost.symbols }],
      });
      delete r.attackCost;
    }
    if (r.castingPermission) {
      grants.push({
        kind: "cast-timing",
        spells: this.predicate(r.castingPermission, "rules.castingPermission"),
        as: "flash",
      });
      delete r.castingPermission;
    }
    if (r.maximumHandSize) {
      grants.push({
        kind: "maximum-hand-size",
        player: "you",
        value: "unlimited",
      });
      delete r.maximumHandSize;
    }
    if (r.monarchUntap) {
      grants.push({
        kind: "untap-restriction",
        objects: { attachedTo: "source" },
        unless: { monarch: { controllerOf: { attachedTo: "source" } } },
      });
      delete r.monarchUntap;
    }
    if (!grants.length)
      this.fail("rules", "A static ability with nothing to grant.");
    return [
      {
        ...base,
        kind: "static",
        ...(condition ? { condition } : {}),
        ...(characteristicDefining
          ? { characteristicDefining: true as const }
          : {}),
        grants,
      },
    ];
  }

  private noCosts(r: Partial<RulesAbility>) {
    if (r.costs?.length)
      this.fail("rules.costs", "Only activated abilities have costs.");
    delete r.costs;
  }

  /** Targets and effects of spells, activated and triggered abilities. */
  private body(r: Partial<RulesAbility>) {
    const target = r.target;
    delete r.target;
    const effects = this.effects(r.effects ?? [], "rules.effects", !!target);
    delete r.effects;
    if (!effects.length)
      this.fail("rules.effects", "The ability has no effects.");
    return {
      ...(target
        ? {
            targets: [
              {
                id: "target-0",
                filter: this.predicate(target, "rules.target"),
              },
            ],
          }
        : {}),
      effects,
    };
  }

  // -------------------------------------------------------------- triggers

  private trigger(r: Partial<RulesAbility>): Trigger {
    const t = r.trigger;
    delete r.trigger;
    if (!t) {
      this.fail("rules.trigger", "A triggered ability needs a trigger.");
      return { event: "state", condition: { exists: "source" } };
    }
    const {
      event,
      filter,
      player,
      ordinal,
      grouped,
      step,
      combat,
      recipientKind,
      counter,
      atLeast,
      ...rest
    } = t;
    for (const key of Object.keys(rest))
      this.fail(`rules.trigger.${key}`, `Unmapped trigger field ${key}.`);
    const used = new Set<string>(["event"]);
    const need = <T>(value: T | undefined, key: string): T => {
      used.add(key);
      if (value === undefined)
        this.fail(`rules.trigger.${key}`, `A ${event} trigger needs ${key}.`);
      return value as T;
    };
    const opt = <T>(value: T | undefined, key: string) => {
      used.add(key);
      return value;
    };
    const subject = () =>
      this.subject(need(filter, "filter"), "rules.trigger.filter");
    const playerRef = (p: "you" | "opponent") =>
      p === "you" ? "you" : "opponents";
    let out: Trigger;
    switch (event) {
      case "enter": {
        const during = opt(step, "step");
        if (during !== undefined && !turnSteps[during])
          this.fail("rules.trigger.step", `Unknown step ${during}.`);
        out = {
          event: "enters",
          object: subject(),
          ...(during !== undefined ? { during: turnSteps[during] } : {}),
        };
        if (during !== undefined)
          this.notes.push(`step ${during} → during "${turnSteps[during]}"`);
        break;
      }
      case "dies":
        out = {
          event: "zone-change",
          object: subject(),
          from: "battlefield",
          to: "graveyard",
        };
        this.notes.push(
          `dies → zone-change battlefield→graveyard (version 1 doesn't check creature)`,
        );
        break;
      case "attack":
        out = { event: "attacks", attacker: subject() };
        break;
      case "cast":
        out = {
          event: "cast",
          spell: this.predicate(need(filter, "filter"), "rules.trigger.filter"),
        };
        break;
      case "damage": {
        const to = opt(recipientKind, "recipientKind");
        out = {
          event: "deals-damage",
          source: subject(),
          ...(to ? { to } : {}),
          ...(opt(combat, "combat") !== undefined ? { combat } : {}),
          ...(opt(grouped, "grouped") ? { batch: "one-or-more" as const } : {}),
        };
        break;
      }
      case "draw": {
        const nth = opt(ordinal, "ordinal");
        out = {
          event: "draws",
          player: playerRef(need(player, "player")),
          ...(nth ? { nth } : {}),
        };
        break;
      }
      case "upkeep": {
        const p = opt(player, "player");
        out = {
          event: "step",
          step: "upkeep",
          ...(p ? { player: playerRef(p) } : {}),
        };
        break;
      }
      case "target": {
        const by = opt(player, "player");
        out = {
          event: "becomes-target",
          object: subject(),
          ...(by ? { by: playerRef(by) } : {}),
        };
        break;
      }
      case "state":
        if (!same(need(filter, "filter"), sourceFilter))
          this.fail(
            "rules.trigger.filter",
            "State triggers watch their source.",
          );
        out = {
          event: "state",
          condition: {
            matches: {
              selector: "source",
              predicate: {
                counters: {
                  kind: need(counter, "counter"),
                  count: { ">=": need(atLeast, "atLeast") },
                },
              },
            },
          },
        };
        break;
      default:
        this.fail(
          "rules.trigger.event",
          `Trigger event "${event}" has no mapping here.`,
        );
        return { event: "state", condition: { exists: "source" } };
    }
    for (const [key, value] of Object.entries(t))
      if (value !== undefined && !used.has(key))
        this.fail(
          `rules.trigger.${key}`,
          `Unmapped field ${key} on a ${event} trigger.`,
        );
    return out;
  }

  private intervening(c: NonNullable<RulesAbility["intervening"]>): Condition {
    const compare: Condition = {
      compare: [this.value(c.value), ">=", this.value(c.atLeast)],
    };
    return c.requireObjects
      ? {
          and: [
            compare,
            {
              exists: {
                all: this.predicate(
                  c.requireObjects,
                  "rules.intervening.requireObjects",
                ),
              },
            },
          ],
        }
      : compare;
  }

  // --------------------------------------------------------------- effects

  private effects(
    effects: RulesEffect[],
    path: string,
    targeted: boolean,
  ): Effect[] {
    const out: Effect[] = [];
    for (let i = 0; i < effects.length; i++) {
      const effect = effects[i];
      const at = `${path}[${i}]`;
      if (effect.kind === "pay-mana") {
        const next = effects[i + 1];
        if (
          next?.kind !== "if" ||
          next.condition.binding !== effect.bind ||
          next.condition.atLeast !== 1
        ) {
          this.fail(at, "pay-mana must be followed by an if on its binding.");
          continue;
        }
        if (!effect.symbols.length) this.fail(at, "pay-mana needs symbols.");
        const then = this.effects(
          next.then,
          `${path}[${i + 1}].then`,
          targeted,
        );
        const otherwise = this.effects(
          next.otherwise,
          `${path}[${i + 1}].otherwise`,
          targeted,
        );
        out.push({
          kind: "may-pay",
          ...(effect.player === "event-player"
            ? { player: { event: "player" } }
            : {}),
          costs: [{ kind: "mana", symbols: effect.symbols }],
          ...(then.length ? { then } : {}),
          ...(otherwise.length ? { else: otherwise } : {}),
        });
        this.notes.push(`pay-mana + if → may-pay`);
        i++;
        continue;
      }
      if (effect.kind === "attach" && effect.to === "created") {
        const previous = out.at(-1);
        if (previous?.kind !== "create-token") {
          this.fail(at, 'attach to "created" needs a create-token before it.');
          continue;
        }
        previous.bind = "created";
        this.objectBindings.add("created");
        out.push({
          kind: "attach",
          object: "source",
          to: { binding: "created" },
        });
        continue;
      }
      out.push(...this.effect(effect, at, targeted));
    }
    return out;
  }

  private effect(e: RulesEffect, path: string, targeted: boolean): Effect[] {
    const target = (): Selector => {
      if (!targeted) this.fail(path, `${e.kind} needs a target declaration.`);
      return "target";
    };
    switch (e.kind) {
      case "damage":
        return [
          {
            kind: "damage",
            amount: this.value(e.amount),
            to:
              e.recipient === "defender" ? { attackedBy: "source" } : target(),
          },
        ];
      case "tap-choice":
        this.objectBindings.add(e.bind);
        return [
          {
            kind: "tap",
            objects: {
              choose: {
                from: this.predicate(e.filter, `${path}.filter`),
                count: { min: 0 },
              },
            },
            bind: e.bind,
          },
        ];
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
        return [{ kind: "counter", objects: target() }];
      case "redirect-attack":
        return [{ kind: "reselect-defender", attacker: target() }];
      case "lose-life":
        return [
          {
            kind: "lose-life",
            amount: this.value(e.amount),
            player:
              e.player === "event-player" ? { event: "player" } : e.player,
          },
        ];
      case "gain-life":
        return [{ kind: "gain-life", amount: e.amount }];
      case "animate-source":
        return [this.animate(e, path, target)];
      case "move":
      case "destroy":
      case "exile":
      case "sacrifice":
        return [this.movement(e, path, target)];
      case "inspect":
        return [this.inspect(e, path)];
      case "attach":
        return [{ kind: "attach", to: target() }];
      case "discard":
        return [
          {
            kind: "discard",
            count: this.value(e.count),
            ...(e.types ? { filter: { type: e.types } } : {}),
            ...(e.bind ? { bind: e.bind } : {}),
          },
        ];
      case "add-counters":
        return [
          {
            kind: "add-counters",
            objects: this.objects(e.filter, `${path}.filter`),
            counter: e.counter,
            count: e.count,
          },
        ];
      case "create-token":
        this.notes.push(`token "${e.token}" → "${tokenIds[e.token]}"`);
        return [
          { kind: "create-token", token: tokenIds[e.token], count: e.count },
        ];
      case "draw":
        return [
          {
            kind: "draw",
            count: this.value(e.count),
            ...(e.player
              ? { player: e.player === "each" ? "each-player" : "you" }
              : {}),
            ...(e.bind ? { bind: e.bind } : {}),
          },
        ];
      case "sequence":
        return [
          {
            kind: "sequence",
            effects: this.effects(e.effects, `${path}.effects`, targeted),
          },
        ];
      case "if": {
        const otherwise = this.effects(
          e.otherwise,
          `${path}.otherwise`,
          targeted,
        );
        return [
          {
            kind: "if",
            condition: {
              compare: [
                this.value({ binding: e.condition.binding }),
                ">=",
                e.condition.atLeast,
              ],
            },
            then: this.effects(e.then, `${path}.then`, targeted),
            ...(otherwise.length ? { else: otherwise } : {}),
          },
        ];
      }
      case "alternative":
        return [
          {
            kind: "choose-one",
            options: e.options.map((option, i) => {
              const discard = option.effect;
              const [effect] = this.effect(
                discard,
                `${path}.options[${i}].effect`,
                targeted,
              );
              const pool: Predicate = {
                zone: "hand",
                owner: "you",
                ...(discard.types ? { type: discard.types } : {}),
              };
              if (option.requireComplete && typeof discard.count !== "number")
                this.fail(
                  `${path}.options[${i}]`,
                  "requireComplete needs a fixed count.",
                );
              const available: Condition | undefined = !option.requireComplete
                ? undefined
                : discard.count === 1
                  ? { exists: { all: pool } }
                  : {
                      compare: [
                        { count: { all: pool } },
                        ">=",
                        discard.count as number,
                      ],
                    };
              return {
                id: option.id,
                label: option.label,
                ...(available ? { available } : {}),
                effects: [effect],
              };
            }),
          },
        ];
      case "pay-mana":
      case "add-mana":
      case "enter-tapped":
        this.fail(path, `${e.kind} has no mapping in this position.`);
        return [];
    }
  }

  private animate(
    e: Extract<RulesEffect, { kind: "animate-source" }>,
    path: string,
    target: () => Selector,
  ): Effect {
    const objects = e.recipient === "target" ? target() : "source";
    const grants = this.changes(e.changes, objects, `${path}.changes`);
    if (grants.length !== 1) {
      this.fail(
        path,
        "An animation can't mix keyword grants and other changes.",
      );
      return { kind: "sequence", effects: [] };
    }
    const [grant] = grants;
    return grant.kind === "continuous"
      ? {
          kind: "apply-continuous",
          objects,
          changes: grant.changes,
          duration: "end-of-turn",
        }
      : { kind: "apply-grant", grant, duration: "end-of-turn" };
  }

  /** Version 1 changes → grants: rule keywords stay changes, the rest become grants. */
  private changes(
    changes: V1Change[],
    objects: Selector,
    path: string,
  ): StaticGrant[] {
    const grants: StaticGrant[] = [];
    let current: ContinuousChange[] | undefined;
    changes.forEach((change, i) => {
      const at = `${path}[${i}]`;
      if (change.kind === "grant-keyword") {
        const name = change.keyword.toLowerCase();
        if (!(ruleKeywords as readonly string[]).includes(name)) {
          const grant =
            grantKeywords[change.keyword as keyof typeof grantKeywords];
          if (!grant)
            this.fail(at, `Keyword "${change.keyword}" has no mapping.`);
          else grants.push(grant(objects));
          current = undefined;
          return;
        }
      }
      if (!current) {
        current = [];
        grants.push({ kind: "continuous", objects, changes: current });
      }
      current.push(this.change(change));
    });
    return grants;
  }

  private change(change: V1Change): ContinuousChange {
    switch (change.kind) {
      case "add-types":
        return change;
      case "set-stats":
        return {
          kind: "set-base-stats",
          power: this.value(change.power),
          toughness: this.value(change.toughness),
        };
      case "add-stats":
      case "define-stats":
        return {
          kind: change.kind,
          power: this.value(change.power),
          toughness: this.value(change.toughness),
        };
      case "grant-keyword":
        return {
          kind: "grant-keyword",
          keyword:
            change.keyword.toLowerCase() as (typeof ruleKeywords)[number],
        };
      case "linked-characteristics":
        return {
          kind: "copy-linked",
          link: change.link,
          retainSubtypes: change.retainSubtypes,
        };
    }
  }

  private movement(
    e: Extract<
      RulesEffect,
      { kind: "move" | "destroy" | "exile" | "sacrifice" }
    >,
    path: string,
    target: () => Selector,
  ): Effect {
    const filter = () => {
      if (!e.filter) this.fail(path, `subject "${e.subject}" needs a filter.`);
      return this.predicate(
        e.filter ?? { zone: "battlefield" },
        `${path}.filter`,
      );
    };
    if (e.subject !== "set" && e.subject !== "choice" && e.filter)
      this.fail(
        `${path}.filter`,
        `A filter on subject "${e.subject}" has no mapping.`,
      );
    if (e.kind !== "move" && e.destination)
      this.fail(`${path}.destination`, `${e.kind} has no destination.`);
    if (e.link && e.kind !== "exile")
      this.fail(`${path}.link`, "Only exile links.");
    const objects: Selector =
      e.subject === "source"
        ? "source"
        : e.subject === "target"
          ? target()
          : e.subject === "set"
            ? { all: filter() }
            : { choose: { from: filter(), count: 1 } };
    if (e.bind) this.objectBindings.add(e.bind);
    const bind = e.bind ? { bind: e.bind } : {};
    let effect: Effect;
    if (e.kind === "move") {
      if (!e.destination) this.fail(path, "A move needs a destination.");
      effect = {
        kind: "move",
        objects,
        to: e.destination ?? "graveyard",
        ...bind,
      };
    } else if (e.kind === "exile")
      effect = {
        kind: "exile",
        objects,
        ...(e.link ? { linkAs: e.link } : {}),
        ...bind,
      };
    else effect = { kind: e.kind, objects, ...bind };
    if (e.eachPlayer) {
      if (
        e.kind !== "sacrifice" ||
        e.subject !== "set" ||
        typeof objects !== "object" ||
        !("all" in objects)
      )
        this.fail(path, "eachPlayer maps only for a sacrifice set.");
      else {
        const all = objects.all;
        const owned: Predicate =
          "and" in all
            ? {
                and: [
                  {
                    ...(all.and[0] as PredicateFields),
                    controller: { binding: "player" },
                  },
                  ...all.and.slice(1),
                ],
              }
            : {
                ...(all as PredicateFields),
                controller: { binding: "player" },
              };
        effect = {
          kind: "for-each-player",
          players: "each-player",
          order: "APNAP",
          effects: [{ ...effect, objects: { all: owned } } as Effect],
        };
        this.notes.push(`eachPlayer → for-each-player`);
      }
    }
    if (e.optional) {
      this.notes.push(`optional ${e.kind} → may`);
      return { kind: "may", effects: [effect] };
    }
    return effect;
  }

  private inspect(
    e: Extract<RulesEffect, { kind: "inspect" }>,
    path: string,
  ): Effect {
    if (!e.select) {
      if (e.randomBottom || e.revealSelected)
        this.fail(path, "An inspect without select only maps as scry.");
      this.notes.push("inspect → scry");
      return { kind: "scry", count: e.count };
    }
    this.notes.push("inspect with select → library-sequence");
    return {
      kind: "library-sequence",
      player: "you",
      count: e.count,
      operation: "look",
      select: {
        filter: this.predicate(e.select, `${path}.select`),
        max: 1,
        to: "hand",
        ...(e.revealSelected ? { reveal: true } : {}),
      },
      rest: {
        to: { zone: "library", position: "bottom" },
        order: e.randomBottom ? "random" : "keep",
      },
    };
  }

  // --------------------------------------------------------- costs, values

  private cost(c: RulesCost, path: string): Cost {
    switch (c.kind) {
      case "mana":
        if (!c.symbols.length) this.fail(path, "A mana cost needs symbols.");
        return c;
      case "tap-source":
      case "sacrifice-source":
      case "discard-source":
        return c;
      case "life":
        return {
          kind: "life",
          amount:
            c.amount === "commander-colors"
              ? { commanderColors: "you" }
              : c.amount,
        };
      case "counter-source":
        return { ...c, operation: "put" };
      case "crew":
        this.fail(path, "A crew cost maps only as the crew keyword.");
        return { kind: "tap-source" };
      default:
        return {
          kind: c.kind,
          count: c.count,
          filter: this.predicate(c.filter, `${path}.filter`),
        };
    }
  }

  value(v: RulesValue): Value {
    if (typeof v === "number") return v;
    if ("binding" in v) {
      if (v.binding === "X" && this.x) return { variable: "X" };
      return this.objectBindings.has(v.binding)
        ? { count: { binding: v.binding } }
        : { binding: v.binding };
    }
    if ("count" in v)
      return { count: { all: this.predicate(v.count, "value.count") } };
    if ("sum" in v) return { sum: v.sum.map((term) => this.value(term)) };
    if ("handSize" in v) return { cardsIn: { zone: "hand", player: "you" } };
    return {
      greatest: {
        of: {
          all: this.predicate(v.greatestManaValue, "value.greatestManaValue"),
        },
        name: "manaValue",
      },
    };
  }

  // ------------------------------------------------------ filters → AST

  /** Effect objects: the source, or every object matching the filter. */
  private objects(filter: ObjectFilter, path: string): Selector {
    return same(filter, sourceFilter)
      ? "source"
      : { all: this.predicate(filter, path) };
  }

  /** Trigger subjects: the source, or a predicate. */
  private subject(filter: ObjectFilter, path: string): Selector | Predicate {
    return same(filter, sourceFilter) ? "source" : this.predicate(filter, path);
  }

  predicate(filter: ObjectFilter, path: string): Predicate {
    const base: PredicateFields = {};
    const extra: Predicate[] = [];
    const statuses: ("untapped" | "attacking")[] = [];
    const player = (p: "you" | "opponent"): PlayerRef =>
      p === "you" ? "you" : "opponents";
    for (const [key, value] of Object.entries(filter)) {
      if (value === undefined) continue;
      if (value === false) {
        this.fail(`${path}.${key}`, `A false ${key} flag has no mapping.`);
        continue;
      }
      switch (key as keyof ObjectFilter) {
        case "zone":
          base.zone = filter.zone;
          break;
        case "kind":
          base.object = filter.kind;
          break;
        case "subtypes":
          base.subtype = filter.subtypes;
          break;
        case "types":
          base.type = filter.types;
          break;
        case "allTypes":
          extra.push(...filter.allTypes!.map((type) => ({ type })));
          break;
        case "excludeTypes":
          extra.push({ not: { type: filter.excludeTypes! } });
          break;
        case "self":
          if (filter.self === "only") base.is = "source";
          else extra.push({ not: { is: "source" } });
          break;
        case "attached":
          if (base.is)
            this.fail(path, "A filter can't be both self and attached.");
          base.is = { attachedTo: "source" };
          break;
        case "controller":
          base.controller = player(filter.controller!);
          break;
        case "owner":
          base.owner = player(filter.owner!);
          break;
        case "nontoken":
          extra.push({ not: { object: "token" } });
          break;
        case "colored":
          base.color = "any";
          break;
        case "colorless":
          if (base.color)
            this.fail(path, "A filter can't be colored and colorless.");
          base.color = "colorless";
          break;
        case "untapped":
        case "attacking":
          statuses.push(key as "untapped" | "attacking");
          break;
        case "manaValue":
          base.manaValue = this.value(filter.manaValue!);
          break;
        case "damagedBySource":
          base.dealtDamageBy = "source";
          break;
        default:
          this.fail(`${path}.${key}`, `Unmapped filter field ${key}.`);
      }
    }
    if (statuses.length)
      base.status = statuses.length === 1 ? statuses[0] : statuses;
    return extra.length ? { and: [base, ...extra] } : base;
  }
}

/** Migrates one card's version 1 abilities. */
export function migrateAbilities(
  abilities: CardAbility[],
  path = "abilities",
): { abilities: Ability[]; notes: string[]; errors: Unmapped[] } {
  const errors: Unmapped[] = [];
  const notes: string[] = [];
  const out: Ability[] = [];
  abilities.forEach((ability, i) => {
    out.push(
      ...new AbilityMigrator(errors, notes, `${path}[${i}]`).migrate(ability),
    );
  });
  if (out.some((a) => a.id.endsWith("-cost") && a.kind === "static")) {
    const activated = out.filter(
      (a) => a.kind === "activated" || a.kind === "mana",
    );
    if (activated.length > 1)
      errors.push({
        path,
        message:
          "An activation cost modifier needs a card with one activated ability.",
      });
  }
  return { abilities: out, notes, errors };
}

/**
 * Migrates one definition file. Version 2 input comes back unchanged, so the
 * migration is idempotent.
 */
export function migrateDefinition(raw: unknown): MigrationResult {
  const v2 = cardDefinitionFileSchema.safeParse(raw);
  if (v2.success)
    return { ok: true, file: v2.data, notes: ["already version 2"] };
  const parsed = definitionV1Schema.safeParse(raw);
  if (!parsed.success)
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    };
  const card = parsed.data as CardDefinition;
  const errors: Unmapped[] = [];
  const form = card.form as CardForm;
  const derived = deriveFields(form, card.components);
  const stored = {
    canonicalName: card.canonicalName,
    manaValue: card.manaValue,
    keywords: card.keywords,
    oracleText: card.oracleText,
    typeLines: card.components.map((c) => c.typeLine),
  };
  for (const key of Object.keys(stored) as (keyof typeof stored)[])
    if (!same(derived[key], stored[key]))
      errors.push({
        path: key,
        message: `Derived ${key} ${JSON.stringify(derived[key])} ≠ stored ${JSON.stringify(stored[key])}.`,
      });
  const migrated = migrateAbilities(card.abilities);
  errors.push(...migrated.errors);
  const candidate = {
    catalogVersion: 2,
    id: card.id,
    imported: {
      form,
      components: card.components.map(
        ({ typeLine: _typeLine, ...component }) => component,
      ),
      colorIdentity: card.colorIdentity,
      defaultPrintingId: card.defaultPrintingId,
    },
    authored: {
      automationStatus: card.automationStatus,
      abilities: migrated.abilities,
    },
  };
  const result = cardDefinitionFileSchema.safeParse(candidate);
  if (!result.success)
    errors.push(
      ...result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: `Output is not a valid version 2 definition: ${issue.message}`,
      })),
    );
  if (errors.length || !result.success) return { ok: false, errors };
  return { ok: true, file: result.data, notes: migrated.notes };
}

export interface DryRunReport {
  definitions: number;
  migrated: number;
  unmapped: { file: string; errors: Unmapped[] }[];
  cards: {
    file: string;
    name: string;
    notes: string[];
    abilities: Ability[];
  }[];
}

/** Migrates every definition in memory; writes nothing. */
export async function dryRun(root: string): Promise<DryRunReport> {
  const directory = join(root, "definitions");
  const report: DryRunReport = {
    definitions: 0,
    migrated: 0,
    unmapped: [],
    cards: [],
  };
  for (const file of (await readdir(directory)).sort()) {
    if (!file.endsWith(".json")) continue;
    report.definitions++;
    const raw = JSON.parse(await readFile(join(directory, file), "utf8"));
    const result = migrateDefinition(raw);
    if (!result.ok) {
      report.unmapped.push({ file, errors: result.errors });
      continue;
    }
    report.migrated++;
    if (result.file.authored.abilities.length)
      report.cards.push({
        file,
        name: result.file.imported.components.map((c) => c.name).join(" // "),
        notes: [...new Set(result.notes)],
        abilities: result.file.authored.abilities,
      });
  }
  return report;
}

/** The diff report: per card with abilities, the notes and the version 2 abilities. */
export function formatReport(report: DryRunReport): string {
  const lines = [
    "# Catalog migration dry run (version 1 → version 2)",
    "",
    `- Definitions read: ${report.definitions}`,
    `- Migrated: ${report.migrated}`,
    `- Unmapped: ${report.unmapped.length}`,
    `- Every file: \`typeLine\` dropped from components; stored \`canonicalName\`, \`manaValue\`, \`keywords\`, \`oracleText\` dropped (derived, checked equal); \`imported\` and \`authored\` sections.`,
    "",
  ];
  for (const { file, errors } of report.unmapped) {
    lines.push(`## UNMAPPED ${file}`, "");
    for (const e of errors) lines.push(`- \`${e.path}\`: ${e.message}`);
    lines.push("");
  }
  for (const card of report.cards) {
    lines.push(`## ${card.name}`, "");
    for (const note of card.notes) lines.push(`- ${note}`);
    lines.push("", "```json");
    for (const ability of card.abilities) lines.push(JSON.stringify(ability));
    lines.push("```", "");
  }
  return lines.join("\n");
}

async function main() {
  const root = process.argv[2] ?? "catalog";
  const report = await dryRun(root);
  process.stdout.write(formatReport(report));
  if (report.unmapped.length) process.exitCode = 1;
}

if (process.argv[1]?.endsWith("migrate-rules-v2.ts")) void main();
