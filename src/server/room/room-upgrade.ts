import type { RoomState } from "../../shared/model.js";
import { liftAbility, liftResolution } from "./lift-v1-effects.js";

/** The Room document shape this server writes (CM §5). */
export const currentSnapshotVersion = 3;

type Document = Record<string, unknown>;

// Fields removed from the runtime model by ADR-0018 (card-model-refactor.md §4.1).
const removedMatchFields = [
  "diceRolls",
  "openingHandActions",
  "stickerSheets",
  "copiableValues",
  "layout",
];
const removedObjectFields = [
  "designations",
  "choices",
  "stickerPlacements",
  "meldParts",
  "protectorId",
  "faceDown",
  "copiableValuesId",
];
const removedStatusFields = ["flipped", "phasedOut"];

function upgradeMatchToVersion2(match: Document) {
  for (const field of removedMatchFields) delete match[field];
  const instances = (match.instances ?? {}) as Record<
    string,
    { ownerId: string }
  >;
  for (const object of Object.values(
    (match.objects ?? {}) as Record<string, Document>,
  )) {
    for (const field of removedObjectFields) delete object[field];
    const status = object.status as Document | undefined;
    if (status) for (const field of removedStatusFields) delete status[field];
    // Version 1 stored an owner only on tokens; cards took theirs from the
    // Card Instance and anything else fell back to its controller.
    if (typeof object.ownerId !== "string") {
      const instanceIds = (object.cardInstanceIds ?? []) as string[];
      object.ownerId =
        instances[instanceIds[0]]?.ownerId ?? (object.controllerId as string);
    }
  }
}

/**
 * Version 3 runs Core AST effects (roadmap issue 7): every stored runtime
 * ability and an in-flight resolution are lifted from the version 1 effects.
 */
function upgradeMatchToVersion3(match: Document) {
  for (const object of Object.values(
    (match.objects ?? {}) as Record<string, Document>,
  ))
    liftAbility(
      (object.resolution as Document | undefined)?.ability as Document,
    );
  const rules = match.rules as Document | undefined;
  if (!rules) return;
  const pending = (p: unknown) =>
    liftAbility((p as Document | undefined)?.ability as Document);
  pending(rules.pending);
  pending((rules.commanderReplay as Document | undefined)?.previousPending);
  for (const list of [rules.waitingTriggers, rules.triggerPlacement])
    for (const trigger of (list ?? []) as Document[])
      liftAbility(trigger.ability as Document);
  if (rules.resolving) liftResolution(rules.resolving as Document);
}

/**
 * Brings a stored Room document up to the current snapshot version. Pure: it
 * returns the upgraded document and never touches storage. Version 1 handling
 * can be deleted once every version 1 Room has expired (ROOM_EXPIRY_DAYS after
 * this deploys).
 */
export function upgradeRoom(stored: RoomState): RoomState {
  const room = stored as unknown as Document;
  const version = (room.snapshotVersion as number | undefined) ?? 1;
  if (version > currentSnapshotVersion)
    throw new Error(
      `Room snapshot version ${version} is newer than this server supports.`,
    );
  if (version < 2 && room.match) upgradeMatchToVersion2(room.match as Document);
  if (version < 3 && room.match) upgradeMatchToVersion3(room.match as Document);
  room.snapshotVersion = currentSnapshotVersion;
  return stored;
}
