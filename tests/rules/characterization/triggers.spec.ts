// Characterization tests: triggered abilities, ordering and trigger batches.
//
// Classification (rules test plan §2):
// | Test | Class | Reason
// | --- | --- | ---
// | Wellspring entry triggers draw privately after the permanent resolves | Preserve |
// | artifact cast triggers keep their chosen Stack order across reconnects and tokens have no Card Instance | Preserve |
// | Wellspring sacrificed during Sai payment triggers above the paid ability and both draw independently | Preserve |
// | simultaneous triggers use active-player then nonactive-player order and state-based deaths retain both sources | Preserve |
// | triggers caused by mana payment wait until casting completes; a reversed cast discards them with the mana ability | Change | issue 10: the spell is on the Stack while it is paid for (TP §11); after cost lock the way out is `reverse-proposal`, which rolls back the mana abilities too (RE §16)
// | Tome's fourth page triggers exile above its independent scry, with private resumable inspection | Preserve |
// | Tome cannot gain life when its exile fails and does not duplicate a pending state trigger | Change | issue 10: an activated ability is on the Stack while its target is chosen (CR 602.2a)
// | draw ordinals, live Hand size and optional effect payment resume without duplicating draws | Preserve |
// | Mind's Eye accepts mana sources during its private effect payment and can decline without spending | Move | asserts internal procedure stage names (TP §7)
// | Scrawling upkeep draws for each player, Fabricator resets ordinals, and Vessel removes cleanup's discard | Preserve |
// | Psychosis survives temporarily empty Hand inside a resolving draw sequence | Preserve |
// | Padeem upkeep with {artifacts} uses current greatest artifact mana values (parameterized) | Preserve |
// | ward … (parameterized) | Preserve |
// | ward outlives its removed source and counters the captured responsible ability | Preserve |
// | multiple ward triggers use their controller's ordering and independently permit declining | Preserve |
// | Ward generated during trigger targeting follows the complete original placement batch across … (parameterized) | Move | reads internal runtime fields (TP §8)

import { expect, test } from "@playwright/test";
import type { ActivatedAbility } from "../../../src/shared/rules-v2";
import { matchView } from "../../../src/server/match/match-view";
import type { MatchState } from "../../../src/shared/model";
import "../../support/round-trip";
import { rulesGame, triggerGame } from "../../support/rules-game";
import { force } from "../../support/force";
import { author } from "../../support/authored";

test("Wellspring entry triggers draw privately after the permanent resolves", async () => {
  const { match, command, seed, room, catalog } = await rulesGame();
  const spell = seed("Ichor Wellspring", "hand");
  force.mana(match, match.players[0].id, { C: 2 });
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
  force.mana(match, match.players[0].id, { C: 1 });
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
    action: import("../../../src/shared/model").MatchAction,
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
  force.mana(match, match.players[0].id, { U: 2 });
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

test("simultaneous triggers use active-player then nonactive-player order and state-based deaths retain both sources", async () => {
  const { match, command, seed, room, catalog } = await rulesGame();
  const first = seed("Vedalken Archmage", "battlefield"),
    second = seed("Vedalken Archmage", "battlefield", 1);
  const card =
    catalog.definitions[match.instances[first.cardInstanceIds[0]].definitionId];
  await author(card, [
    {
      id: "death",
      kind: "triggered",
      trigger: {
        event: "zone-change",
        object: "source",
        from: "battlefield",
        to: "graveyard",
      },
      effects: [{ kind: "draw", count: 1 }],
    },
  ]);
  const spell = seed("Thoughtcast", "hand");
  await author(
    catalog.definitions[match.instances[spell.cardInstanceIds[0]].definitionId],
    [
      {
        id: "shrink",
        kind: "spell",
        effects: [
          {
            kind: "add-counters",
            objects: { all: { zone: "battlefield", type: ["Creature"] } },
            counter: "-1/-1",
            count: 2,
          },
        ],
      },
    ],
  );
  force.mana(match, match.players[0].id, { U: 1 });
  force.mana(match, match.players[0].id, { C: 4 });
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

test("triggers caused by mana payment wait until casting completes; a reversed cast discards them with the mana ability", async () => {
  for (const reverse of [true, false]) {
    const { match, command, seed, room, catalog } = await rulesGame();
    const well = seed("Ichor Wellspring", "battlefield"),
      spell = seed("Hedron Archive", "hand");
    const definition =
      catalog.definitions[
        match.instances[well.cardInstanceIds[0]].definitionId
      ];
    await author(definition, [
      ...definition.authoredAbilities,
      {
        id: "sacrifice-mana",
        kind: "mana",
        activation: { costs: [{ kind: "sacrifice-source" }] },
        produce: { quantity: 4, colors: ["C"] },
      },
    ]);
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
    // Only the spell being cast is on the Stack; the trigger waits.
    expect(view().zones.find((z) => z.kind === "stack")!.count).toBe(1);
    expect(
      command(
        0,
        reverse
          ? { type: "reverse-proposal", procedureId: pendingId }
          : { type: "rules-input", procedureId: pendingId, confirm: true },
      ).kind,
    ).toBe("accepted");
    const stack = view().zones.find((z) => z.kind === "stack")!;
    if (reverse) {
      // The mana ability is reversed with the cast (RE §16).
      expect(stack.count).toBe(0);
      expect(match.objects[well.id].zoneId).toBe(
        match.zones.find((z) => z.kind === "battlefield")!.id,
      );
      expect(match.objects[spell.id]).toBeDefined();
      expect(view().rules!.mana[match.players[0].id].C).toBe(0);
    } else {
      expect(stack.count).toBe(2);
      expect(
        view().objects[stack.objectIds!.at(-1)!].characteristics.name,
      ).toBe("Ichor Wellspring: graveyard");
      expect(view().rules!.mana[match.players[0].id].C).toBe(0);
    }
  }
});

test("Tome's fourth page triggers exile above its independent scry, with private resumable inspection", async () => {
  const game = await rulesGame();
  const tome = game.seed("Mazemind Tome", "battlefield");
  force.counters(tome, [{ kind: "page", quantity: "3" }]);
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

test("Tome cannot gain life when its exile fails and does not duplicate a pending state trigger", async () => {
  const game = await rulesGame();
  const tome = game.seed("Mazemind Tome", "battlefield");
  force.counters(tome, [{ kind: "page", quantity: "3" }]);
  const bomb = game.seed("Aether Spellbomb", "battlefield");
  // The scenario bounce filter includes artifacts to remove Tome in response through the command seam.
  const definition = Object.values(game.catalog.definitions).find(
    (c) => c.canonicalName === "Aether Spellbomb",
  )!;
  (definition.abilities[0] as ActivatedAbility).targets = [
    { id: "target-0", filter: { zone: "battlefield", type: ["Artifact"] } },
  ];
  const player = game.match.players[0];
  force.mana(game.match, player.id, { W: 0, U: 3, B: 0, R: 0, G: 0, C: 0 });
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
  // The ability is on the Stack while its target is chosen (CR 602.2a).
  expect(view().zones.find((z) => z.kind === "stack")!.count).toBe(3);
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
    (o) => o.characteristics.name === "Mazemind Tome",
  )!;
  expect(returned.counters).toEqual([]);
  expect(returned.zoneId).toBe(
    view().zones.find((z) => z.kind === "hand" && z.ownerId === player.id)!.id,
  );
});

test("draw ordinals, live Hand size and optional effect payment resume without duplicating draws", async () => {
  const game = await rulesGame();
  game.seed("Thopter Fabricator", "battlefield");
  const crawler = game.seed("Psychosis Crawler", "battlefield");
  game.seed("Scrawling Crawler", "battlefield", 1);
  game.seed("Mind's Eye", "battlefield", 1);
  const archive = game.seed("Hedron Archive", "battlefield");
  force.mana(game.match, game.match.players[0].id, { C: 2 });
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
  force.mana(recovered, game.match.players[1].id, { U: 1 });
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

test("Mind's Eye accepts mana sources during its private effect payment and can decline without spending", async () => {
  for (const pay of [false, true]) {
    const game = await triggerGame();
    game.seed("Mind's Eye", "battlefield", 1);
    const ring = game.seed("Sol Ring", "battlefield", 1);
    const stone = game.seed("Mind Stone", "battlefield");
    force.mana(game.match, game.match.players[0].id, { U: 1 });
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
  force.mana(game.match, game.match.players[0].id, { U: 2 });
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
  force.step(game.match, "end");
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
  await author(card, [
    {
      id: "empty-then-draw",
      kind: "spell",
      effects: [
        { kind: "discard", count: 7 },
        { kind: "draw", count: 1 },
      ],
    },
  ]);
  const hand = game.match.zones.find(
    (z) => z.kind === "hand" && z.ownerId === game.match.players[0].id,
  )!;
  force.zoneContents(game.match, "hand", game.match.players[0].id, [
    ...hand.objectIds.slice(0, 7).map((id) => game.match.objects[id]),
    spell,
  ]);
  force.mana(game.match, game.match.players[0].id, { U: 3 });
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
    force.step(game.match, "end");
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

for (const pay of [false, true])
  test(`ward ${pay ? "payment preserves" : "decline counters"} the targeted spell after its original cost`, async () => {
    const g = await triggerGame();
    const kappa = g.seed("Kappa Cannoneer", "battlefield", 1);
    const spell = g.seed("Aether Spellbomb", "battlefield");
    force.mana(g.match, g.match.players[0].id, { U: 1 });
    force.mana(g.match, g.match.players[0].id, { C: 4 });
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

test("ward outlives its removed source and counters the captured responsible ability", async () => {
  const g = await triggerGame();
  const kappa = g.seed("Kappa Cannoneer", "battlefield", 1);
  const bomb = g.seed("Aether Spellbomb", "battlefield");
  const ownBomb = g.seed("Aether Spellbomb", "battlefield", 1);
  force.mana(g.match, g.match.players[0].id, { U: 1 });
  force.mana(g.match, g.match.players[1].id, { U: 1 });
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
  force.mana(g.match, g.match.players[0].id, { U: 1 });
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

for (const legacySnapshot of [false, true])
  test(`Ward generated during trigger targeting follows the complete original placement batch across ${legacySnapshot ? "legacy" : "current"} recovery`, async () => {
    const g = await triggerGame();
    const target = g.seed("Kappa Cannoneer", "battlefield");
    g.seed("Kappa Cannoneer", "battlefield", 1);
    g.seed("Shimmer Myr", "battlefield", 1);
    const golem = g.seed("Meteor Golem", "hand", 1);
    expect(g.command(0, { type: "pass-priority" }).kind).toBe("accepted");
    force.mana(g.match, g.match.players[1].id, { U: 7 });
    expect(g.command(1, { type: "cast-spell", objectId: golem.id }).kind).toBe(
      "accepted",
    );
    g.pass();
    const pending = g.view(1).rules!.pending!;
    const order = pending.selectionOptions.order.objectIds;
    const destroyId = order.find((id) =>
      pending.selectionOptions.order.labels![id].includes("destroy"),
    )!;
    expect(
      g.answer(
        { order: [destroyId, ...order.filter((id) => id !== destroyId)] },
        1,
      ).kind,
    ).toBe("pending");
    expect(g.view(1).rules).not.toHaveProperty("triggerPlacement");
    expect(g.view(0).rules).not.toHaveProperty("triggerPlacement");
    const recovered: MatchState = JSON.parse(JSON.stringify(g.match));
    if (legacySnapshot) {
      force.rules(recovered, {
        waitingTriggers: recovered.rules!.triggerPlacement,
      });
      delete recovered.rules!.triggerPlacement;
    }
    const command = (
      seat: number,
      action: import("../../../src/shared/model").MatchAction,
    ) =>
      g.service.execute(
        recovered,
        g.room.participants[seat],
        action,
        g.catalog,
      );
    expect(
      command(1, {
        type: "rules-input",
        procedureId: g.view(1).rules!.pending!.id,
        targetIds: [target.id],
      }).kind,
    ).toBe("accepted");
    const view = matchView(recovered, g.room.participants[0].id, g.catalog);
    const stack = view.zones.find((z) => z.kind === "stack")!;
    expect(
      stack.objectIds!.map((id) => view.objects[id].sourceAbilityId),
    ).toEqual(["destroy", "artifact-entry", "ward"]);
    expect(view.rules).not.toHaveProperty("triggerPlacement");
    expect(command(0, { type: "pass-priority" }).kind).toBe("accepted");
    expect(command(1, { type: "pass-priority" }).kind).toBe("pending");
    expect(recovered.objects[target.id].counters).toEqual([]);
    expect(
      command(1, {
        type: "rules-input",
        procedureId: recovered.rules!.pending!.id,
        confirm: false,
      }).kind,
    ).toBe("accepted");
    expect(
      recovered.zones
        .find((z) => z.kind === "stack")!
        .objectIds.map((id) => recovered.objects[id].sourceAbilityId),
    ).toEqual(["artifact-entry"]);
  });
