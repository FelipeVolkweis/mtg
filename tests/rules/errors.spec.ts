import { expect, test } from "@playwright/test";
import { RulesEngine } from "../../src/server/match/rules-engine";
import {
  playerMessage,
  TabletopError,
} from "../../src/server/room/player-errors";
import {
  internalErrorMessage,
  RuleViolation,
} from "../../src/server/rules/rule-violation";
import "../support/round-trip";
import { rulesGame } from "../support/rules-game";

// Which error texts reach a player: a RuleViolation (or a TabletopError) is
// advice to the player; anything else is a bug, logged with its context and
// shown as a generic message.

/** Captures console.error while `run` executes. */
function capturingErrors<T>(run: () => T) {
  const logged: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => void logged.push(args);
  try {
    return { result: run(), logged };
  } finally {
    console.error = original;
  }
}

test("a rule violation reaches the player with its own message and logs nothing", async () => {
  const g = await rulesGame();
  const seat = g.match.players.findIndex(
    (p) => p.id !== g.match.priority!.playerId,
  );
  const revision = g.match.revision;
  const { result, logged } = capturingErrors(() =>
    g.command(seat, { type: "pass-priority" }),
  );
  expect(result).toEqual({
    kind: "rejected",
    message: "You do not have Priority.",
  });
  expect(logged).toEqual([]);
  expect(g.match.revision).toBe(revision);
});

test("an internal error is logged with the Match and action, and the player sees a generic message", async () => {
  const g = await rulesGame();
  const seat = g.match.players.findIndex(
    (p) => p.id === g.match.priority!.playerId,
  );
  const before = structuredClone(g.match);
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const pass = RulesEngine.prototype.pass;
  RulesEngine.prototype.pass = () => {
    throw new TypeError("Cannot read properties of undefined (reading 'x')");
  };
  try {
    const { result, logged } = capturingErrors(() =>
      g.command(seat, { type: "pass-priority" }),
    );
    expect(result).toEqual({ kind: "rejected", message: internalErrorMessage });
    expect(logged).toHaveLength(1);
    const [context, error] = logged[0];
    expect(context).toContain(g.match.id);
    expect(context).toContain('"type":"pass-priority"');
    expect(error).toBeInstanceOf(TypeError);
  } finally {
    RulesEngine.prototype.pass = pass;
  }
  expect(g.match).toEqual(before);
});

test("only a TabletopError or a RuleViolation has text a client may see", () => {
  expect(playerMessage(new RuleViolation("Choose a legal blocker."))).toBe(
    "Choose a legal blocker.",
  );
  expect(playerMessage(new TabletopError("This Room is closed."))).toBe(
    "This Room is closed.",
  );
  for (const error of [
    new Error('relation "rooms" is locked'),
    new TypeError("Cannot read properties of undefined"),
    "a thrown string",
    undefined,
  ])
    expect(playerMessage(error)).toBeUndefined();
});
