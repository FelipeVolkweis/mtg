import type { RulesQuery } from "./context.js";

// Damage a creature can take (CR 120.6, 702.2c).

/**
 * The damage that is lethal to a creature, given the damage already marked on
 * it: the rest of its toughness, or any damage at all from a deathtouch
 * source.
 */
export function lethalDamage(
  query: RulesQuery,
  creatureId: string,
  deathtouch: boolean,
) {
  const toughness = Number(query.effective(query.object(creatureId)).toughness);
  const remaining =
    (Number.isFinite(toughness) ? toughness : 0) -
    (query.match.rules.markedDamage?.[creatureId] ?? 0);
  return Math.max(0, deathtouch ? Math.min(1, remaining) : remaining);
}
