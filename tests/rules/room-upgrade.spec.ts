import { expect, test } from "@playwright/test";
import {
  currentSnapshotVersion,
  upgradeRoom,
} from "../../src/server/room/room-upgrade";
import type { RoomState } from "../../src/shared/model";
import { rulesGame } from "../support/rules-game";

// Rooms below snapshot version 7 are deleted at startup (ADR-0019), so
// version 7 is the oldest Room document a server can load.

async function storedVersion7Room() {
  const game = await rulesGame();
  const room: RoomState = { ...game.room, match: game.match };
  // A Room document as it comes back from storage.
  return JSON.parse(JSON.stringify(room)) as RoomState;
}

test("the current snapshot version is the version 7 baseline", () => {
  expect(currentSnapshotVersion).toBe(7);
});

test("a version 7 Room with a Match in progress loads unchanged", async () => {
  const stored = await storedVersion7Room();
  expect(stored.snapshotVersion).toBe(7);
  expect(stored.match?.rules).toBeDefined();
  const original = structuredClone(stored);
  const room = upgradeRoom(stored);
  expect(room).toEqual(original);
  expect(upgradeRoom(structuredClone(room))).toEqual(original);
});

for (const version of [1, 3, 6])
  test(`a version ${version} Room is refused as older than the server reads`, () => {
    expect(() =>
      upgradeRoom({ snapshotVersion: version } as RoomState),
    ).toThrow(
      `Room snapshot version ${version} is older than this server supports (oldest is 7).`,
    );
  });

test("a Room without a snapshot version is refused as older than the server reads", () => {
  expect(() => upgradeRoom({} as RoomState)).toThrow(
    "Room snapshot version (missing) is older than this server supports (oldest is 7).",
  );
});

test("a Room from a newer server version is refused", () => {
  expect(() =>
    upgradeRoom({ snapshotVersion: currentSnapshotVersion + 1 } as RoomState),
  ).toThrow(
    `Room snapshot version ${currentSnapshotVersion + 1} is newer than this server supports (newest is ${currentSnapshotVersion}).`,
  );
});
