import { randomUUID } from "node:crypto";
import type {
  GameObject,
  MatchAction,
  SelectionOption,
} from "../../shared/rules-state.js";
import type { Effect } from "../../shared/card-dsl.js";
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
  start(
    object: GameObject,
    instructions: Effect[],
    targets?: Record<string, string[]>,
  ): VMResult {
    this.engine.rules.resolving = newExecution(
      object.id,
      object.controllerId,
      instructions,
      { ...object.proposal?.variables },
    );
    // The player a spell's gift was promised to (CR 702.174a).
    if (object.proposal?.gift)
      this.engine.rules.resolving.bindings["gift-recipient"] = {
        kind: "player",
        id: object.proposal.gift,
      };
    // Only the targets that are still legal are affected (CR 608.2b).
    if (targets && Object.keys(targets).length)
      this.engine.rules.resolving.targets = targets;
    return this.vm().run();
  }

  /** The waiting instruction is done (it cast a spell): continue after it. */
  resume(): VMResult {
    return this.vm().resume();
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
      targetIds: execution.targets
        ? Object.values(execution.targets).flat()
        : (stack.resolution?.targetIds ?? []),
      ...(execution.targets ? { targets: execution.targets } : {}),
      ...(stack.resolution?.division
        ? { division: stack.resolution.division }
        : {}),
      event: stack.resolution?.event,
      lastKnown: execution.lastKnown,
      optionalCosts: stack.resolution?.sourceSnapshot?.optionalCosts,
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
      propose(event: ProposedEvent) {
        const result = engine.propose(event);
        // "Its controller" still names who controlled an object that left.
        if (event.kind === "zone-change" && result.lastKnown)
          (execution.lastKnown ??= {})[event.objectId] = {
            controllerId: result.lastKnown.controllerId,
            ownerId: result.lastKnown.ownerId,
          };
        return result;
      },
      playableFree: (playerId, id) => engine.playableFree(playerId, id),
      playFree: (playerId, id) => engine.playFree(playerId, id),
      addMana: (playerId, produce, color) =>
        engine.produceMana(playerId, produce, color),
      addTemporaryEffect: (effect) => engine.addTemporaryEffect(effect),
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
