import { expect, test } from "@playwright/test";
import "../../../support/round-trip";
import { effectGame } from "../../../support/effects";
import { force } from "../../../support/force";
import type { Selector, Value } from "../../../../src/shared/card-dsl";

// The values and predicate fields the Mono-G port added to the DSL
// (docs/plans/mono-g-port.md) and the evaluator runs.

test("a keyword predicate matches the creatures that have the keyword", async () => {
  const game = await effectGame();
  const flier = game.seed("Birds of Paradise", "battlefield", 1);
  const ground = game.seed("Silver Myr", "battlefield", 1);
  game.resolve([
    {
      kind: "destroy",
      objects: {
        all: { zone: "battlefield", type: ["Creature"], keyword: "flying" },
      },
    },
  ]);
  expect(game.match.objects[flier.id]).toBeUndefined();
  expect(game.match.objects[ground.id]).toBeDefined();
});

test("a commander predicate matches the commander designation in any zone", async () => {
  const game = await effectGame();
  const commander = game.seed("Silver Myr", "battlefield", 1);
  const other = game.seed("Silver Myr", "battlefield", 1);
  force.commander(game.match, commander.cardInstanceIds[0]);
  game.resolve([
    {
      kind: "destroy",
      objects: {
        all: { zone: "battlefield", owner: "opponents", commander: true },
      },
    },
  ]);
  expect(game.match.objects[commander.id]).toBeUndefined();
  expect(game.match.objects[other.id]).toBeDefined();
});

test("value forms add up, multiply and read the stats of a set", async () => {
  const game = await effectGame();
  game.seed("Silver Myr", "battlefield");
  game.seed("Gigantosaurus", "battlefield");
  game.seed("Gigantosaurus", "battlefield", 1);
  const mine: Selector = {
    all: { zone: "battlefield", type: ["Creature"], controller: "you" },
  };
  for (const [amount, gained] of [
    [{ product: [4, 2] }, 8],
    [{ total: { of: mine, name: "power" } }, 11],
    [{ product: [2, { total: { of: mine, name: "toughness" } }] }, 22],
    [{ total: { of: mine, name: "manaValue" } }, 7],
  ] satisfies [Value, number][]) {
    const before = Number(game.life(0));
    expect(game.resolve([{ kind: "gain-life", amount }]).kind).toBe("accepted");
    expect(Number(game.life(0)) - before).toBe(gained);
  }
});

test("an atCast value without a recorded cast fails instead of counting zero", async () => {
  const game = await effectGame();
  const amount: Value = { atCast: 3 };
  expect(game.resolve([{ kind: "gain-life", amount }]).kind).toBe("rejected");
  expect(game.life(0)).toBe("40");
});

test("counters without a kind match an object holding a counter of any kind", async () => {
  const game = await effectGame();
  const grown = game.seed("Silver Myr", "battlefield");
  const charged = game.seed("Silver Myr", "battlefield");
  const bare = game.seed("Silver Myr", "battlefield");
  force.counters(grown, [{ kind: "+1/+1", quantity: "1" }]);
  force.counters(charged, [{ kind: "charge", quantity: "2" }]);
  game.resolve([
    {
      kind: "add-counters",
      objects: {
        all: {
          zone: "battlefield",
          type: ["Creature"],
          counters: { count: { ">=": 1 } },
        },
      },
      counter: "+1/+1",
      count: 1,
    },
  ]);
  const counters = (object: { id: string }) =>
    game.match.objects[object.id].counters;
  expect(counters(grown)).toEqual([{ kind: "+1/+1", quantity: "2" }]);
  expect(counters(charged)).toEqual([
    { kind: "charge", quantity: "2" },
    { kind: "+1/+1", quantity: "1" },
  ]);
  expect(counters(bare)).toEqual([]);
});
