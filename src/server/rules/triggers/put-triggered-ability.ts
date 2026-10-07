import { randomUUID } from "node:crypto";
import type { MatchAction } from "../../../shared/model.js";
import type { WaitingTrigger } from "../../../shared/rules.js";
import { gameObject } from "../../match/game-objects.js";
import type { RulesEngine } from "../../match/rules-engine.js";
import { isDiesTrigger, targetFilter } from "../abilities.js";

// PutTriggeredAbilityOnStackProcedure (rules-engine-refactor.md §45): a
// waiting trigger becomes an Ability Game Object on the Stack, and its
// controller chooses its targets. A triggered ability isn't cast, so it pays
// no costs. Modes and divisions aren't supported by any triggered ability the
// runtime runs yet.

export class PutTriggeredAbilityOnStackProcedure {
  constructor(readonly engine: RulesEngine) {}

  /**
   * Puts the trigger on the Stack; a target choice leaves a pending
   * procedure. A trigger with no legal target is removed (CR 603.3d).
   */
  start(trigger: WaitingTrigger) {
    const engine = this.engine;
    const target = targetFilter(trigger.ability);
    if (
      target &&
      !engine.legalTargets(
        trigger.playerId,
        target,
        isDiesTrigger(trigger.ability)
          ? trigger.event.affectedId
          : trigger.sourceId,
      ).length
    )
      return;
    const object = gameObject(
      "ability",
      engine.zone("stack").id,
      trigger.playerId,
      trigger.playerId,
      {
        name: `${trigger.sourceName}: ${trigger.abilityId}`,
        colors: [],
        typeLine: "Triggered Ability",
        rulesText: "",
      },
    );
    object.sourceObjectId = trigger.sourceId;
    object.sourceAbilityId = trigger.abilityId;
    object.resolution = {
      sourceSnapshot: trigger.sourceSnapshot,
      ability: trigger.ability,
      event: structuredClone(trigger.event),
      targetIds: [],
    };
    engine.propose({ kind: "create", object, zone: engine.zone("stack") });
    if (!target) return;
    engine.rules.pending = {
      id: randomUUID(),
      playerId: trigger.playerId,
      kind: "trigger-target",
      stage: "targets",
      sourceId: object.id,
      ability: trigger.ability,
      targetIds: [],
      selections: {},
      totalCost: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, generic: 0 },
    };
    delete engine.match.priority;
  }

  /** Records the chosen target; becoming a target may trigger (next batch). */
  answer(action: Extract<MatchAction, { type: "rules-input" }>) {
    const engine = this.engine;
    const pending = engine.rules.pending!;
    const object = engine.object(pending.sourceId!);
    const ids = action.targetIds ?? [];
    if (
      ids.length !== 1 ||
      !engine
        .legalTargets(
          pending.playerId,
          targetFilter(pending.ability)!,
          engine.targetSource(pending),
        )
        .includes(ids[0])
    )
      throw new Error("Choose one legal trigger target.");
    object.resolution!.targetIds = ids;
    engine.targeted(object);
    delete engine.rules.pending;
  }
}
