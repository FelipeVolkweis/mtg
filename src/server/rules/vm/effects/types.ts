import type {
  ActiveContinuousEffect,
  JsonValue,
  ManaPool,
  MatchAction,
  RulesState,
  SelectionOption,
} from "../../../../shared/rules-state.js";
import type { Effect } from "../../../../shared/card-dsl.js";
import type { RulesMutator } from "../../context.js";
import type { Evaluator, Scope } from "../evaluate.js";

// Effect Handler Registry contract (docs/rules-engine.md). Each Core
// effect kind has one handler. A handler runs its instruction against an
// EffectContext and either finishes, hands back nested instructions to run
// next, or suspends for a player's answer with state that survives
// persistence.

export type EffectKind = Effect["kind"];
export type EffectOf<K extends EffectKind> = Extract<Effect, { kind: K }>;
export type RulesInput = Extract<MatchAction, { type: "rules-input" }>;

export type ExecutionResult =
  | { kind: "done" }
  /** Run these instructions next, then continue the queue. */
  | { kind: "continue"; effects: Effect[] }
  /** A prompt is pending; `answer` resumes with this state. */
  | { kind: "suspend"; state: JsonValue };

export const done: ExecutionResult = { kind: "done" };

export interface PromptOptions {
  /** Who answers; the resolving controller by default. */
  playerId?: string;
  /** A payment prompt: mana abilities may be activated while it waits. */
  payment?: ManaPool & { generic: number };
}

export interface EffectContext extends RulesMutator {
  readonly rules: RulesState;
  /** The controller of the resolving spell or ability. */
  readonly playerId: string;
  /** The resolving spell or ability on the Stack. */
  readonly stackId: string;
  /** The ability's source, or the spell itself (possibly gone: use LKI). */
  readonly sourceId: string;
  readonly eval: Evaluator;
  /** An evaluator with extra bindings, e.g. `for-each-player`'s player. */
  scoped(extra: Partial<Scope>): Evaluator;
  /** An until-end-of-turn continuous effect starts (CR 611.2). */
  addTemporaryEffect(effect: ActiveContinuousEffect): void;
  /** Names an instruction's result: a number or an object set. */
  bind(name: string, value: number | string[]): void;
  prompt(
    options: Record<string, SelectionOption>,
    context: string,
    extra?: PromptOptions,
  ): void;
  /** Shows Library cards to the chooser until the instruction finishes. */
  inspect(ids: string[]): void;
  /** The pending prompt's options (when answering). */
  readonly options: Record<string, SelectionOption>;
  /** Where an attacker may be redirected (CR 506.4). */
  redirectDestinations(
    attackerId: string,
  ): { id: string; playerId: string; name: string }[];
}

export interface EffectHandler<K extends EffectKind = EffectKind> {
  /**
   * Load-time check: what in this instruction the runtime can't run, as a
   * noun phrase ("Exile until an event"), or undefined.
   */
  unsupported?(effect: EffectOf<K>): string | undefined;
  execute(effect: EffectOf<K>, ctx: EffectContext): ExecutionResult;
  /** Resumes a suspended instruction with the player's answer. */
  answer?(
    effect: EffectOf<K>,
    state: JsonValue,
    input: RulesInput,
    ctx: EffectContext,
  ): ExecutionResult;
}
