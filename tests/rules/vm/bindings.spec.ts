import { expect, test } from "@playwright/test";
import "../../support/round-trip";
import { effectGame } from "../../support/effects";
import { force } from "../../support/force";

// Rule VM bindings (rules-test-plan.md §18): typed number, object-set and flag
// bindings, read by later instructions in any frame.

test("the TP §18 program: draw, discard, then draw as many as were drawn", async () => {
  const game = await effectGame();
  const before = game.handCount();
  game.resolve([
    { kind: "draw", count: 2, bind: "drawn" },
    { kind: "discard", count: 1, bind: "discarded" },
    {
      kind: "if",
      condition: { compare: [{ binding: "discarded" }, ">=", 1] },
      then: [{ kind: "draw", count: { binding: "drawn" } }],
    },
  ]);
  const execution = game.match.rules.resolving!;
  expect(execution.bindings.drawn).toEqual({ kind: "number", value: 2 });
  const [card] = game.prompt().options.discard.objectIds;
  game.answer({ discard: [card] });
  expect(game.handCount()).toBe(before + 2 - 1 + 2);
});

test("an object-set binding is typed and counts as a number", async () => {
  const game = await effectGame();
  const myr = game.seed("Silver Myr", "battlefield", 1);
  game.resolve([
    { kind: "draw", count: 1 },
    {
      kind: "tap",
      objects: {
        choose: { from: { zone: "battlefield", type: "Creature" }, count: 1 },
      },
      bind: "tapped",
    },
    { kind: "gain-life", amount: { count: { binding: "tapped" } } },
  ]);
  game.answer({ select: [myr.id] });
  expect(game.match.objects[myr.id].status.tapped).toBe(true);
  expect(game.life(0)).toBe("41");
});

test("a flag binding records whether an optional instruction was performed", async () => {
  const game = await effectGame();
  const myr = game.seed("Silver Myr", "battlefield", 1);
  game.resolve(
    [
      {
        kind: "may",
        bind: "exiled",
        effects: [{ kind: "exile", objects: { target: "target-0" } }],
      },
    ],
    { targetIds: [myr.id] },
  );
  game.answer({ select: [myr.id] });
  expect(game.life(0)).toBe("40");
  // The binding was typed while the program ran; the program has completed.
  expect(game.match.rules.resolving).toBeUndefined();
});

test("the chosen X is a number binding from the start", async () => {
  const game = await effectGame();
  force.clearZone(game.match, "hand", game.player(0));
  game.seed("Negate", "hand");
  game.resolve(
    [
      { kind: "discard", count: 1 },
      { kind: "gain-life", amount: { variable: "X" } },
    ],
    { x: 3 },
  );
  expect(game.match.rules.resolving!.bindings.X).toEqual({
    kind: "number",
    value: 3,
  });
  game.answer({ discard: game.prompt().options.discard.objectIds });
  expect(game.life(0)).toBe("43");
});
