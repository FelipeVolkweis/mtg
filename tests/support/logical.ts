import type { MatchState } from "../../src/shared/rules-state";

/**
 * What players can tell about a Match, without generated identifiers: two
 * runs of the same commands mint different ids but reach the same state.
 */
export const logical = (match: MatchState) => ({
  zones: match.zones.map((zone) => ({
    kind: zone.kind,
    ownerId: zone.ownerId,
    names: zone.objectIds.map((id) => match.objects[id].characteristics.name),
  })),
  tapped: Object.values(match.objects)
    .filter((o) => o.status.tapped)
    .map((o) => o.characteristics.name)
    .sort(),
  counters: Object.values(match.objects)
    .filter((o) => o.counters.length)
    .map((o) => [o.characteristics.name, o.counters])
    .sort(),
  pending: match.rules.pending && {
    kind: match.rules.pending.kind,
    stage: match.rules.pending.stage,
    playerId: match.rules.pending.playerId,
    totalCost: match.rules.pending.totalCost,
  },
  mana: match.rules.mana,
  life: match.players.map((p) => p.life),
  outcome: match.outcome,
  turn: match.turn,
  priority: match.priority,
});
