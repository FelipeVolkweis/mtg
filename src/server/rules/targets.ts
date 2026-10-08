import type { MatchAction } from "../../shared/rules-state.js";
import type { Ability } from "../../shared/card-dsl.js";
import type { RulesEngine } from "../match/rules-engine.js";
import { clauseRange, targetClauses } from "./abilities.js";
import { RuleViolation } from "./rule-violation.js";

// Choosing targets (CR 115, 601.2c, 603.3d): one list of chosen objects for
// each target clause of an ability. Casting a spell, activating an ability and
// putting a triggered ability on the Stack share the validation.

type RulesInput = Extract<MatchAction, { type: "rules-input" }>;

/**
 * The targets an answer chooses, by target clause id: each clause takes as
 * many distinct legal targets as it allows. An answer for an ability with one
 * clause may name its targets as `targetIds`.
 */
export function chosenTargets(
  engine: RulesEngine,
  input: RulesInput,
  ability: Ability | undefined,
  playerId: string,
  sourceId: string | undefined,
  selfId: string | undefined,
  noun = "target",
): Record<string, string[]> {
  const clauses = targetClauses(ability);
  const named =
    input.targets ??
    (clauses.length === 1 && input.targetIds
      ? { [clauses[0].id]: input.targetIds }
      : undefined);
  if (
    !named ||
    Object.keys(named).some((id) => !clauses.some((c) => c.id === id))
  )
    throw new RuleViolation("Choose targets for each target clause.");
  return Object.fromEntries(
    clauses.map((clause) => {
      const ids = named[clause.id] ?? [];
      const { min, max } = clauseRange(clause);
      const legal = engine.legalTargets(
        playerId,
        clause.filter,
        sourceId,
        selfId,
      );
      if (
        ids.length < min ||
        ids.length > max ||
        new Set(ids).size !== ids.length ||
        ids.some((id) => !legal.includes(id))
      )
        throw new RuleViolation(
          min === max && min === 1
            ? `Choose one legal ${noun}.`
            : `Choose ${min === max ? min : `${min} to ${max}`} distinct legal ${noun}s.`,
        );
      return [clause.id, ids];
    }),
  );
}

/** Every chosen target, in target clause order. */
export const flatTargets = (targets: Record<string, string[]>) =>
  Object.values(targets).flat();
