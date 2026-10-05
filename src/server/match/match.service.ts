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
import { initialPosition } from "../../shared/table-layout.js";
import { Library, zoneFor } from "./zones.js";
import { validateCommanderDeck } from "./commander.js";
import { canInspectIdentity, canTurnFaceUp } from "./object-visibility.js";

export { gameObject } from "./game-objects.js";
import { gameObject, moveObject } from "./game-objects.js";
import { CommanderRules, CommanderReplacement } from "./commander-rules.js";
import { actingPlayer } from "./match-players.js";
import { RulesEngine } from "./rules-engine.js";

export type ExecutionResult =
  | { kind: "accepted"; notice?: string }
  | { kind: "pending"; playerId: string }
  | { kind: "rejected"; message: string };

export interface GameplayExecutor {
  execute(
    match: MatchState,
    participant: Participant,
    action: MatchAction,
    catalog: Catalog,
  ): ExecutionResult;
}

@Injectable()
export class MatchService implements GameplayExecutor {
  private create(
    room: RoomState,
    catalog: Catalog,
    startingLife: string,
  ): MatchState {
    const participants = room.participants.filter(
      (participant) => participant.ready && participant.selectedDecklistId,
    );
    if (participants.length < 1 || participants.length > 4)
      throw new Error(
        "One to four participants must select Decklists and mark ready.",
      );
    const match: MatchState = {
      id: randomUUID(),
      mode: "rules",
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
        mulliganCount: 0,
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

  validateCommanderSetup(
    room: RoomState,
    catalog: Catalog,
    startingParticipantId?: string,
  ) {
    const participants = room.participants.filter(
      (p) => p.ready && p.selectedDecklistId,
    );
    if (![1, 2].includes(participants.length))
      throw new Error("Commander requires one or two ready Room Participants.");
    const commanders = participants.map((p) =>
      validateCommanderDeck(p, catalog),
    );
    if (
      startingParticipantId &&
      !participants.some((p) => p.id === startingParticipantId)
    )
      throw new Error("Choose a starting Room Participant who is ready.");
    return { participants, commanders };
  }

  createCommander(
    room: RoomState,
    catalog: Catalog,
    startingParticipantId?: string,
  ): MatchState {
    const { participants, commanders } = this.validateCommanderSetup(
      room,
      catalog,
      startingParticipantId,
    );
    const solo = participants.length === 1;
    if (solo) {
      participants.push({
        ...structuredClone(participants[0]),
        id: randomUUID(),
        name: "Practice opponent",
      });
      commanders.push(commanders[0]);
    }
    const match = this.create({ ...room, participants }, catalog, "40");
    match.mode = "rules";
    const startingPlayerId =
      match.players[
        startingParticipantId
          ? participants.findIndex((p) => p.id === startingParticipantId)
          : solo
            ? 0
            : randomInt(2)
      ].id;
    match.turn.activePlayerId = startingPlayerId;
    match.rules = {
      format: "commander",
      setup: { keptPlayerIds: [], startingPlayerId },
      mana: {},
      landsPlayed: {},
      controlledSinceTurn: {},
      turnStarted: {},
      commanders: {},
    };
    match.players.forEach((player, index) => {
      const instance = Object.values(match.instances).find(
        (i) =>
          i.ownerId === player.id && i.definitionId === commanders[index].id,
      )!;
      instance.commander = true;
      match.rules!.commanders[player.id] = {
        instanceId: instance.id,
        colorIdentity: [...commanders[index].colorIdentity],
      };
      if (solo && index === 1) {
        match.rules!.practice = {
          playerId: player.id,
          controllerParticipantId: participants[0].id,
        };
        match.rules!.setup.keptPlayerIds.push(player.id);
      }
      match.rules!.mana[player.id] = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
      const object = Object.values(match.objects).find((o) =>
        o.cardInstanceIds.includes(instance.id),
      )!;
      moveObject(
        match,
        object.id,
        match.zones.find((z) => z.kind === "command")!,
      );
      const library = match.zones.find(
        (z) => z.kind === "library" && z.ownerId === player.id,
      )!;
      new Library(library).shuffle(player.id);
      new RulesEngine(match, catalog).draw(player.id, 7);
    });
    match.revision = 0;
    return match;
  }

  execute(
    match: MatchState,
    participant: Participant,
    action: MatchAction,
    catalog: Catalog,
  ): ExecutionResult {
    const next = structuredClone(match);
    const replay = next.rules?.commanderReplay;
    let actor: Pick<Participant, "id"> = participant;
    let command = action;
    try {
      if (replay && next.rules?.pending?.kind === "commander-return") {
        const pending = next.rules.pending;
        const player = actingPlayer(next, participant.id);
        if (
          !player ||
          player.id !== pending.playerId ||
          action.type !== "rules-input" ||
          action.procedureId !== pending.id ||
          action.confirm === undefined ||
          action.selections ||
          action.variables ||
          action.targetIds
        )
          throw new Error("Complete your current commander return choice.");
        replay.answers[replay.key] = action.confirm;
        next.rules.pending = replay.previousPending;
        actor = { id: replay.participantId };
        next.priority = replay.previousPriority;
        command = replay.action;
      }
      if (next.mode !== "rules" || !next.rules)
        throw new Error(
          "This legacy Match requires replacement with an automated Commander Match.",
        );
      const notice = new RulesEngine(next, catalog).apply(actor, command);
      if (next.rules) {
        delete next.rules.commanderReplay;
        const engine = new RulesEngine(next, catalog);
        while (
          next.rules.practice &&
          !next.rules.pending &&
          next.outcome === "ongoing" &&
          next.priority?.playerId === next.rules.practice.playerId
        )
          engine.pass(next.rules.practice.playerId);
      }
      for (const key of Object.keys(match))
        if (!(key in next)) Reflect.deleteProperty(match, key);
      Object.assign(match, next);
      return next.rules?.pending
        ? { kind: "pending", playerId: next.rules.pending.playerId }
        : { kind: "accepted", notice };
    } catch (error) {
      if (error instanceof CommanderReplacement && match.rules) {
        match.rules.commanderReplay = {
          action: command,
          participantId: actor.id,
          previousPriority: replay
            ? replay.previousPriority
            : structuredClone(match.priority),
          previousPending: replay
            ? replay.previousPending
            : structuredClone(match.rules.pending),
          key: error.key,
          answers: replay?.answers ?? {},
        };
        new CommanderRules(new RulesEngine(match, catalog)).prompt(
          error.playerId,
        );
        match.revision++;
        return { kind: "pending", playerId: error.playerId };
      }
      return {
        kind: "rejected",
        message: error instanceof Error ? error.message : "Action rejected.",
      };
    }
  }
}
