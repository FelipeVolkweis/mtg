import type { GameObject } from "../../../../shared/rules-state.js";
import type { RulesQuery } from "../../context.js";

/** The permanents on the Battlefield. */
export const battlefield = (query: RulesQuery) =>
  query.zone("battlefield").objectIds.map((id) => query.object(id));

export const hasKeyword = (
  query: RulesQuery,
  object: GameObject,
  keyword: string,
) =>
  query
    .effective(object)
    .keywords?.some((k) => k.toLowerCase() === keyword.toLowerCase()) ?? false;

/** A creature's toughness, when it is a whole number. */
export function toughness(query: RulesQuery, object: GameObject) {
  const effective = query.effective(object);
  if (!effective.types?.includes("Creature")) return undefined;
  return /^-?\d+$/.test(effective.toughness ?? "")
    ? BigInt(effective.toughness!)
    : undefined;
}
