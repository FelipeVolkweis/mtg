import { useEffect, useState } from "react";
import type { RoomCommand, RoomView } from "../shared/model";

export type Send = (command: RoomCommand) => void;
export function Lobby({
  view,
  send,
  busy,
}: {
  view: RoomView;
  send: Send;
  busy: boolean;
}) {
  const [decklistName, setName] = useState("");
  const [decklistText, setText] = useState("");
  const [editingId, setEditingId] = useState<string>();
  const [selection, setSelection] = useState(view.selectedDecklistId ?? "");
  const [startingParticipantId, setStartingParticipantId] = useState("");
  const participant = view.participants.find(
    (p) => p.id === view.participantId,
  )!;
  useEffect(() => {
    setSelection(view.selectedDecklistId ?? "");
  }, [view.selectedDecklistId]);
  const ready = view.participants.filter((p) => p.ready).length;
  return (
    <section className="lobby">
      <div className="section-heading">
        <div>
          <h1>Room lobby</h1>
          <p>Save a deck, take a seat, and gather your friends.</p>
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
              onChange={(event) => {
                setSelection(event.target.value);
                send({
                  type: "ready",
                  decklistId: event.target.value || undefined,
                  ready: false,
                });
              }}
            >
              <option value="">Choose a Decklist</option>
              {view.decklists.map((decklist) => (
                <option key={decklist.id} value={decklist.id}>
                  {decklist.name}
                </option>
              ))}
            </select>
          </label>
          <div className="button-row">
            <button
              className="primary"
              disabled={busy || !selection || !view.selectedCommanderId}
              onClick={() =>
                send({
                  type: "ready",
                  ready: !participant.ready,
                  decklistId: selection,
                })
              }
            >
              {participant.ready ? "Not ready" : "Mark ready"}
            </button>
            <button
              disabled={busy || !selection}
              onClick={() => {
                const decklist = view.decklists.find(
                  (deck) => deck.id === selection,
                )!;
                setName(decklist.name);
                setText(decklist.text);
                setEditingId(decklist.id);
              }}
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
          <>
            <label>
              Commander
              <select
                aria-label="Commander"
                disabled={busy || !selection}
                value={view.selectedCommanderId ?? ""}
                onChange={(event) => {
                  if (event.target.value)
                    send({
                      type: "configure-commander",
                      decklistId: selection,
                      definitionId: event.target.value,
                    });
                }}
              >
                <option value="">Choose a commander</option>
                {view.commanderOptions
                  ?.filter((option) => option.eligible)
                  .map((option) => (
                    <option
                      key={option.definitionId}
                      value={option.definitionId}
                    >
                      {option.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Starting player
              <select
                aria-label="Starting player"
                value={startingParticipantId}
                onChange={(event) =>
                  setStartingParticipantId(event.target.value)
                }
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
          </>
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
              ? "1 ready. The ready participant can start a solo Match, or wait for two ready participants to play; other guests wait for the next Match."
              : `${ready} ready. Two ready participants play; other guests wait for the next Match.`}
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
          <p className="hint">Private to you and reusable between Matches.</p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              send({
                type: "save-decklist",
                id: editingId,
                name: decklistName,
                text: decklistText,
              });
            }}
          >
            <label>
              Decklist name
              <input
                required
                maxLength={100}
                value={decklistName}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label>
              Decklist text
              <textarea
                required
                rows={10}
                placeholder={"4 Island\n1 Card Name (SET) 123"}
                value={decklistText}
                onChange={(event) => setText(event.target.value)}
              />
            </label>
            <p className="hint">
              Use canonical card names from locally imported sets. Specify an
              exact printing with (SET) and collector number.
            </p>
            <div className="button-row">
              <button className="primary" disabled={busy}>
                Save Decklist
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(undefined);
                    setName("");
                    setText("");
                  }}
                >
                  New Decklist
                </button>
              )}
            </div>
          </form>
        </section>
      </div>
    </section>
  );
}
