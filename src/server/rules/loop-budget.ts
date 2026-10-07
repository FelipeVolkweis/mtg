// Iteration budgets for engine loops: a rules loop that never settles throws
// instead of hanging the process.

export class RulesLoopError extends Error {
  constructor(loop: string, limit: number) {
    super(`${loop} exceeded ${limit} iterations.`);
    this.name = "RulesLoopError";
  }
}

/** Total loop iterations one action may spend across every engine loop. */
const actionLimit = 20_000;
let action: { ticks: number } | undefined;

/** Runs `run` with a fresh shared work budget for one action. */
export function withActionBudget<T>(run: () => T): T {
  const previous = action;
  action = { ticks: 0 };
  try {
    return run();
  } finally {
    action = previous;
  }
}

/** Throws once `count` exceeds `limit` or the action's shared budget runs out. */
export function budget(loop: string, count: number, limit: number) {
  if (count > limit) throw new RulesLoopError(loop, limit);
  if (action && ++action.ticks > actionLimit)
    throw new RulesLoopError(`${loop} (action total)`, actionLimit);
}
