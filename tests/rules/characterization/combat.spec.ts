// Characterization tests: combat declarations, damage and combat triggers.
//
// Classification (rules test plan §2):
// | Test | Class | Reason
// | --- | --- | ---
// | combat declarations enforce controllers, flying, timing and public participation | Preserve |
// | combat damage assignments apply simultaneously, keep damage distinct and determine losses | Preserve |
// | an unblocked attacker deals damage before a zero-life loss completes the Match | Preserve |
// | an attacker stays blocked after its blocker leaves during the response window | Preserve |
// | damage attribution expires at the next turn while surviving the current turn | Preserve |
// | Battlesphere creates Myr and binds an optional attack payment across recovery | Preserve |
// | individual and grouped artifact combat triggers differ and Hellkite uses chosen X once per turn | Preserve |
// | Battlesphere can tap {count} Myr and its bound bonus expires during cleanup (parameterized) | Preserve |
// | Signpost redirects an existing attack before Battlesphere reads its defender and rejects the attacker's permanents | Preserve |
// | Skysovereign's entry and attack damage use opponent targets and stay separate from combat damage | Preserve |
// | Hellkite's fresh object lifetime has no prior combat recipients | Preserve |
// | Hellkite's power bonus expires and once-per-turn use clears on the next turn | Preserve |
// | Battlesphere retains its selected bonus when the attacked planeswalker leaves before its trigger resolves | Preserve |
// | Signpost outside declare attackers has no redirection trigger and retains its blue mana ability | Preserve |
// | Battlesphere damages its last {defenderKind} after leaving combat across recovery (parameterized) | Preserve |

import { expect, test } from "@playwright/test";
import { matchView } from "../../../src/server/match/match-view";
import type { MatchState } from "../../../src/shared/model";
import "../../support/round-trip";
import { rulesGame, triggerGame } from "../../support/rules-game";
import { force } from "../../support/force";

test("combat declarations enforce controllers, flying, timing and public participation", async () => {
  const game = await rulesGame();
  const ground = game.seed("Silver Myr", "battlefield");
  const flyer = game.seed("Spire Golem", "battlefield");
  const blocker = game.seed("Silver Myr", "battlefield", 1);
  const newCreature = game.seed("Silver Myr", "battlefield");
  force.controlledSince(game.match, newCreature, game.match.turn.number);
  const view = (seat = 0) =>
    matchView(game.match, game.room.participants[seat].id, game.catalog);
  for (let i = 0; i < 2; i++) {
    game.command(0, { type: "pass-priority" });
    game.command(1, { type: "pass-priority" });
  }
  const attack = view().rules!.prompt!;
  expect(attack.promptKind).toBe("declare-attackers");
  expect(attack.options[newCreature.id]).toBeUndefined();
  expect(
    game.command(1, {
      type: "rules-input",
      procedureId: attack.procedureId,
      selections: {},
    }).kind,
  ).toBe("rejected");
  expect(
    game.command(0, {
      type: "rules-input",
      procedureId: attack.procedureId,
      selections: { [newCreature.id]: [game.match.players[1].id] },
    }).kind,
  ).toBe("rejected");
  expect(
    game.command(0, {
      type: "rules-input",
      procedureId: attack.procedureId,
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
  const block = view(1).rules!.prompt!;
  expect(block.promptKind).toBe("declare-blockers");
  expect(block.options[blocker.id].objectIds).toEqual([ground.id]);
  expect(
    game.command(1, {
      type: "rules-input",
      procedureId: block.procedureId,
      selections: { [blocker.id]: [flyer.id] },
    }).kind,
  ).toBe("rejected");
  expect(
    game.command(1, {
      type: "rules-input",
      procedureId: block.procedureId,
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
    procedureId: view().rules!.prompt!.procedureId,
    selections: { [attacker.id]: [game.match.players[1].id] },
  });
  pass();
  game.command(1, {
    type: "rules-input",
    procedureId: view(1).rules!.prompt!.procedureId,
    selections: { [a.id]: [attacker.id], [b.id]: [attacker.id] },
  });
  pass();
  const pending = view().rules!.prompt!;
  expect(pending.promptKind).toBe("combat-damage");
  const bad = {
    type: "rules-input" as const,
    procedureId: pending.procedureId,
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
    procedureId: view().rules!.prompt!.procedureId,
    selections: { [creature.id]: [game.match.players[1].id] },
  });
  pass();
  game.command(1, {
    type: "rules-input",
    procedureId: view(1).rules!.prompt!.procedureId,
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
    procedureId: view().rules!.prompt!.procedureId,
    selections: { [creature.id]: [game.match.players[1].id] },
  });
  pass();
  game.command(1, {
    type: "rules-input",
    procedureId: view(1).rules!.prompt!.procedureId,
    selections: { [blocker.id]: [creature.id] },
  });
  force.mana(game.match, game.match.players[0].id, { U: 1 });
  game.command(0, {
    type: "activate-ability",
    objectId: bomb.id,
    abilityId: "bounce",
  });
  game.command(0, {
    type: "rules-input",
    procedureId: view().rules!.prompt!.procedureId,
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
    procedureId: view().rules!.prompt!.procedureId,
    selections: { [creature.id]: [game.match.players[1].id] },
  });
  pass();
  game.command(1, {
    type: "rules-input",
    procedureId: view(1).rules!.prompt!.procedureId,
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
  force.mana(game.match, game.match.players[0].id, { C: 7 });
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
  force.controlledSince(game.match, attacker, 0);
  pass();
  pass();
  const declare = view().rules!.prompt!;
  game.command(0, {
    type: "rules-input",
    procedureId: declare.procedureId,
    selections: { [attacker.id]: [game.match.players[1].id] },
  });
  pass();
  const choice = view().rules!.prompt!;
  expect(choice.promptKind).toBe("resolution-choice");
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
        procedureId: choice.procedureId,
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
    procedureId: view().rules!.prompt!.procedureId,
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
  const order = view().rules!.prompt!;
  expect(order.promptKind).toBe("order-triggers");
  expect(order.options.order.objectIds).toHaveLength(3);
  const handBefore = view().zones.find(
    (z) => z.kind === "hand" && z.ownerId === game.match.players[0].id,
  )!.count;
  game.command(0, {
    type: "rules-input",
    procedureId: order.procedureId,
    selections: { order: order.options.order.objectIds },
  });
  pass();
  pass();
  pass();
  expect(
    view().zones.find(
      (z) => z.kind === "hand" && z.ownerId === game.match.players[0].id,
    )!.count,
  ).toBe(handBefore + 3);
  force.mana(game.match, game.match.players[0].id, { U: 2 });
  expect(
    game.command(0, {
      type: "activate-ability",
      objectId: hellkite.id,
      abilityId: "destroy-damaged",
    }).kind,
  ).toBe("pending");
  game.command(0, {
    type: "rules-input",
    procedureId: view().rules!.prompt!.procedureId,
    variables: { X: 2 },
  });
  game.command(0, {
    type: "rules-input",
    procedureId: view().rules!.prompt!.procedureId,
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
    expect(game.view().rules!.prompt!.options.select.objectIds).not.toContain(
      tapped.id,
    );
    expect(
      game.answer({ select: myr.slice(0, count).map((o) => o.id) }).kind,
    ).toBe("accepted");
    expect(game.view().objects[sphere.id].characteristics.power).toBe(
      String(4 + count),
    );
    expect(game.view().players[1].life).toBe(String(40 - count));
    force.step(game.match, "end");
    game.pass();
    expect(game.view().objects[sphere.id].characteristics.power).toBe("4");
  });
}

test("Signpost redirects an existing attack before Battlesphere reads its defender and rejects the attacker's permanents", async () => {
  const game = await triggerGame();
  const sphere = game.seed("Myr Battlesphere", "battlefield");
  const myr = game.seed("Silver Myr", "battlefield");
  const walker = game.seed("Mind Stone", "battlefield", 1);
  walker.characteristics.types = ["Planeswalker"];
  force.counters(walker, [{ kind: "loyalty", quantity: "8" }]);
  const ownWalker = game.seed("Mind Stone", "battlefield");
  ownWalker.characteristics.types = ["Planeswalker"];
  force.counters(ownWalker, [{ kind: "loyalty", quantity: "8" }]);
  const sign = game.seed("Misleading Signpost", "hand", 1);
  game.pass();
  game.pass();
  game.answer({ [sphere.id]: [game.match.players[1].id] });
  force.mana(game.match, game.match.players[1].id, { U: 3 });
  game.command(0, { type: "pass-priority" });
  expect(game.command(1, { type: "cast-spell", objectId: sign.id }).kind).toBe(
    "accepted",
  );
  game.pass();
  const target = game.view(1).rules!.prompt!;
  expect(target.promptKind).toBe("trigger-targets");
  game.command(1, {
    type: "rules-input",
    procedureId: target.procedureId,
    targetIds: [sphere.id],
  });
  game.pass();
  const choice = game.view(1).rules!.prompt!;
  expect(choice.options.select.objectIds).not.toContain(ownWalker.id);
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
  force.mana(game.match, game.match.players[0].id, { C: 5 });
  game.command(0, { type: "cast-spell", objectId: sky.id });
  game.pass();
  let pending = game.view().rules!.prompt!;
  expect(pending.targets[0].legalIds).toContain(victim.id);
  expect(pending.targets[0].legalIds).not.toContain(pilot.id);
  game.command(0, {
    type: "rules-input",
    procedureId: pending.procedureId,
    targetIds: [victim.id],
  });
  game.pass();
  expect(game.view().rules!.markedDamage![victim.id]).toBe(3);
  const vehicle = Object.values(game.view().objects).find(
    (o) => o.characteristics.name === "Skysovereign, Consul Flagship",
  )!;
  force.controlledSince(game.match, vehicle, 0);
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
  pending = game.view().rules!.prompt!;
  game.command(0, {
    type: "rules-input",
    procedureId: pending.procedureId,
    targetIds: [victim.id],
  });
  game.pass();
  expect(game.view().objects[victim.id]).toBeUndefined();
  expect(game.view().players[1].life).toBe("40");
  expect(game.view().rules!.damageEvents!.every((e) => !e.combat)).toBe(true);
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
  let order = game.view().rules!.prompt!;
  expect(order.options.order.objectIds).toHaveLength(3);
  game.answer({ order: order.options.order.objectIds });
  for (let i = 0; i < 3; i++) game.pass();
  force.mana(game.match, game.match.players[0].id, { U: 3 });
  game.command(0, {
    type: "activate-ability",
    objectId: hellkite.id,
    abilityId: "destroy-damaged",
  });
  game.command(0, {
    type: "rules-input",
    procedureId: game.view().rules!.prompt!.procedureId,
    variables: { X: 2 },
  });
  game.command(0, {
    type: "rules-input",
    procedureId: game.view().rules!.prompt!.procedureId,
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
    .rules!.prompt!.options.select.objectIds.find(
      (id) => game.view().objects[id].characteristics.name === "Steel Hellkite",
    )!;
  game.answer({ select: [returned] });
  const fresh = Object.values(game.view().objects).find(
    (o) => o.characteristics.name === "Steel Hellkite",
  )!;
  expect(fresh.id).not.toBe(hellkite.id);
  force.mana(game.match, game.match.players[0].id, { U: 2 });
  expect(
    game.command(0, {
      type: "activate-ability",
      objectId: fresh.id,
      abilityId: "destroy-damaged",
    }).kind,
  ).toBe("pending");
  game.command(0, {
    type: "rules-input",
    procedureId: game.view().rules!.prompt!.procedureId,
    variables: { X: 1 },
  });
  game.command(0, {
    type: "rules-input",
    procedureId: game.view().rules!.prompt!.procedureId,
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
    procedureId: game.view().rules!.prompt!.procedureId,
    variables: { X: 0 },
  });
  game.command(0, {
    type: "rules-input",
    procedureId: game.view().rules!.prompt!.procedureId,
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
  force.step(game.match, "end");
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
  force.counters(walker, [{ kind: "loyalty", quantity: "8" }]);
  game.seed("Shimmer Myr", "battlefield");
  const golem = game.seed("Meteor Golem", "hand");
  game.pass();
  game.pass();
  game.answer({ [sphere.id]: [walker.id] });
  force.mana(game.match, game.match.players[0].id, { U: 7 });
  game.command(0, { type: "cast-spell", objectId: golem.id });
  game.pass();
  game.command(0, {
    type: "rules-input",
    procedureId: game.view().rules!.prompt!.procedureId,
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
  force.mana(game.match, game.match.players[0].id, { U: 3 });
  game.command(0, { type: "cast-spell", objectId: sign.id });
  game.pass();
  expect(game.view().rules!.prompt).toBeUndefined();
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

for (const defenderKind of [
  "player",
  "planeswalker",
  "redirected-planeswalker",
] as const)
  test(`Battlesphere damages its last ${defenderKind} after leaving combat across recovery`, async () => {
    const g = await triggerGame();
    const sphere = g.seed("Myr Battlesphere", "battlefield");
    const myr = g.seed("Silver Myr", "battlefield");
    const bomb = g.seed("Aether Spellbomb", "battlefield", 1);
    const walker =
      defenderKind !== "player"
        ? g.seed("Mind Stone", "battlefield", 1)
        : undefined;
    if (walker) {
      walker.characteristics.types = ["Planeswalker"];
      force.counters(walker, [{ kind: "loyalty", quantity: "8" }]);
    }
    g.pass();
    g.pass();
    expect(
      g.answer({
        [sphere.id]: [
          defenderKind === "planeswalker" ? walker!.id : g.match.players[1].id,
        ],
      }).kind,
    ).toBe("accepted");
    if (defenderKind === "redirected-planeswalker") {
      const signpost = g.seed("Misleading Signpost", "hand", 1);
      expect(g.command(0, { type: "pass-priority" }).kind).toBe("accepted");
      force.mana(g.match, g.match.players[1].id, { U: 3 });
      expect(
        g.command(1, { type: "cast-spell", objectId: signpost.id }).kind,
      ).toBe("accepted");
      g.pass();
      expect(
        g.command(1, {
          type: "rules-input",
          procedureId: g.view(1).rules!.prompt!.procedureId,
          targetIds: [sphere.id],
        }).kind,
      ).toBe("accepted");
      g.pass();
      expect(g.answer({ select: [walker!.id] }, 1).kind).toBe("accepted");
    }
    expect(g.command(0, { type: "pass-priority" }).kind).toBe("accepted");
    force.mana(g.match, g.match.players[1].id, { U: 1 });
    expect(
      g.command(1, {
        type: "activate-ability",
        objectId: bomb.id,
        abilityId: "bounce",
      }).kind,
    ).toBe("pending");
    expect(
      g.command(1, {
        type: "rules-input",
        procedureId: g.view(1).rules!.prompt!.procedureId,
        targetIds: [sphere.id],
      }).kind,
    ).toBe("accepted");
    g.pass();
    expect(g.view().objects[sphere.id]).toBeUndefined();
    g.pass();
    const recovered: MatchState = JSON.parse(JSON.stringify(g.match));
    expect(
      g.service.execute(
        recovered,
        g.room.participants[0],
        {
          type: "rules-input",
          procedureId: g.view().rules!.prompt!.procedureId,
          selections: { select: [myr.id] },
        },
        g.catalog,
      ).kind,
    ).toBe("accepted");
    const view = matchView(recovered, g.room.participants[0].id, g.catalog);
    expect(view.objects[myr.id].status.tapped).toBe(true);
    expect(view.players[1].life).toBe(walker ? "40" : "39");
    if (walker)
      expect(view.objects[walker.id].counters).toContainEqual({
        kind: "loyalty",
        quantity: "7",
      });
    expect(view.rules!.damageEvents).toContainEqual(
      expect.objectContaining({
        sourceId: sphere.id,
        recipientId: walker?.id ?? g.match.players[1].id,
        amount: 1,
        combat: false,
      }),
    );
  });
