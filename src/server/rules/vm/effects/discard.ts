import type {
  JsonValue,
  SelectionOption,
} from "../../../../shared/rules-state.js";
import type { Effect } from "../../../../shared/card-dsl.js";
import {
  done,
  type EffectContext,
  type EffectHandler,
  type EffectOf,
} from "./types.js";

// Discard (CR 701.8) and a choice among discards (Thirst for Knowledge). The
// player picks an option and its cards in one answer, from their current
// Hand.

type Discard = EffectOf<"discard">;
interface DiscardChoice {
  id: string;
  label: string;
  effect: Discard;
  /** Only offered when it can be done in full (an `available` condition). */
  requireComplete: boolean;
}

function option(
  effect: Discard,
  label: string,
  ctx: EffectContext,
): SelectionOption {
  const hand = ctx.query.zone("hand", ctx.playerId);
  const filter = effect.filter;
  const objectIds = hand.objectIds.filter(
    (id) => !filter || ctx.eval.matches(ctx.query.object(id), filter),
  );
  const requestedCount = ctx.eval.value(effect.count);
  const types =
    filter && "type" in filter && filter.type
      ? Array.isArray(filter.type)
        ? filter.type
        : [filter.type]
      : undefined;
  return {
    count: Math.min(requestedCount, objectIds.length),
    requestedCount,
    objectIds,
    label,
    ...(types ? { types } : {}),
  };
}

function offer(choices: DiscardChoice[], ctx: EffectContext) {
  const options = choices.map((choice) => ({
    ...choice,
    option: option(choice.effect, choice.label, ctx),
  }));
  // A fully possible alternative must be taken if one exists. If none can be
  // completed, perform as much of a permitted partial effect as possible.
  const complete = options.filter(
    (o) => o.option.count === o.option.requestedCount,
  );
  const legal = complete.length
    ? complete
    : options.filter((o) => !o.requireComplete);
  return legal.filter((o) => o.option.count > 0);
}

function prompt(choices: DiscardChoice[], ctx: EffectContext) {
  const selectable = offer(choices, ctx);
  if (!selectable.length) return undefined;
  ctx.prompt(
    Object.fromEntries(selectable.map((o) => [o.id, o.option])),
    `${ctx.query.object(ctx.stackId).characteristics.name}: choose a discard option from your current Hand.`,
  );
  return {
    choices: Object.fromEntries(
      selectable.map((o) => [o.id, o.effect]),
    ) as unknown as JsonValue,
  };
}

function answer(
  state: JsonValue,
  input: Parameters<NonNullable<EffectHandler["answer"]>>[2],
  ctx: EffectContext,
) {
  const choices = (state as unknown as { choices: Record<string, Discard> })
    .choices;
  const entries = Object.entries(input.selections ?? {});
  const nonempty = entries.filter(([, ids]) => ids.length);
  if (nonempty.length !== 1 || entries.some(([key]) => !choices[key]))
    throw new Error("Choose exactly one legal discard option.");
  const [key, ids] = nonempty[0];
  const effect = choices[key];
  const legal = option(effect, key, ctx);
  if (
    ids.length !== legal.count ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !legal.objectIds.includes(id))
  )
    throw new Error("Choose the required number of eligible, distinct cards.");
  for (const id of ids)
    ctx.propose({
      kind: "zone-change",
      objectId: id,
      to: ctx.query.zone("graveyard", ctx.playerId),
    });
  if (effect.bind) ctx.bind(effect.bind, ids.length);
  return done;
}

export const discard: EffectHandler<"discard"> = {
  unsupported: (effect) =>
    effect.player && effect.player !== "you"
      ? "Discard by another player"
      : undefined,
  execute(effect, ctx) {
    const state = prompt(
      [{ id: "discard", label: "Discard", effect, requireComplete: false }],
      ctx,
    );
    if (state) return { kind: "suspend", state };
    if (effect.bind) ctx.bind(effect.bind, 0);
    return done;
  },
  answer: (_effect, state, input, ctx) => answer(state, input, ctx),
};

const onlyDiscard = (effects: Effect[]) =>
  effects.length === 1 && effects[0].kind === "discard"
    ? (effects[0] as Discard)
    : undefined;

export const chooseOne: EffectHandler<"choose-one"> = {
  unsupported(effect) {
    if (effect.chooser) return "A choice by another player";
    if (effect.options.some((o) => !onlyDiscard(o.effects)))
      return "A choice option other than one discard";
    return effect.options
      .map((o) => discard.unsupported!(onlyDiscard(o.effects)!))
      .find(Boolean);
  },
  execute(effect, ctx) {
    const state = prompt(
      effect.options.map((o) => ({
        id: o.id,
        label: o.label,
        effect: onlyDiscard(o.effects)!,
        requireComplete: !!o.available,
      })),
      ctx,
    );
    return state ? { kind: "suspend", state } : done;
  },
  answer: (_effect, state, input, ctx) => answer(state, input, ctx),
};
