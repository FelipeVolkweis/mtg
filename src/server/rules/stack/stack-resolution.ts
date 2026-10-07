import type { GameObject, MatchAction } from "../../../shared/model.js";
import { Resolution } from "../../match/resolution.js";
import type { RulesEngine } from "../../match/rules-engine.js";
import {
  effectsOf,
  enchantFilter,
  interveningIf,
  isDiesTrigger,
  targetFilter,
} from "../abilities.js";
import type { VMResult } from "../vm/rule-vm.js";

// Stack Resolution Runtime (rules-engine-refactor.md §28–30): the CR 608
// envelope around the top object of the Stack. It checks an intervening-if,
// revalidates targets, and sends the object down one of two paths: a
// permanent spell enters the Battlefield (no effect program), and an instant,
// sorcery or ability runs its instructions through the Rule VM. Then the
// Stack is cleaned up and the game proceeds toward Priority.

export type ResolutionPath = "fizzle" | "permanent" | "program";

export class StackResolutionRuntime {
  constructor(readonly engine: RulesEngine) {}

  /** Resolves the top object of the Stack. */
  resolve() {
    const engine = this.engine;
    const object = engine.object(engine.zone("stack").objectIds.at(-1)!);
    const path = this.path(object);
    if (path === "fizzle") {
      engine.toGraveyard(object);
      engine.checkpoint();
      return;
    }
    delete engine.match.priority;
    if (path === "permanent") {
      this.resolvePermanent(object);
      engine.checkpoint();
      return;
    }
    this.after(
      new Resolution(engine).start(
        object,
        effectsOf(object.resolution?.ability),
      ),
    );
  }

  /** Answers the resolving program's waiting instruction. */
  answer(action: Extract<MatchAction, { type: "rules-input" }>) {
    this.after(new Resolution(this.engine).answer(action));
  }

  /**
   * Which path a Stack object takes: it fails to resolve when its
   * intervening-if is false or every target became illegal (CR 603.4,
   * 608.2b); otherwise a permanent spell enters, and anything else runs its
   * program.
   */
  path(object: GameObject): ResolutionPath {
    if (!this.interveningHolds(object) || !this.someTargetLegal(object))
      return "fizzle";
    return this.isPermanentSpell(object) ? "permanent" : "program";
  }

  /** CR 603.4: a triggered ability's intervening-if is checked again. */
  interveningHolds(object: GameObject) {
    const condition = interveningIf(object.resolution?.ability);
    return (
      !condition ||
      this.engine.conditionSatisfied(
        condition,
        object.controllerId,
        object.sourceObjectId ?? object.id,
      )
    );
  }

  /** CR 608.2b: an object with targets resolves if any target is still legal. */
  someTargetLegal(object: GameObject) {
    const engine = this.engine;
    const resolution = object.resolution;
    const filter = targetFilter(resolution?.ability);
    if (!resolution || !filter) return true;
    const sourceId = isDiesTrigger(resolution.ability)
      ? resolution.event?.affectedId
      : (object.sourceObjectId ?? object.id);
    return resolution.targetIds.some(
      (id) =>
        engine.match.objects[id] &&
        engine.targetEligible(
          engine.match.objects[id],
          filter,
          object.controllerId,
          sourceId,
        ),
    );
  }

  isPermanentSpell(object: GameObject) {
    return (
      object.kind === "card" &&
      !object.characteristics.types?.some(
        (type) => type === "Instant" || type === "Sorcery",
      )
    );
  }

  /** CR 608.3: a permanent spell becomes a permanent; an Aura attaches. */
  resolvePermanent(object: GameObject) {
    const engine = this.engine;
    const targets = object.resolution?.targetIds ?? [];
    const permanent = engine.propose({
      kind: "zone-change",
      objectId: object.id,
      to: engine.zone("battlefield"),
    }).object!;
    if (enchantFilter(engine.definition(permanent)?.abilities ?? []))
      permanent.attachmentTo = targets[0];
  }

  /** CR 608.2n: a resolved instruction program's object leaves the Stack. */
  private after(result: VMResult) {
    if (result.kind === "suspend") return;
    const engine = this.engine;
    const object = engine.object(engine.rules.resolving!.stackObjectId);
    delete engine.rules.resolving;
    delete engine.rules.pending;
    engine.toGraveyard(object);
    engine.checkpoint();
  }
}
