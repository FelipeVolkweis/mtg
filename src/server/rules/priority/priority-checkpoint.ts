import type { MatchAction } from "../../../shared/rules-state.js";
import type { RulesEngine } from "../../match/rules-engine.js";
import { budget } from "../loop-budget.js";
import { LoopDetector } from "../mandatory-loop.js";
import { StateBasedRuntime } from "../state-based/state-based-runtime.js";
import { PutTriggeredAbilityOnStackProcedure } from "../triggers/put-triggered-ability.js";
import { TriggerPlacement } from "../triggers/trigger-placement.js";
import { StateTriggerObserver } from "../triggers/trigger-runtime.js";

// Priority Checkpoint (rules-engine-refactor.md §11). Whenever a player would
// receive Priority, state-based actions are checked until none applies, then
// waiting triggers are put on the Stack, and both repeat until the game is
// stable; only then is Priority granted (CR 117.5). A choice suspends the
// checkpoint with its progress in `rules.checkpoint`, so a restored Match
// resumes the same checkpoint and never grants Priority midway (§47).

export type PriorityGrant =
  /** Priority for a player (the active player by default), keeping passes. */
  | { playerId?: string; passedPlayerIds?: string[] }
  /**
   * The end of the cleanup step: Priority only if a state-based action was
   * performed or a trigger waits, otherwise the next turn (CR 514.3a).
   */
  | { cleanup: true };

type RulesInput = Extract<MatchAction, { type: "rules-input" }>;

export class PriorityCheckpoint {
  constructor(readonly engine: RulesEngine) {}

  /** A player would receive Priority. */
  run(grant: PriorityGrant = {}) {
    this.engine.rules.checkpoint =
      "cleanup" in grant
        ? { cleanup: { performed: false } }
        : structuredClone(grant);
    this.resume();
  }

  /** Continues a checkpoint after a choice was answered. */
  resume() {
    const engine = this.engine;
    const rules = engine.rules;
    const loop = new LoopDetector("Priority checkpoint");
    for (let pass = 1; ; pass++) {
      budget("Priority checkpoint", pass, 1000);
      loop.visit(engine.match);
      const state = (rules.checkpoint ??= {});
      const check = new StateBasedRuntime(engine).check();
      if (engine.match.outcome !== "ongoing") return;
      if (state.cleanup && check.performed) state.cleanup.performed = true;
      if (check.kind === "suspended") return;
      new StateTriggerObserver(engine).collect();
      if (state.cleanup) {
        if (!state.cleanup.performed && !rules.waitingTriggers?.length) {
          delete rules.checkpoint;
          engine.nextTurn();
          return;
        }
        rules.checkpoint = {};
      }
      const placement = new TriggerPlacement(engine).place();
      if (placement === "suspended") return;
      if (placement === "idle") break;
    }
    const state = rules.checkpoint!;
    engine.match.priority = {
      playerId: state.playerId ?? engine.match.turn.activePlayerId,
      passedPlayerIds: state.passedPlayerIds ?? [],
    };
    delete rules.checkpoint;
  }

  /** Answers a state-based choice and resumes (§47). */
  answerStateBased(input: RulesInput) {
    const performed = new StateBasedRuntime(this.engine).answer(input);
    const cleanup = this.engine.rules.checkpoint?.cleanup;
    if (cleanup && performed) cleanup.performed = true;
    this.resume();
  }

  /** Answers a trigger-order choice and resumes placement. */
  answerTriggerOrder(input: RulesInput) {
    new TriggerPlacement(this.engine).answer(input);
    this.resume();
  }

  /** Answers a triggered ability's target choice and resumes placement. */
  answerTriggerTarget(input: RulesInput) {
    // Fix the current batch first: what the target choice triggers belongs to
    // the next one (a legacy document still keeps the batch as waiting).
    new TriggerPlacement(this.engine).batch();
    new PutTriggeredAbilityOnStackProcedure(this.engine).answer(input);
    this.resume();
  }
}
