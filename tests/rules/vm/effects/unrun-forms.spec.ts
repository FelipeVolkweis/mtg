import { expect, test } from "@playwright/test";
import "../../../support/round-trip";
import { effectGame } from "../../../support/effects";
import { force } from "../../../support/force";
import type { Value } from "../../../../src/shared/card-dsl";

// Forms the Mono-G port added to the DSL and the evaluator can't run yet
// (docs/plans/mono-g-port.md): the support check keeps them out of
// implemented cards, and if one reaches the evaluator it fails loudly
// instead of being ignored: the engine rejects the action as a bug and
// discards the clone. "Nothing is approximated" (docs/rules-engine.md).

test("a predicate field the evaluator doesn't run fails instead of matching everything", async () => {
  for (const field of [
    { commander: true },
    { keyword: "flying" },
    { attacking: "you" },
  ] as const) {
    const game = await effectGame();
    const creature = game.seed("Silver Myr", "battlefield", 1);
    // A bug in the engine rejects the action and the clone is discarded.
    const result = game.resolve([
      {
        kind: "destroy",
        objects: { all: { zone: "battlefield", type: ["Creature"], ...field } },
      },
    ]);
    expect(result.kind).toBe("rejected");
    expect(game.match.objects[creature.id]).toBeDefined();
  }
});

test("a value form the evaluator doesn't run fails instead of counting zero", async () => {
  for (const amount of [
    { total: { of: { all: { zone: "battlefield" } }, name: "power" } },
    { product: [4, 2] },
    { atCast: 3 },
  ] satisfies Value[]) {
    const game = await effectGame();
    expect(game.resolve([{ kind: "gain-life", amount }]).kind).toBe("rejected");
    expect(game.life(0)).toBe("40");
  }
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
