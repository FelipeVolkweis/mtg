import { expect, test } from "@playwright/test";
import {
  currentSnapshotVersion,
  upgradeRoom,
} from "../../src/server/room/room-upgrade";
import type { RoomState } from "../../src/shared/model";
import { rulesGame } from "../support/rules-game";

// Rooms below the current snapshot version are deleted at startup, so
// version 10 (a waiting trigger's typed `source`) is the oldest Room
// document a server can load. Development resets the database on a shape
// change, so no upgrade step brings a version 9 Room forward.

async function storedVersion10Room() {
  const game = await rulesGame();
  const room: RoomState = { ...game.room, match: game.match };
  // A Room document as it comes back from storage.
  return JSON.parse(JSON.stringify(room)) as RoomState;
}

test("the current snapshot version is the version 10 baseline", () => {
  expect(currentSnapshotVersion).toBe(10);
});

test("a version 10 Room with a Match in progress loads unchanged", async () => {
  const stored = await storedVersion10Room();
  expect(stored.snapshotVersion).toBe(10);
  expect(stored.match?.rules.thisTurn).toBeDefined();
  expect(stored.match?.turn.step).toBe("precombat-main");
  expect(stored.match?.rules).toBeDefined();
  const original = structuredClone(stored);
  const room = upgradeRoom(stored);
  expect(room).toEqual(original);
  expect(upgradeRoom(structuredClone(room))).toEqual(original);
});

for (const version of [1, 3, 6, 7, 8, 9])
  test(`a version ${version} Room is refused as older than the server reads`, () => {
    expect(() =>
      upgradeRoom({ snapshotVersion: version } as RoomState),
    ).toThrow(
      `Room snapshot version ${version} is older than this server supports (oldest is 10).`,
    );
  });

test("a Room without a snapshot version is refused as older than the server reads", () => {
  expect(() => upgradeRoom({} as RoomState)).toThrow(
    "Room snapshot version (missing) is older than this server supports (oldest is 10).",
  );
});

test("a Room from a newer server version is refused", () => {
  expect(() =>
    upgradeRoom({ snapshotVersion: currentSnapshotVersion + 1 } as RoomState),
  ).toThrow(
    `Room snapshot version ${currentSnapshotVersion + 1} is newer than this server supports (newest is ${currentSnapshotVersion}).`,
  );
});
