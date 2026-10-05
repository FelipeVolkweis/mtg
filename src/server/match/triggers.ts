import { randomUUID } from "node:crypto";
import type { GameObject, MatchAction } from "../../shared/model.js";
import type {
  RulesAbility,
  SemanticEvent,
  WaitingTrigger,
} from "../../shared/rules.js";
import { matchesFilter } from "./characteristics.js";
import { gameObject } from "./game-objects.js";
import type { RulesEngine } from "./rules-engine.js";

export class Triggers {
  constructor(readonly engine: RulesEngine) {}
  stateSatisfied(
    source: GameObject,
    trigger: NonNullable<RulesAbility["trigger"]>,
  ) {
    return (
      !!trigger.counter &&
      !!trigger.atLeast &&
      BigInt(
        source.counters.find((c) => c.kind === trigger.counter)?.quantity ??
          "0",
      ) >= BigInt(trigger.atLeast)
    );
  }
  collectStates() {
    for (const source of this.engine.battlefieldSources()) {
      for (const ability of this.engine.definition(source)?.abilities ?? []) {
        const trigger = ability.rules?.trigger;
        if (
          ability.kind !== "triggered" ||
          trigger?.event !== "state" ||
          !trigger.counter ||
          !trigger.atLeast
        )
          continue;
        if (!this.stateSatisfied(source, trigger)) continue;
        const pending = this.engine.rules.waitingTriggers?.some(
          (t) => t.sourceId === source.id && t.abilityId === ability.id,
        );
        const stacked = this.engine.zone("stack").objectIds.some((id) => {
          const o = this.engine.object(id);
          return (
            o.sourceObjectId === source.id && o.sourceAbilityId === ability.id
          );
        });
        if (!pending && !stacked)
          this.collect(
            {
              kind: "state",
              sourceId: source.id,
              affectedId: source.id,
              controllerId: source.controllerId,
              ownerId: this.engine.owner(source),
              after: this.engine.effective(source),
            },
            source,
            [source],
          );
      }
    }
  }
  collect(event: SemanticEvent, affected: GameObject, sources: GameObject[]) {
    for (const source of sources) {
      for (const ability of this.engine.definition(source)?.abilities ?? []) {
        const trigger = ability.rules?.trigger;
        if (ability.kind !== "triggered" || !trigger) continue;
        const matchesEvent =
          trigger.event === "dies"
            ? event.kind === "zone-change" &&
              event.from === "battlefield" &&
              event.to === "graveyard"
            : trigger.event === event.kind;
        if (
          !matchesEvent ||
          (trigger.combat !== undefined &&
            event.damage?.combat !== trigger.combat) ||
          (trigger.recipientKind !== undefined &&
            event.damage?.recipientKind !== trigger.recipientKind) ||
          (trigger.event === "state" &&
            !this.stateSatisfied(source, trigger)) ||
          !matchesFilter(
            this.engine.match,
            { ...affected, characteristics: event.before ?? event.after },
            trigger.filter,
            source.controllerId,
            source.id,
          )
        )
          continue;
        this.engine.rules.waitingTriggers ??= [];
        this.engine.rules.waitingTriggers.push({
          id: randomUUID(),
          playerId: source.controllerId,
          sourceId: source.id,
          abilityId: ability.id,
          sourceName: source.characteristics.name,
          sourceSnapshot: {
            characteristics:
              source.id === event.sourceId
                ? (event.before ?? event.after)
                : this.engine.effective(source),
            ownerId: this.engine.owner(source),
          },
          ability: structuredClone(ability.rules!),
          event: structuredClone(event),
        });
      }
    }
  }
  answerTarget(action: Extract<MatchAction, { type: "rules-input" }>) {
    const pending = this.engine.rules.pending!;
    const object = this.engine.object(pending.sourceId!);
    const ids = action.targetIds ?? [];
    if (
      ids.length !== 1 ||
      !this.engine
        .legalTargets(
          pending.playerId,
          pending.ability!.target!,
          this.engine.targetSource(pending),
        )
        .includes(ids[0])
    )
      throw new Error("Choose one legal trigger target.");
    object.resolution!.targetIds = ids;
    delete this.engine.rules.pending;
    this.flush();
  }
  place(trigger: WaitingTrigger) {
    const engine = this.engine;
    const object = gameObject(
      "ability",
      engine.zone("stack").id,
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
    if (
      trigger.ability.target &&
      !engine.legalTargets(
        trigger.playerId,
        trigger.ability.target,
        trigger.ability.trigger?.event === "dies"
          ? trigger.event.affectedId
          : trigger.sourceId,
      ).length
    )
      return;
    engine.match.objects[object.id] = object;
    engine.zone("stack").objectIds.push(object.id);
    if (trigger.ability.target) {
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
  }
  flush() {
    const engine = this.engine,
      waiting = engine.rules.waitingTriggers ?? [];
    const order = engine.match.turn.order;
    const start = order.indexOf(engine.match.turn.activePlayerId);
    for (let i = 0; i < order.length; i++) {
      const playerId = order[(start + i) % order.length];
      const group = waiting.filter((t) => t.playerId === playerId);
      if (
        group.length > 1 &&
        !engine.rules.orderedTriggerPlayerIds?.includes(playerId)
      ) {
        engine.rules.pending = {
          id: randomUUID(),
          playerId,
          kind: "trigger-order",
          stage: "selection",
          targetIds: [],
          selections: {},
          totalCost: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, generic: 0 },
          context:
            "Order your simultaneous triggers from bottom to top of the Stack.",
          options: {
            order: {
              count: group.length,
              objectIds: group.map((t) => t.id),
              label: "Trigger order (bottom to top)",
              labels: Object.fromEntries(
                group.map((t) => [t.id, `${t.sourceName}: ${t.abilityId}`]),
              ),
            },
          },
        };
        delete engine.match.priority;
        return;
      }
      for (const trigger of group) {
        this.place(trigger);
        waiting.splice(waiting.indexOf(trigger), 1);
        if (engine.rules.pending) return;
      }
    }
    delete engine.rules.waitingTriggers;
    delete engine.rules.orderedTriggerPlayerIds;
    const playerId =
      engine.rules.priorityAfterTriggers ?? engine.match.turn.activePlayerId;
    delete engine.rules.priorityAfterTriggers;
    engine.match.priority = { playerId, passedPlayerIds: [] };
  }
  answer(action: Extract<MatchAction, { type: "rules-input" }>) {
    const pending = this.engine.rules.pending!;
    const ids = action.selections?.order ?? [];
    const group = (this.engine.rules.waitingTriggers ?? []).filter(
      (t) => t.playerId === pending.playerId,
    );
    if (
      ids.length !== group.length ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !group.some((t) => t.id === id))
    )
      throw new Error("Order each waiting trigger exactly once.");
    this.engine.rules.waitingTriggers = [
      ...ids.map((id) => group.find((t) => t.id === id)!),
      ...this.engine.rules.waitingTriggers!.filter(
        (t) => t.playerId !== pending.playerId,
      ),
    ];
    this.engine.rules.orderedTriggerPlayerIds ??= [];
    this.engine.rules.orderedTriggerPlayerIds.push(pending.playerId);
    delete this.engine.rules.pending;
    this.flush();
  }
}
