import { z } from "zod";
import type { Effect } from "./rules-v2.js";

export const manaTypes = ["W", "U", "B", "R", "G", "C"] as const;
export type ManaType = (typeof manaTypes)[number];
export type ManaPool = Record<ManaType, number>;
export const manaRestrictionSchema = z
  .object({
    use: z.enum(["cast", "activate"]).optional(),
    spellTypes: z.array(z.string().min(1)).min(1).optional(),
  })
  .strict();
export interface RestrictedMana {
  type: ManaType;
  amount: number;
  restriction: z.infer<typeof manaRestrictionSchema>;
}
export const objectFilterSchema = z
  .object({
    zone: z.enum([
      "battlefield",
      "hand",
      "stack",
      "graveyard",
      "exile",
      "library",
    ]),
    kind: z.enum(["card", "spell", "permanent"]).optional(),
    subtypes: z.array(z.string().min(1)).optional(),
    allTypes: z.array(z.string().min(1)).optional(),
    self: z.enum(["only", "exclude"]).optional(),
    controller: z.enum(["you", "opponent"]).optional(),
    owner: z.enum(["you", "opponent"]).optional(),
    nontoken: z.boolean().optional(),
    colored: z.boolean().optional(),
    colorless: z.boolean().optional(),
    attached: z.boolean().optional(),
    types: z.array(z.string().min(1)).optional(),
    excludeTypes: z.array(z.string().min(1)).optional(),
    untapped: z.boolean().optional(),
    attacking: z.boolean().optional(),
    manaValue: z.lazy(() => valueSchema).optional(),
    damagedBySource: z.boolean().optional(),
  })
  .strict();
export type ObjectFilter = z.infer<typeof objectFilterSchema>;
const quantitySchema = z.union([
  z.number().int().nonnegative().max(1000),
  z.literal("commander-colors"),
]);
export const rulesCostSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("crew"),
      power: z.number().int().positive(),
      filter: objectFilterSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("mana"),
      symbols: z.array(z.string().regex(/^\{(?:[WUBRGCX]|\d+)\}$/)).max(100),
    })
    .strict(),
  z.object({ kind: z.literal("tap-source") }).strict(),
  z.object({ kind: z.literal("sacrifice-source") }).strict(),
  z.object({ kind: z.literal("discard-source") }).strict(),
  z.object({ kind: z.literal("life"), amount: quantitySchema }).strict(),
  z
    .object({
      kind: z.literal("counter-source"),
      counter: z.string().min(1),
      count: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      kind: z.enum(["tap", "sacrifice", "discard", "return"]),
      count: z.number().int().min(1).max(100),
      filter: objectFilterSchema,
    })
    .strict(),
]);
export type RulesValue =
  | number
  | { binding: string }
  | { count: ObjectFilter }
  | { sum: RulesValue[] }
  | { handSize: "you" }
  | { greatestManaValue: ObjectFilter };
export const valueSchema: z.ZodType<RulesValue> = z.lazy(() =>
  z.union([
    z.number().int().nonnegative().max(1000),
    z.object({ binding: z.string().min(1) }).strict(),
    z.object({ handSize: z.literal("you") }).strict(),
    z.object({ greatestManaValue: objectFilterSchema }).strict(),
    z.object({ count: objectFilterSchema }).strict(),
    z.object({ sum: z.array(valueSchema).min(1).max(20) }).strict(),
  ]),
);
export const supportedKeywordSchema = z.enum([
  "Flying",
  "Reach",
  "Flash",
  "Hexproof",
  "Indestructible",
  "Haste",
  "Vigilance",
  "Unblockable",
  "Must attack",
  "Cannot be blocked by Walls",
  "Defender",
]);
export const continuousChangeSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("add-types"),
      types: z.array(z.string()).optional(),
      subtypes: z.array(z.string()).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("set-stats"),
      power: valueSchema,
      toughness: valueSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("grant-keyword"),
      keyword: supportedKeywordSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("linked-characteristics"),
      link: z.string().min(1),
      retainSubtypes: z.array(z.string()),
    })
    .strict(),
  z
    .object({
      kind: z.literal("define-stats"),
      power: valueSchema,
      toughness: valueSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("add-stats"),
      power: valueSchema,
      toughness: valueSchema,
    })
    .strict(),
]);
export type ContinuousChange = z.infer<typeof continuousChangeSchema>;
export interface ActiveContinuousEffect {
  sourceId: string;
  abilityId: string;
  playerId: string;
  filter: ObjectFilter;
  changes: ContinuousChange[];
  applicability:
    "source-on-battlefield" | "characteristic-defining" | "until-end-of-turn";
}
export const conditionSchema = z
  .object({
    value: valueSchema,
    atLeast: valueSchema,
    requireObjects: objectFilterSchema.optional(),
  })
  .strict();

/** What a mana ability adds (DSL v2 `produce`, lowered). */
export const manaProductionSchema = z
  .object({
    quantity: z.number().int().min(1).max(1000),
    colors: z.union([
      z.array(z.enum(manaTypes)).min(1).max(6),
      z.literal("commander-colors"),
    ]),
    restriction: manaRestrictionSchema.optional(),
  })
  .strict();
export type ManaProduction = z.infer<typeof manaProductionSchema>;

/**
 * The runtime ability the engine executes, as the down-compiler emits it
 * (dsl-redesign.md §9 step 3). The Rules Compiler validates authored
 * abilities; this schema only checks the shape and fills defaults. `effects`
 * are Core AST effects, run by the effect handlers (rules-engine-refactor.md
 * §34); the compiler has validated them, so they are not parsed again here.
 */
export const rulesAbilitySchema = z
  .object({
    improvise: z.boolean().optional(),
    aura: objectFilterSchema.optional(),
    monarchUntap: z.boolean().optional(),
    attackCost: z
      .object({
        symbols: z.array(z.string().regex(/^\{(?:[WUBRGC]|\d+)\}$/)).min(1),
      })
      .strict()
      .optional(),
    keyword: supportedKeywordSchema.optional(),
    maximumHandSize: z.literal("unlimited").optional(),
    oncePerTurn: z.boolean().optional(),
    intervening: conditionSchema.optional(),
    castingPermission: objectFilterSchema.optional(),
    timing: z.literal("sorcery").optional(),
    chosenVariables: z.array(z.literal("X")).max(1).optional(),
    costs: z.array(rulesCostSchema).max(100).default([]),
    effects: z
      .array(z.custom<Effect>((value) => typeof value === "object"))
      .max(100)
      .default([]),
    produce: manaProductionSchema.optional(),
    entersTapped: z.boolean().optional(),
    cantBeCountered: z.boolean().optional(),
    costModifiers: z
      .array(
        z
          .object({
            use: z.enum(["cast", "activate"]),
            scope: z.enum(["source", "controller"]),
            component: z.literal("generic"),
            filter: objectFilterSchema.optional(),
            amount: valueSchema,
          })
          .strict(),
      )
      .max(20)
      .optional(),
    continuous: z
      .object({
        filter: objectFilterSchema,
        changes: z.array(continuousChangeSchema).min(1).max(20),
        characteristicDefining: z.boolean().optional(),
        condition: z
          .object({
            value: valueSchema,
            atLeast: z.number().int().nonnegative(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    target: objectFilterSchema.optional(),
    trigger: z
      .object({
        event: z.enum([
          "enter",
          "cast",
          "dies",
          "state",
          "damage",
          "attack",
          "draw",
          "upkeep",
          "target",
          "mana",
        ]),
        filter: objectFilterSchema.optional(),
        player: z.enum(["you", "opponent"]).optional(),
        ordinal: z.number().int().positive().optional(),
        grouped: z.boolean().optional(),
        step: z.number().int().nonnegative().optional(),
        combat: z.boolean().optional(),
        recipientKind: z.enum(["player", "object"]).optional(),
        counter: z.string().min(1).optional(),
        atLeast: z.number().int().positive().optional(),
      })
      .strict()
      .optional(),
    manaAbility: z.boolean().optional(),
  })
  .strict();
export type RulesAbility = z.infer<typeof rulesAbilitySchema>;
export type RulesCost = z.infer<typeof rulesCostSchema>;
export interface PendingProcedure {
  id: string;
  playerId: string;
  kind:
    | "commander-return"
    | "declare-attackers"
    | "declare-blockers"
    | "attack-payment"
    | "combat-damage"
    | "cast"
    | "activate"
    | "cleanup"
    | "resolve"
    | "trigger-order"
    | "trigger-target";
  stage: "variable" | "targets" | "payment" | "selection";
  damageChoices?: DamageChoice[];
  variables?: Record<string, number>;
  context?: string;
  options?: Record<string, SelectionOption>;
  sourceId?: string;
  ability?: RulesAbility;
  abilityId?: string;
  targetIds: string[];
  selections: Record<string, string[]>;
  color?: ManaType;
  totalCost: ManaPool & { generic: number };
}
export interface SelectionOption {
  count: number;
  minCount?: number;
  ordered?: boolean;
  requestedCount?: number;
  objectIds: string[];
  label?: string;
  types?: string[];
  labels?: Record<string, string>;
}
/** A JSON value: handler state that survives persistence. */
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** A typed binding value (rules-engine-refactor.md §32). */
export type RuntimeValue =
  | { kind: "number"; value: number }
  | { kind: "objects"; ids: string[] }
  | { kind: "player"; id: string };

/** One program the Rule VM runs: its instructions and program counter. */
export interface ExecutionFrame {
  instructions: Effect[];
  /** The next instruction, or the waiting one while suspended. */
  pc: number;
  /** Bindings visible only inside this frame. */
  locals?: Record<string, RuntimeValue>;
}

/**
 * A resolving spell or ability's Rule VM state (rules-engine-refactor.md §32).
 * A suspended instruction keeps its frame's program counter, so a restored
 * Match answers it without running anything again.
 */
export interface RuleExecution {
  stackObjectId: string;
  controllerId: string;
  frames: ExecutionFrame[];
  bindings: Record<string, RuntimeValue>;
  /** The waiting instruction's handler state, while suspended. */
  waiting?: { state: JsonValue };
  /** Library cards the waiting chooser looks at privately (shown in their view). */
  inspectedIds?: string[];
}
export interface CombatAttacker {
  objectId: string;
  defenderId: string;
  defendingPlayerId: string;
  blockerIds: string[];
  blocked: boolean;
}
export interface CombatState {
  attackers: CombatAttacker[];
  remainingDefenderIds: string[];
}
export interface DamageAssignment {
  sourceId: string;
  recipientId: string;
  amount: number;
}
export interface DamageEvent extends DamageAssignment {
  sourceCharacteristics: import("./model.js").Characteristics;
  combat: boolean;
  controllerId: string;
  recipientKind: "player" | "object";
  turn: number;
}
export interface DamageChoice {
  sourceId: string;
  amount: number;
  recipientIds: string[];
}
export interface RulesState {
  practice?: { playerId: string; controllerParticipantId: string };
  monarchId?: string;
  commanderCasts?: Record<string, number>;
  commanderDamage?: Record<string, Record<string, number>>;
  commanderReturns?: string[];
  cleanupNeedsPriority?: boolean;
  commanderReplay?: {
    action: import("./model.js").MatchAction;
    participantId: string;
    previousPriority?: { playerId: string; passedPlayerIds: string[] };
    previousPending?: PendingProcedure;
    key: string;
    answers: Record<string, boolean>;
  };
  markedDamage?: Record<string, number>;
  damageEvents?: DamageEvent[];
  drawsThisTurn?: Record<string, number>;
  activationUsage?: Record<string, number>;
  revealedHandIds?: string[];
  temporaryEffects?: ActiveContinuousEffect[];
  combat?: CombatState;
  orderedTriggerPlayerIds?: string[];
  continuousEffects?: ActiveContinuousEffect[];
  waitingTriggers?: WaitingTrigger[];
  triggerPlacement?: WaitingTrigger[];
  priorityAfterTriggers?: string;
  format: "commander";
  setup: { keptPlayerIds: string[]; startingPlayerId: string };
  pending?: PendingProcedure;
  resolving?: RuleExecution;
  mana: Record<string, ManaPool>;
  restrictedMana?: Record<string, RestrictedMana[]>;
  failedDrawPlayerIds?: string[];
  landsPlayed: Record<string, number>;
  controlledSinceTurn: Record<string, number>;
  turnStarted: Record<string, number>;
  commanders: Record<string, { instanceId: string; colorIdentity: string[] }>;
}

export interface SemanticEvent {
  kind:
    | "enter"
    | "cast"
    | "zone-change"
    | "state"
    | "damage"
    | "attack"
    | "draw"
    | "upkeep"
    | "target"
    | "mana";
  playerId?: string;
  stackId?: string;
  defenderId?: string;
  ordinal?: number;
  damage?: DamageAssignment & {
    combat: boolean;
    recipientKind: "player" | "object";
  };
  sourceId: string;
  affectedId: string;
  controllerId: string;
  ownerId: string;
  from?: import("./model.js").ZoneKind;
  to?: import("./model.js").ZoneKind;
  before?: import("./model.js").Characteristics;
  after: import("./model.js").Characteristics;
  /** Zone changes: the object as it last existed (rules-engine-refactor.md §56). */
  lastKnown?: LastKnownInformation;
}
/**
 * A Game Object as it last existed in its previous Zone: what bindings,
 * leave-the-battlefield triggers and moved damage sources read (CR 608.2h).
 */
export interface LastKnownInformation {
  objectId: string;
  zoneId: string;
  controllerId: string;
  ownerId: string;
  characteristics: import("./model.js").Characteristics;
  counters: import("./model.js").Counter[];
  attachmentTo: string | null;
  tapped: boolean;
}
export interface WaitingTrigger {
  sourceSnapshot?: {
    characteristics: import("./model.js").Characteristics;
    ownerId: string;
  };
  id: string;
  playerId: string;
  sourceId: string;
  abilityId: string;
  sourceName: string;
  ability: RulesAbility;
  event: SemanticEvent;
}
