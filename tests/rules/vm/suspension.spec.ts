import { expect, test } from "@playwright/test";
import "../../support/round-trip";
import { effectGame } from "../../support/effects";

// Rule VM suspension (rules-test-plan.md §18): a choice suspends at its
// program counter, an answer resumes there, and each new suspension exposes a
// fresh procedure id.

const discardTwice = [
  { kind: "gain-life" as const, amount: 1 },
  { kind: "discard" as const, count: 1 },
  {
    kind: "sequence" as const,
    effects: [{ kind: "discard" as const, count: 1 }],
  },
  { kind: "gain-life" as const, amount: 1 },
];

test("a choice suspends with the program counter on the waiting instruction", async () => {
  const game = await effectGame();
  expect(game.resolve(discardTwice).kind).toBe("pending");
  const execution = game.match.rules.resolving!;
  expect(execution.frames).toHaveLength(1);
  expect(execution.frames[0].pc).toBe(1);
  expect(execution.waiting).toBeDefined();
  expect(game.life(0)).toBe("41");
  expect(game.match.priority).toBeUndefined();
});

test("an answer resumes after the waiting instruction, inside a nested frame", async () => {
  const game = await effectGame();
  game.resolve(discardTwice);
  const first = game.prompt();
  game.answer({ discard: [first.options.discard.objectIds[0]] });
  const execution = game.match.rules.resolving!;
  expect(execution.frames.map((f) => f.pc)).toEqual([3, 0]);
  const second = game.prompt();
  expect(second.procedureId).not.toBe(first.procedureId);
  game.answer({ discard: [second.options.discard.objectIds[0]] });
  expect(game.match.rules.resolving).toBeUndefined();
  expect(game.life(0)).toBe("42");
  expect(game.ids("graveyard", 0)).toHaveLength(2);
});

test("a stale procedure id is refused and changes nothing", async () => {
  const game = await effectGame();
  game.resolve(discardTwice);
  const first = game.prompt();
  game.answer({ discard: [first.options.discard.objectIds[0]] });
  const before = structuredClone(game.match.rules.resolving);
  expect(
    game.command(0, {
      type: "rules-input",
      procedureId: first.procedureId,
      selections: { discard: [] },
    }).kind,
  ).toBe("rejected");
  expect(game.match.rules.resolving).toEqual(before);
});
