import { useLayoutEffect, useState } from "react";
import { cardArtwork } from "./rules-presentation";
import { RulesBoard, type BoardSelection } from "./RulesBoard";
import type {
  MatchAction,
  MatchView,
  PromptKind,
  RoomView,
} from "../shared/model";
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
            <label key={id} data-inspect-id={id}>
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
              {match.objects[id] && cardArtwork(match.objects[id]) && (
                <img
                  className="choice-printing"
                  alt=""
                  src={cardArtwork(match.objects[id])}
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                  }}
                />
              )}
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

/** A waiting player's procedure, as other players read it. */
const waitingLabel = (kind: PromptKind) => kind.replaceAll("-", " ");

function CombatProcedure({
  match,
  act,
  selections,
  setSelections,
}: {
  match: MatchView;
  act: (action: MatchAction) => void;
  selections: Record<string, string[]>;
  setSelections: (selections: Record<string, string[]>) => void;
}) {
  const prompt = match.rules.prompt!;
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const attacking = prompt.promptKind === "declare-attackers";
  const damage = prompt.promptKind === "combat-damage";
  const name = (id: string) =>
    match.objects[id]?.characteristics.name ??
    match.players.find((p) => p.id === id)?.name ??
    "Permanent";
  return (
    <section aria-label="Pending combat choice">
      <h2>{prompt.title}</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          act({
            type: "rules-input",
            procedureId: prompt.procedureId,
            ...(damage
              ? {
                  damageAssignments: (prompt.damageChoices ?? []).flatMap(
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
        {damage ? (
          (prompt.damageChoices ?? []).map((choice) => (
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
        ) : (
          <details>
            <summary>Review assignments</summary>
            {Object.entries(prompt.options).map(([id, option]) => (
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
          </details>
        )}
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
  targetId,
  setTargetId,
}: {
  match: MatchView;
  act: (action: MatchAction) => void;
  targetId: string;
  setTargetId: (id: string) => void;
}) {
  const prompt = match.rules.prompt!;
  const kind = prompt.promptKind;
  const [chosenX, setChosenX] = useState(0);
  const [alternative, setAlternative] = useState("");
  const [selections, setSelections] = useState(prompt.selections);
  const resolution = kind === "resolution-choice";
  const legalTargets = prompt.targets[0]?.legalIds ?? [];
  return (
    <section aria-label="Pending rules choice">
      <h2>{prompt.title}</h2>
      {prompt.context && <p>{prompt.context}</p>}
      {kind === "commander-return" ? (
        <div>
          <button
            onClick={() =>
              act({
                type: "rules-input",
                procedureId: prompt.procedureId,
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
                procedureId: prompt.procedureId,
                confirm: false,
              })
            }
          >
            Decline return
          </button>
        </div>
      ) : kind === "order-triggers" ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            act({
              type: "rules-input",
              procedureId: prompt.procedureId,
              selections,
            });
          }}
        >
          {prompt.options.order.objectIds.map((_, index) => (
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
                {prompt.options.order.objectIds.map((id) => (
                  <option key={id} value={id}>
                    {prompt.options.order.labels?.[id]}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <button>Confirm trigger order</button>
        </form>
      ) : kind === "choose-x" ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            act({
              type: "rules-input",
              procedureId: prompt.procedureId,
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
      ) : kind === "choose-targets" || kind === "trigger-targets" ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            act({
              type: "rules-input",
              procedureId: prompt.procedureId,
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
              {legalTargets.map((id) => (
                <option key={id} value={id}>
                  {match.objects[id]?.characteristics.name ??
                    match.players.find((p) => p.id === id)?.name}
                </option>
              ))}
            </select>
          </label>
          <button>Confirm target</button>
        </form>
      ) : (
        <>
          {kind === "resolution-payment" && (
            <button
              onClick={() =>
                act({
                  type: "rules-input",
                  procedureId: prompt.procedureId,
                  confirm: false,
                })
              }
            >
              Decline payment
            </button>
          )}
          {prompt.lockedCost && (
            <p>
              Locked mana cost: {prompt.lockedCost.generic} generic
              {manaTypes
                .filter((color) => prompt.lockedCost![color] > 0)
                .map((color) => ` · ${prompt.lockedCost![color]} ${color}`)
                .join("")}
              . Choose mana sources below, then complete payment.
            </p>
          )}
          {resolution && Object.keys(prompt.options).length > 1 && (
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
                {Object.entries(prompt.options).map(([key, option]) => (
                  <option key={key} value={key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {Object.entries(prompt.options)
            .filter(
              ([key]) =>
                !resolution ||
                Object.keys(prompt.options).length === 1 ||
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
                label={option.label ?? (key === "discard" ? "Discard" : key)}
                selected={selections[key] ?? []}
                onChange={(ids) => setSelections({ ...selections, [key]: ids })}
              />
            ))}
          <button
            onClick={() =>
              act({
                type: "rules-input",
                procedureId: prompt.procedureId,
                ...(kind === "attack-payment" || kind === "resolution-payment"
                  ? {}
                  : { selections }),
                confirm: true,
              })
            }
          >
            {kind === "resolution-payment"
              ? "Pay mana"
              : kind === "cleanup-discard" || resolution
                ? resolution &&
                  !Object.values(prompt.options).some(
                    (option) => option.requestedCount !== undefined,
                  )
                  ? "Confirm choice"
                  : "Discard selected cards"
                : "Complete payment"}
          </button>
        </>
      )}
      {prompt.canAbort && (
        <button
          onClick={() =>
            act({ type: "cancel-procedure", procedureId: prompt.procedureId })
          }
        >
          Cancel procedure
        </button>
      )}
      {prompt.canReverse && (
        <button
          onClick={() =>
            act({ type: "reverse-proposal", procedureId: prompt.procedureId })
          }
        >
          Can't pay — reverse
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
    (p) => p.participantId === view.participantId,
  );
  const prompt = rules.prompt;
  const [bottom, setBottom] = useState<string[]>([]);
  const [targetId, setTargetId] = useState("");
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [sourceId, setSourceId] = useState("");
  useLayoutEffect(() => {
    setTargetId("");
    setSelections({});
    setSourceId("");
  }, [prompt?.procedureId, prompt?.promptKind, match.id]);
  const act = (action: MatchAction) =>
    send({
      type: "match-action",
      matchId: match.id,
      revision: match.revision,
      action,
    });
  const opening = player && !rules.setup.keptPlayerIds.includes(player.id);
  const hand = match.zones.find(
    (z) => z.kind === "hand" && z.ownerId === player?.id,
  );
  const declaration =
    prompt &&
    ["declare-attackers", "declare-blockers"].includes(prompt.promptKind);
  const targeting =
    prompt?.promptKind === "choose-targets" ||
    prompt?.promptKind === "trigger-targets";
  const legalTargets = prompt?.targets[0]?.legalIds ?? [];
  const [phase, step] = phaseSteps[match.turn.stepIndex];
  const name = (id: string) =>
    match.objects[id]?.characteristics.name ??
    match.players.find((p) => p.id === id)?.name ??
    "Departed object";
  const sources = declaration ? Object.keys(prompt.options) : [];
  const selection: BoardSelection = {
    eligible: targeting
      ? legalTargets
      : declaration
        ? [...sources, ...(prompt.options[sourceId]?.objectIds ?? [])]
        : [],
    selected: targeting
      ? [targetId]
      : declaration
        ? [
            sourceId,
            ...Object.entries(selections)
              .filter(([, ids]) => ids.length)
              .map(([id]) => id),
          ]
        : [],
    assigning: !!declaration && !!sourceId,
    links: [
      ...(prompt?.promptKind === "declare-attackers"
        ? []
        : (rules.combat?.attackers ?? []).flatMap((a) => [
            { from: a.objectId, to: a.defenderId },
            ...a.blockerIds.map((id) => ({ from: id, to: a.objectId })),
          ])),
      ...(declaration
        ? Object.entries(selections).flatMap(([from, ids]) =>
            ids.map((to) => ({ from, to })),
          )
        : []),
    ],
    choose(id) {
      if (targeting) {
        if (legalTargets.includes(id)) setTargetId(id);
        return true;
      }
      if (!declaration) return false;
      if (sourceId && prompt.options[sourceId]?.objectIds.includes(id)) {
        setSelections((previous) => ({
          ...previous,
          [sourceId]: previous[sourceId]?.includes(id) ? [] : [id],
        }));
        setSourceId("");
      } else if (sources.includes(id)) {
        if (sourceId === id) {
          setSelections((previous) => ({ ...previous, [id]: [] }));
          setSourceId("");
        } else setSourceId(id);
      }
      return true;
    },
  };
  const pass = match.actions?.find((a) => a.action.type === "pass-priority");
  const stackZone = match.zones.find((z) => z.kind === "stack");
  const nextObject = stackZone?.objectIds?.at(-1);
  const nextName = nextObject
    ? match.objects[nextObject]?.characteristics.name
    : undefined;
  const phaseLabel =
    phase === "Precombat main"
      ? "First main"
      : phase === "Postcombat main"
        ? "Second main"
        : phase;
  const nextStep = phaseSteps[match.turn.stepIndex + 1];
  const nextLabel = nextStep
    ? nextStep[1] === "Main"
      ? nextStep[0] === "Precombat main"
        ? "First main"
        : "Second main"
      : nextStep[1]
    : "Next turn";
  const phaseIndex =
    match.turn.stepIndex < 3
      ? 0
      : match.turn.stepIndex === 3
        ? 1
        : match.turn.stepIndex < 9
          ? 2
          : match.turn.stepIndex === 9
            ? 3
            : 4;
  return (
    <main data-testid="match" className="tabletop rules-tabletop">
      <h1 className="sr-only">Commander Match</h1>
      <span className="sr-only" data-testid="match-revision">
        Revision {match.revision} · {match.outcome}
      </span>
      <RulesBoard
        key={match.id}
        match={match}
        participantId={view.participantId}
        act={act}
        busy={busy}
        selection={selection}
        controls={
          <>
            <section className="priority-control" aria-label="Priority">
              <strong role="status">
                {match.outcome !== "ongoing"
                  ? `Match ${match.outcome}`
                  : match.priority
                    ? match.priority.playerId === player?.id
                      ? "You have Priority"
                      : `${name(match.priority.playerId)} has Priority`
                    : opening
                      ? "Choose your opening hand"
                      : "Required choices"}
              </strong>
              {pass && (
                <button
                  className="primary pass-priority"
                  disabled={busy}
                  onClick={() => act(pass.action)}
                >
                  Pass Priority
                </button>
              )}
              {pass && (
                <small>
                  {stackZone?.count
                    ? `Consecutive passes → Resolve ${nextName ?? "top Stack object"}`
                    : `Consecutive passes → ${nextLabel}`}
                </small>
              )}
              {!pass && match.priority && (
                <small>Waiting for {name(match.priority.playerId)}</small>
              )}
            </section>
            <section className="phase-control" aria-label="Turn and phase">
              <span>
                Turn {match.turn.number} ·{" "}
                {match.turn.activePlayerId === player?.id
                  ? "Your turn"
                  : `${name(match.turn.activePlayerId)}’s turn`}
              </span>
              <h2>{phaseLabel}</h2>
              {step !== "Main" && <span className="current-step">{step}</span>}
              <ol className="phase-progress" aria-label="Phase progression">
                {["Beginning", "Main", "Combat", "Main", "Ending"].map(
                  (label, i) => (
                    <li
                      key={i}
                      aria-current={i === phaseIndex ? "step" : undefined}
                    >
                      <span>{label}</span>
                    </li>
                  ),
                )}
              </ol>
            </section>
          </>
        }
      >
        <aside
          className={`choice-panel ${opening || prompt || rules.waiting ? "has-choice" : "quiet-panel"} ${opening ? "opening-choice" : ""}`}
        >
          <fieldset disabled={busy}>
            {rules.practice && (
              <p className="practice-hint">
                Solo practice · the practice opponent passes Priority
                automatically. You make its required choices.
              </p>
            )}
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
            {prompt ? (
              [
                "declare-attackers",
                "declare-blockers",
                "combat-damage",
              ].includes(prompt.promptKind) ? (
                <>
                  <p>
                    {sourceId
                      ? `Choose a destination for ${name(sourceId)}. Click it again to remove its assignment.`
                      : "Click a creature, then its destination. Confirm when ready."}
                  </p>
                  <CombatProcedure
                    key={prompt.procedureId}
                    match={match}
                    act={act}
                    selections={selections}
                    setSelections={setSelections}
                  />
                </>
              ) : (
                <Procedure
                  key={`${prompt.procedureId}:${prompt.promptKind}`}
                  match={match}
                  act={act}
                  targetId={targetId}
                  setTargetId={setTargetId}
                />
              )
            ) : (
              rules.waiting && (
                <p>
                  Waiting for {name(rules.waiting.playerId)} to complete{" "}
                  {waitingLabel(rules.waiting.promptKind)}.
                </p>
              )
            )}
            {rules.combat && (
              <section aria-label="Combat state">
                <h2>Combat</h2>
                {rules.combat.attackers.map((a) => (
                  <p key={a.objectId}>
                    {name(a.objectId)} attacks {name(a.defenderId)}
                    {a.blocked
                      ? ` · Blocked by ${a.blockerIds.map(name).join(", ") || "departed blockers"}`
                      : " · Unblocked"}
                  </p>
                ))}
              </section>
            )}
            {!prompt && !opening && !rules.waiting && (
              <p>
                Drag a playable card onto the Battlefield. Click a permanent for
                abilities. Alt + hover to enlarge.
              </p>
            )}
          </fieldset>
        </aside>
      </RulesBoard>
    </main>
  );
}
