import { expect, test } from "@playwright/test";
import type { IncomingMessage } from "node:http";
import WebSocket from "ws";
import { build } from "esbuild";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type {
  RoomState,
  RoomView,
  ServerMessage,
  User,
} from "../src/shared/model";

// The Room gateway over an in-memory Room table: how often a command reads
// its Room, who receives which view, and what the expiry timer rebroadcasts.

// The parts of RoomService and RoomGateway these tests use. The test
// typecheck doesn't compile Nest's decorators, so it can't import them.
interface Rooms {
  create(user: User): Promise<{ invite: string }>;
  join(invite: string, user: User): Promise<unknown>;
  view(invite: string, userId: string): Promise<RoomView>;
  connect(invite: string, participantId: string, connectionId: string): void;
}
interface Gateway {
  handleConnection(client: WebSocket, request: IncomingMessage): void;
  authenticate(client: WebSocket, body: unknown): Promise<void>;
  command(client: WebSocket, body: unknown): Promise<void>;
  handleDisconnect(client: WebSocket): Promise<void>;
  onModuleDestroy(): void;
}
let server: {
  RoomService: new (database: never, matches: never, decks: never) => Rooms;
  RoomGateway: new (rooms: Rooms, accounts: never) => Gateway;
};
test.beforeAll(async () => {
  // The test runner's transform can't compile Nest's parameter decorators,
  // so the Room modules are bundled with esbuild, as tsx runs them in dev.
  const outfile = resolve(test.info().outputDir, "room-server.mjs");
  await build({
    stdin: {
      contents: `export { RoomGateway } from "./src/server/room/room.gateway.ts";
export { RoomService } from "./src/server/room/room.service.ts";`,
      resolveDir: resolve("."),
      loader: "ts",
    },
    bundle: true,
    format: "esm",
    platform: "node",
    packages: "external",
    tsconfig: "tsconfig.server.json",
    outfile,
    logLevel: "silent",
  });
  server = (await import(pathToFileURL(outfile).href)) as typeof server;
});

class FakeRooms {
  readonly rows = new Map<string, { document: string; lastActivity: Date }>();
  reads = 0;
  failTransactions = false;
  readonly pool = {
    query: (sql: string, params: unknown[] = []) => this.query(sql, params),
  };

  query(sql: string, params: unknown[]) {
    return Promise.resolve(this.answer(sql, params));
  }
  private answer(sql: string, params: unknown[]) {
    if (sql.startsWith("INSERT INTO rooms")) {
      this.rows.set(params[0] as string, {
        document: params[1] as string,
        lastActivity: params[2] as Date,
      });
      return { rows: [] };
    }
    if (sql.startsWith("SELECT document FROM rooms")) {
      this.reads++;
      const row = this.rows.get(params[0] as string);
      return {
        rows: row ? [{ document: JSON.parse(row.document) as RoomState }] : [],
      };
    }
    if (sql.startsWith("SELECT invite")) {
      const [invites, since] = params as [string[], Date];
      return {
        rows: invites.flatMap((invite) => {
          const row = this.rows.get(invite);
          return row && row.lastActivity > since
            ? [
                {
                  invite,
                  revision: String(
                    (JSON.parse(row.document) as RoomState).revision,
                  ),
                },
              ]
            : [];
        }),
      };
    }
    if (sql.startsWith("DELETE FROM rooms WHERE invite")) {
      this.rows.delete(params[0] as string);
      return { rows: [] };
    }
    if (sql.startsWith("DELETE FROM rooms WHERE last_activity"))
      return { rows: [] };
    throw new Error(`Unexpected query: ${sql}`);
  }
  async transaction<T>(operation: (client: unknown) => Promise<T>) {
    if (this.failTransactions) throw new Error("connection lost");
    return operation(this.pool);
  }
  saveRoom(_client: unknown, room: RoomState) {
    this.rows.set(room.invite, {
      document: JSON.stringify(room),
      lastActivity: new Date(room.lastActivity),
    });
    return Promise.resolve();
  }
  /** Changes a stored Room behind the server's back. */
  edit(invite: string, change: (room: RoomState) => void) {
    const row = this.rows.get(invite)!;
    const room = JSON.parse(row.document) as RoomState;
    change(room);
    row.document = JSON.stringify(room);
  }
}

class FakeSocket {
  readyState: number = WebSocket.OPEN;
  readonly received: ServerMessage[] = [];
  send(data: string) {
    this.received.push(JSON.parse(data) as ServerMessage);
  }
  close() {
    this.readyState = WebSocket.CLOSED;
  }
  terminate() {
    this.close();
  }
  ping() {}
  on() {}
  /** The messages of one event received since the last call. */
  take(event: ServerMessage["event"]) {
    const taken = this.received.filter((m) => m.event === event);
    this.received.length = 0;
    return taken;
  }
}

const alice: User = {
  id: "a0000000-0000-4000-8000-000000000001",
  name: "alice",
};
const bob: User = { id: "b0000000-0000-4000-8000-000000000002", name: "bob" };
const carol: User = {
  id: "e0000000-0000-4000-8000-000000000007",
  name: "carol",
};

async function setup() {
  const { RoomGateway, RoomService } = server;
  const database = new FakeRooms();
  const rooms = new RoomService(database as never, {} as never, {} as never);
  const accounts = {
    user: (request: IncomingMessage & { user: User }) =>
      Promise.resolve(request.user),
    purgeExpiredSessions: async () => {},
  };
  const gateway = new RoomGateway(rooms, accounts as never);
  const { invite } = await rooms.create(alice);
  await rooms.join(invite, bob);
  // Carol has a seat but no socket.
  await rooms.join(invite, carol);
  async function connect(user: User) {
    const socket = new FakeSocket();
    const client = socket as unknown as WebSocket;
    gateway.handleConnection(client, {
      headers: {},
      user,
    } as unknown as IncomingMessage);
    await gateway.authenticate(client, { invite });
    return socket;
  }
  const sockets = { alice: await connect(alice), bob: await connect(bob) };
  sockets.alice.take("view");
  sockets.bob.take("view");
  const expire = () =>
    (gateway as unknown as { expire(): Promise<void> }).expire();
  return { database, rooms, gateway, invite, sockets, expire, connect };
}

test("a command reads its Room once and the acting client receives one view", async () => {
  const { database, gateway, sockets } = await setup();
  database.reads = 0;
  const requestId = "c0000000-0000-4000-8000-000000000003";
  await gateway.command(sockets.alice as unknown as WebSocket, {
    requestId,
    command: { type: "cancel-rematch" },
  });
  expect(database.reads).toBe(1);
  const own = sockets.alice.take("view");
  expect(own).toHaveLength(1);
  expect(own[0].event === "view" && own[0].data.requestId).toBe(requestId);
  const other = sockets.bob.take("view");
  expect(other).toHaveLength(1);
  expect(other[0].event === "view" && other[0].data.view.revision).toBe(
    own[0].event === "view" ? own[0].data.view.revision : -1,
  );
  gateway.onModuleDestroy();
});

test("a rejected command reads its Room once and restores the saved view", async () => {
  const { database, gateway, invite, sockets } = await setup();
  const saved = JSON.parse(database.rows.get(invite)!.document) as RoomState;
  database.reads = 0;
  await gateway.command(sockets.alice as unknown as WebSocket, {
    requestId: "c0000000-0000-4000-8000-000000000004",
    command: {
      type: "match-action",
      matchId: "d0000000-0000-4000-8000-000000000005",
      revision: 0,
      action: { type: "pass-priority" },
    },
  });
  expect(database.reads).toBe(1);
  const [rejected] = sockets.alice.take("rejected");
  expect(rejected.event === "rejected" && rejected.data.view?.revision).toBe(
    saved.revision,
  );
  expect(sockets.bob.take("view")).toHaveLength(0);
  gateway.onModuleDestroy();
});

test("closing a Room closes every member's socket without reading it again", async () => {
  const { database, gateway, sockets } = await setup();
  database.reads = 0;
  await gateway.command(sockets.alice as unknown as WebSocket, {
    requestId: "c0000000-0000-4000-8000-000000000006",
    command: { type: "close" },
  });
  expect(database.reads).toBe(1);
  for (const socket of [sockets.alice, sockets.bob]) {
    expect(socket.take("closed")).toEqual([
      { event: "closed", data: { message: "This Room is closed or expired." } },
    ]);
    expect(socket.readyState).toBe(WebSocket.CLOSED);
  }
  gateway.onModuleDestroy();
});

test("the expiry timer rebroadcasts only a Room whose state or presence changed", async () => {
  const { database, rooms, gateway, invite, sockets, expire } = await setup();
  await expire();
  expect(sockets.alice.take("view")).toHaveLength(0);
  expect(sockets.bob.take("view")).toHaveLength(0);

  database.edit(invite, (room) => {
    room.revision++;
  });
  await expire();
  expect(sockets.alice.take("view")).toHaveLength(1);
  expect(sockets.bob.take("view")).toHaveLength(1);
  await expire();
  expect(sockets.alice.take("view")).toHaveLength(0);

  const carolId = (await rooms.view(invite, carol.id)).participantId;
  rooms.connect(invite, carolId, "carol-tab");
  await expire();
  expect(sockets.alice.take("view")).toHaveLength(1);

  database.rows.delete(invite);
  await expire();
  expect(sockets.bob.take("closed")).toHaveLength(1);
  gateway.onModuleDestroy();
});

test("a failed disconnect is logged, not discarded", async () => {
  const { database, gateway, sockets } = await setup();
  const logged: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => void logged.push(args);
  try {
    database.failTransactions = true;
    await gateway.handleDisconnect(sockets.bob as unknown as WebSocket);
  } finally {
    console.error = original;
  }
  expect(
    logged.some((args) => String(args.at(-1)).includes("connection lost")),
  ).toBe(true);
  gateway.onModuleDestroy();
});
