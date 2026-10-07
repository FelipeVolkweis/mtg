import { useEffect, useRef, useState } from "react";
import type {
  RoomCommand,
  RoomView,
  ServerMessage,
  User,
} from "../shared/model";
import { z } from "zod";
import { request, signOut, useDecks } from "./api";
import { SignIn } from "./SignIn";
import { DeckCatalog } from "./DeckCatalog";
import { Lobby } from "./Lobby";
import { RulesTabletop } from "./RulesTabletop";

// Only the envelope is checked; the payload is trusted to match its event.
const serverEnvelope = z.object({
  event: z.enum(["view", "rejected", "closed", "pong"]),
  data: z.unknown(),
});

function parseServerMessage(raw: unknown): ServerMessage | undefined {
  try {
    if (typeof raw !== "string") throw new Error("non-text frame");
    const parsed = serverEnvelope.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data as ServerMessage;
    throw parsed.error;
  } catch (error) {
    console.warn("Ignoring malformed server message", error);
    return undefined;
  }
}

export function App() {
  const invite = location.pathname.match(/^\/room\/([a-f0-9]{48})$/)?.[1];
  const decksPage = location.pathname === "/decks";
  const [user, setUser] = useState<User | null>();
  const [joined, setJoined] = useState<string>();
  const [view, setView] = useState<RoomView>();
  const [error, setError] = useState("");
  const [connection, setConnection] = useState("Connecting");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const pending = useRef<string | undefined>(undefined);
  const socket = useRef<WebSocket | null>(null);
  const decks = useDecks(setError, !!user);
  useEffect(() => {
    request<{ user: User | null }>("/api/auth/me")
      .then((me) => setUser(me.user))
      .catch(() => {
        setUser(null);
        setError("The server is unavailable. Reload to try again.");
      });
  }, []);
  // Opening an invitation link while signed in takes a seat in the Room.
  useEffect(() => {
    if (!invite || !user) return;
    request<{ invite: string }>(`/api/rooms/${invite}/join`, "POST")
      .then(() => setJoined(invite))
      .catch((error: Error) => setError(error.message));
  }, [invite, user?.id]);
  useEffect(() => {
    if (!joined) return;
    let stopped = false;
    let reconnect: ReturnType<typeof setTimeout>;
    let heartbeat: ReturnType<typeof setInterval>;
    function connect() {
      const ws = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`,
      );
      socket.current = ws;
      ws.onopen = () => {
        ws.send(
          JSON.stringify({ event: "authenticate", data: { invite: joined } }),
        );
        heartbeat = setInterval(
          () =>
            ws.readyState === WebSocket.OPEN &&
            ws.send(JSON.stringify({ event: "ping", data: {} })),
          15_000,
        );
      };
      ws.onmessage = (event) => {
        // A superseded socket's late messages belong to an earlier Room.
        if (ws !== socket.current) return;
        const message = parseServerMessage(event.data);
        if (!message) return;
        if (message.event === "view") {
          setView((current) =>
            !current ||
            current.id !== message.data.view.id ||
            current.revision <= message.data.view.revision
              ? message.data.view
              : current,
          );
          setConnection("Connected");
          if (message.data.notice) setNotice(message.data.notice);
        }
        if (message.event === "rejected") {
          setError(message.data.message);
          const latest = message.data.view;
          if (latest)
            setView((current) =>
              !current ||
              current.id !== latest.id ||
              current.revision <= latest.revision
                ? latest
                : current,
            );
        }
        if (
          (message.event === "view" || message.event === "rejected") &&
          message.data.requestId === pending.current
        ) {
          pending.current = undefined;
          setBusy(false);
        }
        if (message.event === "closed") {
          setError(message.data.message);
          setView(undefined);
          setJoined(undefined);
          stopped = true;
          ws.close();
        }
      };
      ws.onclose = () => {
        if (ws !== socket.current) return;
        clearInterval(heartbeat);
        setConnection("Reconnecting");
        pending.current = undefined;
        setBusy(false);
        if (!stopped) reconnect = setTimeout(connect, 1000);
      };
    }
    connect();
    return () => {
      stopped = true;
      clearTimeout(reconnect);
      clearInterval(heartbeat);
      const ws = socket.current;
      socket.current = null;
      ws?.close();
    };
  }, [joined]);
  function send(command: RoomCommand) {
    if (socket.current?.readyState !== WebSocket.OPEN || pending.current)
      return;
    pending.current = crypto.randomUUID();
    setBusy(true);
    setError("");
    socket.current.send(
      JSON.stringify({
        event: "command",
        data: { requestId: pending.current, command },
      }),
    );
  }
  async function createRoom() {
    try {
      const room = await request<{ invite: string }>("/api/rooms", "POST");
      location.href = `/room/${room.invite}`;
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to create");
    }
  }
  const lobby = <Lobby view={view!} send={send} busy={busy} decks={decks} />;
  return (
    <div className={`app ${view?.match ? "match-app" : ""}`}>
      <header>
        <a href="/" className="brand">
          ◈ Magic Tabletop
        </a>
        <span>{view ? connection : "A place for your next game"}</span>
        {user && (
          <nav className="account">
            <a href="/decks">My decks</a>
            <span data-testid="signed-in-user">{user.name}</span>
            <button
              onClick={() =>
                void signOut().then(() => {
                  location.href = "/";
                })
              }
            >
              Sign out
            </button>
          </nav>
        )}
      </header>
      {error && (
        <div role="alert" className="error">
          {error}
          <button onClick={() => setError("")} aria-label="Dismiss error">
            ×
          </button>
        </div>
      )}
      {notice && (
        <div role="status" className="notice">
          {notice}
        </div>
      )}
      {user && decksPage ? (
        <DeckCatalog decks={decks} />
      ) : !view ? (
        <main className="welcome">
          <p className="eyebrow">BRING YOUR DECK. GATHER YOUR FRIENDS.</p>
          <h1>
            Your table,
            <br />
            wherever you are.
          </h1>
          <p>
            A private tabletop for solo deck testing or two to four players.
            Keep your decks in one place and bring them to any Room.
          </p>
          {user === undefined ? (
            <p role="status">Loading…</p>
          ) : !user ? (
            <SignIn onSignedIn={setUser} report={setError} />
          ) : invite ? (
            <p role="status">{joined ? `${connection}…` : "Joining…"}</p>
          ) : (
            <div className="button-row">
              <button className="primary" onClick={() => void createRoom()}>
                Create Room
              </button>
              <a className="button" href="/decks">
                My decks
              </a>
            </div>
          )}
        </main>
      ) : view.match ? (
        <>
          <RulesTabletop view={view} send={send} busy={busy} />
          <details className="room-panel">
            <summary aria-label="Room lobby and Decklists">
              <span className="room-trigger">Room</span>
              <span className="room-drawer-title">
                Room lobby and Decklists
              </span>
            </summary>
            <div className="room-connection" role="status">
              {connection}
            </div>
            {lobby}
          </details>
        </>
      ) : (
        lobby
      )}
    </div>
  );
}
