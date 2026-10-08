import { z } from "zod";
import {
  type Ability,
  type Characteristics,
  type ContinuousChange,
  type Effect,
  type ManaType,
  manaTypes,
  type Selector,
  type TurnStep,
  type ZoneKind,
} from "./card-dsl.js";

// The runtime Match state the server persists in a Room: the Match, its
// players, Zones and Game Objects, the rules state of a Rules-Automated Match,
// and the actions a player sends to change it.

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
    | "trigger-target"
    | "state-based-choice";
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
  /** A state-based choice: the State-Based Rule that answers it. */
  stateBasedRule?: string;
  /** A cast or activation in progress (rules-engine-refactor.md §13–16). */
  proposal?: StackProposal;
}
/**
 * The spell or ability a player is proposing: it is on the Stack from the
 * start (CR 601.2a, 602.2a). Rolling back restores `base`, the Match as it was
 * before the proposal began (§16).
 */
export interface StackProposal {
  stackObjectId: string;
  /** The total cost is locked (CR 601.2f); abort is no longer offered. */
  locked: boolean;
  base: MatchState;
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
  sourceCharacteristics: Characteristics;
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
/**
 * What a suspended Priority Checkpoint resumes toward: Priority for a player
 * (keeping recorded passes), or the end of the cleanup step, which grants
 * Priority only if a state-based action or trigger happened (CR 514.3a).
 */
export interface CheckpointState {
  playerId?: string;
  passedPlayerIds?: string[];
  cleanup?: { performed: boolean };
}
/**
 * What happened during the current turn. Turn-based bookkeeping lives here so
 * a new turn replaces it as a whole (`TurnStructure.begin`) and no field is
 * left behind.
 */
export interface TurnRecord {
  /** Lands each player has played this turn, by player id (CR 305.2). */
  landsPlayed: Record<string, number>;
  /** Cards each player has drawn this turn, by player id. */
  draws: Record<string, number>;
  /** Once-each-turn abilities activated this turn, keyed `sourceId:abilityId`. */
  activationUsage: Record<string, number>;
  /** Damage dealt this turn, in order. */
  damageEvents: DamageEvent[];
}
export interface RulesState {
  /** Solo Practice: the inert player and who handles its choices. */
  practice?: { playerId: string; controllerParticipantId: string };
  /** Once a player has become the monarch. */
  monarchId?: string;
  /** Once a commander is cast: casts by Card Instance id (CR 903.8). */
  commanderCasts?: Record<string, number>;
  /** Once commander combat damage is dealt: by player, then commander instance. */
  commanderDamage?: Record<string, Record<string, number>>;
  /** While commanders wait for their owners' return choice (CR 903.9a). */
  commanderReturns?: string[];
  /** While a command waits for a commander replacement choice to replay it. */
  commanderReplay?: {
    action: MatchAction;
    participantId: string;
    previousPriority?: { playerId: string; passedPlayerIds: string[] };
    previousPending?: PendingProcedure;
    key: string;
    answers: Record<string, boolean>;
  };
  /** Once a creature is dealt damage; emptied in the cleanup step (CR 514.2). */
  markedDamage?: Record<string, number>;
  /** Once a card in a hand is revealed: the revealed hand cards. */
  revealedHandIds?: string[];
  /** Once an until-end-of-turn effect starts; emptied in the cleanup step. */
  temporaryEffects?: ActiveContinuousEffect[];
  /** From the beginning of combat to the postcombat main phase. */
  combat?: CombatState;
  /** While players order their simultaneous triggers (APNAP, CR 603.3b). */
  orderedTriggerPlayerIds?: string[];
  /** Once state-based actions have run: the continuous effects in force. */
  continuousEffects?: ActiveContinuousEffect[];
  /** Once a trigger has fired: triggers waiting to be put on the Stack. */
  waitingTriggers?: WaitingTrigger[];
  /** While waiting triggers are being placed on the Stack. */
  triggerPlacement?: WaitingTrigger[];
  /** A Priority Checkpoint suspended on a choice (rules-engine-refactor.md §11, §47). */
  checkpoint?: CheckpointState;
  format: "commander";
  setup: { keptPlayerIds: string[]; startingPlayerId: string };
  /** While a procedure waits for a player's input. */
  pending?: PendingProcedure;
  /** While a spell or ability resolves. */
  resolving?: RuleExecution;
  mana: Record<string, ManaPool>;
  /** Once restricted mana is added; emptied when the step ends. */
  restrictedMana?: Record<string, RestrictedMana[]>;
  /** Once a player draws from an empty Library, until state-based actions. */
  failedDrawPlayerIds?: string[];
  thisTurn: TurnRecord;
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
  from?: ZoneKind;
  to?: ZoneKind;
  before?: Characteristics;
  after: Characteristics;
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
  characteristics: Characteristics;
  counters: Counter[];
  attachmentTo: string | null;
  tapped: boolean;
}
/** A designation a player can have (CR 724: the monarch). */
export type Designation = "monarch";

/** What a triggered ability triggered from: an object, or a player's designation. */
export type TriggerSource =
  | { kind: "object"; id: string }
  | { kind: "designation"; designation: Designation };

export interface WaitingTrigger {
  sourceSnapshot?: {
    characteristics: Characteristics;
    ownerId: string;
  };
  id: string;
  playerId: string;
  source: TriggerSource;
  abilityId: string;
  sourceName: string;
  ability: Ability;
  event: SemanticEvent;
}

// ------------------------------------------------------------ Match state

export const statusSchema = z
  .object({
    tapped: z.boolean(),
  })
  .strict();
/**
 * What was chosen while a spell or ability was proposed (CR 601.2b–h,
 * card-model-refactor.md §4.2). It stays with a permanent spell onto the
 * Battlefield, because a permanent can ask how it was cast.
 */
export interface ProposalRecord {
  /** Spells only: the Zone the card was cast from. */
  sourceZone?: ZoneKind;
  /** X and other chosen values. */
  variables: Record<string, number>;
  /** DSL version 2 mode ids. */
  modes: string[];
  /** Paid optional cost ids, such as "kicker". */
  optionalCosts: string[];
  alternativeCost?: string;
  manaSpent: ManaType[];
}
export interface ObjectLink {
  label: string;
  objectIds: string[];
  abilityId?: string;
}
export interface Counter {
  kind: string;
  quantity: string;
}
export interface MatchPlayer {
  id: string;
  participantId: string;
  name: string;
  seat: number;
  life: string;
  mulliganCount: number;
  outcome: "playing" | "won" | "lost";
  counters: Counter[];
}
export interface ZoneState {
  id: string;
  kind: ZoneKind;
  name: string;
  ownerId?: string;
  visibility: "public" | "private";
  objectIds: string[];
}
export interface CardInstance {
  id: string;
  definitionId: string;
  printingId: string;
  ownerId: string;
  commander?: boolean;
}
export const objectKinds = ["card", "token", "ability"] as const;
export interface GameObject {
  id: string;
  kind: (typeof objectKinds)[number];
  zoneId: string;
  cardInstanceIds: string[];
  controllerId: string;
  characteristics: Characteristics;
  components: Characteristics[];
  artwork: string[];
  currentFace: number;
  status: z.infer<typeof statusSchema>;
  counters: Counter[];
  attachmentTo: string | null;
  links: ObjectLink[];
  proposal: ProposalRecord | null;
  sourceObjectId?: string;
  sourceAbilityId?: string;
  resolution?: {
    sourceSnapshot?: { characteristics: Characteristics; ownerId: string };
    ability: Ability;
    event?: SemanticEvent;
    targetIds: string[];
    color?: ManaType;
  };
  ownerId: string;
}
export interface MatchState {
  id: string;
  rules: RulesState;
  revision: number;
  players: MatchPlayer[];
  instances: Record<string, CardInstance>;
  objects: Record<string, GameObject>;
  zones: ZoneState[];
  turn: {
    activePlayerId: string;
    number: number;
    step: TurnStep;
    order: string[];
  };
  outcome: "ongoing" | "complete" | "draw";
  priority?: { playerId: string; passedPlayerIds: string[] };
}

// ---------------------------------------------------------- Match actions

const id = z.uuid();
export const matchActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("pass-priority") }).strict(),
  z.object({ type: z.literal("play-land"), objectId: id }).strict(),
  z.object({ type: z.literal("cast-spell"), objectId: id }).strict(),
  z
    .object({
      type: z.literal("activate-ability"),
      objectId: id,
      abilityId: z.string().min(1).max(200),
      color: z.enum(manaTypes).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("rules-input"),
      procedureId: id,
      damageAssignments: z
        .array(
          z
            .object({
              sourceId: id,
              recipientId: id,
              amount: z.number().int().nonnegative().max(1000000),
            })
            .strict(),
        )
        .max(100)
        .optional(),
      targetIds: z.array(id).max(100).optional(),
      selections: z.record(z.string(), z.array(id).max(100)).optional(),
      color: z.enum(manaTypes).optional(),
      variables: z
        .record(z.string(), z.number().int().nonnegative().max(1000))
        .optional(),
      confirm: z.boolean().optional(),
    })
    .strict(),
  z.object({ type: z.literal("cancel-procedure"), procedureId: id }).strict(),
  // Reverses a cast or activation whose locked total cost can't be paid
  // (rules-engine-refactor.md §16).
  z.object({ type: z.literal("reverse-proposal"), procedureId: id }).strict(),
  z
    .object({ type: z.literal("keep-hand"), bottomIds: z.array(id).max(7) })
    .strict(),
  z.object({ type: z.literal("mulligan"), playerId: id }).strict(),
]);
export type MatchAction = z.infer<typeof matchActionSchema>;
