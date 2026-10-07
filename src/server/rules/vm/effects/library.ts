import { randomInt } from "node:crypto";
import type { JsonValue } from "../../../../shared/rules.js";
import { selection } from "./selection.js";
import {
  done,
  type EffectContext,
  type EffectHandler,
  type EffectOf,
} from "./types.js";

// Looking at the top of a Library (CR 701.18 scry and "look at the top N"
// sequences). Two shapes run today: scry (any number to the bottom, the rest
// on top in any order) and "select up to one matching card to your Hand, the
// rest on the bottom".

type Sequence = EffectOf<"library-sequence">;
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

const isScry = (e: Sequence) =>
  !!e.select &&
  !e.select.filter &&
  e.select.max === e.count &&
  same(e.select.to, { zone: "library", position: "bottom" }) &&
  same(e.rest, { to: { zone: "library", position: "top" }, order: "any" });

const isSelectToHand = (e: Sequence) =>
  !!e.select?.filter &&
  e.select.max === 1 &&
  same(e.select.to, { zone: "hand" }) &&
  same(e.rest.to, { zone: "library", position: "bottom" }) &&
  e.rest.order !== "any";

interface State {
  inspected: string[];
}

function toBottom(ids: string[], ctx: EffectContext) {
  const library = ctx.query.zone("library", ctx.playerId);
  for (const id of ids)
    ctx.propose({
      kind: "zone-change",
      objectId: id,
      to: library,
      position: "bottom",
    });
}

export const librarySequence: EffectHandler<"library-sequence"> = {
  unsupported: (e) =>
    e.player === "you" &&
    e.operation === "look" &&
    typeof e.count === "number" &&
    (isScry(e) || isSelectToHand(e))
      ? undefined
      : "This library sequence",
  execute(effect, ctx) {
    const ids = ctx.query
      .zone("library", ctx.playerId)
      .objectIds.slice(0, ctx.eval.value(effect.count));
    if (!ids.length) return done;
    ctx.inspect(ids);
    const filter = effect.select?.filter;
    ctx.prompt(
      isSelectToHand(effect)
        ? {
            select: {
              count: 1,
              minCount: 0,
              objectIds: ids.filter((id) =>
                ctx.eval.matches(ctx.query.object(id), filter!),
              ),
              label: "Select a card (optional)",
            },
          }
        : {
            bottom: {
              count: ids.length,
              minCount: 0,
              ordered: true,
              objectIds: ids,
              label: "Put cards on the bottom (selected order)",
            },
          },
      "Inspect your Library privately.",
    );
    return { kind: "suspend", state: { inspected: ids } };
  },
  answer(effect, state, input, ctx) {
    const { inspected } = state as unknown as State;
    const { key, ids } = selection(ctx, input);
    const library = ctx.query.zone("library", ctx.playerId);
    if (key === "top") {
      // Top to bottom in the chosen order.
      for (const id of [...ids].reverse())
        ctx.propose({
          kind: "zone-change",
          objectId: id,
          to: library,
          position: "top",
        });
      return done;
    }
    if (isSelectToHand(effect)) {
      for (const id of ids) {
        const { object } = ctx.propose({
          kind: "zone-change",
          objectId: id,
          to: ctx.query.zone("hand", ctx.playerId),
        });
        if (effect.select!.reveal && object) {
          ctx.rules.revealedHandIds ??= [];
          ctx.rules.revealedHandIds.push(object.id);
        }
      }
      const remaining = inspected.filter((id) => !ids.includes(id));
      if (effect.rest.order === "random")
        for (let i = remaining.length - 1; i > 0; i--) {
          const j = randomInt(i + 1);
          [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
        }
      toBottom(remaining, ctx);
      return done;
    }
    toBottom(ids, ctx);
    const top = inspected.filter((id) => !ids.includes(id));
    if (top.length < 2) return done;
    ctx.inspect(top);
    // The second answer orders the remaining top cards instead of bottoming them.
    ctx.prompt(
      {
        top: {
          count: top.length,
          ordered: true,
          objectIds: top,
          label: "Order remaining cards on top",
        },
      },
      "Choose top-to-bottom order.",
    );
    return {
      kind: "suspend",
      state: { inspected: top } as unknown as JsonValue,
    };
  },
};
