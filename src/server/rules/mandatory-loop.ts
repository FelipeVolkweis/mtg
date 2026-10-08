import { createHash } from "node:crypto";
import type { MatchState } from "../../shared/rules-state.js";

// Mandatory loop detection (CR 104.4b). The engine is deterministic, so a
// checkpoint or state-based check that comes back to a game state it already
// passed through, with no player choice in between, would repeat forever: the
// game is a draw. A fingerprint renames every id by its first appearance —
// players and zones in order first — so a permanent that leaves and returns
// as a new object still matches. Renaming is one-to-one, so two states that
// differ in anything but their ids never share a fingerprint.

export class MandatoryLoop extends Error {
  constructor(loop: string) {
    super(`${loop} repeated a game state.`);
    this.name = "MandatoryLoop";
  }
}

/** Remembers the states one loop passed through. */
export class LoopDetector {
  private readonly seen = new Set<string>();
  constructor(readonly loop: string) {}

  /** Records the current state; throws if this loop already passed it. */
  visit(match: MatchState) {
    const print = fingerprint(match);
    if (this.seen.has(print)) throw new MandatoryLoop(this.loop);
    this.seen.add(print);
  }
}

const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** A hash of the game state that ignores which ids things happen to have. */
export function fingerprint(match: MatchState) {
  const ids = new Map<string, number>();
  const rename = (text: string) =>
    text.replace(uuid, (id) => {
      let ordinal = ids.get(id.toLowerCase());
      if (ordinal === undefined) ids.set(id.toLowerCase(), (ordinal = ids.size));
      return `#${ordinal}`;
    });
  for (const player of match.players) rename(player.id);
  for (const zone of match.zones) {
    rename(zone.id);
    zone.objectIds.forEach(rename);
  }
  const canonical = (value: unknown): string => {
    if (typeof value === "string") return JSON.stringify(rename(value));
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (!value || typeof value !== "object") return JSON.stringify(value);
    const entries = Object.keys(value)
      .sort()
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .map((key) => [rename(key), (value as Record<string, unknown>)[key]] as const)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(",")}}`;
  };
  const { revision: _revision, ...state } = match;
  return createHash("sha256").update(canonical(state)).digest("base64");
}
