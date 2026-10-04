import { useState } from "react";
import type { MatchAction, MatchView, RoomView } from "../shared/model";
import { phaseSteps } from "../shared/model";
import { manaTypes } from "../shared/rules";
import type { Send } from "./Lobby";

function CardChoices({
  match,
  ids,
  count,
  label,
  selected,
  onChange,
}: {
  match: MatchView;
  ids: string[];
  count: number;
  label: string;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <fieldset>
      <legend>
        {label} — choose {count}
      </legend>
      {ids.map((id) => (
        <label key={id}>
          <input
            type="checkbox"
            checked={selected.includes(id)}
            onChange={(event) =>
              onChange(
                event.target.checked
                  ? [...selected, id]
                  : selected.filter((entry) => entry !== id),
              )
            }
          />
          {match.objects[id]?.characteristics.name ?? "Card"}
        </label>
      ))}
    </fieldset>
  );
}

function Procedure({
  match,
  act,
}: {
  match: MatchView;
  act: (action: MatchAction) => void;
}) {
  const pending = match.rules!.pending!;
  const [targetId, setTargetId] = useState("");
  const [selections, setSelections] = useState(pending.selections);
  return (
    <section aria-label="Pending rules choice">
      <h2>
        {pending.kind === "cleanup"
          ? "Cleanup discard"
          : pending.stage === "targets"
            ? "Choose target"
            : "Pay costs"}
      </h2>
      {pending.stage === "targets" ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            act({
              type: "rules-input",
              procedureId: pending.id,
              targetIds: [targetId],
              confirm: false,
            });
          }}
        >
          <label>
            Legal target
            <select
              required
              value={targetId}
              onChange={(event) => setTargetId(event.target.value)}
            >
              <option value="">Choose a spell</option>
              {pending.legalTargetIds.map((id) => (
                <option key={id} value={id}>
                  {match.objects[id]?.characteristics.name}
                </option>
              ))}
            </select>
          </label>
          <button>Confirm target</button>
        </form>
      ) : (
        <>
          {pending.kind !== "cleanup" && (
            <p>
              Locked mana cost: {pending.totalCost.generic} generic
              {manaTypes
                .filter((color) => pending.totalCost[color] > 0)
                .map((color) => ` · ${pending.totalCost[color]} ${color}`)
                .join("")}
              . Choose mana sources below, then complete payment.
            </p>
          )}
          {Object.entries(pending.selectionOptions).map(([key, option]) => (
            <CardChoices
              key={key}
              match={match}
              ids={option.objectIds}
              count={option.count}
              label={
                key === "discard"
                  ? "Discard"
                  : `Pay ${pending.ability?.costs[Number(key)]?.kind} cost`
              }
              selected={selections[key] ?? []}
              onChange={(ids) => setSelections({ ...selections, [key]: ids })}
            />
          ))}
          <button
            onClick={() =>
              act({
                type: "rules-input",
                procedureId: pending.id,
                selections,
                confirm: true,
              })
            }
          >
            {pending.kind === "cleanup"
              ? "Discard selected cards"
              : "Complete payment"}
          </button>
        </>
      )}
      {pending.kind !== "cleanup" && (
        <button
          onClick={() =>
            act({ type: "cancel-procedure", procedureId: pending.id })
          }
        >
          Cancel procedure
        </button>
      )}
    </section>
  );
}

export function RulesTabletop({
  view,
  send,
  busy,
}: {
  view: RoomView;
  send: Send;
  busy: boolean;
}) {
  const match = view.match!;
  const rules = match.rules!;
  const player = match.players.find(
    (player) => player.participantId === view.participantId,
  );
  const [bottom, setBottom] = useState<string[]>([]);
  const act = (action: MatchAction) =>
    send({
      type: "match-action",
      matchId: match.id,
      revision: match.revision,
      action,
    });
  const opening = player && !rules.setup.keptPlayerIds.includes(player.id);
  const hand = match.zones.find(
    (zone) => zone.kind === "hand" && zone.ownerId === player?.id,
  );
  const pending = rules.pending;
  const [phase, step] = phaseSteps[match.turn.stepIndex];
  return (
    <main data-testid="match" className="tabletop rules-tabletop">
      <fieldset disabled={busy}>
        <h1>Commander Match</h1>
        <p data-testid="match-revision">
          Revision {match.revision} · {match.outcome}
        </p>
        <p>
          Turn {match.turn.number} ·{" "}
          {
            match.players.find(
              (player) => player.id === match.turn.activePlayerId,
            )?.name
          }{" "}
          · {phase}: {step}
        </p>
        <p>
          Priority:{" "}
          {match.priority
            ? match.players.find(
                (player) => player.id === match.priority!.playerId,
              )?.name
            : "Opening or required choices"}
        </p>
        <section data-testid="match-players">
          {match.players.map((player) => (
            <p key={player.id}>
              {player.name}: {player.life} life · Mana{" "}
              {manaTypes
                .map((type) => `${rules.mana[player.id][type]} ${type}`)
                .join(" · ")}
            </p>
          ))}
        </section>
        {opening && hand?.objectIds && (
          <section aria-label="Opening Hand">
            <h2>Keep or mulligan</h2>
            <p>
              Your mulligans: {player.mulliganCount}. Two-player Commander
              requires one bottomed card for each mulligan.
            </p>
            {player.mulliganCount > 0 && (
              <CardChoices
                match={match}
                ids={hand.objectIds}
                count={player.mulliganCount}
                label="Bottom cards"
                selected={bottom}
                onChange={setBottom}
              />
            )}
            <button
              onClick={() => {
                setBottom([]);
                act({ type: "mulligan", playerId: player.id });
              }}
            >
              Mulligan
            </button>
            <button
              onClick={() => act({ type: "keep-hand", bottomIds: bottom })}
            >
              Keep Hand
            </button>
          </section>
        )}
        {rules.setup.keptPlayerIds.length < match.players.length &&
          !opening && (
            <p>Waiting for the other player to keep their opening Hand.</p>
          )}
        {pending ? (
          <Procedure
            key={`${pending.id}:${pending.stage}`}
            match={match}
            act={act}
          />
        ) : (
          rules.waiting && (
            <p>
              Waiting for{" "}
              {
                match.players.find(
                  (player) => player.id === rules.waiting!.playerId,
                )?.name
              }{" "}
              to complete {rules.waiting.kind}.
            </p>
          )
        )}
        <section aria-label="Legal rules actions" className="button-row">
          {match.actions?.map(({ label, action }, index) => (
            <button key={index} onClick={() => act(action)}>
              {label}
            </button>
          ))}
        </section>
        <div className="rules-zones">
          {match.zones.map((zone) => (
            <section
              key={zone.id}
              data-testid={`zone-${zone.kind}-${match.players.find((player) => player.id === zone.ownerId)?.name ?? "shared"}`}
            >
              <h2>
                {zone.name} ({zone.count})
              </h2>
              {zone.kind !== "library" &&
                zone.objectIds?.map((id) => {
                  const object = match.objects[id];
                  return (
                    object && (
                      <article key={id} className="rules-card">
                        <strong>{object.characteristics.name}</strong>
                        {object.status.tapped && <span> · Tapped</span>}
                        <p>
                          {object.characteristics.manaCost} ·{" "}
                          {object.characteristics.typeLine}
                        </p>
                        <p>{object.characteristics.rulesText}</p>
                      </article>
                    )
                  );
                })}
            </section>
          ))}
        </div>
      </fieldset>
    </main>
  );
}
