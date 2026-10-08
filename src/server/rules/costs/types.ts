import type {
  GameObject,
  SelectionOption,
} from "../../../shared/rules-state.js";
import type { Cost } from "../../../shared/card-dsl.js";
import type { RulesEngine } from "../../match/rules-engine.js";
import type { SupportCheck } from "../support-check.js";

// Cost Runtime types (CR 601.2f–h). A cost is fully
// payable or not paid at all: handlers plan data, and nothing changes until
// every component is planned.

/** What a cost is paid for: casting a spell or activating an ability. */
export type CostUse = "cast" | "activate";

export interface CostContext {
  readonly engine: RulesEngine;
  readonly playerId: string;
  /** The spell being cast, or the activated ability's source. */
  readonly source: GameObject;
  /** The player's chosen objects, by cost component index. */
  readonly selections: Record<string, string[]>;
  readonly use: CostUse;
}

/** One change a planned cost component makes when the payment commits. */
export type CostMutation =
  | { kind: "tap"; objectId: string }
  | { kind: "untap"; objectId: string }
  | { kind: "move"; objectId: string; to: "graveyard" | "hand" | "exile" }
  | { kind: "pay-life"; amount: number }
  | { kind: "counters"; objectId: string; counter: string; delta: number };

/** A planned component, or one still waiting for the player's selections. */
export type ComponentPlan =
  { kind: "planned"; mutations: CostMutation[] } | { kind: "incomplete" };

export interface CostHandler<C extends Cost = Cost> {
  /**
   * Validates the component against the current state and the player's
   * selections and returns its mutations. Throws when the selection is
   * illegal; reports `incomplete` when selections are still missing.
   */
  plan(cost: C, key: string, ctx: CostContext): ComponentPlan;
  /** The objects the player may choose for this component. */
  options?(cost: C, ctx: CostContext): SelectionOption;
  /** Rejects the forms of this cost the runtime doesn't support. */
  support(cost: C, check: SupportCheck): void;
}

/**
 * A complete payment: every component's mutations, in a rules-valid order.
 * Player-chosen payment order (CR 601.2h) isn't supported, so the order is
 * forced.
 */
export interface CostPlan {
  components: CostMutation[][];
  ordering: "player-choice" | "rules-forced";
}
