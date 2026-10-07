// Characterization tests: commander rules, monarch and Solo Practice.
//
// Classification (rules test plan §2):
// | Test | Class | Reason
// | --- | --- | ---
// | Commander casts retain designation, tax is locked, and graveyard return resumes privately | Preserve |
// | Favor attaches before its entry trigger, taps the creature and crowns the monarch | Preserve |
// | solo Commander practice has an inert opponent, automatic passes and private delegated choices | Preserve |
// | commander Hand replacement … (parameterized) | Preserve |
// | combat … (parameterized) | Preserve |
// | the monarch end-step draw is stacked and privately increases only that player's Hand | Preserve |
// | Favor untap restriction evaluates the creature controller as monarch {monarch} (parameterized) | Preserve |
// | a commander destroyed in the second player's Graveyard offers that owner's return choice | Preserve |
// | the monarch controls its transfer trigger above the attacker's Research Thief draw | Preserve |
// | solo controller answers the practice opponent's required sacrifice while spectators have no choice access | Preserve |
// | Favor goes to its owner's Graveyard when its enchanted creature leaves while monarchy persists | Preserve |
// | cleanup offers a discarded commander return before untap and … (parameterized) | Preserve |

import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { MatchService } from "../../../src/server/match/match.service";
import { matchView } from "../../../src/server/match/match-view";
import { moveObject } from "../../../src/server/match/game-objects";
import type { MatchState } from "../../../src/shared/model";
import "../../support/round-trip";
import { commanderFixture, triggerGame } from "../../support/rules-game";
import { force } from "../../support/force";

test("Commander casts retain designation, tax is locked, and graveyard return resumes privately", async () => {
  const g = await triggerGame();
  const p = g.match.players[0].id;
  const commander = Object.values(g.view().objects).find((o) =>
    o.cardInstanceIds?.includes(g.match.rules!.commanders[p].instanceId),
  )!;
  force.mana(g.match, p, { U: 5 });
  expect(
    g.command(0, { type: "cast-spell", objectId: commander.id }).kind,
  ).toBe("accepted");
  g.pass();
  const creature = Object.values(g.view().objects).find((o) =>
    o.cardInstanceIds?.includes(g.match.rules!.commanders[p].instanceId),
  )!;
  const disk = g.seed("Nevinyrral's Disk", "battlefield");
  force.mana(g.match, p, { C: 1 });
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
  force.mana(g.match, p, { U: 0 });
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
  force.mana(g.match, g.match.players[0].id, { U: 3 });
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
  const act = (action: import("../../../src/shared/model").MatchAction) =>
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

for (const returnToCommand of [true, false])
  test(`commander Hand replacement ${returnToCommand ? "redirects" : "permits bounce"} and resumes after serialized recovery`, async () => {
    const g = await triggerGame();
    const p = g.match.players[0].id;
    const commander = Object.values(g.view().objects).find((o) =>
      o.cardInstanceIds?.includes(g.match.rules!.commanders[p].instanceId),
    )!;
    force.mana(g.match, p, { U: 1 });
    expect(
      g.command(0, { type: "cast-spell", objectId: commander.id }).kind,
    ).toBe("accepted");
    g.pass();
    const creature = Object.values(g.view().objects).find((o) =>
      o.cardInstanceIds?.includes(g.match.rules!.commanders[p].instanceId),
    )!;
    const bomb = g.seed("Aether Spellbomb", "battlefield");
    force.mana(g.match, p, { U: 1 });
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

for (const commander of [false, true])
  test(`combat ${commander ? "commander damage causes loss at 21" : "transfers monarch through a Stack trigger"}`, async () => {
    const g = await triggerGame();
    const attacker = g.seed("Silver Myr", "battlefield");
    const p = g.match.players[0].id,
      opponent = g.match.players[1].id;
    if (commander) {
      force.commander(g.match, attacker.cardInstanceIds[0]);
      force.rules(g.match, {
        commanderDamage: {
          [opponent]: { [attacker.cardInstanceIds[0]]: 20 },
        },
      });
    } else force.rules(g.match, { monarchId: opponent });
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
  force.rules(g.match, { monarchId: g.match.players[0].id });
  force.step(g.match, "postcombat-main");
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
    force.attach(g.seed("Fall from Favor", "battlefield"), creature);
    force.rules(g.match, { monarchId: g.match.players[monarch].id });
    force.step(g.match, "cleanup");
    g.pass();
    expect(g.view().objects[creature.id].status.tapped).toBe(monarch !== 1);
  });

test("a commander destroyed in the second player's Graveyard offers that owner's return choice", async () => {
  const g = await triggerGame();
  const p = g.match.players[1].id;
  force.activePlayer(g.match, p);
  force.priority(g.match, p);
  const commander = Object.values(g.view(1).objects).find((o) =>
    o.cardInstanceIds?.includes(g.match.rules!.commanders[p].instanceId),
  )!;
  force.mana(g.match, p, { U: 1 });
  expect(
    g.command(1, { type: "cast-spell", objectId: commander.id }).kind,
  ).toBe("accepted");
  g.pass();
  const disk = g.seed("Nevinyrral's Disk", "battlefield", 1);
  force.mana(g.match, p, { C: 1 });
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

test("the monarch controls its transfer trigger above the attacker's Research Thief draw", async () => {
  const g = await triggerGame();
  g.seed("Research Thief", "battlefield");
  const attacker = g.seed("Silver Myr", "battlefield");
  const p = g.match.players[0].id,
    opponent = g.match.players[1].id;
  force.rules(g.match, { monarchId: opponent });
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
  force.rules(g.match, {
    practice: {
      playerId: practiceId,
      controllerParticipantId: g.room.participants[0].id,
    },
  });
  g.match.players[1].participantId = randomUUID();
  const padeem = g.seed("Padeem, Consul of Innovation", "battlefield", 1);
  const dust = g.seed("All Is Dust", "hand");
  force.mana(g.match, g.match.players[0].id, { C: 7 });
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

test("Favor goes to its owner's Graveyard when its enchanted creature leaves while monarchy persists", async () => {
  const g = await triggerGame();
  const creature = g.seed("Silver Myr", "battlefield", 1);
  const favor = g.seed("Fall from Favor", "battlefield");
  force.attach(favor, creature);
  const p = g.match.players[0].id;
  force.rules(g.match, { monarchId: p });
  const bomb = g.seed("Aether Spellbomb", "battlefield");
  force.mana(g.match, p, { U: 1 });
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

for (const returnToCommand of [true, false])
  test(`cleanup offers a discarded commander return before untap and ${returnToCommand ? "repeats cleanup after priority" : "continues without priority when declined"}`, async () => {
    const g = await triggerGame();
    const p = g.match.players[0].id;
    const commander = Object.values(g.match.objects).find((o) =>
      o.cardInstanceIds.includes(g.match.rules!.commanders[p].instanceId),
    )!;
    moveObject(
      g.match,
      commander.id,
      g.match.zones.find((z) => z.kind === "hand" && z.ownerId === p)!,
    );
    const discarded = Object.values(g.match.objects).find((o) =>
      o.cardInstanceIds.includes(g.match.rules!.commanders[p].instanceId),
    )!;
    const stone = g.seed("Mind Stone", "battlefield", 1);
    stone.status.tapped = true;
    force.step(g.match, "end");
    g.pass();
    expect(g.view().rules!.pending!.kind).toBe("cleanup");
    expect(g.answer({ discard: [discarded.id] }).kind).toBe("pending");
    expect(g.view().rules!.pending!.kind).toBe("commander-return");
    expect(g.match.turn.number).toBe(1);
    expect(g.match.turn.stepIndex).toBe(11);
    expect(g.view().objects[stone.id].status.tapped).toBe(true);
    const recovered: MatchState = JSON.parse(JSON.stringify(g.match));
    expect(
      g.service.execute(
        recovered,
        g.room.participants[0],
        {
          type: "rules-input",
          procedureId: g.view().rules!.pending!.id,
          confirm: returnToCommand,
        },
        g.catalog,
      ).kind,
    ).toBe("accepted");
    const returned = Object.values(recovered.objects).find((o) =>
      o.cardInstanceIds.includes(g.match.rules!.commanders[p].instanceId),
    )!;
    expect(returned.zoneId).toBe(
      recovered.zones.find(
        (z) =>
          z.kind === (returnToCommand ? "command" : "graveyard") &&
          (returnToCommand || z.ownerId === p),
      )!.id,
    );
    if (returnToCommand) {
      expect(recovered.turn.number).toBe(1);
      expect(recovered.priority!.playerId).toBe(p);
      for (const participant of g.room.participants)
        expect(
          g.service.execute(
            recovered,
            participant,
            { type: "pass-priority" },
            g.catalog,
          ).kind,
        ).toBe("accepted");
    }
    expect(recovered.turn.number).toBe(2);
    expect(recovered.objects[stone.id].status.tapped).toBe(false);
  });
