import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import { randomBytes, randomUUID } from "node:crypto";
import type {
  Catalog,
  Decklist,
  Participant,
  RoomCommand,
  RoomState,
  RoomView,
  User,
} from "../../shared/model.js";
import { Database } from "../storage/database.js";
import { readCatalog } from "../catalog/catalog-files.js";
import { MatchService } from "../match/match.service.js";
import { DeckService } from "../deck/deck.service.js";
import { DeckError } from "../deck/deck-errors.js";
import { deckIssues } from "../deck/format-rules.js";
import { matchView } from "../match/match-view.js";
import { currentSnapshotVersion, upgradeRoom } from "./room-upgrade.js";
import { TabletopError } from "./player-errors.js";

const nameKey = (name: string) => name.normalize("NFKC").trim().toLowerCase();

@Injectable()
export class RoomService implements OnModuleInit {
  private readonly connections = new Map<string, Set<string>>();
  readonly expiryMs = Number(process.env.ROOM_EXPIRY_DAYS ?? 30) * 86_400_000;

  constructor(
    @Inject(Database) readonly database: Database,
    @Inject(MatchService) private readonly matches: MatchService,
    @Inject(DeckService) private readonly decks: DeckService,
  ) {
    if (!Number.isFinite(this.expiryMs) || this.expiryMs <= 0)
      throw new Error("ROOM_EXPIRY_DAYS must be positive");
  }
  async onModuleInit() {
    // Older Rooms are not upgraded (room-upgrade.ts); those from before
    // ADR-0019 also seat guests who have no User to sign in as.
    await this.database.pool.query(
      `DELETE FROM rooms WHERE COALESCE((document->>'snapshotVersion')::int, 1) < $1`,
      [currentSnapshotVersion],
    );
    // A server restart disconnects all players; earlier consent cannot authorize a replacement after recovery.
    await this.database.pool.query(
      `UPDATE rooms SET document = jsonb_set(jsonb_set(document, '{rematch,confirmations}', '[]'::jsonb), '{revision}', to_jsonb((document->>'revision')::bigint + 1)) WHERE document ? 'rematch'`,
    );
  }

  async create(user: User) {
    const room: RoomState = {
      snapshotVersion: currentSnapshotVersion,
      id: randomUUID(),
      invite: randomBytes(24).toString("hex"),
      revision: 0,
      lastActivity: Date.now(),
      participants: [this.participant(user, [])],
    };
    await this.database.pool.query("INSERT INTO rooms VALUES ($1, $2, $3)", [
      room.invite,
      JSON.stringify(room),
      new Date(room.lastActivity),
    ]);
    return { invite: room.invite };
  }

  async join(invite: string, user: User) {
    return this.database.transaction(async (client) => {
      const room = await this.load(invite, client);
      if (!room.participants.some((p) => p.userId === user.id)) {
        if (room.participants.length >= 4)
          throw new TabletopError("This Room has no open seats.");
        room.participants.push(this.participant(user, room.participants));
        this.touch(room);
        await this.database.saveRoom(client, room);
      }
      return { invite };
    });
  }

  /** A new Room Participant, named after the User and unique in the Room. */
  private participant(user: User, others: Participant[]): Participant {
    const base = user.name.trim().normalize("NFKC");
    let name = base;
    for (let n = 2; others.some((p) => nameKey(p.name) === nameKey(name)); n++)
      name = `${base} (${n})`;
    return { id: randomUUID(), userId: user.id, name, ready: false };
  }
  authorize(room: RoomState, userId: string) {
    const participant = room.participants.find((p) => p.userId === userId);
    if (!participant)
      throw new TabletopError("Join this Room from its invitation link.");
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
    return upgradeRoom(room);
  }
  touch(room: RoomState) {
    room.lastActivity = Date.now();
    room.revision++;
  }
  /** A copy of the participant's Deck from their Deck Catalog. */
  private async deck(participant: Participant, deckId: string) {
    try {
      const { updatedAt: _updatedAt, ...deck } = await this.decks.get(
        participant.userId,
        deckId,
      );
      return deck as Decklist;
    } catch (error) {
      if (error instanceof DeckError)
        throw new TabletopError("Select one of your saved Decklists first.");
      throw error;
    }
  }
  /** Ready participants play their Decks as currently saved. */
  private async refreshDecks(room: RoomState) {
    for (const participant of room.participants)
      if (participant.ready && participant.deck)
        participant.deck = await this.deck(participant, participant.deck.id);
  }
  async command(
    invite: string,
    userId: string,
    command: RoomCommand,
  ): Promise<string | undefined> {
    return this.database.transaction(async (client) => {
      const room = await this.load(invite, client);
      const participant = this.authorize(room, userId);
      let notice: string | undefined;
      switch (command.type) {
        case "ready": {
          if (command.ready && !command.deckId)
            throw new TabletopError(
              "Select one of your saved Decklists first.",
            );
          if (command.deckId)
            participant.deck = await this.deck(participant, command.deckId);
          else delete participant.deck;
          if (command.ready) {
            if (participant.deck!.format !== "commander")
              throw new TabletopError(
                "Select a Commander Decklist for a Commander Match.",
              );
            const [issue] = deckIssues(participant.deck!, await readCatalog());
            if (issue) throw new TabletopError(issue);
          }
          participant.ready = command.ready;
          delete room.rematch;
          break;
        }
        case "start":
        case "start-solo": {
          const ready = room.participants.filter(
            (participant) => participant.ready && participant.deck,
          );
          if (
            command.type === "start-solo" &&
            (ready.length !== 1 || ready[0].id !== participant.id)
          )
            throw new TabletopError(
              "Only the sole ready participant can start a solo Match.",
            );
          if (command.type === "start" && ready.length !== 2)
            throw new TabletopError(
              "Two participants must select Decklists and mark ready.",
            );
          await this.refreshDecks(room);
          if (room.match)
            this.matches.validateCommanderSetup(
              room,
              await readCatalog(),
              command.type === "start"
                ? command.startingParticipantId
                : participant.id,
            );
          if (room.match)
            room.rematch = {
              id: randomUUID(),
              startingLife: command.startingLife,
              format: "commander",
              startingParticipantId:
                command.type === "start"
                  ? command.startingParticipantId
                  : undefined,
              confirmations: [],
            };
          else
            room.match = this.matches.createCommander(
              room,
              await readCatalog(),
              command.type === "start"
                ? command.startingParticipantId
                : participant.id,
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
            room.match.players
              .filter(
                (player) => player.id !== room.match!.rules.practice?.playerId,
              )
              .every(
                (player) =>
                  this.connected(invite, player.participantId) &&
                  room.rematch!.confirmations.includes(player.participantId),
              )
          ) {
            await this.refreshDecks(room);
            room.match = this.matches.createCommander(
              room,
              await readCatalog(),
              room.rematch.startingParticipantId,
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
  async view(invite: string, userId: string): Promise<RoomView> {
    return (await this.viewer(invite))(userId);
  }
  /** Loads the Room once; the result projects each user's own view of it. */
  async viewer(invite: string): Promise<(userId: string) => RoomView> {
    const room = await this.load(invite, this.database.pool, false);
    const catalog = await readCatalog();
    return (userId) => {
      const own = structuredClone(room);
      return this.toView(own, this.authorize(own, userId), catalog);
    };
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
        selected: !!p.deck,
        connected: this.connected(room.invite, p.id),
      })),
      selectedDeck: participant.deck,
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
