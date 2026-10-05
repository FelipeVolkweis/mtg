import { useState } from "react";
import type { MatchAction, MatchView, RoomView } from "../shared/model";
import { phaseSteps } from "../shared/model";
import { manaTypes } from "../shared/rules";
import type { Send } from "./Lobby";

function CardChoices({
  match,
  ids,
  count,
  minCount,
  ordered,
  label,
  selected,
  onChange,
}: {
  match: MatchView;
  ids: string[];
  count: number;
  minCount?: number;
  ordered?: boolean;
  label: string;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <fieldset>
      <legend>
        {label} — choose{" "}
        {minCount !== undefined ? `${minCount}–${count}` : count}
      </legend>
      {ordered && minCount === undefined
        ? Array.from({ length: count }, (_, index) => (
            <label key={index}>
              Position {index + 1}
              <select
                required
                value={selected[index] ?? ""}
                onChange={(event) => {
                  const next = [...selected];
                  next[index] = event.target.value;
                  onChange(next);
                }}
              >
                <option value="">Choose card</option>
                {ids.map((id) => (
                  <option key={id} value={id}>
                    {match.objects[id]?.characteristics.name ?? "Card"}
                  </option>
                ))}
              </select>
            </label>
          ))
        : ids.map((id) => (
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
      {ordered && minCount !== undefined && selected.length > 0 && (
        <p>
          Selected order:{" "}
          {selected
            .map((id) => match.objects[id]?.characteristics.name ?? "Card")
            .join(" → ")}
        </p>
      )}
    </fieldset>
  );
}

function CombatProcedure({
  match,
  act,
}: {
  match: MatchView;
  act: (action: MatchAction) => void;
}) {
  const pending = match.rules!.pending!;
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const attacking = pending.kind === "declare-attackers";
  const damage = pending.kind === "combat-damage";
  const name = (id: string) =>
    match.objects[id]?.characteristics.name ??
    match.players.find((p) => p.id === id)?.name ??
    "Permanent";
  return (
    <section aria-label="Pending combat choice">
      <h2>
        {damage
          ? "Assign combat damage"
          : attacking
            ? "Declare attackers"
            : "Declare blockers"}
      </h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          act({
            type: "rules-input",
            procedureId: pending.id,
            ...(damage
              ? {
                  damageAssignments: (pending.damageChoices ?? []).flatMap(
                    (choice) =>
                      choice.recipientIds.map((recipientId) => ({
                        sourceId: choice.sourceId,
                        recipientId,
                        amount:
                          amounts[`${choice.sourceId}:${recipientId}`] ??
                          (choice.recipientIds.length === 1
                            ? choice.amount
                            : 0),
                      })),
                  ),
                }
              : { selections }),
          });
        }}
      >
        {damage
          ? (pending.damageChoices ?? []).map((choice) => (
              <fieldset key={choice.sourceId}>
                <legend>
                  {name(choice.sourceId)}: assign {choice.amount} damage
                </legend>
                {choice.recipientIds.map((id) => (
                  <label key={id}>
                    Damage from {name(choice.sourceId)} to {name(id)}
                    <input
                      aria-label={`Damage from ${name(choice.sourceId)} to ${name(id)}`}
                      type="number"
                      min={0}
                      max={choice.amount}
                      step={1}
                      required
                      value={
                        amounts[`${choice.sourceId}:${id}`] ??
                        (choice.recipientIds.length === 1 ? choice.amount : 0)
                      }
                      onChange={(event) =>
                        setAmounts({
                          ...amounts,
                          [`${choice.sourceId}:${id}`]: Number(
                            event.target.value,
                          ),
                        })
                      }
                    />
                  </label>
                ))}
              </fieldset>
            ))
          : Object.entries(pending.selectionOptions).map(([id, option]) => (
              <label key={id}>
                {option.label}
                <select
                  aria-label={option.label}
                  value={selections[id]?.[0] ?? ""}
                  onChange={(event) =>
                    setSelections({
                      ...selections,
                      [id]: event.target.value ? [event.target.value] : [],
                    })
                  }
                >
                  <option value="">
                    {attacking ? "Do not attack" : "Do not block"}
                  </option>
                  {option.objectIds.map((target) => (
                    <option key={target} value={target}>
                      {option.labels?.[target] ?? name(target)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
        <button>
          {damage
            ? "Confirm damage"
            : attacking
              ? "Confirm attackers"
              : "Confirm blockers"}
        </button>
      </form>
    </section>
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
  const [chosenX, setChosenX] = useState(0);
  const [alternative, setAlternative] = useState("");
  const [targetId, setTargetId] = useState("");
  const [selections, setSelections] = useState(pending.selections);
  return (
    <section aria-label="Pending rules choice">
      <h2>
        {pending.kind === "commander-return"
          ? "Commander return"
          : pending.kind === "attack-payment"
            ? "Pay attack costs"
            : pending.kind === "trigger-order"
              ? "Order simultaneous triggers"
              : pending.stage === "variable"
                ? "Choose X"
                : pending.kind === "resolve"
                  ? "Resolve spell or ability"
                  : pending.kind === "cleanup"
                    ? "Cleanup discard"
                    : pending.stage === "targets"
                      ? "Choose target"
                      : "Pay costs"}
      </h2>
      {pending.context && <p>{pending.context}</p>}
      {pending.kind === "commander-return" ? (
        <div>
          <button
            onClick={() =>
              act({
                type: "rules-input",
                procedureId: pending.id,
                confirm: true,
              })
            }
          >
            Return to Command Zone
          </button>
          <button
            onClick={() =>
              act({
                type: "rules-input",
                procedureId: pending.id,
                confirm: false,
              })
            }
          >
            Decline return
          </button>
        </div>
      ) : pending.kind === "trigger-order" ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            act({ type: "rules-input", procedureId: pending.id, selections });
          }}
        >
          {pending.selectionOptions.order.objectIds.map((_, index) => (
            <label key={index}>
              Stack position {index + 1} (bottom first)
              <select
                required
                value={selections.order?.[index] ?? ""}
                onChange={(event) => {
                  const order = [...(selections.order ?? [])];
                  order[index] = event.target.value;
                  setSelections({ order });
                }}
              >
                <option value="">Choose trigger</option>
                {pending.selectionOptions.order.objectIds.map((id) => (
                  <option key={id} value={id}>
                    {pending.selectionOptions.order.labels?.[id]}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <button>Confirm trigger order</button>
        </form>
      ) : pending.stage === "variable" ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            act({
              type: "rules-input",
              procedureId: pending.id,
              variables: { X: chosenX },
            });
          }}
        >
          <label>
            X
            <input
              type="number"
              min={0}
              max={1000}
              step={1}
              required
              value={chosenX}
              onChange={(event) => setChosenX(Number(event.target.value))}
            />
          </label>
          <button>Confirm X</button>
        </form>
      ) : pending.stage === "targets" ? (
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
              <option value="">Choose an object</option>
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
          {pending.kind === "resolve" && pending.stage === "payment" && (
            <button
              onClick={() =>
                act({
                  type: "rules-input",
                  procedureId: pending.id,
                  confirm: false,
                })
              }
            >
              Decline payment
            </button>
          )}
          {pending.stage === "payment" && (
            <p>
              Locked mana cost: {pending.totalCost.generic} generic
              {manaTypes
                .filter((color) => pending.totalCost[color] > 0)
                .map((color) => ` · ${pending.totalCost[color]} ${color}`)
                .join("")}
              . Choose mana sources below, then complete payment.
            </p>
          )}
          {pending.kind === "resolve" &&
            Object.keys(pending.selectionOptions).length > 1 && (
              <label>
                Discard option
                <select
                  value={alternative}
                  onChange={(event) => {
                    setAlternative(event.target.value);
                    setSelections({});
                  }}
                >
                  <option value="">Choose a discard option</option>
                  {Object.entries(pending.selectionOptions).map(
                    ([key, option]) => (
                      <option key={key} value={key}>
                        {option.label}
                      </option>
                    ),
                  )}
                </select>
              </label>
            )}
          {Object.entries(pending.selectionOptions)
            .filter(
              ([key]) =>
                pending.kind !== "resolve" ||
                Object.keys(pending.selectionOptions).length === 1 ||
                key === alternative,
            )
            .map(([key, option]) => (
              <CardChoices
                key={key}
                match={match}
                ids={option.objectIds}
                count={option.count}
                minCount={option.minCount}
                ordered={option.ordered}
                label={
                  option.label ??
                  (key === "discard"
                    ? "Discard"
                    : `Pay ${pending.ability?.costs[Number(key)]?.kind} cost`)
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
                ...(pending.kind === "attack-payment" ||
                (pending.kind === "resolve" && pending.stage === "payment")
                  ? {}
                  : { selections }),
                confirm: true,
              })
            }
          >
            {pending.kind === "resolve" && pending.stage === "payment"
              ? "Pay mana"
              : pending.kind === "cleanup" || pending.kind === "resolve"
                ? pending.kind === "resolve" &&
                  !Object.values(pending.selectionOptions).some(
                    (option) => option.requestedCount !== undefined,
                  )
                  ? "Confirm choice"
                  : "Discard selected cards"
                : "Complete payment"}
          </button>
        </>
      )}
      {pending.kind !== "commander-return" &&
        pending.kind !== "cleanup" &&
        pending.kind !== "resolve" &&
        pending.kind !== "trigger-order" &&
        pending.kind !== "trigger-target" && (
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
        {rules.monarchId && (
          <p>
            Monarch: {match.players.find((p) => p.id === rules.monarchId)?.name}
          </p>
        )}
        {rules.practice && (
          <p>
            Solo practice · the practice opponent passes Priority automatically.
            You make its required choices.
          </p>
        )}
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
          ["declare-attackers", "declare-blockers", "combat-damage"].includes(
            pending.kind,
          ) ? (
            <CombatProcedure key={pending.id} match={match} act={act} />
          ) : (
            <Procedure
              key={`${pending.id}:${pending.stage}`}
              match={match}
              act={act}
            />
          )
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
        {rules.combat && (
          <section aria-label="Combat state">
            <h2>Combat</h2>
            {rules.combat.attackers.map((attacker) => (
              <p key={attacker.objectId}>
                {match.objects[attacker.objectId]?.characteristics.name} attacks{" "}
                {match.players.find((p) => p.id === attacker.defenderId)
                  ?.name ??
                  match.objects[attacker.defenderId]?.characteristics.name}
                {attacker.blocked
                  ? ` · Blocked by ${attacker.blockerIds.map((id) => match.objects[id]?.characteristics.name).join(", ") || "departed blockers"}`
                  : " · Unblocked"}
              </p>
            ))}
          </section>
        )}
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
                (
                  zone.objectIds ??
                  Object.values(match.objects)
                    .filter((object) => object.zoneId === zone.id)
                    .map((object) => object.id)
                ).map((id) => {
                  const object = match.objects[id];
                  return (
                    object && (
                      <article key={id} className="rules-card">
                        {!zone.objectIds && <span>Revealed card: </span>}
                        <strong>{object.characteristics.name}</strong>
                        {object.status.tapped && <span> · Tapped</span>}
                        <p>
                          {object.characteristics.manaCost} ·{" "}
                          {object.characteristics.typeLine}
                        </p>
                        <p>{object.characteristics.rulesText}</p>
                        {object.characteristics.power !== undefined && (
                          <p>
                            Power / Toughness: {object.characteristics.power} /{" "}
                            {object.characteristics.toughness}
                          </p>
                        )}
                        {object.attachmentTo &&
                          match.objects[object.attachmentTo] && (
                            <p>
                              Attached to{" "}
                              {
                                match.objects[object.attachmentTo]
                                  .characteristics.name
                              }
                            </p>
                          )}
                        {object.links
                          ?.filter((link) => link.objectIds.length)
                          .map((link, index) => (
                            <p key={index}>
                              {link.label}:{" "}
                              {link.objectIds
                                .map(
                                  (id) =>
                                    match.objects[id]?.characteristics.name,
                                )
                                .join(", ")}
                            </p>
                          ))}
                        {!!rules.markedDamage?.[id] && (
                          <p>{rules.markedDamage[id]} damage</p>
                        )}
                        {object.counters.map((counter) => (
                          <p key={counter.kind}>
                            {counter.quantity} {counter.kind} counters
                          </p>
                        ))}
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
