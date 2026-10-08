import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { legalActions } from "../../src/server/match/action-listing";
import { matchView } from "../../src/server/match/match-view";
import { RulesEngine } from "../../src/server/match/rules-engine";
import { force } from "../support/force";
import { rulesGame } from "../support/rules-game";

// A coarse benchmark: action listing for four players with 40 permanents
// each. It records timings in the test output and asserts only that the
// cached listing matches an uncached one; it sets no time limit.

test.setTimeout(240_000);

async function fourPlayerBoard() {
  const { match, catalog, room } = await rulesGame();
  // Commander Matches seat two players; two more join the same Match state.
  for (const name of ["Carol", "Dave"]) {
    const id = randomUUID();
    match.players.push({
      id,
      participantId: randomUUID(),
      name,
      seat: match.players.length,
      life: "40",
      mulliganCount: 0,
      outcome: "playing",
      counters: [],
    });
    for (const kind of ["library", "hand", "graveyard"] as const)
      match.zones.push({
        id: randomUUID(),
        kind,
        name: `${name}'s ${kind}`,
        ownerId: id,
        visibility: kind === "graveyard" ? "public" : "private",
        objectIds: [],
      });
    force.mana(match, id, {});
    match.turn.order.push(id);
    match.rules.setup.keptPlayerIds.push(id);
  }
  const names = [
    "Chief of the Foundry",
    "Master of Etherium",
    "Aether Spellbomb",
    "Silver Myr",
    "Sol Ring",
  ];
  for (const player of match.players)
    for (let i = 0; i < 40; i++) {
      const definition = Object.values(catalog.definitions).find(
        (card) => card.canonicalName === names[i % names.length],
      )!;
      force.card(match, definition, "battlefield", player.id);
    }
  return { match, catalog, participants: room.participants };
}

function time<T>(run: () => T, times: number) {
  let result!: T;
  const start = performance.now();
  for (let i = 0; i < times; i++) result = run();
  return { result, ms: (performance.now() - start) / times };
}

test("action listing for four players with 40 permanents each", async () => {
  const { match, catalog, participants } = await fourPlayerBoard();
  const engine = new RulesEngine(match, catalog);
  const playerId = match.priority!.playerId;
  // The engine without read passes: every characteristic is recomputed.
  const uncached = Object.create(engine, {
    reading: { value: <T>(read: () => T) => read() },
  }) as RulesEngine;
  const before = time(() => legalActions(uncached, playerId), 1);
  const after = time(() => legalActions(engine, playerId), 5);
  const views = time(
    () => participants.map((p) => matchView(match, p.id, catalog)),
    3,
  );
  expect(after.result).toEqual(before.result);
  expect(after.result.length).toBeGreaterThan(1);
  const record = [
    `objects: ${Object.keys(match.objects).length}`,
    `actions listed: ${after.result.length}`,
    `listing without read pass: ${before.ms.toFixed(1)} ms`,
    `listing with read pass: ${after.ms.toFixed(1)} ms`,
    `views for both seated participants: ${views.ms.toFixed(1)} ms`,
  ].join("; ");
  test.info().annotations.push({ type: "benchmark", description: record });
  console.log(`action-listing benchmark: ${record}`);
});
