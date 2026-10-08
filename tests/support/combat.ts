import { matchView } from "../../src/server/match/match-view";
import type { rulesGame } from "./rules-game";

// Combat scenario helpers over the Match commands (rules test plan §16): the
// players pass Priority, declare attackers and blockers, and assign combat
// damage as a player would.

type Game = Awaited<ReturnType<typeof rulesGame>>;

export const viewOf = (game: Game, seat = 0) =>
  matchView(game.match, game.room.participants[seat].id, game.catalog);
/** Both players pass: the top of the Stack resolves, or the step ends. */
export const both = (game: Game) => {
  game.command(0, { type: "pass-priority" });
  game.command(1, { type: "pass-priority" });
};
export const promptOf = (game: Game, seat = 0) =>
  viewOf(game, seat).rules.prompt!;
export const life = (game: Game, seat: number) =>
  Number(game.match.players[seat].life);

/** Passes to the declare attackers prompt and attacks the opponent with `attackers`. */
export function declareAttackers(game: Game, attackers: { id: string }[]) {
  both(game);
  both(game);
  return game.command(0, {
    type: "rules-input",
    procedureId: promptOf(game).procedureId,
    selections: Object.fromEntries(
      attackers.map((a) => [a.id, [game.match.players[1].id]]),
    ),
  });
}

/** The opponent declares `blocks` (blocker id → attacker id). */
export function declareBlockers(game: Game, blocks: Record<string, string>) {
  both(game);
  return game.command(1, {
    type: "rules-input",
    procedureId: promptOf(game, 1).procedureId,
    selections: Object.fromEntries(
      Object.entries(blocks).map(([blocker, attacker]) => [
        blocker,
        [attacker],
      ]),
    ),
  });
}

/**
 * Attacks the other player with `attackers`; the defender then blocks as
 * `blocks`. Stops at the combat damage choice, or after damage when there is
 * none.
 */
export function attack(
  game: Game,
  attackers: { id: string }[],
  blocks: Record<string, string> = {},
) {
  declareAttackers(game, attackers);
  declareBlockers(game, blocks);
  both(game);
}

/** Answers the combat damage choice for one attacker. */
export const assign = (
  game: Game,
  source: { id: string },
  amounts: [{ id: string }, number][],
) =>
  game.command(0, {
    type: "rules-input",
    procedureId: promptOf(game).procedureId,
    damageAssignments: amounts.map(([recipient, amount]) => ({
      sourceId: source.id,
      recipientId: recipient.id,
      amount,
    })),
  });
