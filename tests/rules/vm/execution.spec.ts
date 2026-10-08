import { expect, test } from "@playwright/test";
import "../../support/round-trip";
import { effectGame } from "../../support/effects";

// Rule VM execution (rules-test-plan.md §18): sequential instructions, nested
// frames and branches, with synthetic programs rather than named cards.

test("instructions run in order", async () => {
  const game = await effectGame();
  // Gaining then losing: the order shows in the bound amount.
  game.resolve([
    { kind: "gain-life", amount: 2 },
    {
      kind: "if",
      condition: { compare: [{ lifeTotal: "you" }, "=", 42] },
      then: [{ kind: "lose-life", player: "you", amount: 10 }],
    },
    { kind: "gain-life", amount: 1 },
  ]);
  expect(game.life(0)).toBe("33");
});

test("a nested frame finishes before its parent continues", async () => {
  const game = await effectGame();
  game.resolve([
    {
      kind: "sequence",
      effects: [
        {
          kind: "sequence",
          effects: [{ kind: "gain-life", amount: 1, bind: "first" }],
        },
        {
          kind: "if",
          condition: { compare: [{ lifeTotal: "you" }, "=", 41] },
          then: [{ kind: "gain-life", amount: 10 }],
        },
      ],
    },
    {
      kind: "if",
      condition: { compare: [{ lifeTotal: "you" }, "=", 51] },
      then: [{ kind: "lose-life", player: "opponents", amount: 5 }],
    },
  ]);
  expect(game.life(0)).toBe("51");
  expect(game.life(1)).toBe("35");
});

test("a branch runs only its taken side", async () => {
  for (const big of [true, false]) {
    const game = await effectGame();
    game.resolve([
      { kind: "gain-life", amount: big ? 20 : 0 },
      {
        kind: "if",
        condition: { compare: [{ lifeTotal: "you" }, ">", 50] },
        then: [{ kind: "gain-life", amount: 1 }],
        else: [{ kind: "lose-life", player: "opponents", amount: 1 }],
      },
    ]);
    expect(game.life(0)).toBe(big ? "61" : "40");
    expect(game.life(1)).toBe(big ? "40" : "39");
  }
});

test("the program completes, the ability leaves the Stack and Priority returns", async () => {
  const game = await effectGame();
  expect(game.resolve([{ kind: "gain-life", amount: 1 }]).kind).toBe(
    "accepted",
  );
  expect(game.match.rules.resolving).toBeUndefined();
  expect(game.ids("stack")).toEqual([]);
  expect(game.match.priority?.playerId).toBe(game.match.turn.activePlayerId);
});
