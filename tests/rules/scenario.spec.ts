import { expect, test } from "@playwright/test";
import { gameObject } from "../../src/server/match/game-objects";
import { force } from "../support/force";
import { rulesGame } from "../support/rules-game";

const zoneOf = (
  match: Awaited<ReturnType<typeof rulesGame>>["match"],
  id: string,
) => match.zones.find((zone) => zone.objectIds.includes(id));

test("rulesGame starts in the first main phase with the active player holding Priority", async () => {
  const { match } = await rulesGame();
  expect(match.turn.step).toBe("precombat-main");
  expect(match.priority?.playerId).toBe(match.turn.activePlayerId);
});

test("seed and force.card create an owned Card Instance in the requested Zone", async () => {
  const { match, seed } = await rulesGame();
  const ring = seed("Sol Ring", "battlefield", 1);
  const player = match.players[1].id;
  expect(zoneOf(match, ring.id)?.kind).toBe("battlefield");
  expect(ring.controllerId).toBe(player);
  expect(match.instances[ring.cardInstanceIds[0]].ownerId).toBe(player);
  expect(match.rules.controlledSinceTurn[ring.id]).toBe(0);
  const hand = seed("Negate", "hand");
  expect(zoneOf(match, hand.id)).toMatchObject({
    kind: "hand",
    ownerId: match.players[0].id,
  });
});

test("force.mana merges into the pool and fills missing colors", async () => {
  const { match } = await rulesGame();
  const player = match.players[0].id;
  force.mana(match, player, { U: 2 });
  force.mana(match, player, { C: 1 });
  expect(match.rules.mana[player]).toEqual({
    W: 0,
    U: 2,
    B: 0,
    R: 0,
    G: 0,
    C: 1,
  });
});

test("force.step sets the named step and force.activePlayer/priority hand over the turn", async () => {
  const { match } = await rulesGame();
  force.step(match, "cleanup");
  expect(match.turn.step).toBe("cleanup");
  force.step(match, "declare-attackers");
  expect(match.turn.step).toBe("declare-attackers");
  const other = match.players[1].id;
  force.activePlayer(match, other);
  force.priority(match, other);
  expect(match.turn.activePlayerId).toBe(other);
  expect(match.priority).toEqual({ playerId: other, passedPlayerIds: [] });
});

test("object helpers set counters, attachment and controller", async () => {
  const { match, seed } = await rulesGame();
  const creature = seed("Silver Myr", "battlefield"),
    tool = seed("Adaptive Omnitool", "battlefield");
  force.counters(creature, [{ kind: "+1/+1", quantity: "2" }]);
  force.attach(tool, creature);
  force.controller(creature, match.players[1].id);
  force.controlledSince(match, creature, 4);
  expect(creature.counters).toEqual([{ kind: "+1/+1", quantity: "2" }]);
  expect(tool.attachmentTo).toBe(creature.id);
  expect(creature.controllerId).toBe(match.players[1].id);
  expect(match.rules.controlledSinceTurn[creature.id]).toBe(4);
  force.attach(tool, null);
  expect(tool.attachmentTo).toBeNull();
});

test("force.move keeps the object's identity and updates both Zones", async () => {
  const { match, seed } = await rulesGame();
  const spell = seed("Negate", "hand");
  force.move(match, spell, "stack");
  expect(zoneOf(match, spell.id)?.kind).toBe("stack");
  expect(match.objects[spell.id]).toBe(spell);
  const graveyardOwner = match.players[1].id;
  force.move(match, spell, "graveyard", graveyardOwner);
  expect(zoneOf(match, spell.id)).toMatchObject({
    kind: "graveyard",
    ownerId: graveyardOwner,
  });
  expect(
    match.zones.filter((zone) => zone.objectIds.includes(spell.id)),
  ).toHaveLength(1);
});

test("zone helpers clear, order and add objects", async () => {
  const { match, seed } = await rulesGame();
  const player = match.players[0].id;
  const library = () =>
    match.zones.find((z) => z.kind === "library" && z.ownerId === player)!;
  const top = library().objectIds[0];
  force.clearZone(match, "library", player, 1);
  expect(library().objectIds).toEqual([top]);
  const card = seed("Mind Stone", "hand");
  force.zoneContents(match, "library", player, [card, match.objects[top]]);
  expect(library().objectIds).toEqual([card.id, top]);
  expect(card.zoneId).toBe(library().id);
  expect(zoneOf(match, card.id)).toBe(library());
  const stack = match.zones.find((z) => z.kind === "stack")!;
  const ability = gameObject("ability", stack.id, player, player, {
    name: "Test ability",
    typeLine: "Ability",
    colors: [],
    rulesText: "",
  });
  force.addObject(match, ability);
  expect(stack.objectIds).toContain(ability.id);
  expect(match.objects[ability.id]).toBe(ability);
});

test("force.rules and force.commander set one-off state", async () => {
  const { match, seed } = await rulesGame();
  const card = seed("Sol Ring", "battlefield");
  force.rules(match, { monarchId: match.players[1].id });
  force.commander(match, card.cardInstanceIds[0]);
  expect(match.rules.monarchId).toBe(match.players[1].id);
  expect(match.instances[card.cardInstanceIds[0]].commander).toBe(true);
});
