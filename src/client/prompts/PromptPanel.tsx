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
