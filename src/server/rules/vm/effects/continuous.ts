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
  changes: (objectId: string) => AppliedChange[],
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
      changes: changes(id),
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
  if (change.kind === "grant-ability" && change.ability.kind === "static")
    return "A granted static ability";
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

/**
 * Doubling (CR 701.10): the creature gets +X/+X, where X is the value it has
 * as the effect applies, so it is worked out for each creature.
 */
function doubled(
  change: Extract<ContinuousChange, { kind: "double-stats" }>,
  ctx: EffectContext,
  objectId: string,
): AppliedChange {
  const characteristics = ctx.query.effective(ctx.query.object(objectId));
  const value = (stat: "power" | "toughness") =>
    change.stats.includes(stat) ? Number(characteristics[stat]) || 0 : 0;
  return {
    kind: "add-stats",
    power: value("power"),
    toughness: value("toughness"),
  };
}

export const applyContinuous: EffectHandler<"apply-continuous"> = {
  unsupported: (effect) =>
    unsupportedDuration(effect.duration) ??
    effect.changes.map(unsupportedChange).find(Boolean),
  execute(effect, ctx) {
    // The values are determined once, before any object changes (CR 611.2c).
    const fixed = effect.changes.map((change) =>
      change.kind === "double-stats" ? undefined : locked(change, ctx),
    );
    return apply(
      effect.objects,
      (id) =>
        effect.changes.map(
          (change, i) =>
            (fixed[i] && structuredClone(fixed[i])) ??
            doubled(
              change as Extract<ContinuousChange, { kind: "double-stats" }>,
              ctx,
              id,
            ),
        ),
      ctx,
    );
  },
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

/**
 * A temporary prevention effect (CR 615): "prevent all combat damage that
 * would be dealt this turn by …". It lasts until the cleanup step.
 */
export const applyReplacement: EffectHandler<"apply-replacement"> = {
  unsupported: (effect) =>
    effect.event.event !== "would-be-dealt-damage" ||
    effect.replace.kind !== "prevent" ||
    effect.event.recipient !== undefined
      ? `A ${effect.replace.kind} replacement of ${effect.event.event}`
      : unsupportedDuration(effect.duration),
  execute(effect, ctx) {
    const event = effect.event as Extract<
      typeof effect.event,
      { event: "would-be-dealt-damage" }
    >;
    ctx.rules.preventions ??= [];
    ctx.rules.preventions.push({
      sourceId: ctx.sourceId,
      playerId: ctx.playerId,
      ...(event.source ? { source: event.source } : {}),
      ...(event.combat === undefined ? {} : { combat: event.combat }),
    });
    return done;
  },
};
