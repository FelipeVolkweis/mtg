import { randomUUID } from "node:crypto";
import type {
  Characteristics,
  GameObject,
  MatchState,
  ZoneState,
} from "../../shared/model.js";
export function gameObject(
  kind: GameObject["kind"],
  zoneId: string,
  controllerId: string,
  ownerId: string,
  characteristics: Characteristics,
): GameObject {
  return {
    id: randomUUID(),
    kind,
    zoneId,
    controllerId,
    ownerId,
    characteristics: structuredClone(characteristics),
    components: [structuredClone(characteristics)],
    artwork: [],
    cardInstanceIds: [],
    currentFace: 0,
    status: { tapped: false },
    counters: [],
    variables: [],
    attachmentTo: null,
    links: [],
    casting: null,
  };
}

export function moveObject(
  match: MatchState,
  objectId: string,
  destination: ZoneState,
  index?: number,
): GameObject {
  const object = match.objects[objectId];
  if (!object) throw new Error("This Game Object has already moved.");
  const source = match.zones.find((zone) => zone.id === object.zoneId)!;
  source.objectIds.splice(source.objectIds.indexOf(objectId), 1);
  if (source.id === destination.id) {
    destination.objectIds.splice(
      index ?? destination.objectIds.length,
      0,
      objectId,
    );
    return object;
  }
  const fresh = gameObject(
    object.kind,
    destination.id,
    object.controllerId,
    object.ownerId,
    object.components[0],
  );
  fresh.cardInstanceIds = object.cardInstanceIds;
  if (
    match.rules &&
    destination.kind !== "stack" &&
    destination.kind !== "battlefield"
  )
    fresh.controllerId = object.ownerId;
  fresh.components = object.components;
  fresh.artwork = object.artwork;
  if (destination.kind === "stack" || destination.kind === "battlefield") {
    fresh.currentFace = object.currentFace;
    fresh.characteristics = structuredClone(object.characteristics);
  }
  if (
    !object.cardInstanceIds.length ||
    (source.kind === "stack" && destination.kind === "battlefield")
  ) {
    fresh.sourceObjectId = object.sourceObjectId;
    fresh.sourceAbilityId = object.sourceAbilityId;
  }
  if (source.kind === "stack" && destination.kind === "battlefield") {
    fresh.casting = object.casting;
    fresh.variables = object.variables;
  }
  for (const other of Object.values(match.objects)) {
    if (other.attachmentTo === objectId) other.attachmentTo = null;
  }
  if (match.rules) {
    delete match.rules.markedDamage?.[objectId];
    delete match.rules.controlledSinceTurn[objectId];
    match.rules.temporaryEffects = match.rules.temporaryEffects?.filter(
      (effect) => effect.sourceId !== objectId,
    );
  }
  delete match.objects[objectId];
  match.objects[fresh.id] = fresh;
  destination.objectIds.splice(
    index ?? destination.objectIds.length,
    0,
    fresh.id,
  );
  if (destination.kind === "battlefield") {
    if (match.rules)
      match.rules.controlledSinceTurn[fresh.id] = match.turn.number;
  }
  return fresh;
}
