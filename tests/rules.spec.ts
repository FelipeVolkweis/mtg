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

test("command execution accepts transitions and rejects actions without changing the player view", () => {
  const service = new MatchService();
  const room = emptyRoom();
  const match = service.create(room, emptyCatalog, "20");
  const actor = room.participants[0];
  expect(
    service.execute(match, actor, { type: "draw", count: 1 }, emptyCatalog),
  ).toMatchObject({ kind: "rejected" });
  expect(matchView(match, actor.id).revision).toBe(0);
  expect(
    service.execute(
      match,
      actor,
      { type: "life", playerId: match.players[0].id, value: "19" },
      emptyCatalog,
    ),
  ).toMatchObject({ kind: "accepted" });
  expect(matchView(match, actor.id).players[0].life).toBe("19");
  expect(match.revision).toBe(1);
});

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
  expect(command(0, { type: "turn", direction: "next" }).kind).toBe("rejected");
});

test("lands and simple spells use selected mana sources and retain casting identity after resolution", () => {
  const service = new MatchService();
  const { room, catalog } = commanderFixture();
  const match = service.createCommander(room, catalog, room.participants[0].id);
  const command = (
    seat: number,
    action: import("../src/shared/model").MatchAction,
  ) => service.execute(match, room.participants[seat], action, catalog);
  for (const seat of [0, 1])
    command(seat, { type: "keep-hand", bottomIds: [] });
  for (let step = 0; step < 2; step++) {
    command(0, { type: "pass-priority" });
    command(1, { type: "pass-priority" });
  }
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
  const release = await readCatalog("catalog");
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

test("Sai and Padeem are eligible commanders but unfinished behavior is rejected, and Graaz cannot lead blue cards", async () => {
  const release = await readCatalog("catalog");
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
  const release = await readCatalog("catalog");
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
