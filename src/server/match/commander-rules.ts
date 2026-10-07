import { randomUUID } from "node:crypto";
import type { GameObject, ZoneState } from "../../shared/model.js";
import type { PendingProcedure } from "../../shared/rules.js";
import type { RulesEngine } from "./rules-engine.js";

export class CommanderReplacement extends Error {
  constructor(
    readonly playerId: string,
    readonly key: string,
  ) {
    super("Choose whether to return your commander to the Command Zone.");
  }
}

// Hand/Library returns replace movement (CR 903.9b); Graveyard/exile returns
// are a state-based choice (state-based/rules/commander.ts, CR 903.9a).
export class CommanderRules {
  constructor(readonly engine: RulesEngine) {}
  instance(object: GameObject) {
    return object.cardInstanceIds.find(
      (id) => this.engine.match.instances[id]?.commander,
    );
  }
  replacement(object: GameObject, destination: ZoneState) {
    const instance = this.instance(object);
    if (
      !instance ||
      !["hand", "library"].includes(destination.kind) ||
      object.zoneId === destination.id
    )
      return destination;
    const key = `${instance}:${destination.id}`;
    const answer = this.engine.rules.commanderReplay?.answers[key];
    if (answer === undefined)
      throw new CommanderReplacement(this.engine.owner(object), key);
    return answer ? this.engine.zone("command") : destination;
  }
  moved(object: GameObject, destination: ZoneState) {
    if (
      this.instance(object) &&
      ["graveyard", "exile"].includes(destination.kind)
    ) {
      this.engine.rules.commanderReturns ??= [];
      this.engine.rules.commanderReturns.push(object.id);
    }
  }
  prompt(playerId: string, sourceId?: string) {
    const pending: PendingProcedure = {
      id: randomUUID(),
      playerId,
      kind: "commander-return",
      stage: "selection",
      sourceId,
      targetIds: [],
      selections: {},
      totalCost: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, generic: 0 },
      context:
        "Return your commander to the Command Zone? Confirm to return, or Decline to leave it in the destination Zone.",
    };
    this.engine.rules.pending = pending;
    delete this.engine.match.priority;
  }
}
