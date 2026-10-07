import { z } from "zod";
import type { RulesState } from "./rules.js";
import type { Ability, CardForm } from "./rules-v2.js";

export const id = z.uuid();
const text = z.string().max(8000);
export const integer = z.string().regex(/^-?\d+$/, "Use an integer");
export const characteristicSchema = z
  .object({
    name: z.string().min(1).max(200),
    manaCost: z.string().max(200).optional(),
    colors: z
      .array(z.enum(["W", "U", "B", "R", "G"]))
      .max(5)
      .default([]),
    colorIndicator: z
      .array(z.enum(["W", "U", "B", "R", "G"]))
      .max(5)
      .optional(),
    typeLine: z.string().max(400).default(""),
    manaValue: z.number().nonnegative().optional(),
    supertypes: z.array(z.string()).optional(),
    types: z.array(z.string()).optional(),
    subtypes: z.array(z.string()).optional(),
    keywords: z.array(z.string()).optional(),
    rulesText: text.default(""),
    power: z.string().max(100).optional(),
    toughness: z.string().max(100).optional(),
    loyalty: z.string().max(100).optional(),
    defense: z.string().max(100).optional(),
  })
  .strict();
export type Characteristics = z.infer<typeof characteristicSchema>;
/**
 * A Card Definition as the engine uses it. The file stores only the imported
 * facts and the authored abilities (card-model-refactor.md §3); the reader
 * derives the name, mana value, keywords, Oracle text and type lines, and
 * compiles the authored abilities into the Core `abilities` the engine runs.
 */
export interface CardDefinition {
  id: string;
  canonicalName: string;
  defaultPrintingId: string;
  form: CardForm;
  colorIdentity: string[];
  components: Characteristics[];
  oracleText: string;
  keywords: string[];
  manaValue: number;
  automationStatus: "unimplemented" | "implemented";
  /**
   * The Core abilities the engine executes (the compiler's output); empty for
   * an unimplemented card the runtime can't run.
   */
  abilities: Ability[];
  /** The DSL version 2 abilities, as authored in the file. */
  authoredAbilities: Ability[];
}
export interface CardPrinting {
  id: string;
  definitionId: string;
  setCode: string;
  collectorNumber: string;
  artwork: string[];
}
export interface NameEntry {
  name: string;
  canonicalName?: string;
  component?: number;
}
export interface Catalog {
  definitions: Record<string, CardDefinition>;
  printings: Record<string, CardPrinting>;
  names: Record<string, NameEntry>;
  importedSets: string[];
}
export interface DeckEntry {
  quantity: number;
  definitionId: string;
  printingId: string;
}
export interface Decklist {
  id: string;
  name: string;
  text: string;
  entries: DeckEntry[];
}
export interface Participant {
  id: string;
  name: string;
  credentialHash: string;
  decklists: Decklist[];
  selectedDecklistId?: string;
  selectedCommanderId?: string;
  ready: boolean;
}
export const phaseSteps = [
  ["Beginning", "Untap"],
  ["Beginning", "Upkeep"],
  ["Beginning", "Draw"],
  ["Precombat main", "Main"],
  ["Combat", "Beginning of combat"],
  ["Combat", "Declare attackers"],
  ["Combat", "Declare blockers"],
  ["Combat", "Combat damage"],
  ["Combat", "End of combat"],
  ["Postcombat main", "Main"],
  ["Ending", "End"],
  ["Ending", "Cleanup"],
] as const;
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
  manaSpent: import("./rules.js").ManaType[];
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
    event?: import("./rules.js").SemanticEvent;
    targetIds: string[];
    color?: import("./rules.js").ManaType;
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
    stepIndex: number;
    order: string[];
  };
  outcome: "ongoing" | "complete" | "draw";
  priority?: { playerId: string; passedPlayerIds: string[] };
}
export interface RematchProposal {
  id: string;
  startingLife: string;
  confirmations: string[];
  format?: "commander";
  startingParticipantId?: string;
}
export interface RoomState {
  /** Stored document shape; see src/server/room/room-upgrade.ts. */
  snapshotVersion: number;
  id: string;
  invite: string;
  revision: number;
  lastActivity: number;
  participants: Participant[];
  match?: MatchState;
  rematch?: RematchProposal;
}
export interface ParticipantView {
  id: string;
  name: string;
  ready: boolean;
  connected: boolean;
  selected: boolean;
}
export interface ZoneView extends Omit<ZoneState, "objectIds"> {
  count: number;
  objectIds?: string[];
}
export interface ObjectView extends Partial<GameObject> {
  id: string;
  zoneId: string;
  controllerId: string;
  ownerId: string;
  characteristics: Characteristics;
  status: GameObject["status"];
  counters: Counter[];
  /** A spell or ability on the Stack while its controller proposes it (CR 601.2a). */
  beingCast?: true;
}
/**
 * What a pending procedure asks of its player: a stable kind, not internal
 * stage names (rules-engine-refactor.md §57).
 */
export type PromptKind =
  | "choose-x"
  | "choose-targets"
  | "pay-costs"
  | "resolution-choice"
  | "resolution-payment"
  | "order-triggers"
  | "trigger-targets"
  | "commander-return"
  | "state-based-choice"
  | "declare-attackers"
  | "declare-blockers"
  | "attack-payment"
  | "combat-damage"
  | "cleanup-discard";
/** Legal targets for one target clause of the spell or ability. */
export interface PromptTargets {
  clauseId: string;
  legalIds: string[];
}
/**
 * The acting player's projected prompt: what is asked, its options and
 * labels. Authored abilities, stage names and rollback state stay on the
 * server.
 */
export interface ProcedurePrompt {
  procedureId: string;
  promptKind: PromptKind;
  title: string;
  context?: string;
  targets: PromptTargets[];
  options: Record<string, import("./rules.js").SelectionOption>;
  /** Selections saved with the procedure (a resumed payment keeps them). */
  selections: Record<string, string[]>;
  /** The locked total cost while the procedure waits for payment. */
  lockedCost?: import("./rules.js").ManaPool & { generic: number };
  damageChoices?: import("./rules.js").DamageChoice[];
  /** A UI abort is offered (before a proposal's cost is locked). */
  canAbort: boolean;
  /** Reversing an unpayable proposal is offered (after its cost is locked). */
  canReverse: boolean;
}
export interface MatchView extends Omit<
  MatchState,
  "zones" | "objects" | "rules"
> {
  rules: Omit<
    RulesState,
    | "commanderReplay"
    | "commanderReturns"
    | "checkpoint"
    | "pending"
    | "resolving"
    | "waitingTriggers"
    | "triggerPlacement"
    | "orderedTriggerPlayerIds"
    | "controlledSinceTurn"
    | "turnStarted"
    | "revealedHandIds"
  > & {
    waiting?: { playerId: string; promptKind: PromptKind };
    prompt?: ProcedurePrompt;
  };
  actions?: { label: string; action: MatchAction }[];
  zones: ZoneView[];
  objects: Record<string, ObjectView>;
}
export interface RoomView {
  id: string;
  revision: number;
  invitation: string;
  participantId: string;
  participants: ParticipantView[];
  decklists: Decklist[];
  selectedDecklistId?: string;
  match?: MatchView;
  rematch?: RematchProposal;
  selectedCommanderId?: string;
  commanderOptions?: {
    definitionId: string;
    name: string;
    eligible: boolean;
  }[];
}
export const matchActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("pass-priority") }).strict(),
  z.object({ type: z.literal("play-land"), objectId: id }).strict(),
  z.object({ type: z.literal("cast-spell"), objectId: id }).strict(),
  z
    .object({
      type: z.literal("activate-ability"),
      objectId: id,
      abilityId: z.string().min(1).max(200),
      color: z.enum(["W", "U", "B", "R", "G", "C"]).optional(),
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
      color: z.enum(["W", "U", "B", "R", "G", "C"]).optional(),
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
export const roomCommandSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("save-decklist"),
      id: id.optional(),
      name: z.string().trim().min(1).max(100),
      text: z.string().min(1).max(100000),
    })
    .strict(),
  z
    .object({
      type: z.literal("ready"),
      decklistId: id.optional(),
      ready: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal("configure-commander"),
      decklistId: id,
      definitionId: id,
    })
    .strict(),
  z
    .object({
      type: z.literal("start"),
      startingLife: integer,
      format: z.literal("commander").optional(),
      startingParticipantId: id.optional(),
    })
    .strict(),
  z.object({ type: z.literal("start-solo"), startingLife: integer }).strict(),
  z.object({ type: z.literal("confirm-rematch"), proposalId: id }).strict(),
  z.object({ type: z.literal("cancel-rematch") }).strict(),
  z.object({ type: z.literal("close") }).strict(),
  z
    .object({
      type: z.literal("match-action"),
      matchId: id,
      revision: z.number().int().nonnegative(),
      action: matchActionSchema,
    })
    .strict(),
]);
export type RoomCommand = z.infer<typeof roomCommandSchema>;
export interface Session {
  invite: string;
  credential: string;
}
export type ServerMessage =
  | {
      event: "view";
      data: { view: RoomView; requestId?: string; notice?: string };
    }
  | {
      event: "rejected";
      data: { message: string; requestId?: string; view?: RoomView };
    }
  | { event: "closed"; data: { message: string } }
  | { event: "pong"; data: null };
