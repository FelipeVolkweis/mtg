import type { ContinuousChange as V1Change } from "../../../../shared/rules.js";
import type {
  ContinuousChange,
  Duration,
  Selector,
} from "../../../../shared/rules-v2.js";
import {
  grantKeyword,
  lowersCleanly,
  v1Change,
  type Unsupported,
} from "../../lowering.js";
import { done, type EffectContext, type EffectHandler } from "./types.js";

// Effects that last a duration (CR 611): continuous changes to objects and
// rule-modifying grants. The runtime applies them as temporary effects on one
// permanent until end of turn; values are locked in as they apply (CR 611.2c).

const fail: Unsupported = (what) => {
  throw new Error(`${what} is not supported by the current runtime.`);
};

function apply(
  objects: Selector,
  changes: (ctx: EffectContext) => V1Change[],
  ctx: EffectContext,
) {
  const { query } = ctx;
  const battlefield = query.zone("battlefield").id;
  const stack = query.match.objects[ctx.stackId];
  for (const id of ctx.eval.objects(objects)) {
    const object = query.match.objects[id];
    if (object?.zoneId !== battlefield) continue;
    ctx.rules.temporaryEffects ??= [];
    ctx.rules.temporaryEffects.push({
      sourceId: object.id,
      abilityId: stack?.sourceAbilityId ?? "animation",
      playerId: ctx.playerId,
      filter: { zone: "battlefield", self: "only" },
      changes: changes(ctx),
      applicability: "until-end-of-turn",
    });
  }
  return done;
}

const unsupportedDuration = (duration: Duration) =>
  duration === "end-of-turn"
    ? undefined
    : `A ${JSON.stringify(duration)} duration`;

const lower = (
  changes: ContinuousChange[],
  ctx: EffectContext | undefined,
  unsupported: Unsupported,
) =>
  changes.map((change) =>
    v1Change(change, (value) => (ctx ? ctx.eval.value(value) : 0), unsupported),
  );

export const applyContinuous: EffectHandler<"apply-continuous"> = {
  unsupported: (effect) =>
    unsupportedDuration(effect.duration) ??
    lowersCleanly((unsupported) =>
      lower(effect.changes, undefined, unsupported),
    ),
  execute: (effect, ctx) =>
    apply(effect.objects, (c) => lower(effect.changes, c, fail), ctx),
};

export const applyGrant: EffectHandler<"apply-grant"> = {
  unsupported: (effect) =>
    unsupportedDuration(effect.duration) ??
    lowersCleanly((unsupported) => {
      if (!grantKeyword(effect.grant, unsupported))
        unsupported(`Applying the ${effect.grant.kind} grant`);
    }),
  execute(effect, ctx) {
    const keyword = grantKeyword(effect.grant, fail)!;
    return apply(
      keyword.objects,
      () => [{ kind: "grant-keyword", keyword: keyword.keyword }],
      ctx,
    );
  },
};
