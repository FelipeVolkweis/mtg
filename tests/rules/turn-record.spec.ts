import { expect, test } from "@playwright/test";
import { newTurnRecord } from "../../src/server/match/turn-structure";
import { rulesGame } from "../support/rules-game";

// Per-turn bookkeeping lives in one `RulesState.thisTurn` record that a new
// turn replaces as a whole, so no per-turn field can survive into the next turn.

test("a new turn replaces this turn's record as a whole", async () => {
  const { match, command } = await rulesGame();
  const player = match.players[0].id;
  const previous = match.rules.thisTurn;
  previous.landsPlayed[player] = 1;
  previous.draws[player] = 3;
  previous.activationUsage["source:ability"] = 1;
  // A field a later change might add: it goes with the record.
  (previous as unknown as Record<string, unknown>).forgotten = { [player]: 1 };
  while (match.turn.number === 1) {
    const seat = match.players.findIndex(
      (p) => p.id === match.priority!.playerId,
    );
    expect(command(seat, { type: "pass-priority" }).kind).not.toBe("rejected");
  }
  expect(match.turn.step).toBe("upkeep");
  expect(match.rules.thisTurn).not.toBe(previous);
  expect(match.rules.thisTurn).toEqual(newTurnRecord());
});
