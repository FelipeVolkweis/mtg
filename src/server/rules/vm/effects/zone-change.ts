import { cantBeCountered } from "../../abilities.js";
import type {
  Choice,
  Selector,
  ZoneKind,
} from "../../../../shared/rules-v2.js";
import { ownedZones, selection } from "./selection.js";
import {
  done,
  type EffectContext,
  type EffectHandler,
  type EffectOf,
} from "./types.js";

// Zone-change instructions (CR 701.7 destroy, 701.17 sacrifice, 406 exile,
// 701.5 counter, and plain moves). Every member of a set leaves at once: they
// share one snapshot of trigger sources and characteristics (§24, §56).

export type ObjectMove = EffectOf<"move" | "destroy" | "sacrifice" | "exile">;

export const choiceOf = (selector: Selector): Choice | undefined =>
  typeof selector === "object" && "choose" in selector
    ? selector.choose
    : undefined;

/** The existing objects an instruction could affect. */
export function candidates(effect: ObjectMove, ctx: EffectContext) {
  const choice = choiceOf(effect.objects);
  const ids = choice
    ? ctx.eval.candidates(choice)
    : ctx.eval.objects(effect.objects);
  return [...new Set(ids)].filter((id) => ctx.query.match.objects[id]);
}

/** Moves `ids` as one simultaneous event and binds the moved objects. */
export function performMove(
  effect: ObjectMove,
  ids: string[],
  ctx: EffectContext,
) {
  const { query } = ctx;
  const match = query.match;
  const battlefield = query.zone("battlefield");
  const sources = structuredClone(
    Object.values(match.objects).filter((o) => o.zoneId === battlefield.id),
  );
  const snapshots = new Map(
    ids.map((id) => [id, query.effective(query.object(id))]),
  );
  const source = match.objects[ctx.sourceId];
  const moved: string[] = [];
  for (const id of new Set(ids)) {
    const object = match.objects[id];
    if (!object) continue;
    const zone = match.zones.find((z) => z.id === object.zoneId)!;
    if (
      (effect.kind === "destroy" || effect.kind === "sacrifice") &&
      zone.kind !== "battlefield"
    )
      continue;
    // CR 702.12b: indestructible permanents aren't destroyed.
    if (
      effect.kind === "destroy" &&
      snapshots
        .get(id)
        ?.keywords?.some((k) => k.toLowerCase() === "indestructible")
    )
      continue;
    const kind =
      effect.kind === "exile"
        ? "exile"
        : effect.kind === "move"
          ? (effect.to as { zone: ZoneKind }).zone
          : "graveyard";
    const destination = query.zone(
      kind,
      ownedZones.has(kind) ? query.owner(object) : undefined,
    );
    const { object: fresh } = ctx.propose({
      kind: "zone-change",
      objectId: id,
      to: destination,
      simultaneous: { sources, before: snapshots.get(id) },
    });
    if (!fresh) continue;
    if (kind !== "battlefield") fresh.controllerId = query.owner(fresh);
    moved.push(fresh.id);
    if (
      effect.kind === "exile" &&
      effect.linkAs &&
      source &&
      object.kind === "card"
    )
      source.links.push({ label: effect.linkAs, objectIds: [fresh.id] });
  }
  if (effect.bind) ctx.bind(effect.bind, moved);
  return moved;
}

/** Prompts among the candidates; `optional` lets the player choose none. */
export function promptMove(
  effect: ObjectMove,
  ids: string[],
  ctx: EffectContext,
  optional: boolean,
) {
  ctx.prompt(
    {
      select: {
        count: choiceOf(effect.objects) ? 1 : ids.length,
        minCount: optional ? 0 : undefined,
        objectIds: ids,
        label: `${effect.kind} selected object(s)`,
      },
    },
    "Choose objects for the resolving effect.",
  );
}

/** What a moving instruction's selector or destination asks that the runtime can't do. */
export function unsupportedMove(effect: ObjectMove): string | undefined {
  const choice = choiceOf(effect.objects);
  if (choice && (choice.count !== 1 || choice.chooser))
    return "A choice of other than one object by you";
  if (effect.kind === "move") {
    const to = effect.to;
    if (
      typeof to !== "object" ||
      Object.keys(to).length !== 1 ||
      !["hand", "battlefield", "graveyard", "exile"].includes(to.zone)
    )
      return `Moving to ${JSON.stringify(to)}`;
  }
  if (effect.kind === "exile" && effect.until) return "Exile until an event";
  return undefined;
}

const moveHandler = <K extends ObjectMove["kind"]>(): EffectHandler<K> => ({
  unsupported: (effect) => unsupportedMove(effect as ObjectMove),
  execute(instruction, ctx) {
    const effect = instruction as ObjectMove;
    const ids = candidates(effect, ctx);
    const choose = !!choiceOf(effect.objects);
    if (choose && ids.length) {
      promptMove(effect, ids, ctx, false);
      return { kind: "suspend", state: null };
    }
    performMove(effect, choose ? [] : ids, ctx);
    return done;
  },
  answer(effect, _state, input, ctx) {
    performMove(effect as ObjectMove, selection(ctx, input).ids, ctx);
    return done;
  },
});

export const move = moveHandler<"move">();
export const destroy = moveHandler<"destroy">();
export const sacrifice = moveHandler<"sacrifice">();
export const exile = moveHandler<"exile">();

/**
 * Counters spells and abilities on the Stack (CR 701.5): a countered card goes
 * to its owner's Graveyard, an ability ceases to exist. "Can't be countered"
 * (CR 101.2) is a static grant of the spell's own definition.
 */
export const counter: EffectHandler<"counter"> = {
  execute(effect, ctx) {
    const { query } = ctx;
    const stack = query.zone("stack");
    const countered: string[] = [];
    for (const id of ctx.eval.objects(effect.objects)) {
      const object = query.match.objects[id];
      if (!object || object.zoneId !== stack.id) continue;
      if (cantBeCountered(query.definition(object)?.abilities ?? [])) continue;
      if (object.kind === "ability")
        ctx.propose({ kind: "cease", objectId: id });
      else
        ctx.propose({
          kind: "zone-change",
          objectId: id,
          to: query.zone("graveyard", query.owner(object)),
        });
      countered.push(id);
    }
    if (effect.bind) ctx.bind(effect.bind, countered);
    return done;
  },
};
