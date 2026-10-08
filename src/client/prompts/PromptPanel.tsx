import { useState } from "react";
import type { MatchAction } from "../../shared/rules-state";
import type { MatchView } from "../../shared/model";
import { manaTypes } from "../../shared/card-dsl";
import { CardChoices } from "./CardChoices";

/**
 * The pending rules choice other than combat: commander return, trigger
 * order, X, targets, payments and discards.
 */
export function PromptPanel({
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
  const [chosenTargets, setChosenTargets] = useState<Record<string, string[]>>(
    {},
  );
  const [chosenModes, setChosenModes] = useState<string[]>([]);
  const singleTarget =
    prompt.targets.length === 1 &&
    prompt.targets[0].min === 1 &&
    prompt.targets[0].max === 1;
  const nameOf = (id: string) =>
    match.objects[id]?.characteristics.name ??
    match.players.find((p) => p.id === id)?.name ??
    id;
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
      ) : kind === "promise-gift" ? (
        <div>
          {prompt.options.gift.objectIds.map((id) => (
            <button
              key={id}
              onClick={() =>
                act({
                  type: "rules-input",
                  procedureId: prompt.procedureId,
                  confirm: true,
                  selections: { gift: [id] },
                })
              }
            >
              Promise a gift to {nameOf(id)}
            </button>
          ))}
          <button
            onClick={() =>
              act({
                type: "rules-input",
                procedureId: prompt.procedureId,
                confirm: false,
              })
            }
          >
            Don't promise a gift
          </button>
        </div>
      ) : kind === "choose-modes" ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            act({
              type: "rules-input",
              procedureId: prompt.procedureId,
              modes: chosenModes,
            });
          }}
        >
          <fieldset>
            <legend>
              Choose {prompt.options.modes.minCount ?? 0} to{" "}
              {prompt.options.modes.count} modes
            </legend>
            {prompt.options.modes.objectIds.map((id) => (
              <label key={id}>
                <input
                  type="checkbox"
                  checked={chosenModes.includes(id)}
                  onChange={(event) =>
                    setChosenModes(
                      event.target.checked
                        ? [...chosenModes, id]
                        : chosenModes.filter((mode) => mode !== id),
                    )
                  }
                />
                {prompt.options.modes.labels?.[id] ?? id}
              </label>
            ))}
          </fieldset>
          <button>Confirm modes</button>
        </form>
      ) : (kind === "choose-targets" || kind === "trigger-targets") &&
        !singleTarget ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            act({
              type: "rules-input",
              procedureId: prompt.procedureId,
              targets: Object.fromEntries(
                prompt.targets.map((clause) => [
                  clause.clauseId,
                  chosenTargets[clause.clauseId] ?? [],
                ]),
              ),
            });
          }}
        >
          {prompt.targets.map((clause) => (
            <label key={clause.clauseId}>
              Targets for {clause.clauseId} ({clause.min}
              {clause.max === clause.min ? "" : ` to ${clause.max}`})
              <select
                multiple
                value={chosenTargets[clause.clauseId] ?? []}
                onChange={(event) =>
                  setChosenTargets({
                    ...chosenTargets,
                    [clause.clauseId]: Array.from(
                      event.target.selectedOptions,
                      (option) => option.value,
                    ),
                  })
                }
              >
                {clause.legalIds.map((id) => (
                  <option key={id} value={id}>
                    {nameOf(id)}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <button>Confirm targets</button>
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
          {(kind === "resolution-payment" ||
            (resolution && Object.keys(prompt.options).length === 0)) && (
            <button
              onClick={() =>
                act({
                  type: "rules-input",
                  procedureId: prompt.procedureId,
                  confirm: false,
                })
              }
            >
              {kind === "resolution-payment" ? "Decline payment" : "Decline"}
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
