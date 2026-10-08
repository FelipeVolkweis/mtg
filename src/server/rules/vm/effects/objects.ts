import type { PlayerRef, Selector } from "../../../../shared/card-dsl.js";
import { gameObject } from "../../../match/game-objects.js";
import { tokenCharacteristics } from "../../../match/tokens.js";
import { astEqual } from "../../ast.js";
import { selection } from "./selection.js";
import { choiceOf } from "./zone-change.js";
import { done, type EffectContext, type EffectHandler } from "./types.js";
import { RuleViolation } from "../../rule-violation.js";

// Object instructions: damage (CR 120), tap (CR 701.21), counters (CR 122),
// attach (CR 701.3) and tokens (CR 111).

const playerRefs = new Set([
  "you",
  "opponents",
  "each-player",
  "active-player",
]);

/** Damage recipients: players by reference, or objects (and players) by selector. */
function recipients(to: Selector | PlayerRef, ctx: EffectContext) {
  if (typeof to === "string")
    return playerRefs.has(to)
      ? ctx.eval.players(to as PlayerRef)
      : ctx.eval.objects(to as Selector);
  if (
    "controllerOf" in to ||
    "ownerOf" in to ||
    ("event" in to && to.event === "player") ||
    ("binding" in to && ctx.eval.scope.players?.[to.binding])
  )
    return ctx.eval.players(to as PlayerRef);
  return ctx.eval.objects(to as Selector);
}

export const damage: EffectHandler<"damage"> = {
  unsupported: (effect) =>
    effect.source ? "Damage from another source" : undefined,
  execute(effect, ctx) {
    const amount = ctx.eval.value(effect.amount);
    const ids = recipients(effect.to, ctx);
    // The resolving object is the damage source; the event runtime reads its
    // source's last known information if that has left (CR 609.7).
    ctx.propose({
      kind: "damage",
      assignments: ids.map((recipientId) => ({
        sourceId: ctx.stackId,
        recipientId,
        amount,
      })),
      combat: false,
    });
    if (effect.bind) ctx.bind(effect.bind, amount * ids.length);
    return done;
  },
};

export const tap: EffectHandler<"tap"> = {
  unsupported(effect) {
    const choice = choiceOf(effect.objects);
    if (choice && (choice.chooser || !astEqual(choice.count, { min: 0 })))
      return "Tapping other than any number of chosen objects";
    return undefined;
  },
  execute(effect, ctx) {
    const choice = choiceOf(effect.objects);
    if (choice) {
      const ids = ctx.eval.candidates(choice);
      ctx.prompt(
        {
          select: {
            count: ids.length,
            minCount: 0,
            objectIds: ids,
            label: "Tap any number of eligible objects (optional)",
          },
        },
        "Choose an optional tap payment.",
      );
      return { kind: "suspend", state: null };
    }
    const ids = ctx.eval
      .objects(effect.objects)
      .filter((id) => ctx.query.match.objects[id]);
    for (const id of ids) ctx.query.object(id).status.tapped = true;
    if (effect.bind) ctx.bind(effect.bind, ids);
    return done;
  },
  answer(effect, _state, input, ctx) {
    const { ids } = selection(ctx, input);
    const choice = choiceOf(effect.objects)!;
    if (ids.some((id) => !ctx.eval.matches(ctx.query.object(id), choice.from)))
      throw new RuleViolation("Choose untapped eligible objects.");
    for (const id of ids) ctx.query.object(id).status.tapped = true;
    if (effect.bind) ctx.bind(effect.bind, ids);
    return done;
  },
};

export const addCounters: EffectHandler<"add-counters"> = {
  execute(effect, ctx) {
    const battlefield = ctx.query.zone("battlefield").id;
    const count = ctx.eval.value(effect.count);
    let added = 0;
    for (const id of new Set(ctx.eval.objects(effect.objects))) {
      const object = ctx.query.match.objects[id];
      if (object?.zoneId !== battlefield || !count) continue;
      const counter = object.counters.find((c) => c.kind === effect.counter);
      if (counter)
        counter.quantity = (
          BigInt(counter.quantity) + BigInt(count)
        ).toString();
      else
        object.counters.push({ kind: effect.counter, quantity: String(count) });
      added += count;
    }
    if (effect.bind) ctx.bind(effect.bind, added);
    return done;
  },
};

/** Attaches an Equipment to a creature (CR 301.5c); illegal attachments do nothing. */
export const attach: EffectHandler<"attach"> = {
  execute(effect, ctx) {
    const { query } = ctx;
    const [sourceId] = ctx.eval.objects(effect.object ?? "source");
    const [toId] = ctx.eval.objects(effect.to);
    const source = query.match.objects[sourceId ?? ""];
    const target = query.match.objects[toId ?? ""];
    if (!source || !target) return done;
    const battlefield = query.zone("battlefield").id;
    if (
      source.zoneId !== battlefield ||
      target.zoneId !== battlefield ||
      source.id === target.id ||
      !query.effective(target).types?.includes("Creature") ||
      !source.characteristics.subtypes?.includes("Equipment") ||
      query.effective(source).types?.includes("Creature")
    )
      return done;
    source.attachmentTo = target.id;
    return done;
  },
};

export const createToken: EffectHandler<"create-token"> = {
  unsupported: (effect) =>
    tokenCharacteristics[effect.token]
      ? undefined
      : `The ${effect.token} token`,
  execute(effect, ctx) {
    const characteristics = tokenCharacteristics[effect.token];
    const count = effect.count === undefined ? 1 : ctx.eval.value(effect.count);
    const controller = effect.controller
      ? ctx.eval.players(effect.controller)[0]
      : ctx.playerId;
    const battlefield = ctx.query.zone("battlefield");
    const created: string[] = [];
    for (let i = 0; controller && i < count; i++) {
      const token = gameObject(
        "token",
        battlefield.id,
        controller,
        controller,
        characteristics,
      );
      if (effect.tapped) token.status.tapped = true;
      ctx.propose({ kind: "create", object: token, zone: battlefield });
      created.push(token.id);
    }
    if (effect.bind) ctx.bind(effect.bind, created);
    return done;
  },
};
