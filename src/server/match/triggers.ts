import { randomUUID } from "node:crypto";
import type { GameObject, MatchAction } from "../../shared/model.js";
import type { SemanticEvent, WaitingTrigger } from "../../shared/rules.js";
import { gameObject } from "./game-objects.js";
import type { RulesEngine } from "./rules-engine.js";

export class Triggers {
  constructor(readonly engine: RulesEngine) {}
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
          !this.engine.matches(
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
          ability: structuredClone(ability.rules!),
          event: structuredClone(event),
        });
      }
    }
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
      ability: trigger.ability,
      event: structuredClone(trigger.event),
      targetIds: [],
    };
    engine.match.objects[object.id] = object;
    engine.zone("stack").objectIds.push(object.id);
  }
  flush() {
    const engine = this.engine,
      waiting = engine.rules.waitingTriggers ?? [];
    const order = engine.match.turn.order;
    const start = order.indexOf(engine.match.turn.activePlayerId);
    for (let i = 0; i < order.length; i++) {
      const playerId = order[(start + i) % order.length];
      const group = waiting.filter((t) => t.playerId === playerId);
      if (group.length > 1) {
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
      }
    }
    delete engine.rules.waitingTriggers;
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
    for (const id of ids) this.place(group.find((t) => t.id === id)!);
    this.engine.rules.waitingTriggers =
      this.engine.rules.waitingTriggers!.filter(
        (t) => t.playerId !== pending.playerId,
      );
    delete this.engine.rules.pending;
    this.flush();
  }
}
