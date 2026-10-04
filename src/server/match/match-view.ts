import type { MatchState, MatchView, ObjectView } from "../../shared/model.js";
import { zoneFor } from "./zones.js";
import { canInspectIdentity, canTurnFaceUp } from "./object-visibility.js";

export function matchView(match: MatchState, participantId: string): MatchView {
  const playerId = match.players.find(
    (player) => player.participantId === participantId,
  )?.id;
  const objects: Record<string, ObjectView> = {};
  const instances: MatchView["instances"] = {};
  const zones = match.zones.map((zone) => {
    const visible = zoneFor(match, zone.id).canInspect(playerId);
    if (visible)
      for (const objectId of zone.objectIds) {
        const object = match.objects[objectId];
        const hidden = !canInspectIdentity(object, playerId);
        if (hidden) {
          objects[objectId] = {
            id: object.id,
            zoneId: object.zoneId,
            controllerId: object.controllerId,
            characteristics: object.faceDown!.characteristics,
            hidden: true,
            melded: !!object.meldParts,
            canTurnFaceUp: canTurnFaceUp(match, object, playerId),
            status: object.status,
            counters: object.counters,
          };
        } else {
          const { meldParts, ...visibleObject } = object;
          const cardInstanceIds = meldParts
            ? meldParts
                .filter((part) => canInspectIdentity(part, playerId))
                .flatMap((part) => part.cardInstanceIds)
            : object.cardInstanceIds;
          objects[objectId] = {
            ...visibleObject,
            cardInstanceIds,
            hidden: false,
            melded: !!meldParts,
            canTurnFaceUp: canTurnFaceUp(match, object, playerId),
          };
          for (const instanceId of cardInstanceIds)
            instances[instanceId] = match.instances[instanceId];
        }
      }
    return {
      id: zone.id,
      kind: zone.kind,
      name: zone.name,
      ownerId: zone.ownerId,
      visibility: zone.visibility,
      count: zone.objectIds.length,
      ...(visible ? { objectIds: [...zone.objectIds] } : {}),
    };
  });
  const copiableValues: MatchView["copiableValues"] = {};
  for (const object of Object.values(objects)) {
    if (object.hidden) continue;
    object.links = object.links?.map((link) => ({
      ...link,
      objectIds: link.objectIds.filter((id) => !!objects[id]),
    }));
    if (object.attachmentTo && !objects[object.attachmentTo])
      object.attachmentTo = null;
    if (
      object.sourceObjectId &&
      (!objects[object.sourceObjectId] || objects[object.sourceObjectId].hidden)
    ) {
      delete object.sourceObjectId;
      delete object.sourceAbilityId;
    }
    if (object.copiableValuesId)
      copiableValues[object.copiableValuesId] =
        match.copiableValues[object.copiableValuesId];
  }
  // Build the projection explicitly: no private-zone identifiers or underlying face-down data cross the transport.
  return {
    id: match.id,
    mode: match.mode,
    revision: match.revision,
    players: match.players.map((player) => ({
      ...player,
      mulliganCount: player.mulliganCount ?? 0,
    })),
    instances,
    objects,
    zones,
    layout: {
      kind: "spatial",
      positions: Object.fromEntries(
        Object.entries(match.layout.positions).filter(([id]) => !!objects[id]),
      ),
    },
    turn: match.turn,
    outcome: match.outcome,
    openingHandActions: match.openingHandActions.filter(
      (action) => action.playerId === playerId,
    ),
    copiableValues,
    stickerSheets: match.stickerSheets,
    diceRolls: match.diceRolls,
  };
}
