import { expect, test } from "@playwright/test";
import "../../support/round-trip";
import { effectGame } from "../../support/effects";
import type { MatchState } from "../../../src/shared/rules-state";

// Rule VM serialization (rules-test-plan.md §18): execution state is plain
// Match data. A Match saved and restored while suspended resumes at the
// waiting instruction; nothing before it runs again.

function restore(match: MatchState) {
  const saved = JSON.parse(JSON.stringify(match)) as MatchState;
  for (const key of Object.keys(match)) Reflect.deleteProperty(match, key);
  Object.assign(match, saved);
}

test("a restored suspension resumes without replaying earlier instructions", async () => {
  const game = await effectGame();
  const before = game.handCount();
  game.resolve([
    { kind: "draw", count: 2, bind: "drawn" },
    { kind: "gain-life", amount: 3 },
    {
      kind: "sequence",
      effects: [
        { kind: "discard", count: 1, bind: "discarded" },
        { kind: "gain-life", amount: { binding: "drawn" } },
      ],
    },
  ]);
  const saved = JSON.stringify(game.match.rules!.resolving);
  restore(game.match);
  expect(JSON.stringify(game.match.rules!.resolving)).toBe(saved);
  expect(game.handCount()).toBe(before + 2);
  const [card] = game.prompt().options.discard.objectIds;
  game.answer({ discard: [card] });
  // Drawn once, discarded once; life from both gain-life instructions once.
  expect(game.handCount()).toBe(before + 1);
  expect(game.life(0)).toBe("45");
});

test("the execution state holds only frames, program counters and typed bindings", async () => {
  const game = await effectGame();
  game.resolve([
    { kind: "draw", count: 1, bind: "drawn" },
    { kind: "discard", count: 1 },
  ]);
  const execution = game.match.rules!.resolving!;
  expect(Object.keys(execution).sort()).toEqual(
    ["bindings", "controllerId", "frames", "stackObjectId", "waiting"].sort(),
  );
  expect(execution).not.toHaveProperty("remaining");
  expect(execution.bindings).toEqual({
    drawn: { kind: "number", value: 1 },
  });
});
