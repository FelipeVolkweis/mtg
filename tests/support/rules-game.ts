import { expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readCatalog } from "../../src/server/catalog/catalog-files";
import { force } from "./force";
import { MatchService } from "../../src/server/match/match.service";
import { matchView } from "../../src/server/match/match-view";
import { currentSnapshotVersion } from "../../src/server/room/room-upgrade";
import type { Catalog, Participant, RoomState } from "../../src/shared/model";
import type { MatchAction } from "../../src/shared/rules-state";

// Shared Match fixtures for the rules suites (rules test plan §15-16).

export function emptyRoom(): RoomState {
  const participant: Participant = {
    id: randomUUID(),
    userId: randomUUID(),
    name: "Alice",
    ready: true,
    deck: {
      id: randomUUID(),
      name: "Empty",
      format: "commander",
      text: "",
      entries: [],
    },
  };
  return {
    snapshotVersion: currentSnapshotVersion,
    id: randomUUID(),
    invite: "",
    revision: 0,
    lastActivity: 0,
    participants: [participant],
  };
}
export const emptyCatalog: Catalog = {
  definitions: {},
  printings: {},
  names: {},
  importedSets: [],
};

export function commanderFixture() {
  const catalog = structuredClone(emptyCatalog);
  const room = emptyRoom();
  room.participants.push({
    ...structuredClone(room.participants[0]),
    id: randomUUID(),
    name: "Bob",
  });
  const island = randomUUID(),
    commander = randomUUID();
  for (const [id, name, types, supertypes, subtypes] of [
    [island, "Island", ["Land"], ["Basic"], ["Island"]],
    [commander, "Supported Commander", ["Creature"], ["Legendary"], ["Wizard"]],
  ] as [string, string, string[], string[], string[]][]) {
    const printingId = randomUUID();
    catalog.definitions[id] = {
      id,
      canonicalName: name,
      defaultPrintingId: printingId,
      form: "normal",
      colorIdentity: ["U"],
      components: [
        {
          name,
          typeLine: [...supertypes, ...types].join(" "),
          types,
          supertypes,
          subtypes,
          colors: [],
          rulesText: "",
          manaCost: "{U}",
          power: "2",
          toughness: "2",
        },
      ],
      oracleText: "",
      keywords: [],
      manaValue: 1,
      automationStatus: "implemented",
      abilities: [],
      authoredAbilities: [],
    };
    catalog.printings[printingId] = {
      id: printingId,
      definitionId: id,
      setCode: "tst",
      collectorNumber: "1",
      artwork: [],
    };
  }
  for (const p of room.participants) {
    p.deck!.commanderId = commander;
    p.deck!.entries = [
      {
        definitionId: commander,
        printingId: catalog.definitions[commander].defaultPrintingId,
        quantity: 1,
      },
      {
        definitionId: island,
        printingId: catalog.definitions[island].defaultPrintingId,
        quantity: 99,
      },
    ];
  }
  return { room, catalog, commander, island };
}

export async function rulesGame() {
  const service = new MatchService();
  const fixture = commanderFixture();
  // Release definitions supply the actual authored behavior; these isolated fixtures
  // bypass Decklist composition only when building the starting scenario.
  const release = structuredClone(await readCatalog("catalog"));
  const catalog: Catalog = {
    ...fixture.catalog,
    definitions: { ...release.definitions, ...fixture.catalog.definitions },
    printings: { ...release.printings, ...fixture.catalog.printings },
  };
  const match = service.createCommander(
    fixture.room,
    catalog,
    fixture.room.participants[0].id,
  );
  const command = (seat: number, action: MatchAction) =>
    service.execute(match, fixture.room.participants[seat], action, catalog);
  for (const seat of [0, 1])
    command(seat, { type: "keep-hand", bottomIds: [] });
  for (let step = 0; step < 2; step++) {
    command(0, { type: "pass-priority" });
    command(1, { type: "pass-priority" });
  }
  function seed(name: string, kind: "hand" | "battlefield", seat = 0) {
    const definition = Object.values(catalog.definitions).find(
      (card) => card.canonicalName === name,
    )!;
    return force.card(match, definition, kind, match.players[seat].id);
  }
  return { service, catalog, room: fixture.room, match, command, seed };
}

export async function triggerGame() {
  const game = await rulesGame();
  const view = (seat = 0) =>
    matchView(game.match, game.room.participants[seat].id, game.catalog);
  const pass = () => {
    const seat = game.match.players.findIndex(
      (p) => p.id === game.match.priority!.playerId,
    );
    for (let i = 0; i < 2; i++)
      expect(["accepted", "pending"]).toContain(
        game.command((seat + i) % 2, { type: "pass-priority" }).kind,
      );
  };
  const answer = (selections: Record<string, string[]>, seat = 0) =>
    game.command(seat, {
      type: "rules-input",
      procedureId: view(seat).rules!.prompt!.procedureId,
      selections,
    });
  const handCount = (seat = 0) =>
    view(seat).zones.find(
      (z) => z.kind === "hand" && z.ownerId === game.match.players[seat].id,
    )!.count;
  return { ...game, view, pass, answer, handCount };
}
