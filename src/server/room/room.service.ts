import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type {
  Participant,
  RoomState,
  RoomView,
  RoomCommand,
} from "../../shared/model.js";
import { Database } from "../storage/database.js";
import { CatalogService } from "../catalog/catalog.service.js";
import { readCatalog } from "../catalog/catalog-files.js";
import { MatchService } from "../match/match.service.js";
import { commanderEligible } from "../match/commander.js";
import type { Catalog } from "../../shared/model.js";
import { matchView } from "../match/match-view.js";

export class TabletopError extends Error {}
export const credentialHash = (credential: string) =>
  createHash("sha256").update(credential).digest("hex");
const nameKey = (name: string) => name.normalize("NFKC").trim().toLowerCase();

@Injectable()
export class RoomService implements OnModuleInit {
  private readonly connections = new Map<string, Set<string>>();
  readonly expiryMs = Number(process.env.ROOM_EXPIRY_DAYS ?? 30) * 86_400_000;

  constructor(
    @Inject(Database) readonly database: Database,
    @Inject(CatalogService) private readonly catalog: CatalogService,
    @Inject(MatchService) private readonly matches: MatchService,
  ) {
    if (!Number.isFinite(this.expiryMs) || this.expiryMs <= 0)
      throw new Error("ROOM_EXPIRY_DAYS must be positive");
  }
  async onModuleInit() {
    // A server restart disconnects all players; earlier consent cannot authorize a replacement after recovery.
    await this.database.pool.query(
      `UPDATE rooms SET document = jsonb_set(jsonb_set(document, '{rematch,confirmations}', '[]'::jsonb), '{revision}', to_jsonb((document->>'revision')::bigint + 1)) WHERE document ? 'rematch'`,
    );
  }

  async create(name: string) {
    const credential = randomBytes(32).toString("hex");
    const participant = this.participant(name, credential);
    const room: RoomState = {
      id: randomUUID(),
      invite: randomBytes(24).toString("hex"),
      revision: 0,
      lastActivity: Date.now(),
      participants: [participant],
    };
    await this.database.pool.query("INSERT INTO rooms VALUES ($1, $2, $3)", [
      room.invite,
      JSON.stringify(room),
      new Date(room.lastActivity),
    ]);
    return { invite: room.invite, credential };
  }

  async join(invite: string, name: string, credential?: string) {
    return this.database.transaction(async (client) => {
      const room = await this.load(invite, client);
      let participant = credential
        ? room.participants.find((p) => this.validCredential(p, credential))
        : undefined;
      let resultCredential = credential;
      if (!participant) {
        participant = room.participants.find(
          (p) => nameKey(p.name) === nameKey(name),
        );
        resultCredential = randomBytes(32).toString("hex");
        if (participant) {
          participant.credentialHash = credentialHash(resultCredential);
          if (room.rematch)
            room.rematch.confirmations = room.rematch.confirmations.filter(
              (id) => id !== participant!.id,
            );
        } else {
          if (room.participants.length >= 4)
            throw new TabletopError(
              "This Room has no open seats. Use an existing participant name to recover your seat.",
            );
          participant = this.participant(name, resultCredential);
          room.participants.push(participant);
        }
      }
      this.touch(room);
      await this.database.saveRoom(client, room);
      return { invite, credential: resultCredential! };
    });
  }

  private participant(name: string, credential: string): Participant {
    return {
      id: randomUUID(),
      name: name.trim().normalize("NFKC"),
      credentialHash: credentialHash(credential),
      decklists: [],
      ready: false,
    };
  }
  private validCredential(participant: Participant, credential: string) {
    return timingSafeEqual(
      Buffer.from(participant.credentialHash, "hex"),
      Buffer.from(credentialHash(credential), "hex"),
    );
  }
  authorize(room: RoomState, credential: string) {
    const participant = room.participants.find((p) =>
      this.validCredential(p, credential),
    );
    if (!participant)
      throw new TabletopError(
        "Your guest credential is no longer valid. Rejoin using your Room name.",
      );
    return participant;
  }
  async load(
    invite: string,
    client = this.database.pool as Pick<typeof this.database.pool, "query">,
    lock = true,
  ): Promise<RoomState> {
    const result = await client.query<{ document: RoomState }>(
      `SELECT document FROM rooms WHERE invite = $1${lock ? " FOR UPDATE" : ""}`,
      [invite],
    );
    const room = result.rows[0]?.document;
    if (!room || Date.now() - room.lastActivity >= this.expiryMs)
      throw new TabletopError("This Room is closed or expired.");
    return room;
  }
  touch(room: RoomState) {
    room.lastActivity = Date.now();
    room.revision++;
  }
  async command(
    invite: string,
    credential: string,
    command: RoomCommand,
  ): Promise<string | undefined> {
    return this.database.transaction(async (client) => {
      const room = await this.load(invite, client);
      const participant = this.authorize(room, credential);
      let notice: string | undefined;
      switch (command.type) {
        case "save-decklist": {
          const entries = this.catalog.resolveDecklist(
            command.text,
            await readCatalog(),
          );
          const existing = command.id
            ? participant.decklists.find(
                (decklist) => decklist.id === command.id,
              )
            : undefined;
          if (command.id && !existing)
            throw new TabletopError("Decklist not found.");
          if (!existing && participant.decklists.length >= 100)
            throw new TabletopError(
              "This participant already has 100 Decklists.",
            );
          const decklist = {
            id: existing?.id ?? randomUUID(),
            name: command.name,
            text: command.text,
            entries,
          };
          if (existing)
            participant.decklists[participant.decklists.indexOf(existing)] =
              decklist;
          else participant.decklists.push(decklist);
          if (
            !participant.selectedDecklistId ||
            participant.selectedDecklistId === decklist.id
          ) {
            participant.selectedDecklistId = decklist.id;
            participant.ready = false;
          }
          if (
            !entries.some(
              (entry) => entry.definitionId === participant.selectedCommanderId,
            )
          )
            delete participant.selectedCommanderId;
          delete room.rematch;
          break;
        }
        case "configure-commander": {
          const deck = participant.decklists.find(
            (d) => d.id === command.decklistId,
          );
          const catalog = await readCatalog();
          const card = catalog.definitions[command.definitionId];
          if (
            !deck ||
            !deck.entries.some(
              (e) => e.definitionId === command.definitionId,
            ) ||
            !card ||
            !commanderEligible(card)
          )
            throw new TabletopError(
              "Choose a legendary creature from your selected Decklist.",
            );
          participant.selectedDecklistId = deck.id;
          participant.selectedCommanderId = card.id;
          participant.ready = false;
          delete room.rematch;
          break;
        }
        case "ready": {
          if (
            (command.ready && !command.decklistId) ||
            (command.decklistId &&
              !participant.decklists.some(
                (decklist) => decklist.id === command.decklistId,
              ))
          )
            throw new TabletopError(
              "Select one of your saved Decklists first.",
            );
          if (participant.selectedDecklistId !== command.decklistId)
            delete participant.selectedCommanderId;
          participant.selectedDecklistId = command.decklistId;
          participant.ready = command.ready;
          delete room.rematch;
          break;
        }
        case "start":
        case "start-solo": {
          const ready = room.participants.filter(
            (participant) =>
              participant.ready && participant.selectedDecklistId,
          );
          if (
            command.type === "start-solo" &&
            (ready.length !== 1 || ready[0].id !== participant.id)
          )
            throw new TabletopError(
              "Only the sole ready participant can start a solo Match.",
            );
          if (
            command.type === "start" &&
            (ready.length < 2 || ready.length > 4)
          )
            throw new TabletopError(
              "Two to four participants must select Decklists and mark ready.",
            );
          if (command.type === "start" && command.format === "commander")
            this.matches.createCommander(
              room,
              await readCatalog(),
              command.startingParticipantId,
            );
          if (room.match)
            room.rematch = {
              id: randomUUID(),
              startingLife: command.startingLife,
              format: command.type === "start" ? command.format : undefined,
              startingParticipantId:
                command.type === "start"
                  ? command.startingParticipantId
                  : undefined,
              confirmations: [],
            };
          else if (command.type === "start" && command.format === "commander")
            room.match = this.matches.createCommander(
              room,
              await readCatalog(),
              command.startingParticipantId,
            );
          else
            room.match = this.matches.create(
              room,
              await readCatalog(),
              command.startingLife,
            );
          break;
        }
        case "confirm-rematch": {
          if (
            !room.match ||
            !room.rematch ||
            command.proposalId !== room.rematch.id
          )
            throw new TabletopError(
              "That new Match request is no longer current.",
            );
          if (
            !room.match.players.some(
              (player) => player.participantId === participant.id,
            )
          )
            throw new TabletopError(
              "Only current Match Players confirm replacing their Match.",
            );
          if (!this.connected(invite, participant.id))
            throw new TabletopError("Reconnect before confirming.");
          if (!room.rematch.confirmations.includes(participant.id))
            room.rematch.confirmations.push(participant.id);
          if (
            room.match.players.every(
              (player) =>
                this.connected(invite, player.participantId) &&
                room.rematch!.confirmations.includes(player.participantId),
            )
          ) {
            room.match =
              room.rematch.format === "commander"
                ? this.matches.createCommander(
                    room,
                    await readCatalog(),
                    room.rematch.startingParticipantId,
                  )
                : this.matches.create(
                    room,
                    await readCatalog(),
                    room.rematch.startingLife,
                  );
            delete room.rematch;
          }
          break;
        }
        case "cancel-rematch":
          delete room.rematch;
          break;
        case "match-action": {
          if (
            !room.match ||
            room.match.id !== command.matchId ||
            room.match.revision !== command.revision
          )
            throw new TabletopError(
              "This action is stale. The latest Match view has been restored; retry your action.",
            );
          if (
            room.match.players.length === 1 &&
            room.match.players[0].participantId !== participant.id
          )
            throw new TabletopError(
              "Only the Match Player can change a solo Match.",
            );
          const result = this.matches.execute(
            room.match,
            participant,
            command.action,
            await readCatalog(),
          );
          if (result.kind === "rejected")
            throw new TabletopError(result.message);
          if (result.kind === "accepted") notice = result.notice;
          break;
        }
        case "close":
          await client.query("DELETE FROM rooms WHERE invite = $1", [invite]);
          return "Room closed.";
        default:
          throw new TabletopError("This action is not available yet.");
      }
      this.touch(room);
      await this.database.saveRoom(client, room);
      return notice;
    });
  }
  connected(invite: string, participantId: string) {
    return (this.connections.get(`${invite}:${participantId}`)?.size ?? 0) > 0;
  }
  connect(invite: string, participantId: string, connectionId: string) {
    const key = `${invite}:${participantId}`;
    const connections = this.connections.get(key) ?? new Set<string>();
    connections.add(connectionId);
    this.connections.set(key, connections);
  }
  async disconnect(
    invite: string,
    participantId: string,
    connectionId: string,
  ) {
    const key = `${invite}:${participantId}`;
    const connections = this.connections.get(key);
    connections?.delete(connectionId);
    if (connections?.size === 0) {
      this.connections.delete(key);
      await this.database
        .transaction(async (client) => {
          const room = await this.load(invite, client);
          if (room.rematch?.confirmations.includes(participantId)) {
            room.rematch.confirmations = room.rematch.confirmations.filter(
              (p) => p !== participantId,
            );
            room.revision++;
            await this.database.saveRoom(client, room);
          }
        })
        .catch(() => {});
    }
  }
  async view(invite: string, credential: string): Promise<RoomView> {
    const room = await this.load(invite, this.database.pool, false);
    return this.toView(
      room,
      this.authorize(room, credential),
      await readCatalog(),
    );
  }
  toView(
    room: RoomState,
    participant: Participant,
    catalog?: Catalog,
  ): RoomView {
    return {
      id: room.id,
      revision: room.revision,
      invitation: `/room/${room.invite}`,
      participantId: participant.id,
      participants: room.participants.map((p) => ({
        id: p.id,
        name: p.name,
        ready: p.ready,
        selected: !!p.selectedDecklistId,
        connected: this.connected(room.invite, p.id),
      })),
      decklists: participant.decklists,
      selectedCommanderId: participant.selectedCommanderId,
      commanderOptions: catalog
        ? participant.decklists
            .find((d) => d.id === participant.selectedDecklistId)
            ?.entries.map((entry) => {
              const card = catalog.definitions[entry.definitionId];
              return {
                definitionId: entry.definitionId,
                name: card.canonicalName,
                eligible: commanderEligible(card),
              };
            })
        : [],
      selectedDecklistId: participant.selectedDecklistId,
      rematch: room.rematch,
      match: room.match
        ? matchView(room.match, participant.id, catalog)
        : undefined,
    };
  }
  async purgeExpired() {
    await this.database.pool.query(
      "DELETE FROM rooms WHERE last_activity <= $1",
      [new Date(Date.now() - this.expiryMs)],
    );
  }
}
