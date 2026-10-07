import { randomUUID } from "node:crypto";
import type { GameObject, MatchAction } from "../../shared/model.js";
import type { SelectionOption } from "../../shared/rules.js";
import type { Effect } from "../../shared/rules-v2.js";
import type { ProposedEvent } from "../rules/context.js";
import { Evaluator, type Scope } from "../rules/vm/evaluate.js";
import type {
  EffectContext,
  PromptOptions,
} from "../rules/vm/effects/types.js";
import {
  newExecution,
  put,
  RuleVM,
  runtimeValue,
  scopeBindings,
  type VMResult,
} from "../rules/vm/rule-vm.js";
import { Combat } from "./combat.js";
import type { RulesEngine } from "./rules-engine.js";

// The Rule VM's view of the Match: the effect context handlers run against,
// and the resolution prompt. The execution state is `rules.resolving`.

export class Resolution {
  constructor(readonly engine: RulesEngine) {}
  get execution() {
    return this.engine.rules.resolving!;
  }

  /** Starts executing a resolving object's instructions; see `run`. */
  start(object: GameObject, instructions: Effect[]): VMResult {
    this.engine.rules.resolving = newExecution(
      object.id,
      object.controllerId,
      instructions,
      Object.fromEntries(
        object.variables.map((variable) => [
          variable.name,
          Number(variable.value),
        ]),
      ),
    );
    return this.vm().run();
  }

  /** Answers the waiting instruction and continues. */
  answer(action: Extract<MatchAction, { type: "rules-input" }>): VMResult {
    return this.vm().answer(action);
  }

  private vm() {
    return new RuleVM(
      this.execution,
      () => this.context(),
      () => delete this.engine.rules.pending,
    );
  }

  scope(): Scope {
    const execution = this.execution;
    const stack = this.engine.object(execution.stackObjectId);
    return {
      playerId: execution.controllerId,
      sourceId: stack.sourceObjectId ?? stack.id,
      targetIds: stack.resolution?.targetIds ?? [],
      event: stack.resolution?.event,
      ...scopeBindings(execution),
    };
  }

  context(): EffectContext {
    const engine = this.engine;
    const execution = this.execution;
    const scope = this.scope();
    const view = scope as Required<
      Pick<Scope, "bindings" | "objects" | "players">
    >;
    return {
      query: engine.query,
      propose: (event: ProposedEvent) => engine.propose(event),
      rules: engine.rules,
      playerId: execution.controllerId,
      stackId: execution.stackObjectId,
      sourceId: scope.sourceId!,
      eval: new Evaluator(engine.query, scope),
      scoped: (extra) => new Evaluator(engine.query, { ...scope, ...extra }),
      bind(name, value) {
        const typed = runtimeValue(value);
        execution.bindings[name] = typed;
        put(view, name, typed);
      },
      inspect(ids) {
        execution.inspectedIds = ids;
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
      playerId: extra.playerId ?? this.execution.controllerId,
      kind: "resolve",
      stage: extra.payment ? "payment" : "selection",
      sourceId: this.execution.stackObjectId,
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
}
