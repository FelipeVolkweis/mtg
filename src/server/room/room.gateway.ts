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
import type { ServerMessage, User } from "../../shared/model.js";
import { roomCommandSchema } from "../../shared/model.js";
import { RoomService, TabletopError } from "./room.service.js";
import { UserService } from "../user/user.service.js";

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
  private readonly users = new Map<WebSocket, Promise<User | undefined>>();
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
      this.rooms.connect(
        connection.invite,
        connection.participantId,
        connection.id,
      );
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
    try {
      const notice = await this.rooms.command(
        session.invite,
        session.userId,
        parsed.data.command,
      );
      if (parsed.data.command.type === "close") {
        await this.broadcast(session.invite);
        return;
      }
      this.send(client, {
        event: "view",
        data: {
          view: await this.rooms.view(session.invite, session.userId),
          requestId: parsed.data.requestId,
          notice,
        },
      });
      await this.broadcast(session.invite);
    } catch (error) {
      let view;
      try {
        view = await this.rooms.view(session.invite, session.userId);
      } catch {}
      this.send(client, {
        event: "rejected",
        data: {
          message: error instanceof Error ? error.message : "Action rejected",
          requestId: parsed.data.requestId,
          view,
        },
      });
    }
  }
  async broadcast(invite: string) {
    await Promise.all(
      [...this.sessions]
        .filter(([, session]) => session.invite === invite)
        .map(async ([client, session]) => {
          try {
            this.send(client, {
              event: "view",
              data: { view: await this.rooms.view(invite, session.userId) },
            });
          } catch (error) {
            if (error instanceof TabletopError)
              this.send(client, {
                event: "closed",
                data: { message: error.message },
              });
            client.close();
          }
        }),
    );
  }
  async handleDisconnect(client: WebSocket) {
    clearTimeout(this.authenticationTimers.get(client));
    this.authenticationTimers.delete(client);
    this.users.delete(client);
    const session = this.sessions.get(client);
    if (!session) return;
    this.sessions.delete(client);
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
      await Promise.all(
        [
          ...new Set(
            [...this.sessions.values()].map((session) => session.invite),
          ),
        ].map((invite) => this.broadcast(invite)),
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
