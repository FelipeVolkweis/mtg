import { z } from "zod";
import type { RulesAbility, RulesState } from "./rules.js";

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
export interface CardDefinition {
  id: string;
  canonicalName: string;
  defaultPrintingId: string;
  form: string;
  colorIdentity: string[];
  components: Characteristics[];
  oracleText: string;
  keywords: string[];
  manaValue: number;
  automationStatus: "unimplemented" | "implemented";
  abilities: CardAbility[];
}
export interface AbilityPrimitive {
  primitive: string;
  parameters?: Record<string, AbilityValue>;
}
export type AbilityValue =
  | { kind: "integer"; value: number }
  | { kind: "boolean"; value: boolean }
  | { kind: "text"; value: string }
  | { kind: "reference"; value: string }
  | { kind: "mana-symbols"; symbols: string[] };
export type AbilityCost =
  | { kind: "mana"; symbols: string[] }
  | ({ kind: "primitive" } & AbilityPrimitive);
export interface CardAbility {
  id: string;
  kind: "static" | "triggered" | "activated" | "spell";
  origin: "printed" | "rules";
  applicableZone?: ZoneKind;
  keyword?: string;
  rules?: RulesAbility;
  trigger?: { kind: "event" | "state"; condition: AbilityPrimitive };
  costs?: AbilityCost[];
  conditions?: AbilityPrimitive[];
  effects?: AbilityPrimitive[];
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
    flipped: z.boolean(),
    phasedOut: z.boolean(),
  })
  .strict();
export const designationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("solved"), value: z.boolean() }).strict(),
  z.object({ kind: z.literal("prepared"), value: z.boolean() }).strict(),
  z.object({ kind: z.literal("class-level"), value: integer }).strict(),
  z
    .object({
      kind: z.literal("room-unlocked"),
      value: z.array(z.number().int().nonnegative()).max(20),
    })
    .strict(),
  z
    .object({
      kind: z.literal("manual"),
      name: z.string().min(1).max(100),
      value: text,
    })
    .strict(),
]);
export const castingSchema = z
  .object({
    sourceZoneId: id,
    chosenX: integer.optional(),
    modes: z.array(text).max(30).default([]),
    components: z.array(z.number().int().nonnegative()).max(20).default([]),
    alternativeCost: text.optional(),
    additionalCosts: z.array(text).max(30).default([]),
    manaSpent: z
      .array(z.enum(["W", "U", "B", "R", "G", "C"]))
      .max(1000)
      .default([]),
  })
  .strict();
export const faceDownSchema = z
  .object({
    mode: z.string().min(1).max(200),
    characteristics: characteristicSchema,
    inspectableBy: z.array(id).max(4),
    turnUpProcedure: text,
  })
  .strict();
export const objectPatchSchema = z
  .object({
    controllerId: id.optional(),
    protectorId: id.nullable().optional(),
    currentFace: z.number().int().nonnegative().optional(),
    characteristics: characteristicSchema.optional(),
    status: statusSchema.optional(),
    designations: z.array(designationSchema).max(100).optional(),
    faceDown: faceDownSchema.nullable().optional(),
    choices: z
      .array(
        z.object({ name: z.string().min(1).max(100), value: text }).strict(),
      )
      .max(100)
      .optional(),
    variables: z
      .array(
        z.object({ name: z.string().min(1).max(100), value: integer }).strict(),
      )
      .max(100)
      .optional(),
    attachmentTo: id.nullable().optional(),
    links: z
      .array(
        z
          .object({
            label: z.string().max(200),
            objectIds: z.array(id).max(100),
            abilityId: z.string().max(200).optional(),
          })
          .strict(),
      )
      .max(100)
      .optional(),
    casting: castingSchema.nullable().optional(),
  })
  .strict();
export type ObjectPatch = z.infer<typeof objectPatchSchema>;
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
  "supplementary",
  "special",
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
export const objectKinds = [
  "card",
  "token",
  "ability",
  "emblem",
  "dungeon",
  "plane",
  "phenomenon",
  "conspiracy",
  "attraction",
  "contraption",
] as const;
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
  designations: z.infer<typeof designationSchema>[];
  counters: Counter[];
  faceDown: z.infer<typeof faceDownSchema> | null;
  protectorId: string | null;
  choices: NonNullable<ObjectPatch["choices"]>;
  variables: NonNullable<ObjectPatch["variables"]>;
  attachmentTo: string | null;
  links: NonNullable<ObjectPatch["links"]>;
  casting: z.infer<typeof castingSchema> | null;
  sourceObjectId?: string;
  sourceAbilityId?: string;
  copiableValuesId?: string;
  stickerPlacements: { stickerId: string; order: number }[];
  meldParts?: GameObject[];
  resolution?: {
    ability: RulesAbility;
    event?: import("./rules.js").SemanticEvent;
    targetIds: string[];
    color?: import("./rules.js").ManaType;
  };
  cannotBeCountered?: boolean;
  ownerId?: string;
}
export interface MatchState {
  id: string;
  mode: "manual" | "rules";
  rules?: RulesState;
  revision: number;
  players: MatchPlayer[];
  instances: Record<string, CardInstance>;
  objects: Record<string, GameObject>;
  zones: ZoneState[];
  layout: {
    kind: "spatial";
    positions: Record<string, { x: number; y: number }>;
  };
  turn: {
    activePlayerId: string;
    number: number;
    stepIndex: number;
    order: string[];
  };
  outcome: "ongoing" | "complete" | "draw";
  openingHandActions: {
    playerId: string;
    objectId?: string;
    description: string;
    taken: boolean;
    result: string;
  }[];
  copiableValues: Record<string, Characteristics>;
  diceRolls: {
    participantId: string;
    name: string;
    sides: number;
    value: number;
  }[];
  stickerSheets: { playerId: string; sheetIds: string[] }[];
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
export interface ObjectView extends Partial<Omit<GameObject, "meldParts">> {
  id: string;
  zoneId: string;
  controllerId: string;
  characteristics: Characteristics;
  status: GameObject["status"];
  counters: Counter[];
  hidden: boolean;
  melded: boolean;
  canTurnFaceUp: boolean;
}
export interface MatchView extends Omit<
  MatchState,
  "zones" | "objects" | "rules"
> {
  rules?: Omit<
    RulesState,
    | "pending"
    | "resolving"
    | "waitingTriggers"
    | "orderedTriggerPlayerIds"
    | "priorityAfterTriggers"
    | "controlledSinceTurn"
    | "turnStarted"
  > & {
    waiting?: { playerId: string; kind: string };
    pending?: import("./rules.js").PendingProcedure & {
      legalTargetIds: string[];
      selectionOptions: Record<string, import("./rules.js").SelectionOption>;
    };
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
const position = z
  .object({
    x: z.number().finite().min(0).max(10000),
    y: z.number().finite().min(0).max(10000),
  })
  .strict();
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
  z
    .object({ type: z.literal("keep-hand"), bottomIds: z.array(id).max(7) })
    .strict(),
  z
    .object({
      type: z.literal("move"),
      objectId: id,
      zoneId: id,
      index: z.number().int().nonnegative().optional(),
      position: position.optional(),
      directedBy: z
        .object({ sourceId: id, reason: z.string().min(1).max(2000) })
        .strict()
        .optional(),
      cast: castingSchema.optional(),
    })
    .strict(),
  z.object({ type: z.literal("position"), objectId: id, position }).strict(),
  z.object({ type: z.literal("shuffle"), zoneId: id }).strict(),
  z
    .object({
      type: z.literal("draw"),
      count: z.number().int().min(1).max(1000),
    })
    .strict(),
  z.object({ type: z.literal("opening-draw") }).strict(),
  z.object({ type: z.literal("mulligan"), playerId: id }).strict(),
  z
    .object({
      type: z.literal("mulligan-count"),
      playerId: id,
      value: z.number().int().min(0).max(1000),
    })
    .strict(),
  z
    .object({
      type: z.literal("patch-object"),
      objectId: id,
      patch: objectPatchSchema,
    })
    .strict(),
  z.object({ type: z.literal("life"), playerId: id, value: integer }).strict(),
  z
    .object({
      type: z.literal("counter"),
      targetId: id,
      kind: z.string().min(1).max(100),
      quantity: integer,
    })
    .strict(),
  z
    .object({
      type: z.literal("turn"),
      activePlayerId: id.optional(),
      number: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).optional(),
      stepIndex: z.number().int().min(0).max(11).optional(),
      direction: z.enum(["next", "previous"]).optional(),
      order: z.array(id).min(1).max(4).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("roll"),
      sides: z.number().int().min(2).max(1000),
    })
    .strict(),
  z
    .object({
      type: z.literal("outcome"),
      value: z.enum(["ongoing", "complete", "draw"]),
      playerId: id.optional(),
      playerStatus: z.enum(["playing", "won", "lost"]).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("create-object"),
      kind: z.enum(objectKinds),
      zoneId: id,
      characteristics: characteristicSchema,
      controllerId: id,
      sourceObjectId: id.optional(),
      sourceAbilityId: z.string().max(200).optional(),
    })
    .strict(),
  z.object({ type: z.literal("remove-object"), objectId: id }).strict(),
  z
    .object({
      type: z.literal("create-zone"),
      kind: z.enum(["supplementary", "special"]),
      name: z.string().min(1).max(200),
      visibility: z.enum(["public", "private"]),
      ownerId: id.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("meld"),
      objectIds: z.array(id).length(2),
      characteristics: characteristicSchema,
    })
    .strict(),
  z.object({ type: z.literal("unmeld"), objectId: id }).strict(),
  z
    .object({
      type: z.literal("copy"),
      sourceId: id,
      targetId: id.optional(),
      characteristics: characteristicSchema.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("opening-hand"),
      objectId: id.optional(),
      description: z.string().min(1).max(2000),
      taken: z.boolean(),
      result: text,
    })
    .strict(),
  z
    .object({
      type: z.literal("sticker-sheets"),
      sheetIds: z.array(z.string().min(1).max(200)).max(100),
    })
    .strict(),
  z
    .object({
      type: z.literal("sticker"),
      objectId: id,
      stickerId: z.string().min(1).max(200),
      order: z.number().int().nonnegative(),
    })
    .strict(),
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
