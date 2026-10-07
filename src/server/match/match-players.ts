import type { MatchState } from "../../shared/model.js";

// A solo controller owns required choices for the practice seat. Spectators
// never acquire a player identity through delegation.
export function actingPlayer(match: MatchState, participantId: string) {
  const own = match.players.find((p) => p.participantId === participantId);
  if (!own) return undefined;
  const practice = match.rules.practice;
  return practice?.controllerParticipantId === participantId &&
    match.rules.pending?.playerId === practice.playerId
    ? match.players.find((p) => p.id === practice.playerId)
    : own;
}
