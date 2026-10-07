import type { MatchAction } from "../../../shared/model.js";
import type { PendingProcedure } from "../../../shared/rules.js";
import type { RulesMutator, RulesQuery } from "../context.js";

// State-Based Rule contract (rules-engine-refactor.md §46–48). Each
// state-based action is a rule object that reads the whole game state and
// reports what it would do; the State-Based Action Runtime performs every
// rule's changes together.

/** One state-based action's effect, as data, performed with the others. */
export type StateBasedChange =
  /** A permanent goes to its owner's Graveyard. */
  | { kind: "graveyard"; objectId: string }
  /** An Equipment becomes unattached and stays on the Battlefield. */
  | { kind: "unattach"; objectId: string }
  /** A token outside the Battlefield ceases to exist. */
  | { kind: "cease"; objectId: string }
  /** The same number of +1/+1 and -1/-1 counters is removed. */
  | { kind: "cancel-counters"; objectId: string; amount: string }
  /** A player loses the game. */
  | { kind: "lose"; playerId: string };

export type StateBasedResult =
  | { kind: "none" }
  | { kind: "changes"; changes: StateBasedChange[] }
  /** A player must choose; the checkpoint suspends on this procedure (§47). */
  | { kind: "choice"; procedure: PendingProcedure };

export type RulesInput = Extract<MatchAction, { type: "rules-input" }>;

export interface StateBasedRule {
  /** Stored on a choice procedure, so a restored Match finds its rule. */
  readonly id: string;
  evaluate(query: RulesQuery): StateBasedResult;
  /**
   * Answers this rule's choice procedure; returns whether a state-based
   * action was performed.
   */
  answer?(ctx: RulesMutator, pending: PendingProcedure, input: RulesInput): boolean;
  /** Bookkeeping once a check finds nothing left to do. */
  stable?(ctx: RulesMutator): void;
}

export const none: StateBasedResult = { kind: "none" };

/** A rule's changes, or nothing. */
export const changes = (list: StateBasedChange[]): StateBasedResult =>
  list.length ? { kind: "changes", changes: list } : none;
