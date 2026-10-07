import type { JsonValue } from "../../../../shared/rules.js";
import type { Effect } from "../../../../shared/rules-v2.js";
import { manaCost } from "../../../match/mana.js";
import { payMana } from "../../costs/cost-runtime.js";
import { unsupportedCondition } from "../evaluate.js";
import { selection } from "./selection.js";
import {
  candidates,
  performMove,
  promptMove,
  unsupportedMove,
  type ObjectMove,
} from "./zone-change.js";
import {
  done,
  type EffectContext,
  type EffectHandler,
  type ExecutionResult,
} from "./types.js";

// Control flow (dsl-redesign.md §4.6). Nested instructions run next through
// the same queue, so every instruction they contain dispatches through the
// registry too.

/** Checks nested instructions; set by the registry to avoid an import cycle. */
export const nested: {
  unsupported: (effects: Effect[]) => string | undefined;
} = { unsupported: () => undefined };

export const sequence: EffectHandler<"sequence"> = {
  unsupported: (effect) => nested.unsupported(effect.effects),
  execute: (effect) => ({ kind: "continue", effects: effect.effects }),
};

export const ifThen: EffectHandler<"if"> = {
  unsupported: (effect) =>
    unsupportedCondition(effect.condition) ??
    nested.unsupported([...effect.then, ...(effect.else ?? [])]),
  execute: (effect, ctx) => ({
    kind: "continue",
    effects: ctx.eval.condition(effect.condition)
      ? effect.then
      : (effect.else ?? []),
  }),
};

const movingKinds = new Set(["move", "destroy", "exile", "sacrifice"]);
const optionalMove = (effect: EffectOfMay) =>
  effect.effects.length === 1 && movingKinds.has(effect.effects[0].kind)
    ? (effect.effects[0] as ObjectMove)
    : undefined;
type EffectOfMay = Extract<Effect, { kind: "may" }>;

/**
 * "You may" an object instruction: one prompt where choosing nothing declines.
 * A `bind` flag records whether anything was done (`didPerform`).
 */
export const may: EffectHandler<"may"> = {
  unsupported(effect) {
    const inner = optionalMove(effect);
    if (effect.player || !inner)
      return "A may other than an optional move, destroy, exile or sacrifice";
    return unsupportedMove(inner);
  },
  execute(effect, ctx) {
    const inner = optionalMove(effect)!;
    const ids = candidates(inner, ctx);
    if (ids.length) {
      promptMove(inner, ids, ctx, true);
      return { kind: "suspend", state: null };
    }
    performMove(inner, [], ctx);
    if (effect.bind) ctx.bind(effect.bind, 0);
    return done;
  },
  answer(effect, _state, input, ctx) {
    const { ids } = selection(ctx, input);
    performMove(optionalMove(effect)!, ids, ctx);
    if (effect.bind) ctx.bind(effect.bind, ids.length ? 1 : 0);
    return done;
  },
};

/** "Unless [player] pays": a mana payment the player may decline (CR 118.12). */
export const mayPay: EffectHandler<"may-pay"> = {
  unsupported: (effect) =>
    effect.costs.some((c) => c.kind !== "mana")
      ? "An optional payment other than mana"
      : nested.unsupported([...(effect.then ?? []), ...(effect.else ?? [])]),
  execute(effect, ctx) {
    const [playerId] = effect.player
      ? ctx.eval.players(effect.player)
      : [ctx.playerId];
    ctx.prompt({}, "Choose Pay or Decline for the resolving effect.", {
      playerId,
      payment: manaCost(symbols(effect)),
    });
    return { kind: "suspend", state: null };
  },
  answer(effect, _state, input, ctx) {
    if (input.selections || input.variables || input.targetIds)
      throw new Error("Choose Pay or Decline.");
    if (input.confirm === false)
      return { kind: "continue", effects: effect.else ?? [] };
    const payer = ctx.rules.pending!.playerId;
    if (!payMana(ctx.rules, payer, manaCost(symbols(effect))))
      throw new Error("The effect's mana payment cannot be paid yet.");
    return { kind: "continue", effects: effect.then ?? [] };
  },
};

const symbols = (effect: Extract<Effect, { kind: "may-pay" }>) =>
  effect.costs.flatMap((c) => (c as { symbols: string[] }).symbols);

interface EachPlayerState {
  /** Players still to choose, in turn order. */
  players: string[];
  chosen: string[];
}

const eachSacrifice = (
  effect: Extract<Effect, { kind: "for-each-player" }>,
) => {
  const [inner] = effect.effects;
  return effect.effects.length === 1 &&
    inner.kind === "sacrifice" &&
    typeof inner.objects === "object" &&
    "all" in inner.objects
    ? inner
    : undefined;
};

/**
 * Each player sacrifices their part of a set (All Is Dust): each player in
 * turn order selects theirs, then every selection leaves at once (CR 101.4).
 */
export const forEachPlayer: EffectHandler<"for-each-player"> = {
  unsupported: (effect) =>
    effect.players === "each-player" && eachSacrifice(effect)
      ? undefined
      : "A for-each-player other than each player sacrificing a set",
  execute(effect, ctx) {
    const players = ctx.query.match.turn.order.filter(
      (playerId) => owned(effect, playerId, ctx).length,
    );
    if (!players.length) return done;
    return prompt(effect, { players, chosen: [] }, ctx);
  },
  answer(effect, state, input, ctx) {
    const current = state as unknown as EachPlayerState;
    const { ids } = selection(ctx, input);
    const next = {
      players: current.players.slice(1),
      chosen: [...current.chosen, ...ids],
    };
    if (next.players.length) return prompt(effect, next, ctx);
    performMove(eachSacrifice(effect)!, next.chosen, ctx);
    return done;
  },
};

/** The objects of the set that `playerId` controls. */
function owned(
  effect: Extract<Effect, { kind: "for-each-player" }>,
  playerId: string,
  ctx: EffectContext,
) {
  const inner = eachSacrifice(effect)!;
  const evaluator = ctx.scoped({ players: { player: playerId } });
  return evaluator
    .objects(inner.objects)
    .filter(
      (id) =>
        ctx.query.match.objects[id] &&
        ctx.query.object(id).controllerId === playerId,
    );
}

function prompt(
  effect: Extract<Effect, { kind: "for-each-player" }>,
  state: EachPlayerState,
  ctx: EffectContext,
): ExecutionResult {
  const playerId = state.players[0];
  const ids = owned(effect, playerId, ctx);
  ctx.prompt(
    {
      select: {
        count: ids.length,
        objectIds: ids,
        label: "Sacrifice all your eligible permanents",
      },
    },
    "Select your colored permanents. All players' selections leave together.",
    { playerId },
  );
  return { kind: "suspend", state: state as unknown as JsonValue };
}
