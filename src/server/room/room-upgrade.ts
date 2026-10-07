import type { RoomState } from "../../shared/model.js";

/** The Room document shape this server writes (CM §5). */
export const currentSnapshotVersion = 2;

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
  room.snapshotVersion = currentSnapshotVersion;
  return stored;
}
