import { randomInt } from "node:crypto";
import type { ZoneKind } from "../../shared/card-dsl.js";
import type { MatchState, ZoneState } from "../../shared/rules-state.js";

export class Zone {
  constructor(readonly state: ZoneState) {}
  canInspect(playerId?: string) {
    return (
      this.state.visibility === "public" ||
      (!!playerId && this.state.ownerId === playerId)
    );
  }
  requireAccess(playerId?: string) {
    if (!this.canInspect(playerId))
      throw new Error(
        "Only the owning Match Player may inspect or manipulate this private Zone.",
      );
  }
  remove(objectId: string) {
    const index = this.state.objectIds.indexOf(objectId);
    if (index < 0) throw new Error("This Game Object has already moved.");
    this.state.objectIds.splice(index, 1);
  }
  insert(objectId: string, index = this.state.objectIds.length) {
    if (index > this.state.objectIds.length)
      throw new Error("That Zone position no longer exists.");
    this.state.objectIds.splice(index, 0, objectId);
  }
}
export class Library extends Zone {
  shuffle(playerId?: string) {
    this.requireAccess(playerId);
    for (let i = this.state.objectIds.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [this.state.objectIds[i], this.state.objectIds[j]] = [
        this.state.objectIds[j],
        this.state.objectIds[i],
      ];
    }
  }
}
export function zoneFor(match: MatchState, zoneId: string) {
  const state = zoneById(match, zoneId);
  if (!state) throw new Error("Zone not found.");
  return state.kind === "library" ? new Library(state) : new Zone(state);
}

/** A Match's Zones by id and by kind and owner. */
interface ZoneIndex {
  zones: number;
  byId: Map<string, ZoneState>;
  byKind: Map<string, ZoneState>;
}
// Zones are created with the Match and never change kind, owner or id; a
// rolled-back proposal replaces the whole array, which gets a new index.
const zoneIndexes = new WeakMap<ZoneState[], ZoneIndex>();

function zoneIndex(match: MatchState): ZoneIndex {
  const existing = zoneIndexes.get(match.zones);
  if (existing?.zones === match.zones.length) return existing;
  const index: ZoneIndex = {
    zones: match.zones.length,
    byId: new Map(),
    byKind: new Map(),
  };
  for (const zone of match.zones) {
    const keys = [
      zone.kind,
      ...(zone.ownerId ? [`${zone.kind}:${zone.ownerId}`] : []),
    ];
    if (!index.byId.has(zone.id)) index.byId.set(zone.id, zone);
    for (const key of keys)
      if (!index.byKind.has(key)) index.byKind.set(key, zone);
  }
  zoneIndexes.set(match.zones, index);
  return index;
}

/** The Zone with an id, in constant time. */
export function zoneById(match: MatchState, zoneId: string) {
  return zoneIndex(match).byId.get(zoneId);
}

/**
 * The Zone of a kind owned by `playerId`, in constant time. Without a player
 * it is the first Zone of that kind, as `RulesQuery.zone` reads it.
 */
export function zoneOf(match: MatchState, kind: ZoneKind, playerId?: string) {
  return zoneIndex(match).byKind.get(playerId ? `${kind}:${playerId}` : kind);
}
