// Characterization tests: Stack resolution, targets, counterspells and resolving effects.
//
// Classification (rules test plan §2):
// | Test | Class | Reason
// | --- | --- | ---
// | Counterspell and Negate select spells rather than ability objects and resolve in Stack order | Move | asserts internal procedure stage names (TP §7)
// | counterspells revalidate targets, reject creature targets for Negate, and respect uncounterable spells | Preserve |
// | a resolving counterspell does nothing when its target has become illegal | Preserve |
// | Counterspell cannot select an Ability Game Object on the Stack | Preserve |
// | Thirst for Knowledge draws before offering private discard alternatives and resumes without drawing twice | Preserve |
// | {name} completes partial draws and discards before checking a failed draw (parameterized) | Preserve |
// | zero X with an empty Hand skips the impossible discard without attempting a draw | Preserve |
// | nested sequences bind results, take conditions, and rotate choice identifiers across reconnects | Preserve |
// | Disk destroys its union simultaneously, including itself, while captured death triggers survive | Preserve |
// | {name} enters tapped through a Transmuter effect without a casting record (parameterized) | Preserve |
// | All Is Dust collects each player's colored permanents before simultaneous sacrifice, including indestructible | Preserve |
// | Meteor Golem chooses only opponents' nonlands and Lantern exiles opponents' Graveyards after sacrifice | Preserve |
// | private Library selection and top/bottom ordering validate quantities and do not repeat on restore | Preserve |
// | noncombat ability damage retains the permanent source after sacrifice | Preserve |
// | Launch Mishap counters a creature spell and creates its Thopter through the shared resolver | Preserve |
// | Whirler Rogue creates two Thopters and taps selected artifacts to make a creature unblockable | Preserve |
// | Aetherize returns all attacking creatures to their owners without moving blockers | Preserve |

import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { matchView } from "../../../src/server/match/match-view";
import { gameObject } from "../../../src/server/match/game-objects";
import "../../support/round-trip";
import { rulesGame, triggerGame } from "../../support/rules-game";
import { force } from "../../support/force";

test("Counterspell and Negate select spells rather than ability objects and resolve in Stack order", async () => {
  const { match, command, seed, room } = await rulesGame();
  const permanent = seed("Sol Ring", "hand"),
    negate = seed("Negate", "hand", 1);
  force.mana(match, match.players[0].id, { C: 1 });
  force.mana(match, match.players[1].id, {
    W: 0,
    U: 2,
    B: 0,
    R: 0,
    G: 0,
    C: 1,
  });
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

test("counterspells revalidate targets, reject creature targets for Negate, and respect uncounterable spells", async () => {
  for (const uncounterable of [false, true]) {
    const { match, command, seed } = await rulesGame();
    const creature = seed("Silver Myr", "hand", 1),
      negate = seed("Negate", "hand"),
      counter = seed("Counterspell", "hand");
    force.mana(match, match.players[0].id, { U: 4 });
    force.move(match, creature, "stack");
    force.uncounterable(creature, uncounterable);
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

test("a resolving counterspell does nothing when its target has become illegal", async () => {
  const { match, command, seed } = await rulesGame();
  const target = seed("Sol Ring", "hand", 1),
    counter = seed("Counterspell", "hand");
  force.move(match, target, "stack");
  force.mana(match, match.players[0].id, { U: 2 });
  command(0, { type: "cast-spell", objectId: counter.id });
  command(0, {
    type: "rules-input",
    procedureId: match.rules!.pending!.id,
    targetIds: [target.id],
  });
  // The resolution fixture has another effect remove the selected spell first.
  force.move(match, match.objects[target.id], "graveyard", match.players[1].id);
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

test("Counterspell cannot select an Ability Game Object on the Stack", async () => {
  const { match, command, seed, catalog, room } = await rulesGame();
  const counter = seed("Counterspell", "hand");
  const stack = match.zones.find((zone) => zone.kind === "stack")!;
  const ability = gameObject(
    "ability",
    stack.id,
    match.players[1].id,
    match.players[1].id,
    {
      name: "Draw ability",
      typeLine: "Ability",
      colors: [],
      rulesText: "",
    },
  );
  force.addObject(match, ability);
  force.mana(match, match.players[0].id, { U: 2 });
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
  force.mana(match, player, { U: 3 });
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

for (const name of ["Thirst for Knowledge", "Pull from Tomorrow"]) {
  test(`${name} completes partial draws and discards before checking a failed draw`, async () => {
    const { match, command, seed, catalog, room } = await rulesGame();
    const player = match.players[0].id;
    force.clearZone(match, "hand", player);
    force.clearZone(match, "library", player, 1);
    const spell = seed(name, "hand");
    force.mana(match, player, { U: 5 });
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
  force.clearZone(match, "hand", player);
  const spell = seed("Pull from Tomorrow", "hand");
  force.mana(match, player, { U: 2 });
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
  force.mana(match, player, { U: 3 });
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

test("Disk destroys its union simultaneously, including itself, while captured death triggers survive", async () => {
  const game = await rulesGame();
  const disk = game.seed("Nevinyrral's Disk", "battlefield");
  const spring = game.seed("Ichor Wellspring", "battlefield");
  const retriever = game.seed("Myr Retriever", "battlefield");
  game.seed("Island", "battlefield");
  force.mana(game.match, game.match.players[0].id, { C: 1 });
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
    force.mana(game.match, game.match.players[0].id, { U: 1 });
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

test("All Is Dust collects each player's colored permanents before simultaneous sacrifice, including indestructible", async () => {
  const game = await rulesGame();
  const dust = game.seed("All Is Dust", "hand");
  const blue = game.seed("Master Transmuter", "battlefield");
  const opponent = game.seed("Master Transmuter", "battlefield", 1);
  opponent.characteristics.keywords = ["Indestructible"];
  const artifact = game.seed("Ichor Wellspring", "battlefield");
  force.mana(game.match, game.match.players[0].id, { C: 7 });
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
  force.mana(game.match, game.match.players[0].id, { C: 7 });
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

test("Launch Mishap counters a creature spell and creates its Thopter through the shared resolver", async () => {
  const g = await triggerGame();
  const creature = g.seed("Silver Myr", "hand");
  const mishap = g.seed("Launch Mishap", "hand", 1);
  force.mana(g.match, g.match.players[0].id, { C: 2 });
  force.mana(g.match, g.match.players[1].id, { U: 3 });
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
  force.mana(g.match, g.match.players[0].id, { U: 4 });
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
  force.mana(g.match, g.match.players[0].id, { U: 4 });
  force.rules(g.match, {
    combat: {
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
    },
  });
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
