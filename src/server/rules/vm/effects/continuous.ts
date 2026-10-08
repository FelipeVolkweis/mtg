import type { AppliedChange } from "../../../../shared/rules-state.js";
import type {
  ContinuousChange,
  Duration,
  Selector,
} from "../../../../shared/card-dsl.js";
import {
  appliedChange,
  grantKeyword,
  runtimeKeyword,
} from "../../abilities.js";
import { done, type EffectContext, type EffectHandler } from "./types.js";

// Effects that last a duration (CR 611): continuous changes to objects and
// rule-modifying grants. The runtime applies them as temporary effects on one
// permanent until end of turn; values are locked in as they apply (CR 611.2c).

function apply(
  objects: Selector,
  changes: (ctx: EffectContext) => AppliedChange[],
  ctx: EffectContext,
) {
  const { query } = ctx;
  const battlefield = query.zone("battlefield").id;
  const stack = query.match.objects[ctx.stackId];
  for (const id of ctx.eval.objects(objects)) {
    const object = query.match.objects[id];
    if (object?.zoneId !== battlefield) continue;
    ctx.addTemporaryEffect({
      sourceId: object.id,
      abilityId: stack?.sourceAbilityId ?? "animation",
      playerId: ctx.playerId,
      objects: { all: { zone: "battlefield", is: "source" } },
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

function unsupportedChange(change: ContinuousChange) {
  if (change.kind === "gain-control") return "Gaining control";
  if (change.kind === "grant-keyword" && !runtimeKeyword(change.keyword))
    return `The ${change.keyword} keyword`;
  return undefined;
}

/** A change with its values locked in (CR 611.2c). */
function locked(change: ContinuousChange, ctx: EffectContext): AppliedChange {
  const applied = appliedChange(change);
  if (
    applied.kind === "set-base-stats" ||
    applied.kind === "add-stats" ||
    applied.kind === "define-stats"
  )
    return {
      ...applied,
      power: ctx.eval.value(applied.power),
      toughness: ctx.eval.value(applied.toughness),
    };
  return applied;
}

export const applyContinuous: EffectHandler<"apply-continuous"> = {
  unsupported: (effect) =>
    unsupportedDuration(effect.duration) ??
    effect.changes.map(unsupportedChange).find(Boolean),
  execute: (effect, ctx) =>
    apply(
      effect.objects,
      (c) => effect.changes.map((change) => locked(change, c)),
      ctx,
    ),
};

export const applyGrant: EffectHandler<"apply-grant"> = {
  unsupported: (effect) =>
    unsupportedDuration(effect.duration) ??
    (grantKeyword(effect.grant)
      ? undefined
      : effect.grant.kind === "block-restriction"
        ? "A block restriction other than by Walls"
        : `Applying the ${effect.grant.kind} grant`),
  execute(effect, ctx) {
    const keyword = grantKeyword(effect.grant)!;
    return apply(
      keyword.objects,
      () => [{ kind: "grant-keyword", keyword: keyword.keyword }],
      ctx,
    );
  },
};
