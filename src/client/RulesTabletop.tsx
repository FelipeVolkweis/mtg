import { useLayoutEffect, useState } from "react";
import { RulesBoard, type BoardSelection } from "./RulesBoard";
import type { MatchAction } from "../shared/rules-state";
import type { PromptKind, RoomView } from "../shared/model";
import { phaseSteps, turnPhases } from "../shared/model";
import { nextTurnStep } from "../shared/card-dsl";
import type { Send } from "./Lobby";
import { CardChoices } from "./prompts/CardChoices";
import { CombatPrompt } from "./prompts/CombatPrompt";
import { PromptPanel } from "./prompts/PromptPanel";

/** A waiting player's procedure, as other players read it. */
const waitingLabel = (kind: PromptKind) => kind.replaceAll("-", " ");

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
  const rules = match.rules;
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
  // A single target is chosen on the board; several clauses or a number of
  // targets are chosen in the prompt panel.
  const targeting =
    (prompt?.promptKind === "choose-targets" ||
      prompt?.promptKind === "trigger-targets") &&
    prompt.targets.length === 1 &&
    prompt.targets[0].min === 1 &&
    prompt.targets[0].max === 1;
  const legalTargets = prompt?.targets[0]?.legalIds ?? [];
  const [phase, step] = phaseSteps[match.turn.step];
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
  const following = nextTurnStep(match.turn.step);
  const nextStep = following && phaseSteps[following];
  const nextLabel = nextStep
    ? nextStep[1] === "Main"
      ? nextStep[0] === "Precombat main"
        ? "First main"
        : "Second main"
      : nextStep[1]
    : "Next turn";
  const phaseIndex = turnPhases.indexOf(phase);
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
                "divide-damage",
              ].includes(prompt.promptKind) ? (
                <>
                  <p>
                    {sourceId
                      ? `Choose a destination for ${name(sourceId)}. Click it again to remove its assignment.`
                      : "Click a creature, then its destination. Confirm when ready."}
                  </p>
                  <CombatPrompt
                    key={prompt.procedureId}
                    match={match}
                    act={act}
                    selections={selections}
                    setSelections={setSelections}
                  />
                </>
              ) : (
                <PromptPanel
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
