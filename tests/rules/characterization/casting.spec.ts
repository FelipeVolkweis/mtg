// Characterization tests: casting spells, mana payment and cost locking.
//
// Classification (rules test plan §2):
// | Test | Class | Reason
// | --- | --- | ---
// | lands and simple spells use selected mana sources and retain casting identity after resolution | Preserve |
// | a casting payment window resumes with chosen sources and spends colored mana before colorless | Preserve |
// | mana costs reserve specific colors and use deterministic ties while failed payments preserve resources | Preserve |
// | creature tap symbols require control since the player's turn, while selected-object tap costs do not | Preserve |
// | War Room and Arcane Signet use recorded commander colors after its object leaves Command | Preserve |
// | pending casts expose their private source and legal choices only to their controller | Change | a spell being cast becomes a public Stack object (TP §11–12)
// | {name} produces only the chosen mana through its authored ability (parameterized) | Preserve |
// | restricted mana remains unspent for an ineligible spell and retains its restriction after partial spending | Change | cancels with `cancel-procedure`; recheck in issue 10 against RE §16 (abort only before cost lock)
// | cost payment rejects double tapping and supports tapping then sacrificing the same selected permanent | Preserve |
// | Pull from Tomorrow locks chosen X before mana payment, draws X, and allows a newly drawn discard | Change | cancels with `cancel-procedure`; recheck in issue 10 against RE §16 (abort only before cost lock)
// | stacked artifact discounts and affinity reduce generic cost while preserving blue payment | Preserve |
// | affinity preserves colored requirements, clamps generic mana and excludes opponents' artifacts | Change | cancels with `cancel-procedure`; recheck in issue 10 against RE §16 (abort only before cost lock)
// | Logbook's other-artifact discount stays locked when a mana source is sacrificed during payment | Preserve |
// | Island affinity and chosen X are evaluated before the payment cost is locked | Change | cancels with `cancel-procedure`; recheck in issue 10 against RE §16 (abort only before cost lock)
// | improvise taps explicit artifacts without producing mana and Cannoneer entry grows it | Preserve |
// | Monument produces additional mana immediately once per tapped source and stacks colorless cast life gain | Preserve |
// | improvise composes discounts and rejects tapped or duplicate artifacts atomically | Preserve |
// | commander tax and artifact reducers compose before the locked Command Zone payment | Preserve |

import { expect, test } from "@playwright/test";
import { MatchService } from "../../../src/server/match/match.service";
import { matchView } from "../../../src/server/match/match-view";
import { moveObject } from "../../../src/server/match/game-objects";
import "../../support/round-trip";
import {
  commanderFixture,
  rulesGame,
  triggerGame,
} from "../../support/rules-game";
import { force } from "../../support/force";

test("lands and simple spells use selected mana sources and retain casting identity after resolution", () => {
  const service = new MatchService();
  const { room, catalog } = commanderFixture();
  const match = service.createCommander(room, catalog, room.participants[0].id);
  const command = (
    seat: number,
    action: import("../../../src/shared/model").MatchAction,
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
  force.move(match, commanderObject, "hand", match.players[0].id);
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

test("a casting payment window resumes with chosen sources and spends colored mana before colorless", async () => {
  const game = await rulesGame();
  const { match, command, seed, catalog, room } = game;
  const ring = seed("Sol Ring", "battlefield"),
    spell = seed("Hedron Archive", "hand");
  const playerId = match.players[0].id;
  force.mana(match, playerId, { W: 1, U: 2, B: 0, R: 0, G: 0, C: 0 });
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

test("mana costs reserve specific colors and use deterministic ties while failed payments preserve resources", async () => {
  const { match, command, seed } = await rulesGame();
  const negate = seed("Negate", "hand"),
    target = seed("Sol Ring", "hand", 1);
  // The initial scenario includes a spell already announced by the other player.
  force.move(match, target, "stack");
  const pool = { W: 2, U: 1, B: 2, R: 0, G: 0, C: 9 };
  force.mana(match, match.players[0].id, pool);
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
  force.mana(match, match.players[0].id, {
    W: 0,
    U: 0,
    B: 0,
    R: 0,
    G: 0,
    C: 0,
  });
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
  force.controlledSince(match, myr, match.turn.number);
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
  force.mana(match, playerId, { C: 3 });
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

test("restricted mana remains unspent for an ineligible spell and retains its restriction after partial spending", async () => {
  const { match, command, seed } = await rulesGame();
  const source = seed("Sol Ring", "battlefield"),
    creature = seed("Silver Myr", "hand"),
    artifact = seed("Sol Ring", "hand");
  const pool = match.rules!.mana[match.players[0].id];
  pool.C = 2;
  force.rules(match, {
    restrictedMana: {
      [match.players[0].id]: [
        {
          type: "C",
          amount: 2,
          restriction: { use: "cast", spellTypes: ["Enchantment"] },
        },
      ],
    },
  });
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

test("Pull from Tomorrow locks chosen X before mana payment, draws X, and allows a newly drawn discard", async () => {
  const { match, command, seed, catalog, room } = await rulesGame();
  const player = match.players[0].id;
  const spell = seed("Pull from Tomorrow", "hand");
  force.mana(match, player, { U: 4 });
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

test("improvise taps explicit artifacts without producing mana and Cannoneer entry grows it", async () => {
  const g = await triggerGame();
  const kappa = g.seed("Kappa Cannoneer", "hand");
  const artifacts = Array.from({ length: 5 }, () =>
    g.seed("Mind Stone", "battlefield"),
  );
  const p = g.match.players[0].id;
  force.mana(g.match, p, { U: 1 });
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

test("improvise composes discounts and rejects tapped or duplicate artifacts atomically", async () => {
  const g = await triggerGame();
  const kappa = g.seed("Kappa Cannoneer", "hand");
  const reducer = g.seed("Etherium Sculptor", "battlefield");
  const ring = g.seed("Sol Ring", "battlefield");
  const tapped = g.seed("Mind Stone", "battlefield");
  tapped.status.tapped = true;
  const myr = g.seed("Silver Myr", "battlefield");
  const stone = g.seed("Mind Stone", "battlefield");
  force.mana(g.match, g.match.players[0].id, { U: 1 });
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

test("commander tax and artifact reducers compose before the locked Command Zone payment", async () => {
  const g = await triggerGame();
  const graaz = g.seed("Graaz, Unstoppable Juggernaut", "hand");
  const instance = graaz.cardInstanceIds[0];
  force.commander(g.match, instance);
  const commandZone = g.match.zones.find((z) => z.kind === "command")!;
  const commander = moveObject(g.match, graaz.id, commandZone);
  force.rules(g.match, { commanderCasts: { [instance]: 1 } });
  g.seed("Foundry Inspector", "battlefield");
  g.seed("Etherium Sculptor", "battlefield");
  expect(
    g.command(0, { type: "cast-spell", objectId: commander.id }).kind,
  ).toBe("pending");
  expect(g.view().rules!.pending!.totalCost.generic).toBe(8);
});
