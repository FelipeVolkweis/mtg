import type { EffectContext, RulesInput } from "./types.js";
import { RuleViolation } from "../../rule-violation.js";

/**
 * The objects a player chose in answer to a one-option prompt, checked
 * against the option: legal key, permitted quantity, distinct, eligible.
 */
export function selection(ctx: EffectContext, input: RulesInput) {
  const options = ctx.options;
  const entries = Object.entries(input.selections ?? {});
  if (entries.some(([key]) => !options[key]) || entries.length > 1)
    throw new RuleViolation("Choose a legal option.");
  const key = Object.keys(options)[0];
  const ids = input.selections?.[key] ?? [];
  const option = options[key];
  if (
    ids.length < (option.minCount ?? option.count) ||
    ids.length > option.count ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !option.objectIds.includes(id))
  )
    throw new RuleViolation(
      "Choose eligible, distinct objects in the permitted quantity.",
    );
  return { key, ids };
}

/** Player-owned Zones of a kind are the object's owner's (CR 400.3). */
export const ownedZones = new Set(["hand", "library", "graveyard"]);
