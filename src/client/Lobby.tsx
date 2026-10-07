import { useEffect, useState } from "react";
import type { DeckView, RoomCommand, RoomView } from "../shared/model";
import { deckFormatNames, playableFormats } from "../shared/model";
import type { Decks } from "./api";
import { DeckEditor } from "./DeckEditor";

export type Send = (command: RoomCommand) => void;
const playable = (deck?: DeckView) =>
  !!deck && playableFormats.includes(deck.format) && !deck.issues.length;

export function Lobby({
  view,
  send,
  busy,
  decks,
}: {
  view: RoomView;
  send: Send;
  busy: boolean;
  decks: Decks;
}) {
  const [editingId, setEditingId] = useState<string>();
  const [selection, setSelection] = useState(view.selectedDeck?.id ?? "");
  const [startingParticipantId, setStartingParticipantId] = useState("");
  const participant = view.participants.find(
    (p) => p.id === view.participantId,
  );
  useEffect(() => {
    setSelection(view.selectedDeck?.id ?? "");
  }, [view.selectedDeck?.id]);
  const selected = decks.decks.find((deck) => deck.id === selection);
  const select = (deckId: string) => {
    setSelection(deckId);
    send({ type: "ready", deckId: deckId || undefined, ready: false });
  };
  const ready = view.participants.filter((p) => p.ready).length;
  if (!participant) return null;
  return (
    <section className="lobby">
      <div className="section-heading">
        <div>
          <h1>Room lobby</h1>
          <p>Choose a deck, take a seat, and gather your friends.</p>
        </div>
        <button onClick={() => send({ type: "close" })} disabled={busy}>
          Close Room
        </button>
      </div>
      <div className="invite">
        <label>
          Invitation link
          <input readOnly value={`${location.origin}${view.invitation}`} />
        </label>
        <button
          onClick={() =>
            void navigator.clipboard.writeText(
              `${location.origin}${view.invitation}`,
            )
          }
        >
          Copy invitation
        </button>
      </div>
      <div className="lobby-grid">
        <section>
          <h2>
            The table <small>{view.participants.length}/4</small>
          </h2>
          <ul data-testid="participants">
            {view.participants.map((p) => (
              <li key={p.id}>
                <strong>{p.name}</strong>
                {p.id === view.participantId && <small>You</small>}
                <span>
                  {p.ready
                    ? "Ready"
                    : view.match &&
                        !view.match.players.some(
                          (player) => player.participantId === p.id,
                        )
                      ? "Waiting for next Match"
                      : "Preparing"}{" "}
                  · {p.connected ? "Connected" : "Disconnected"}
                </span>
              </li>
            ))}
          </ul>
          <label>
            Selected Decklist
            <select
              value={selection}
              disabled={busy}
              onChange={(event) => select(event.target.value)}
            >
              <option value="">Choose a Decklist</option>
              {decks.decks.map((deck) => (
                <option key={deck.id} value={deck.id}>
                  {deck.name}
                  {deck.format === "commander"
                    ? ""
                    : ` (${deckFormatNames[deck.format]})`}
                </option>
              ))}
            </select>
          </label>
          {selected && !playableFormats.includes(selected.format) && (
            <p className="hint">
              {deckFormatNames[selected.format]} Matches are not available yet.
            </p>
          )}
          <div className="button-row">
            <button
              className="primary"
              disabled={busy || !(participant.ready || playable(selected))}
              onClick={() =>
                send({
                  type: "ready",
                  ready: !participant.ready,
                  deckId: selection,
                })
              }
            >
              {participant.ready ? "Not ready" : "Mark ready"}
            </button>
            <button
              disabled={busy || !selected}
              onClick={() => setEditingId(selection)}
            >
              Edit selected Decklist
            </button>
          </div>
          <label>
            Match format
            <select
              aria-label="Match format"
              value="commander"
              onChange={() => {}}
            >
              <option value="commander">Commander (automated)</option>
            </select>
          </label>
          <label>
            Starting player
            <select
              aria-label="Starting player"
              value={startingParticipantId}
              onChange={(event) => setStartingParticipantId(event.target.value)}
            >
              <option value="">Random</option>
              {view.participants
                .filter((p) => p.ready)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>
          <p>
            Commander starts at 40 life. Decklists must contain 100 cards and
            every card must have complete automation support.
          </p>
          <div className="start-match">
            <button
              className="primary"
              disabled={busy || ready !== 2}
              onClick={() =>
                send({
                  type: "start",
                  startingLife: "40",
                  format: "commander",
                  startingParticipantId: startingParticipantId || undefined,
                })
              }
            >
              {view.match ? "Request new Match" : "Start Match"}
            </button>
            {/* Keep solo start isolated so it can be commented out without changing multiplayer start. */}
            {ready === 1 && participant.ready && (
              <button
                className="primary"
                disabled={busy}
                onClick={() => send({ type: "start-solo", startingLife: "40" })}
              >
                Start solo practice
              </button>
            )}
          </div>
          <p className="hint">
            {ready === 1
              ? "1 ready. The ready participant can start a solo Match, or wait for two ready participants to play; other participants wait for the next Match."
              : `${ready} ready. Two ready participants play; other participants wait for the next Match.`}
          </p>
          {view.rematch && (
            <div className="rematch">
              <strong>New Match requested</strong>
              <p>
                Every current Match Player must be connected and confirm. Your
                active game stays here until then.
              </p>
              <p>{view.rematch.confirmations.length} confirmed</p>
              <div className="button-row">
                <button
                  disabled={busy}
                  onClick={() =>
                    send({
                      type: "confirm-rematch",
                      proposalId: view.rematch!.id,
                    })
                  }
                >
                  Confirm new Match
                </button>
                <button
                  disabled={busy}
                  onClick={() => send({ type: "cancel-rematch" })}
                >
                  Cancel new Match
                </button>
              </div>
            </div>
          )}
        </section>
        <section>
          <h2>Your Decklists</h2>
          <p className="hint">
            Your private Deck Catalog, shared by every Room you join.{" "}
            <a href="/decks">Manage all decks</a>
          </p>
          <DeckEditor
            decks={decks}
            editing={decks.decks.find((deck) => deck.id === editingId)}
            onEdit={setEditingId}
            onSaved={(deck) => {
              if (!selection || selection === deck.id) select(deck.id);
            }}
          />
        </section>
      </div>
    </section>
  );
}
