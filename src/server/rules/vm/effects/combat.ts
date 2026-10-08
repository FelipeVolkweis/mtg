import { done, type EffectHandler } from "./types.js";
import { RuleViolation } from "../../rule-violation.js";

/** Reselects the player or planeswalker an attacker attacks (CR 506.4, Misleading Signpost). */
export const reselectDefender: EffectHandler<"reselect-defender"> = {
  execute(effect, ctx) {
    const [attackerId] = ctx.eval.objects(effect.attacker);
    const attacker = ctx.rules.combat?.attackers.find(
      (a) => a.objectId === attackerId,
    );
    if (!attacker) return done;
    const defenders = ctx.redirectDestinations(attacker.objectId);
    ctx.prompt(
      {
        select: {
          count: 1,
          minCount: 0,
          objectIds: defenders.map((d) => d.id),
          labels: Object.fromEntries(defenders.map((d) => [d.id, d.name])),
          label: "Choose a new attack destination (optional)",
        },
      },
      "Reselect the attack destination.",
    );
    return { kind: "suspend", state: null };
  },
  answer(effect, _state, input, ctx) {
    const option = ctx.options.select;
    const ids = input.selections?.select ?? [];
    if (
      Object.keys(input.selections ?? {}).some((k) => k !== "select") ||
      ids.length > option.count ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !option.objectIds.includes(id))
    )
      throw new RuleViolation(
        "Choose eligible, distinct objects in the permitted quantity.",
      );
    if (!ids.length) return done;
    const [attackerId] = ctx.eval.objects(effect.attacker);
    const attacker = ctx.rules.combat?.attackers.find(
      (a) => a.objectId === attackerId,
    );
    const defender =
      attacker &&
      ctx.redirectDestinations(attacker.objectId).find((d) => d.id === ids[0]);
    if (
      !attacker ||
      !defender ||
      ctx.query.match.objects[defender.id]?.controllerId ===
        ctx.query.object(attacker.objectId).controllerId
    )
      throw new RuleViolation("Choose a legal attack destination.");
    attacker.defenderId = defender.id;
    attacker.defendingPlayerId = defender.playerId;
    return done;
  },
};
