import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { readCatalog } from "../../src/server/catalog/catalog-files";
import { MatchService } from "../../src/server/match/match.service";
import { matchView } from "../../src/server/match/match-view";
import {
  currentSnapshotVersion,
  upgradeRoom,
} from "../../src/server/room/room-upgrade";
import type { Catalog, MatchAction, RoomState } from "../../src/shared/model";

// Version 1 Room documents captured from the runtime model before ADR-0018
// (see tests/fixtures/rooms-v1/README.md).
const fixtures = ["mid-casting", "mid-resolution", "tokens", "stack-ability"];
const dir = "tests/fixtures/rooms-v1";

async function load(name: string) {
  const stored = JSON.parse(readFileSync(`${dir}/${name}.json`, "utf8"));
  const extra = JSON.parse(readFileSync(`${dir}/${name}.catalog.json`, "utf8"));
  const release = await readCatalog("catalog");
  const catalog: Catalog = {
    ...release,
    definitions: { ...release.definitions, ...extra.definitions },
    printings: { ...release.printings, ...extra.printings },
  };
  const original = structuredClone(stored);
  const room = upgradeRoom(stored as RoomState);
  const match = room.match!;
  const service = new MatchService();
  const command = (seat: number, action: MatchAction) =>
    service.execute(match, room.participants[seat], action, catalog);
  const view = (seat = 0) =>
    matchView(match, room.participants[seat].id, catalog);
  return { original, room, match, catalog, command, view };
}

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

for (const name of fixtures)
  test(`version 1 ${name} room upgrades to the current shape`, async () => {
    const { original, room, match } = await load(name);
    expect(original.snapshotVersion).toBeUndefined();
    expect(room.snapshotVersion).toBe(currentSnapshotVersion);
    for (const field of removedMatchFields)
      expect(match).not.toHaveProperty(field);
    for (const object of Object.values(match.objects)) {
      for (const field of removedObjectFields)
        expect(object).not.toHaveProperty(field);
      expect(Object.keys(object.status)).toEqual(["tapped"]);
      const before = original.match.objects[object.id];
      const expected =
        before.ownerId ??
        original.match.instances[before.cardInstanceIds[0]]?.ownerId ??
        before.controllerId;
      expect(object.ownerId).toBe(expected);
    }
    // Everything else is untouched.
    expect(match.rules).toEqual(original.match.rules);
    expect(match.zones).toEqual(original.match.zones);
    expect(match.instances).toEqual(original.match.instances);
    expect(room.participants).toEqual(original.participants);
    // Upgrading again changes nothing.
    expect(upgradeRoom(structuredClone(room))).toEqual(room);
  });

test("version 1 tokens keep their creator as owner and cards take their Card Instance owner", async () => {
  const { original, match } = await load("tokens");
  const tokens = Object.values(match.objects).filter((o) => o.kind === "token");
  expect(tokens).toHaveLength(4);
  for (const token of tokens)
    expect(token.ownerId).toBe(original.match.objects[token.id].ownerId);
  const card = Object.values(match.objects).find((o) => o.kind === "card")!;
  expect(original.match.objects[card.id].ownerId).toBeUndefined();
  expect(card.ownerId).toBe(match.instances[card.cardInstanceIds[0]].ownerId);
});

test("an upgraded mid-casting room completes its payment", async () => {
  const { match, command, view } = await load("mid-casting");
  const ring = view().actions!.find((a) => a.label === "{T}: Add {C}{C}.")!;
  expect(command(0, ring.action).kind).toBe("pending");
  expect(
    command(0, {
      type: "rules-input",
      procedureId: match.rules!.pending!.id,
      confirm: true,
    }).kind,
  ).toBe("accepted");
  const stack = match.zones.find((z) => z.kind === "stack")!;
  expect(match.objects[stack.objectIds[0]].characteristics.name).toBe(
    "Hedron Archive",
  );
});

test("an upgraded mid-resolution room accepts the pending discard", async () => {
  const { match, command, view } = await load("mid-resolution");
  const pending = view().rules!.pending!;
  const hand = () =>
    view().zones.find(
      (z) => z.kind === "hand" && z.ownerId === match.players[0].id,
    )!.count;
  const before = hand();
  expect(
    command(0, {
      type: "rules-input",
      procedureId: pending.id,
      selections: {
        cards: pending.selectionOptions.cards.objectIds.slice(0, 2),
      },
    }).kind,
  ).toBe("accepted");
  expect(hand()).toBe(before - 2);
  expect(match.rules!.pending).toBeUndefined();
});

test("an upgraded room with tokens keeps playing and new objects get an owner", async () => {
  const { match, command, view } = await load("tokens");
  const land = view().actions!.find((a) => a.label === "Play Island")!;
  expect(command(0, land.action).kind).toBe("accepted");
  const battlefield = match.zones.find((z) => z.kind === "battlefield")!;
  const island = match.objects[battlefield.objectIds.at(-1)!];
  expect(island.characteristics.name).toBe("Island");
  expect(island.ownerId).toBe(match.players[0].id);
});

test("an upgraded room resolves the ability waiting on the Stack", async () => {
  const { match, command, view } = await load("stack-ability");
  const hand = () =>
    view().zones.find(
      (z) => z.kind === "hand" && z.ownerId === match.players[0].id,
    )!.count;
  const before = hand();
  expect(command(0, { type: "pass-priority" }).kind).toBe("accepted");
  expect(command(1, { type: "pass-priority" }).kind).toBe("accepted");
  expect(match.zones.find((z) => z.kind === "stack")!.objectIds).toHaveLength(
    0,
  );
  expect(hand()).toBe(before + 1);
});

test("a room from a newer server version is refused", () => {
  expect(() =>
    upgradeRoom({ snapshotVersion: currentSnapshotVersion + 1 } as RoomState),
  ).toThrow("newer than this server supports");
});
