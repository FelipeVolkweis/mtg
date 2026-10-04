import type { GameObject, MatchState } from "../../shared/model.js";

export function canInspectIdentity(
  object: GameObject,
  playerId?: string,
): boolean {
  return (
    !object.faceDown ||
    (!!playerId && object.faceDown.inspectableBy.includes(playerId))
  );
}

export function canTurnFaceUp(
  match: MatchState,
  object: GameObject,
  playerId?: string,
): boolean {
  return (
    !!playerId &&
    (canInspectIdentity(object, playerId) ||
      object.controllerId === playerId ||
      object.cardInstanceIds.some(
        (id) => match.instances[id]?.ownerId === playerId,
      ))
  );
}
