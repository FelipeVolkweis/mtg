// Characterization tests: Commander setup, Decklist support checks and catalog validation.
//
// Classification (rules test plan §2):
// | Test | Class | Reason
// | --- | --- | ---
// | Commander setup designates commanders before private opening draws and enforces construction and support | Preserve |
// | opening choices and explicit Priority passes perform the first turn draw and prohibit out-of-turn actions | Preserve |
// | Sai and Padeem are supported commanders, and Graaz cannot lead blue cards | Preserve |
// | Commander setup accepts validated ordered cards and rejects unknown result bindings | Change | the Rules Compiler rejects the unknown binding when the card loads, before Commander setup (dsl-redesign.md §2.2; roadmap issue 6)
// | {name} passes Commander setup with complete validated automation (parameterized) | Preserve |
// | newly completed protection, flying, Vehicle and requirement definitions pass normal Commander setup | Preserve |
// | the complete mono-U pool resolves to 100 cards and 67 supported definitions in mirror and practice setup | Preserve |
// | Commander setup rejects a card without its authored {keyword} ability (parameterized) | Preserve | was "an empty authored {keyword} envelope"; version 2 has no empty envelope, so the keyword's ability is removed instead (roadmap issue 6)
// | implemented catalog abilities retain exact rules descriptions and expose readable activation choices | Change | the engine runs Core abilities (roadmap issue 8): a cost modifier for the card's own ability is no longer folded away, and its text lives in the modified ability (Tamiyo's Logbook)

import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { MatchService } from "../../../src/server/match/match.service";
import { matchView } from "../../../src/server/match/match-view";
import { readCatalog } from "../../../src/server/catalog/catalog-files";
import "../../support/round-trip";
import { commanderFixture, emptyRoom } from "../../support/rules-game";
import { force } from "../../support/force";
import { author } from "../../support/authored";

test("Commander setup designates commanders before private opening draws and enforces construction and support", () => {
  const service = new MatchService();
  const { room, catalog, commander } = commanderFixture();
  const match = service.createCommander(room, catalog, room.participants[1].id);
  const view = matchView(match, room.participants[0].id);
  expect(view.players.map((p) => p.life)).toEqual(["40", "40"]);
  expect(
    view.zones.filter((z) => z.kind === "library").map((z) => z.count),
  ).toEqual([92, 92]);
  expect(
    view.zones.filter((z) => z.kind === "hand").map((z) => z.count),
  ).toEqual([7, 7]);
  expect(
    Object.values(view.objects).filter(
      (o) => o.zoneId === view.zones.find((z) => z.kind === "command")!.id,
    ),
  ).toHaveLength(2);
  expect(Object.values(view.instances).filter((i) => i.commander)).toHaveLength(
    2,
  );
  expect(
    view.zones.find(
      (z) => z.kind === "hand" && z.ownerId !== view.players[0].id,
    )!.objectIds,
  ).toBeUndefined();
  catalog.definitions[commander].automationStatus = "unimplemented";
  expect(() => service.createCommander(room, catalog)).toThrow(
    "Unsupported cards",
  );
  catalog.definitions[commander].automationStatus = "implemented";
  catalog.definitions[commander].colorIdentity = [];
  expect(() => service.createCommander(room, catalog)).toThrow(
    "Color Identity",
  );
});

test("opening choices and explicit Priority passes perform the first turn draw and prohibit out-of-turn actions", () => {
  const service = new MatchService();
  const { room, catalog } = commanderFixture();
  const match = service.createCommander(room, catalog, room.participants[0].id);
  const command = (
    seat: number,
    action: import("../../../src/shared/rules-state").MatchAction,
  ) => service.execute(match, room.participants[seat], action, catalog);
  expect(command(0, { type: "pass-priority" }).kind).toBe("rejected");
  expect(
    command(0, { type: "mulligan", playerId: match.players[0].id }).kind,
  ).toBe("accepted");
  const hand = matchView(match, room.participants[0].id).zones.find(
    (z) => z.kind === "hand" && z.ownerId === match.players[0].id,
  )!;
  expect(command(0, { type: "keep-hand", bottomIds: [] }).kind).toBe(
    "rejected",
  );
  expect(
    command(0, { type: "keep-hand", bottomIds: [hand.objectIds![0]] }).kind,
  ).toBe("accepted");
  expect(command(1, { type: "keep-hand", bottomIds: [] }).kind).toBe(
    "accepted",
  );
  expect(match.turn.stepIndex).toBe(1);
  expect(match.priority?.playerId).toBe(match.players[0].id);
  expect(command(1, { type: "pass-priority" }).kind).toBe("rejected");
  expect(command(0, { type: "pass-priority" }).kind).toBe("accepted");
  expect(match.turn.stepIndex).toBe(1);
  expect(command(1, { type: "pass-priority" }).kind).toBe("accepted");
  expect(match.turn.stepIndex).toBe(2);
  expect(
    matchView(match, room.participants[0].id).zones.find(
      (z) => z.kind === "hand" && z.ownerId === match.players[0].id,
    )!.count,
  ).toBe(6);
  expect(
    command(0, JSON.parse('{"type":"turn","direction":"next"}')).kind,
  ).toBe("rejected");
});

test("Sai and Padeem are supported commanders, and Graaz cannot lead blue cards", async () => {
  const release = structuredClone(await readCatalog("catalog"));
  for (const name of [
    "Sai, Master Thopterist",
    "Padeem, Consul of Innovation",
    "Graaz, Unstoppable Juggernaut",
  ]) {
    const { room, catalog, commander } = commanderFixture();
    const chosen = Object.values(release.definitions).find(
      (card) => card.canonicalName === name,
    )!;
    catalog.definitions[commander] = {
      ...structuredClone(chosen),
      id: commander,
      defaultPrintingId: catalog.definitions[commander].defaultPrintingId,
    };
    if (name !== "Graaz, Unstoppable Juggernaut") {
      expect(() =>
        new MatchService().createCommander(room, catalog),
      ).not.toThrow();
      continue;
    }
    expect(() => new MatchService().createCommander(room, catalog)).toThrow(
      name === "Graaz, Unstoppable Juggernaut"
        ? "Color Identity"
        : "Unsupported cards",
    );
  }
});

test("Commander setup accepts validated ordered cards and rejects unknown result bindings", async () => {
  const { room, catalog, island } = commanderFixture();
  const release = structuredClone(await readCatalog("catalog"));
  for (const name of ["Thirst for Knowledge", "Pull from Tomorrow"]) {
    const card = Object.values(release.definitions).find(
      (card) => card.canonicalName === name,
    )!;
    catalog.definitions[card.id] = structuredClone(card);
    catalog.printings[card.defaultPrintingId] =
      release.printings[card.defaultPrintingId];
    for (const participant of room.participants) {
      participant.deck!.entries.find((entry) => entry.definitionId === island)!
        .quantity--;
      participant.deck!.entries.push({
        definitionId: card.id,
        printingId: card.defaultPrintingId,
        quantity: 1,
      });
    }
  }
  expect(() => new MatchService().createCommander(room, catalog)).not.toThrow();
  const pull = Object.values(catalog.definitions).find(
    (card) => card.canonicalName === "Pull from Tomorrow",
  )!;
  await expect(
    author(structuredClone(pull), [
      {
        id: "spell",
        kind: "spell",
        effects: [{ kind: "draw", count: { binding: "missing" } }],
      },
    ]),
  ).rejects.toThrow(
    'abilities[0].effects[0].count: Unknown binding "missing".',
  );
});

for (const name of [
  "Research Thief",
  "Thopter Fabricator",
  "Skysovereign, Consul Flagship",
  "Myr Battlesphere",
  "Adaptive Omnitool",
  "Misleading Signpost",
  "Steel Hellkite",
  "Scrawling Crawler",
  "Psychosis Crawler",
  "Mind's Eye",
  "Thought Vessel",
  "Thopter Spy Network",
  "Shimmer Dragon",
]) {
  test(`${name} passes Commander setup with complete validated automation`, async () => {
    const release = structuredClone(await readCatalog("catalog"));
    const { room, catalog, commander } = commanderFixture();
    const card = Object.values(release.definitions).find(
      (c) => c.canonicalName === name,
    )!;
    expect(card.automationStatus).toBe("implemented");
    expect(card.abilities.length).toBeGreaterThan(0);
    catalog.definitions[card.id] = card;
    catalog.printings[card.defaultPrintingId] =
      release.printings[card.defaultPrintingId];
    room.participants[0].deck!.entries[1].quantity = 98;
    room.participants[0].deck!.entries.push({
      definitionId: card.id,
      printingId: card.defaultPrintingId,
      quantity: 1,
    });
    expect(() =>
      new MatchService().createCommander(room, catalog),
    ).not.toThrow();
  });
}

test("newly completed protection, flying, Vehicle and requirement definitions pass normal Commander setup", async () => {
  const release = await readCatalog("catalog");
  for (const name of [
    "Darksteel Citadel",
    "Darksteel Juggernaut",
    "Shimmer Myr",
    "Ornithopter of Paradise",
    "Cultivator's Caravan",
    "Propaganda",
    "Graaz, Unstoppable Juggernaut",
    "Broodstar",
    "Memory Guardian",
    "Spire Golem",
    "Thought Monitor",
  ]) {
    const { room, catalog } = commanderFixture();
    const card = Object.values(release.definitions).find(
      (c) => c.canonicalName === name,
    )!;
    catalog.definitions[card.id] = structuredClone(card);
    catalog.printings[card.defaultPrintingId] =
      release.printings[card.defaultPrintingId];
    room.participants[0].deck!.entries[1].quantity--;
    room.participants[0].deck!.entries.push({
      definitionId: card.id,
      printingId: card.defaultPrintingId,
      quantity: 1,
    });
    expect(
      () => new MatchService().createCommander(room, catalog),
      name,
    ).not.toThrow();
  }
});

test("the complete mono-U pool resolves to 100 cards and 67 supported definitions in mirror and practice setup", async () => {
  const { readFile } = await import("node:fs/promises");
  const { CatalogService } =
    await import("../../../src/server/catalog/catalog.service");
  const { automationEligible } =
    await import("../../../src/server/match/commander");
  const catalog = await readCatalog("catalog");
  const entries = new CatalogService().resolveDecklist(
    await readFile("sample-decklists/mono-u.md", "utf8"),
    catalog,
  );
  expect(entries.reduce((n, e) => n + e.quantity, 0)).toBe(100);
  expect(new Set(entries.map((e) => e.definitionId)).size).toBe(67);
  expect(
    entries
      .filter((e) => !automationEligible(catalog.definitions[e.definitionId]))
      .map((e) => catalog.definitions[e.definitionId].canonicalName),
  ).toEqual([]);
  const room = emptyRoom();
  const sai = Object.values(catalog.definitions).find(
    (d) => d.canonicalName === "Sai, Master Thopterist",
  )!;
  room.participants[0].deck!.entries = entries;
  room.participants[0].deck!.commanderId = sai.id;
  room.participants.push({
    ...structuredClone(room.participants[0]),
    id: randomUUID(),
    name: "Bob",
  });
  const mirror = new MatchService().createCommander(
    room,
    catalog,
    room.participants[0].id,
  );
  expect(Object.keys(mirror.instances)).toHaveLength(200);
  expect(new Set(Object.keys(mirror.instances)).size).toBe(200);
  room.participants.pop();
  const practice = new MatchService().createCommander(
    room,
    catalog,
    room.participants[0].id,
  );
  expect(practice.rules!.practice).toBeDefined();
  expect(Object.keys(practice.instances)).toHaveLength(200);
});

for (const [keyword, cardName] of [
  ["Ward", "Kappa Cannoneer"],
  ["Improvise", "Kappa Cannoneer"],
  ["Cycling", "Lonely Sandbar"],
  ["Affinity", "Thoughtcast"],
])
  test(`Commander setup rejects a card without its authored ${keyword} ability`, async () => {
    const release = await readCatalog("catalog");
    const { room, catalog } = commanderFixture();
    const kappa = structuredClone(
      Object.values(release.definitions).find(
        (d) => d.canonicalName === cardName,
      )!,
    );
    const authored = kappa.authoredAbilities.filter(
      (a) =>
        a.kind !== "keyword" ||
        typeof a.keyword === "string" ||
        a.keyword.name !== keyword.toLowerCase(),
    );
    expect(authored).toHaveLength(kappa.authoredAbilities.length - 1);
    await author(kappa, authored);
    catalog.definitions[kappa.id] = kappa;
    catalog.printings[kappa.defaultPrintingId] =
      release.printings[kappa.defaultPrintingId];
    room.participants[0].deck!.entries[1].quantity--;
    room.participants[0].deck!.entries.push({
      definitionId: kappa.id,
      printingId: kappa.defaultPrintingId,
      quantity: 1,
    });
    expect(() => new MatchService().createCommander(room, catalog)).toThrow(
      `Unsupported cards: ${cardName}`,
    );
  });

test("implemented catalog abilities retain exact rules descriptions and expose readable activation choices", async () => {
  const { resolve } = await import("node:path");
  const { RulesEngine } =
    await import("../../../src/server/match/rules-engine");
  const released = await readCatalog(resolve("catalog"));
  const implemented = Object.values(released.definitions).filter(
    (card) => card.automationStatus === "implemented",
  );
  expect(implemented.length).toBeGreaterThan(0);
  // A cost modifier for the card's own ability has no text of its own: the
  // modified ability's description holds it (Tamiyo's Logbook).
  const ownCostModifier = (
    ability: (typeof implemented)[number]["abilities"][number],
  ) =>
    ability.kind === "static" &&
    ability.grants.every(
      (g) =>
        g.kind === "cost-modifier" &&
        typeof g.applies === "object" &&
        "abilitiesOf" in g.applies,
    );
  for (const card of implemented) {
    for (const ability of card.abilities) {
      if (ownCostModifier(ability)) continue;
      expect(
        ability.description,
        `${card.canonicalName}: ${ability.id}`,
      ).toBeTruthy();
      expect(card.oracleText).toContain(ability.description!);
    }
  }
  const { room, catalog } = commanderFixture();
  const match = new MatchService().createCommander(
    room,
    catalog,
    room.participants[0].id,
  );
  const player = match.players[0];
  force.rules(match, {
    setup: {
      ...match.rules!.setup,
      keptPlayerIds: match.players.map((seat) => seat.id),
    },
    commanders: {
      ...match.rules!.commanders,
      [player.id]: {
        ...match.rules!.commanders[player.id],
        colorIdentity: ["U", "R"],
      },
    },
  });
  force.priority(match, player.id);
  const objects = new Map<string, string>();
  for (const name of [
    "Sai, Master Thopterist",
    "Mind Stone",
    "Arcane Signet",
  ]) {
    const definition = implemented.find((card) => card.canonicalName === name)!;
    catalog.definitions[definition.id] = definition;
    const object = force.card(match, definition, "battlefield", player.id);
    objects.set(name, object.id);
  }
  const actions = new RulesEngine(match, catalog).actions(player.id);
  const forCard = (name: string) =>
    actions.filter(
      ({ action }) =>
        action.type === "activate-ability" &&
        action.objectId === objects.get(name),
    );
  expect(forCard("Sai, Master Thopterist").map(({ label }) => label)).toEqual([
    "{1}{U}, Sacrifice two artifacts: Draw a card.",
  ]);
  expect(forCard("Mind Stone").map(({ label }) => label)).toEqual([
    "{T}: Add {C}.",
    "{1}, {T}, Sacrifice this artifact: Draw a card.",
  ]);
  expect(forCard("Arcane Signet").map(({ label }) => label)).toEqual([
    "{T}: Add one mana of any color in your commander's color identity. Choose {U}.",
    "{T}: Add one mana of any color in your commander's color identity. Choose {R}.",
  ]);
});
