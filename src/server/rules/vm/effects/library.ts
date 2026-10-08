import { randomInt } from "node:crypto";
import type { Destination } from "../../../../shared/card-dsl.js";
import type { JsonValue } from "../../../../shared/rules-state.js";
import { astEqual } from "../../ast.js";
import { selection } from "./selection.js";
import {
  done,
  type EffectContext,
  type EffectHandler,
  type EffectOf,
} from "./types.js";

// Looking at the top of a Library (CR 701.18 scry and "look at the top N"
// sequences). Three shapes run today: scry (any number to the bottom, the
// rest on top in any order); "look at the top N and select a card": up to one
// matching card, or exactly one without a filter, goes to your Hand, onto the
// Battlefield, or exiled face down and linked to the source (hideaway, CR
// 702.75); and "reveal until a matching card", which puts that card
// somewhere without a choice. The rest go on the bottom.

type Sequence = EffectOf<"library-sequence">;
type Select = NonNullable<Sequence["select"]>;

const isScry = (e: Sequence) =>
  !!e.select &&
  !e.select.filter &&
  e.select.max === e.count &&
  astEqual(e.select.to, { zone: "library", position: "bottom" }) &&
  astEqual(e.rest, { to: { zone: "library", position: "top" }, order: "any" });

/** Where a selected card may go: the zones of `moveSelected`. */
const supportedDestination = (to: Destination) =>
  typeof to === "object" &&
  (astEqual(to, { zone: "hand" }) ||
    astEqual(to, { zone: "battlefield" }) ||
    astEqual(to, { zone: "battlefield", tapped: true }) ||
    astEqual(to, { zone: "exile" }) ||
    astEqual(to, { zone: "exile", faceDown: true }));

const isSelection = (e: Sequence) =>
  !!e.select &&
  e.select.max === 1 &&
  supportedDestination(e.select.to) &&
  astEqual(e.rest.to, { zone: "library", position: "bottom" }) &&
  e.rest.order !== "any" &&
  (!e.select.linkAs ||
    astEqual(e.select.to, { zone: "exile", faceDown: true }));

/** "Reveal cards until you reveal a matching one": nothing to choose. */
const isReveal = (e: Sequence) =>
  typeof e.count === "object" &&
  "until" in e.count &&
  e.operation === "reveal" &&
  isSelection(e) &&
  !e.select!.filter;

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

/** The rest go to the bottom, in a random order when the card says so. */
function bottomRest(effect: Sequence, ids: string[], ctx: EffectContext) {
  const rest = [...ids];
  if (effect.rest.order === "random")
    for (let i = rest.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
  toBottom(rest, ctx);
}

/** Moves a selected card to where the sequence puts it. */
function moveSelected(select: Select, id: string, ctx: EffectContext) {
  const to = select.to as Exclude<Destination, string>;
  const { object } = ctx.propose({
    kind: "zone-change",
    objectId: id,
    to: ctx.query.zone(to.zone, to.zone === "hand" ? ctx.playerId : undefined),
  });
  if (!object) return;
  if (to.zone === "hand" && select.reveal) {
    ctx.rules.revealedHandIds ??= [];
    ctx.rules.revealedHandIds.push(object.id);
  }
  if ("tapped" in to && to.tapped) object.status.tapped = true;
  if ("faceDown" in to && to.faceDown) object.status.faceDown = true;
  const source = ctx.query.match.objects[ctx.sourceId];
  if (select.linkAs && source)
    source.links.push({ label: select.linkAs, objectIds: [object.id] });
}

export const librarySequence: EffectHandler<"library-sequence"> = {
  unsupported(e) {
    const until = typeof e.count === "object" && "until" in e.count;
    return e.player === "you" &&
      (isReveal(e) ||
        (e.operation === "look" && !until && (isScry(e) || isSelection(e))))
      ? undefined
      : "This library sequence";
  },
  execute(effect, ctx) {
    const library = ctx.query.zone("library", ctx.playerId).objectIds;
    if (typeof effect.count === "object" && "until" in effect.count) {
      // The cards are revealed one at a time until one matches.
      const until = effect.count.until;
      const revealed: string[] = [];
      for (const id of library) {
        revealed.push(id);
        if (ctx.eval.matches(ctx.query.object(id), until)) break;
      }
      const last = revealed.at(-1);
      const found =
        last !== undefined && ctx.eval.matches(ctx.query.object(last), until)
          ? last
          : undefined;
      if (found) moveSelected(effect.select!, found, ctx);
      bottomRest(
        effect,
        revealed.filter((id) => id !== found),
        ctx,
      );
      return done;
    }
    const ids = library.slice(0, ctx.eval.value(effect.count));
    if (!ids.length) return done;
    ctx.inspect(ids);
    const filter = effect.select?.filter;
    if (!isSelection(effect)) {
      ctx.prompt(
        {
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
    }
    const eligible = filter
      ? ids.filter((id) => ctx.eval.matches(ctx.query.object(id), filter))
      : ids;
    ctx.prompt(
      {
        select: {
          count: 1,
          // A filter makes the selection optional ("you may"); without one
          // a card must be chosen.
          minCount: filter ? 0 : 1,
          objectIds: eligible,
          label: filter ? "Select a card (optional)" : "Select a card",
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
    if (isSelection(effect)) {
      for (const id of ids) moveSelected(effect.select!, id, ctx);
      bottomRest(
        effect,
        inspected.filter((id) => !ids.includes(id)),
        ctx,
      );
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
