import { selection } from "./selection.js";
import { choiceOf } from "./zone-change.js";
import {
  done,
  type EffectContext,
  type EffectHandler,
  type EffectOf,
  type ExecutionResult,
} from "./types.js";

// Playing a card without paying its mana cost (CR 118.9, 305.1): an effect
// lets the controller cast a card from their Hand or from exile, or play a
// land from it. A spell cast this way goes on the Stack above the resolving
// object, and the resolution carries on once its choices are made.

type Play = EffectOf<"play">;

/** The cards the instruction names that the controller could play. */
function playable(effect: Play, ctx: EffectContext) {
  const choice = choiceOf(effect.objects);
  const ids = choice
    ? ctx.eval.candidates(choice)
    : ctx.eval.objects(effect.objects);
  return [...new Set(ids)].filter((id) => ctx.playableFree(ctx.playerId, id));
}

/** Starts playing the card; a cast with choices to make leaves the instruction waiting. */
function start(id: string, ctx: EffectContext): ExecutionResult {
  return ctx.playFree(ctx.playerId, id) === "pending"
    ? { kind: "suspend", state: { casting: true } }
    : done;
}

export const play: EffectHandler<"play"> = {
  unsupported: (effect) => {
    const choice = choiceOf(effect.objects);
    if (choice && (choice.count !== 1 || choice.chooser))
      return "A choice of other than one card by you";
    return choice ||
      (typeof effect.objects === "object" && "linked" in effect.objects)
      ? undefined
      : "Playing objects other than a chosen or a linked card";
  },
  execute(effect, ctx) {
    const ids = playable(effect, ctx);
    if (!ids.length) return done;
    if (!choiceOf(effect.objects) && ids.length === 1)
      return start(ids[0], ctx);
    ctx.prompt(
      {
        select: {
          count: 1,
          objectIds: ids,
          label: "Choose a card to play without paying its mana cost",
        },
      },
      "Choose a card to play without paying its mana cost.",
    );
    return { kind: "suspend", state: null };
  },
  answer(_effect, _state, input, ctx) {
    const { ids } = selection(ctx, input);
    return start(ids[0], ctx);
  },
};
