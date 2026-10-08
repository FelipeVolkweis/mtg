import { z } from "zod";
import type {
  Ability,
  CardForm,
  Characteristics,
  TurnStep,
} from "./card-dsl.js";
import {
  type Counter,
  type DamageChoice,
  type GameObject,
  type ManaPool,
  type MatchAction,
  matchActionSchema,
  type MatchState,
  type RulesState,
  type SelectionOption,
  type ZoneState,
} from "./rules-state.js";

export const id = z.uuid();
export const integer = z.string().regex(/^-?\d+$/, "Use an integer");
/**
 * A Card Definition as the engine uses it. The file stores only the imported
 * facts and the authored abilities (docs/card-model.md); the reader
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
export const deckFormats = [
  "commander",
  "standard",
  "pioneer",
  "modern",
  "legacy",
  "vintage",
  "pauper",
] as const;
export type DeckFormat = (typeof deckFormats)[number];
export const deckFormatNames: Record<DeckFormat, string> = {
  commander: "Commander",
  standard: "Standard",
  pioneer: "Pioneer",
  modern: "Modern",
  legacy: "Legacy",
  vintage: "Vintage",
  pauper: "Pauper",
};
/** Formats a Match can be played in; other Decks are catalogued only. */
export const playableFormats: readonly DeckFormat[] = ["commander"];
/** The Deck contents a Match is built from. */
export interface Decklist {
  id: string;
  name: string;
  format: DeckFormat;
  text: string;
  entries: DeckEntry[];
  commanderId?: string;
}
/** A Decklist in a User's Deck Catalog. */
export interface Deck extends Decklist {
  updatedAt: number;
}
export interface DeckView extends Deck {
  /** Format rule violations; a Deck with issues can be saved but not played. */
  issues: string[];
  commanderOptions: { definitionId: string; name: string }[];
}
export const deckInputSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    format: z.enum(deckFormats),
    text: z.string().min(1).max(100000),
    commanderId: id.nullable().optional(),
  })
  .strict();
export type DeckInput = z.infer<typeof deckInputSchema>;
export interface User {
  id: string;
  name: string;
}
export const credentialsSchema = z
  .object({
    username: z
      .string()
      .trim()
      .regex(
        /^[A-Za-z0-9_.-]{3,32}$/,
        "Usernames are 3–32 letters, digits, dots, dashes or underscores.",
      ),
    password: z
      .string()
      .min(8, "Passwords need at least 8 characters.")
      .max(200, "Passwords can have at most 200 characters."),
  })
  .strict();
export interface Participant {
  id: string;
  userId: string;
  name: string;
  /** Copy of the selected Deck, refreshed on select, ready and Match start. */
  deck?: Decklist;
  ready: boolean;
}
/** The phases of a turn in order (CR 500.1). */
export const turnPhases = [
  "Beginning",
  "Precombat main",
  "Combat",
  "Postcombat main",
  "Ending",
] as const;
export type TurnPhase = (typeof turnPhases)[number];
/** Each of `turnSteps`' phase and display name. */
export const phaseSteps: Record<TurnStep, readonly [TurnPhase, string]> = {
  untap: ["Beginning", "Untap"],
  upkeep: ["Beginning", "Upkeep"],
  draw: ["Beginning", "Draw"],
  "precombat-main": ["Precombat main", "Main"],
  "begin-combat": ["Combat", "Beginning of combat"],
  "declare-attackers": ["Combat", "Declare attackers"],
  "declare-blockers": ["Combat", "Declare blockers"],
  "combat-damage": ["Combat", "Combat damage"],
  "end-combat": ["Combat", "End of combat"],
  "postcombat-main": ["Postcombat main", "Main"],
  end: ["Ending", "End"],
  cleanup: ["Ending", "Cleanup"],
};
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
 * stage names (docs/rules-engine.md).
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
  options: Record<string, SelectionOption>;
  /** Selections saved with the procedure (a resumed payment keeps them). */
  selections: Record<string, string[]>;
  /** The locked total cost while the procedure waits for payment. */
  lockedCost?: ManaPool & { generic: number };
  damageChoices?: DamageChoice[];
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
  selectedDeck?: Decklist;
  match?: MatchView;
  rematch?: RematchProposal;
}
export const roomCommandSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("ready"),
      deckId: id.optional(),
      ready: z.boolean(),
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
