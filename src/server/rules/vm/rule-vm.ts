import type {
  ExecutionFrame,
  RuleExecution,
  RuntimeValue,
} from "../../../shared/rules.js";
import type { Effect } from "../../../shared/rules-v2.js";
import { answerEffect, executeEffect } from "./effects/registry.js";
import type {
  EffectContext,
  ExecutionResult,
  RulesInput,
} from "./effects/types.js";
import type { Scope } from "./evaluate.js";

// Rule VM (rules-engine-refactor.md §31–33): runs a resolving spell or
// ability's Core AST instructions. Execution state is Match data: frames with
// program counters and typed bindings. A handler's nested instructions run in
// a new frame; a handler waiting for a choice leaves its frame's program
// counter on itself, so a restored Match answers it without replaying
// anything. The VM owns no turn, Priority or Stack logic.

export type VMResult = { kind: "suspend" } | { kind: "complete" };

/** A new execution of `instructions`, with the chosen values bound. */
export function newExecution(
  stackObjectId: string,
  controllerId: string,
  instructions: Effect[],
  numbers: Record<string, number> = {},
): RuleExecution {
  return {
    stackObjectId,
    controllerId,
    frames: [{ instructions: structuredClone(instructions), pc: 0 }],
    bindings: Object.fromEntries(
      Object.entries(numbers).map(([name, value]) => [
        name,
        { kind: "number", value },
      ]),
    ),
  };
}

/** A binding value from a handler's result: a number or an object set. */
export function runtimeValue(value: number | string[]): RuntimeValue {
  return Array.isArray(value)
    ? { kind: "objects", ids: [...value] }
    : { kind: "number", value };
}

/**
 * The bindings visible to the current instruction, in the Evaluator's three
 * maps: execution bindings, then each enclosing frame's locals (inner wins).
 */
export function scopeBindings(
  execution: RuleExecution,
): Required<Pick<Scope, "bindings" | "objects" | "players">> {
  const scope = { bindings: {}, objects: {}, players: {} } as Required<
    Pick<Scope, "bindings" | "objects" | "players">
  >;
  const layers = [
    execution.bindings,
    ...execution.frames.map((frame) => frame.locals ?? {}),
  ];
  for (const layer of layers)
    for (const [name, value] of Object.entries(layer)) put(scope, name, value);
  return scope;
}

/** Writes a typed value into the Evaluator's view. */
export function put(
  scope: Required<Pick<Scope, "bindings" | "objects" | "players">>,
  name: string,
  value: RuntimeValue,
) {
  delete scope.bindings[name];
  delete scope.objects[name];
  delete scope.players[name];
  if (value.kind === "number") scope.bindings[name] = value.value;
  else if (value.kind === "objects") scope.objects[name] = [...value.ids];
  else scope.players[name] = value.id;
}

const top = (execution: RuleExecution): ExecutionFrame | undefined =>
  execution.frames.at(-1);

export class RuleVM {
  constructor(
    readonly execution: RuleExecution,
    /** The context for the current instruction. */
    readonly context: () => EffectContext,
    /** Clears the answered prompt. */
    readonly answered: () => void = () => {},
  ) {}

  get finished() {
    return !this.execution.frames.length;
  }

  /** The instruction at the current program counter. */
  current(): Effect | undefined {
    this.unwind();
    const frame = top(this.execution);
    return frame?.instructions[frame.pc];
  }

  /** Runs until an instruction suspends or every frame completes. */
  run(): VMResult {
    for (;;) {
      const instruction = this.current();
      if (!instruction) return { kind: "complete" };
      if (!this.apply(executeEffect(instruction, this.context())))
        return { kind: "suspend" };
    }
  }

  /** Answers the waiting instruction, then continues. */
  answer(input: RulesInput): VMResult {
    const waiting = this.execution.waiting;
    const instruction = this.current();
    if (!waiting || !instruction)
      throw new Error("Nothing is waiting for an answer.");
    const result = answerEffect(
      instruction,
      waiting.state,
      input,
      this.context(),
    );
    if (result.kind !== "suspend") {
      delete this.execution.waiting;
      delete this.execution.inspectedIds;
      this.answered();
    }
    if (!this.apply(result)) return { kind: "suspend" };
    return this.run();
  }

  /** Applies a handler's result; false when the instruction suspends. */
  private apply(result: ExecutionResult) {
    const execution = this.execution;
    if (result.kind === "suspend") {
      execution.waiting = { state: result.state };
      return false;
    }
    top(execution)!.pc++;
    if (result.kind === "continue" && result.effects.length)
      execution.frames.push({
        instructions: structuredClone(result.effects),
        pc: 0,
      });
    return true;
  }

  /** Pops completed frames. */
  private unwind() {
    const frames = this.execution.frames;
    while (
      frames.length &&
      frames.at(-1)!.pc >= frames.at(-1)!.instructions.length
    )
      frames.pop();
  }
}
