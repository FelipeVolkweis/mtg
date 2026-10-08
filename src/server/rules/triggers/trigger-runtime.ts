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
  type PredicateFields,
  type Selector,
  type Trigger,
  turnSteps,
  type Value,
} from "../../../shared/card-dsl.js";
import type { RulesEngine } from "../../match/rules-engine.js";
import { interveningIf, production, triggerSubject } from "../abilities.js";
import { isSourcePredicate } from "../ast.js";
import type { Registry, SupportCheck } from "../support-check.js";
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

type AnyTrigger = Trigger | ManaTrigger;
type TriggerOf<E extends AnyTrigger["event"]> = Extract<
  AnyTrigger,
  { event: E }
>;

/**
 * How the runtime runs one trigger event, and which of its forms it supports.
 * `matches` says whether a semantic event is the kind the trigger waits for,
 * before its subject filter and intervening-if; `stepIndex` is the current
 * turn step. `subject` is what the event's object must be (CR 603.2).
 */
export interface TriggerHandler<E extends AnyTrigger["event"]> {
  matches(
    trigger: TriggerOf<E>,
    event: SemanticEvent,
    controllerId: string,
    stepIndex: number,
  ): boolean;
  subject?(trigger: TriggerOf<E>): Predicate | undefined;
  /** Rejects the forms of this trigger the runtime can't run. */
  support(trigger: TriggerOf<E>, check: SupportCheck): void;
}

const during = (step: string | undefined, stepIndex: number) =>
  step === undefined || turnSteps.indexOf(step as never) === stepIndex;

/** The players a supported trigger can name: you or your opponents. */
function supportedPlayer(ref: PlayerRef, check: SupportCheck) {
  if (ref !== "you" && ref !== "opponents")
    check.unsupported(`Trigger player ${JSON.stringify(ref)}`);
}

/** A trigger subject: the source on the Battlefield, or a supported filter. */
function supportedSubject(object: Selector | Predicate, check: SupportCheck) {
  if (!isSourcePredicate(object)) check.filter(object as Predicate);
}

/**
 * `enters` and `dies` are authored shorthand: the compiler lowers both to
 * `zone-change`, so a Core ability never holds them.
 */
const lowered = {
  subject: (trigger: { object: Selector | Predicate }) =>
    triggerSubject(trigger.object),
  support: (trigger: { event: string }, check: SupportCheck) =>
    check.unsupported(`The ${trigger.event} trigger`),
};

/**
 * Trigger Handler Registry: one handler per trigger event the runtime
 * observes. An event without a handler never triggers, and the support check
 * rejects it.
 */
const triggerHandlers: { [E in AnyTrigger["event"]]?: TriggerHandler<E> } = {
  "zone-change": {
    matches(trigger, event, _controllerId, stepIndex) {
      if (trigger.to === "battlefield" && !trigger.from)
        return event.kind === "enter" && during(trigger.during, stepIndex);
      return (
        event.kind === "zone-change" &&
        (!trigger.from || event.from === trigger.from) &&
        (!trigger.to || event.to === trigger.to) &&
        during(trigger.during, stepIndex)
      );
    },
    subject: (trigger) => triggerSubject(trigger.object),
    support(trigger, check) {
      check.at("object", () => supportedSubject(trigger.object, check));
      if (trigger.to === "battlefield" && !trigger.from) return;
      if (
        trigger.from === "battlefield" &&
        trigger.to === "graveyard" &&
        !trigger.during
      )
        return;
      check.unsupported(`A zone change from ${trigger.from} to ${trigger.to}`);
    },
  },
  enters: {
    matches: (trigger, event, _controllerId, stepIndex) =>
      event.kind === "enter" && during(trigger.during, stepIndex),
    ...lowered,
  },
  dies: {
    matches: (_trigger, event) =>
      event.kind === "zone-change" &&
      event.from === "battlefield" &&
      event.to === "graveyard",
    ...lowered,
  },
  cast: {
    matches: (trigger, event, controllerId) =>
      event.kind === "cast" &&
      playerMatches(
        trigger.caster,
        event.playerId ?? event.controllerId,
        controllerId,
      ),
    subject: (trigger) => trigger.spell,
    support(trigger, check) {
      if (trigger.caster) check.unsupported("A cast trigger with a caster");
      check.at("spell", () => check.filter(trigger.spell));
    },
  },
  attacks: {
    matches: (_trigger, event) => event.kind === "attack",
    subject: (trigger) => triggerSubject(trigger.attacker),
    support: (trigger, check) =>
      check.at("attacker", () => supportedSubject(trigger.attacker, check)),
  },
  "deals-damage": {
    matches: (trigger, event) =>
      event.kind === "damage" &&
      (trigger.combat === undefined ||
        event.damage?.combat === trigger.combat) &&
      (typeof trigger.to !== "string" ||
        event.damage?.recipientKind === trigger.to),
    subject: (trigger) => triggerSubject(trigger.source),
    support(trigger, check) {
      if (trigger.to && typeof trigger.to === "object")
        check.unsupported("A damage trigger with a recipient predicate");
      check.at("source", () => supportedSubject(trigger.source, check));
    },
  },
  draws: {
    matches: (trigger, event, controllerId) =>
      event.kind === "draw" &&
      playerMatches(trigger.player, event.playerId, controllerId) &&
      (trigger.nth === undefined || trigger.nth === event.ordinal),
    support: (trigger, check) => supportedPlayer(trigger.player, check),
  },
  step: {
    // Only the upkeep is observed as an event; the monarch's end step
    // trigger is the designation's own (RulesEngine.monarchTrigger).
    matches: (trigger, event, controllerId) =>
      event.kind === "upkeep" &&
      trigger.step === "upkeep" &&
      playerMatches(trigger.player, event.playerId, controllerId),
    support(trigger, check) {
      if (trigger.step !== "upkeep")
        check.unsupported(`A ${trigger.step} step trigger`);
      if (trigger.player === "next")
        check.unsupported("A next-player step trigger");
      if (trigger.player) supportedPlayer(trigger.player as PlayerRef, check);
    },
  },
  "becomes-target": {
    matches: (trigger, event, controllerId) =>
      event.kind === "target" &&
      playerMatches(trigger.by, event.playerId, controllerId),
    subject: (trigger) => triggerSubject(trigger.object),
    support(trigger, check) {
      check.at("object", () => supportedSubject(trigger.object, check));
      if (trigger.by) supportedPlayer(trigger.by, check);
    },
  },
  // A state trigger watches the game state, not events
  // (StateTriggerObserver below).
  state: {
    matches: () => false,
    support(trigger, check) {
      const c = trigger.condition;
      if ("matches" in c && c.matches.selector === "source") {
        const p = c.matches.predicate as PredicateFields;
        const count = p.counters?.count as { ">="?: Value } | undefined;
        if (Object.keys(p).length === 1 && typeof count?.[">="] === "number")
          return;
      }
      check.unsupported(
        "A state trigger other than a source counter threshold",
      );
    },
  },
  "tapped-for-mana": {
    matches: (_trigger, event) => event.kind === "mana",
    subject: (trigger) => trigger.object,
    support(trigger, check) {
      if (trigger.produced) check.unsupported("A produced-mana trigger filter");
      check.at("object", () => check.filter(trigger.object));
    },
  },
};

function triggerHandler<E extends AnyTrigger["event"]>(
  trigger: TriggerOf<E>,
): TriggerHandler<E> | undefined {
  return triggerHandlers[trigger.event];
}

/** The trigger events the runtime observes, each with its support declaration. */
export const triggerRegistry: Registry = triggerHandlers;

/** Rejects a trigger the runtime can't run (for the support check). */
export function triggerSupport(trigger: AnyTrigger, check: SupportCheck) {
  const handler = triggerHandler(trigger);
  if (!handler) return check.unsupported(`The ${trigger.event} trigger`);
  handler.support(trigger, check);
}

/**
 * Whether a semantic event is the kind a trigger waits for, before its
 * subject filter and intervening-if. `stepIndex` is the current turn step.
 */
export function eventMatches(
  trigger: AnyTrigger,
  event: SemanticEvent,
  controllerId: string,
  stepIndex: number,
): boolean {
  return (
    triggerHandler(trigger)?.matches(trigger, event, controllerId, stepIndex) ??
    false
  );
}

/** What the event's object must be: the trigger's subject (CR 603.2). */
export function eventSubject(trigger: AnyTrigger): Predicate | undefined {
  return triggerHandler(trigger)?.subject?.(trigger);
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
