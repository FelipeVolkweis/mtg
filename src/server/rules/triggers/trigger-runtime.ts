import { randomUUID } from "node:crypto";
import type {
  GameObject,
  SemanticEvent,
  WaitingTrigger,
} from "../../../shared/rules-state.js";
import {
  type Ability,
  type ManaTrigger,
  type PlayerRef,
  type Predicate,
  type Trigger,
  turnSteps,
} from "../../../shared/card-dsl.js";
import type { RulesEngine } from "../../match/rules-engine.js";
import { interveningIf, production, triggerSubject } from "../abilities.js";
import { Evaluator } from "../vm/evaluate.js";

// Trigger Runtime (rules-engine-refactor.md §43). Event triggers match a
// source's Core trigger against each semantic event; state triggers watch for
// a condition becoming true. Either way a triggered ability becomes a waiting
// trigger: it goes on the Stack at the next Priority Checkpoint.

/** A trigger condition's player reference, against the event's player. */
function playerMatches(
  ref: PlayerRef | "next" | undefined,
  playerId: string | undefined,
  controllerId: string,
) {
  if (ref === undefined) return true;
  if (ref === "you") return playerId === controllerId;
  // "opponents" is the only other reference the runtime supports.
  return !!playerId && playerId !== controllerId;
}

/**
 * Whether a semantic event is the kind a trigger waits for, before its
 * subject filter and intervening-if. `stepIndex` is the current turn step.
 */
export function eventMatches(
  trigger: Trigger | ManaTrigger,
  event: SemanticEvent,
  controllerId: string,
  stepIndex: number,
): boolean {
  const during = (step?: string) =>
    step === undefined || turnSteps.indexOf(step as never) === stepIndex;
  switch (trigger.event) {
    case "zone-change":
      if (trigger.to === "battlefield" && !trigger.from)
        return event.kind === "enter" && during(trigger.during);
      return (
        event.kind === "zone-change" &&
        (!trigger.from || event.from === trigger.from) &&
        (!trigger.to || event.to === trigger.to) &&
        during(trigger.during)
      );
    case "enters":
      return event.kind === "enter" && during(trigger.during);
    case "dies":
      return (
        event.kind === "zone-change" &&
        event.from === "battlefield" &&
        event.to === "graveyard"
      );
    case "cast":
      return (
        event.kind === "cast" &&
        playerMatches(
          trigger.caster,
          event.playerId ?? event.controllerId,
          controllerId,
        )
      );
    case "attacks":
      return event.kind === "attack";
    case "deals-damage":
      return (
        event.kind === "damage" &&
        (trigger.combat === undefined ||
          event.damage?.combat === trigger.combat) &&
        (typeof trigger.to !== "string" ||
          event.damage?.recipientKind === trigger.to)
      );
    case "draws":
      return (
        event.kind === "draw" &&
        playerMatches(trigger.player, event.playerId, controllerId) &&
        (trigger.nth === undefined || trigger.nth === event.ordinal)
      );
    case "step":
      // Only the upkeep is observed as an event; the monarch's end step
      // trigger is the designation's own (RulesEngine.monarchTrigger).
      return (
        event.kind === "upkeep" &&
        trigger.step === "upkeep" &&
        playerMatches(trigger.player, event.playerId, controllerId)
      );
    case "becomes-target":
      return (
        event.kind === "target" &&
        playerMatches(trigger.by, event.playerId, controllerId)
      );
    case "tapped-for-mana":
      return event.kind === "mana";
    case "gains-life":
    case "loses-life":
    case "state":
      // Life changes aren't observed yet; state triggers aren't events.
      return false;
  }
}

/** What the event's object must be: the trigger's subject (CR 603.2). */
export function eventSubject(
  trigger: Trigger | ManaTrigger,
): Predicate | undefined {
  switch (trigger.event) {
    case "zone-change":
    case "enters":
    case "dies":
    case "becomes-target":
      return triggerSubject(trigger.object);
    case "attacks":
      return triggerSubject(trigger.attacker);
    case "deals-damage":
      return triggerSubject(trigger.source);
    case "cast":
      return trigger.spell;
    case "tapped-for-mana":
      return trigger.object;
    default:
      return undefined;
  }
}

/** The trigger of a triggered or mana ability. */
export function triggerOf(ability: Ability): Trigger | ManaTrigger | undefined {
  if (ability.kind === "triggered") return ability.trigger;
  if (ability.kind === "mana" && "trigger" in ability.activation)
    return ability.activation.trigger;
  return undefined;
}

/** A triggered ability becomes a waiting trigger (CR 603.3). */
export function waitTrigger(
  engine: RulesEngine,
  trigger: Omit<WaitingTrigger, "id">,
) {
  engine.rules.waitingTriggers ??= [];
  engine.rules.waitingTriggers.push({ id: randomUUID(), ...trigger });
}

function waitFor(
  engine: RulesEngine,
  source: GameObject,
  ability: Ability,
  event: SemanticEvent,
) {
  waitTrigger(engine, {
    playerId: source.controllerId,
    sourceId: source.id,
    abilityId: ability.id,
    sourceName: source.characteristics.name,
    sourceSnapshot: {
      characteristics:
        source.id === event.sourceId
          ? (event.before ?? event.after)
          : engine.effective(source),
      ownerId: engine.owner(source),
    },
    ability: structuredClone(ability),
    event: structuredClone(event),
  });
}

export class EventTriggerObserver {
  constructor(readonly engine: RulesEngine) {}

  /**
   * Reports an event to the given trigger sources. `groups` collects "one or
   * more" damage triggers so each triggers once per recipient.
   */
  collect(
    event: SemanticEvent,
    affected: GameObject,
    sources: GameObject[],
    groups = new Set<string>(),
  ) {
    const engine = this.engine;
    for (const source of sources) {
      for (const ability of engine.definition(source)?.abilities ?? []) {
        const trigger = triggerOf(ability);
        if (
          !trigger ||
          !eventMatches(
            trigger,
            event,
            source.controllerId,
            engine.match.turn.stepIndex,
          ) ||
          !this.subjectMatches(trigger, event, affected, source) ||
          !this.interveningHolds(ability, source)
        )
          continue;
        if (trigger.event === "deals-damage" && trigger.batch) {
          const key = `${source.id}:${ability.id}:${event.damage?.recipientId}`;
          if (groups.has(key)) continue;
          groups.add(key);
        }
        // CR 605.1b: a triggered mana ability resolves immediately.
        const produce = production(ability);
        if (produce) engine.produceMana(source.controllerId, produce);
        else waitFor(engine, source, ability, event);
      }
    }
  }

  /** The affected object as the event saw it (CR 603.10). */
  private subjectMatches(
    trigger: Trigger | ManaTrigger,
    event: SemanticEvent,
    affected: GameObject,
    source: GameObject,
  ) {
    const subject = eventSubject(trigger);
    if (!subject) return true;
    const engine = this.engine;
    return new Evaluator(
      {
        ...engine.query,
        effective: (o) =>
          o.id === affected.id
            ? (event.before ?? event.after)
            : engine.effective(o),
      },
      { playerId: source.controllerId, sourceId: source.id },
    ).matches(affected, subject);
  }

  /** CR 603.4: an intervening-if must be true when the event happens. */
  private interveningHolds(ability: Ability, source: GameObject) {
    const condition = interveningIf(ability);
    return (
      !condition ||
      this.engine.conditionSatisfied(condition, source.controllerId, source.id)
    );
  }
}

export class StateTriggerObserver {
  constructor(readonly engine: RulesEngine) {}

  /**
   * CR 603.8: a state trigger triggers once when its condition becomes true,
   * and again only after its ability has left the Stack.
   */
  collect() {
    const engine = this.engine;
    for (const source of engine.battlefieldSources()) {
      for (const ability of engine.definition(source)?.abilities ?? []) {
        if (ability.kind !== "triggered" || ability.trigger.event !== "state")
          continue;
        if (
          !engine.conditionSatisfied(
            ability.trigger.condition,
            source.controllerId,
            source.id,
          ) ||
          this.alreadyTriggered(source, ability)
        )
          continue;
        waitFor(engine, source, ability, {
          kind: "state",
          sourceId: source.id,
          affectedId: source.id,
          controllerId: source.controllerId,
          ownerId: engine.owner(source),
          after: engine.effective(source),
        });
      }
    }
  }

  private alreadyTriggered(source: GameObject, ability: Ability) {
    const engine = this.engine;
    const rules = engine.rules;
    return (
      [
        ...(rules.waitingTriggers ?? []),
        ...(rules.triggerPlacement ?? []),
      ].some((t) => t.sourceId === source.id && t.abilityId === ability.id) ||
      engine.zone("stack").objectIds.some((id) => {
        const object = engine.object(id);
        return (
          object.sourceObjectId === source.id &&
          object.sourceAbilityId === ability.id
        );
      })
    );
  }
}
