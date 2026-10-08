import { expect, test } from "@playwright/test";
import { gameObject } from "../../../src/server/match/game-objects";
import { RulesEngine } from "../../../src/server/match/rules-engine";
import {
  handledEffectKinds,
  unsupportedEffect,
} from "../../../src/server/rules/vm/effects/registry";
import { force } from "../../support/force";
import { rulesGame } from "../../support/rules-game";

// The event seam (rules-engine-refactor.md §6, §40-41, §56): zone changes,
// draws, damage, life changes and object creation are proposed to the
// mutator, applied, and reported to trigger observation.

async function engineGame() {
  const game = await rulesGame();
  const engine = new RulesEngine(game.match, game.catalog);
  const zone = (kind: string, seat?: number) =>
    game.match.zones.find(
      (z) =>
        z.kind === kind &&
        (seat === undefined || z.ownerId === game.match.players[seat].id),
    )!;
  return { ...game, engine, zone };
}

test("a zone change returns the new object and its last known information", async () => {
  const { engine, seed, match, zone } = await engineGame();
  const creature = seed("Silver Myr", "battlefield");
  force.counters(creature, [{ kind: "+1/+1", quantity: "2" }]);
  creature.status.tapped = true;
  const { object, lastKnown } = engine.propose({
    kind: "zone-change",
    objectId: creature.id,
    to: zone("graveyard", 0),
  });
  // CR 400.7: the card in the Graveyard is a new object.
  expect(object!.id).not.toBe(creature.id);
  expect(object!.zoneId).toBe(zone("graveyard", 0).id);
  expect(match.objects[creature.id]).toBeUndefined();
  expect(lastKnown).toMatchObject({
    objectId: creature.id,
    zoneId: zone("battlefield").id,
    controllerId: match.players[0].id,
    tapped: true,
    counters: [{ kind: "+1/+1", quantity: "2" }],
  });
  // Effective characteristics, counters included.
  expect(lastKnown!.characteristics.power).toBe(
    String(Number(creature.characteristics.power) + 2),
  );
});

test("a dies trigger observes the zone change with its snapshot", async () => {
  const { engine, seed, match, zone } = await engineGame();
  const retriever = seed("Myr Retriever", "battlefield");
  seed("Sol Ring", "battlefield");
  force.move(
    match,
    seed("Mind Stone", "hand"),
    "graveyard",
    match.players[0].id,
  );
  engine.propose({
    kind: "zone-change",
    objectId: retriever.id,
    to: zone("graveyard", 0),
  });
  const [trigger] = match.rules.waitingTriggers!;
  expect(trigger.event).toMatchObject({
    kind: "zone-change",
    from: "battlefield",
    to: "graveyard",
    lastKnown: { objectId: retriever.id },
  });
});

test("a setup move is not observed by triggers", async () => {
  const { engine, seed, match, zone } = await engineGame();
  seed("Myr Retriever", "battlefield");
  const card = seed("Sol Ring", "hand");
  engine.propose({
    kind: "zone-change",
    objectId: card.id,
    to: zone("library", 0),
    cause: "setup",
  });
  expect(match.rules.waitingTriggers ?? []).toEqual([]);
  expect(zone("library", 0).objectIds.at(-1)).not.toBe(card.id);
});

test("moving within a Zone reorders it without a new object", async () => {
  const { engine, zone } = await engineGame();
  const library = zone("library", 0);
  const bottom = library.objectIds.at(-1)!;
  const { object } = engine.propose({
    kind: "zone-change",
    objectId: bottom,
    to: library,
    position: "top",
  });
  expect(object!.id).toBe(bottom);
  expect(library.objectIds[0]).toBe(bottom);
});

test("a draw moves the top card and counts the turn's draws; an empty Library records a failed draw", async () => {
  const { engine, match, zone } = await engineGame();
  const player = match.players[0].id;
  const top = zone("library", 0).objectIds[0];
  const before = match.rules.thisTurn.draws[player] ?? 0;
  const { object } = engine.propose({ kind: "draw", playerId: player });
  expect(object!.zoneId).toBe(zone("hand", 0).id);
  expect(match.objects[top]).toBeUndefined();
  expect(match.rules.thisTurn.draws[player]).toBe(before + 1);
  force.clearZone(match, "library", player);
  expect(
    engine.propose({ kind: "draw", playerId: player }).object,
  ).toBeUndefined();
  expect(match.rules.failedDrawPlayerIds).toEqual([player]);
});

test("damage marks creatures, lowers life and records the event", async () => {
  const { engine, seed, match } = await engineGame();
  const source = seed("Sol Ring", "battlefield");
  const creature = seed("Silver Myr", "battlefield", 1);
  engine.propose({
    kind: "damage",
    combat: false,
    assignments: [
      { sourceId: source.id, recipientId: creature.id, amount: 1 },
      { sourceId: source.id, recipientId: match.players[1].id, amount: 3 },
    ],
  });
  expect(match.rules.markedDamage![creature.id]).toBe(1);
  expect(match.players[1].life).toBe("37");
  expect(match.rules.thisTurn.damageEvents).toHaveLength(2);
});

test("life changes add or subtract", async () => {
  const { engine, match } = await engineGame();
  engine.propose({
    kind: "life-change",
    playerId: match.players[0].id,
    amount: 5,
  });
  engine.propose({
    kind: "life-change",
    playerId: match.players[0].id,
    amount: -2,
  });
  expect(match.players[0].life).toBe("43");
});

test("a created token enters the Battlefield; a ceased object is gone", async () => {
  const { engine, match, zone } = await engineGame();
  const token = gameObject(
    "token",
    zone("battlefield").id,
    match.players[0].id,
    match.players[0].id,
    { name: "Myr", colors: [], typeLine: "Token", rulesText: "" },
  );
  engine.propose({ kind: "create", object: token, zone: zone("battlefield") });
  expect(zone("battlefield").objectIds).toContain(token.id);
  expect(match.rules.controlledSinceTurn[token.id]).toBe(match.turn.number);
  engine.propose({ kind: "cease", objectId: token.id });
  expect(match.objects[token.id]).toBeUndefined();
  expect(zone("battlefield").objectIds).not.toContain(token.id);
});

test("every effect kind has a handler or is reported as unsupported", () => {
  expect(handledEffectKinds.sort()).toEqual(
    [
      "add-counters",
      "add-mana",
      "apply-continuous",
      "apply-grant",
      "apply-replacement",
      "attach",
      "become-monarch",
      "choose-one",
      "counter",
      "create-token",
      "damage",
      "destroy",
      "discard",
      "draw",
      "exile",
      "fight",
      "for-each-player",
      "gain-life",
      "if",
      "library-sequence",
      "lose-life",
      "may",
      "may-pay",
      "move",
      "play",
      "reselect-defender",
      "sacrifice",
      "sequence",
      "tap",
    ].sort(),
  );
  // The compiler desugars scry; these wait for card-driven work.
  for (const kind of [
    "search",
    "shuffle",
    "untap",
    "remove-counters",
    "create-delayed-trigger",
  ])
    expect(unsupportedEffect({ kind, player: "you" } as never), kind).toBe(
      `The ${kind} effect`,
    );
});
