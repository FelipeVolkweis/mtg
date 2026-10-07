import type {
  Catalog,
  MatchState,
  MatchView,
  ObjectView,
} from "../../shared/model.js";
import { CharacteristicsCalculator } from "./characteristics.js";
import { actingPlayer } from "./match-players.js";
import { RulesEngine } from "./rules-engine.js";
import { zoneFor } from "./zones.js";

export function matchView(
  match: MatchState,
  participantId: string,
  catalog?: Catalog,
): MatchView {
  const playerId = match.players.find(
    (player) => player.participantId === participantId,
  )?.id;
  const choicePlayerId = actingPlayer(match, participantId)?.id;
  const objects: Record<string, ObjectView> = {};
  const instances: MatchView["instances"] = {};
  const zones = match.zones.map((zone) => {
    const visible =
      !(match.mode === "rules" && zone.kind === "library") &&
      (zoneFor(match, zone.id).canInspect(playerId) ||
        zoneFor(match, zone.id).canInspect(choicePlayerId));
    if (visible)
      for (const objectId of zone.objectIds) {
        const object = match.objects[objectId];
        objects[objectId] = {
          ...object,
          characteristics:
            match.rules && catalog
              ? new CharacteristicsCalculator(match, catalog).effective(object)
              : object.characteristics,
        };
        for (const instanceId of object.cardInstanceIds)
          instances[instanceId] = match.instances[instanceId];
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
  if (
    match.rules &&
    match.rules.pending?.playerId === choicePlayerId &&
    match.rules.resolving?.inspectedIds
  ) {
    for (const id of match.rules.resolving.inspectedIds) {
      const object = match.objects[id];
      if (!object) continue;
      objects[id] = structuredClone(object);
      for (const instanceId of object.cardInstanceIds)
        instances[instanceId] = match.instances[instanceId];
    }
  }
  for (const id of match.rules?.revealedHandIds ?? []) {
    const object = match.objects[id];
    if (
      !object ||
      match.zones.find((z) => z.id === object.zoneId)?.kind !== "hand"
    )
      continue;
    objects[id] = structuredClone(object);
    for (const instanceId of object.cardInstanceIds)
      instances[instanceId] = match.instances[instanceId];
  }
  for (const object of Object.values(objects)) {
    if (object.resolution) {
      const { event, ...resolution } = object.resolution;
      object.resolution = resolution;
    }
    object.links = object.links?.map((link) => ({
      ...link,
      objectIds: link.objectIds.filter((id) => !!objects[id]),
    }));
    if (object.attachmentTo && !objects[object.attachmentTo])
      object.attachmentTo = null;
    if (object.sourceObjectId && !objects[object.sourceObjectId]) {
      delete object.sourceObjectId;
      delete object.sourceAbilityId;
    }
  }
  // Build the projection explicitly: no private-zone identifiers cross the transport.
  return {
    id: match.id,
    mode: match.mode,
    revision: match.revision,
    priority: match.priority,
    ...(match.rules
      ? (() => {
          const {
            pending,
            commanderReplay,
            commanderReturns,
            cleanupNeedsPriority,
            orderedTriggerPlayerIds,
            resolving,
            waitingTriggers,
            triggerPlacement,
            continuousEffects,
            priorityAfterTriggers,
            controlledSinceTurn,
            turnStarted,
            revealedHandIds,
            ...rules
          } = match.rules;
          const engine = catalog ? new RulesEngine(match, catalog) : undefined;
          return {
            rules: {
              ...rules,
              continuousEffects: engine
                ? new CharacteristicsCalculator(match, catalog!)
                    .active()
                    .filter((effect) => !!objects[effect.sourceId])
                : [],
              waiting: pending
                ? { playerId: pending.playerId, kind: pending.kind }
                : undefined,
              pending:
                pending && pending.playerId === choicePlayerId
                  ? {
                      ...pending,
                      legalTargetIds:
                        pending.ability?.target && engine
                          ? engine.legalTargets(
                              choicePlayerId!,
                              pending.ability.target,
                              engine.targetSource(pending),
                            )
                          : [],
                      selectionOptions: engine
                        ? engine.selectionOptions(pending)
                        : {},
                    }
                  : undefined,
            },
            actions: engine && playerId ? engine.actions(choicePlayerId!) : [],
          };
        })()
      : {}),
    players: match.players.map((player) => ({
      ...player,
      mulliganCount: player.mulliganCount ?? 0,
    })),
    instances,
    objects,
    zones,
    turn: match.turn,
    outcome: match.outcome,
  };
}
