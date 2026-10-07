import { MatchService } from "../../src/server/match/match.service";
import type { MatchState } from "../../src/shared/model";

// Round-trip mode (ROUND_TRIP=1): every command loads the Match the way the
// Room store does (a JSON document) and saves it the same way afterwards, so
// state that does not survive persistence fails the suite. See the rules test
// plan, §3.2.
export const roundTripEnabled = process.env.ROUND_TRIP === "1";

/** Throws when a value would be lost or changed by a JSON round trip. */
export function assertJsonSafe(value: unknown, path = "match"): void {
  if (value === null) return;
  switch (typeof value) {
    case "string":
    case "boolean":
      return;
    case "number":
      if (!Number.isFinite(value))
        throw new Error(`${path} is ${value}, which JSON stores as null.`);
      return;
    case "object":
      break;
    default:
      throw new Error(`${path} is a ${typeof value}, which JSON cannot store.`);
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      if (item === undefined)
        throw new Error(
          `${path}[${index}] is undefined, which JSON stores as null.`,
        );
      assertJsonSafe(item, `${path}[${index}]`);
    });
    return;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new Error(
      `${path} is a ${prototype?.constructor?.name ?? "class instance"}, which JSON does not restore.`,
    );
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined) continue; // dropped by JSON; absent and undefined read the same
    assertJsonSafe(item, `${path}.${key}`);
  }
}

function persist(match: MatchState) {
  assertJsonSafe(match);
  const restored = JSON.parse(JSON.stringify(match)) as MatchState;
  for (const key of Object.keys(match)) Reflect.deleteProperty(match, key);
  Object.assign(match, restored);
}

if (roundTripEnabled) {
  const execute = MatchService.prototype.execute;
  MatchService.prototype.execute = function (match, ...rest) {
    persist(match);
    const result = execute.call(this, match, ...rest);
    persist(match);
    return result;
  };
}
