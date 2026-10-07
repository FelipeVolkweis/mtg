// Iteration budgets for engine loops: a rules loop that never settles throws
// instead of hanging the process.

export class RulesLoopError extends Error {
  constructor(loop: string, limit: number) {
    super(`${loop} exceeded ${limit} iterations.`);
    this.name = "RulesLoopError";
  }
}

/** Throws once `count` exceeds `limit`. */
export function budget(loop: string, count: number, limit: number) {
  if (count > limit) throw new RulesLoopError(loop, limit);
}
