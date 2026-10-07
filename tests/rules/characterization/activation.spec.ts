// Characterization tests: activated abilities and their costs.
//
// Classification (rules test plan §2):
// | Test | Class | Reason
// | --- | --- | ---
// | paid draw abilities outlive sacrificed sources and cycling discards from Hand | Preserve |
// | both cycling lands enter tapped, and Remote Isle and Hedron Archive resolve their complete draw abilities | Preserve |
// | a pending activated procedure resumes without sacrificing twice | Preserve |
// | Transmuter returns Wellspring as a cost and can privately select that same card for tapped or triggered reentry | Preserve |
// | bounce returns a stolen creature to its owner's Hand and Buried Ruin retrieves only its owner's artifact cards | Preserve |
// | Transmuter permits declining and skips selection when Hand has no artifact, while equip requires a legal target | Preserve |
// | crew taps newly controlled creatures for effective power and animation expires at cleanup | Preserve |

import { expect, test } from "@playwright/test";
import { matchView } from "../../../src/server/match/match-view";
import { moveObject } from "../../../src/server/match/game-objects";
import "../../support/round-trip";
import { rulesGame } from "../../support/rules-game";
import { force } from "../../support/force";

test("paid draw abilities outlive sacrificed sources and cycling discards from Hand", async () => {
  const { match, command, seed, room } = await rulesGame();
  const stone = seed("Mind Stone", "battlefield");
  force.mana(match, match.players[0].id, { C: 1 });
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
  force.mana(match, match.players[0].id, { U: 1 });
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
    force.mana(match, match.players[0].id, { C: generic });
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
  const recovered: import("../../../src/shared/model").MatchState = JSON.parse(
    JSON.stringify(match),
  );
  force.mana(recovered, recovered.players[0].id, { C: 2 });
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

test("Transmuter returns Wellspring as a cost and can privately select that same card for tapped or triggered reentry", async () => {
  const game = await rulesGame();
  const transmuter = game.seed("Master Transmuter", "battlefield");
  const spring = game.seed("Ichor Wellspring", "battlefield");
  const view = (seat = 0) =>
    matchView(game.match, game.room.participants[seat].id, game.catalog);
  const before = view().zones.find(
    (z) => z.kind === "hand" && z.ownerId === game.match.players[0].id,
  )!.count;
  force.mana(game.match, game.match.players[0].id, { U: 1 });
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
    (o) => o.characteristics.name === "Ichor Wellspring",
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
    (o) => o.characteristics.name === "Ichor Wellspring",
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

test("bounce returns a stolen creature to its owner's Hand and Buried Ruin retrieves only its owner's artifact cards", async () => {
  const game = await rulesGame();
  const bomb = game.seed("Aether Spellbomb", "battlefield");
  const stolen = game.seed("Silver Myr", "battlefield", 1);
  force.controller(stolen, game.match.players[0].id);
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
  force.mana(game.match, game.match.players[0].id, {
    W: 0,
    U: 1,
    B: 0,
    R: 0,
    G: 0,
    C: 2,
  });
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
    (o) => o.characteristics.name === "Silver Myr",
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
      (o) => o.characteristics.name === "Mind Stone",
    )!.zoneId,
  ).toBe(
    view().zones.find(
      (z) => z.kind === "hand" && z.ownerId === game.match.players[0].id,
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
      if (effect.kind === "may" && effect.effects[0].kind === "move")
        effect.effects[0].objects = {
          choose: {
            from: { zone: "hand", type: ["Artifact"], subtype: ["Book"] },
            count: 1,
          },
        };
    }
    force.mana(game.match, game.match.players[0].id, { U: 1 });
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

test("crew taps newly controlled creatures for effective power and animation expires at cleanup", async () => {
  const game = await rulesGame();
  const vehicle = game.seed("Cultivator's Caravan", "battlefield");
  const myr = game.seed("Silver Myr", "battlefield");
  const chief = game.seed("Chief of the Foundry", "battlefield");
  force.controlledSince(game.match, myr, 1);
  force.counters(myr, [{ kind: "+1/+1", quantity: "1" }]);
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
  force.step(game.match, "end"); // Begin immediately before cleanup in this initial timing scenario.
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
