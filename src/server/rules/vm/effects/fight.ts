import type { JsonValue } from "../../../../shared/rules-state.js";
import { selection } from "./selection.js";
import { choiceOf } from "./zone-change.js";
import {
  done,
  type EffectContext,
  type EffectHandler,
  type ExecutionResult,
} from "./types.js";

// Fighting (CR 701.12): each creature deals damage equal to its power to the
// other, at the same time.

interface FightState {
  /** The creatures that fight, in the order they choose. */
  fighters: string[];
  /** The creatures they may fight. */
  against: string[];
  /** The pairs chosen so far: a fighter and the creature it fights. */
  pairs: [string, string][];
}

/** The creatures of a selector still on the Battlefield. */
function creatures(
  selector: Parameters<EffectContext["eval"]["objects"]>[0],
  ctx: EffectContext,
) {
  const battlefield = ctx.query.zone("battlefield").id;
  return [...new Set(ctx.eval.objects(selector))].filter((id) => {
    const object = ctx.query.match.objects[id];
    return (
      object?.zoneId === battlefield &&
      ctx.query.effective(object).types?.includes("Creature")
    );
  });
}

/** Every pair deals its damage in one event (CR 701.12a). */
function fightAll(pairs: [string, string][], ctx: EffectContext) {
  const power = (id: string) =>
    Math.max(0, Number(ctx.query.effective(ctx.query.object(id)).power) || 0);
  const live = (id: string) => !!ctx.query.match.objects[id];
  ctx.propose({
    kind: "damage",
    combat: false,
    assignments: pairs
      .filter(([a, b]) => live(a) && live(b) && a !== b)
      .flatMap(([a, b]) => [
        { sourceId: a, recipientId: b, amount: power(a) },
        { sourceId: b, recipientId: a, amount: power(b) },
      ]),
  });
}

/**
 * Distinct pairing: the controller picks, for each fighter in turn, a
 * different creature to fight; the last choice is made for them.
 */
function pair(state: FightState, ctx: EffectContext): ExecutionResult {
  while (state.pairs.length < state.fighters.length) {
    const taken = state.pairs.map(([, other]) => other);
    const remaining = state.against.filter((id) => !taken.includes(id));
    if (!remaining.length) break;
    const fighter = state.fighters[state.pairs.length];
    if (remaining.length === 1) {
      state.pairs.push([fighter, remaining[0]]);
      continue;
    }
    ctx.prompt(
      {
        select: {
          count: 1,
          objectIds: remaining,
          label: `Choose the creature ${ctx.query.object(fighter).characteristics.name} fights`,
        },
      },
      "Choose which creature each of your creatures fights.",
    );
    return { kind: "suspend", state: state as unknown as JsonValue };
  }
  fightAll(state.pairs, ctx);
  return done;
}

export const fight: EffectHandler<"fight"> = {
  unsupported: (effect) =>
    choiceOf(effect.objects) || choiceOf(effect.against)
      ? "A fight between chosen creatures"
      : undefined,
  execute(effect, ctx) {
    const fighters = creatures(effect.objects, ctx);
    const against = creatures(effect.against, ctx);
    if (effect.pairing === "distinct")
      return pair({ fighters, against, pairs: [] }, ctx);
    fightAll(
      fighters.flatMap((a) => against.map((b): [string, string] => [a, b])),
      ctx,
    );
    return done;
  },
  answer(_effect, state, input, ctx) {
    const current = state as unknown as FightState;
    const { ids } = selection(ctx, input);
    const fighter = current.fighters[current.pairs.length];
    return pair(
      { ...current, pairs: [...current.pairs, [fighter, ids[0]]] },
      ctx,
    );
  },
};
