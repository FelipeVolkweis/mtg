import { randomUUID } from "node:crypto";
import type { GameObject, MatchAction } from "../../shared/model.js";
import type { SelectionOption } from "../../shared/rules.js";
import type { ProposedEvent } from "../rules/context.js";
import { Evaluator, type Scope } from "../rules/vm/evaluate.js";
import { answerEffect, executeEffect } from "../rules/vm/effects/registry.js";
import type {
  EffectContext,
  ExecutionResult,
  PromptOptions,
} from "../rules/vm/effects/types.js";
import { Combat } from "./combat.js";
import type { RulesEngine } from "./rules-engine.js";

// Runs a resolving spell or ability's Core AST instructions through the
// effect handler registry. The queue and bindings are Match data: each
// instruction is removed before its handler runs, and a handler waiting for a
// choice keeps itself in `waiting`, so reconnecting resumes there.

export class Resolution {
  constructor(readonly engine: RulesEngine) {}
  get progress() {
    return this.engine.rules.resolving!;
  }

  /** Starts resolving the top object of the Stack. */
  start(object: GameObject) {
    const resolution = object.resolution!;
    this.engine.rules.resolving = {
      sourceId: object.id,
      playerId: object.controllerId,
      remaining: structuredClone(resolution.ability.effects),
      bindings: Object.fromEntries(
        object.variables.map((variable) => [
          variable.name,
          Number(variable.value),
        ]),
      ),
    };
    this.resume();
  }

  scope(): Scope {
    const progress = this.progress;
    const stack = this.engine.object(progress.sourceId);
    return {
      playerId: progress.playerId,
      sourceId: stack.sourceObjectId ?? stack.id,
      targetIds: stack.resolution?.targetIds ?? [],
      event: stack.resolution?.event,
      bindings: progress.bindings,
      objects: (progress.objects ??= {}),
      players: (progress.players ??= {}),
    };
  }

  context(): EffectContext {
    const engine = this.engine;
    const progress = this.progress;
    const scope = this.scope();
    return {
      query: engine.query,
      propose: (event: ProposedEvent) => engine.propose(event),
      rules: engine.rules,
      playerId: progress.playerId,
      stackId: progress.sourceId,
      sourceId: scope.sourceId!,
      eval: new Evaluator(engine.query, scope),
      scoped: (extra) => new Evaluator(engine.query, { ...scope, ...extra }),
      bind(name, value) {
        if (Array.isArray(value)) progress.objects![name] = value;
        else progress.bindings[name] = value;
      },
      inspect(ids) {
        progress.inspectedIds = ids;
      },
      prompt: (options, context, extra) => this.prompt(options, context, extra),
      get options() {
        return engine.rules.pending?.options ?? {};
      },
      redirectDestinations: (attackerId) =>
        new Combat(engine).redirectDestinations(attackerId),
    };
  }

  prompt(
    options: Record<string, SelectionOption>,
    context: string,
    extra: PromptOptions = {},
  ) {
    this.engine.rules.pending = {
      id: randomUUID(),
      playerId: extra.playerId ?? this.progress.playerId,
      kind: "resolve",
      stage: extra.payment ? "payment" : "selection",
      sourceId: this.progress.sourceId,
      targetIds: [],
      selections: {},
      totalCost: extra.payment ?? {
        W: 0,
        U: 0,
        B: 0,
        R: 0,
        G: 0,
        C: 0,
        generic: 0,
      },
      options,
      context,
    };
  }

  /** Applies a handler's result; true when the queue may continue. */
  private after(result: ExecutionResult) {
    const progress = this.progress;
    if (result.kind === "continue")
      progress.remaining.unshift(...result.effects);
    return result.kind !== "suspend";
  }

  resume() {
    const progress = this.progress;
    while (progress.remaining.length) {
      const effect = progress.remaining.shift()!;
      const result = executeEffect(effect, this.context());
      if (result.kind === "suspend") {
        progress.waiting = { effect, state: result.state };
        return;
      }
      this.after(result);
    }
    const source = this.engine.object(progress.sourceId);
    delete this.engine.rules.resolving;
    delete this.engine.rules.pending;
    this.engine.finishResolution(source, true);
    this.engine.priority();
  }

  answer(action: Extract<MatchAction, { type: "rules-input" }>) {
    const progress = this.progress;
    const waiting = progress.waiting;
    if (!waiting) throw new Error("Nothing is waiting for an answer.");
    const result = answerEffect(
      waiting.effect,
      waiting.state,
      action,
      this.context(),
    );
    if (result.kind === "suspend") {
      progress.waiting = { effect: waiting.effect, state: result.state };
      return;
    }
    delete progress.waiting;
    delete progress.inspectedIds;
    delete this.engine.rules.pending;
    this.after(result);
    this.resume();
  }
}
