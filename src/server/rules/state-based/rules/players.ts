import type { MatchPlayer } from "../../../../shared/model.js";
import type { RulesQuery } from "../../context.js";
import { changes, type StateBasedRule } from "../types.js";

/** A loss rule: every player still playing who meets the condition loses. */
const loss = (
  id: string,
  loses: (query: RulesQuery, player: MatchPlayer) => boolean,
): StateBasedRule => ({
  id,
  evaluate: (query) =>
    changes(
      query.match.players
        .filter((player) => player.outcome === "playing")
        .filter((player) => loses(query, player))
        .map((player) => ({ kind: "lose", playerId: player.id })),
    ),
});

/** CR 704.5a: a player with 0 or less life loses. */
export const zeroLifeLoss = loss(
  "zero-life-loss",
  (_, player) => BigInt(player.life) <= 0n,
);

/** CR 704.5b: a player who drew from an empty Library loses. */
export const failedDrawLoss = loss(
  "failed-draw-loss",
  (query, player) =>
    !!query.match.rules.failedDrawPlayerIds?.includes(player.id),
);

/** CR 704.6c: 21 combat damage from one commander loses the game. */
export const commanderDamageLoss = loss(
  "commander-damage-loss",
  (query, player) =>
    Object.values(query.match.rules.commanderDamage?.[player.id] ?? {}).some(
      (amount) => amount >= 21,
    ),
);
