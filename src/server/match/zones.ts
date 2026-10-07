import { randomInt } from "node:crypto";
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
  const state = match.zones.find((zone) => zone.id === zoneId);
  if (!state) throw new Error("Zone not found.");
  return state.kind === "library" ? new Library(state) : new Zone(state);
}
