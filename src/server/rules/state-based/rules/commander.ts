import { randomUUID } from "node:crypto";
import { zoneById } from "../../../match/zones.js";
import type { RulesQuery } from "../../context.js";
import { none, type StateBasedRule } from "../types.js";
import { RuleViolation } from "../../rule-violation.js";

/** The first queued commander still in a Graveyard or exile. */
function returnable(query: RulesQuery) {
  for (const id of query.match.rules.commanderReturns ?? []) {
    const object = query.match.objects[id];
    const kind = object && zoneById(query.match, object.zoneId)?.kind;
    if (object && kind && ["graveyard", "exile"].includes(kind)) return object;
  }
  return undefined;
}

/**
 * CR 903.9a: a commander put into a Graveyard or exile since the last check
 * may return to the Command Zone; its owner chooses. Hand and Library returns
 * are a replacement instead (CommanderRules).
 */
export const commanderReturn: StateBasedRule = {
  id: "commander-return",
  evaluate(query) {
    const object = returnable(query);
    if (!object) return none;
    return {
      kind: "choice",
      procedure: {
        id: randomUUID(),
        playerId: query.owner(object),
        kind: "commander-return",
        stage: "selection",
        sourceId: object.id,
        targetIds: [],
        selections: {},
        totalCost: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, generic: 0 },
        context:
          "Return your commander to the Command Zone? Confirm to return, or Decline to leave it in the destination Zone.",
      },
    };
  },
  answer(ctx, pending, input) {
    if (
      input.confirm === undefined ||
      input.selections ||
      input.targetIds ||
      input.variables
    )
      throw new RuleViolation("Choose Confirm or Decline.");
    const rules = ctx.query.match.rules;
    const queue = rules.commanderReturns ?? [];
    // Earlier entries had already left the Graveyard or exile.
    rules.commanderReturns = queue.slice(queue.indexOf(pending.sourceId!) + 1);
    if (!input.confirm) return false;
    ctx.propose({
      kind: "zone-change",
      objectId: pending.sourceId!,
      to: ctx.query.zone("command"),
    });
    return true;
  },
  stable(ctx) {
    // Nothing returnable is left; the rest moved on.
    delete ctx.query.match.rules.commanderReturns;
  },
};
