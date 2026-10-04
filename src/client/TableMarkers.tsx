import { useEffect, useState } from "react";
import { phaseSteps, type MatchPlayer, type MatchView } from "../shared/model";
import type { Act } from "./Tabletop";

export function PlayerMarker({
  player,
  match,
  act,
  busy,
}: {
  player: MatchPlayer;
  match: MatchView;
  act: Act;
  busy: boolean;
}) {
  const [life, setLife] = useState(player.life);
  useEffect(() => setLife(player.life), [player.life]);
  return (
    <article>
      <h2>{player.name}</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          act({ type: "life", playerId: player.id, value: life });
        }}
      >
        <label>
          {player.name} life
          <input
            value={life}
            onChange={(event) => setLife(event.target.value)}
            pattern="-?[0-9]+"
            inputMode="numeric"
            required
          />
        </label>
        <button disabled={busy}>Save {player.name} life</button>
      </form>
      <div className="counter-summary">
        {player.counters.map((counter) => (
          <span key={counter.kind}>
            {counter.quantity} {counter.kind}
          </span>
        ))}
      </div>
      <label>
        {player.name} status
        <select
          value={player.outcome}
          disabled={busy}
          onChange={(event) =>
            act({
              type: "outcome",
              value: match.outcome,
              playerId: player.id,
              playerStatus: event.target.value as MatchPlayer["outcome"],
            })
          }
        >
          <option value="playing">Still playing</option>
          <option value="won">Won</option>
          <option value="lost">Lost</option>
        </select>
      </label>
    </article>
  );
}

export function TurnMarkers({
  match,
  act,
  busy,
}: {
  match: MatchView;
  act: Act;
  busy: boolean;
}) {
  const [active, setActive] = useState(match.turn.activePlayerId);
  const [number, setNumber] = useState(String(match.turn.number));
  const [step, setStep] = useState(match.turn.stepIndex);
  const [order, setOrder] = useState(
    match.turn.order
      .map((id) => match.players.find((p) => p.id === id)!.name)
      .join(", "),
  );
  useEffect(() => {
    setActive(match.turn.activePlayerId);
    setNumber(String(match.turn.number));
    setStep(match.turn.stepIndex);
  }, [match.turn.activePlayerId, match.turn.number, match.turn.stepIndex]);
  return (
    <section className="turn-markers">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          act({
            type: "turn",
            activePlayerId: active,
            number: Number(number),
            stepIndex: step,
          });
        }}
      >
        <label>
          Active player
          <select
            aria-label="Active player"
            value={active}
            onChange={(event) => setActive(event.target.value)}
          >
            {match.players.map((player) => (
              <option key={player.id} value={player.id}>
                {player.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Turn number
          <input
            value={number}
            onChange={(event) => setNumber(event.target.value)}
            type="number"
            min={1}
            required
          />
        </label>
        <label>
          Phase and step
          <select
            aria-label="Phase and step"
            value={step}
            onChange={(event) => setStep(Number(event.target.value))}
          >
            {phaseSteps.map(([phase, step], i) => (
              <option key={i} value={i}>
                {phase} · {step}
              </option>
            ))}
          </select>
        </label>
        <button disabled={busy}>Save turn markers</button>
      </form>
      <div className="button-row">
        <button
          disabled={busy}
          onClick={() => act({ type: "turn", direction: "previous" })}
        >
          Previous step
        </button>
        <button
          disabled={busy}
          onClick={() => act({ type: "turn", direction: "next" })}
        >
          Next step
        </button>
        <button
          disabled={busy}
          onClick={() => act({ type: "roll", sides: 20 })}
        >
          Roll d20
        </button>
        <label>
          Game outcome
          <select
            aria-label="Game outcome"
            value={match.outcome}
            disabled={busy}
            onChange={(event) =>
              act({
                type: "outcome",
                value: event.target.value as MatchView["outcome"],
              })
            }
          >
            <option value="ongoing">Ongoing</option>
            <option value="complete">Complete</option>
            <option value="draw">Draw</option>
          </select>
        </label>
      </div>
      {match.diceRolls.length > 0 && (
        <p className="hint">
          {match.diceRolls
            .map((roll) => `${roll.name}: ${roll.value} (d${roll.sides})`)
            .join(" · ")}
        </p>
      )}
      <details>
        <summary>Turn order</summary>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            act({
              type: "turn",
              order: order
                .split(",")
                .map(
                  (name) =>
                    match.players.find(
                      (player) =>
                        player.name.toLowerCase() === name.trim().toLowerCase(),
                    )?.id ?? "",
                ),
            });
          }}
        >
          <label>
            Clockwise player names
            <input
              value={order}
              onChange={(event) => setOrder(event.target.value)}
            />
          </label>
          <button disabled={busy}>Save turn order</button>
        </form>
      </details>
    </section>
  );
}

export function CounterMarker({
  match,
  act,
  busy,
}: {
  match: MatchView;
  act: Act;
  busy: boolean;
}) {
  return (
    <details className="counter-marker" open>
      <summary>Counters</summary>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          act({
            type: "counter",
            targetId: String(data.get("target")),
            kind: String(data.get("kind")),
            quantity: String(data.get("quantity")),
          });
        }}
      >
        <label>
          Counter target
          <select name="target" aria-label="Counter target">
            {match.players.map((player) => (
              <option key={player.id} value={player.id}>
                {player.name} (player)
              </option>
            ))}
            {Object.values(match.objects).map((object) => (
              <option key={object.id} value={object.id}>
                {object.characteristics.name} (object)
              </option>
            ))}
          </select>
        </label>
        <label>
          Counter kind
          <input
            name="kind"
            placeholder="+1/+1, poison, flying…"
            required
            maxLength={100}
          />
        </label>
        <label>
          Counter quantity
          <input
            name="quantity"
            required
            pattern="-?[0-9]+"
            inputMode="numeric"
            defaultValue="1"
          />
        </label>
        <button disabled={busy}>Set Counter</button>
      </form>
      <p className="hint">
        Signed integer quantities; use 0 to remove a kind. Counters remain
        manual markers.
      </p>
    </details>
  );
}
