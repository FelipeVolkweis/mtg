import type { RoomState } from "../../shared/model.js";

/** The Room document shape this server writes (CM §5). */
export const currentSnapshotVersion = 7;

/**
 * The oldest Room document shape this server reads. `RoomService.onModuleInit`
 * deletes every Room stored below version 7 (ADR-0019), so no older shape is
 * upgraded.
 */
const oldestSnapshotVersion = 7;

/**
 * Brings a stored Room document up to the current snapshot version. Pure: it
 * returns the upgraded document and never touches storage. A change to the
 * stored shape bumps `currentSnapshotVersion` and adds its upgrade step here.
 */
export function upgradeRoom(stored: RoomState): RoomState {
  const version = (stored as { snapshotVersion?: unknown }).snapshotVersion;
  const shown = version === undefined ? "(missing)" : String(version);
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
