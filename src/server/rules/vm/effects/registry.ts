import type { JsonValue } from "../../../../shared/rules-state.js";
import type { Effect } from "../../../../shared/card-dsl.js";
import { reselectDefender } from "./combat.js";
import { applyContinuous, applyGrant } from "./continuous.js";
import {
  forEachPlayer,
  ifThen,
  may,
  mayPay,
  nested,
  sequence,
} from "./control.js";
import { chooseOne, discard } from "./discard.js";
import { librarySequence } from "./library.js";
import { addCounters, attach, createToken, damage, tap } from "./objects.js";
import { becomeMonarch, draw, gainLife, loseLife } from "./players.js";
import type {
  EffectContext,
  EffectHandler,
  EffectKind,
  ExecutionResult,
  RulesInput,
} from "./types.js";
import { counter, destroy, exile, move, sacrifice } from "./zone-change.js";
import type { Registry } from "../../support-check.js";

// Effect Handler Registry (rules-engine-refactor.md §34): one handler per
// Core effect kind. A kind without a handler can't run yet; the catalog
// loader rejects implemented cards that use it.

const handlers: { [K in EffectKind]?: EffectHandler<K> } = {
  move,
  destroy,
  sacrifice,
  exile,
  counter,
  "library-sequence": librarySequence,
  draw,
  discard,
  "gain-life": gainLife,
  "lose-life": loseLife,
  "become-monarch": becomeMonarch,
  damage,
  tap,
  "add-counters": addCounters,
  attach,
  "create-token": createToken,
  "apply-continuous": applyContinuous,
  "apply-grant": applyGrant,
  "reselect-defender": reselectDefender,
  sequence,
  if: ifThen,
  may,
  "may-pay": mayPay,
  "choose-one": chooseOne,
  "for-each-player": forEachPlayer,
};

function handler(kind: EffectKind): EffectHandler {
  const found = handlers[kind];
  if (!found)
    throw new Error(
      `The ${kind} effect is not supported by the current runtime.`,
    );
  return found as EffectHandler;
}

/** The kinds that have a handler. */
export const handledEffectKinds = Object.keys(handlers) as EffectKind[];

/**
 * The effect kinds the runtime executes. A handler's `unsupported` is its
 * support declaration; without one, every form of the kind runs.
 */
export const effectRegistry: Registry = handlers;

/**
 * What in an instruction (or its nested instructions) the runtime can't run,
 * as a noun phrase, or undefined when it all runs.
 */
export function unsupportedEffect(effect: Effect): string | undefined {
  const found = handlers[effect.kind] as EffectHandler | undefined;
  if (!found) return `The ${effect.kind} effect`;
  return found.unsupported?.(effect);
}

nested.unsupported = (effects) => effects.map(unsupportedEffect).find(Boolean);

export function executeEffect(
  effect: Effect,
  ctx: EffectContext,
): ExecutionResult {
  return handler(effect.kind).execute(effect, ctx);
}

export function answerEffect(
  effect: Effect,
  state: JsonValue,
  input: RulesInput,
  ctx: EffectContext,
): ExecutionResult {
  const found = handler(effect.kind);
  if (!found.answer) throw new Error(`The ${effect.kind} effect asks nothing.`);
  return found.answer(effect, state, input, ctx);
}
