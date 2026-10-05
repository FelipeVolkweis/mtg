import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { MatchService } from "../src/server/match/match.service";
import { matchView } from "../src/server/match/match-view";
import type { Catalog, Participant, RoomState } from "../src/shared/model";

function emptyRoom(): RoomState {
  const participant: Participant = {
    id: randomUUID(),
    name: "Alice",
    credentialHash: "",
    ready: true,
    selectedDecklistId: randomUUID(),
    decklists: [],
  };
  participant.decklists.push({
    id: participant.selectedDecklistId!,
    name: "Empty",
    text: "",
    entries: [],
  });
  return {
    id: randomUUID(),
    invite: "",
    revision: 0,
    lastActivity: 0,
    participants: [participant],
  };
}
const emptyCatalog: Catalog = {
  definitions: {},
  printings: {},
  names: {},
  importedSets: [],
};

function commanderFixture() {
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
    p.selectedCommanderId = commander;
    p.decklists[0].entries = [
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
    action: import("../src/shared/model").MatchAction,
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

test("lands and simple spells use selected mana sources and retain casting identity after resolution", () => {
  const service = new MatchService();
  const { room, catalog } = commanderFixture();
  const match = service.createCommander(room, catalog, room.participants[0].id);
  const command = (
    seat: number,
    action: import("../src/shared/model").MatchAction,
  ) => service.execute(match, room.participants[seat], action, catalog);
  for (let seat = 0; seat < 2; seat++)
    command(seat, { type: "keep-hand", bottomIds: [] });
  for (let step = 0; step < 2; step++)
    for (let seat = 0; seat < 2; seat++)
      command(seat, { type: "pass-priority" });
  const hand = matchView(match, room.participants[0].id).zones.find(
    (z) => z.kind === "hand" && z.ownerId === match.players[0].id,
  )!;
  expect(
    command(0, { type: "play-land", objectId: hand.objectIds![0] }).kind,
  ).toBe("accepted");
  expect(
    command(0, { type: "play-land", objectId: hand.objectIds![1] }).kind,
  ).toBe("rejected");
  const land = Object.values(match.objects).find(
    (o) => o.zoneId === match.zones.find((z) => z.kind === "battlefield")!.id,
  )!;
  expect(
    command(0, {
      type: "activate-ability",
      objectId: land.id,
      abilityId: "intrinsic-Island",
    }).kind,
  ).toBe("accepted");
  expect(match.rules!.mana[match.players[0].id].U).toBe(1);
  const commanderObject = Object.values(match.objects).find(
    (o) =>
      o.controllerId === match.players[0].id &&
      o.zoneId === match.zones.find((z) => z.kind === "command")!.id,
  )!;
  // This fixture begins with a simple permanent in Hand; Commander casting is ticket 28.
  const handState = match.zones.find((z) => z.id === hand.id)!;
  const commandZone = match.zones.find((z) => z.kind === "command")!;
  commandZone.objectIds.splice(
    commandZone.objectIds.indexOf(commanderObject.id),
    1,
  );
  handState.objectIds.push(commanderObject.id);
  commanderObject.zoneId = handState.id;
  const instanceId = commanderObject.cardInstanceIds[0];
  expect(
    command(0, { type: "cast-spell", objectId: commanderObject.id }).kind,
  ).toBe("accepted");
  expect(match.rules!.mana[match.players[0].id].U).toBe(0);
  expect(match.zones.find((z) => z.kind === "stack")!.objectIds).toHaveLength(
    1,
  );
  command(0, { type: "pass-priority" });
  command(1, { type: "pass-priority" });
  const permanent = Object.values(match.objects).find((o) =>
    o.cardInstanceIds.includes(instanceId),
  )!;
  expect(permanent.zoneId).toBe(land.zoneId);
  expect(permanent.id).not.toBe(commanderObject.id);
  expect(permanent.casting?.manaSpent).toEqual(["U"]);
});

import { readCatalog } from "../src/server/catalog/catalog-files";
import { gameObject, moveObject } from "../src/server/match/game-objects";

async function rulesGame() {
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
  const command = (
    seat: number,
    action: import("../src/shared/model").MatchAction,
  ) => service.execute(match, fixture.room.participants[seat], action, catalog);
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
    const player = match.players[seat];
    const zone = match.zones.find(
      (zone) =>
        zone.kind === kind &&
        (kind === "battlefield" || zone.ownerId === player.id),
    )!;
    const instanceId = randomUUID();
    match.instances[instanceId] = {
      id: instanceId,
      ownerId: player.id,
      definitionId: definition.id,
      printingId: definition.defaultPrintingId,
    };
    const object = gameObject(
      "card",
      zone.id,
      player.id,
      definition.components[0],
    );
    object.cardInstanceIds = [instanceId];
    match.objects[object.id] = object;
    zone.objectIds.push(object.id);
    match.rules!.controlledSinceTurn[object.id] = 0;
    return object;
  }
  return { service, catalog, room: fixture.room, match, command, seed };
}

test("a casting payment window resumes with chosen sources and spends colored mana before colorless", async () => {
  const game = await rulesGame();
  const { match, command, seed, catalog, room } = game;
  const ring = seed("Sol Ring", "battlefield"),
    spell = seed("Hedron Archive", "hand");
  const playerId = match.players[0].id;
  match.rules!.mana[playerId] = { W: 1, U: 2, B: 0, R: 0, G: 0, C: 0 };
  expect(command(0, { type: "cast-spell", objectId: spell.id }).kind).toBe(
    "pending",
  );
  const pendingId = match.rules!.pending!.id;
  const recovered = JSON.parse(JSON.stringify(match));
  const service = new MatchService();
  expect(
    service.execute(
      recovered,
      room.participants[0],
      { type: "activate-ability", objectId: ring.id, abilityId: "mana" },
      catalog,
    ).kind,
  ).toBe("pending");
  expect(
    service.execute(
      recovered,
      room.participants[0],
      { type: "rules-input", procedureId: pendingId, confirm: true },
      catalog,
    ).kind,
  ).toBe("accepted");
  expect(recovered.rules.mana[playerId]).toEqual({
    W: 0,
    U: 0,
    B: 0,
    R: 0,
    G: 0,
    C: 1,
  });
  const view = matchView(recovered, room.participants[0].id);
  const stackSpell =
    view.objects[view.zones.find((z) => z.kind === "stack")!.objectIds![0]];
  expect(stackSpell.casting?.manaSpent).toEqual(["U", "U", "W", "C"]);
  expect(
    service.execute(
      recovered,
      room.participants[0],
      { type: "rules-input", procedureId: pendingId, confirm: true },
      catalog,
    ).kind,
  ).toBe("rejected");
});

test("Counterspell and Negate select spells rather than ability objects and resolve in Stack order", async () => {
  const { match, command, seed, room } = await rulesGame();
  const permanent = seed("Sol Ring", "hand"),
    negate = seed("Negate", "hand", 1);
  match.rules!.mana[match.players[0].id].C = 1;
  match.rules!.mana[match.players[1].id] = {
    W: 0,
    U: 2,
    B: 0,
    R: 0,
    G: 0,
    C: 1,
  };
  expect(command(0, { type: "cast-spell", objectId: permanent.id }).kind).toBe(
    "accepted",
  );
  command(0, { type: "pass-priority" });
  expect(command(1, { type: "cast-spell", objectId: negate.id }).kind).toBe(
    "pending",
  );
  const pending = match.rules!.pending!;
  expect(pending.stage).toBe("targets");
  const stack = match.zones.find((z) => z.kind === "stack")!;
  const targetId = stack.objectIds[0];
  expect(
    command(1, {
      type: "rules-input",
      procedureId: pending.id,
      targetIds: [randomUUID()],
    }).kind,
  ).toBe("rejected");
  expect(
    command(1, {
      type: "rules-input",
      procedureId: pending.id,
      targetIds: [targetId],
    }).kind,
  ).toBe("accepted");
  command(1, { type: "pass-priority" });
  command(0, { type: "pass-priority" });
  expect(match.zones.find((z) => z.kind === "stack")!.objectIds).toHaveLength(
    0,
  );
  expect(
    matchView(match, room.participants[0].id)
      .zones.filter((z) => z.kind === "graveyard")
      .map((z) => z.count),
  ).toEqual([1, 1]);
});

test("paid draw abilities outlive sacrificed sources and cycling discards from Hand", async () => {
  const { match, command, seed, room } = await rulesGame();
  const stone = seed("Mind Stone", "battlefield");
  match.rules!.mana[match.players[0].id].C = 1;
  expect(
    command(0, {
      type: "activate-ability",
      objectId: stone.id,
      abilityId: "draw",
    }).kind,
  ).toBe("accepted");
  expect(match.objects[stone.id]).toBeUndefined();
  expect(match.zones.find((z) => z.kind === "stack")!.objectIds).toHaveLength(
    1,
  );
  const before = matchView(match, room.participants[0].id).zones.find(
    (z) => z.kind === "hand" && z.ownerId === match.players[0].id,
  )!.count;
  command(0, { type: "pass-priority" });
  command(1, { type: "pass-priority" });
  expect(
    matchView(match, room.participants[0].id).zones.find(
      (z) => z.kind === "hand" && z.ownerId === match.players[0].id,
    )!.count,
  ).toBe(before + 1);
  const sandbar = seed("Lonely Sandbar", "hand");
  match.rules!.mana[match.players[0].id].U = 1;
  expect(
    command(0, {
      type: "activate-ability",
      objectId: sandbar.id,
      abilityId: "cycling",
    }).kind,
  ).toBe("accepted");
  expect(match.objects[sandbar.id]).toBeUndefined();
  command(0, { type: "pass-priority" });
  command(1, { type: "pass-priority" });
  expect(
    matchView(match, room.participants[1].id).zones.find(
      (z) => z.kind === "hand" && z.ownerId === match.players[0].id,
    )!.objectIds,
  ).toBeUndefined();
});

test("mana costs reserve specific colors and use deterministic ties while failed payments preserve resources", async () => {
  const { match, command, seed } = await rulesGame();
  const negate = seed("Negate", "hand"),
    target = seed("Sol Ring", "hand", 1);
  // The initial scenario includes a spell already announced by the other player.
  const targetZone = match.zones.find((z) => z.id === target.zoneId)!;
  targetZone.objectIds.splice(targetZone.objectIds.indexOf(target.id), 1);
  target.zoneId = match.zones.find((z) => z.kind === "stack")!.id;
  match.zones.find((z) => z.kind === "stack")!.objectIds.push(target.id);
  const pool = { W: 2, U: 1, B: 2, R: 0, G: 0, C: 9 };
  match.rules!.mana[match.players[0].id] = pool;
  command(0, { type: "cast-spell", objectId: negate.id });
  const pendingId = match.rules!.pending!.id;
  expect(
    command(0, {
      type: "rules-input",
      procedureId: pendingId,
      targetIds: [target.id],
    }).kind,
  ).toBe("accepted");
  expect(match.rules!.mana[match.players[0].id]).toEqual({
    W: 1,
    U: 0,
    B: 2,
    R: 0,
    G: 0,
    C: 9,
  });
  const spell =
    match.objects[
      match.zones.find((z) => z.kind === "stack")!.objectIds.at(-1)!
    ];
  expect(spell.casting?.manaSpent).toEqual(["U", "W"]);
  const stone = seed("Mind Stone", "battlefield");
  match.rules!.mana[match.players[0].id] = {
    W: 0,
    U: 0,
    B: 0,
    R: 0,
    G: 0,
    C: 0,
  };
  expect(
    command(0, {
      type: "activate-ability",
      objectId: stone.id,
      abilityId: "draw",
    }).kind,
  ).toBe("pending");
  const failedRevision = match.revision;
  expect(
    command(0, {
      type: "rules-input",
      procedureId: match.rules!.pending!.id,
      confirm: true,
    }).kind,
  ).toBe("rejected");
  expect(match.revision).toBe(failedRevision);
  expect(match.objects[stone.id].status.tapped).toBe(false);
});

test("creature tap symbols require control since the player's turn, while selected-object tap costs do not", async () => {
  const { match, command, seed, catalog } = await rulesGame();
  const myr = seed("Silver Myr", "battlefield");
  match.rules!.controlledSinceTurn[myr.id] = match.turn.number;
  expect(
    command(0, {
      type: "activate-ability",
      objectId: myr.id,
      abilityId: "mana",
    }).kind,
  ).toBe("rejected");
  const stone = seed("Mind Stone", "battlefield");
  const definition =
    catalog.definitions[match.instances[stone.cardInstanceIds[0]].definitionId];
  const customized = structuredClone(definition);
  customized.abilities.push({
    id: "selected-tap",
    kind: "activated",
    origin: "printed",
    rules: {
      costs: [
        {
          kind: "tap",
          count: 1,
          filter: {
            zone: "battlefield",
            types: ["Creature"],
            controller: "you",
            untapped: true,
          },
        },
      ],
      effects: [{ kind: "draw", count: 1 }],
    },
  });
  catalog.definitions[customized.id] = customized;
  expect(
    command(0, {
      type: "activate-ability",
      objectId: stone.id,
      abilityId: "selected-tap",
    }).kind,
  ).toBe("pending");
  expect(
    command(0, {
      type: "rules-input",
      procedureId: match.rules!.pending!.id,
      selections: { "0": [myr.id] },
      confirm: true,
    }).kind,
  ).toBe("accepted");
  expect(match.objects[myr.id].status.tapped).toBe(true);
});

test("War Room and Arcane Signet use recorded commander colors after its object leaves Command", async () => {
  const { match, command, seed } = await rulesGame();
  const playerId = match.players[0].id;
  const commander = Object.values(match.objects).find((object) =>
    object.cardInstanceIds.includes(
      match.rules!.commanders[playerId].instanceId,
    ),
  )!;
  moveObject(
    match,
    commander.id,
    match.zones.find(
      (zone) => zone.kind === "graveyard" && zone.ownerId === playerId,
    )!,
  );
  const war = seed("War Room", "battlefield"),
    signet = seed("Arcane Signet", "battlefield");
  match.rules!.mana[playerId].C = 3;
  expect(
    command(0, {
      type: "activate-ability",
      objectId: war.id,
      abilityId: "draw",
    }).kind,
  ).toBe("accepted");
  expect(match.players[0].life).toBe("39");
  expect(
    command(0, {
      type: "activate-ability",
      objectId: signet.id,
      abilityId: "mana",
      color: "R",
    }).kind,
  ).toBe("rejected");
  expect(match.objects[signet.id].status.tapped).toBe(false);
  expect(
    command(0, {
      type: "activate-ability",
      objectId: signet.id,
      abilityId: "mana",
      color: "U",
    }).kind,
  ).toBe("accepted");
  expect(match.rules!.mana[playerId].U).toBe(1);
  command(0, { type: "pass-priority" });
  command(1, { type: "pass-priority" });
});

test("counterspells revalidate targets, reject creature targets for Negate, and respect uncounterable spells", async () => {
  for (const uncounterable of [false, true]) {
    const { match, command, seed } = await rulesGame();
    const creature = seed("Silver Myr", "hand", 1),
      negate = seed("Negate", "hand"),
      counter = seed("Counterspell", "hand");
    match.rules!.mana[match.players[0].id].U = 4;
    const hand = match.zones.find((z) => z.id === creature.zoneId)!;
    hand.objectIds.splice(hand.objectIds.indexOf(creature.id), 1);
    const stack = match.zones.find((z) => z.kind === "stack")!;
    creature.zoneId = stack.id;
    stack.objectIds.push(creature.id);
    creature.cannotBeCountered = uncounterable;
    expect(command(0, { type: "cast-spell", objectId: negate.id }).kind).toBe(
      "rejected",
    );
    expect(command(0, { type: "cast-spell", objectId: counter.id }).kind).toBe(
      "pending",
    );
    command(0, {
      type: "rules-input",
      procedureId: match.rules!.pending!.id,
      targetIds: [creature.id],
    });
    command(0, { type: "pass-priority" });
    command(1, { type: "pass-priority" });
    expect(match.zones.find((z) => z.kind === "stack")!.objectIds.length).toBe(
      uncounterable ? 1 : 0,
    );
  }
});

test("pending casts expose their private source and legal choices only to their controller", async () => {
  const { match, command, seed, room, catalog } = await rulesGame();
  const spell = seed("Hedron Archive", "hand");
  command(0, { type: "cast-spell", objectId: spell.id });
  const owner = matchView(match, room.participants[0].id, catalog),
    opponent = matchView(match, room.participants[1].id, catalog);
  expect(owner.rules!.pending!.sourceId).toBe(spell.id);
  expect(opponent.rules!.pending).toBeUndefined();
  expect(JSON.stringify(opponent)).not.toContain(spell.id);
  expect(opponent.actions).toEqual([]);
  const pending = owner.rules!.pending!;
  expect(
    command(1, { type: "rules-input", procedureId: pending.id, confirm: true })
      .kind,
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

test("turn transitions expire mana, untap only the active player's permanents and require private cleanup choices", async () => {
  const { match, command, seed, room } = await rulesGame();
  const land = seed("Sol Ring", "battlefield");
  land.status.tapped = true;
  match.rules!.mana[match.players[0].id].C = 5;
  // Eight starting cards require exactly one selected discard in cleanup.
  seed("Mind Stone", "hand");
  while (!match.rules!.pending && match.turn.number === 1) {
    const seat = match.players.findIndex(
      (player) => player.id === match.priority!.playerId,
    );
    expect(command(seat, { type: "pass-priority" }).kind).not.toBe("rejected");
  }
  expect(match.turn.stepIndex).toBe(11);
  expect(match.priority).toBeUndefined();
  expect(match.rules!.mana[match.players[0].id].C).toBe(0);
  const hand = matchView(match, room.participants[0].id).zones.find(
    (zone) => zone.kind === "hand" && zone.ownerId === match.players[0].id,
  )!;
  expect(
    command(0, {
      type: "rules-input",
      procedureId: match.rules!.pending!.id,
      selections: { discard: [hand.objectIds![0]] },
      confirm: true,
    }).kind,
  ).toBe("accepted");
  expect(match.turn.number).toBe(2);
  expect(match.turn.stepIndex).toBe(1);
  expect(match.objects[land.id].status.tapped).toBe(true);
  command(1, { type: "pass-priority" });
  command(0, { type: "pass-priority" });
  expect(
    matchView(match, room.participants[1].id).zones.find(
      (zone) => zone.kind === "hand" && zone.ownerId === match.players[1].id,
    )!.count,
  ).toBe(8);
});

for (const [name, color, amount] of [
  ["Sol Ring", "C", 2],
  ["Hedron Archive", "C", 2],
  ["Mind Stone", "C", 1],
  ["Silver Myr", "U", 1],
  ["Palladium Myr", "C", 2],
  ["Ornithopter of Paradise", "G", 1],
  ["Arcane Signet", "U", 1],
  ["War Room", "C", 1],
  ["Lonely Sandbar", "U", 1],
  ["Remote Isle", "U", 1],
] as const) {
  test(`${name} produces only the chosen mana through its authored ability`, async () => {
    const { match, command, seed } = await rulesGame();
    const source = seed(name, "battlefield");
    expect(
      command(0, {
        type: "activate-ability",
        objectId: source.id,
        abilityId: "mana",
        color,
      }).kind,
    ).toBe("accepted");
    expect(match.rules!.mana[match.players[0].id][color]).toBe(amount);
    expect(match.objects[source.id].status.tapped).toBe(true);
    const revision = match.revision;
    expect(
      command(0, {
        type: "activate-ability",
        objectId: source.id,
        abilityId: "mana",
        color,
      }).kind,
    ).toBe("rejected");
    expect(match.revision).toBe(revision);
    expect(match.rules!.mana[match.players[0].id][color]).toBe(amount);
  });
}

test("both cycling lands enter tapped, and Remote Isle and Hedron Archive resolve their complete draw abilities", async () => {
  for (const name of ["Lonely Sandbar", "Remote Isle"]) {
    const { match, command, seed } = await rulesGame();
    const land = seed(name, "hand");
    const instance = land.cardInstanceIds[0];
    expect(command(0, { type: "play-land", objectId: land.id }).kind).toBe(
      "accepted",
    );
    expect(
      Object.values(match.objects).find((object) =>
        object.cardInstanceIds.includes(instance),
      )!.status.tapped,
    ).toBe(true);
  }
  for (const [name, abilityId, generic, draw] of [
    ["Remote Isle", "cycling", 2, 1],
    ["Hedron Archive", "draw", 2, 2],
  ] as const) {
    const { match, command, seed } = await rulesGame();
    const source = seed(name, name === "Remote Isle" ? "hand" : "battlefield");
    const hand = match.zones.find(
      (zone) => zone.kind === "hand" && zone.ownerId === match.players[0].id,
    )!;
    const before = hand.objectIds.length;
    match.rules!.mana[match.players[0].id].C = generic;
    expect(
      command(0, { type: "activate-ability", objectId: source.id, abilityId })
        .kind,
    ).toBe("accepted");
    command(0, { type: "pass-priority" });
    command(1, { type: "pass-priority" });
    expect(
      match.zones.find((zone) => zone.id === hand.id)!.objectIds.length,
    ).toBe(before + draw - (name === "Remote Isle" ? 1 : 0));
  }
});

test("a resolving counterspell does nothing when its target has become illegal", async () => {
  const { match, command, seed } = await rulesGame();
  const target = seed("Sol Ring", "hand", 1),
    counter = seed("Counterspell", "hand");
  const oldHand = match.zones.find((zone) => zone.id === target.zoneId)!;
  oldHand.objectIds.splice(oldHand.objectIds.indexOf(target.id), 1);
  const stack = match.zones.find((zone) => zone.kind === "stack")!;
  target.zoneId = stack.id;
  stack.objectIds.push(target.id);
  match.rules!.mana[match.players[0].id].U = 2;
  command(0, { type: "cast-spell", objectId: counter.id });
  command(0, {
    type: "rules-input",
    procedureId: match.rules!.pending!.id,
    targetIds: [target.id],
  });
  // The resolution fixture has another effect remove the selected spell first.
  const currentStack = match.zones.find((zone) => zone.kind === "stack")!;
  currentStack.objectIds.splice(currentStack.objectIds.indexOf(target.id), 1);
  const grave = match.zones.find(
    (zone) => zone.kind === "graveyard" && zone.ownerId === match.players[1].id,
  )!;
  match.objects[target.id].zoneId = grave.id;
  grave.objectIds.push(target.id);
  command(0, { type: "pass-priority" });
  command(1, { type: "pass-priority" });
  expect(
    match.zones.find((zone) => zone.kind === "stack")!.objectIds,
  ).toHaveLength(0);
  expect(
    match.zones
      .filter((zone) => zone.kind === "graveyard")
      .map((zone) => zone.objectIds.length),
  ).toEqual([1, 1]);
});

test("restricted mana remains unspent for an ineligible spell and retains its restriction after partial spending", async () => {
  const { match, command, seed } = await rulesGame();
  const source = seed("Sol Ring", "battlefield"),
    creature = seed("Silver Myr", "hand"),
    artifact = seed("Sol Ring", "hand");
  const pool = match.rules!.mana[match.players[0].id];
  pool.C = 2;
  match.rules!.restrictedMana = {
    [match.players[0].id]: [
      {
        type: "C",
        amount: 2,
        restriction: { use: "cast", spellTypes: ["Enchantment"] },
      },
    ],
  };
  expect(command(0, { type: "cast-spell", objectId: creature.id }).kind).toBe(
    "pending",
  );
  expect(
    command(0, {
      type: "rules-input",
      procedureId: match.rules!.pending!.id,
      confirm: true,
    }).kind,
  ).toBe("rejected");
  expect(match.rules!.mana[match.players[0].id].C).toBe(2);
  command(0, {
    type: "cancel-procedure",
    procedureId: match.rules!.pending!.id,
  });
  match.rules!.restrictedMana![match.players[0].id][0].restriction.spellTypes =
    ["Artifact"];
  expect(command(0, { type: "cast-spell", objectId: artifact.id }).kind).toBe(
    "accepted",
  );
  expect(match.rules!.restrictedMana![match.players[0].id]).toEqual([
    {
      type: "C",
      amount: 1,
      restriction: { use: "cast", spellTypes: ["Artifact"] },
    },
  ]);
  expect(match.objects[source.id].status.tapped).toBe(false);
});

test("a pending activated procedure resumes without sacrificing twice", async () => {
  const { match, service, command, seed, room, catalog } = await rulesGame();
  const archive = seed("Hedron Archive", "battlefield");
  expect(
    command(0, {
      type: "activate-ability",
      objectId: archive.id,
      abilityId: "draw",
    }).kind,
  ).toBe("pending");
  const id = match.rules!.pending!.id;
  const recovered: import("../src/shared/model").MatchState = JSON.parse(
    JSON.stringify(match),
  );
  recovered.rules!.mana[recovered.players[0].id].C = 2;
  expect(
    service.execute(
      recovered,
      room.participants[0],
      { type: "rules-input", procedureId: id, confirm: true },
      catalog,
    ).kind,
  ).toBe("accepted");
  expect(recovered.objects[archive.id]).toBeUndefined();
  expect(
    recovered.zones.find((zone) => zone.kind === "stack")!.objectIds,
  ).toHaveLength(1);
  const after = JSON.stringify(recovered);
  expect(
    service.execute(
      recovered,
      room.participants[0],
      { type: "rules-input", procedureId: id, confirm: true },
      catalog,
    ).kind,
  ).toBe("rejected");
  expect(JSON.stringify(recovered)).toBe(after);
});

test("cost payment rejects double tapping and supports tapping then sacrificing the same selected permanent", async () => {
  const { match, command, seed, catalog } = await rulesGame();
  const source = seed("Mind Stone", "battlefield");
  const definition = structuredClone(
    catalog.definitions[
      match.instances[source.cardInstanceIds[0]].definitionId
    ],
  );
  definition.abilities.push({
    id: "double-tap",
    kind: "activated",
    origin: "printed",
    rules: {
      costs: [{ kind: "tap-source" }, { kind: "tap-source" }],
      effects: [{ kind: "draw", count: 1 }],
    },
  });
  definition.abilities.push({
    id: "tap-sacrifice",
    kind: "activated",
    origin: "printed",
    rules: {
      costs: [
        {
          kind: "tap",
          count: 1,
          filter: { zone: "battlefield", controller: "you", untapped: true },
        },
        {
          kind: "sacrifice",
          count: 1,
          filter: { zone: "battlefield", controller: "you" },
        },
      ],
      effects: [{ kind: "draw", count: 1 }],
    },
  });
  catalog.definitions[definition.id] = definition;
  expect(
    command(0, {
      type: "activate-ability",
      objectId: source.id,
      abilityId: "double-tap",
    }).kind,
  ).toBe("rejected");
  expect(match.objects[source.id].status.tapped).toBe(false);
  command(0, {
    type: "activate-ability",
    objectId: source.id,
    abilityId: "tap-sacrifice",
  });
  expect(
    command(0, {
      type: "rules-input",
      procedureId: match.rules!.pending!.id,
      selections: { "0": [source.id], "1": [source.id] },
      confirm: true,
    }).kind,
  ).toBe("accepted");
  expect(match.objects[source.id]).toBeUndefined();
});

test("Counterspell cannot select an Ability Game Object on the Stack", async () => {
  const { match, command, seed, catalog, room } = await rulesGame();
  const counter = seed("Counterspell", "hand");
  const stack = match.zones.find((zone) => zone.kind === "stack")!;
  const ability = gameObject("ability", stack.id, match.players[1].id, {
    name: "Draw ability",
    typeLine: "Ability",
    colors: [],
    rulesText: "",
  });
  match.objects[ability.id] = ability;
  stack.objectIds.push(ability.id);
  match.rules!.mana[match.players[0].id].U = 2;
  expect(command(0, { type: "cast-spell", objectId: counter.id }).kind).toBe(
    "rejected",
  );
  expect(
    matchView(match, room.participants[0].id, catalog).actions!.some(
      (item) => item.label === "Cast Counterspell",
    ),
  ).toBe(false);
});

test("Thirst for Knowledge draws before offering private discard alternatives and resumes without drawing twice", async () => {
  const { match, command, seed, catalog, room, service } = await rulesGame();
  const spell = seed("Thirst for Knowledge", "hand");
  const artifact = seed("Mind Stone", "hand");
  const player = match.players[0].id;
  match.rules!.mana[player].U = 3;
  const view = () => matchView(match, room.participants[0].id, catalog);
  const library = () =>
    view().zones.find((z) => z.kind === "library" && z.ownerId === player)!
      .count;
  const before = library();
  expect(command(0, { type: "cast-spell", objectId: spell.id }).kind).toBe(
    "accepted",
  );
  command(0, { type: "pass-priority" });
  expect(command(1, { type: "pass-priority" }).kind).toBe("pending");
  expect(library()).toBe(before - 3);
  const pending = view().rules!.pending!;
  expect(pending.kind).toBe("resolve");
  expect(view().priority).toBeUndefined();
  expect(view().actions).toEqual([]);
  expect(
    matchView(match, room.participants[1].id, catalog).rules!.pending,
  ).toBeUndefined();
  expect(pending.selectionOptions.artifact).toMatchObject({
    count: 1,
    objectIds: [artifact.id],
  });
  expect(pending.selectionOptions.cards.count).toBe(2);
  const restored = JSON.parse(JSON.stringify(match));
  expect(
    service.execute(
      restored,
      room.participants[0],
      {
        type: "rules-input",
        procedureId: pending.id,
        selections: { artifact: [artifact.id] },
        confirm: true,
      },
      catalog,
    ).kind,
  ).toBe("accepted");
  const resumed = matchView(restored, room.participants[0].id, catalog);
  expect(
    resumed.zones.find((z) => z.kind === "library" && z.ownerId === player)!
      .count,
  ).toBe(before - 3);
  expect(resumed.zones.find((z) => z.kind === "stack")!.count).toBe(0);
  expect(
    service.execute(
      restored,
      room.participants[0],
      {
        type: "rules-input",
        procedureId: pending.id,
        selections: { artifact: [artifact.id] },
      },
      catalog,
    ).kind,
  ).toBe("rejected");
});

test("Pull from Tomorrow locks chosen X before mana payment, draws X, and allows a newly drawn discard", async () => {
  const { match, command, seed, catalog, room } = await rulesGame();
  const player = match.players[0].id;
  const spell = seed("Pull from Tomorrow", "hand");
  match.rules!.mana[player].U = 4;
  const view = () => matchView(match, room.participants[0].id, catalog);
  const hand = () =>
    view().zones.find((z) => z.kind === "hand" && z.ownerId === player)!;
  const oldHand = [...hand().objectIds!];
  expect(command(0, { type: "cast-spell", objectId: spell.id }).kind).toBe(
    "pending",
  );
  const choose = view().rules!.pending!;
  expect(choose.stage).toBe("variable");
  expect(
    command(0, {
      type: "rules-input",
      procedureId: choose.id,
      variables: { X: -1 },
    }).kind,
  ).toBe("rejected");
  expect(
    command(0, {
      type: "rules-input",
      procedureId: choose.id,
      variables: { X: 2 },
    }).kind,
  ).toBe("pending");
  const payment = view().rules!.pending!;
  expect(payment.totalCost).toMatchObject({ U: 2, generic: 2 });
  expect(
    command(0, {
      type: "rules-input",
      procedureId: choose.id,
      variables: { X: 0 },
    }).kind,
  ).toBe("rejected");
  expect(
    command(0, {
      type: "rules-input",
      procedureId: payment.id,
      variables: { X: 0 },
    }).kind,
  ).toBe("rejected");
  expect(
    command(0, { type: "rules-input", procedureId: payment.id, confirm: true })
      .kind,
  ).toBe("accepted");
  const stack = view().zones.find((z) => z.kind === "stack")!;
  expect(view().objects[stack.objectIds![0]].casting?.chosenX).toBe("2");
  expect(view().rules!.mana[player].U).toBe(0);
  command(0, { type: "pass-priority" });
  command(1, { type: "pass-priority" });
  const pending = view().rules!.pending!;
  const drawn = hand().objectIds!.filter((id) => !oldHand.includes(id));
  expect(drawn).toHaveLength(2);
  expect(pending.selectionOptions.discard.objectIds).toEqual(
    expect.arrayContaining(drawn),
  );
  expect(
    command(1, {
      type: "rules-input",
      procedureId: pending.id,
      selections: { discard: [drawn[0]] },
    }).kind,
  ).toBe("rejected");
  expect(
    command(0, { type: "cancel-procedure", procedureId: pending.id }).kind,
  ).toBe("rejected");
  const before = view();
  expect(
    command(0, {
      type: "rules-input",
      procedureId: pending.id,
      selections: { discard: [drawn[0], drawn[0]] },
    }).kind,
  ).toBe("rejected");
  expect(view()).toEqual(before);
  expect(
    command(0, {
      type: "rules-input",
      procedureId: pending.id,
      selections: { discard: [drawn[0]] },
    }).kind,
  ).toBe("accepted");
  expect(hand().objectIds).not.toContain(drawn[0]);
  expect(view().priority?.playerId).toBe(player);
});

for (const name of ["Thirst for Knowledge", "Pull from Tomorrow"]) {
  test(`${name} completes partial draws and discards before checking a failed draw`, async () => {
    const { match, command, seed, catalog, room } = await rulesGame();
    const player = match.players[0].id;
    const hand = match.zones.find(
      (z) => z.kind === "hand" && z.ownerId === player,
    )!;
    const library = match.zones.find(
      (z) => z.kind === "library" && z.ownerId === player,
    )!;
    for (const id of [...hand.objectIds, ...library.objectIds.slice(1)]) {
      delete match.objects[id];
    }
    hand.objectIds = [];
    library.objectIds = library.objectIds.slice(0, 1);
    const spell = seed(name, "hand");
    match.rules!.mana[player].U = 5;
    expect(command(0, { type: "cast-spell", objectId: spell.id }).kind).toBe(
      name === "Pull from Tomorrow" ? "pending" : "accepted",
    );
    if (name === "Pull from Tomorrow") {
      command(0, {
        type: "rules-input",
        procedureId: match.rules!.pending!.id,
        variables: { X: 3 },
      });
      command(0, {
        type: "rules-input",
        procedureId: match.rules!.pending!.id,
        confirm: true,
      });
    }
    command(0, { type: "pass-priority" });
    expect(command(1, { type: "pass-priority" }).kind).toBe("pending");
    const view = matchView(match, room.participants[0].id, catalog);
    expect(view.outcome).toBe("ongoing");
    expect(view.players[0].outcome).toBe("playing");
    expect(view.priority).toBeUndefined();
    const pending = view.rules!.pending!;
    const key = name === "Thirst for Knowledge" ? "cards" : "discard";
    expect(Object.keys(pending.selectionOptions)).toEqual([key]);
    expect(pending.selectionOptions[key]).toMatchObject({
      count: 1,
      requestedCount: name === "Thirst for Knowledge" ? 2 : 1,
    });
    const ids = pending.selectionOptions[key].objectIds;
    expect(
      command(0, {
        type: "rules-input",
        procedureId: pending.id,
        selections: { [key]: ids },
      }).kind,
    ).toBe("accepted");
    const after = matchView(match, room.participants[0].id, catalog);
    expect(after.outcome).toBe("complete");
    expect(after.players[0].outcome).toBe("lost");
    expect(
      after.zones.find((z) => z.kind === "hand" && z.ownerId === player)!.count,
    ).toBe(0);
    expect(
      after.zones.find((z) => z.kind === "graveyard" && z.ownerId === player)!
        .count,
    ).toBe(2);
  });
}

test("zero X with an empty Hand skips the impossible discard without attempting a draw", async () => {
  const { match, command, seed, catalog, room } = await rulesGame();
  const player = match.players[0].id;
  const hand = match.zones.find(
    (z) => z.kind === "hand" && z.ownerId === player,
  )!;
  for (const id of hand.objectIds) delete match.objects[id];
  hand.objectIds = [];
  const spell = seed("Pull from Tomorrow", "hand");
  match.rules!.mana[player].U = 2;
  command(0, { type: "cast-spell", objectId: spell.id });
  command(0, {
    type: "rules-input",
    procedureId: match.rules!.pending!.id,
    variables: { X: 0 },
  });
  command(0, {
    type: "rules-input",
    procedureId: match.rules!.pending!.id,
    confirm: true,
  });
  command(0, { type: "pass-priority" });
  expect(command(1, { type: "pass-priority" }).kind).toBe("accepted");
  const view = matchView(match, room.participants[0].id, catalog);
  expect(view.rules!.pending).toBeUndefined();
  expect(view.outcome).toBe("ongoing");
  expect(
    view.zones.find((z) => z.kind === "library" && z.ownerId === player)!.count,
  ).toBe(92);
});

test("nested sequences bind results, take conditions, and rotate choice identifiers across reconnects", async () => {
  const { match, command, seed, catalog, room, service } = await rulesGame();
  const spell = seed("Thirst for Knowledge", "hand");
  const definition = Object.values(catalog.definitions).find(
    (card) => card.canonicalName === "Thirst for Knowledge",
  )!;
  definition.abilities[0].rules = {
    costs: [],
    effects: [
      {
        kind: "sequence",
        effects: [
          { kind: "draw", count: 1, bind: "drawn" },
          { kind: "discard", count: 1, bind: "discarded" },
          {
            kind: "if",
            condition: { binding: "discarded", atLeast: 1 },
            then: [
              { kind: "draw", count: { binding: "drawn" } },
              { kind: "discard", count: 1 },
            ],
            otherwise: [{ kind: "draw", count: 3 }],
          },
        ],
      },
    ],
  };
  const player = match.players[0].id;
  match.rules!.mana[player].U = 3;
  command(0, { type: "cast-spell", objectId: spell.id });
  command(0, { type: "pass-priority" });
  command(1, { type: "pass-priority" });
  const view = () => matchView(match, room.participants[0].id, catalog);
  const first = view().rules!.pending!;
  command(0, {
    type: "rules-input",
    procedureId: first.id,
    selections: { discard: [first.selectionOptions.discard.objectIds[0]] },
  });
  const second = view().rules!.pending!;
  expect(second.id).not.toBe(first.id);
  expect(
    view().zones.find((z) => z.kind === "library" && z.ownerId === player)!
      .count,
  ).toBe(90);
  expect(
    JSON.stringify(matchView(match, room.participants[1].id, catalog)),
  ).not.toContain(second.selectionOptions.discard.objectIds[0]);
  const before = view();
  expect(
    command(0, {
      type: "rules-input",
      procedureId: first.id,
      selections: { discard: [second.selectionOptions.discard.objectIds[0]] },
    }).kind,
  ).toBe("rejected");
  expect(view()).toEqual(before);
  const restored = JSON.parse(JSON.stringify(match));
  expect(
    service.execute(
      restored,
      room.participants[0],
      {
        type: "rules-input",
        procedureId: second.id,
        selections: { discard: [second.selectionOptions.discard.objectIds[0]] },
      },
      catalog,
    ).kind,
  ).toBe("accepted");
  const done = matchView(restored, room.participants[0].id, catalog);
  expect(
    done.zones.find((z) => z.kind === "library" && z.ownerId === player)!.count,
  ).toBe(90);
  expect(done.zones.find((z) => z.kind === "stack")!.count).toBe(0);
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
      participant.decklists[0].entries.find(
        (entry) => entry.definitionId === island,
      )!.quantity--;
      participant.decklists[0].entries.push({
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
  pull.abilities[0].rules!.effects = [
    { kind: "draw", count: { binding: "missing" } },
  ];
  expect(() => new MatchService().createCommander(room, catalog)).toThrow(
    "Unsupported cards: Pull from Tomorrow",
  );
});

test("Wellspring entry triggers draw privately after the permanent resolves", async () => {
  const { match, command, seed, room, catalog } = await rulesGame();
  const spell = seed("Ichor Wellspring", "hand");
  match.rules!.mana[match.players[0].id].C = 2;
  const view = () => matchView(match, room.participants[0].id, catalog);
  const handCount = () =>
    view().zones.find(
      (z) => z.kind === "hand" && z.ownerId === match.players[0].id,
    )!.count;
  const before = handCount();
  expect(command(0, { type: "cast-spell", objectId: spell.id }).kind).toBe(
    "accepted",
  );
  command(0, { type: "pass-priority" });
  command(1, { type: "pass-priority" });
  const stack = view().zones.find((z) => z.kind === "stack")!;
  expect(stack.count).toBe(1);
  expect(view().objects[stack.objectIds![0]].kind).toBe("ability");
  expect(handCount()).toBe(before - 1);
  command(0, { type: "pass-priority" });
  command(1, { type: "pass-priority" });
  expect(handCount()).toBe(before);
  expect(
    matchView(match, room.participants[1].id, catalog).zones.find(
      (z) => z.kind === "hand" && z.ownerId === match.players[0].id,
    )!.objectIds,
  ).toBeUndefined();
});

test("artifact cast triggers keep their chosen Stack order across reconnects and tokens have no Card Instance", async () => {
  const { match, command, seed, room, catalog, service } = await rulesGame();
  seed("Sai, Master Thopterist", "battlefield");
  seed("Vedalken Archmage", "battlefield");
  const spell = seed("Sol Ring", "hand");
  match.rules!.mana[match.players[0].id].C = 1;
  expect(command(0, { type: "cast-spell", objectId: spell.id }).kind).toBe(
    "pending",
  );
  const own = matchView(match, room.participants[0].id, catalog);
  expect(own.rules!.pending!.kind).toBe("trigger-order");
  expect(
    matchView(match, room.participants[1].id, catalog).rules!.pending,
  ).toBeUndefined();
  const recovered = JSON.parse(JSON.stringify(match));
  const pending = own.rules!.pending!;
  const ids = pending.selectionOptions.order.objectIds;
  const order = [...ids].sort((a, b) =>
    pending.selectionOptions.order.labels![a].startsWith("Sai") ? -1 : 1,
  );
  const send = (
    seat: number,
    action: import("../src/shared/model").MatchAction,
  ) => service.execute(recovered, room.participants[seat], action, catalog);
  expect(
    send(0, {
      type: "rules-input",
      procedureId: pending.id,
      selections: { order: [ids[0], ids[0]] },
    }).kind,
  ).toBe("rejected");
  expect(
    send(0, {
      type: "rules-input",
      procedureId: pending.id,
      selections: { order },
    }).kind,
  ).toBe("accepted");
  expect(
    send(0, {
      type: "rules-input",
      procedureId: pending.id,
      selections: { order },
    }).kind,
  ).toBe("rejected");
  const view = () => matchView(recovered, room.participants[0].id, catalog);
  const stack = view().zones.find((z) => z.kind === "stack")!;
  expect(
    stack.objectIds!.map((id) => view().objects[id].characteristics.name),
  ).toEqual([
    "Sol Ring",
    "Sai, Master Thopterist: artifact-cast",
    "Vedalken Archmage: artifact-cast",
  ]);
  for (let i = 0; i < 2; i++) {
    send(0, { type: "pass-priority" });
    send(1, { type: "pass-priority" });
  }
  const thopter = Object.values(view().objects).find(
    (o) => o.kind === "token",
  )!;
  expect(thopter.characteristics).toMatchObject({
    name: "Thopter",
    types: ["Artifact", "Creature"],
    power: "1",
    toughness: "1",
    keywords: ["Flying"],
    colors: [],
  });
  expect(thopter.cardInstanceIds).toEqual([]);
  expect(thopter.ownerId).toBe(recovered.players[0].id);
});

test("Wellspring sacrificed during Sai payment triggers above the paid ability and both draw independently", async () => {
  const { match, command, seed, room, catalog } = await rulesGame();
  const sai = seed("Sai, Master Thopterist", "battlefield"),
    well = seed("Ichor Wellspring", "battlefield"),
    stone = seed("Mind Stone", "battlefield");
  match.rules!.mana[match.players[0].id].U = 2;
  expect(
    command(0, {
      type: "activate-ability",
      objectId: sai.id,
      abilityId: "draw",
    }).kind,
  ).toBe("pending");
  const pending = matchView(match, room.participants[0].id, catalog).rules!
    .pending!;
  expect(
    command(0, {
      type: "rules-input",
      procedureId: pending.id,
      selections: { "1": [well.id, stone.id] },
    }).kind,
  ).toBe("accepted");
  const view = () => matchView(match, room.participants[0].id, catalog);
  const stack = view().zones.find((z) => z.kind === "stack")!;
  expect(
    stack.objectIds!.map((id) => view().objects[id].characteristics.name),
  ).toEqual(["Sai, Master Thopterist: draw", "Ichor Wellspring: graveyard"]);
  const before = view().zones.find(
    (z) => z.kind === "hand" && z.ownerId === match.players[0].id,
  )!.count;
  for (let i = 0; i < 2; i++) {
    command(0, { type: "pass-priority" });
    command(1, { type: "pass-priority" });
  }
  expect(
    view().zones.find(
      (z) => z.kind === "hand" && z.ownerId === match.players[0].id,
    )!.count,
  ).toBe(before + 2);
});

test("continuous artifact bonuses, characteristic-defining counts and Overseer counters compose in player views", async () => {
  const { match, command, seed, room, catalog } = await rulesGame();
  const chief = seed("Chief of the Foundry", "battlefield"),
    master = seed("Master of Etherium", "battlefield"),
    overseer = seed("Steel Overseer", "battlefield");
  seed("Sol Ring", "battlefield");
  seed("Chief of the Foundry", "battlefield", 1);
  const view = () => matchView(match, room.participants[0].id, catalog);
  expect(view().objects[master.id].characteristics).toMatchObject({
    power: "5",
    toughness: "5",
  });
  expect(view().objects[chief.id].characteristics).toMatchObject({
    power: "3",
    toughness: "4",
  });
  expect(
    command(0, {
      type: "activate-ability",
      objectId: overseer.id,
      abilityId: "counters",
    }).kind,
  ).toBe("accepted");
  command(0, { type: "pass-priority" });
  command(1, { type: "pass-priority" });
  expect(view().objects[master.id].characteristics).toMatchObject({
    power: "6",
    toughness: "6",
  });
  expect(view().objects[overseer.id].characteristics).toMatchObject({
    power: "4",
    toughness: "4",
  });
  expect(view().objects[overseer.id].counters).toEqual([
    { kind: "+1/+1", quantity: "1" },
  ]);
  expect(view().objects[chief.id].components![0].power).toBe("2");
});

test("stacked artifact discounts and affinity reduce generic cost while preserving blue payment", async () => {
  const { match, command, seed, room, catalog } = await rulesGame();
  seed("Etherium Sculptor", "battlefield");
  seed("Foundry Inspector", "battlefield");
  const archive = seed("Hedron Archive", "hand");
  expect(command(0, { type: "cast-spell", objectId: archive.id }).kind).toBe(
    "pending",
  );
  expect(
    matchView(match, room.participants[0].id, catalog).rules!.pending!.totalCost
      .generic,
  ).toBe(2);
});

test("affinity preserves colored requirements, clamps generic mana and excludes opponents' artifacts", async () => {
  const { match, command, seed, room, catalog } = await rulesGame();
  seed("Sol Ring", "battlefield");
  seed("Mind Stone", "battlefield");
  seed("Hedron Archive", "battlefield", 1);
  const spell = seed("Thoughtcast", "hand");
  expect(command(0, { type: "cast-spell", objectId: spell.id }).kind).toBe(
    "pending",
  );
  const view = () => matchView(match, room.participants[0].id, catalog);
  expect(view().rules!.pending!.totalCost).toMatchObject({ generic: 2, U: 1 });
  command(0, {
    type: "cancel-procedure",
    procedureId: view().rules!.pending!.id,
  });
  for (let i = 0; i < 4; i++) seed("Sol Ring", "battlefield");
  const island = seed("Island", "battlefield");
  expect(command(0, { type: "cast-spell", objectId: spell.id }).kind).toBe(
    "pending",
  );
  const id = view().rules!.pending!.id;
  expect(view().rules!.pending!.totalCost).toMatchObject({ generic: 0, U: 1 });
  command(0, {
    type: "activate-ability",
    objectId: island.id,
    abilityId: "intrinsic-Island",
  });
  expect(
    command(0, { type: "rules-input", procedureId: id, confirm: true }).kind,
  ).toBe("accepted");
  const before = view().zones.find(
    (z) => z.kind === "hand" && z.ownerId === match.players[0].id,
  )!.count;
  command(0, { type: "pass-priority" });
  command(1, { type: "pass-priority" });
  expect(
    view().zones.find(
      (z) => z.kind === "hand" && z.ownerId === match.players[0].id,
    )!.count,
  ).toBe(before + 2);
});

test("Logbook's other-artifact discount stays locked when a mana source is sacrificed during payment", async () => {
  const { match, command, seed, room, catalog } = await rulesGame();
  const logbook = seed("Tamiyo's Logbook", "battlefield");
  const lotus = seed("Mind Stone", "battlefield");
  seed("Sol Ring", "battlefield");
  seed("Mind Stone", "battlefield", 1);
  catalog.definitions[
    match.instances[lotus.cardInstanceIds[0]].definitionId
  ].abilities = [
    {
      id: "mana",
      kind: "activated",
      origin: "rules",
      rules: {
        manaAbility: true,
        costs: [{ kind: "sacrifice-source" }],
        effects: [{ kind: "add-mana", quantity: 1, colors: ["U"] }],
      },
    },
  ];
  expect(
    command(0, {
      type: "activate-ability",
      objectId: logbook.id,
      abilityId: "draw",
    }).kind,
  ).toBe("pending");
  const view = () => matchView(match, room.participants[0].id, catalog);
  const id = view().rules!.pending!.id;
  expect(view().rules!.pending!.totalCost).toMatchObject({ generic: 3, U: 1 });
  command(0, {
    type: "activate-ability",
    objectId: lotus.id,
    abilityId: "mana",
    color: "U",
  });
  expect(view().objects[lotus.id]).toBeUndefined();
  expect(view().rules!.pending!.totalCost).toMatchObject({ generic: 3, U: 1 });
  expect(
    command(0, { type: "rules-input", procedureId: id, confirm: true }).kind,
  ).toBe("rejected");
  expect(view().rules!.pending!.totalCost.generic).toBe(3);
});

test("Island affinity and chosen X are evaluated before the payment cost is locked", async () => {
  const { match, command, seed, room, catalog } = await rulesGame();
  seed("Island", "battlefield");
  seed("Island", "battlefield");
  seed("Island", "battlefield", 1);
  const golem = seed("Spire Golem", "hand");
  const view = () => matchView(match, room.participants[0].id, catalog);
  command(0, { type: "cast-spell", objectId: golem.id });
  expect(view().rules!.pending!.totalCost.generic).toBe(4);
  command(0, {
    type: "cancel-procedure",
    procedureId: view().rules!.pending!.id,
  });
  const pull = seed("Pull from Tomorrow", "hand");
  // A fixture composition exercises chosen X with a source-local generic modifier.
  const definition =
    catalog.definitions[match.instances[pull.cardInstanceIds[0]].definitionId];
  definition.abilities.push({
    id: "discount",
    kind: "static",
    origin: "rules",
    rules: {
      costs: [],
      effects: [],
      costModifiers: [
        {
          use: "cast",
          scope: "source",
          component: "generic",
          amount: { sum: [1, { binding: "X" }] },
        },
      ],
      chosenVariables: ["X"],
    },
  });
  command(0, { type: "cast-spell", objectId: pull.id });
  expect(
    command(0, {
      type: "rules-input",
      procedureId: view().rules!.pending!.id,
      variables: { X: 4 },
    }).kind,
  ).toBe("pending");
  expect(view().rules!.pending!.totalCost).toMatchObject({ generic: 0, U: 2 });
});

test("removing a continuous source updates recipients and captured abilities survive Foundry sacrifice", async () => {
  const { match, command, seed, room, catalog } = await rulesGame();
  const sai = seed("Sai, Master Thopterist", "battlefield"),
    chief = seed("Chief of the Foundry", "battlefield"),
    overseer = seed("Steel Overseer", "battlefield"),
    ring = seed("Sol Ring", "battlefield");
  const view = () => matchView(match, room.participants[0].id, catalog);
  expect(view().objects[overseer.id].characteristics.power).toBe("2");
  match.rules!.mana[match.players[0].id].U = 2;
  command(0, { type: "activate-ability", objectId: sai.id, abilityId: "draw" });
  command(0, {
    type: "rules-input",
    procedureId: view().rules!.pending!.id,
    selections: { "1": [chief.id, ring.id] },
  });
  expect(view().objects[overseer.id].characteristics.power).toBe("1");
  command(0, { type: "pass-priority" });
  command(1, { type: "pass-priority" });
  const foundry = seed("Foundry of the Consuls", "battlefield");
  match.rules!.mana[match.players[0].id].C = 5;
  expect(
    command(0, {
      type: "activate-ability",
      objectId: foundry.id,
      abilityId: "tokens",
    }).kind,
  ).toBe("accepted");
  expect(view().objects[foundry.id]).toBeUndefined();
  command(0, { type: "pass-priority" });
  command(1, { type: "pass-priority" });
  expect(
    Object.values(view().objects).filter((o) => o.kind === "token"),
  ).toHaveLength(2);
});

test("Myr token descriptors and state-based checks wait until the whole resolution completes", async () => {
  const { match, command, seed, room, catalog } = await rulesGame();
  const spell = seed("Thoughtcast", "hand");
  const definition =
    catalog.definitions[match.instances[spell.cardInstanceIds[0]].definitionId];
  definition.abilities = [
    {
      id: "tokens",
      kind: "spell",
      origin: "rules",
      rules: {
        costs: [],
        effects: [
          { kind: "create-token", token: "myr", count: 1 },
          {
            kind: "add-counters",
            counter: "-1/-1",
            count: 1,
            filter: {
              zone: "battlefield",
              controller: "you",
              subtypes: ["Myr"],
            },
          },
          {
            kind: "add-counters",
            counter: "+1/+1",
            count: 1,
            filter: {
              zone: "battlefield",
              controller: "you",
              subtypes: ["Myr"],
            },
          },
        ],
      },
    },
  ];
  match.rules!.mana[match.players[0].id] = {
    W: 0,
    U: 1,
    B: 0,
    R: 0,
    G: 0,
    C: 4,
  };
  command(0, { type: "cast-spell", objectId: spell.id });
  command(0, { type: "pass-priority" });
  command(1, { type: "pass-priority" });
  const view = matchView(match, room.participants[0].id, catalog);
  const myr = Object.values(view.objects).find((o) => o.kind === "token")!;
  expect(myr.characteristics).toMatchObject({
    name: "Myr",
    power: "1",
    toughness: "1",
    keywords: [],
    colors: [],
  });
  expect(myr.cardInstanceIds).toEqual([]);
});

test("simultaneous triggers use active-player then nonactive-player order and state-based deaths retain both sources", async () => {
  const { match, command, seed, room, catalog } = await rulesGame();
  const first = seed("Vedalken Archmage", "battlefield"),
    second = seed("Vedalken Archmage", "battlefield", 1);
  const card =
    catalog.definitions[match.instances[first.cardInstanceIds[0]].definitionId];
  card.abilities = [
    {
      id: "death",
      kind: "triggered",
      origin: "rules",
      rules: {
        costs: [],
        effects: [{ kind: "draw", count: 1 }],
        trigger: {
          event: "dies",
          filter: { zone: "battlefield", self: "only" },
        },
      },
    },
  ];
  const spell = seed("Thoughtcast", "hand");
  catalog.definitions[
    match.instances[spell.cardInstanceIds[0]].definitionId
  ].abilities = [
    {
      id: "shrink",
      kind: "spell",
      origin: "rules",
      rules: {
        costs: [],
        effects: [
          {
            kind: "add-counters",
            counter: "-1/-1",
            count: 2,
            filter: { zone: "battlefield", types: ["Creature"] },
          },
        ],
      },
    },
  ];
  match.rules!.mana[match.players[0].id].U = 1;
  match.rules!.mana[match.players[0].id].C = 4;
  command(0, { type: "cast-spell", objectId: spell.id });
  command(0, { type: "pass-priority" });
  command(1, { type: "pass-priority" });
  const view = () => matchView(match, room.participants[0].id, catalog);
  expect(view().objects[first.id]).toBeUndefined();
  expect(view().objects[second.id]).toBeUndefined();
  const stack = view().zones.find((z) => z.kind === "stack")!;
  expect(stack.count).toBe(2);
  expect(stack.objectIds!.map((id) => view().objects[id].controllerId)).toEqual(
    [match.players[0].id, match.players[1].id],
  );
  const before = view().zones.find(
    (z) => z.kind === "hand" && z.ownerId === match.players[1].id,
  )!.count;
  command(0, { type: "pass-priority" });
  command(1, { type: "pass-priority" });
  expect(
    view().zones.find(
      (z) => z.kind === "hand" && z.ownerId === match.players[1].id,
    )!.count,
  ).toBe(before + 1);
});

test("creatures with zero toughness die at checkpoints and hidden characteristic definitions do not leak", async () => {
  const { match, command, seed, room, catalog } = await rulesGame();
  const master = seed("Master of Etherium", "hand", 1);
  const creature = seed("Silver Myr", "battlefield");
  const spell = seed("Thoughtcast", "hand");
  catalog.definitions[
    match.instances[spell.cardInstanceIds[0]].definitionId
  ].abilities = [
    {
      id: "shrink",
      kind: "spell",
      origin: "rules",
      rules: {
        costs: [],
        effects: [
          { kind: "create-token", token: "myr", count: 1 },
          {
            kind: "add-counters",
            counter: "-1/-1",
            count: 1,
            filter: { zone: "battlefield", subtypes: ["Myr"] },
          },
        ],
      },
    },
  ];
  match.rules!.mana[match.players[0].id].U = 1;
  match.rules!.mana[match.players[0].id].C = 4;
  command(0, { type: "cast-spell", objectId: spell.id });
  command(0, { type: "pass-priority" });
  command(1, { type: "pass-priority" });
  const view = matchView(match, room.participants[0].id, catalog);
  expect(view.objects[creature.id]).toBeUndefined();
  expect(
    Object.values(view.objects).filter((o) => o.kind === "token"),
  ).toHaveLength(0);
  expect(
    view.rules!.continuousEffects?.some(
      (effect) => effect.sourceId === master.id,
    ),
  ).toBe(false);
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
    room.participants[0].decklists[0].entries[1].quantity = 98;
    room.participants[0].decklists[0].entries.push({
      definitionId: card.id,
      printingId: card.defaultPrintingId,
      quantity: 1,
    });
    expect(() =>
      new MatchService().createCommander(room, catalog),
    ).not.toThrow();
  });
}

test("triggers caused by mana payment wait until casting completes or is cancelled", async () => {
  for (const cancel of [true, false]) {
    const { match, command, seed, room, catalog } = await rulesGame();
    const well = seed("Ichor Wellspring", "battlefield"),
      spell = seed("Hedron Archive", "hand");
    const definition =
      catalog.definitions[
        match.instances[well.cardInstanceIds[0]].definitionId
      ];
    definition.abilities.push({
      id: "sacrifice-mana",
      kind: "activated",
      origin: "rules",
      rules: {
        costs: [{ kind: "sacrifice-source" }],
        effects: [{ kind: "add-mana", quantity: 4, colors: ["C"] }],
        manaAbility: true,
      },
    });
    const view = () => matchView(match, room.participants[0].id, catalog);
    command(0, { type: "cast-spell", objectId: spell.id });
    const pendingId = view().rules!.pending!.id;
    expect(
      command(0, {
        type: "activate-ability",
        objectId: well.id,
        abilityId: "sacrifice-mana",
      }).kind,
    ).toBe("pending");
    expect(view().zones.find((z) => z.kind === "stack")!.count).toBe(0);
    expect(
      command(
        0,
        cancel
          ? { type: "cancel-procedure", procedureId: pendingId }
          : { type: "rules-input", procedureId: pendingId, confirm: true },
      ).kind,
    ).toBe("accepted");
    const stack = view().zones.find((z) => z.kind === "stack")!;
    expect(stack.count).toBe(cancel ? 1 : 2);
    expect(view().objects[stack.objectIds!.at(-1)!].characteristics.name).toBe(
      "Ichor Wellspring: graveyard",
    );
    expect(view().rules!.mana[match.players[0].id].C).toBe(cancel ? 4 : 0);
  }
});

test("Tome's fourth page triggers exile above its independent scry, with private resumable inspection", async () => {
  const game = await rulesGame();
  const tome = game.seed("Mazemind Tome", "battlefield");
  tome.counters = [{ kind: "page", quantity: "3" }];
  const view = (seat = 0) =>
    matchView(game.match, game.room.participants[seat].id, game.catalog);
  expect(
    game.command(0, {
      type: "activate-ability",
      objectId: tome.id,
      abilityId: "scry",
    }).kind,
  ).toBe("accepted");
  expect(view().zones.find((z) => z.kind === "stack")!.count).toBe(2);
  game.command(0, { type: "pass-priority" });
  game.command(1, { type: "pass-priority" });
  expect(view().players[0].life).toBe("44");
  expect(view().objects[tome.id]).toBeUndefined();
  game.command(0, { type: "pass-priority" });
  expect(game.command(1, { type: "pass-priority" }).kind).toBe("pending");
  const pending = view().rules!.pending!;
  const inspected = pending.selectionOptions.bottom.objectIds;
  expect(inspected).toHaveLength(1);
  expect(view().objects[inspected[0]].characteristics.name).toBe("Island");
  expect(view(1).objects[inspected[0]]).toBeUndefined();
  expect(view(1).rules!.pending).toBeUndefined();
  Object.assign(game.match, JSON.parse(JSON.stringify(game.match)));
  expect(view().rules!.pending!.id).toBe(pending.id);
  expect(
    game.command(0, {
      type: "rules-input",
      procedureId: pending.id,
      selections: { bottom: [] },
    }).kind,
  ).toBe("accepted");
  expect(view().objects[inspected[0]]).toBeUndefined();
  expect(
    game.command(0, {
      type: "rules-input",
      procedureId: pending.id,
      selections: { bottom: [] },
    }).kind,
  ).toBe("rejected");
});

test("Transmuter returns Wellspring as a cost and can privately select that same card for tapped or triggered reentry", async () => {
  const game = await rulesGame();
  const transmuter = game.seed("Master Transmuter", "battlefield");
  const spring = game.seed("Ichor Wellspring", "battlefield");
  const view = (seat = 0) =>
    matchView(game.match, game.room.participants[seat].id, game.catalog);
  const before = view().zones.find(
    (z) => z.kind === "hand" && z.ownerId === game.match.players[0].id,
  )!.count;
  game.match.rules!.mana[game.match.players[0].id].U = 1;
  expect(
    game.command(0, {
      type: "activate-ability",
      objectId: transmuter.id,
      abilityId: "transmute",
    }).kind,
  ).toBe("pending");
  const payment = view().rules!.pending!;
  expect(
    game.command(0, {
      type: "rules-input",
      procedureId: payment.id,
      selections: { "2": [spring.id] },
      confirm: true,
    }).kind,
  ).toBe("accepted");
  expect(view().zones.find((z) => z.kind === "stack")!.count).toBe(1);
  const returned = Object.values(view().objects).find(
    (o) => !o.hidden && o.characteristics.name === "Ichor Wellspring",
  )!;
  expect(returned.id).not.toBe(spring.id);
  expect(view(1).objects[returned.id]).toBeUndefined();
  game.command(0, { type: "pass-priority" });
  expect(game.command(1, { type: "pass-priority" }).kind).toBe("pending");
  const choice = view().rules!.pending!;
  expect(choice.selectionOptions.select.objectIds).toContain(returned.id);
  Object.assign(game.match, JSON.parse(JSON.stringify(game.match)));
  expect(
    game.command(0, {
      type: "rules-input",
      procedureId: choice.id,
      selections: { select: [returned.id] },
    }).kind,
  ).toBe("accepted");
  const fresh = Object.values(view().objects).find(
    (o) => !o.hidden && o.characteristics.name === "Ichor Wellspring",
  )!;
  expect(fresh.id).not.toBe(returned.id);
  expect(fresh.cardInstanceIds).toEqual(spring.cardInstanceIds);
  expect(fresh.casting).toBeNull();
  expect(view().zones.find((z) => z.kind === "stack")!.count).toBe(1);
  game.command(0, { type: "pass-priority" });
  game.command(1, { type: "pass-priority" });
  expect(
    view().zones.find(
      (z) => z.kind === "hand" && z.ownerId === game.match.players[0].id,
    )!.count,
  ).toBe(before + 1);
});

test("Disk destroys its union simultaneously, including itself, while captured death triggers survive", async () => {
  const game = await rulesGame();
  const disk = game.seed("Nevinyrral's Disk", "battlefield");
  const spring = game.seed("Ichor Wellspring", "battlefield");
  const retriever = game.seed("Myr Retriever", "battlefield");
  game.seed("Island", "battlefield");
  game.match.rules!.mana[game.match.players[0].id].C = 1;
  const view = () =>
    matchView(game.match, game.room.participants[0].id, game.catalog);
  expect(
    game.command(0, {
      type: "activate-ability",
      objectId: disk.id,
      abilityId: "destroy",
    }).kind,
  ).toBe("accepted");
  game.command(0, { type: "pass-priority" });
  expect(game.command(1, { type: "pass-priority" }).kind).toBe("pending");
  expect(view().objects[disk.id]).toBeUndefined();
  expect(view().objects[spring.id]).toBeUndefined();
  expect(view().objects[retriever.id]).toBeUndefined();
  expect(
    Object.values(view().objects).filter(
      (o) =>
        !o.hidden &&
        o.zoneId === view().zones.find((z) => z.kind === "battlefield")!.id,
    ),
  ).toHaveLength(1);
  const order = view().rules!.pending!;
  expect(order.kind).toBe("trigger-order");
  game.command(0, {
    type: "rules-input",
    procedureId: order.id,
    selections: { order: order.selectionOptions.order.objectIds },
  });
  const target = view().rules!.pending!;
  expect(target.kind).toBe("trigger-target");
  const graveSpring = Object.values(view().objects).find(
    (o) => !o.hidden && o.characteristics.name === "Ichor Wellspring",
  )!;
  const graveRetriever = Object.values(view().objects).find(
    (o) => !o.hidden && o.characteristics.name === "Myr Retriever",
  )!;
  expect(target.legalTargetIds).toContain(graveSpring.id);
  expect(target.legalTargetIds).not.toContain(graveRetriever.id);
  expect(
    game.command(0, {
      type: "rules-input",
      procedureId: target.id,
      targetIds: [graveSpring.id],
    }).kind,
  ).toBe("accepted");
});

test("Nettlecyst creates and equips its Germ before checking toughness, then equip follows sorcery timing", async () => {
  const game = await rulesGame();
  const equipment = game.seed("Nettlecyst", "hand");
  const spring = game.seed("Ichor Wellspring", "battlefield");
  game.match.rules!.mana[game.match.players[0].id].C = 10;
  const view = () =>
    matchView(game.match, game.room.participants[0].id, game.catalog);
  expect(
    game.command(0, { type: "cast-spell", objectId: equipment.id }).kind,
  ).toBe("accepted");
  game.command(0, { type: "pass-priority" });
  game.command(1, { type: "pass-priority" });
  game.command(0, { type: "pass-priority" });
  game.command(1, { type: "pass-priority" });
  const germ = Object.values(view().objects).find(
    (o) =>
      !o.hidden &&
      o.kind === "token" &&
      o.characteristics.name === "Phyrexian Germ",
  )!;
  expect(germ).toBeDefined();
  expect(germ.characteristics).toMatchObject({
    colors: ["B"],
    subtypes: ["Phyrexian", "Germ"],
    power: "2",
    toughness: "2",
  });
  const nettle = Object.values(view().objects).find(
    (o) => !o.hidden && o.characteristics.name === "Nettlecyst",
  )!;
  expect(nettle.attachmentTo).toBe(germ.id);
  const creature = game.seed("Silver Myr", "battlefield");
  expect(
    game.command(0, {
      type: "activate-ability",
      objectId: nettle.id,
      abilityId: "equip",
    }).kind,
  ).toBe("pending");
  const pending = view().rules!.pending!;
  expect(
    game.command(0, {
      type: "rules-input",
      procedureId: pending.id,
      targetIds: [spring.id],
    }).kind,
  ).toBe("rejected");
  game.command(0, {
    type: "rules-input",
    procedureId: pending.id,
    targetIds: [creature.id],
  });
  expect(
    game.command(0, {
      type: "activate-ability",
      objectId: nettle.id,
      abilityId: "equip",
    }).kind,
  ).toBe("rejected");
  game.command(0, { type: "pass-priority" });
  game.command(1, { type: "pass-priority" });
  expect(view().objects[nettle.id].attachmentTo).toBe(creature.id);
  expect(view().objects[germ.id]).toBeUndefined();
  expect(view().objects[creature.id].characteristics).toMatchObject({
    power: "4",
    toughness: "4",
  });
});

test("Duplicant optionally exiles a nontoken creature and follows only its linked card across restore and zone changes", async () => {
  const game = await rulesGame();
  const duplicant = game.seed("Duplicant", "hand");
  const creature = game.seed("Master of Etherium", "battlefield", 1);
  game.seed("Sol Ring", "battlefield", 1);
  const retrieval = game.seed("Counterspell", "hand");
  // A fixture-authored retrieval effect supplies a subsequent Exile departure through the public seam.
  const retrievalCard = Object.values(game.catalog.definitions).find(
    (c) => c.canonicalName === "Counterspell",
  )!;
  retrievalCard.abilities[0].rules = {
    costs: [],
    target: { zone: "exile", kind: "card" },
    effects: [{ kind: "move", subject: "target", destination: "graveyard" }],
  };
  game.match.rules!.mana[game.match.players[0].id].U = 8;
  const view = () =>
    matchView(game.match, game.room.participants[0].id, game.catalog);
  expect(
    game.command(0, { type: "cast-spell", objectId: duplicant.id }).kind,
  ).toBe("accepted");
  game.command(0, { type: "pass-priority" });
  expect(game.command(1, { type: "pass-priority" }).kind).toBe("pending");
  const target = view().rules!.pending!;
  expect(target.kind).toBe("trigger-target");
  game.command(0, {
    type: "rules-input",
    procedureId: target.id,
    targetIds: [creature.id],
  });
  game.command(0, { type: "pass-priority" });
  game.command(1, { type: "pass-priority" });
  const choice = view().rules!.pending!;
  expect(choice.selectionOptions.select.minCount).toBe(0);
  game.command(0, {
    type: "rules-input",
    procedureId: choice.id,
    selections: { select: [creature.id] },
  });
  let permanent = Object.values(view().objects).find(
    (o) => !o.hidden && o.characteristics.name === "Duplicant",
  )!;
  // Master counts its owner's artifacts even in Exile; its former Battlefield 2/2 is not frozen.
  expect(permanent.characteristics).toMatchObject({
    power: "1",
    toughness: "1",
    subtypes: ["Vedalken", "Wizard", "Shapeshifter"],
  });
  expect(permanent.attachmentTo).toBeNull();
  expect(permanent.links).toHaveLength(1);
  Object.assign(game.match, JSON.parse(JSON.stringify(game.match)));
  expect(view().objects[permanent.id].characteristics.power).toBe("1");
  const exiled = permanent.links![0].objectIds[0];
  game.command(0, { type: "cast-spell", objectId: retrieval.id });
  game.command(0, {
    type: "rules-input",
    procedureId: view().rules!.pending!.id,
    targetIds: [exiled],
  });
  game.command(0, { type: "pass-priority" });
  game.command(1, { type: "pass-priority" });
  permanent = view().objects[permanent.id];
  expect(permanent.characteristics).toMatchObject({
    power: "2",
    toughness: "4",
    subtypes: ["Shapeshifter"],
  });
});

for (const name of ["Lonely Sandbar", "Remote Isle", "Nevinyrral's Disk"]) {
  test(`${name} enters tapped through a Transmuter effect without a casting record`, async () => {
    const game = await rulesGame();
    const transmuter = game.seed("Master Transmuter", "battlefield");
    const payment = game.seed("Sol Ring", "battlefield");
    const selected = game.seed(name, "hand");
    // A scenario selection filter permits the land entry replacement to use the same movement seam.
    const transmuterCard = Object.values(game.catalog.definitions).find(
      (c) => c.canonicalName === "Master Transmuter",
    )!;
    const effect = transmuterCard.abilities[0].rules!.effects[0];
    if (effect.kind === "move") effect.filter = { zone: "hand", owner: "you" };
    game.match.rules!.mana[game.match.players[0].id].U = 1;
    const view = () =>
      matchView(game.match, game.room.participants[0].id, game.catalog);
    game.command(0, {
      type: "activate-ability",
      objectId: transmuter.id,
      abilityId: "transmute",
    });
    game.command(0, {
      type: "rules-input",
      procedureId: view().rules!.pending!.id,
      selections: { "2": [payment.id] },
    });
    game.command(0, { type: "pass-priority" });
    game.command(1, { type: "pass-priority" });
    expect(
      game.command(0, {
        type: "rules-input",
        procedureId: view().rules!.pending!.id,
        selections: { select: [selected.id] },
      }).kind,
    ).toBe("accepted");
    const entered = Object.values(view().objects).find(
      (o) => !o.hidden && o.characteristics.name === name,
    )!;
    expect(entered.status.tapped).toBe(true);
    expect(entered.casting).toBeNull();
  });
}

test("Tome cannot gain life when its exile fails and does not duplicate a pending state trigger", async () => {
  const game = await rulesGame();
  const tome = game.seed("Mazemind Tome", "battlefield");
  tome.counters = [{ kind: "page", quantity: "3" }];
  const bomb = game.seed("Aether Spellbomb", "battlefield");
  // The scenario bounce filter includes artifacts to remove Tome in response through the command seam.
  const definition = Object.values(game.catalog.definitions).find(
    (c) => c.canonicalName === "Aether Spellbomb",
  )!;
  definition.abilities[0].rules!.target = {
    zone: "battlefield",
    types: ["Artifact"],
  };
  const player = game.match.players[0];
  game.match.rules!.mana[player.id] = { W: 0, U: 3, B: 0, R: 0, G: 0, C: 0 };
  const view = () =>
    matchView(game.match, game.room.participants[0].id, game.catalog);
  game.command(0, {
    type: "activate-ability",
    objectId: tome.id,
    abilityId: "draw",
  });
  expect(view().zones.find((z) => z.kind === "stack")!.count).toBe(2);
  game.command(0, {
    type: "activate-ability",
    objectId: bomb.id,
    abilityId: "bounce",
  });
  expect(view().zones.find((z) => z.kind === "stack")!.count).toBe(2);
  game.command(0, {
    type: "rules-input",
    procedureId: view().rules!.pending!.id,
    targetIds: [tome.id],
  });
  expect(view().zones.find((z) => z.kind === "stack")!.count).toBe(3);
  for (let i = 0; i < 3; i++) {
    game.command(0, { type: "pass-priority" });
    game.command(1, { type: "pass-priority" });
  }
  expect(view().players[0].life).toBe("40");
  const returned = Object.values(view().objects).find(
    (o) => !o.hidden && o.characteristics.name === "Mazemind Tome",
  )!;
  expect(returned.counters).toEqual([]);
  expect(returned.zoneId).toBe(
    view().zones.find((z) => z.kind === "hand" && z.ownerId === player.id)!.id,
  );
});

test("bounce returns a stolen creature to its owner's Hand and Buried Ruin retrieves only its owner's artifact cards", async () => {
  const game = await rulesGame();
  const bomb = game.seed("Aether Spellbomb", "battlefield");
  const stolen = game.seed("Silver Myr", "battlefield", 1);
  stolen.controllerId = game.match.players[0].id;
  const own = game.seed("Mind Stone", "battlefield");
  const other = game.seed("Sol Ring", "battlefield", 1);
  const ruin = game.seed("Buried Ruin", "battlefield");
  moveObject(
    game.match,
    own.id,
    game.match.zones.find(
      (z) => z.kind === "graveyard" && z.ownerId === game.match.players[0].id,
    )!,
  );
  moveObject(
    game.match,
    other.id,
    game.match.zones.find(
      (z) => z.kind === "graveyard" && z.ownerId === game.match.players[1].id,
    )!,
  );
  game.match.rules!.mana[game.match.players[0].id] = {
    W: 0,
    U: 1,
    B: 0,
    R: 0,
    G: 0,
    C: 2,
  };
  const view = (seat = 0) =>
    matchView(game.match, game.room.participants[seat].id, game.catalog);
  game.command(0, {
    type: "activate-ability",
    objectId: bomb.id,
    abilityId: "bounce",
  });
  game.command(0, {
    type: "rules-input",
    procedureId: view().rules!.pending!.id,
    targetIds: [stolen.id],
  });
  game.command(0, { type: "pass-priority" });
  game.command(1, { type: "pass-priority" });
  expect(view().objects[stolen.id]).toBeUndefined();
  const returned = Object.values(view(1).objects).find(
    (o) => !o.hidden && o.characteristics.name === "Silver Myr",
  )!;
  expect(returned.controllerId).toBe(game.match.players[1].id);
  expect(view().objects[returned.id]).toBeUndefined();
  game.command(0, {
    type: "activate-ability",
    objectId: ruin.id,
    abilityId: "retrieve",
  });
  const pending = view().rules!.pending!;
  expect(
    pending.legalTargetIds
      .map((id) => view().objects[id].characteristics.name)
      .sort(),
  ).toEqual(["Aether Spellbomb", "Mind Stone"]);
  const target = pending.legalTargetIds.find(
    (id) => view().objects[id].characteristics.name === "Mind Stone",
  )!;
  game.command(0, {
    type: "rules-input",
    procedureId: pending.id,
    targetIds: [target],
  });
  game.command(0, { type: "pass-priority" });
  game.command(1, { type: "pass-priority" });
  expect(
    Object.values(view().objects).find(
      (o) => !o.hidden && o.characteristics.name === "Mind Stone",
    )!.zoneId,
  ).toBe(
    view().zones.find(
      (z) => z.kind === "hand" && z.ownerId === game.match.players[0].id,
    )!.id,
  );
});

test("All Is Dust collects each player's colored permanents before simultaneous sacrifice, including indestructible", async () => {
  const game = await rulesGame();
  const dust = game.seed("All Is Dust", "hand");
  const blue = game.seed("Master Transmuter", "battlefield");
  const opponent = game.seed("Master Transmuter", "battlefield", 1);
  opponent.characteristics.keywords = ["Indestructible"];
  const artifact = game.seed("Ichor Wellspring", "battlefield");
  game.match.rules!.mana[game.match.players[0].id].C = 7;
  const view = (seat = 0) =>
    matchView(game.match, game.room.participants[seat].id, game.catalog);
  game.command(0, { type: "cast-spell", objectId: dust.id });
  game.command(0, { type: "pass-priority" });
  game.command(1, { type: "pass-priority" });
  const first = view().rules!.pending!;
  expect(first.selectionOptions.select.objectIds).toEqual([blue.id]);
  expect(
    game.command(0, {
      type: "rules-input",
      procedureId: first.id,
      selections: { select: [] },
    }).kind,
  ).toBe("rejected");
  expect(
    game.command(0, {
      type: "rules-input",
      procedureId: first.id,
      selections: { select: [blue.id] },
    }).kind,
  ).toBe("pending");
  expect(view().objects[blue.id]).toBeDefined();
  expect(view().objects[opponent.id]).toBeDefined();
  expect(view().rules!.pending).toBeUndefined();
  const second = view(1).rules!.pending!;
  Object.assign(game.match, JSON.parse(JSON.stringify(game.match)));
  expect(
    game.command(1, {
      type: "rules-input",
      procedureId: second.id,
      selections: { select: [opponent.id] },
    }).kind,
  ).toBe("accepted");
  expect(view().objects[blue.id]).toBeUndefined();
  expect(view().objects[opponent.id]).toBeUndefined();
  expect(view().objects[artifact.id]).toBeDefined();
});

test("Meteor Golem chooses only opponents' nonlands and Lantern exiles opponents' Graveyards after sacrifice", async () => {
  const game = await rulesGame();
  const golem = game.seed("Meteor Golem", "hand");
  const own = game.seed("Mind Stone", "battlefield");
  const enemy = game.seed("Mind Stone", "battlefield", 1);
  const land = game.seed("Island", "battlefield", 1);
  const lantern = game.seed("Soul-Guide Lantern", "battlefield");
  game.match.rules!.mana[game.match.players[0].id].C = 7;
  const view = () =>
    matchView(game.match, game.room.participants[0].id, game.catalog);
  game.command(0, { type: "cast-spell", objectId: golem.id });
  game.command(0, { type: "pass-priority" });
  game.command(1, { type: "pass-priority" });
  const pending = view().rules!.pending!;
  expect(pending.legalTargetIds).toEqual([enemy.id]);
  expect(
    game.command(0, {
      type: "rules-input",
      procedureId: pending.id,
      targetIds: [land.id],
    }).kind,
  ).toBe("rejected");
  game.command(0, {
    type: "rules-input",
    procedureId: pending.id,
    targetIds: [enemy.id],
  });
  game.command(0, { type: "pass-priority" });
  game.command(1, { type: "pass-priority" });
  expect(view().objects[own.id]).toBeDefined();
  const dead = Object.values(view().objects).find(
    (o) => !o.hidden && o.cardInstanceIds?.[0] === enemy.cardInstanceIds[0],
  )!;
  expect(dead.zoneId).toBe(
    view().zones.find(
      (z) => z.kind === "graveyard" && z.ownerId === game.match.players[1].id,
    )!.id,
  );
  game.command(0, {
    type: "activate-ability",
    objectId: lantern.id,
    abilityId: "exile-graveyards",
  });
  game.command(0, { type: "pass-priority" });
  game.command(1, { type: "pass-priority" });
  expect(view().objects[dead.id]).toBeUndefined();
  expect(view().zones.find((z) => z.kind === "exile")!.count).toBe(1);
  expect(
    Object.values(view().objects).find(
      (o) => !o.hidden && o.characteristics.name === "Soul-Guide Lantern",
    )!.zoneId,
  ).toBe(
    view().zones.find(
      (z) => z.kind === "graveyard" && z.ownerId === game.match.players[0].id,
    )!.id,
  );
});

test("Transmuter permits declining and skips selection when Hand has no artifact, while equip requires a legal target", async () => {
  for (const hasCard of [true, false]) {
    const game = await rulesGame();
    const source = game.seed("Master Transmuter", "battlefield");
    const payment = game.seed("Sol Ring", "battlefield");
    if (hasCard) game.seed("Mind Stone", "hand");
    else {
      const card = Object.values(game.catalog.definitions).find(
        (c) => c.canonicalName === "Master Transmuter",
      )!;
      const effect = card.abilities[0].rules!.effects[0];
      if (effect.kind === "move")
        effect.filter = {
          zone: "hand",
          types: ["Artifact"],
          subtypes: ["Book"],
        };
    }
    game.match.rules!.mana[game.match.players[0].id].U = 1;
    const view = () =>
      matchView(game.match, game.room.participants[0].id, game.catalog);
    game.command(0, {
      type: "activate-ability",
      objectId: source.id,
      abilityId: "transmute",
    });
    game.command(0, {
      type: "rules-input",
      procedureId: view().rules!.pending!.id,
      selections: { "2": [payment.id] },
    });
    game.command(0, { type: "pass-priority" });
    game.command(1, { type: "pass-priority" });
    if (!hasCard) {
      expect(view().rules!.pending).toBeUndefined();
      expect(view().zones.find((z) => z.kind === "stack")!.count).toBe(0);
      continue;
    }
    const pending = view().rules!.pending!;
    expect(
      game.command(0, {
        type: "rules-input",
        procedureId: pending.id,
        selections: { select: [] },
      }).kind,
    ).toBe("accepted");
    expect(view().zones.find((z) => z.kind === "stack")!.count).toBe(0);
  }
  const game = await rulesGame();
  const equipment = game.seed("Adaptive Omnitool", "battlefield");
  expect(
    game.command(0, {
      type: "activate-ability",
      objectId: equipment.id,
      abilityId: "equip",
    }).kind,
  ).toBe("rejected");
});

for (const decline of [true, false]) {
  test(`Duplicant ${decline ? "declines exile" : "loses its target before resolution"} without a link or changed stats`, async () => {
    const game = await rulesGame();
    const duplicant = game.seed("Duplicant", "hand");
    const target = game.seed("Silver Myr", "battlefield");
    const bomb = game.seed("Aether Spellbomb", "battlefield");
    game.match.rules!.mana[game.match.players[0].id] = {
      W: 0,
      U: 7,
      B: 0,
      R: 0,
      G: 0,
      C: 0,
    };
    const view = () =>
      matchView(game.match, game.room.participants[0].id, game.catalog);
    game.command(0, { type: "cast-spell", objectId: duplicant.id });
    game.command(0, { type: "pass-priority" });
    game.command(1, { type: "pass-priority" });
    game.command(0, {
      type: "rules-input",
      procedureId: view().rules!.pending!.id,
      targetIds: [target.id],
    });
    if (!decline) {
      game.command(0, {
        type: "activate-ability",
        objectId: bomb.id,
        abilityId: "bounce",
      });
      game.command(0, {
        type: "rules-input",
        procedureId: view().rules!.pending!.id,
        targetIds: [target.id],
      });
      game.command(0, { type: "pass-priority" });
      game.command(1, { type: "pass-priority" });
    }
    game.command(0, { type: "pass-priority" });
    game.command(1, { type: "pass-priority" });
    if (decline)
      expect(
        game.command(0, {
          type: "rules-input",
          procedureId: view().rules!.pending!.id,
          selections: { select: [] },
        }).kind,
      ).toBe("accepted");
    expect(view().rules!.pending).toBeUndefined();
    const permanent = Object.values(view().objects).find(
      (o) => !o.hidden && o.characteristics.name === "Duplicant",
    )!;
    expect(permanent.characteristics).toMatchObject({
      power: "2",
      toughness: "4",
      subtypes: ["Shapeshifter"],
    });
    expect(permanent.links).toEqual([]);
    expect(view().zones.find((z) => z.kind === "exile")!.count).toBe(0);
  });
}

test("Equipment counts an artifact enchantment once and detaches when its recipient or source leaves", async () => {
  const game = await rulesGame();
  const tool = game.seed("Adaptive Omnitool", "battlefield");
  const creature = game.seed("Silver Myr", "battlefield");
  const both = game.seed("Mind Stone", "battlefield");
  both.characteristics.types = ["Artifact", "Enchantment"];
  const nettle = game.seed("Nettlecyst", "battlefield");
  const bomb = game.seed("Aether Spellbomb", "battlefield");
  nettle.attachmentTo = creature.id;
  game.match.rules!.mana[game.match.players[0].id] = {
    W: 0,
    U: 4,
    B: 0,
    R: 0,
    G: 0,
    C: 0,
  };
  const view = () =>
    matchView(game.match, game.room.participants[0].id, game.catalog);
  expect(view().objects[creature.id].characteristics).toMatchObject({
    power: "6",
    toughness: "6",
  });
  game.command(0, {
    type: "activate-ability",
    objectId: tool.id,
    abilityId: "equip",
  });
  game.command(0, {
    type: "rules-input",
    procedureId: view().rules!.pending!.id,
    targetIds: [creature.id],
  });
  game.command(0, { type: "pass-priority" });
  game.command(1, { type: "pass-priority" });
  expect(view().objects[creature.id].characteristics).toMatchObject({
    power: "11",
    toughness: "11",
  });
  game.command(0, {
    type: "activate-ability",
    objectId: bomb.id,
    abilityId: "bounce",
  });
  game.command(0, {
    type: "rules-input",
    procedureId: view().rules!.pending!.id,
    targetIds: [creature.id],
  });
  game.command(0, { type: "pass-priority" });
  game.command(1, { type: "pass-priority" });
  expect(view().objects[nettle.id].attachmentTo).toBeNull();
  expect(view().objects[tool.id].attachmentTo).toBeNull();
});

test("Duplicant's new entry has no link to cards exiled during its previous lifetime", async () => {
  const game = await rulesGame();
  const duplicant = game.seed("Duplicant", "hand");
  const victim = game.seed("Silver Myr", "battlefield", 1);
  const bomb = game.seed("Aether Spellbomb", "battlefield");
  game.match.rules!.mana[game.match.players[0].id].U = 13;
  const view = () =>
    matchView(game.match, game.room.participants[0].id, game.catalog);
  const resolve = () => {
    game.command(0, { type: "pass-priority" });
    game.command(1, { type: "pass-priority" });
  };
  game.command(0, { type: "cast-spell", objectId: duplicant.id });
  resolve();
  game.command(0, {
    type: "rules-input",
    procedureId: view().rules!.pending!.id,
    targetIds: [victim.id],
  });
  resolve();
  game.command(0, {
    type: "rules-input",
    procedureId: view().rules!.pending!.id,
    selections: { select: [victim.id] },
  });
  const old = Object.values(view().objects).find(
    (o) => !o.hidden && o.characteristics.name === "Duplicant",
  )!;
  expect(old.characteristics).toMatchObject({ power: "1", toughness: "1" });
  game.command(0, {
    type: "activate-ability",
    objectId: bomb.id,
    abilityId: "bounce",
  });
  game.command(0, {
    type: "rules-input",
    procedureId: view().rules!.pending!.id,
    targetIds: [old.id],
  });
  resolve();
  const returned = Object.values(view().objects).find(
    (o) => !o.hidden && o.characteristics.name === "Duplicant",
  )!;
  game.command(0, { type: "cast-spell", objectId: returned.id });
  resolve();
  const fresh = Object.values(view().objects).find(
    (o) =>
      !o.hidden && o.characteristics.name === "Duplicant" && o.kind === "card",
  )!;
  expect(fresh.id).not.toBe(old.id);
  expect(fresh.links).toEqual([]);
  expect(fresh.characteristics).toMatchObject({ power: "2", toughness: "4" });
  const pending = view().rules!.pending!;
  expect(pending.legalTargetIds).toEqual([fresh.id]);
  game.command(0, {
    type: "rules-input",
    procedureId: pending.id,
    targetIds: [fresh.id],
  });
  resolve();
  game.command(0, {
    type: "rules-input",
    procedureId: view().rules!.pending!.id,
    selections: { select: [] },
  });
  expect(view().objects[fresh.id].links).toEqual([]);
  expect(view().zones.find((z) => z.kind === "exile")!.count).toBe(1);
});

test("private Library selection and top/bottom ordering validate quantities and do not repeat on restore", async () => {
  const game = await rulesGame();
  const tome = game.seed("Mazemind Tome", "battlefield");
  const nextTome = game.seed("Mazemind Tome", "battlefield");
  const card = Object.values(game.catalog.definitions).find(
    (c) => c.canonicalName === "Mazemind Tome",
  )!;
  card.abilities.find((a) => a.id === "scry")!.rules!.effects = [
    { kind: "inspect", count: 3 },
  ];
  const view = (seat = 0) =>
    matchView(game.match, game.room.participants[seat].id, game.catalog);
  game.command(0, {
    type: "activate-ability",
    objectId: tome.id,
    abilityId: "scry",
  });
  game.command(0, { type: "pass-priority" });
  game.command(1, { type: "pass-priority" });
  const first = view().rules!.pending!;
  const ids = first.selectionOptions.bottom.objectIds;
  expect(ids).toHaveLength(3);
  expect(
    game.command(0, {
      type: "rules-input",
      procedureId: first.id,
      selections: { bottom: [ids[0], ids[0]] },
    }).kind,
  ).toBe("rejected");
  expect(
    game.command(0, {
      type: "rules-input",
      procedureId: first.id,
      selections: { bottom: [ids[1]] },
    }).kind,
  ).toBe("pending");
  const top = view().rules!.pending!;
  expect(top.id).not.toBe(first.id);
  expect(top.selectionOptions.top.objectIds).toEqual([ids[0], ids[2]]);
  Object.assign(game.match, JSON.parse(JSON.stringify(game.match)));
  expect(
    game.command(0, {
      type: "rules-input",
      procedureId: top.id,
      selections: { top: [ids[2], ids[0]] },
    }).kind,
  ).toBe("accepted");
  // A second inspection observes the Library order through the same public choice view.
  game.command(0, {
    type: "activate-ability",
    objectId: nextTome.id,
    abilityId: "scry",
  });
  game.command(0, { type: "pass-priority" });
  game.command(1, { type: "pass-priority" });
  expect(
    view().rules!.pending!.selectionOptions.bottom.objectIds.slice(0, 2),
  ).toEqual([ids[2], ids[0]]);
  expect(view(1).objects[ids[2]]).toBeUndefined();
});

test("returning Equipment as a cost removes its bonus immediately and a pending living-weapon source can leave", async () => {
  const game = await rulesGame();
  const creature = game.seed("Silver Myr", "battlefield");
  const nettle = game.seed("Nettlecyst", "battlefield");
  const transmuter = game.seed("Master Transmuter", "battlefield");
  const bomb = game.seed("Aether Spellbomb", "battlefield");
  Object.values(game.catalog.definitions).find(
    (c) => c.canonicalName === "Aether Spellbomb",
  )!.abilities[0].rules!.target = { zone: "battlefield", types: ["Artifact"] };
  nettle.attachmentTo = creature.id;
  game.match.rules!.mana[game.match.players[0].id].U = 2;
  const view = () =>
    matchView(game.match, game.room.participants[0].id, game.catalog);
  expect(view().objects[creature.id].characteristics.power).toBe("5");
  game.command(0, {
    type: "activate-ability",
    objectId: transmuter.id,
    abilityId: "transmute",
  });
  game.command(0, {
    type: "rules-input",
    procedureId: view().rules!.pending!.id,
    selections: { "2": [nettle.id] },
  });
  expect(view().objects[creature.id].characteristics.power).toBe("1");
  expect(view().objects[nettle.id]).toBeUndefined();
  game.command(0, { type: "pass-priority" });
  game.command(1, { type: "pass-priority" });
  game.command(0, {
    type: "rules-input",
    procedureId: view().rules!.pending!.id,
    selections: {
      select: [
        Object.values(view().objects).find(
          (o) => !o.hidden && o.characteristics.name === "Nettlecyst",
        )!.id,
      ],
    },
  });
  const fresh = Object.values(view().objects).find(
    (o) =>
      !o.hidden && o.kind === "card" && o.characteristics.name === "Nettlecyst",
  )!;
  game.command(0, {
    type: "activate-ability",
    objectId: bomb.id,
    abilityId: "bounce",
  });
  game.command(0, {
    type: "rules-input",
    procedureId: view().rules!.pending!.id,
    targetIds: [fresh.id],
  });
  for (let i = 0; i < 2; i++) {
    game.command(0, { type: "pass-priority" });
    game.command(1, { type: "pass-priority" });
  }
  expect(
    Object.values(view().objects).filter((o) => o.kind === "token"),
  ).toHaveLength(0);
  expect(view().objects[creature.id].characteristics.power).toBe("1");
});

test("source grants enforce opponent hexproof and artifact flash through current views", async () => {
  const game = await rulesGame();
  const { match, command, seed, catalog, room } = game;
  const myr = seed("Shimmer Myr", "battlefield");
  const ring = seed("Sol Ring", "hand");
  const protectedMyr = seed("Silver Myr", "battlefield", 1);
  const padeem = seed("Padeem, Consul of Innovation", "battlefield", 1);
  Object.values(catalog.definitions)
    .find((c) => c.canonicalName === "Padeem, Consul of Innovation")!
    .abilities.push({
      id: "protection",
      kind: "static",
      origin: "printed",
      rules: {
        costs: [],
        effects: [],
        continuous: {
          filter: {
            zone: "battlefield",
            controller: "you",
            types: ["Artifact"],
          },
          changes: [{ kind: "grant-keyword", keyword: "Hexproof" }],
        },
      },
    });
  const bomb = seed("Aether Spellbomb", "battlefield");
  match.turn.stepIndex = 4;
  match.rules!.mana[match.players[0].id].U = 2;
  const view = () => matchView(match, room.participants[0].id, catalog);
  expect(view().actions!.some((a) => a.label === "Cast Sol Ring")).toBe(true);
  expect(command(0, { type: "cast-spell", objectId: ring.id }).kind).toBe(
    "accepted",
  );
  command(0, { type: "pass-priority" });
  command(1, { type: "pass-priority" });
  expect(
    command(0, {
      type: "activate-ability",
      objectId: bomb.id,
      abilityId: "bounce",
    }).kind,
  ).toBe("pending");
  expect(view().rules!.pending!.legalTargetIds).not.toContain(protectedMyr.id);
  expect(view().rules!.pending!.legalTargetIds).toContain(myr.id);
  expect(
    command(0, {
      type: "rules-input",
      procedureId: view().rules!.pending!.id,
      targetIds: [protectedMyr.id],
    }).kind,
  ).toBe("rejected");
  expect(
    command(0, {
      type: "rules-input",
      procedureId: view().rules!.pending!.id,
      targetIds: [padeem.id],
    }).kind,
  ).toBe("accepted");
  command(0, { type: "pass-priority" });
  command(1, { type: "pass-priority" });
  const secondBomb = seed("Aether Spellbomb", "battlefield");
  command(0, {
    type: "activate-ability",
    objectId: secondBomb.id,
    abilityId: "bounce",
  });
  expect(view().rules!.pending!.legalTargetIds).toContain(protectedMyr.id);
});

test("combat declarations enforce controllers, flying, timing and public participation", async () => {
  const game = await rulesGame();
  const ground = game.seed("Silver Myr", "battlefield");
  const flyer = game.seed("Spire Golem", "battlefield");
  const blocker = game.seed("Silver Myr", "battlefield", 1);
  const newCreature = game.seed("Silver Myr", "battlefield");
  game.match.rules!.controlledSinceTurn[newCreature.id] =
    game.match.turn.number;
  const view = (seat = 0) =>
    matchView(game.match, game.room.participants[seat].id, game.catalog);
  for (let i = 0; i < 2; i++) {
    game.command(0, { type: "pass-priority" });
    game.command(1, { type: "pass-priority" });
  }
  const attack = view().rules!.pending!;
  expect(attack.kind).toBe("declare-attackers");
  expect(attack.selectionOptions[newCreature.id]).toBeUndefined();
  expect(
    game.command(1, {
      type: "rules-input",
      procedureId: attack.id,
      selections: {},
    }).kind,
  ).toBe("rejected");
  expect(
    game.command(0, {
      type: "rules-input",
      procedureId: attack.id,
      selections: { [newCreature.id]: [game.match.players[1].id] },
    }).kind,
  ).toBe("rejected");
  expect(
    game.command(0, {
      type: "rules-input",
      procedureId: attack.id,
      selections: {
        [ground.id]: [game.match.players[1].id],
        [flyer.id]: [game.match.players[1].id],
      },
    }).kind,
  ).toBe("accepted");
  expect(view(1).rules!.combat!.attackers).toHaveLength(2);
  expect(view().objects[ground.id].status.tapped).toBe(true);
  game.command(0, { type: "pass-priority" });
  game.command(1, { type: "pass-priority" });
  const block = view(1).rules!.pending!;
  expect(block.kind).toBe("declare-blockers");
  expect(block.selectionOptions[blocker.id].objectIds).toEqual([ground.id]);
  expect(
    game.command(1, {
      type: "rules-input",
      procedureId: block.id,
      selections: { [blocker.id]: [flyer.id] },
    }).kind,
  ).toBe("rejected");
  expect(
    game.command(1, {
      type: "rules-input",
      procedureId: block.id,
      selections: { [blocker.id]: [ground.id] },
    }).kind,
  ).toBe("accepted");
  expect(
    view().rules!.combat!.attackers.find((a) => a.objectId === ground.id)!
      .blockerIds,
  ).toEqual([blocker.id]);
  expect(view().objects[blocker.id].status.tapped).toBe(false);
  expect(
    view(1).zones.find(
      (z) => z.kind === "hand" && z.ownerId === game.match.players[0].id,
    )!.objectIds,
  ).toBeUndefined();
});

test("combat damage assignments apply simultaneously, keep damage distinct and determine losses", async () => {
  const game = await rulesGame();
  const attacker = game.seed("Spire Golem", "battlefield");
  const a = game.seed("Silver Myr", "battlefield", 1),
    b = game.seed("Silver Myr", "battlefield", 1);
  // Initial blockers have flying and 2 power: both sides die in the same damage event.
  for (const o of [a, b]) {
    o.characteristics.keywords = ["Flying"];
    o.characteristics.power = "2";
  }
  const view = (seat = 0) =>
    matchView(game.match, game.room.participants[seat].id, game.catalog);
  const pass = () => {
    game.command(0, { type: "pass-priority" });
    game.command(1, { type: "pass-priority" });
  };
  pass();
  pass();
  game.command(0, {
    type: "rules-input",
    procedureId: view().rules!.pending!.id,
    selections: { [attacker.id]: [game.match.players[1].id] },
  });
  pass();
  game.command(1, {
    type: "rules-input",
    procedureId: view(1).rules!.pending!.id,
    selections: { [a.id]: [attacker.id], [b.id]: [attacker.id] },
  });
  pass();
  const pending = view().rules!.pending!;
  expect(pending.kind).toBe("combat-damage");
  const bad = {
    type: "rules-input" as const,
    procedureId: pending.id,
    damageAssignments: [
      { sourceId: attacker.id, recipientId: a.id, amount: 3 },
    ],
  };
  expect(game.command(0, bad).kind).toBe("rejected");
  expect(
    game.command(0, {
      ...bad,
      damageAssignments: [
        { sourceId: attacker.id, recipientId: a.id, amount: 1 },
        { sourceId: attacker.id, recipientId: b.id, amount: 1 },
      ],
    }).kind,
  ).toBe("accepted");
  for (const o of [attacker, a, b])
    expect(view().objects[o.id]).toBeUndefined();
  expect(view().players.map((p) => p.life)).toEqual(["40", "40"]);
  expect(view().rules!.damageEvents!.map((e) => e.amount)).toEqual([
    1, 1, 2, 2,
  ]);
});

test("crew taps newly controlled creatures for effective power and animation expires at cleanup", async () => {
  const game = await rulesGame();
  const vehicle = game.seed("Cultivator's Caravan", "battlefield");
  const myr = game.seed("Silver Myr", "battlefield");
  const chief = game.seed("Chief of the Foundry", "battlefield");
  game.match.rules!.controlledSinceTurn[myr.id] = 1;
  myr.counters = [{ kind: "+1/+1", quantity: "1" }];
  const view = () =>
    matchView(game.match, game.room.participants[0].id, game.catalog);
  expect(
    game.command(0, {
      type: "activate-ability",
      objectId: vehicle.id,
      abilityId: "crew",
    }).kind,
  ).toBe("pending");
  const pending = view().rules!.pending!;
  expect(pending.selectionOptions["0"].objectIds).toContain(myr.id);
  expect(
    game.command(0, {
      type: "rules-input",
      procedureId: pending.id,
      selections: { "0": [] },
      confirm: true,
    }).kind,
  ).toBe("rejected");
  expect(
    game.command(0, {
      type: "rules-input",
      procedureId: pending.id,
      selections: { "0": [chief.id] },
      confirm: true,
    }).kind,
  ).toBe("rejected");
  expect(
    game.command(0, {
      type: "rules-input",
      procedureId: pending.id,
      selections: { "0": [myr.id] },
      confirm: true,
    }).kind,
  ).toBe("accepted");
  expect(view().objects[myr.id].status.tapped).toBe(true);
  game.command(0, { type: "pass-priority" });
  game.command(1, { type: "pass-priority" });
  expect(view().objects[vehicle.id].characteristics.types).toEqual([
    "Artifact",
    "Creature",
  ]);
  expect(view().objects[vehicle.id].characteristics.power).toBe("6");
  expect(view().objects[vehicle.id].characteristics.subtypes).toEqual([
    "Vehicle",
  ]);
  game.match.turn.stepIndex = 10; // Begin immediately before cleanup in this initial timing scenario.
  game.command(0, { type: "pass-priority" });
  game.command(1, { type: "pass-priority" });
  expect(view().objects[vehicle.id].characteristics.types).toEqual([
    "Artifact",
  ]);
  expect(view().objects[myr.id].counters).toEqual([
    { kind: "+1/+1", quantity: "1" },
  ]);
  expect(view().objects[chief.id]).toBeDefined();
});

test("Propaganda payment is optional for required attackers and Graaz composes types, base stats and bonuses", async () => {
  const game = await rulesGame();
  const graaz = game.seed("Graaz, Unstoppable Juggernaut", "battlefield");
  const jug = game.seed("Darksteel Juggernaut", "battlefield");
  const chief = game.seed("Chief of the Foundry", "battlefield");
  jug.counters = [{ kind: "+1/+1", quantity: "2" }];
  game.seed("Propaganda", "battlefield", 1);
  const view = () =>
    matchView(game.match, game.room.participants[0].id, game.catalog);
  expect(view().objects[jug.id].characteristics.power).toBe("8");
  expect(view().objects[jug.id].characteristics.toughness).toBe("6");
  expect(view().objects[chief.id].characteristics.subtypes).toContain(
    "Juggernaut",
  );
  const pass = () => {
    game.command(0, { type: "pass-priority" });
    game.command(1, { type: "pass-priority" });
  };
  pass();
  pass();
  const declare = view().rules!.pending!;
  expect(
    game.command(0, {
      type: "rules-input",
      procedureId: declare.id,
      selections: {
        [jug.id]: [game.match.players[1].id],
        [graaz.id]: [game.match.players[1].id],
      },
    }).kind,
  ).toBe("pending");
  const payment = view().rules!.pending!;
  expect(payment.kind).toBe("attack-payment");
  expect(payment.totalCost.generic).toBe(4);
  expect(view().objects[jug.id].status.tapped).toBe(false);
  const ring = game.seed("Sol Ring", "battlefield");
  game.command(0, {
    type: "activate-ability",
    objectId: ring.id,
    abilityId: "mana",
  });
  expect(
    game.command(0, {
      type: "rules-input",
      procedureId: payment.id,
      confirm: true,
    }).kind,
  ).toBe("rejected");
  const ring2 = game.seed("Sol Ring", "battlefield");
  game.command(0, {
    type: "activate-ability",
    objectId: ring2.id,
    abilityId: "mana",
  });
  expect(
    game.command(0, {
      type: "rules-input",
      procedureId: payment.id,
      confirm: true,
    }).kind,
  ).toBe("accepted");
  expect(view().rules!.combat!.attackers).toHaveLength(2);
  expect(view().objects[jug.id].status.tapped).toBe(true);
  const other = await rulesGame();
  other.seed("Darksteel Juggernaut", "battlefield");
  other.seed("Propaganda", "battlefield", 1);
  for (let i = 0; i < 2; i++) {
    other.command(0, { type: "pass-priority" });
    other.command(1, { type: "pass-priority" });
  }
  expect(
    other.command(0, {
      type: "rules-input",
      procedureId: other.match.rules!.pending!.id,
      selections: {},
    }).kind,
  ).toBe("accepted");
});

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
    room.participants[0].decklists[0].entries[1].quantity--;
    room.participants[0].decklists[0].entries.push({
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

test("noncombat damage retains lethal marks on indestructible creatures and cleanup removes damage with temporary effects", async () => {
  const game = await rulesGame();
  const jug = game.seed("Darksteel Juggernaut", "battlefield", 1);
  const spell = game.seed("Counterspell", "hand");
  const card =
    game.catalog.definitions[
      game.match.instances[spell.cardInstanceIds[0]].definitionId
    ];
  card.abilities = [
    {
      id: "damage",
      kind: "spell",
      origin: "printed",
      rules: {
        costs: [],
        target: { zone: "battlefield", types: ["Creature"] },
        effects: [{ kind: "damage", amount: 5 }],
      },
    },
  ];
  game.match.rules!.mana[game.match.players[0].id].U = 2;
  const view = () =>
    matchView(game.match, game.room.participants[0].id, game.catalog);
  game.command(0, { type: "cast-spell", objectId: spell.id });
  game.command(0, {
    type: "rules-input",
    procedureId: view().rules!.pending!.id,
    targetIds: [jug.id],
  });
  game.command(0, { type: "pass-priority" });
  game.command(1, { type: "pass-priority" });
  expect(view().objects[jug.id]).toBeDefined();
  expect(view().rules!.markedDamage![jug.id]).toBe(5);
  expect(view().rules!.damageEvents!.at(-1)).toMatchObject({
    recipientId: jug.id,
    amount: 5,
    combat: false,
  });
  game.match.turn.stepIndex = 10;
  game.command(0, { type: "pass-priority" });
  game.command(1, { type: "pass-priority" });
  expect(view().rules!.markedDamage).toEqual({});
  expect(view().objects[jug.id]).toBeDefined();
});

test("an unblocked attacker deals damage before a zero-life loss completes the Match", async () => {
  const game = await rulesGame();
  const creature = game.seed("Silver Myr", "battlefield");
  game.match.players[1].life = "1";
  const view = (seat = 0) =>
    matchView(game.match, game.room.participants[seat].id, game.catalog);
  const pass = () => {
    game.command(0, { type: "pass-priority" });
    game.command(1, { type: "pass-priority" });
  };
  pass();
  pass();
  game.command(0, {
    type: "rules-input",
    procedureId: view().rules!.pending!.id,
    selections: { [creature.id]: [game.match.players[1].id] },
  });
  pass();
  game.command(1, {
    type: "rules-input",
    procedureId: view(1).rules!.pending!.id,
    selections: {},
  });
  pass();
  expect(view().players.map((p) => p.outcome)).toEqual(["won", "lost"]);
  expect(view().outcome).toBe("complete");
  expect(view().priority).toBeUndefined();
  expect(view().rules!.damageEvents!.at(-1)).toMatchObject({
    sourceId: creature.id,
    recipientId: game.match.players[1].id,
    amount: 1,
    combat: true,
    recipientKind: "player",
  });
  expect(game.command(0, { type: "pass-priority" }).kind).toBe("rejected");
});

test("an attacker stays blocked after its blocker leaves during the response window", async () => {
  const game = await rulesGame();
  const creature = game.seed("Silver Myr", "battlefield");
  const blocker = game.seed("Silver Myr", "battlefield", 1);
  const bomb = game.seed("Aether Spellbomb", "battlefield");
  const view = (seat = 0) =>
    matchView(game.match, game.room.participants[seat].id, game.catalog);
  const pass = () => {
    game.command(0, { type: "pass-priority" });
    game.command(1, { type: "pass-priority" });
  };
  pass();
  pass();
  game.command(0, {
    type: "rules-input",
    procedureId: view().rules!.pending!.id,
    selections: { [creature.id]: [game.match.players[1].id] },
  });
  pass();
  game.command(1, {
    type: "rules-input",
    procedureId: view(1).rules!.pending!.id,
    selections: { [blocker.id]: [creature.id] },
  });
  game.match.rules!.mana[game.match.players[0].id].U = 1;
  game.command(0, {
    type: "activate-ability",
    objectId: bomb.id,
    abilityId: "bounce",
  });
  game.command(0, {
    type: "rules-input",
    procedureId: view().rules!.pending!.id,
    targetIds: [blocker.id],
  });
  pass();
  expect(view().rules!.combat!.attackers[0]).toMatchObject({
    blocked: true,
    blockerIds: [],
  });
  pass();
  expect(view().players[1].life).toBe("40");
  expect(view().rules!.damageEvents ?? []).toEqual([]);
});

test("cleanup removes damage and temporary bonuses together, gives Priority for deaths and repeats cleanup", async () => {
  const game = await rulesGame();
  const creature = game.seed("Silver Myr", "battlefield");
  creature.characteristics.toughness = "0";
  const card =
    game.catalog.definitions[
      game.match.instances[creature.cardInstanceIds[0]].definitionId
    ];
  card.abilities.push({
    id: "death-draw",
    kind: "triggered",
    origin: "printed",
    rules: {
      costs: [],
      effects: [{ kind: "draw", count: 1 }],
      trigger: { event: "dies", filter: { zone: "battlefield", self: "only" } },
    },
  });
  game.match.rules!.temporaryEffects = [
    {
      sourceId: creature.id,
      abilityId: "bonus",
      playerId: game.match.players[0].id,
      filter: { zone: "battlefield", self: "only" },
      changes: [{ kind: "add-stats", power: 0, toughness: 2 }],
      applicability: "until-end-of-turn",
    },
  ];
  game.match.rules!.markedDamage = { [creature.id]: 1 };
  game.match.turn.stepIndex = 10;
  const view = () =>
    matchView(game.match, game.room.participants[0].id, game.catalog);
  const pass = () => {
    game.command(0, { type: "pass-priority" });
    game.command(1, { type: "pass-priority" });
  };
  pass();
  expect(view().turn.stepIndex).toBe(11);
  expect(view().turn.number).toBe(1);
  expect(view().zones.find((z) => z.kind === "stack")!.count).toBe(1);
  pass(); // Resolve the death draw during cleanup.
  pass(); // A further cleanup requires discarding the newly drawn eighth card.
  expect(view().rules!.pending!.kind).toBe("cleanup");
  const pending = view().rules!.pending!;
  game.command(0, {
    type: "rules-input",
    procedureId: pending.id,
    selections: { discard: [pending.selectionOptions.discard.objectIds[0]] },
  });
  expect(view().turn.number).toBe(2);
  expect(view().rules!.markedDamage).toEqual({});
});

test("Graaz animates no Vehicle itself, but layers its creature changes onto crewed Vehicles and prevents Wall blocks", async () => {
  const game = await rulesGame();
  const vehicle = game.seed("Cultivator's Caravan", "battlefield");
  const graaz = game.seed("Graaz, Unstoppable Juggernaut", "battlefield");
  const myr = game.seed("Silver Myr", "battlefield");
  const wall = game.seed("Silver Myr", "battlefield", 1);
  wall.characteristics.subtypes = ["Wall"];
  const view = (seat = 0) =>
    matchView(game.match, game.room.participants[seat].id, game.catalog);
  expect(view().objects[vehicle.id].characteristics.types).toEqual([
    "Artifact",
  ]);
  game.command(0, {
    type: "activate-ability",
    objectId: vehicle.id,
    abilityId: "crew",
  });
  game.command(0, {
    type: "rules-input",
    procedureId: view().rules!.pending!.id,
    selections: { "0": [myr.id] },
  });
  const pass = () => {
    game.command(0, { type: "pass-priority" });
    game.command(1, { type: "pass-priority" });
  };
  pass();
  expect(view().objects[vehicle.id].characteristics.subtypes).toEqual([
    "Vehicle",
    "Juggernaut",
  ]);
  expect(view().objects[vehicle.id].characteristics.toughness).toBe("3");
  pass();
  pass();
  const pending = view().rules!.pending!;
  expect(
    game.command(0, {
      type: "rules-input",
      procedureId: pending.id,
      selections: {},
    }).kind,
  ).toBe("rejected");
  game.command(0, {
    type: "rules-input",
    procedureId: pending.id,
    selections: {
      [vehicle.id]: [game.match.players[1].id],
      [graaz.id]: [game.match.players[1].id],
    },
  });
  pass();
  expect(view(1).rules!.pending!.selectionOptions[wall.id].objectIds).toEqual(
    [],
  );
  expect(
    game.command(1, {
      type: "rules-input",
      procedureId: view(1).rules!.pending!.id,
      selections: { [wall.id]: [vehicle.id] },
    }).kind,
  ).toBe("rejected");
});

test("noncombat ability damage retains the permanent source after sacrifice", async () => {
  const game = await rulesGame();
  const bomb = game.seed("Aether Spellbomb", "battlefield");
  const target = game.seed("Silver Myr", "battlefield", 1);
  const card =
    game.catalog.definitions[
      game.match.instances[bomb.cardInstanceIds[0]].definitionId
    ];
  card.abilities = [
    {
      id: "damage",
      kind: "activated",
      origin: "printed",
      rules: {
        costs: [{ kind: "sacrifice-source" }],
        target: { zone: "battlefield", types: ["Creature"] },
        effects: [{ kind: "damage", amount: 1 }],
      },
    },
  ];
  const view = () =>
    matchView(game.match, game.room.participants[0].id, game.catalog);
  game.command(0, {
    type: "activate-ability",
    objectId: bomb.id,
    abilityId: "damage",
  });
  game.command(0, {
    type: "rules-input",
    procedureId: view().rules!.pending!.id,
    targetIds: [target.id],
  });
  game.command(0, { type: "pass-priority" });
  game.command(1, { type: "pass-priority" });
  expect(view().objects[target.id]).toBeUndefined();
  expect(view().rules!.damageEvents!.at(-1)).toMatchObject({
    sourceId: bomb.id,
    recipientId: target.id,
    amount: 1,
    combat: false,
  });
});

test("hexproof gained in response invalidates an opponent target while preserving its controller's targets", async () => {
  const game = await rulesGame();
  const myr = game.seed("Silver Myr", "battlefield", 1);
  const bomb = game.seed("Aether Spellbomb", "battlefield");
  const padeem = game.seed("Padeem, Consul of Innovation", "hand", 1);
  const card =
    game.catalog.definitions[
      game.match.instances[padeem.cardInstanceIds[0]].definitionId
    ];
  card.abilities = [
    {
      id: "scenario-grant",
      kind: "static",
      origin: "printed",
      rules: {
        keyword: "Flash",
        costs: [],
        effects: [],
        continuous: {
          filter: {
            zone: "battlefield",
            controller: "you",
            types: ["Artifact"],
          },
          changes: [{ kind: "grant-keyword", keyword: "Hexproof" }],
        },
      },
    },
  ];
  const view = (seat = 0) =>
    matchView(game.match, game.room.participants[seat].id, game.catalog);
  game.match.rules!.mana[game.match.players[0].id].U = 1;
  game.match.rules!.mana[game.match.players[1].id].U = 1;
  game.match.rules!.mana[game.match.players[1].id].C = 3;
  game.command(0, {
    type: "activate-ability",
    objectId: bomb.id,
    abilityId: "bounce",
  });
  game.command(0, {
    type: "rules-input",
    procedureId: view().rules!.pending!.id,
    targetIds: [myr.id],
  });
  game.command(0, { type: "pass-priority" });
  expect(
    game.command(1, { type: "cast-spell", objectId: padeem.id }).kind,
  ).toBe("accepted");
  game.command(1, { type: "pass-priority" });
  game.command(0, { type: "pass-priority" });
  game.command(0, { type: "pass-priority" });
  game.command(1, { type: "pass-priority" });
  expect(view().objects[myr.id]).toBeDefined();
  const ownBomb = game.seed("Aether Spellbomb", "battlefield", 1);
  game.command(0, { type: "pass-priority" });
  game.command(1, {
    type: "activate-ability",
    objectId: ownBomb.id,
    abilityId: "bounce",
  });
  expect(view(1).rules!.pending!.legalTargetIds).toContain(myr.id);
});

test("Equipment attaches to a crewed Vehicle, composes its bonus, and detaches when animation expires", async () => {
  const game = await rulesGame();
  const vehicle = game.seed("Cultivator's Caravan", "battlefield");
  const myr = game.seed("Silver Myr", "battlefield");
  myr.counters = [{ kind: "+1/+1", quantity: "2" }];
  const nettle = game.seed("Nettlecyst", "battlefield");
  const view = () =>
    matchView(game.match, game.room.participants[0].id, game.catalog);
  const pass = () => {
    game.command(0, { type: "pass-priority" });
    game.command(1, { type: "pass-priority" });
  };
  game.command(0, {
    type: "activate-ability",
    objectId: vehicle.id,
    abilityId: "crew",
  });
  game.command(0, {
    type: "rules-input",
    procedureId: view().rules!.pending!.id,
    selections: { "0": [myr.id] },
  });
  pass();
  game.match.rules!.mana[game.match.players[0].id].C = 2;
  game.command(0, {
    type: "activate-ability",
    objectId: nettle.id,
    abilityId: "equip",
  });
  expect(view().rules!.pending!.legalTargetIds).toContain(vehicle.id);
  game.command(0, {
    type: "rules-input",
    procedureId: view().rules!.pending!.id,
    targetIds: [vehicle.id],
  });
  pass();
  expect(view().objects[nettle.id].attachmentTo).toBe(vehicle.id);
  expect(view().objects[vehicle.id].characteristics.power).toBe("8");
  game.match.turn.stepIndex = 10;
  pass();
  expect(view().objects[nettle.id].attachmentTo).toBeNull();
  expect(view().objects[vehicle.id].characteristics.types).toEqual([
    "Artifact",
  ]);
  expect(view().objects[myr.id].counters).toEqual([
    { kind: "+1/+1", quantity: "2" },
  ]);
});

test("damage attribution expires at the next turn while surviving the current turn", async () => {
  const game = await rulesGame();
  const creature = game.seed("Silver Myr", "battlefield");
  const view = (seat = 0) =>
    matchView(game.match, game.room.participants[seat].id, game.catalog);
  const pass = () => {
    game.command(0, { type: "pass-priority" });
    game.command(1, { type: "pass-priority" });
  };
  pass();
  pass();
  game.command(0, {
    type: "rules-input",
    procedureId: view().rules!.pending!.id,
    selections: { [creature.id]: [game.match.players[1].id] },
  });
  pass();
  game.command(1, {
    type: "rules-input",
    procedureId: view(1).rules!.pending!.id,
    selections: {},
  });
  pass();
  expect(view().rules!.damageEvents).toHaveLength(1);
  pass();
  pass(); // End combat and postcombat main phase.
  expect(view().rules!.damageEvents).toHaveLength(1);
  pass();
  pass(); // Postcombat main, end step and cleanup, then next turn.
  expect(view().turn.number).toBe(2);
  expect(view().rules!.damageEvents).toEqual([]);
});

test("Battlesphere creates Myr and binds an optional attack payment across recovery", async () => {
  const game = await rulesGame();
  const sphere = game.seed("Myr Battlesphere", "hand");
  game.match.rules!.mana[game.match.players[0].id].C = 7;
  const view = () =>
    matchView(game.match, game.room.participants[0].id, game.catalog);
  const pass = () => {
    game.command(0, { type: "pass-priority" });
    game.command(1, { type: "pass-priority" });
  };
  expect(
    game.command(0, { type: "cast-spell", objectId: sphere.id }).kind,
  ).toBe("accepted");
  pass();
  pass();
  expect(
    Object.values(view().objects).filter(
      (o) => o.kind === "token" && o.characteristics.subtypes?.includes("Myr"),
    ),
  ).toHaveLength(4);
  // The next turn's initial scenario supplies attack eligibility.
  const attacker = Object.values(game.match.objects).find(
    (o) => o.characteristics.name === "Myr Battlesphere",
  )!;
  game.match.rules!.controlledSinceTurn[attacker.id] = 0;
  pass();
  pass();
  const declare = view().rules!.pending!;
  game.command(0, {
    type: "rules-input",
    procedureId: declare.id,
    selections: { [attacker.id]: [game.match.players[1].id] },
  });
  pass();
  const choice = view().rules!.pending!;
  expect(choice.kind).toBe("resolve");
  const ids = Object.values(view().objects)
    .filter((o) => o.kind === "token")
    .slice(0, 2)
    .map((o) => o.id);
  const recovered = JSON.parse(JSON.stringify(game.match));
  expect(
    game.service.execute(
      recovered,
      game.room.participants[0],
      {
        type: "rules-input",
        procedureId: choice.id,
        selections: { select: ids },
      },
      game.catalog,
    ).kind,
  ).toBe("accepted");
  const result = matchView(
    recovered,
    game.room.participants[0].id,
    game.catalog,
  );
  expect(result.objects[attacker.id].characteristics.power).toBe("6");
  expect(result.players[1].life).toBe("38");
  expect(ids.every((id) => result.objects[id].status.tapped)).toBe(true);
});

test("Omnitool privately inspects a short Library and reveals only its selected artifact", async () => {
  const game = await rulesGame();
  const creature = game.seed("Silver Myr", "battlefield");
  const tool = game.seed("Adaptive Omnitool", "battlefield");
  tool.attachmentTo = creature.id;
  const artifact = game.seed("Mind Stone", "hand");
  const library = game.match.zones.find(
    (z) => z.kind === "library" && z.ownerId === game.match.players[0].id,
  )!;
  const hand = game.match.zones.find((z) => z.id === artifact.zoneId)!;
  hand.objectIds.splice(hand.objectIds.indexOf(artifact.id), 1);
  artifact.zoneId = library.id;
  library.objectIds = [artifact.id, ...library.objectIds.slice(0, 2)];
  const view = (seat = 0) =>
    matchView(game.match, game.room.participants[seat].id, game.catalog);
  for (let i = 0; i < 2; i++) {
    game.command(0, { type: "pass-priority" });
    game.command(1, { type: "pass-priority" });
  }
  game.command(0, {
    type: "rules-input",
    procedureId: view().rules!.pending!.id,
    selections: { [creature.id]: [game.match.players[1].id] },
  });
  game.command(0, { type: "pass-priority" });
  game.command(1, { type: "pass-priority" });
  const choice = view().rules!.pending!;
  expect(choice.kind).toBe("resolve");
  expect(view().objects[artifact.id]).toBeDefined();
  expect(view(1).objects[artifact.id]).toBeUndefined();
  const recovered = JSON.parse(JSON.stringify(game.match));
  expect(
    game.service.execute(
      recovered,
      game.room.participants[0],
      {
        type: "rules-input",
        procedureId: choice.id,
        selections: { select: [artifact.id] },
      },
      game.catalog,
    ).kind,
  ).toBe("accepted");
  const publicView = matchView(
    recovered,
    game.room.participants[1].id,
    game.catalog,
  );
  expect(
    Object.values(publicView.objects).some(
      (o) => o.characteristics.name === "Mind Stone",
    ),
  ).toBe(true);
  expect(publicView.zones.find((z) => z.id === library.id)!.count).toBe(2);
});

test("individual and grouped artifact combat triggers differ and Hellkite uses chosen X once per turn", async () => {
  const game = await rulesGame();
  const hellkite = game.seed("Steel Hellkite", "battlefield");
  const myr = game.seed("Silver Myr", "battlefield");
  game.seed("Research Thief", "battlefield");
  game.seed("Thopter Spy Network", "battlefield");
  const victim = game.seed("Mind Stone", "battlefield", 1);
  const survivor = game.seed("Sol Ring", "battlefield", 1);
  const view = () =>
    matchView(game.match, game.room.participants[0].id, game.catalog);
  const pass = () => {
    game.command(0, { type: "pass-priority" });
    game.command(1, { type: "pass-priority" });
  };
  pass();
  pass();
  game.command(0, {
    type: "rules-input",
    procedureId: view().rules!.pending!.id,
    selections: {
      [hellkite.id]: [game.match.players[1].id],
      [myr.id]: [game.match.players[1].id],
    },
  });
  pass();
  game.command(1, {
    type: "rules-input",
    procedureId: game.match.rules!.pending!.id,
    selections: {},
  });
  pass();
  const order = view().rules!.pending!;
  expect(order.kind).toBe("trigger-order");
  expect(order.selectionOptions.order.objectIds).toHaveLength(3);
  const handBefore = view().zones.find(
    (z) => z.kind === "hand" && z.ownerId === game.match.players[0].id,
  )!.count;
  game.command(0, {
    type: "rules-input",
    procedureId: order.id,
    selections: { order: order.selectionOptions.order.objectIds },
  });
  pass();
  pass();
  pass();
  expect(
    view().zones.find(
      (z) => z.kind === "hand" && z.ownerId === game.match.players[0].id,
    )!.count,
  ).toBe(handBefore + 3);
  game.match.rules!.mana[game.match.players[0].id].U = 2;
  expect(
    game.command(0, {
      type: "activate-ability",
      objectId: hellkite.id,
      abilityId: "destroy-damaged",
    }).kind,
  ).toBe("pending");
  game.command(0, {
    type: "rules-input",
    procedureId: view().rules!.pending!.id,
    variables: { X: 2 },
  });
  game.command(0, {
    type: "rules-input",
    procedureId: view().rules!.pending!.id,
    confirm: true,
  });
  expect(
    game.command(0, {
      type: "activate-ability",
      objectId: hellkite.id,
      abilityId: "destroy-damaged",
    }).kind,
  ).toBe("rejected");
  pass();
  expect(view().objects[victim.id]).toBeUndefined();
  expect(view().objects[survivor.id]).toBeDefined();
});

test("draw ordinals, live Hand size and optional effect payment resume without duplicating draws", async () => {
  const game = await rulesGame();
  game.seed("Thopter Fabricator", "battlefield");
  const crawler = game.seed("Psychosis Crawler", "battlefield");
  game.seed("Scrawling Crawler", "battlefield", 1);
  game.seed("Mind's Eye", "battlefield", 1);
  const archive = game.seed("Hedron Archive", "battlefield");
  game.match.rules!.mana[game.match.players[0].id].C = 2;
  const view = (seat = 0) =>
    matchView(game.match, game.room.participants[seat].id, game.catalog);
  const pass = () => {
    game.command(0, { type: "pass-priority" });
    game.command(1, { type: "pass-priority" });
  };
  const before = view().zones.find(
    (z) => z.kind === "hand" && z.ownerId === game.match.players[0].id,
  )!.count;
  expect(
    game.command(0, {
      type: "activate-ability",
      objectId: archive.id,
      abilityId: "draw",
    }).kind,
  ).toBe("accepted");
  pass();
  const order = view().rules!.pending!;
  expect(order.kind).toBe("trigger-order");
  expect(order.selectionOptions.order.objectIds).toHaveLength(3);
  game.command(0, {
    type: "rules-input",
    procedureId: order.id,
    selections: { order: order.selectionOptions.order.objectIds },
  });
  const order2 = view(1).rules!.pending!;
  expect(order2.selectionOptions.order.objectIds).toHaveLength(4);
  game.command(1, {
    type: "rules-input",
    procedureId: order2.id,
    selections: { order: order2.selectionOptions.order.objectIds },
  });
  expect(view().objects[crawler.id].characteristics.power).toBe(
    String(before + 2),
  );
  pass();
  const pay = view(1).rules!.pending!;
  expect(pay.kind).toBe("resolve");
  const recovered = JSON.parse(JSON.stringify(game.match));
  // Recover the persisted choice and the already-present mana pool.
  recovered.rules.mana[game.match.players[1].id].U = 1;
  expect(
    game.service.execute(
      recovered,
      game.room.participants[1],
      { type: "rules-input", procedureId: pay.id, confirm: true },
      game.catalog,
    ).kind,
  ).toBe("accepted");
  expect(
    matchView(recovered, game.room.participants[1].id, game.catalog).zones.find(
      (z) => z.kind === "hand" && z.ownerId === game.match.players[1].id,
    )!.count,
  ).toBe(8);
  expect(recovered.rules.mana[game.match.players[1].id].U).toBe(0);
  expect(
    game.service.execute(
      recovered,
      game.room.participants[1],
      { type: "rules-input", procedureId: pay.id, confirm: true },
      game.catalog,
    ).kind,
  ).toBe("rejected");
});

test("Padeem honors tied artifact maxima and rechecks upkeep while Dragon grants follow current artifact counts", async () => {
  const game = await rulesGame();
  game.seed("Padeem, Consul of Innovation", "battlefield");
  const dragon = game.seed("Shimmer Dragon", "battlefield");
  const own = game.seed("Mind Stone", "battlefield");
  game.seed("Mind Stone", "battlefield", 1);
  const artifacts = [
    own,
    game.seed("Sol Ring", "battlefield"),
    game.seed("Silver Myr", "battlefield"),
    game.seed("Thought Vessel", "battlefield"),
  ];
  const view = () =>
    matchView(game.match, game.room.participants[0].id, game.catalog);
  expect(view().objects[own.id].characteristics.keywords).toContain("Hexproof");
  expect(view().objects[dragon.id].characteristics.keywords).toContain(
    "Hexproof",
  );
  // Start just before the next upkeep, exercising the ordinary turn commands.
  game.match.turn.stepIndex = 10;
  game.seed("Thought Vessel", "battlefield", 1);
  const pass = () => {
    const id = game.match.priority!.playerId;
    const seat = game.match.players.findIndex((p) => p.id === id);
    game.command(seat, { type: "pass-priority" });
    game.command(1 - seat, { type: "pass-priority" });
  };
  pass();
  for (let i = 0; i < 8; i++) pass();
  expect(game.match.turn.activePlayerId).toBe(game.match.players[0].id);
  expect(view().zones.find((z) => z.kind === "stack")!.count).toBe(1);
  const before = view().zones.find(
    (z) => z.kind === "hand" && z.ownerId === game.match.players[0].id,
  )!.count;
  // Respond with a higher-valued artifact; the intervening condition must fail.
  const archive = game.seed("Hedron Archive", "hand", 1);
  game.match.rules!.mana[game.match.players[1].id].C = 4;
  game.seed("Shimmer Myr", "battlefield", 1);
  game.command(0, { type: "pass-priority" });
  game.command(1, { type: "cast-spell", objectId: archive.id });
  pass();
  pass();
  expect(
    view().zones.find(
      (z) => z.kind === "hand" && z.ownerId === game.match.players[0].id,
    )!.count,
  ).toBe(before);
  // Selected-object tap costs can use newly controlled artifacts.
  game.match.rules!.controlledSinceTurn[artifacts[0].id] =
    game.match.turn.number;
  expect(
    game.command(0, {
      type: "activate-ability",
      objectId: dragon.id,
      abilityId: "draw",
    }).kind,
  ).toBe("pending");
  const pending = view().rules!.pending!;
  game.command(0, {
    type: "rules-input",
    procedureId: pending.id,
    selections: { "0": artifacts.slice(0, 2).map((o) => o.id) },
    confirm: true,
  });
  pass();
  expect(
    view().zones.find(
      (z) => z.kind === "hand" && z.ownerId === game.match.players[0].id,
    )!.count,
  ).toBe(before + 1);
});

async function triggerGame() {
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
      procedureId: view(seat).rules!.pending!.id,
      selections,
    });
  const handCount = (seat = 0) =>
    view(seat).zones.find(
      (z) => z.kind === "hand" && z.ownerId === game.match.players[seat].id,
    )!.count;
  return { ...game, view, pass, answer, handCount };
}

for (const count of [0, 1, 3]) {
  test(`Battlesphere can tap ${count} Myr and its bound bonus expires during cleanup`, async () => {
    const game = await triggerGame();
    const sphere = game.seed("Myr Battlesphere", "battlefield");
    const myr = Array.from({ length: 3 }, () =>
      game.seed("Silver Myr", "battlefield"),
    );
    const tapped = game.seed("Silver Myr", "battlefield");
    tapped.status.tapped = true;
    game.pass();
    game.pass();
    game.answer({ [sphere.id]: [game.match.players[1].id] });
    game.pass();
    expect(
      game.view().rules!.pending!.selectionOptions.select.objectIds,
    ).not.toContain(tapped.id);
    expect(
      game.answer({ select: myr.slice(0, count).map((o) => o.id) }).kind,
    ).toBe("accepted");
    expect(game.view().objects[sphere.id].characteristics.power).toBe(
      String(4 + count),
    );
    expect(game.view().players[1].life).toBe(String(40 - count));
    game.match.turn.stepIndex = 10;
    game.pass();
    expect(game.view().objects[sphere.id].characteristics.power).toBe("4");
  });
}

for (const selection of ["decline", "no-artifact", "empty"] as const) {
  test(`Omnitool handles ${selection} without exposing the inspected Library`, async () => {
    const game = await triggerGame();
    const myr = game.seed("Silver Myr", "battlefield");
    game.seed("Adaptive Omnitool", "battlefield").attachmentTo = myr.id;
    const library = game.match.zones.find(
      (z) => z.kind === "library" && z.ownerId === game.match.players[0].id,
    )!;
    if (selection === "empty") library.objectIds = [];
    const initial = [...library.objectIds];
    const count = game.handCount();
    game.pass();
    game.pass();
    game.answer({ [myr.id]: [game.match.players[1].id] });
    game.pass();
    if (selection !== "empty") {
      const pending = game.view().rules!.pending!;
      expect(pending.selectionOptions.select.objectIds).toEqual([]);
      expect(initial.slice(0, 6).every((id) => !game.view(1).objects[id])).toBe(
        true,
      );
      game.answer({ select: [] });
      const recovered = JSON.parse(JSON.stringify(game.match));
      expect(
        game.service.execute(
          recovered,
          game.room.participants[0],
          {
            type: "rules-input",
            procedureId: pending.id,
            selections: { select: [] },
          },
          game.catalog,
        ).kind,
      ).toBe("rejected");
    }
    expect(game.handCount()).toBe(count);
    expect(game.view().zones.find((z) => z.id === library.id)!.count).toBe(
      initial.length,
    );
  });
}

test("Signpost redirects an existing attack before Battlesphere reads its defender and rejects the attacker's permanents", async () => {
  const game = await triggerGame();
  const sphere = game.seed("Myr Battlesphere", "battlefield");
  const myr = game.seed("Silver Myr", "battlefield");
  const walker = game.seed("Mind Stone", "battlefield", 1);
  walker.characteristics.types = ["Planeswalker"];
  walker.counters = [{ kind: "loyalty", quantity: "8" }];
  const ownWalker = game.seed("Mind Stone", "battlefield");
  ownWalker.characteristics.types = ["Planeswalker"];
  ownWalker.counters = [{ kind: "loyalty", quantity: "8" }];
  const sign = game.seed("Misleading Signpost", "hand", 1);
  game.pass();
  game.pass();
  game.answer({ [sphere.id]: [game.match.players[1].id] });
  game.match.rules!.mana[game.match.players[1].id].U = 3;
  game.command(0, { type: "pass-priority" });
  expect(game.command(1, { type: "cast-spell", objectId: sign.id }).kind).toBe(
    "accepted",
  );
  game.pass();
  const target = game.view(1).rules!.pending!;
  expect(target.kind).toBe("trigger-target");
  game.command(1, {
    type: "rules-input",
    procedureId: target.id,
    targetIds: [sphere.id],
  });
  game.pass();
  const choice = game.view(1).rules!.pending!;
  expect(choice.selectionOptions.select.objectIds).not.toContain(ownWalker.id);
  expect(game.answer({ select: [ownWalker.id] }, 1).kind).toBe("rejected");
  expect(game.answer({ select: [game.match.players[0].id] }, 1).kind).toBe(
    "rejected",
  );
  expect(game.answer({ select: [walker.id] }, 1).kind).toBe("accepted");
  expect(game.view().rules!.combat!.attackers).toHaveLength(1);
  expect(game.view().rules!.combat!.attackers[0].objectId).toBe(sphere.id);
  game.pass();
  game.answer({ select: [myr.id] });
  expect(game.view().players[1].life).toBe("40");
  expect(game.view().objects[walker.id].counters[0].quantity).toBe("7");
  expect(game.view().zones.find((z) => z.kind === "stack")!.count).toBe(0);
});

test("Skysovereign's entry and attack damage use opponent targets and stay separate from combat damage", async () => {
  const game = await triggerGame();
  const sky = game.seed("Skysovereign, Consul Flagship", "hand");
  const victim = game.seed("Steel Hellkite", "battlefield", 1);
  const pilot = game.seed("Steel Hellkite", "battlefield");
  game.match.rules!.mana[game.match.players[0].id].C = 5;
  game.command(0, { type: "cast-spell", objectId: sky.id });
  game.pass();
  let pending = game.view().rules!.pending!;
  expect(pending.legalTargetIds).toContain(victim.id);
  expect(pending.legalTargetIds).not.toContain(pilot.id);
  game.command(0, {
    type: "rules-input",
    procedureId: pending.id,
    targetIds: [victim.id],
  });
  game.pass();
  expect(game.view().rules!.markedDamage![victim.id]).toBe(3);
  const vehicle = Object.values(game.view().objects).find(
    (o) => o.characteristics.name === "Skysovereign, Consul Flagship",
  )!;
  game.match.rules!.controlledSinceTurn[vehicle.id] = 0;
  game.command(0, {
    type: "activate-ability",
    objectId: vehicle.id,
    abilityId: "crew",
  });
  game.answer({ "0": [pilot.id] });
  game.pass();
  game.pass();
  game.pass();
  game.answer({ [vehicle.id]: [game.match.players[1].id] });
  pending = game.view().rules!.pending!;
  game.command(0, {
    type: "rules-input",
    procedureId: pending.id,
    targetIds: [victim.id],
  });
  game.pass();
  expect(game.view().objects[victim.id]).toBeUndefined();
  expect(game.view().players[1].life).toBe("40");
  expect(game.view().rules!.damageEvents!.every((e) => !e.combat)).toBe(true);
});

test("Mind's Eye accepts mana sources during its private effect payment and can decline without spending", async () => {
  for (const pay of [false, true]) {
    const game = await triggerGame();
    game.seed("Mind's Eye", "battlefield", 1);
    const ring = game.seed("Sol Ring", "battlefield", 1);
    const stone = game.seed("Mind Stone", "battlefield");
    game.match.rules!.mana[game.match.players[0].id].U = 1;
    game.command(0, {
      type: "activate-ability",
      objectId: stone.id,
      abilityId: "draw",
    });
    game.pass();
    game.pass();
    const choice = game.view(1).rules!.pending!;
    expect(game.view().rules!.pending).toBeUndefined();
    expect(choice.stage).toBe("payment");
    expect(
      game.command(1, {
        type: "rules-input",
        procedureId: choice.id,
        confirm: true,
      }).kind,
    ).toBe("rejected");
    expect(
      game.command(1, {
        type: "activate-ability",
        objectId: ring.id,
        abilityId: "mana",
      }).kind,
    ).toBe("pending");
    const before = game.handCount(1);
    expect(
      game.command(1, {
        type: "rules-input",
        procedureId: choice.id,
        confirm: pay,
      }).kind,
    ).toBe("accepted");
    expect(game.handCount(1)).toBe(before + (pay ? 1 : 0));
    expect(game.view(1).rules!.mana[game.match.players[1].id].C).toBe(
      pay ? 1 : 2,
    );
  }
});

test("Scrawling upkeep draws for each player, Fabricator resets ordinals, and Vessel removes cleanup's discard", async () => {
  const game = await triggerGame();
  game.seed("Scrawling Crawler", "battlefield", 1);
  game.seed("Thought Vessel", "battlefield");
  game.seed("Thought Vessel", "battlefield", 1);
  game.seed("Thopter Fabricator", "battlefield", 1);
  const archive = game.seed("Hedron Archive", "battlefield");
  game.match.rules!.mana[game.match.players[0].id].U = 2;
  game.command(0, {
    type: "activate-ability",
    objectId: archive.id,
    abilityId: "draw",
  });
  game.pass();
  const order = game.view(1).rules!.pending!;
  game.answer({ order: order.selectionOptions.order.objectIds }, 1);
  game.pass();
  game.pass();
  expect(game.handCount()).toBe(9);
  expect(game.view().players[0].life).toBe("38");
  expect(game.view().rules!.damageEvents ?? []).toHaveLength(0);
  game.match.turn.stepIndex = 10;
  game.pass();
  expect(game.match.turn.stepIndex).toBe(1);
  expect(game.match.turn.activePlayerId).toBe(game.match.players[1].id);
  const before = [game.handCount(), game.handCount(1)];
  game.pass();
  expect(game.handCount()).toBe(before[0] + 1);
  expect(game.handCount(1)).toBe(before[1] + 1);
  expect(
    Object.values(game.view().objects).filter((o) => o.kind === "token"),
  ).toHaveLength(0);
  game.pass(); // opponent draw life loss
  game.pass(); // normal draw step gives the second draw
  expect(game.view(1).zones.find((z) => z.kind === "stack")!.count).toBe(1);
  game.pass();
  expect(
    Object.values(game.view().objects).filter((o) => o.kind === "token"),
  ).toHaveLength(1);
});

test("Psychosis survives temporarily empty Hand inside a resolving draw sequence", async () => {
  const game = await triggerGame();
  const crawler = game.seed("Psychosis Crawler", "battlefield");
  const spell = game.seed("Thirst for Knowledge", "hand");
  const card =
    game.catalog.definitions[
      game.match.instances[spell.cardInstanceIds[0]].definitionId
    ];
  card.abilities = [
    {
      id: "empty-then-draw",
      kind: "spell",
      origin: "printed",
      rules: {
        costs: [],
        effects: [
          { kind: "discard", count: 7 },
          { kind: "draw", count: 1 },
        ],
      },
    },
  ];
  const hand = game.match.zones.find(
    (z) => z.kind === "hand" && z.ownerId === game.match.players[0].id,
  )!;
  hand.objectIds = hand.objectIds.slice(0, 7).concat(spell.id);
  game.match.rules!.mana[game.match.players[0].id].U = 3;
  game.command(0, { type: "cast-spell", objectId: spell.id });
  game.pass();
  expect(
    game.answer({
      discard: game.view().rules!.pending!.selectionOptions.discard.objectIds,
    }).kind,
  ).toBe("accepted");
  expect(game.view().objects[crawler.id].characteristics.toughness).toBe("1");
  game.pass();
  expect(game.view().players[1].life).toBe("39");
});

for (const artifacts of ["none", "ties", "smaller"] as const) {
  test(`Padeem upkeep with ${artifacts} uses current greatest artifact mana values`, async () => {
    const game = await triggerGame();
    game.seed("Padeem, Consul of Innovation", "battlefield", 1);
    if (artifacts !== "none") {
      game.seed("Mind Stone", "battlefield", 1);
      game.seed(
        artifacts === "ties" ? "Mind Stone" : "Hedron Archive",
        "battlefield",
      );
    }
    game.match.turn.stepIndex = 10;
    game.pass();
    expect(game.view().zones.find((z) => z.kind === "stack")!.count).toBe(
      artifacts === "ties" ? 1 : 0,
    );
    if (artifacts === "ties") {
      const before = game.handCount(1);
      game.pass();
      expect(game.handCount(1)).toBe(before + 1);
    }
  });
}

test("Spy Network rechecks its artifact condition and Shimmer Dragon loses hexproof when its artifact count drops", async () => {
  const game = await triggerGame();
  game.seed("Thopter Spy Network", "battlefield", 1);
  const dragon = game.seed("Shimmer Dragon", "battlefield", 1);
  const artifacts = Array.from({ length: 4 }, () =>
    game.seed("Mind Stone", "battlefield", 1),
  );
  const transmuter = game.seed("Master Transmuter", "battlefield", 1);
  game.match.turn.stepIndex = 10;
  game.pass();
  expect(game.view().objects[dragon.id].characteristics.keywords).toContain(
    "Hexproof",
  );
  game.match.rules!.mana[game.match.players[1].id].U = 1;
  game.command(1, {
    type: "activate-ability",
    objectId: transmuter.id,
    abilityId: "transmute",
  });
  game.answer({ "2": [transmuter.id] }, 1);
  game.pass();
  game.answer({ select: [] }, 1);
  // Remove the four remaining artifacts through paid draw abilities, retaining the upkeep trigger.
  for (const artifact of artifacts) {
    game.match.rules!.mana[game.match.players[1].id].U = 1;
    game.command(1, {
      type: "activate-ability",
      objectId: artifact.id,
      abilityId: "draw",
    });
    game.pass();
  }
  expect(game.view().objects[dragon.id].characteristics.keywords).not.toContain(
    "Hexproof",
  );
  game.pass();
  expect(
    Object.values(game.view().objects).filter((o) => o.kind === "token"),
  ).toHaveLength(0);
});

test("Hellkite's fresh object lifetime has no prior combat recipients", async () => {
  const game = await triggerGame();
  game.seed("Research Thief", "battlefield");
  game.seed("Thopter Spy Network", "battlefield");
  const hellkite = game.seed("Steel Hellkite", "battlefield");
  const myr = game.seed("Silver Myr", "battlefield");
  const victim = game.seed("Mind Stone", "battlefield", 1);
  const untouched = game.seed("Sol Ring", "battlefield", 1);
  const transmuter = game.seed("Master Transmuter", "battlefield");
  game.pass();
  game.pass();
  game.answer({
    [hellkite.id]: [game.match.players[1].id],
    [myr.id]: [game.match.players[1].id],
  });
  game.pass();
  game.answer({}, 1);
  game.pass();
  let order = game.view().rules!.pending!;
  expect(order.selectionOptions.order.objectIds).toHaveLength(3);
  game.answer({ order: order.selectionOptions.order.objectIds });
  for (let i = 0; i < 3; i++) game.pass();
  game.match.rules!.mana[game.match.players[0].id].U = 3;
  game.command(0, {
    type: "activate-ability",
    objectId: hellkite.id,
    abilityId: "destroy-damaged",
  });
  game.command(0, {
    type: "rules-input",
    procedureId: game.view().rules!.pending!.id,
    variables: { X: 2 },
  });
  game.command(0, {
    type: "rules-input",
    procedureId: game.view().rules!.pending!.id,
    confirm: true,
  });
  game.pass();
  expect(game.view().objects[victim.id]).toBeUndefined();
  expect(game.view().objects[untouched.id]).toBeDefined();
  game.command(0, {
    type: "activate-ability",
    objectId: transmuter.id,
    abilityId: "transmute",
  });
  game.answer({ "2": [hellkite.id] });
  game.pass();
  const returned = game
    .view()
    .rules!.pending!.selectionOptions.select.objectIds.find(
      (id) => game.view().objects[id].characteristics.name === "Steel Hellkite",
    )!;
  game.answer({ select: [returned] });
  const fresh = Object.values(game.view().objects).find(
    (o) => o.characteristics.name === "Steel Hellkite",
  )!;
  expect(fresh.id).not.toBe(hellkite.id);
  game.match.rules!.mana[game.match.players[0].id].U = 2;
  expect(
    game.command(0, {
      type: "activate-ability",
      objectId: fresh.id,
      abilityId: "destroy-damaged",
    }).kind,
  ).toBe("pending");
  game.command(0, {
    type: "rules-input",
    procedureId: game.view().rules!.pending!.id,
    variables: { X: 1 },
  });
  game.command(0, {
    type: "rules-input",
    procedureId: game.view().rules!.pending!.id,
    confirm: true,
  });
  game.pass();
  expect(game.view().objects[untouched.id]).toBeDefined();
});

test("Hellkite's power bonus expires and once-per-turn use clears on the next turn", async () => {
  const game = await triggerGame();
  const hellkite = game.seed("Steel Hellkite", "battlefield");
  const ring = game.seed("Sol Ring", "battlefield");
  game.command(0, {
    type: "activate-ability",
    objectId: ring.id,
    abilityId: "mana",
  });
  game.command(0, {
    type: "activate-ability",
    objectId: hellkite.id,
    abilityId: "pump",
  });
  game.pass();
  expect(game.view().objects[hellkite.id].characteristics.power).toBe("6");
  game.command(0, {
    type: "activate-ability",
    objectId: hellkite.id,
    abilityId: "destroy-damaged",
  });
  game.command(0, {
    type: "rules-input",
    procedureId: game.view().rules!.pending!.id,
    variables: { X: 0 },
  });
  game.command(0, {
    type: "rules-input",
    procedureId: game.view().rules!.pending!.id,
    confirm: true,
  });
  game.pass();
  expect(
    game.command(0, {
      type: "activate-ability",
      objectId: hellkite.id,
      abilityId: "destroy-damaged",
    }).kind,
  ).toBe("rejected");
  game.match.turn.stepIndex = 10;
  game.pass();
  expect(game.view().objects[hellkite.id].characteristics.power).toBe("5");
  game.command(1, { type: "pass-priority" });
  expect(
    game.command(0, {
      type: "activate-ability",
      objectId: hellkite.id,
      abilityId: "destroy-damaged",
    }).kind,
  ).toBe("pending");
});

test("Battlesphere retains its selected bonus when the attacked planeswalker leaves before its trigger resolves", async () => {
  const game = await triggerGame();
  const sphere = game.seed("Myr Battlesphere", "battlefield");
  const myr = game.seed("Silver Myr", "battlefield");
  const walker = game.seed("Mind Stone", "battlefield", 1);
  walker.characteristics.types = ["Planeswalker"];
  walker.counters = [{ kind: "loyalty", quantity: "8" }];
  game.seed("Shimmer Myr", "battlefield");
  const golem = game.seed("Meteor Golem", "hand");
  game.pass();
  game.pass();
  game.answer({ [sphere.id]: [walker.id] });
  game.match.rules!.mana[game.match.players[0].id].U = 7;
  game.command(0, { type: "cast-spell", objectId: golem.id });
  game.pass();
  game.command(0, {
    type: "rules-input",
    procedureId: game.view().rules!.pending!.id,
    targetIds: [walker.id],
  });
  game.pass();
  expect(game.view().objects[walker.id]).toBeUndefined();
  game.pass();
  game.answer({ select: [myr.id] });
  expect(game.view().objects[sphere.id].characteristics.power).toBe("5");
  expect(game.view().players[1].life).toBe("40");
  expect(game.view().rules!.damageEvents ?? []).toHaveLength(0);
});

test("Signpost outside declare attackers has no redirection trigger and retains its blue mana ability", async () => {
  const game = await triggerGame();
  const sign = game.seed("Misleading Signpost", "hand");
  game.match.rules!.mana[game.match.players[0].id].U = 3;
  game.command(0, { type: "cast-spell", objectId: sign.id });
  game.pass();
  expect(game.view().rules!.pending).toBeUndefined();
  expect(game.view().zones.find((z) => z.kind === "stack")!.count).toBe(0);
  const source = Object.values(game.view().objects).find(
    (o) => o.characteristics.name === "Misleading Signpost",
  )!;
  expect(
    game.command(0, {
      type: "activate-ability",
      objectId: source.id,
      abilityId: "mana",
    }).kind,
  ).toBe("accepted");
  expect(game.view().rules!.mana[game.match.players[0].id].U).toBe(1);
});

test("improvise taps explicit artifacts without producing mana and Cannoneer entry grows it", async () => {
  const g = await triggerGame();
  const kappa = g.seed("Kappa Cannoneer", "hand");
  const artifacts = Array.from({ length: 5 }, () =>
    g.seed("Mind Stone", "battlefield"),
  );
  const p = g.match.players[0].id;
  g.match.rules!.mana[p].U = 1;
  expect(g.command(0, { type: "cast-spell", objectId: kappa.id }).kind).toBe(
    "pending",
  );
  expect(g.view().rules!.pending!.selectionOptions.improvise.objectIds).toEqual(
    expect.arrayContaining(artifacts.map((a) => a.id)),
  );
  expect(g.answer({ improvise: artifacts.map((a) => a.id) }).kind).toBe(
    "accepted",
  );
  expect(artifacts.every((a) => g.view().objects[a.id].status.tapped)).toBe(
    true,
  );
  expect(g.view().rules!.mana[p].C).toBe(0);
  g.pass();
  g.pass();
  const permanent = Object.values(g.view().objects).find(
    (o) => o.characteristics.name === "Kappa Cannoneer",
  )!;
  expect(permanent.counters).toContainEqual({ kind: "+1/+1", quantity: "1" });
  expect(permanent.characteristics.keywords).toContain("Unblockable");
  for (let i = 0; i < 15 && g.match.turn.number === 1; i++) {
    if (g.view().rules!.pending?.kind === "declare-attackers") g.answer({});
    else g.pass();
  }
  expect(g.match.turn.number).toBe(2);
  expect(g.view().objects[permanent.id].counters).toContainEqual({
    kind: "+1/+1",
    quantity: "1",
  });
  expect(g.view().objects[permanent.id].characteristics.keywords).not.toContain(
    "Unblockable",
  );
});

for (const pay of [false, true])
  test(`ward ${pay ? "payment preserves" : "decline counters"} the targeted spell after its original cost`, async () => {
    const g = await triggerGame();
    const kappa = g.seed("Kappa Cannoneer", "battlefield", 1);
    const spell = g.seed("Aether Spellbomb", "battlefield");
    g.match.rules!.mana[g.match.players[0].id].U = 1;
    g.match.rules!.mana[g.match.players[0].id].C = 4;
    expect(
      g.command(0, {
        type: "activate-ability",
        objectId: spell.id,
        abilityId: "bounce",
      }).kind,
    ).toBe("pending");
    const pending = g.view().rules!.pending!;
    expect(
      g.command(0, {
        type: "rules-input",
        procedureId: pending.id,
        targetIds: [kappa.id],
      }).kind,
    ).toBe("accepted");
    expect(g.view().zones.find((z) => z.kind === "stack")!.count).toBe(2);
    g.pass();
    expect(g.view().rules!.pending!.totalCost.generic).toBe(4);
    expect(
      g.command(0, {
        type: "rules-input",
        procedureId: g.view().rules!.pending!.id,
        confirm: pay,
      }).kind,
    ).toBe("accepted");
    if (pay) g.pass();
    expect(!!g.view().objects[kappa.id]).toBe(!pay);
    expect(g.view().rules!.mana[g.match.players[0].id].C).toBe(pay ? 0 : 4);
  });

test("Monument produces additional mana immediately once per tapped source and stacks colorless cast life gain", async () => {
  const g = await triggerGame();
  g.seed("Forsaken Monument", "battlefield");
  const ring = g.seed("Sol Ring", "battlefield");
  const myr = g.seed("Silver Myr", "battlefield");
  expect(g.view().objects[myr.id].characteristics.power).toBe("3");
  expect(
    g.command(0, {
      type: "activate-ability",
      objectId: ring.id,
      abilityId: "mana",
      color: "C",
    }).kind,
  ).toBe("accepted");
  expect(g.view().rules!.mana[g.match.players[0].id].C).toBe(3);
  expect(g.view().zones.find((z) => z.kind === "stack")!.count).toBe(0);
  const stone = g.seed("Mind Stone", "hand");
  expect(g.command(0, { type: "cast-spell", objectId: stone.id }).kind).toBe(
    "accepted",
  );
  expect(g.view().players[0].life).toBe("40");
  g.pass();
  expect(g.view().players[0].life).toBe("42");
  expect(g.view().rules!.mana[g.match.players[0].id].C).toBe(1);
});

test("Commander casts retain designation, tax is locked, and graveyard return resumes privately", async () => {
  const g = await triggerGame();
  const p = g.match.players[0].id;
  const commander = Object.values(g.view().objects).find((o) =>
    o.cardInstanceIds?.includes(g.match.rules!.commanders[p].instanceId),
  )!;
  g.match.rules!.mana[p].U = 5;
  expect(
    g.command(0, { type: "cast-spell", objectId: commander.id }).kind,
  ).toBe("accepted");
  g.pass();
  const creature = Object.values(g.view().objects).find((o) =>
    o.cardInstanceIds?.includes(g.match.rules!.commanders[p].instanceId),
  )!;
  const disk = g.seed("Nevinyrral's Disk", "battlefield");
  g.match.rules!.mana[p].C = 1;
  expect(
    g.command(0, {
      type: "activate-ability",
      objectId: disk.id,
      abilityId: "destroy",
    }).kind,
  ).toBe("accepted");
  g.pass();
  expect(g.view().rules!.pending!.kind).toBe("commander-return");
  expect(g.view(1).rules!.pending).toBeUndefined();
  expect(
    g.command(0, {
      type: "rules-input",
      procedureId: g.view().rules!.pending!.id,
      confirm: true,
    }).kind,
  ).toBe("accepted");
  const returned = Object.values(g.view().objects).find((o) =>
    o.cardInstanceIds?.includes(g.match.rules!.commanders[p].instanceId),
  )!;
  expect(returned.zoneId).toBe(
    g.view().zones.find((z) => z.kind === "command")!.id,
  );
  g.match.rules!.mana[p].U = 0;
  expect(g.command(0, { type: "cast-spell", objectId: returned.id }).kind).toBe(
    "pending",
  );
  expect(g.view().rules!.pending!.totalCost.generic).toBe(2);
  expect(g.view().objects[creature.id]).toBeUndefined();
});

test("Favor attaches before its entry trigger, taps the creature and crowns the monarch", async () => {
  const g = await triggerGame();
  const creature = g.seed("Silver Myr", "battlefield", 1);
  const favor = g.seed("Fall from Favor", "hand");
  g.match.rules!.mana[g.match.players[0].id].U = 3;
  expect(g.command(0, { type: "cast-spell", objectId: favor.id }).kind).toBe(
    "pending",
  );
  expect(
    g.command(0, {
      type: "rules-input",
      procedureId: g.view().rules!.pending!.id,
      targetIds: [creature.id],
    }).kind,
  ).toBe("accepted");
  g.pass();
  g.pass();
  expect(g.view().objects[creature.id].status.tapped).toBe(true);
  expect(g.view().rules!.monarchId).toBe(g.match.players[0].id);
  expect(
    Object.values(g.view().objects).find(
      (o) => o.characteristics.name === "Fall from Favor",
    )!.attachmentTo,
  ).toBe(creature.id);
});

test("solo Commander practice has an inert opponent, automatic passes and private delegated choices", async () => {
  const { room, catalog } = commanderFixture();
  room.participants.pop();
  const service = new MatchService();
  const match = service.createCommander(room, catalog, room.participants[0].id);
  const act = (action: import("../src/shared/model").MatchAction) =>
    service.execute(match, room.participants[0], action, catalog);
  expect(match.players).toHaveLength(2);
  expect(room.participants).toHaveLength(1);
  expect(act({ type: "keep-hand", bottomIds: [] }).kind).toBe("accepted");
  expect(match.outcome).toBe("ongoing");
  expect(match.priority!.playerId).toBe(match.players[0].id);
  expect(act({ type: "pass-priority" }).kind).toBe("accepted");
  expect(match.priority!.playerId).toBe(match.players[0].id);
  expect(match.turn.stepIndex).toBe(2);
  const spectator = matchView(match, randomUUID(), catalog);
  expect(spectator.actions).toEqual([]);
  expect(
    spectator.zones.filter((z) => z.kind === "hand").every((z) => !z.objectIds),
  ).toBe(true);
});

test("Launch Mishap counters a creature spell and creates its Thopter through the shared resolver", async () => {
  const g = await triggerGame();
  const creature = g.seed("Silver Myr", "hand");
  const mishap = g.seed("Launch Mishap", "hand", 1);
  g.match.rules!.mana[g.match.players[0].id].C = 2;
  g.match.rules!.mana[g.match.players[1].id].U = 3;
  expect(g.command(0, { type: "cast-spell", objectId: creature.id }).kind).toBe(
    "accepted",
  );
  expect(g.command(0, { type: "pass-priority" }).kind).toBe("accepted");
  expect(g.command(1, { type: "cast-spell", objectId: mishap.id }).kind).toBe(
    "pending",
  );
  const target = g.view(1).zones.find((z) => z.kind === "stack")!.objectIds![0];
  expect(
    g.command(1, {
      type: "rules-input",
      procedureId: g.view(1).rules!.pending!.id,
      targetIds: [target],
    }).kind,
  ).toBe("accepted");
  g.pass();
  expect(g.view().zones.find((z) => z.kind === "stack")!.count).toBe(0);
  expect(
    Object.values(g.view().objects).filter(
      (o) => o.characteristics.name === "Thopter",
    ),
  ).toHaveLength(1);
});

test("Whirler Rogue creates two Thopters and taps selected artifacts to make a creature unblockable", async () => {
  const g = await triggerGame();
  const rogue = g.seed("Whirler Rogue", "hand");
  g.match.rules!.mana[g.match.players[0].id].U = 4;
  expect(g.command(0, { type: "cast-spell", objectId: rogue.id }).kind).toBe(
    "accepted",
  );
  g.pass();
  g.pass();
  const thopters = Object.values(g.view().objects).filter(
    (o) => o.characteristics.name === "Thopter",
  );
  expect(thopters).toHaveLength(2);
  const permanent = Object.values(g.view().objects).find(
    (o) => o.characteristics.name === "Whirler Rogue",
  )!;
  expect(
    g.command(0, {
      type: "activate-ability",
      objectId: permanent.id,
      abilityId: "unblockable",
    }).kind,
  ).toBe("pending");
  expect(
    g.command(0, {
      type: "rules-input",
      procedureId: g.view().rules!.pending!.id,
      targetIds: [permanent.id],
      selections: { "0": thopters.map((o) => o.id) },
    }).kind,
  ).toBe("accepted");
  g.pass();
  expect(g.view().objects[permanent.id].characteristics.keywords).toContain(
    "Unblockable",
  );
});

test("Aetherize returns all attacking creatures to their owners without moving blockers", async () => {
  const g = await triggerGame();
  const attacker = g.seed("Silver Myr", "battlefield");
  const blocker = g.seed("Silver Myr", "battlefield", 1);
  const bounce = g.seed("Aetherize", "hand");
  g.match.rules!.mana[g.match.players[0].id].U = 4;
  g.match.rules!.combat = {
    attackers: [
      {
        objectId: attacker.id,
        defenderId: g.match.players[1].id,
        defendingPlayerId: g.match.players[1].id,
        blockerIds: [blocker.id],
        blocked: true,
      },
    ],
    remainingDefenderIds: [],
  };
  expect(g.command(0, { type: "cast-spell", objectId: bounce.id }).kind).toBe(
    "accepted",
  );
  g.pass();
  expect(g.view().objects[attacker.id]).toBeUndefined();
  expect(g.view().objects[blocker.id]).toBeDefined();
  expect(
    Object.values(g.view().objects).find((o) =>
      o.cardInstanceIds?.includes(attacker.cardInstanceIds[0]),
    )!.zoneId,
  ).toBe(
    g
      .view()
      .zones.find(
        (z) => z.kind === "hand" && z.ownerId === g.match.players[0].id,
      )!.id,
  );
});

test("the complete mono-U pool resolves to 100 cards and 67 supported definitions in mirror and practice setup", async () => {
  const { readFile } = await import("node:fs/promises");
  const { CatalogService } =
    await import("../src/server/catalog/catalog.service");
  const { automationEligible } = await import("../src/server/match/commander");
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
  room.participants[0].decklists[0].entries = entries;
  room.participants[0].selectedCommanderId = sai.id;
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

for (const returnToCommand of [true, false])
  test(`commander Hand replacement ${returnToCommand ? "redirects" : "permits bounce"} and resumes after serialized recovery`, async () => {
    const g = await triggerGame();
    const p = g.match.players[0].id;
    const commander = Object.values(g.view().objects).find((o) =>
      o.cardInstanceIds?.includes(g.match.rules!.commanders[p].instanceId),
    )!;
    g.match.rules!.mana[p].U = 1;
    expect(
      g.command(0, { type: "cast-spell", objectId: commander.id }).kind,
    ).toBe("accepted");
    g.pass();
    const creature = Object.values(g.view().objects).find((o) =>
      o.cardInstanceIds?.includes(g.match.rules!.commanders[p].instanceId),
    )!;
    const bomb = g.seed("Aether Spellbomb", "battlefield");
    g.match.rules!.mana[p].U = 1;
    expect(
      g.command(0, {
        type: "activate-ability",
        objectId: bomb.id,
        abilityId: "bounce",
      }).kind,
    ).toBe("pending");
    expect(
      g.command(0, {
        type: "rules-input",
        procedureId: g.view().rules!.pending!.id,
        targetIds: [creature.id],
      }).kind,
    ).toBe("accepted");
    g.pass();
    const pending = g.view().rules!.pending!;
    expect(pending.kind).toBe("commander-return");
    expect(g.view(1).rules!.pending).toBeUndefined();
    const restored = JSON.parse(JSON.stringify(g.match));
    const result = g.service.execute(
      restored,
      g.room.participants[0],
      {
        type: "rules-input",
        procedureId: pending.id,
        confirm: returnToCommand,
      },
      g.catalog,
    );
    expect(result).toMatchObject({ kind: "accepted" });
    const view = matchView(restored, g.room.participants[0].id, g.catalog);
    const moved = Object.values(view.objects).find((o) =>
      o.cardInstanceIds?.includes(g.match.rules!.commanders[p].instanceId),
    )!;
    expect(moved.zoneId).toBe(
      view.zones.find(
        (z) =>
          z.kind === (returnToCommand ? "command" : "hand") &&
          (returnToCommand || z.ownerId === p),
      )!.id,
    );
    expect(view.rules!.mana[p].U).toBe(0);
    expect(
      g.service.execute(
        restored,
        g.room.participants[0],
        {
          type: "rules-input",
          procedureId: pending.id,
          confirm: returnToCommand,
        },
        g.catalog,
      ).kind,
    ).toBe("rejected");
  });

for (const name of ["Thought Monitor", "Memory Guardian", "Broodstar"])
  test(`${name} composes artifact affinity, flying and its distinct resolved characteristics`, async () => {
    const g = await triggerGame();
    const spell = g.seed(name, "hand");
    for (let i = 0; i < 7; i++) g.seed("Mind Stone", "battlefield");
    const p = g.match.players[0].id;
    const before = g.handCount();
    g.match.rules!.mana[p].U = name === "Broodstar" ? 2 : 1;
    if (name === "Broodstar") g.match.rules!.mana[p].C = 1;
    expect(g.command(0, { type: "cast-spell", objectId: spell.id }).kind).toBe(
      "accepted",
    );
    g.pass();
    if (name === "Thought Monitor") g.pass();
    const permanent = Object.values(g.view().objects).find((o) =>
      o.cardInstanceIds?.includes(spell.cardInstanceIds[0]),
    )!;
    expect(permanent.characteristics.keywords).toContain("Flying");
    expect(g.view().rules!.mana[p].U).toBe(0);
    expect(g.handCount()).toBe(
      before - 1 + (name === "Thought Monitor" ? 2 : 0),
    );
    if (name === "Broodstar") expect(permanent.characteristics.power).toBe("7");
  });

test("improvise composes discounts and rejects tapped or duplicate artifacts atomically", async () => {
  const g = await triggerGame();
  const kappa = g.seed("Kappa Cannoneer", "hand");
  const reducer = g.seed("Etherium Sculptor", "battlefield");
  const ring = g.seed("Sol Ring", "battlefield");
  const tapped = g.seed("Mind Stone", "battlefield");
  tapped.status.tapped = true;
  const myr = g.seed("Silver Myr", "battlefield");
  const stone = g.seed("Mind Stone", "battlefield");
  g.match.rules!.mana[g.match.players[0].id].U = 1;
  expect(g.command(0, { type: "cast-spell", objectId: kappa.id }).kind).toBe(
    "pending",
  );
  expect(g.view().rules!.pending!.totalCost.generic).toBe(4);
  const before = g.view();
  expect(g.answer({ improvise: [tapped.id] }).kind).toBe("rejected");
  expect(g.answer({ improvise: [ring.id, ring.id] }).kind).toBe("rejected");
  expect(g.view()).toEqual(before);
  expect(
    g.command(0, {
      type: "activate-ability",
      objectId: ring.id,
      abilityId: "mana",
      color: "C",
    }).kind,
  ).toBe("pending");
  expect(g.answer({ improvise: [reducer.id, myr.id] }).kind).toBe("accepted");
  expect(g.view().objects[stone.id].status.tapped).toBe(false);
  expect(g.view().rules!.mana[g.match.players[0].id].C).toBe(0);
});

for (const commander of [false, true])
  test(`combat ${commander ? "commander damage causes loss at 21" : "transfers monarch through a Stack trigger"}`, async () => {
    const g = await triggerGame();
    const attacker = g.seed("Silver Myr", "battlefield");
    const p = g.match.players[0].id,
      opponent = g.match.players[1].id;
    if (commander) {
      g.match.instances[attacker.cardInstanceIds[0]].commander = true;
      g.match.rules!.commanderDamage = {
        [opponent]: { [attacker.cardInstanceIds[0]]: 20 },
      };
    } else g.match.rules!.monarchId = opponent;
    g.pass();
    g.pass();
    expect(g.answer({ [attacker.id]: [opponent] }).kind).toBe("accepted");
    g.pass();
    expect(g.answer({}, 1).kind).toBe("accepted");
    g.pass();
    if (commander) {
      expect(g.view().players[1].life).toBe("39");
      expect(g.view().outcome).toBe("complete");
    } else {
      expect(g.view().rules!.monarchId).toBe(opponent);
      g.pass();
      expect(g.view().rules!.monarchId).toBe(p);
    }
  });

test("the monarch end-step draw is stacked and privately increases only that player's Hand", async () => {
  const g = await triggerGame();
  g.match.rules!.monarchId = g.match.players[0].id;
  g.match.turn.stepIndex = 9;
  const before = g.handCount();
  g.pass();
  expect(g.handCount()).toBe(before);
  expect(g.view().zones.find((z) => z.kind === "stack")!.count).toBe(1);
  g.pass();
  expect(g.handCount()).toBe(before + 1);
  expect(
    g
      .view(1)
      .zones.find(
        (z) => z.kind === "hand" && z.ownerId === g.match.players[0].id,
      )!.objectIds,
  ).toBeUndefined();
});

for (const monarch of [0, 1])
  test(`Favor untap restriction evaluates the creature controller as monarch ${monarch}`, async () => {
    const g = await triggerGame();
    const creature = g.seed("Silver Myr", "battlefield", 1);
    creature.status.tapped = true;
    g.seed("Fall from Favor", "battlefield").attachmentTo = creature.id;
    g.match.rules!.monarchId = g.match.players[monarch].id;
    g.match.turn.stepIndex = 11;
    g.pass();
    expect(g.view().objects[creature.id].status.tapped).toBe(monarch !== 1);
  });

test("a commander destroyed in the second player's Graveyard offers that owner's return choice", async () => {
  const g = await triggerGame();
  const p = g.match.players[1].id;
  g.match.turn.activePlayerId = p;
  g.match.priority = { playerId: p, passedPlayerIds: [] };
  const commander = Object.values(g.view(1).objects).find((o) =>
    o.cardInstanceIds?.includes(g.match.rules!.commanders[p].instanceId),
  )!;
  g.match.rules!.mana[p].U = 1;
  expect(
    g.command(1, { type: "cast-spell", objectId: commander.id }).kind,
  ).toBe("accepted");
  g.pass();
  const disk = g.seed("Nevinyrral's Disk", "battlefield", 1);
  g.match.rules!.mana[p].C = 1;
  expect(
    g.command(1, {
      type: "activate-ability",
      objectId: disk.id,
      abilityId: "destroy",
    }).kind,
  ).toBe("accepted");
  g.pass();
  expect(g.view(1).rules!.pending!.kind).toBe("commander-return");
  expect(
    g.command(1, {
      type: "rules-input",
      procedureId: g.view(1).rules!.pending!.id,
      confirm: true,
    }).kind,
  ).toBe("accepted");
  const returned = Object.values(g.view(1).objects).find((o) =>
    o.cardInstanceIds?.includes(g.match.rules!.commanders[p].instanceId),
  )!;
  expect(returned.zoneId).toBe(
    g.view(1).zones.find((z) => z.kind === "command")!.id,
  );
});

for (const [keyword, cardName] of [
  ["Ward", "Kappa Cannoneer"],
  ["Improvise", "Kappa Cannoneer"],
  ["Cycling", "Lonely Sandbar"],
  ["Affinity", "Thoughtcast"],
])
  test(`Commander setup rejects an empty authored ${keyword} envelope`, async () => {
    const release = await readCatalog("catalog");
    const { room, catalog } = commanderFixture();
    const kappa = structuredClone(
      Object.values(release.definitions).find(
        (d) => d.canonicalName === cardName,
      )!,
    );
    kappa.abilities = kappa.abilities.map((a) =>
      a.keyword?.toLowerCase() === keyword.toLowerCase()
        ? {
            id: a.id,
            kind: "static",
            origin: "printed",
            keyword,
            rules: { costs: [], effects: [] },
          }
        : a,
    );
    catalog.definitions[kappa.id] = kappa;
    catalog.printings[kappa.defaultPrintingId] =
      release.printings[kappa.defaultPrintingId];
    room.participants[0].decklists[0].entries[1].quantity--;
    room.participants[0].decklists[0].entries.push({
      definitionId: kappa.id,
      printingId: kappa.defaultPrintingId,
      quantity: 1,
    });
    expect(() => new MatchService().createCommander(room, catalog)).toThrow(
      `Unsupported cards: ${cardName}`,
    );
  });

test("the monarch controls its transfer trigger above the attacker's Research Thief draw", async () => {
  const g = await triggerGame();
  g.seed("Research Thief", "battlefield");
  const attacker = g.seed("Silver Myr", "battlefield");
  const p = g.match.players[0].id,
    opponent = g.match.players[1].id;
  g.match.rules!.monarchId = opponent;
  g.pass();
  g.pass();
  expect(g.answer({ [attacker.id]: [opponent] }).kind).toBe("accepted");
  g.pass();
  expect(g.answer({}, 1).kind).toBe("accepted");
  g.pass();
  expect(g.view().rules!.pending).toBeUndefined();
  const stack = g.view().zones.find((z) => z.kind === "stack")!.objectIds!;
  expect(stack).toHaveLength(2);
  expect(g.view().objects[stack[1]].controllerId).toBe(opponent);
  const before = g.handCount();
  g.pass();
  expect(g.view().rules!.monarchId).toBe(p);
  expect(g.handCount()).toBe(before);
  g.pass();
  expect(g.handCount()).toBe(before + 1);
});

test("solo controller answers the practice opponent's required sacrifice while spectators have no choice access", async () => {
  const g = await triggerGame();
  const practiceId = g.match.players[1].id;
  g.match.rules!.practice = {
    playerId: practiceId,
    controllerParticipantId: g.room.participants[0].id,
  };
  g.match.players[1].participantId = randomUUID();
  const padeem = g.seed("Padeem, Consul of Innovation", "battlefield", 1);
  const dust = g.seed("All Is Dust", "hand");
  g.match.rules!.mana[g.match.players[0].id].C = 7;
  expect(g.command(0, { type: "cast-spell", objectId: dust.id }).kind).toBe(
    "accepted",
  );
  expect(g.command(0, { type: "pass-priority" }).kind).toBe("pending");
  const pending = g.view().rules!.pending!;
  expect(pending.playerId).toBe(practiceId);
  const spectator = matchView(g.match, g.room.participants[1].id, g.catalog);
  expect(spectator.rules!.pending).toBeUndefined();
  expect(spectator.actions).toEqual([]);
  const hand = g
    .view()
    .zones.find(
      (z) => z.kind === "hand" && z.ownerId === g.match.players[0].id,
    )!;
  expect(hand.objectIds).toBeDefined();
  expect(
    g.command(1, {
      type: "rules-input",
      procedureId: pending.id,
      selections: { select: [padeem.id] },
    }).kind,
  ).toBe("rejected");
  expect(
    g.command(0, {
      type: "rules-input",
      procedureId: pending.id,
      selections: { select: [padeem.id] },
    }).kind,
  ).toBe("accepted");
  expect(g.view().objects[padeem.id]).toBeUndefined();
  expect(g.view().priority!.playerId).toBe(g.match.players[0].id);
});

test("commander tax and artifact reducers compose before the locked Command Zone payment", async () => {
  const g = await triggerGame();
  const graaz = g.seed("Graaz, Unstoppable Juggernaut", "hand");
  const instance = graaz.cardInstanceIds[0];
  g.match.instances[instance].commander = true;
  const commandZone = g.match.zones.find((z) => z.kind === "command")!;
  const commander = moveObject(g.match, graaz.id, commandZone);
  g.match.rules!.commanderCasts = { [instance]: 1 };
  g.seed("Foundry Inspector", "battlefield");
  g.seed("Etherium Sculptor", "battlefield");
  expect(
    g.command(0, { type: "cast-spell", objectId: commander.id }).kind,
  ).toBe("pending");
  expect(g.view().rules!.pending!.totalCost.generic).toBe(8);
});

test("ward outlives its removed source and counters the captured responsible ability", async () => {
  const g = await triggerGame();
  const kappa = g.seed("Kappa Cannoneer", "battlefield", 1);
  const bomb = g.seed("Aether Spellbomb", "battlefield");
  const ownBomb = g.seed("Aether Spellbomb", "battlefield", 1);
  g.match.rules!.mana[g.match.players[0].id].U = 1;
  g.match.rules!.mana[g.match.players[1].id].U = 1;
  g.command(0, {
    type: "activate-ability",
    objectId: bomb.id,
    abilityId: "bounce",
  });
  g.command(0, {
    type: "rules-input",
    procedureId: g.view().rules!.pending!.id,
    targetIds: [kappa.id],
  });
  g.command(0, { type: "pass-priority" });
  g.command(1, {
    type: "activate-ability",
    objectId: ownBomb.id,
    abilityId: "bounce",
  });
  expect(
    g.command(1, {
      type: "rules-input",
      procedureId: g.view(1).rules!.pending!.id,
      targetIds: [kappa.id],
    }).kind,
  ).toBe("accepted");
  g.pass();
  expect(g.view().objects[kappa.id]).toBeUndefined();
  g.pass();
  expect(
    g.command(0, {
      type: "rules-input",
      procedureId: g.view().rules!.pending!.id,
      confirm: false,
    }).kind,
  ).toBe("accepted");
  expect(g.view().zones.find((z) => z.kind === "stack")!.count).toBe(0);
});

test("multiple ward triggers use their controller's ordering and independently permit declining", async () => {
  const g = await triggerGame();
  const kappa = g.seed("Kappa Cannoneer", "battlefield", 1);
  const card =
    g.catalog.definitions[
      g.match.instances[kappa.cardInstanceIds[0]].definitionId
    ];
  card.abilities.push({
    ...structuredClone(card.abilities.find((a) => a.id === "ward")!),
    id: "second-ward",
  });
  const bomb = g.seed("Aether Spellbomb", "battlefield");
  g.match.rules!.mana[g.match.players[0].id].U = 1;
  g.command(0, {
    type: "activate-ability",
    objectId: bomb.id,
    abilityId: "bounce",
  });
  expect(
    g.command(0, {
      type: "rules-input",
      procedureId: g.view().rules!.pending!.id,
      targetIds: [kappa.id],
    }).kind,
  ).toBe("pending");
  const order = g.view(1).rules!.pending!.selectionOptions.order.objectIds;
  expect(order).toHaveLength(2);
  expect(g.answer({ order }, 1).kind).toBe("accepted");
  for (let i = 0; i < 2; i++) {
    g.pass();
    expect(
      g.command(0, {
        type: "rules-input",
        procedureId: g.view().rules!.pending!.id,
        confirm: false,
      }).kind,
    ).toBe("accepted");
  }
  expect(g.view().zones.find((z) => z.kind === "stack")!.count).toBe(0);
});

test("Favor goes to its owner's Graveyard when its enchanted creature leaves while monarchy persists", async () => {
  const g = await triggerGame();
  const creature = g.seed("Silver Myr", "battlefield", 1);
  const favor = g.seed("Fall from Favor", "battlefield");
  favor.attachmentTo = creature.id;
  const p = g.match.players[0].id;
  g.match.rules!.monarchId = p;
  const bomb = g.seed("Aether Spellbomb", "battlefield");
  g.match.rules!.mana[p].U = 1;
  g.command(0, {
    type: "activate-ability",
    objectId: bomb.id,
    abilityId: "bounce",
  });
  expect(
    g.command(0, {
      type: "rules-input",
      procedureId: g.view().rules!.pending!.id,
      targetIds: [creature.id],
    }).kind,
  ).toBe("accepted");
  g.pass();
  expect(g.view().objects[favor.id]).toBeUndefined();
  const graveyard = g
    .view()
    .zones.find((z) => z.kind === "graveyard" && z.ownerId === p)!;
  expect(
    graveyard.objectIds!.map((id) => g.view().objects[id].characteristics.name),
  ).toContain("Fall from Favor");
  expect(g.view().rules!.monarchId).toBe(p);
});
