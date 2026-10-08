import { randomUUID } from "node:crypto";
import type {
  GameObject,
  MatchAction,
  WaitingTrigger,
} from "../../../shared/rules-state.js";
import { gameObject } from "../../match/game-objects.js";
import type { RulesEngine } from "../../match/rules-engine.js";
import {
  flattenModes,
  isDiesTrigger,
  modeRange,
  modesOf,
  targetClauses,
} from "../abilities.js";
import { chosenTargets, flatTargets } from "../targets.js";
import { RuleViolation } from "../rule-violation.js";

// PutTriggeredAbilityOnStackProcedure (CR 603.3): a
// waiting trigger becomes an Ability Game Object on the Stack, and its
// controller chooses its modes (CR 700.2b) and targets. A triggered ability
// isn't cast, so it pays no costs. Divisions aren't supported by any
// triggered ability the runtime runs yet.

export class PutTriggeredAbilityOnStackProcedure {
  constructor(readonly engine: RulesEngine) {}

  /** The source whose ability's filters are read: a "dies" trigger's dead object. */
  private sourceOf(trigger: WaitingTrigger) {
    const sourceId =
      trigger.source.kind === "object" ? trigger.source.id : undefined;
    return isDiesTrigger(trigger.ability) ? trigger.event.affectedId : sourceId;
  }

  /**
   * Puts the trigger on the Stack; a mode or target choice leaves a pending
   * procedure. A trigger with no legal target is removed (CR 603.3d).
   */
  start(trigger: WaitingTrigger) {
    const engine = this.engine;
    const sourceId =
      trigger.source.kind === "object" ? trigger.source.id : undefined;
    const modal = !!modesOf(trigger.ability);
    if (
      !modal &&
      !engine.targetsAvailable(
        trigger.playerId,
        trigger.ability,
        this.sourceOf(trigger),
      )
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
    // A designation's trigger has no source object.
    if (sourceId) object.sourceObjectId = sourceId;
    object.sourceAbilityId = trigger.abilityId;
    object.resolution = {
      sourceSnapshot: trigger.sourceSnapshot,
      ability: trigger.ability,
      event: structuredClone(trigger.event),
      targetIds: [],
    };
    engine.propose({ kind: "create", object, zone: engine.zone("stack") });
    if (modal) {
      this.ask(object, "modes");
      return;
    }
    if (targetClauses(trigger.ability).length) this.ask(object, "targets");
  }

  /** A pending choice for the trigger on the Stack. */
  private ask(object: GameObject, stage: "modes" | "targets") {
    const engine = this.engine;
    engine.rules.pending = {
      id: randomUUID(),
      playerId: object.controllerId,
      kind: "trigger-target",
      stage,
      sourceId: object.id,
      ability: object.resolution!.ability,
      targetIds: [],
      selections: {},
      totalCost: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, generic: 0 },
    };
    delete engine.match.priority;
  }

  /**
   * Records the chosen modes or targets; becoming a target may trigger (next
   * batch).
   */
  answer(action: Extract<MatchAction, { type: "rules-input" }>) {
    const engine = this.engine;
    const pending = engine.rules.pending!;
    const object = engine.object(pending.sourceId!);
    if (pending.stage === "modes") {
      this.chooseModes(object, action);
      return;
    }
    const chosen = chosenTargets(
      engine,
      action,
      pending.ability,
      pending.playerId,
      engine.targetSource(pending),
      undefined,
      "trigger target",
    );
    object.resolution!.targets = chosen;
    object.resolution!.targetIds = flatTargets(chosen);
    engine.targeted(object);
    delete engine.rules.pending;
  }

  /** CR 700.2b: the modes are chosen as the trigger is put on the Stack. */
  private chooseModes(
    object: GameObject,
    action: Extract<MatchAction, { type: "rules-input" }>,
  ) {
    const engine = this.engine;
    const pending = engine.rules.pending!;
    const modes = modesOf(pending.ability)!;
    const ids = action.modes ?? [];
    const { min, max } = modeRange(modes);
    if (
      ids.length < min ||
      ids.length > max ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !modes.options.some((option) => option.id === id))
    )
      throw new RuleViolation(
        `Choose ${min === max ? min : `${min} to ${max}`} distinct modes.`,
      );
    const ability = flattenModes(pending.ability!, ids);
    object.resolution!.ability = ability;
    delete engine.rules.pending;
    // CR 603.3d: a trigger whose chosen modes have no legal targets is removed.
    if (
      !engine.targetsAvailable(
        object.controllerId,
        ability,
        object.resolution!.event && isDiesTrigger(ability)
          ? object.resolution!.event.affectedId
          : object.sourceObjectId,
        object.id,
      )
    ) {
      engine.propose({ kind: "cease", objectId: object.id });
      return;
    }
    if (targetClauses(ability).length) this.ask(object, "targets");
  }
}
