import { useEffect, useRef, useState } from "react";
import type {
  RoomView,
  ServerMessage,
  Session,
  RoomCommand,
} from "../shared/model";
import { Lobby } from "./Lobby";
import { RulesTabletop } from "./RulesTabletop";
import { Tabletop } from "./Tabletop";

export function App() {
  const invite = location.pathname.match(/^\/room\/([a-f0-9]{48})$/)?.[1];
  const [session, setSession] = useState<Session | null>(() => {
    if (!invite) return null;
    try {
      const credential = localStorage.getItem(`mtg:${invite}`);
      return credential ? { invite, credential } : null;
    } catch {
      return null;
    }
  });
  const [view, setView] = useState<RoomView>();
  const [error, setError] = useState("");
  const [connection, setConnection] = useState("Connecting");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const pending = useRef<string | undefined>(undefined);
  const socket = useRef<WebSocket | null>(null);
  useEffect(() => {
    if (!session) return;
    let stopped = false;
    let reconnect: ReturnType<typeof setTimeout>;
    let heartbeat: ReturnType<typeof setInterval>;
    function connect() {
      const ws = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`,
      );
      socket.current = ws;
      ws.onopen = () => {
        ws.send(JSON.stringify({ event: "authenticate", data: session }));
        heartbeat = setInterval(
          () =>
            ws.readyState === WebSocket.OPEN &&
            ws.send(JSON.stringify({ event: "ping", data: {} })),
          15_000,
        );
      };
      ws.onmessage = (event) => {
        const message: ServerMessage = JSON.parse(event.data);
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
          setSession(null);
          stopped = true;
          ws.close();
        }
      };
      ws.onclose = () => {
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
      socket.current?.close();
    };
  }, [session]);
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
  async function enter(form: HTMLFormElement) {
    const name = String(new FormData(form).get("name"));
    try {
      const response = await fetch(
        invite ? `/api/rooms/${invite}/join` : "/api/rooms",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      const next: Session = data;
      try {
        localStorage.setItem(`mtg:${next.invite}`, next.credential);
      } catch {}
      if (!invite) {
        location.href = `/room/${next.invite}`;
        return;
      }
      setSession(next);
      setError("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to join");
    }
  }
  return (
    <div className="app">
      <header>
        <a href="/" className="brand">
          ◈ Magic Tabletop
        </a>
        <span>{view ? connection : "A place for your next game"}</span>
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
      {!view ? (
        <main className="welcome">
          <p className="eyebrow">BRING YOUR DECK. GATHER YOUR FRIENDS.</p>
          <h1>
            Your table,
            <br />
            wherever you are.
          </h1>
          <p>
            A private tabletop for solo deck testing or two to four players.
            Play Magic your way, with shared cards and room to make the rules
            yourselves.
          </p>
          {session ? (
            <p role="status">{connection}…</p>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void enter(event.currentTarget);
              }}
            >
              <label>
                Your name
                <input
                  name="name"
                  required
                  maxLength={64}
                  autoComplete="nickname"
                />
              </label>
              <button className="primary">
                {invite ? "Join Room" : "Create Room"}
              </button>
            </form>
          )}
        </main>
      ) : view.match ? (
        <>
          {view.match.mode === "rules" ? (
            <RulesTabletop view={view} send={send} busy={busy} />
          ) : (
            <Tabletop view={view} send={send} busy={busy} />
          )}
          <details className="room-panel">
            <summary>Room lobby and Decklists</summary>
            <Lobby view={view} send={send} busy={busy} />
          </details>
        </>
      ) : (
        <Lobby view={view} send={send} busy={busy} />
      )}
    </div>
  );
}
