import type { PendingProcedure } from "../../../shared/rules-state.js";
import { CharacteristicsCalculator } from "../../match/characteristics.js";
import { Combat } from "../../match/combat.js";
import { cancelStatCounters } from "../../match/counters.js";
import type { RulesEngine } from "../../match/rules-engine.js";
import { budget } from "../loop-budget.js";
import { LoopDetector } from "../mandatory-loop.js";
import { stateBasedRule, stateBasedRules } from "./registry.js";
import type { RulesInput, StateBasedChange } from "./types.js";

// State-Based Action Runtime (CR 704). A check
// evaluates every State-Based Rule against the same game state and performs
// all their changes together as one event, then checks again. Choices come
// once no automatic action is left: the state a player chooses in is stable.

export type CheckResult =
  | { kind: "stable"; performed: boolean }
  /** A rule's choice procedure is pending. */
  | { kind: "suspended"; performed: boolean };

export class StateBasedRuntime {
  constructor(readonly engine: RulesEngine) {}

  /** Checks state-based actions until none applies, or a choice is needed. */
  check(): CheckResult {
    const engine = this.engine;
    let performed = false;
    let choice: { rule: string; procedure: PendingProcedure } | undefined;
    const loop = new LoopDetector("State-based action check");
    for (let pass = 1; ; pass++) {
      budget("State-based action check", pass, 1000);
      loop.visit(engine.match);
      const found: StateBasedChange[] = [];
      choice = undefined;
      for (const rule of stateBasedRules()) {
        const result = rule.evaluate(engine.query);
        if (result.kind === "changes") found.push(...result.changes);
        else if (result.kind === "choice")
          choice ??= { rule: rule.id, procedure: result.procedure };
      }
      if (!found.length) break;
      this.perform(found);
      performed = true;
    }
    this.settle();
    if (this.gameOver()) return { kind: "stable", performed };
    if (choice) {
      engine.rules.pending = {
        ...choice.procedure,
        stateBasedRule: choice.rule,
      };
      delete engine.match.priority;
      return { kind: "suspended", performed };
    }
    for (const rule of stateBasedRules()) rule.stable?.(engine);
    return { kind: "stable", performed };
  }

  /** Answers a state-based choice; returns whether an action was performed. */
  answer(input: RulesInput) {
    const pending = this.engine.rules.pending!;
    const performed = stateBasedRule(pending.stateBasedRule!).answer!(
      this.engine,
      pending,
      input,
    );
    delete this.engine.rules.pending;
    return performed;
  }

  /**
   * Performs one check's changes simultaneously (CR 704.3): every leaving
   * permanent sees the same Battlefield and its own characteristics as they
   * were before any of them moved.
   */
  perform(changes: StateBasedChange[]) {
    const engine = this.engine;
    const sources = structuredClone(engine.battlefieldSources());
    const before = new Map(
      changes
        .filter((c) => c.kind === "graveyard")
        .map((c) => [c.objectId, engine.effective(engine.object(c.objectId))]),
    );
    const moved = new Set<string>();
    for (const change of changes) {
      if (change.kind === "lose") {
        engine.match.players.find((p) => p.id === change.playerId)!.outcome =
          "lost";
        continue;
      }
      const object = engine.match.objects[change.objectId];
      if (!object || moved.has(object.id)) continue;
      if (change.kind === "graveyard") {
        moved.add(object.id);
        engine.propose({
          kind: "zone-change",
          objectId: object.id,
          to: engine.zone("graveyard", object.ownerId),
          simultaneous: { sources, before: before.get(object.id) },
        });
      } else if (change.kind === "unattach") object.attachmentTo = null;
      else if (change.kind === "cease") {
        moved.add(object.id);
        engine.propose({ kind: "cease", objectId: object.id });
      } else {
        cancelStatCounters(object, change.amount);
      }
    }
  }

  /** Bookkeeping after a check, and the end of the game (CR 104.2a). */
  private settle() {
    const engine = this.engine;
    if (this.gameOver()) return;
    new Combat(engine).prune();
    engine.rules.continuousEffects = new CharacteristicsCalculator(
      engine.match,
      engine.catalog,
    ).active();
    engine.rules.failedDrawPlayerIds = [];
    const alive = engine.match.players.filter((p) => p.outcome === "playing");
    if (alive.length >= 2) return;
    delete engine.match.priority;
    delete engine.rules.pending;
    delete engine.rules.resolving;
    delete engine.rules.waitingTriggers;
    delete engine.rules.triggerPlacement;
    delete engine.rules.checkpoint;
    if (alive.length) {
      alive[0].outcome = "won";
      engine.match.outcome = "complete";
    } else engine.match.outcome = "draw";
  }

  private gameOver() {
    return this.engine.match.outcome !== "ongoing";
  }
}
