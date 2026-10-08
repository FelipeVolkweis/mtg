import { Inject, OnModuleDestroy } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  OnGatewayDisconnect,
  OnGatewayConnection,
} from "@nestjs/websockets";
import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import WebSocket from "ws";
import { z } from "zod";
import type { RoomCommand, ServerMessage, User } from "../../shared/model.js";
import { roomCommandSchema } from "../../shared/model.js";
import {
  closedRoomMessage,
  type RoomProjection,
  RoomService,
} from "./room.service.js";
import { playerMessage, TabletopError } from "./player-errors.js";
import { UserService } from "../user/user.service.js";
import { internalErrorMessage } from "../rules/rule-violation.js";

interface Connection {
  id: string;
  invite: string;
  userId: string;
  participantId: string;
  lastPong: number;
}
/** A browser on another site must not open a socket with the session cookie. */
function sameOrigin(request: IncomingMessage) {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}
@WebSocketGateway({ path: "/ws", maxPayload: 150_000 })
export class RoomGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  private readonly sessions = new Map<WebSocket, Connection>();
  /** Authenticated sockets by Room invite, so a broadcast touches only that Room. */
  private readonly members = new Map<string, Set<WebSocket>>();
  private readonly users = new Map<WebSocket, Promise<User | undefined>>();
  /** Each Room's revision and presence as its members last received them. */
  private readonly sent = new Map<string, string>();
  private shuttingDown = false;
  private readonly authenticationTimers = new Map<
    WebSocket,
    ReturnType<typeof setTimeout>
  >();
  private readonly timer: ReturnType<typeof setInterval>;
  constructor(
    @Inject(RoomService) private readonly rooms: RoomService,
    @Inject(UserService) private readonly accounts: UserService,
  ) {
    this.timer = setInterval(
      () => void this.expire(),
      Math.max(50, Math.min(30_000, this.rooms.expiryMs / 2)),
    );
    this.timer.unref();
  }
  send(client: WebSocket, message: ServerMessage) {
    if (client.readyState === WebSocket.OPEN)
      client.send(JSON.stringify(message));
  }
  handleConnection(client: WebSocket, request: IncomingMessage) {
    if (!sameOrigin(request)) {
      client.terminate();
      return;
    }
    this.users.set(
      client,
      this.accounts.user(request).catch(() => undefined),
    );
    const timer = setTimeout(() => client.terminate(), 10000);
    timer.unref();
    this.authenticationTimers.set(client, timer);
    client.on("pong", () => {
      const session = this.sessions.get(client);
      if (session) session.lastPong = Date.now();
    });
  }
  @SubscribeMessage("authenticate")
  async authenticate(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() body: unknown,
  ) {
    if (this.sessions.has(client)) return;
    const parsed = z
      .object({ invite: z.string().regex(/^[a-f0-9]{48}$/) })
      .strict()
      .safeParse(body);
    const user = await this.users.get(client);
    if (!parsed.success || !user) {
      this.send(client, {
        event: "closed",
        data: { message: "Sign in to join this Room." },
      });
      client.close();
      return;
    }
    try {
      const view = await this.rooms.view(parsed.data.invite, user.id);
      if (client.readyState !== WebSocket.OPEN || this.sessions.has(client))
        return;
      const connection = {
        id: randomUUID(),
        invite: parsed.data.invite,
        userId: user.id,
        participantId: view.participantId,
        lastPong: Date.now(),
      };
      clearTimeout(this.authenticationTimers.get(client));
      this.authenticationTimers.delete(client);
      this.sessions.set(client, connection);
      const members = this.members.get(connection.invite) ?? new Set();
      members.add(client);
      this.members.set(connection.invite, members);
      this.rooms.connect(
        connection.invite,
        connection.participantId,
        connection.id,
      );
      // Read again: a command may have changed the Room before this socket
      // joined its members.
      await this.broadcast(connection.invite);
    } catch (error) {
      if (error instanceof TabletopError)
        this.send(client, {
          event: "closed",
          data: { message: error.message },
        });
      else
        this.send(client, {
          event: "rejected",
          data: {
            message: "The server is reconnecting. Your Room is retained.",
          },
        });
      client.close();
    }
  }
  @SubscribeMessage("ping") ping(@ConnectedSocket() client: WebSocket) {
    this.send(client, { event: "pong", data: null });
  }
  @SubscribeMessage("command")
  async command(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() body: unknown,
  ) {
    const session = this.sessions.get(client);
    const parsed = z
      .object({ requestId: z.string().uuid(), command: roomCommandSchema })
      .strict()
      .safeParse(body);
    if (!session || !parsed.success) {
      const request = z
        .object({ requestId: z.string().uuid() })
        .passthrough()
        .safeParse(body);
      const view = session
        ? await this.rooms
            .view(session.invite, session.userId)
            .catch(() => undefined)
        : undefined;
      this.send(client, {
        event: "rejected",
        data: {
          message:
            "Invalid or unauthenticated action. Check the submitted values.",
          requestId: request.success ? request.data.requestId : undefined,
          view,
        },
      });
      return;
    }
    const { requestId, command } = parsed.data;
    try {
      const outcome = await this.rooms.command(
        session.invite,
        session.userId,
        command,
      );
      if (outcome.kind === "closed") {
        this.close(session.invite, closedRoomMessage);
        return;
      }
      if (outcome.kind === "rejected") {
        this.reject(client, session, command, requestId, outcome);
        return;
      }
      this.send(client, {
        event: "view",
        data: {
          view: outcome.room.view(session.userId),
          requestId,
          notice: outcome.notice,
        },
      });
      await this.broadcast(session.invite, outcome.room, client);
    } catch (error) {
      this.reject(client, session, command, requestId, { error });
    }
  }
  /** Answers a failed command with the Room as saved, when it was read. */
  private reject(
    client: WebSocket,
    session: Connection,
    command: RoomCommand,
    requestId: string,
    failure: { error: unknown; room?: RoomProjection },
  ) {
    const message = playerMessage(failure.error);
    if (message === undefined)
      console.error(
        `Room ${session.invite} failed on command ${command.type}:`,
        failure.error,
      );
    let view;
    try {
      view = failure.room?.view(session.userId);
    } catch {
      // The rejection is sent without a view.
    }
    this.send(client, {
      event: "rejected",
      data: { message: message ?? internalErrorMessage, requestId, view },
    });
  }
  /**
   * Sends each member of a Room its own view, projected from `room` or from
   * one read of the Room; `except` already has its view.
   */
  async broadcast(invite: string, room?: RoomProjection, except?: WebSocket) {
    const members = this.members.get(invite);
    if (!members?.size) return;
    let projection: RoomProjection;
    try {
      projection = room ?? (await this.rooms.viewer(invite));
    } catch (error) {
      this.sent.delete(invite);
      for (const client of [...members]) this.drop(client, error);
      return;
    }
    this.sent.set(invite, this.stamp(invite, projection.revision));
    for (const client of [...members]) {
      const session = this.sessions.get(client);
      if (!session || client === except) continue;
      try {
        this.send(client, {
          event: "view",
          data: { view: projection.view(session.userId) },
        });
      } catch (error) {
        this.drop(client, error);
      }
    }
  }
  /** What a Room's members have seen: its revision and who is connected. */
  private stamp(invite: string, revision: number) {
    return `${revision}|${this.rooms.presence(invite)}`;
  }
  /** Closes a socket whose view can't be projected, saying why if it may. */
  private drop(client: WebSocket, error: unknown) {
    if (error instanceof TabletopError)
      this.send(client, { event: "closed", data: { message: error.message } });
    client.close();
  }
  /** Closes every member's socket of a Room that no longer exists. */
  private close(invite: string, message: string) {
    this.sent.delete(invite);
    for (const client of [...(this.members.get(invite) ?? [])]) {
      this.send(client, { event: "closed", data: { message } });
      client.close();
    }
  }
  async handleDisconnect(client: WebSocket) {
    clearTimeout(this.authenticationTimers.get(client));
    this.authenticationTimers.delete(client);
    this.users.delete(client);
    const session = this.sessions.get(client);
    if (!session) return;
    this.sessions.delete(client);
    const members = this.members.get(session.invite);
    members?.delete(client);
    if (members?.size === 0) {
      this.members.delete(session.invite);
      this.sent.delete(session.invite);
    }
    if (this.shuttingDown) return;
    await this.rooms.disconnect(
      session.invite,
      session.participantId,
      session.id,
    );
    await this.broadcast(session.invite);
  }
  private async expire() {
    try {
      for (const [client, session] of this.sessions) {
        if (Date.now() - session.lastPong >= 60_000) client.terminate();
        else client.ping();
      }
      await this.rooms.purgeExpired();
      await this.accounts.purgeExpiredSessions();
      // Only a Room changed outside a command (or closed) needs its views
      // again; commands and connections broadcast their own changes.
      const invites = [...this.members.keys()];
      const revisions = await this.rooms.revisions(invites);
      await Promise.all(
        invites
          .filter((invite) => {
            const revision = revisions.get(invite);
            return (
              revision === undefined ||
              this.sent.get(invite) !== this.stamp(invite, revision)
            );
          })
          .map((invite) => this.broadcast(invite)),
      );
    } catch (error) {
      console.error("Room expiry failed", error);
    }
  }
  onModuleDestroy() {
    this.shuttingDown = true;
    clearInterval(this.timer);
    for (const timer of this.authenticationTimers.values()) clearTimeout(timer);
    for (const client of this.sessions.keys()) client.close();
  }
}
