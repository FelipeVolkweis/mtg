import { randomUUID } from "node:crypto";
import type { MatchAction } from "../../shared/model.js";
import type {
  DiscardEffect,
  RulesValue,
  SelectionOption,
} from "../../shared/rules.js";
import { moveObject } from "./game-objects.js";
import type { RulesEngine } from "./rules-engine.js";

// The queue and bindings are Match data: each completed instruction is removed
// before exposing a choice, so reconnecting resumes the next instruction.
export class Resolution {
  constructor(readonly engine: RulesEngine) {}
  get progress() {
    return this.engine.rules.resolving!;
  }
  value(value: RulesValue) {
    const result =
      typeof value === "number" ? value : this.progress.bindings[value.binding];
    if (!Number.isSafeInteger(result) || result < 0 || result > 1000)
      throw new Error("Invalid resolution quantity binding.");
    return result;
  }
  option(effect: DiscardEffect, label: string): SelectionOption {
    const hand = this.engine.zone("hand", this.progress.playerId);
    const objectIds = hand.objectIds.filter(
      (id) =>
        !effect.types ||
        effect.types.some((type) =>
          this.engine.object(id).characteristics.types?.includes(type),
        ),
    );
    const requestedCount = this.value(effect.count);
    return {
      count: Math.min(requestedCount, objectIds.length),
      requestedCount,
      objectIds,
      label,
      types: effect.types,
    };
  }
  resume() {
    const progress = this.progress;
    const source = this.engine.object(progress.sourceId);
    while (progress.remaining.length) {
      const effect = progress.remaining.shift()!;
      if (effect.kind === "sequence")
        progress.remaining.unshift(...effect.effects);
      else if (effect.kind === "if")
        progress.remaining.unshift(
          ...(this.value({ binding: effect.condition.binding }) >=
          effect.condition.atLeast
            ? effect.then
            : effect.otherwise),
        );
      else if (effect.kind === "draw") {
        const before = this.engine.zone("hand", progress.playerId).objectIds
          .length;
        this.engine.draw(progress.playerId, this.value(effect.count));
        if (effect.bind)
          progress.bindings[effect.bind] =
            this.engine.zone("hand", progress.playerId).objectIds.length -
            before;
      } else if (effect.kind === "discard" || effect.kind === "alternative") {
        const candidates =
          effect.kind === "discard"
            ? [
                {
                  id: "discard",
                  label: "Discard",
                  effect,
                  requireComplete: false,
                },
              ]
            : effect.options;
        const options = candidates.map((candidate) => ({
          ...candidate,
          option: this.option(candidate.effect, candidate.label),
        }));
        // A fully possible alternative must be taken if one exists. If none
        // can be completed, perform as much of a permitted partial effect as possible.
        const complete = options.filter(
          (o) => o.option.count === o.option.requestedCount,
        );
        const legal = complete.length
          ? complete
          : options.filter((o) => !o.requireComplete);
        const selectable = legal.filter((o) => o.option.count > 0);
        if (!selectable.length) {
          if (effect.kind === "discard" && effect.bind)
            progress.bindings[effect.bind] = 0;
          continue;
        }
        progress.choices = Object.fromEntries(
          selectable.map((o) => [o.id, o.effect]),
        );
        this.engine.rules.pending = {
          id: randomUUID(),
          playerId: progress.playerId,
          kind: "resolve",
          stage: "selection",
          sourceId: source.id,
          targetIds: [],
          selections: {},
          totalCost: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, generic: 0 },
          context: `${source.characteristics.name}: choose a discard option from your current Hand.`,
          options: Object.fromEntries(selectable.map((o) => [o.id, o.option])),
        };
        return;
      } else
        this.engine.effects(
          progress.playerId,
          { costs: [], effects: [effect] },
          source.resolution!.targetIds,
          source.resolution!.color,
        );
    }
    delete this.engine.rules.resolving;
    delete this.engine.rules.pending;
    this.engine.finishResolution(source, true);
    this.engine.priority();
  }
  answer(action: Extract<MatchAction, { type: "rules-input" }>) {
    const entries = Object.entries(action.selections ?? {});
    const nonempty = entries.filter(([, ids]) => ids.length);
    if (
      nonempty.length !== 1 ||
      entries.some(([key]) => !this.progress.choices?.[key])
    )
      throw new Error("Choose exactly one legal discard option.");
    const [key, ids] = nonempty[0];
    const effect = this.progress.choices![key];
    const option = this.option(effect, key);
    if (
      ids.length !== option.count ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !option.objectIds.includes(id))
    )
      throw new Error(
        "Choose the required number of eligible, distinct cards.",
      );
    for (const id of ids)
      moveObject(
        this.engine.match,
        id,
        this.engine.zone("graveyard", this.progress.playerId),
      );
    if (effect.bind) this.progress.bindings[effect.bind] = ids.length;
    delete this.progress.choices;
    delete this.engine.rules.pending;
    this.resume();
  }
}
