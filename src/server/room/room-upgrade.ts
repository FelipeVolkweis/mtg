import type { RoomState } from "../../shared/model.js";

/**
 * The Room document shape this server writes (CM §5). Version 10 gives a
 * waiting trigger a typed `source`, an object or the monarch designation
 * (version 9 grouped the per-turn rules state in `rules.thisTurn`).
 */
export const currentSnapshotVersion = 10;

/**
 * The oldest Room document shape this server reads. `RoomService.onModuleInit`
 * deletes every Room stored below the current version: during development the
 * database is reset whenever the stored shape changes, so no older shape is
 * upgraded.
 */
const oldestSnapshotVersion = currentSnapshotVersion;

/**
 * Brings a stored Room document up to the current snapshot version. Pure: it
 * returns the upgraded document and never touches storage. A change to the
 * stored shape bumps `currentSnapshotVersion`, which refuses older Rooms.
 */
export function upgradeRoom(stored: RoomState): RoomState {
  const version = (stored as { snapshotVersion?: unknown }).snapshotVersion;
  const shown = version === undefined ? "(missing)" : JSON.stringify(version);
  if (typeof version === "number" && version > currentSnapshotVersion)
    throw new Error(
      `Room snapshot version ${shown} is newer than this server supports (newest is ${currentSnapshotVersion}).`,
    );
  if (version !== currentSnapshotVersion)
    throw new Error(
      `Room snapshot version ${shown} is older than this server supports (oldest is ${oldestSnapshotVersion}).`,
    );
  return stored;
}
