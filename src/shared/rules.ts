import { z } from "zod";
import type {
  Ability,
  ContinuousChange,
  Effect,
  Selector,
} from "./rules-v2.js";

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
/**
 * The keyword names the characteristics engine records (and the client
 * shows): rule keywords, and the attack and block grants it applies as
 * keywords.
 */
export const runtimeKeywords = [
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
] as const;
export type RuntimeKeyword = (typeof runtimeKeywords)[number];

/**
 * A continuous change as the characteristics engine applies it: a Core
 * change (layer tags dropped), with a granted keyword by its runtime name.
 */
export type AppliedChange =
  | Exclude<
      ContinuousChange,
      { kind: "grant-keyword" } | { kind: "gain-control" }
    >
  | { kind: "grant-keyword"; keyword: RuntimeKeyword };

/** A continuous effect in force (CR 611): what it affects and changes. */
export interface ActiveContinuousEffect {
  sourceId: string;
  abilityId: string;
  /** The effect's controller: "you" in its selector and values. */
  playerId: string;
  /** The affected objects, relative to `sourceId`. */
  objects: Selector;
  changes: AppliedChange[];
  applicability:
    "source-on-battlefield" | "characteristic-defining" | "until-end-of-turn";
}

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
  /** The Core ability being cast or activated. */
  ability?: Ability;
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
  ability: Ability;
  event: SemanticEvent;
}
