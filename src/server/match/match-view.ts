import type {
  Catalog,
  MatchView,
  ObjectView,
  ProcedurePrompt,
} from "../../shared/model.js";
import type { MatchState, PendingProcedure } from "../../shared/rules-state.js";
import { procedureHandler } from "../rules/procedures/registry.js";
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
      zone.kind !== "library" &&
      (zoneFor(match, zone.id).canInspect(playerId) ||
        zoneFor(match, zone.id).canInspect(choicePlayerId));
    if (visible)
      for (const objectId of zone.objectIds) {
        const object = match.objects[objectId];
        objects[objectId] = {
          ...object,
          characteristics: catalog
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
  for (const id of match.rules.revealedHandIds ?? []) {
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
  const proposed = match.rules.pending?.proposal?.stackObjectId;
  if (proposed && objects[proposed])
    objects[proposed] = { ...objects[proposed], beingCast: true };
  // Build the projection explicitly: no private-zone identifiers cross the transport.
  return {
    id: match.id,
    revision: match.revision,
    priority: match.priority,
    ...(() => {
      const {
        pending,
        commanderReplay,
        commanderReturns,
        checkpoint,
        orderedTriggerPlayerIds,
        resolving,
        waitingTriggers,
        triggerPlacement,
        continuousEffects,
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
            ? {
                playerId: pending.playerId,
                promptKind: procedureHandler(pending).prompt(
                  engine ?? new RulesEngine(match, noCatalog),
                  pending,
                ).promptKind,
              }
            : undefined,
          prompt:
            pending && pending.playerId === choicePlayerId
              ? prompt(match, pending, catalog)
              : undefined,
        },
        actions: engine && playerId ? engine.actions(choicePlayerId!) : [],
      };
    })(),
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

const noCatalog: Catalog = {
  definitions: {},
  printings: {},
  names: {},
  importedSets: [],
};

/**
 * The responsible player's prompt (rules-engine-refactor.md §57): what is
 * asked and its options, never the authored ability, internal stage names
 * or the proposal's rollback snapshot.
 */
function prompt(
  match: MatchState,
  pending: PendingProcedure,
  catalog: Catalog = noCatalog,
): ProcedurePrompt {
  const engine = new RulesEngine(match, catalog);
  const handler = procedureHandler(pending);
  const { promptKind, title, targets } = handler.prompt(engine, pending);
  return {
    procedureId: pending.id,
    promptKind,
    title,
    ...(pending.context ? { context: pending.context } : {}),
    targets: targets ?? [],
    options: handler.options(engine, pending),
    selections: structuredClone(pending.selections),
    ...(handler.manaWindow(pending)
      ? { lockedCost: { ...pending.totalCost } }
      : {}),
    ...(pending.damageChoices
      ? { damageChoices: structuredClone(pending.damageChoices) }
      : {}),
    canAbort: handler.canAbort?.(pending) ?? false,
    canReverse: handler.canReverse?.(pending) ?? false,
  };
}
