import { z } from "zod";

// The card DSL: authored rules AST, version 2 (docs/plans/dsl-redesign.md §4),
// the card definition file, and the card vocabulary every other shared
// module builds on (colors, mana types, zone kinds, characteristics). This
// module imports no other shared module.
// Types are written out explicitly because the families are mutually
// recursive; each schema is checked against its type with `satisfies`-style
// annotations (`z.ZodType<T>`).

export const colors = ["W", "U", "B", "R", "G"] as const;
export type Color = (typeof colors)[number];
export const manaTypes = [...colors, "C"] as const;
export type ManaType = (typeof manaTypes)[number];

export const zoneKinds = [
  "library",
  "hand",
  "graveyard",
  "battlefield",
  "stack",
  "exile",
  "command",
] as const;
export type ZoneKind = (typeof zoneKinds)[number];
const zone = z.enum(zoneKinds);

/** Card Characteristics (CR 109.3) as a definition and a Game Object hold them. */
export const characteristicSchema = z
  .object({
    name: z.string().min(1).max(200),
    manaCost: z.string().max(200).optional(),
    colors: z.array(z.enum(colors)).max(5).default([]),
    colorIndicator: z.array(z.enum(colors)).max(5).optional(),
    typeLine: z.string().max(400).default(""),
    manaValue: z.number().nonnegative().optional(),
    supertypes: z.array(z.string()).optional(),
    types: z.array(z.string()).optional(),
    subtypes: z.array(z.string()).optional(),
    keywords: z.array(z.string()).optional(),
    rulesText: z.string().max(8000).default(""),
    power: z.string().max(100).optional(),
    toughness: z.string().max(100).optional(),
    loyalty: z.string().max(100).optional(),
    defense: z.string().max(100).optional(),
  })
  .strict();
export type Characteristics = z.infer<typeof characteristicSchema>;

export const turnSteps = [
  "untap",
  "upkeep",
  "draw",
  "precombat-main",
  "begin-combat",
  "declare-attackers",
  "declare-blockers",
  "combat-damage",
  "end-combat",
  "postcombat-main",
  "end",
  "cleanup",
] as const;
export type TurnStep = (typeof turnSteps)[number];
/** The step after `step` in a turn; the cleanup step is the last. */
export function nextTurnStep(step: TurnStep): TurnStep | undefined {
  return turnSteps[turnSteps.indexOf(step) + 1];
}

export const statuses = [
  "tapped",
  "untapped",
  "attacking",
  "blocking",
  "attached",
] as const;
export type Status = (typeof statuses)[number];

/** Keywords the engine checks directly (§4.10). */
export const ruleKeywords = [
  "flying",
  "reach",
  "first strike",
  "double strike",
  "deathtouch",
  "lifelink",
  "trample",
  "haste",
  "vigilance",
  "defender",
  "indestructible",
  "hexproof",
  "flash",
] as const;
export type RuleKeyword = (typeof ruleKeywords)[number];

const id = z.string().min(1).max(200);
const label = z.string().min(1).max(500);
const amount = z.number().int().nonnegative().max(1000);
const manaSymbol = z.string().regex(/^\{(?:[WUBRGCX]|\d+)\}$/);

// ---------------------------------------------------------------- types

export type PlayerRef =
  | "you"
  | "opponents"
  | "each-player"
  | "active-player"
  | { target: string }
  | { controllerOf: Selector }
  | { ownerOf: Selector }
  | { event: "player" }
  | { binding: string };

export type Selector =
  | "source"
  | "target"
  | { target: string }
  | { all: Predicate }
  | { choose: Choice }
  | { binding: string }
  | { event: "object" | "source" | "player" }
  | { attachedTo: Selector }
  | { attachedBy: Selector }
  | { linked: string }
  | { attackedBy: Selector };

export interface Choice {
  chooser?: PlayerRef;
  from: Predicate;
  count: number | { min: number; max?: number };
}

export type Comparison =
  | Value
  | { "<": Value }
  | { "<=": Value }
  | { "=": Value }
  | { ">=": Value }
  | { ">": Value };

export interface PredicateFields {
  zone?: ZoneKind;
  object?: "card" | "spell" | "permanent" | "token" | "player";
  type?: string | string[];
  subtype?: string | string[];
  supertype?: string | string[];
  color?: Color | Color[] | "any" | "colorless";
  controller?: PlayerRef;
  owner?: PlayerRef;
  status?: Status | Status[];
  is?: Selector;
  manaValue?: Comparison;
  power?: Comparison;
  toughness?: Comparison;
  counters?: { kind: string; count: Comparison };
  dealtDamageBy?: Selector;
  player?: PlayerRef;
  anyTarget?: true;
}

export type Predicate =
  | { and: Predicate[] }
  | { or: Predicate[] }
  | { not: Predicate }
  | PredicateFields;

export type StatName = "power" | "toughness" | "manaValue";

export type Value =
  | number
  | { variable: "X" }
  | { binding: string }
  | { count: Selector }
  | { sum: Value[] }
  | { stat: { of: Selector; name: StatName } }
  | { greatest: { of: Selector; name: StatName } }
  | { cardsIn: { zone: ZoneKind; player: PlayerRef } }
  | { lifeTotal: PlayerRef }
  | { commanderColors: PlayerRef }
  | { eventAmount: true }
  | { if: Condition; then: Value; else: Value };

export const turnFacts = [
  "attacks",
  "casts",
  "draws",
  "gains-life",
  "loses-life",
  "land-played",
] as const;
export type TurnFact = (typeof turnFacts)[number];
export type Operator = "<" | "<=" | "=" | ">=" | ">";

export type Condition =
  | { and: Condition[] }
  | { or: Condition[] }
  | { not: Condition }
  | { compare: [Value, Operator, Value] }
  | { exists: Selector }
  | { matches: { selector: Selector; predicate: Predicate } }
  | { happened: { event: TurnFact; player?: PlayerRef; during: "this-turn" } }
  | { paid: string }
  | { monarch: PlayerRef }
  | { didPerform: string };

export interface TargetClause {
  id: string;
  count?: number | { min: number; max: number };
  filter: Predicate;
}

export interface Modes {
  choose: number | { min: number; max: number };
  options: {
    id: string;
    label: string;
    targets?: TargetClause[];
    effects: Effect[];
  }[];
}

export type Destination =
  | ZoneKind
  | {
      zone: ZoneKind;
      player?: PlayerRef;
      position?: "top" | "bottom";
      tapped?: true;
      controller?: PlayerRef;
    };

export type EventPattern =
  | { event: "would-enter"; object: Selector | Predicate }
  | { event: "would-gain-life"; player: PlayerRef }
  | { event: "would-draw"; player: PlayerRef }
  | { event: "would-be-dealt-damage"; recipient: Selector | Predicate }
  | { event: "leaves-battlefield"; object: Selector };

export type Duration =
  "end-of-turn" | "while-source-on-battlefield" | { until: EventPattern };

export type Cost =
  | { kind: "mana"; symbols: string[] }
  | { kind: "tap-source" }
  | { kind: "untap-source" }
  | { kind: "sacrifice-source" }
  | { kind: "discard-source" }
  | { kind: "exile-source" }
  | { kind: "life"; amount: Value }
  | {
      kind: "counter-source";
      counter: string;
      count: number;
      operation: "put" | "remove";
    }
  | {
      kind: "tap" | "sacrifice" | "discard" | "return" | "exile";
      count: number;
      filter: Predicate;
    }
  | { kind: "tap-total-power"; power: number; filter: Predicate };

export type MacroKeyword =
  | { name: "affinity"; for: Predicate }
  | { name: "ward"; costs: Cost[] }
  | { name: "cycling"; costs: Cost[] }
  | { name: "equip"; costs: Cost[] }
  | { name: "crew"; power: number }
  | { name: "enchant"; filter: Predicate }
  | { name: "improvise" }
  | { name: "kicker"; costs: Cost[] }
  | { name: "escalate"; costs: Cost[] }
  | { name: "flashback"; costs: Cost[] }
  | { name: "living-weapon" };
export type Keyword = RuleKeyword | MacroKeyword;

/** CR 613 layers; the compiler tags every continuous change (§4.9). */
export type Layer =
  "1" | "2" | "3" | "4" | "5" | "6" | "7a" | "7b" | "7c" | "7d";

export type ContinuousChange = { layer?: Layer[] } & (
  | { kind: "add-types"; types?: string[]; subtypes?: string[] }
  | { kind: "set-base-stats"; power: Value; toughness: Value }
  | { kind: "add-stats"; power: Value; toughness: Value }
  | { kind: "define-stats"; power: Value; toughness: Value }
  | { kind: "grant-keyword"; keyword: RuleKeyword }
  | { kind: "gain-control"; player: PlayerRef }
  | { kind: "copy-linked"; link: string; retainSubtypes: string[] }
);

export type StaticGrant =
  | { kind: "continuous"; objects: Selector; changes: ContinuousChange[] }
  | {
      kind: "cost-modifier";
      applies: "this" | { spells: Predicate } | { abilitiesOf: Selector };
      reduce?: Value;
      increase?: Value;
      condition?: Condition;
    }
  | { kind: "cast-timing"; spells: Predicate; as: "flash" }
  | { kind: "play-permission"; objects: Selector; duration: Duration }
  | {
      kind: "maximum-hand-size";
      player: PlayerRef;
      value: Value | "unlimited";
    }
  | { kind: "attack-tax"; defender: PlayerRef; costPerAttacker: Cost[] }
  | { kind: "block-tax"; costPerBlocker: Cost[] }
  | { kind: "attack-requirement"; objects: Selector }
  | { kind: "block-restriction"; objects: Selector; by?: Predicate }
  | { kind: "cant-block"; objects: Selector }
  | { kind: "cant-be-countered"; spells: "this" | Predicate }
  | { kind: "untap-restriction"; objects: Selector; unless?: Condition };

export type Trigger =
  | {
      event: "zone-change";
      object: Selector | Predicate;
      from?: ZoneKind;
      to?: ZoneKind;
      during?: TurnStep;
    }
  | { event: "enters"; object: Selector | Predicate; during?: TurnStep }
  | { event: "dies"; object: Selector | Predicate }
  | { event: "cast"; spell: Predicate; caster?: PlayerRef }
  | { event: "attacks"; attacker: Selector | Predicate }
  | {
      event: "deals-damage";
      source: Selector | Predicate;
      to?: "player" | "object" | Predicate;
      combat?: boolean;
      batch?: "one-or-more";
    }
  | { event: "draws"; player: PlayerRef; nth?: number }
  | { event: "step"; step: TurnStep; player?: PlayerRef | "next" }
  | { event: "becomes-target"; object: Selector | Predicate; by?: PlayerRef }
  | { event: "gains-life"; player: PlayerRef }
  | { event: "loses-life"; player: PlayerRef }
  | { event: "state"; condition: Condition };

export interface ManaTrigger {
  event: "tapped-for-mana";
  object: Predicate;
  produced?: ManaType;
}

export interface ManaProduction {
  quantity: number;
  colors: ManaType[] | { commanderColors: PlayerRef };
  restriction?: { use?: "cast" | "activate"; spellTypes?: string[] };
}

type Bind = { bind?: string };
export type Effect = Bind &
  (
    | { kind: "move"; objects: Selector; to: Destination }
    | { kind: "destroy"; objects: Selector }
    | { kind: "sacrifice"; objects: Selector }
    | {
        kind: "exile";
        objects: Selector;
        until?: EventPattern;
        linkAs?: string;
      }
    | { kind: "counter"; objects: Selector }
    | {
        kind: "library-sequence";
        player: PlayerRef;
        count: Value;
        operation: "look" | "reveal";
        select?: {
          filter?: Predicate;
          max: number;
          to: Destination;
          reveal?: boolean;
        };
        rest: { to: Destination; order: "random" | "any" | "keep" };
      }
    | { kind: "scry"; player?: PlayerRef; count: Value }
    | {
        kind: "search";
        player: PlayerRef;
        zone: "library";
        filter: Predicate;
        count: { min: number; max: number };
        to: Destination;
      }
    | { kind: "shuffle"; player: PlayerRef }
    | { kind: "draw"; player?: PlayerRef; count: Value }
    | { kind: "discard"; player?: PlayerRef; count: Value; filter?: Predicate }
    | { kind: "gain-life"; player?: PlayerRef; amount: Value }
    | { kind: "lose-life"; player: PlayerRef; amount: Value }
    | { kind: "become-monarch"; player: PlayerRef }
    | {
        kind: "damage";
        amount: Value;
        to: Selector | PlayerRef;
        source?: Selector;
      }
    | { kind: "tap"; objects: Selector }
    | { kind: "untap"; objects: Selector }
    | { kind: "add-counters"; objects: Selector; counter: string; count: Value }
    | {
        kind: "remove-counters";
        objects: Selector;
        counter: string;
        count: Value;
      }
    | { kind: "attach"; object?: Selector; to: Selector }
    | {
        kind: "create-token";
        token: string;
        count?: Value;
        controller?: PlayerRef;
        tapped?: true;
      }
    | {
        kind: "apply-continuous";
        objects: Selector;
        changes: ContinuousChange[];
        duration: Duration;
      }
    | { kind: "apply-grant"; grant: StaticGrant; duration: Duration }
    | { kind: "reselect-defender"; attacker: Selector }
    | { kind: "create-delayed-trigger"; trigger: Trigger; effects: Effect[] }
    | { kind: "sequence"; effects: Effect[] }
    | { kind: "if"; condition: Condition; then: Effect[]; else?: Effect[] }
    | { kind: "may"; player?: PlayerRef; effects: Effect[] }
    | {
        kind: "may-pay";
        player?: PlayerRef;
        costs: Cost[];
        then?: Effect[];
        else?: Effect[];
      }
    | {
        kind: "choose-one";
        chooser?: PlayerRef;
        options: {
          id: string;
          label: string;
          available?: Condition;
          effects: Effect[];
        }[];
      }
    | {
        kind: "for-each-player";
        players: PlayerRef;
        order: "APNAP";
        effects: Effect[];
      }
  );

export type Replacement =
  | { kind: "enter-tapped" }
  | { kind: "modify-amount"; add: Value }
  | { kind: "prevent" }
  | { kind: "instead"; effects: Effect[] };

interface AbilityBase {
  id: string;
  origin?: "printed" | "granted";
  description?: string;
}
export interface SpellAbility extends AbilityBase {
  kind: "spell";
  targets?: TargetClause[];
  modes?: Modes;
  effects?: Effect[];
}
export interface ActivatedAbility extends AbilityBase {
  kind: "activated";
  costs: Cost[];
  timing?: "sorcery";
  limit?: { perTurn: number };
  activeFrom?: ZoneKind;
  targets?: TargetClause[];
  modes?: Modes;
  effects?: Effect[];
}
export interface ManaAbility extends AbilityBase {
  kind: "mana";
  activation: { costs: Cost[] } | { trigger: ManaTrigger };
  produce: ManaProduction;
}
export interface TriggeredAbility extends AbilityBase {
  kind: "triggered";
  trigger: Trigger;
  interveningIf?: Condition;
  targets?: TargetClause[];
  modes?: Modes;
  effects?: Effect[];
}
export interface StaticAbility extends AbilityBase {
  kind: "static";
  activeFrom?: ZoneKind;
  condition?: Condition;
  characteristicDefining?: true;
  grants: StaticGrant[];
}
export interface ReplacementAbility extends AbilityBase {
  kind: "replacement";
  activeFrom?: ZoneKind;
  event: EventPattern;
  replace: Replacement;
}
export interface KeywordAbility extends AbilityBase {
  kind: "keyword";
  keyword: Keyword;
}
export type Ability =
  | SpellAbility
  | ActivatedAbility
  | ManaAbility
  | TriggeredAbility
  | StaticAbility
  | ReplacementAbility
  | KeywordAbility;

// -------------------------------------------------------------- schemas

const strict = <T extends z.ZodRawShape>(shape: T) => z.object(shape).strict();
const oneOrMany = <T extends z.ZodType>(item: T) =>
  z.union([item, z.array(item).min(1).max(20)]);

export const playerRefSchema: z.ZodType<PlayerRef> = z.lazy(() =>
  z.union([
    z.enum(["you", "opponents", "each-player", "active-player"]),
    strict({ target: id }),
    strict({ controllerOf: selectorSchema }),
    strict({ ownerOf: selectorSchema }),
    strict({ event: z.literal("player") }),
    strict({ binding: id }),
  ]),
);

export const selectorSchema: z.ZodType<Selector> = z.lazy(() =>
  z.union([
    z.enum(["source", "target"]),
    strict({ target: id }),
    strict({ all: predicateSchema }),
    strict({ choose: choiceSchema }),
    strict({ binding: id }),
    strict({ event: z.enum(["object", "source", "player"]) }),
    strict({ attachedTo: selectorSchema }),
    strict({ attachedBy: selectorSchema }),
    strict({ linked: id }),
    strict({ attackedBy: selectorSchema }),
  ]),
);

const countSchema = z.union([
  amount,
  strict({ min: amount, max: amount.optional() }),
]);

export const choiceSchema: z.ZodType<Choice> = z.lazy(() =>
  strict({
    chooser: playerRefSchema.optional(),
    from: predicateSchema,
    count: countSchema,
  }),
);

export const comparisonSchema: z.ZodType<Comparison> = z.lazy(() =>
  z.union([
    valueSchema,
    strict({ "<": valueSchema }),
    strict({ "<=": valueSchema }),
    strict({ "=": valueSchema }),
    strict({ ">=": valueSchema }),
    strict({ ">": valueSchema }),
  ]),
);

const predicateFieldsSchema: z.ZodType<PredicateFields> = z.lazy(() =>
  strict({
    zone: zone.optional(),
    object: z
      .enum(["card", "spell", "permanent", "token", "player"])
      .optional(),
    type: oneOrMany(z.string().min(1)).optional(),
    subtype: oneOrMany(z.string().min(1)).optional(),
    supertype: oneOrMany(z.string().min(1)).optional(),
    color: z
      .union([z.enum(colors), z.array(z.enum(colors)).min(1)])
      .or(z.enum(["any", "colorless"]))
      .optional(),
    controller: playerRefSchema.optional(),
    owner: playerRefSchema.optional(),
    status: oneOrMany(z.enum(statuses)).optional(),
    is: selectorSchema.optional(),
    manaValue: comparisonSchema.optional(),
    power: comparisonSchema.optional(),
    toughness: comparisonSchema.optional(),
    counters: strict({
      kind: z.string().min(1),
      count: comparisonSchema,
    }).optional(),
    dealtDamageBy: selectorSchema.optional(),
    player: playerRefSchema.optional(),
    anyTarget: z.literal(true).optional(),
  }),
);

export const predicateSchema: z.ZodType<Predicate> = z.lazy(() =>
  z.union([
    strict({ and: z.array(predicateSchema).min(1).max(20) }),
    strict({ or: z.array(predicateSchema).min(1).max(20) }),
    strict({ not: predicateSchema }),
    predicateFieldsSchema,
  ]),
);

const statName = z.enum(["power", "toughness", "manaValue"]);

export const valueSchema: z.ZodType<Value> = z.lazy(() =>
  z.union([
    amount,
    strict({ variable: z.literal("X") }),
    strict({ binding: id }),
    strict({ count: selectorSchema }),
    strict({ sum: z.array(valueSchema).min(1).max(20) }),
    strict({ stat: strict({ of: selectorSchema, name: statName }) }),
    strict({ greatest: strict({ of: selectorSchema, name: statName }) }),
    strict({ cardsIn: strict({ zone, player: playerRefSchema }) }),
    strict({ lifeTotal: playerRefSchema }),
    strict({ commanderColors: playerRefSchema }),
    strict({ eventAmount: z.literal(true) }),
    strict({ if: conditionSchema, then: valueSchema, else: valueSchema }),
  ]),
);

const operator = z.enum(["<", "<=", "=", ">=", ">"]);

export const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    strict({ and: z.array(conditionSchema).min(1).max(20) }),
    strict({ or: z.array(conditionSchema).min(1).max(20) }),
    strict({ not: conditionSchema }),
    strict({ compare: z.tuple([valueSchema, operator, valueSchema]) }),
    strict({ exists: selectorSchema }),
    strict({
      matches: strict({ selector: selectorSchema, predicate: predicateSchema }),
    }),
    strict({
      happened: strict({
        event: z.enum(turnFacts),
        player: playerRefSchema.optional(),
        during: z.literal("this-turn"),
      }),
    }),
    strict({ paid: id }),
    strict({ monarch: playerRefSchema }),
    strict({ didPerform: id }),
  ]),
);

const targetCount = z.union([
  z.number().int().positive().max(100),
  strict({ min: amount, max: z.number().int().positive().max(100) }),
]);

export const targetClauseSchema: z.ZodType<TargetClause> = z.lazy(() =>
  strict({
    id,
    count: targetCount.optional(),
    filter: predicateSchema,
  }),
);

export const modesSchema: z.ZodType<Modes> = z.lazy(() =>
  strict({
    choose: targetCount,
    options: z
      .array(
        strict({
          id,
          label,
          targets: z.array(targetClauseSchema).max(10).optional(),
          effects: z.array(effectSchema).min(1).max(100),
        }),
      )
      .min(2)
      .max(10),
  }),
);

export const destinationSchema: z.ZodType<Destination> = z.lazy(() =>
  z.union([
    zone,
    strict({
      zone,
      player: playerRefSchema.optional(),
      position: z.enum(["top", "bottom"]).optional(),
      tapped: z.literal(true).optional(),
      controller: playerRefSchema.optional(),
    }),
  ]),
);

const selectorOrPredicate = z.lazy(() =>
  z.union([selectorSchema, predicateSchema]),
);

export const eventPatternSchema: z.ZodType<EventPattern> = z.lazy(() =>
  z.union([
    strict({ event: z.literal("would-enter"), object: selectorOrPredicate }),
    strict({ event: z.literal("would-gain-life"), player: playerRefSchema }),
    strict({ event: z.literal("would-draw"), player: playerRefSchema }),
    strict({
      event: z.literal("would-be-dealt-damage"),
      recipient: selectorOrPredicate,
    }),
    strict({ event: z.literal("leaves-battlefield"), object: selectorSchema }),
  ]),
);

export const durationSchema: z.ZodType<Duration> = z.lazy(() =>
  z.union([
    z.enum(["end-of-turn", "while-source-on-battlefield"]),
    strict({ until: eventPatternSchema }),
  ]),
);

export const costSchema: z.ZodType<Cost> = z.lazy(
  () =>
    z.union([
      strict({
        kind: z.literal("mana"),
        symbols: z.array(manaSymbol).min(1).max(100),
      }),
      strict({
        kind: z.enum([
          "tap-source",
          "untap-source",
          "sacrifice-source",
          "discard-source",
          "exile-source",
        ]),
      }),
      strict({ kind: z.literal("life"), amount: valueSchema }),
      strict({
        kind: z.literal("counter-source"),
        counter: z.string().min(1),
        count: z.number().int().positive().max(100),
        operation: z.enum(["put", "remove"]),
      }),
      strict({
        kind: z.enum(["tap", "sacrifice", "discard", "return", "exile"]),
        count: z.number().int().positive().max(100),
        filter: predicateSchema,
      }),
      strict({
        kind: z.literal("tap-total-power"),
        power: z.number().int().positive().max(100),
        filter: predicateSchema,
      }),
    ]) as z.ZodType<Cost>,
);

const costs = z.lazy(() => z.array(costSchema).min(1).max(20));

export const keywordSchema: z.ZodType<Keyword> = z.lazy(
  () =>
    z.union([
      z.enum(ruleKeywords),
      strict({ name: z.literal("affinity"), for: predicateSchema }),
      strict({
        name: z.enum([
          "ward",
          "cycling",
          "equip",
          "kicker",
          "escalate",
          "flashback",
        ]),
        costs,
      }),
      strict({
        name: z.literal("crew"),
        power: z.number().int().positive().max(100),
      }),
      strict({ name: z.literal("enchant"), filter: predicateSchema }),
      strict({ name: z.enum(["improvise", "living-weapon"]) }),
    ]) as z.ZodType<Keyword>,
);

const statsChange = <K extends string>(kind: K) =>
  strict({ kind: z.literal(kind), power: valueSchema, toughness: valueSchema });

export const continuousChangeSchema: z.ZodType<ContinuousChange> = z.lazy(() =>
  z.union([
    strict({
      kind: z.literal("add-types"),
      types: z.array(z.string().min(1)).min(1).optional(),
      subtypes: z.array(z.string().min(1)).min(1).optional(),
    }),
    statsChange("set-base-stats"),
    statsChange("add-stats"),
    statsChange("define-stats"),
    strict({
      kind: z.literal("grant-keyword"),
      keyword: z.enum(ruleKeywords),
    }),
    strict({ kind: z.literal("gain-control"), player: playerRefSchema }),
    strict({
      kind: z.literal("copy-linked"),
      link: id,
      retainSubtypes: z.array(z.string().min(1)),
    }),
  ]),
);

const changes = z.lazy(() => z.array(continuousChangeSchema).min(1).max(20));

export const staticGrantSchema: z.ZodType<StaticGrant> = z.lazy(() =>
  z.union([
    strict({ kind: z.literal("continuous"), objects: selectorSchema, changes }),
    strict({
      kind: z.literal("cost-modifier"),
      applies: z.union([
        z.literal("this"),
        strict({ spells: predicateSchema }),
        strict({ abilitiesOf: selectorSchema }),
      ]),
      reduce: valueSchema.optional(),
      increase: valueSchema.optional(),
      condition: conditionSchema.optional(),
    }),
    strict({
      kind: z.literal("cast-timing"),
      spells: predicateSchema,
      as: z.literal("flash"),
    }),
    strict({
      kind: z.literal("play-permission"),
      objects: selectorSchema,
      duration: durationSchema,
    }),
    strict({
      kind: z.literal("maximum-hand-size"),
      player: playerRefSchema,
      value: z.union([valueSchema, z.literal("unlimited")]),
    }),
    strict({
      kind: z.literal("attack-tax"),
      defender: playerRefSchema,
      costPerAttacker: costs,
    }),
    strict({ kind: z.literal("block-tax"), costPerBlocker: costs }),
    strict({ kind: z.literal("attack-requirement"), objects: selectorSchema }),
    strict({
      kind: z.literal("block-restriction"),
      objects: selectorSchema,
      by: predicateSchema.optional(),
    }),
    strict({ kind: z.literal("cant-block"), objects: selectorSchema }),
    strict({
      kind: z.literal("cant-be-countered"),
      spells: z.union([z.literal("this"), predicateSchema]),
    }),
    strict({
      kind: z.literal("untap-restriction"),
      objects: selectorSchema,
      unless: conditionSchema.optional(),
    }),
  ]),
);

export const triggerSchema: z.ZodType<Trigger> = z.lazy(
  () =>
    z.union([
      strict({
        event: z.literal("zone-change"),
        object: selectorOrPredicate,
        from: zone.optional(),
        to: zone.optional(),
        during: z.enum(turnSteps).optional(),
      }),
      strict({
        event: z.literal("enters"),
        object: selectorOrPredicate,
        during: z.enum(turnSteps).optional(),
      }),
      strict({ event: z.literal("dies"), object: selectorOrPredicate }),
      strict({
        event: z.literal("cast"),
        spell: predicateSchema,
        caster: playerRefSchema.optional(),
      }),
      strict({ event: z.literal("attacks"), attacker: selectorOrPredicate }),
      strict({
        event: z.literal("deals-damage"),
        source: selectorOrPredicate,
        to: z.union([z.enum(["player", "object"]), predicateSchema]).optional(),
        combat: z.boolean().optional(),
        batch: z.literal("one-or-more").optional(),
      }),
      strict({
        event: z.literal("draws"),
        player: playerRefSchema,
        nth: z.number().int().positive().max(100).optional(),
      }),
      strict({
        event: z.literal("step"),
        step: z.enum(turnSteps),
        player: z.union([playerRefSchema, z.literal("next")]).optional(),
      }),
      strict({
        event: z.literal("becomes-target"),
        object: selectorOrPredicate,
        by: playerRefSchema.optional(),
      }),
      strict({
        event: z.enum(["gains-life", "loses-life"]),
        player: playerRefSchema,
      }),
      strict({ event: z.literal("state"), condition: conditionSchema }),
    ]) as z.ZodType<Trigger>,
);

export const manaTriggerSchema: z.ZodType<ManaTrigger> = z.lazy(() =>
  strict({
    event: z.literal("tapped-for-mana"),
    object: predicateSchema,
    produced: z.enum(manaTypes).optional(),
  }),
);

export const manaProductionSchema: z.ZodType<ManaProduction> = z.lazy(() =>
  strict({
    quantity: z.number().int().positive().max(1000),
    colors: z.union([
      z.array(z.enum(manaTypes)).min(1).max(6),
      strict({ commanderColors: playerRefSchema }),
    ]),
    restriction: strict({
      use: z.enum(["cast", "activate"]).optional(),
      spellTypes: z.array(z.string().min(1)).min(1).optional(),
    }).optional(),
  }),
);

const effects = z.lazy(() => z.array(effectSchema).min(1).max(100));
const optionalEffects = z.lazy(() => z.array(effectSchema).max(100));
const bind = { bind: id.optional() };
const kind = <K extends string>(k: K) => z.literal(k);

export const effectSchema: z.ZodType<Effect> = z.lazy(
  () =>
    z.union([
      strict({
        ...bind,
        kind: kind("move"),
        objects: selectorSchema,
        to: destinationSchema,
      }),
      strict({
        ...bind,
        kind: z.enum(["destroy", "sacrifice", "counter", "tap", "untap"]),
        objects: selectorSchema,
      }),
      strict({
        ...bind,
        kind: kind("exile"),
        objects: selectorSchema,
        until: eventPatternSchema.optional(),
        linkAs: id.optional(),
      }),
      strict({
        ...bind,
        kind: kind("library-sequence"),
        player: playerRefSchema,
        count: valueSchema,
        operation: z.enum(["look", "reveal"]),
        select: strict({
          filter: predicateSchema.optional(),
          max: z.number().int().positive().max(100),
          to: destinationSchema,
          reveal: z.boolean().optional(),
        }).optional(),
        rest: strict({
          to: destinationSchema,
          order: z.enum(["random", "any", "keep"]),
        }),
      }),
      strict({
        ...bind,
        kind: kind("scry"),
        player: playerRefSchema.optional(),
        count: valueSchema,
      }),
      strict({
        ...bind,
        kind: kind("search"),
        player: playerRefSchema,
        zone: z.literal("library"),
        filter: predicateSchema,
        count: strict({
          min: amount,
          max: z.number().int().positive().max(100),
        }),
        to: destinationSchema,
      }),
      strict({ ...bind, kind: kind("shuffle"), player: playerRefSchema }),
      strict({
        ...bind,
        kind: kind("draw"),
        player: playerRefSchema.optional(),
        count: valueSchema,
      }),
      strict({
        ...bind,
        kind: kind("discard"),
        player: playerRefSchema.optional(),
        count: valueSchema,
        filter: predicateSchema.optional(),
      }),
      strict({
        ...bind,
        kind: kind("gain-life"),
        player: playerRefSchema.optional(),
        amount: valueSchema,
      }),
      strict({
        ...bind,
        kind: kind("lose-life"),
        player: playerRefSchema,
        amount: valueSchema,
      }),
      strict({
        ...bind,
        kind: kind("become-monarch"),
        player: playerRefSchema,
      }),
      strict({
        ...bind,
        kind: kind("damage"),
        amount: valueSchema,
        to: z.union([selectorSchema, playerRefSchema]),
        source: selectorSchema.optional(),
      }),
      strict({
        ...bind,
        kind: z.enum(["add-counters", "remove-counters"]),
        objects: selectorSchema,
        counter: z.string().min(1),
        count: valueSchema,
      }),
      strict({
        ...bind,
        kind: kind("attach"),
        object: selectorSchema.optional(),
        to: selectorSchema,
      }),
      strict({
        ...bind,
        kind: kind("create-token"),
        token: id,
        count: valueSchema.optional(),
        controller: playerRefSchema.optional(),
        tapped: z.literal(true).optional(),
      }),
      strict({
        ...bind,
        kind: kind("apply-continuous"),
        objects: selectorSchema,
        changes,
        duration: durationSchema,
      }),
      strict({
        ...bind,
        kind: kind("apply-grant"),
        grant: staticGrantSchema,
        duration: durationSchema,
      }),
      strict({
        ...bind,
        kind: kind("reselect-defender"),
        attacker: selectorSchema,
      }),
      strict({
        ...bind,
        kind: kind("create-delayed-trigger"),
        trigger: triggerSchema,
        effects,
      }),
      strict({ ...bind, kind: kind("sequence"), effects }),
      strict({
        ...bind,
        kind: kind("if"),
        condition: conditionSchema,
        then: optionalEffects,
        else: optionalEffects.optional(),
      }),
      strict({
        ...bind,
        kind: kind("may"),
        player: playerRefSchema.optional(),
        effects,
      }),
      strict({
        ...bind,
        kind: kind("may-pay"),
        player: playerRefSchema.optional(),
        costs,
        then: optionalEffects.optional(),
        else: optionalEffects.optional(),
      }),
      strict({
        ...bind,
        kind: kind("choose-one"),
        chooser: playerRefSchema.optional(),
        options: z
          .array(
            strict({
              id,
              label,
              available: conditionSchema.optional(),
              effects,
            }),
          )
          .min(2)
          .max(10),
      }),
      strict({
        ...bind,
        kind: kind("for-each-player"),
        players: playerRefSchema,
        order: z.literal("APNAP"),
        effects,
      }),
    ]) as z.ZodType<Effect>,
);

export const replacementSchema: z.ZodType<Replacement> = z.lazy(
  () =>
    z.union([
      strict({ kind: z.enum(["enter-tapped", "prevent"]) }),
      strict({ kind: z.literal("modify-amount"), add: valueSchema }),
      strict({ kind: z.literal("instead"), effects }),
    ]) as z.ZodType<Replacement>,
);

const abilityBase = {
  id,
  origin: z.enum(["printed", "granted"]).optional(),
  description: z.string().trim().min(1).max(2000).optional(),
};
const targets = z.lazy(() => z.array(targetClauseSchema).min(1).max(10));

export const abilitySchema: z.ZodType<Ability> = z.lazy(
  () =>
    z.discriminatedUnion("kind", [
      strict({
        ...abilityBase,
        kind: z.literal("spell"),
        targets: targets.optional(),
        modes: modesSchema.optional(),
        effects: effects.optional(),
      }),
      strict({
        ...abilityBase,
        kind: z.literal("activated"),
        costs: z.array(costSchema).max(20),
        timing: z.literal("sorcery").optional(),
        limit: strict({
          perTurn: z.number().int().positive().max(10),
        }).optional(),
        activeFrom: zone.optional(),
        targets: targets.optional(),
        modes: modesSchema.optional(),
        effects: effects.optional(),
      }),
      strict({
        ...abilityBase,
        kind: z.literal("mana"),
        activation: z.union([
          strict({ costs: z.array(costSchema).max(20) }),
          strict({ trigger: manaTriggerSchema }),
        ]),
        produce: manaProductionSchema,
      }),
      strict({
        ...abilityBase,
        kind: z.literal("triggered"),
        trigger: triggerSchema,
        interveningIf: conditionSchema.optional(),
        targets: targets.optional(),
        modes: modesSchema.optional(),
        effects: effects.optional(),
      }),
      strict({
        ...abilityBase,
        kind: z.literal("static"),
        activeFrom: zone.optional(),
        condition: conditionSchema.optional(),
        characteristicDefining: z.literal(true).optional(),
        grants: z.array(staticGrantSchema).min(1).max(20),
      }),
      strict({
        ...abilityBase,
        kind: z.literal("replacement"),
        activeFrom: zone.optional(),
        event: eventPatternSchema,
        replace: replacementSchema,
      }),
      strict({
        ...abilityBase,
        kind: z.literal("keyword"),
        keyword: keywordSchema,
      }),
    ]) as z.ZodType<Ability>,
);

// ------------------------------------------------- definition file (CM §3)

/** Scryfall layouts the importer accepts (catalog.service.ts supportedLayouts). */
export const cardForms = [
  "normal",
  "saga",
  "transform",
  "modal_dfc",
  "split",
  "reversible_card",
  "room",
  "flip",
] as const;
export type CardForm = (typeof cardForms)[number];

export const componentSchema = characteristicSchema
  .omit({ typeLine: true })
  .extend({
    supertypes: z.array(z.string()).default([]),
    types: z.array(z.string()).default([]),
    subtypes: z.array(z.string()).default([]),
    keywords: z.array(z.string()).default([]),
  });
export type ComponentCharacteristics = z.infer<typeof componentSchema>;

export const cardDefinitionFileSchema = strict({
  catalogVersion: z.literal(2),
  id: z.uuid(),
  imported: strict({
    form: z.enum(cardForms),
    components: z.array(componentSchema).min(1).max(4),
    colorIdentity: z.array(z.enum(colors)),
    defaultPrintingId: z.uuid(),
  }),
  authored: strict({
    automationStatus: z.enum(["unimplemented", "implemented"]),
    abilities: z.array(abilitySchema).max(50),
  }),
});
export type CardDefinitionFile = z.infer<typeof cardDefinitionFileSchema>;
