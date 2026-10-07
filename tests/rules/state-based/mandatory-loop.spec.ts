import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import "../../support/round-trip";
import {
  fingerprint,
  LoopDetector,
  MandatoryLoop,
} from "../../../src/server/rules/mandatory-loop";
import { StateBasedRuntime } from "../../../src/server/rules/state-based/state-based-runtime";
import type { MatchState } from "../../../src/shared/rules-state";
import { effectGame } from "../../support/effects";
import { force } from "../../support/force";

// Mandatory loop detection (CR 104.4b): a loop that comes back to a game
// state it already passed through, with no player choice in between, draws
// the game. Fingerprints ignore which ids objects happen to have.

/** The same game with one id replaced everywhere, as if the object returned anew. */
const renamed = (match: MatchState, id: string) =>
  JSON.parse(
    JSON.stringify(match).replaceAll(id, randomUUID()),
  ) as MatchState;

test("an object that returns as a new object leaves the fingerprint unchanged", async () => {
  const game = await effectGame();
  const myr = game.seed("Silver Myr", "battlefield");
  expect(fingerprint(renamed(game.match, myr.id))).toBe(
    fingerprint(game.match),
  );
});

test("any change other than ids changes the fingerprint", async () => {
  const game = await effectGame();
  const myr = game.seed("Silver Myr", "battlefield");
  const before = fingerprint(game.match);
  force.counters(myr, [{ kind: "+1/+1", quantity: "1" }]);
  expect(fingerprint(game.match)).not.toBe(before);
});

test("the revision is bookkeeping, not game state", async () => {
  const game = await effectGame();
  const before = fingerprint(game.match);
  game.match.revision++;
  expect(fingerprint(game.match)).toBe(before);
});

test("a detector throws only when a state repeats", async () => {
  const game = await effectGame();
  const myr = game.seed("Silver Myr", "battlefield");
  const loop = new LoopDetector("Test loop");
  loop.visit(game.match);
  force.counters(myr, [{ kind: "+1/+1", quantity: "1" }]);
  loop.visit(game.match);
  expect(() => loop.visit(renamed(game.match, myr.id))).toThrow(MandatoryLoop);
});

test("a state-based check that never settles draws the game", async () => {
  const game = await effectGame();
  const myr = game.seed("Silver Myr", "battlefield");
  force.counters(myr, [{ kind: "-1/-1", quantity: "1" }]);
  // Put back on the prototype below; never called unbound.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const perform = StateBasedRuntime.prototype["perform"];
  // The creature never leaves: every check finds the same action again.
  StateBasedRuntime.prototype["perform"] = () => {};
  try {
    force.priority(game.match, game.player(0));
    expect(game.command(0, { type: "pass-priority" })).toEqual({
      kind: "accepted",
      notice: "This action starts an endless loop. The game is a draw.",
    });
  } finally {
    StateBasedRuntime.prototype["perform"] = perform;
  }
  expect(game.match.outcome).toBe("draw");
  expect(game.match.priority).toBeUndefined();
});
