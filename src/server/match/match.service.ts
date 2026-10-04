import { Injectable } from "@nestjs/common";
import { randomInt, randomUUID } from "node:crypto";
import type {
  Catalog,
  Characteristics,
  GameObject,
  MatchAction,
  MatchState,
  Participant,
  RoomState,
  ZoneKind,
} from "../../shared/model.js";
import { phaseSteps } from "../../shared/model.js";
import { Library, zoneFor } from "./zones.js";
import { canInspectIdentity, canTurnFaceUp } from "./object-visibility.js";

export function gameObject(
  kind: GameObject["kind"],
  zoneId: string,
  controllerId: string,
  characteristics: Characteristics,
): GameObject {
  return {
    id: randomUUID(),
    kind,
    zoneId,
    controllerId,
    characteristics: structuredClone(characteristics),
    components: [structuredClone(characteristics)],
    artwork: [],
    cardInstanceIds: [],
    currentFace: 0,
    status: { tapped: false, flipped: false, phasedOut: false },
    designations: [],
    counters: [],
    faceDown: null,
    protectorId: null,
    choices: [],
    variables: [],
    attachmentTo: null,
    links: [],
    casting: null,
    stickerPlacements: [],
  };
}

@Injectable()
export class MatchService {
  create(room: RoomState, catalog: Catalog, startingLife: string): MatchState {
    const participants = room.participants.filter(
      (participant) => participant.ready && participant.selectedDecklistId,
    );
    if (participants.length < 1 || participants.length > 4)
      throw new Error(
        "One to four participants must select Decklists and mark ready.",
      );
    const match: MatchState = {
      id: randomUUID(),
      mode: "manual",
      revision: 0,
      players: [],
      instances: {},
      objects: {},
      zones: [],
      layout: { kind: "spatial", positions: {} },
      turn: { activePlayerId: "", number: 1, stepIndex: 0, order: [] },
      outcome: "ongoing",
      openingHandActions: [],
      copiableValues: {},
      stickerSheets: [],
      diceRolls: [],
    };
    const addZone = (kind: ZoneKind, name: string, ownerId?: string) => {
      const zone = {
        id: randomUUID(),
        kind,
        name,
        ownerId,
        visibility:
          kind === "library" || kind === "hand"
            ? ("private" as const)
            : ("public" as const),
        objectIds: [] as string[],
      };
      match.zones.push(zone);
      return zone;
    };
    participants.forEach((participant, seat) => {
      const player = {
        id: randomUUID(),
        participantId: participant.id,
        name: participant.name,
        seat,
        life: startingLife,
        outcome: "playing" as const,
        counters: [],
      };
      match.players.push(player);
      const library = addZone("library", `${player.name}'s Library`, player.id);
      addZone("hand", `${player.name}'s Hand`, player.id);
      addZone("graveyard", `${player.name}'s Graveyard`, player.id);
      const decklist = participant.decklists.find(
        (decklist) => decklist.id === participant.selectedDecklistId,
      );
      if (!decklist)
        throw new Error("A selected Decklist is no longer available.");
      for (const entry of decklist.entries) {
        const definition = catalog.definitions[entry.definitionId];
        const printing = catalog.printings[entry.printingId];
        if (!definition || !printing)
          throw new Error(
            "A selected printing is no longer in the local Card Catalog.",
          );
        for (let i = 0; i < entry.quantity; i++) {
          const instance = {
            id: randomUUID(),
            definitionId: definition.id,
            printingId: printing.id,
            ownerId: player.id,
          };
          match.instances[instance.id] = instance;
          const object = gameObject(
            "card",
            library.id,
            player.id,
            definition.components[0],
          );
          object.cardInstanceIds = [instance.id];
          object.components = structuredClone(definition.components);
          object.artwork = printing.artwork;
          match.objects[object.id] = object;
          library.objectIds.push(object.id);
        }
      }
    });
    for (const [kind, name] of [
      ["battlefield", "Battlefield"],
      ["stack", "Stack"],
      ["exile", "Exile"],
      ["command", "Command Zone"],
    ] as const)
      addZone(kind, name);
    match.turn.order = match.players.map((player) => player.id);
    match.turn.activePlayerId = match.turn.order[0];
    return match;
  }

  apply(
    match: MatchState,
    participant: Participant,
    action: MatchAction,
  ): string | undefined {
    const player = match.players.find(
      (player) => player.participantId === participant.id,
    );
    let notice: string | undefined;
    switch (action.type) {
      case "create-zone": {
        if (match.zones.length >= 100)
          throw new Error("This Match already has 100 Zones.");
        if (
          action.ownerId &&
          !match.players.some((player) => player.id === action.ownerId)
        )
          throw new Error("Zone owner not found.");
        if (action.visibility === "private" && !action.ownerId)
          throw new Error("A private Zone requires an owning Match Player.");
        match.zones.push({
          id: randomUUID(),
          kind: action.kind,
          name: action.name,
          visibility: action.visibility,
          ownerId: action.ownerId,
          objectIds: [],
        });
        break;
      }
      case "opening-hand": {
        if (!player)
          throw new Error(
            "Only Match Players record their Opening-Hand Actions.",
          );
        if (action.objectId)
          this.requireIdentity(
            this.object(match, action.objectId, player.id),
            player.id,
          );
        const record = {
          playerId: player.id,
          objectId: action.objectId,
          description: action.description,
          taken: action.taken,
          result: action.result,
        };
        const existing = match.openingHandActions.findIndex(
          (record) =>
            record.playerId === player.id &&
            record.objectId === action.objectId &&
            record.description === action.description,
        );
        if (existing >= 0) match.openingHandActions[existing] = record;
        else if (match.openingHandActions.length < 1000)
          match.openingHandActions.push(record);
        else throw new Error("Opening-hand record capacity reached.");
        break;
      }
      case "copy": {
        const source = this.object(match, action.sourceId, player?.id);
        this.requireIdentity(source, player?.id);
        const values = structuredClone(
          action.characteristics ??
            (source.copiableValuesId
              ? match.copiableValues[source.copiableValuesId]
              : source.characteristics),
        );
        const existing = Object.entries(match.copiableValues).find(
          ([, snapshot]) => JSON.stringify(snapshot) === JSON.stringify(values),
        );
        const valuesId = existing?.[0] ?? randomUUID();
        match.copiableValues[valuesId] ??= values;
        const target = action.targetId
          ? this.object(match, action.targetId, player?.id)
          : gameObject(
              "token",
              source.zoneId,
              player?.id ?? source.controllerId,
              values,
            );
        this.requireIdentity(target, player?.id);
        target.characteristics = structuredClone(values);
        target.copiableValuesId = valuesId;
        if (!action.targetId) {
          match.objects[target.id] = target;
          zoneFor(match, target.zoneId).insert(target.id);
          if (zoneFor(match, target.zoneId).state.kind === "battlefield")
            match.layout.positions[target.id] = {
              x: (match.layout.positions[source.id]?.x ?? 20) + 125,
              y: match.layout.positions[source.id]?.y ?? 80,
            };
        }
        break;
      }
      case "meld": {
        if (new Set(action.objectIds).size !== 2)
          throw new Error("Choose two different Game Objects.");
        const parts = action.objectIds.map((id) =>
          this.object(match, id, player?.id),
        );
        for (const part of parts) this.requireIdentity(part, player?.id);
        if (
          parts.some((part) => part.cardInstanceIds.length !== 1) ||
          parts[0].zoneId !== parts[1].zoneId
        )
          throw new Error(
            "Choose two single-card Game Objects in the same Zone.",
          );
        const meld = gameObject(
          "card",
          parts[0].zoneId,
          parts[0].controllerId,
          action.characteristics,
        );
        meld.cardInstanceIds = parts.flatMap((part) => part.cardInstanceIds);
        meld.meldParts = structuredClone(parts);
        const zone = zoneFor(match, meld.zoneId);
        const index = Math.min(
          ...parts.map((part) => zone.state.objectIds.indexOf(part.id)),
        );
        const position = match.layout.positions[parts[0].id] ?? {
          x: 20,
          y: 80,
        };
        for (const part of parts) {
          zone.remove(part.id);
          delete match.objects[part.id];
          delete match.layout.positions[part.id];
        }
        match.objects[meld.id] = meld;
        zone.insert(meld.id, index);
        if (zone.state.kind === "battlefield")
          match.layout.positions[meld.id] = position;
        break;
      }
      case "unmeld": {
        const meld = this.object(match, action.objectId, player?.id);
        this.requireIdentity(meld, player?.id);
        if (!meld.meldParts)
          throw new Error("This Game Object does not contain melded cards.");
        const zone = zoneFor(match, meld.zoneId);
        const index = zone.state.objectIds.indexOf(meld.id);
        const position = match.layout.positions[meld.id] ?? { x: 20, y: 80 };
        zone.remove(meld.id);
        delete match.objects[meld.id];
        delete match.layout.positions[meld.id];
        meld.meldParts.forEach((part, i) => {
          const object = gameObject(
            part.kind,
            zone.state.id,
            part.controllerId,
            part.components[0],
          );
          object.cardInstanceIds = part.cardInstanceIds;
          object.components = part.components;
          object.artwork = part.artwork;
          object.faceDown = part.faceDown;
          object.currentFace = part.currentFace;
          object.characteristics = structuredClone(part.characteristics);
          match.objects[object.id] = object;
          zone.insert(object.id, index + i);
          if (zone.state.kind === "battlefield")
            match.layout.positions[object.id] = {
              x: position.x + i * 125,
              y: position.y,
            };
        });
        break;
      }
      case "sticker-sheets": {
        if (!player)
          throw new Error("Only Match Players select Sticker Sheets.");
        match.stickerSheets = [
          ...match.stickerSheets.filter(
            (sheets) => sheets.playerId !== player.id,
          ),
          { playerId: player.id, sheetIds: [...new Set(action.sheetIds)] },
        ];
        break;
      }
      case "sticker": {
        const object = this.object(match, action.objectId, player?.id);
        this.requireIdentity(object, player?.id);
        object.stickerPlacements = [
          ...object.stickerPlacements.filter(
            (sticker) => sticker.stickerId !== action.stickerId,
          ),
          { stickerId: action.stickerId, order: action.order },
        ].sort((a, b) => a.order - b.order);
        break;
      }
      case "patch-object": {
        const object = this.object(match, action.objectId, player?.id);
        const patch = action.patch;
        if (
          object.faceDown &&
          (patch.faceDown === null || patch.controllerId !== undefined) &&
          !canTurnFaceUp(match, object, player?.id)
        )
          throw new Error(
            "Only an inspector, owner or controller may reveal or change control of this face-down object.",
          );
        if (
          (patch.faceDown !== undefined && patch.faceDown !== null) ||
          patch.currentFace !== undefined ||
          patch.characteristics ||
          patch.casting !== undefined ||
          patch.choices ||
          patch.variables
        )
          this.requireIdentity(object, player?.id);
        for (const playerId of [
          patch.controllerId,
          patch.protectorId,
          ...(patch.faceDown?.inspectableBy ?? []),
        ]) {
          if (
            playerId &&
            !match.players.some((player) => player.id === playerId)
          )
            throw new Error("Match Player not found.");
        }
        if (patch.characteristics && object.cardInstanceIds.length)
          throw new Error(
            "Edit custom objects; printed card characteristics come from the Card Catalog.",
          );
        if (patch.currentFace !== undefined) {
          if (patch.currentFace >= object.components.length)
            throw new Error("That card face is not available.");
          object.characteristics = structuredClone(
            object.components[patch.currentFace],
          );
        }
        if (patch.attachmentTo)
          this.object(match, patch.attachmentTo, player?.id);
        for (const link of patch.links ?? [])
          for (const target of link.objectIds)
            this.object(match, target, player?.id);
        if (
          patch.casting &&
          !match.zones.some((zone) => zone.id === patch.casting!.sourceZoneId)
        )
          throw new Error("Casting source Zone not found.");
        Object.assign(object, patch);
        if (patch.characteristics)
          object.components = [structuredClone(patch.characteristics)];
        break;
      }
      case "life": {
        const target = match.players.find(
          (player) => player.id === action.playerId,
        );
        if (!target) throw new Error("Match Player not found.");
        target.life = BigInt(action.value).toString();
        break;
      }
      case "counter": {
        const target =
          match.players.find((player) => player.id === action.targetId) ??
          this.object(match, action.targetId, player?.id);
        const quantity = BigInt(action.quantity).toString();
        target.counters = target.counters.filter(
          (counter) => counter.kind !== action.kind,
        );
        if (quantity !== "0")
          target.counters.push({ kind: action.kind, quantity });
        break;
      }
      case "turn": {
        if (action.order) {
          if (
            new Set(action.order).size !== match.players.length ||
            action.order.length !== match.players.length ||
            action.order.some(
              (id) => !match.players.some((player) => player.id === id),
            )
          )
            throw new Error(
              "Turn order must include every Match Player exactly once.",
            );
          match.turn.order = action.order;
        }
        if (action.activePlayerId) {
          if (
            !match.players.some((player) => player.id === action.activePlayerId)
          )
            throw new Error("Match Player not found.");
          match.turn.activePlayerId = action.activePlayerId;
        }
        if (action.number !== undefined) match.turn.number = action.number;
        if (action.stepIndex !== undefined)
          match.turn.stepIndex = action.stepIndex;
        if (action.direction) {
          const direction = action.direction === "next" ? 1 : -1;
          let step = match.turn.stepIndex + direction;
          if (step < 0 || step >= phaseSteps.length) {
            step = (step + phaseSteps.length) % phaseSteps.length;
            const index = match.turn.order.indexOf(match.turn.activePlayerId);
            match.turn.activePlayerId =
              match.turn.order[
                (index + direction + match.turn.order.length) %
                  match.turn.order.length
              ];
            match.turn.number = Math.max(1, match.turn.number + direction);
          }
          match.turn.stepIndex = step;
        }
        break;
      }
      case "roll": {
        const roll = {
          participantId: participant.id,
          name: participant.name,
          sides: action.sides,
          value: randomInt(1, action.sides + 1),
        };
        match.diceRolls = [
          ...match.diceRolls.filter(
            (roll) => roll.participantId !== participant.id,
          ),
          roll,
        ];
        notice = `${participant.name} rolled ${roll.value} (d${roll.sides}). Choose the starting player together.`;
        break;
      }
      case "outcome": {
        if (action.playerId) {
          const target = match.players.find(
            (player) => player.id === action.playerId,
          );
          if (!target || !action.playerStatus)
            throw new Error("Choose a Match Player and status.");
          target.outcome = action.playerStatus;
        }
        match.outcome = action.value;
        break;
      }
      case "create-object": {
        const zone = zoneFor(match, action.zoneId);
        zone.requireAccess(player?.id);
        if (action.kind === "card")
          throw new Error(
            "Use your imported Decklist to create Card Instances.",
          );
        if (!match.players.some((player) => player.id === action.controllerId))
          throw new Error("Controller not found.");
        if (Object.keys(match.objects).length >= 50000)
          throw new Error("This Match has reached its object capacity.");
        const object = gameObject(
          action.kind,
          zone.state.id,
          action.controllerId,
          action.characteristics,
        );
        if (action.sourceObjectId) {
          this.object(match, action.sourceObjectId, player?.id);
          object.sourceObjectId = action.sourceObjectId;
        }
        object.sourceAbilityId = action.sourceAbilityId;
        match.objects[object.id] = object;
        zone.insert(object.id);
        if (zone.state.kind === "battlefield")
          match.layout.positions[object.id] = {
            x: 30 + (Object.keys(match.layout.positions).length % 6) * 125,
            y: 80,
          };
        break;
      }
      case "remove-object": {
        const object = this.object(match, action.objectId, player?.id);
        if (object.cardInstanceIds.length)
          throw new Error(
            "Move card-backed objects to a Zone instead of deleting them.",
          );
        zoneFor(match, object.zoneId).remove(object.id);
        delete match.objects[object.id];
        delete match.layout.positions[object.id];
        break;
      }
      case "move": {
        const object = this.object(match, action.objectId, player?.id);
        const destination = zoneFor(match, action.zoneId);
        let directed = false;
        if (action.directedBy) {
          const source = this.object(
            match,
            action.directedBy.sourceId,
            player?.id,
          );
          if (!player || source.controllerId !== player.id)
            throw new Error(
              "Only the ability controller may direct a move into another player’s private Zone.",
            );
          this.requireIdentity(object, player.id);
          directed = true;
        }
        if (
          action.cast &&
          (destination.state.kind !== "stack" ||
            action.cast.sourceZoneId !== object.zoneId)
        )
          throw new Error(
            "A Casting Record must identify the actual source Zone of a spell moved to the Stack.",
          );
        if (action.cast) {
          this.requireIdentity(object, player?.id);
          if (
            action.cast.components.some(
              (component) => component >= object.components.length,
            )
          )
            throw new Error("That casting component is not available.");
        }
        const moved = this.move(
          match,
          object.id,
          destination.state.id,
          player?.id,
          action.index,
          directed,
        );
        if (action.cast) {
          moved.casting = action.cast;
          const face = action.cast.components[0] ?? object.currentFace;
          moved.currentFace = face;
          moved.characteristics = structuredClone(object.components[face]);
        } else if (
          destination.state.kind === "stack" &&
          object.zoneId !== destination.state.id &&
          object.cardInstanceIds.length
        )
          moved.casting = {
            sourceZoneId: object.zoneId,
            modes: [],
            components: [object.currentFace],
            additionalCosts: [],
            manaSpent: [],
          };
        if (destination.state.kind === "battlefield")
          match.layout.positions[moved.id] = action.position ?? {
            x: 30 + (Object.keys(match.layout.positions).length % 6) * 125,
            y: 80,
          };
        break;
      }
      case "position": {
        const object = this.object(match, action.objectId, player?.id);
        if (zoneFor(match, object.zoneId).state.kind !== "battlefield")
          throw new Error("Only Battlefield objects have spatial positions.");
        match.layout.positions[object.id] = action.position;
        break;
      }
      case "shuffle": {
        const zone = zoneFor(match, action.zoneId);
        if (!(zone instanceof Library))
          throw new Error("Choose a Library to shuffle.");
        zone.shuffle(player?.id);
        break;
      }
      case "draw": {
        if (!player) throw new Error("You are waiting for the next Match.");
        const library = match.zones.find(
          (zone) => zone.kind === "library" && zone.ownerId === player.id,
        )!;
        const hand = match.zones.find(
          (zone) => zone.kind === "hand" && zone.ownerId === player.id,
        )!;
        if (action.count > library.objectIds.length)
          throw new Error("There are not enough cards in your Library.");
        for (let i = 0; i < action.count; i++)
          this.move(match, library.objectIds[0], hand.id, player.id);
        break;
      }
      default:
        throw new Error("This Match action is not available yet.");
    }
    match.revision++;
    return notice;
  }

  private object(match: MatchState, objectId: string, actorId?: string) {
    const object = match.objects[objectId];
    if (!object) throw new Error("This Game Object has already moved.");
    zoneFor(match, object.zoneId).requireAccess(actorId);
    return object;
  }
  private requireIdentity(object: GameObject, actorId?: string) {
    if (!canInspectIdentity(object, actorId))
      throw new Error("You may not inspect this face-down Game Object.");
  }
  private move(
    match: MatchState,
    objectId: string,
    destinationId: string,
    actorId?: string,
    index?: number,
    directed = false,
  ): GameObject {
    const object = match.objects[objectId];
    if (!object) throw new Error("This Game Object has already moved.");
    const source = zoneFor(match, object.zoneId);
    const destination = zoneFor(match, destinationId);
    source.requireAccess(actorId);
    if (!directed) destination.requireAccess(actorId);
    source.remove(objectId);
    if (source.state.id === destination.state.id) {
      destination.insert(objectId, index);
      return object;
    }
    const fresh = gameObject(
      object.kind,
      destinationId,
      object.controllerId,
      object.components[0],
    );
    fresh.cardInstanceIds = object.cardInstanceIds;
    fresh.components = object.components;
    fresh.artwork = object.artwork;
    fresh.faceDown = object.faceDown;
    fresh.meldParts = object.meldParts;
    if (
      destination.state.kind === "stack" ||
      destination.state.kind === "battlefield"
    ) {
      fresh.currentFace = object.currentFace;
      fresh.characteristics = structuredClone(object.characteristics);
    }
    if (!object.cardInstanceIds.length) {
      fresh.copiableValuesId = object.copiableValuesId;
      fresh.sourceObjectId = object.sourceObjectId;
      fresh.sourceAbilityId = object.sourceAbilityId;
    }
    if (
      source.state.kind === "stack" &&
      destination.state.kind === "battlefield"
    ) {
      fresh.casting = object.casting;
      fresh.currentFace = object.currentFace;
      fresh.characteristics = object.characteristics;
      fresh.choices = object.choices;
      fresh.variables = object.variables;
      fresh.copiableValuesId = object.copiableValuesId;
      fresh.sourceObjectId = object.sourceObjectId;
      fresh.sourceAbilityId = object.sourceAbilityId;
    }
    delete match.objects[objectId];
    delete match.layout.positions[objectId];
    match.objects[fresh.id] = fresh;
    destination.insert(fresh.id, index);
    return fresh;
  }
}
