// Stack Proposal Procedure tests (rules test plan §14, §21): CR 601/602
// transitions, invalid and stale answers, save and restore, and rollback.

import { expect, test } from "@playwright/test";
import { MatchService } from "../../../src/server/match/match.service";
import type { MatchAction, MatchState } from "../../../src/shared/rules-state";
import "../../support/round-trip";
import { rulesGame } from "../../support/rules-game";
import { force } from "../../support/force";
import { logical } from "../../support/logical";

const stack = (match: MatchState) =>
  match.zones.find((z) => z.kind === "stack")!.objectIds;
/** The Match as it was, apart from the revision every accepted command moves. */
const unchanged = (match: MatchState, before: MatchState) =>
  expect(match).toEqual({ ...before, revision: match.revision });

test("casting moves the card to the Stack first and records where it came from", async () => {
  const g = await rulesGame();
  const archive = g.seed("Hedron Archive", "hand");
  expect(g.command(0, { type: "cast-spell", objectId: archive.id }).kind).toBe(
    "pending",
  );
  const pending = g.match.rules.pending!;
  expect(g.match.objects[archive.id]).toBeUndefined();
  expect(stack(g.match)).toEqual([pending.proposal!.stackObjectId]);
  const spell = g.match.objects[pending.proposal!.stackObjectId];
  expect(spell.cardInstanceIds).toEqual(archive.cardInstanceIds);
  expect(spell.proposal).toEqual({
    sourceZone: "hand",
    variables: {},
    modes: [],
    optionalCosts: [],
    manaSpent: [],
  });
  // Nothing is cast until payment: no resolution, no cast trigger yet.
  expect(spell.resolution).toBeUndefined();
  expect(pending.proposal!.locked).toBe(true);
});

test("activating creates the Ability Game Object on the Stack before its target is chosen", async () => {
  const g = await rulesGame();
  const bomb = g.seed("Aether Spellbomb", "battlefield");
  const myr = g.seed("Silver Myr", "battlefield", 1);
  force.mana(g.match, g.match.players[0].id, { U: 1 });
  expect(
    g.command(0, {
      type: "activate-ability",
      objectId: bomb.id,
      abilityId: "bounce",
    }).kind,
  ).toBe("pending");
  const pending = g.match.rules.pending!;
  expect(pending.stage).toBe("targets");
  expect(pending.proposal!.locked).toBe(false);
  const ability = g.match.objects[pending.proposal!.stackObjectId];
  expect(stack(g.match)).toEqual([ability.id]);
  expect(ability.kind).toBe("ability");
  expect(ability.sourceObjectId).toBe(bomb.id);
  expect(ability.sourceAbilityId).toBe("bounce");
  // The source is untouched until costs are paid.
  expect(g.match.objects[bomb.id]).toBeDefined();
  expect(
    g.command(0, {
      type: "rules-input",
      procedureId: pending.id,
      targetIds: [myr.id],
    }).kind,
  ).toBe("accepted");
  expect(g.match.objects[ability.id].resolution?.targetIds).toEqual([myr.id]);
  expect(g.match.objects[bomb.id]).toBeUndefined();
});

test("X, then payment: invalid and stale answers change nothing", async () => {
  const g = await rulesGame();
  const pull = g.seed("Pull from Tomorrow", "hand");
  force.mana(g.match, g.match.players[0].id, { U: 4 });
  g.command(0, { type: "cast-spell", objectId: pull.id });
  const announce = g.match.rules.pending!;
  expect(announce.stage).toBe("variable");
  let before = structuredClone(g.match);
  for (const variables of [{ X: -1 }, { Y: 2 }, {}])
    expect(
      g.command(0, {
        type: "rules-input",
        procedureId: announce.id,
        variables: variables as Record<string, number>,
      }).kind,
    ).toBe("rejected");
  expect(g.match).toEqual(before);
  expect(
    g.command(0, {
      type: "rules-input",
      procedureId: announce.id,
      variables: { X: 2 },
    }).kind,
  ).toBe("pending");
  const payment = g.match.rules.pending!;
  expect(payment.id).not.toBe(announce.id);
  expect(payment.stage).toBe("payment");
  expect(payment.totalCost).toMatchObject({ generic: 2, U: 2 });
  expect(
    g.match.objects[payment.proposal!.stackObjectId].proposal!.variables,
  ).toEqual({ X: 2 });
  before = structuredClone(g.match);
  expect(
    g.command(0, {
      type: "rules-input",
      procedureId: announce.id,
      confirm: true,
    }).kind,
  ).toBe("rejected");
  expect(g.match).toEqual(before);
  expect(
    g.command(0, {
      type: "rules-input",
      procedureId: payment.id,
      confirm: true,
    }).kind,
  ).toBe("accepted");
  expect(
    g.match.objects[payment.proposal!.stackObjectId].proposal,
  ).toMatchObject({ variables: { X: 2 }, manaSpent: ["U", "U", "U", "U"] });
});

for (const stage of ["variable", "targets", "payment"] as const)
  test(`a proposal saved and restored at its ${stage} stage continues the same way`, async () => {
    const g = await rulesGame();
    const steps: MatchAction[] = [];
    if (stage === "variable" || stage === "payment") {
      const pull = g.seed("Pull from Tomorrow", "hand");
      force.mana(g.match, g.match.players[0].id, { U: 3 });
      g.command(0, { type: "cast-spell", objectId: pull.id });
      if (stage === "payment")
        g.command(0, {
          type: "rules-input",
          procedureId: g.match.rules.pending!.id,
          variables: { X: 1 },
        });
    } else {
      const bomb = g.seed("Aether Spellbomb", "battlefield");
      g.seed("Silver Myr", "battlefield", 1);
      force.mana(g.match, g.match.players[0].id, { U: 1 });
      g.command(0, {
        type: "activate-ability",
        objectId: bomb.id,
        abilityId: "bounce",
      });
    }
    const pending = g.match.rules.pending!;
    expect(pending.stage).toBe(stage);
    const target = Object.values(g.match.objects).find(
      (o) => o.characteristics.name === "Silver Myr",
    );
    steps.push({
      type: "rules-input",
      procedureId: pending.id,
      ...(stage === "variable"
        ? { variables: { X: 1 } }
        : stage === "targets"
          ? { targetIds: [target!.id] }
          : { confirm: true }),
    });
    const restored = JSON.parse(JSON.stringify(g.match)) as MatchState;
    const service = new MatchService();
    for (const match of [g.match, restored])
      for (const step of steps)
        service.execute(match, g.room.participants[0], step, g.catalog);
    expect(logical(restored)).toEqual(logical(g.match));
  });

test.describe("rollback", () => {
  test("cancelling before the cost is locked restores the Match exactly", async () => {
    const g = await rulesGame();
    const bomb = g.seed("Aether Spellbomb", "battlefield");
    g.seed("Silver Myr", "battlefield", 1);
    force.mana(g.match, g.match.players[0].id, { U: 1 });
    const before = structuredClone(g.match);
    g.command(0, {
      type: "activate-ability",
      objectId: bomb.id,
      abilityId: "bounce",
    });
    const pending = g.match.rules.pending!;
    expect(
      g.command(0, { type: "reverse-proposal", procedureId: pending.id }).kind,
    ).toBe("rejected");
    expect(
      g.command(0, { type: "cancel-procedure", procedureId: pending.id }).kind,
    ).toBe("accepted");
    unchanged(g.match, before);
    expect(
      g.command(0, {
        type: "rules-input",
        procedureId: pending.id,
        targetIds: [],
      }).kind,
    ).toBe("rejected");
  });

  test("after the cost is locked, abort is refused and reversing also undoes mana abilities", async () => {
    const g = await rulesGame();
    const ring = g.seed("Sol Ring", "battlefield");
    const archive = g.seed("Hedron Archive", "hand");
    force.mana(g.match, g.match.players[0].id, { U: 1 });
    const before = structuredClone(g.match);
    g.command(0, { type: "cast-spell", objectId: archive.id });
    const pending = g.match.rules.pending!;
    expect(
      g.command(0, {
        type: "activate-ability",
        objectId: ring.id,
        abilityId: "mana",
      }).kind,
    ).toBe("pending");
    expect(g.match.objects[ring.id].status.tapped).toBe(true);
    const locked = structuredClone(g.match);
    expect(
      g.command(0, { type: "cancel-procedure", procedureId: pending.id }).kind,
    ).toBe("rejected");
    expect(g.match).toEqual(locked);
    expect(
      g.command(0, { type: "reverse-proposal", procedureId: pending.id }).kind,
    ).toBe("accepted");
    // Stack object gone, card back in Hand with its identity, Sol Ring
    // untapped, mana pool as before: the authoritative Match is unchanged.
    unchanged(g.match, before);
    expect(g.match.priority?.playerId).toBe(g.match.players[0].id);
  });

  test("an opponent can neither answer nor roll back another player's proposal", async () => {
    const g = await rulesGame();
    const archive = g.seed("Hedron Archive", "hand");
    g.command(0, { type: "cast-spell", objectId: archive.id });
    const pending = g.match.rules.pending!;
    const before = structuredClone(g.match);
    for (const action of [
      { type: "reverse-proposal", procedureId: pending.id },
      { type: "cancel-procedure", procedureId: pending.id },
      { type: "rules-input", procedureId: pending.id, confirm: true },
    ] as MatchAction[])
      expect(g.command(1, action).kind).toBe("rejected");
    expect(g.match).toEqual(before);
  });
});

test("a spell can't target itself (CR 115.5)", async () => {
  const g = await rulesGame();
  const counter = g.seed("Counterspell", "hand");
  force.mana(g.match, g.match.players[0].id, { U: 2 });
  // Only the Counterspell itself would be on the Stack.
  const before = structuredClone(g.match);
  expect(g.command(0, { type: "cast-spell", objectId: counter.id }).kind).toBe(
    "rejected",
  );
  expect(g.match).toEqual(before);
  const archive = g.seed("Hedron Archive", "hand");
  force.mana(g.match, g.match.players[0].id, { C: 4, U: 2 });
  g.command(0, { type: "cast-spell", objectId: archive.id });
  const archiveSpell = stack(g.match)[0];
  g.command(0, { type: "pass-priority" });
  const second = g.seed("Counterspell", "hand", 1);
  force.mana(g.match, g.match.players[1].id, { U: 2 });
  expect(g.command(1, { type: "cast-spell", objectId: second.id }).kind).toBe(
    "pending",
  );
  const pending = g.match.rules.pending!;
  expect(
    g.command(1, {
      type: "rules-input",
      procedureId: pending.id,
      targetIds: [pending.proposal!.stackObjectId],
    }).kind,
  ).toBe("rejected");
  expect(
    g.command(1, {
      type: "rules-input",
      procedureId: pending.id,
      targetIds: [archiveSpell],
    }).kind,
  ).toBe("accepted");
});
