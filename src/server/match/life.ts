import type { MatchPlayer } from "../../shared/rules-state.js";

// A Life Total is an integer of any size, stored as a decimal string and
// changed with BigInt arithmetic so no total loses precision. This module is
// the only code that parses, compares or changes `MatchPlayer.life`.

/** Adds `amount` to a player's Life Total; a negative amount is life lost. */
export function changeLife(player: MatchPlayer, amount: number) {
  player.life = (BigInt(player.life) + BigInt(amount)).toString();
}

/** Whether a player has at least `amount` life to pay (CR 119.4). */
export function canPayLife(player: MatchPlayer, amount: number) {
  return BigInt(player.life) >= BigInt(amount);
}

/** CR 704.5a: whether a player has 0 or less life. */
export function hasNoLife(player: MatchPlayer) {
  return BigInt(player.life) <= 0n;
}

/** A player's Life Total as a DSL number value; 0 without a player. */
export function lifeValue(player: MatchPlayer | undefined) {
  return player ? Number(player.life) : 0;
}
