import { randomUUID } from "node:crypto";
import type { MatchAction } from "../../../shared/model.js";
import type { WaitingTrigger } from "../../../shared/rules.js";
import type { ManaTrigger, Trigger } from "../../../shared/rules-v2.js";
import type { RulesEngine } from "../../match/rules-engine.js";
import { PutTriggeredAbilityOnStackProcedure } from "./put-triggered-ability.js";
import { triggerOf } from "./trigger-runtime.js";

// Trigger placement (rules-engine-refactor.md §44), part of the Priority
// Checkpoint. The waiting triggers become the current batch; triggers that
// happen while it is placed wait for the next one. CR 603.3b places a batch
// in two parts, each in APNAP order: first the triggers whose condition isn't
// another ability triggering, then the rest. A player with several triggers
// in a part orders them.

export type PlacementPart = 1 | 2;

/** Which part of CR 603.3b placement a trigger belongs to. */
export function placementPart(trigger: Trigger | ManaTrigger): PlacementPart {
  switch (trigger.event) {
    case "zone-change":
    case "enters":
    case "dies":
    case "cast":
    case "attacks":
    case "deals-damage":
    case "draws":
    case "step":
    case "becomes-target":
    case "gains-life":
    case "loses-life":
    case "state":
    case "tapped-for-mana":
      // None of these is "another ability triggering", which is part 2.
      return 1;
  }
}

export type PlacementResult =
  /** No trigger was waiting. */
  | "idle"
  /** The batch is on the Stack. */
  | "placed"
  /** A player must order triggers or choose a target. */
  | "suspended";

export class TriggerPlacement {
  constructor(
    readonly engine: RulesEngine,
    readonly part: (trigger: WaitingTrigger) => PlacementPart = (t) => {
      const trigger = triggerOf(t.ability);
      return trigger ? placementPart(trigger) : 1;
    },
  ) {}

  /** Places the current batch, or the waiting triggers as a new batch. */
  place(): PlacementResult {
    const rules = this.engine.rules;
    if (!rules.triggerPlacement && !rules.waitingTriggers?.length)
      return "idle";
    const batch = this.batch();
    for (const part of [1, 2] as const)
      for (const playerId of this.apnap()) {
        const group = batch.filter(
          (t) => t.playerId === playerId && this.part(t) === part,
        );
        if (!group.length) continue;
        if (
          group.length > 1 &&
          !rules.orderedTriggerPlayerIds?.includes(playerId)
        ) {
          this.promptOrder(playerId, group);
          return "suspended";
        }
        for (const trigger of group) {
          batch.splice(batch.indexOf(trigger), 1);
          new PutTriggeredAbilityOnStackProcedure(this.engine).start(trigger);
          if (rules.pending) return "suspended";
        }
        // The order applied to this part; a later part is ordered again.
        rules.orderedTriggerPlayerIds = rules.orderedTriggerPlayerIds?.filter(
          (id) => id !== playerId,
        );
      }
    delete rules.triggerPlacement;
    delete rules.orderedTriggerPlayerIds;
    return "placed";
  }

  /** Records a player's order, bottom of the Stack first. */
  answer(action: Extract<MatchAction, { type: "rules-input" }>) {
    const rules = this.engine.rules;
    const pending = rules.pending!;
    const ids = action.selections?.order ?? [];
    const batch = this.batch();
    const groupIds = pending.options?.order?.objectIds ?? [];
    const group = batch.filter((t) => groupIds.includes(t.id));
    if (
      ids.length !== group.length ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !group.some((t) => t.id === id))
    )
      throw new Error("Order each waiting trigger exactly once.");
    rules.triggerPlacement = [
      ...ids.map((id) => group.find((t) => t.id === id)!),
      ...batch.filter((t) => !group.includes(t)),
    ];
    rules.orderedTriggerPlayerIds ??= [];
    rules.orderedTriggerPlayerIds.push(pending.playerId);
    delete rules.pending;
  }

  /**
   * The batch being placed. It stays in persisted state until all its
   * choices finish; new triggers collected meanwhile belong to the next.
   */
  batch() {
    const rules = this.engine.rules;
    if (!rules.triggerPlacement) {
      rules.triggerPlacement = rules.waitingTriggers ?? [];
      delete rules.waitingTriggers;
    }
    return rules.triggerPlacement;
  }

  /** Players in turn order starting with the active player (CR 101.4). */
  private apnap() {
    const { order, activePlayerId } = this.engine.match.turn;
    const start = order.indexOf(activePlayerId);
    return order.map((_, i) => order[(start + i) % order.length]);
  }

  private promptOrder(playerId: string, group: WaitingTrigger[]) {
    const engine = this.engine;
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
  }
}
