import { useState } from "react";
import type { MatchAction } from "../../shared/rules-state";
import type { MatchView } from "../../shared/model";

/** Attack, block and combat damage declarations. */
export function CombatPrompt({
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
  const dividing = prompt.promptKind === "divide-damage";
  const damage = prompt.promptKind === "combat-damage" || dividing;
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
                {name(choice.sourceId)}: {dividing ? "divide" : "assign"}{" "}
                {choice.amount} damage
                {choice.trample &&
                  ` (trample: lethal damage first — ${Object.entries(
                    choice.trample.lethal,
                  )
                    .map(([id, lethal]) => `${name(id)} ${lethal}`)
                    .join(", ")})`}
              </legend>
              {choice.recipientIds.map((id) => (
                <label key={id}>
                  Damage from {name(choice.sourceId)} to {name(id)}
                  <input
                    aria-label={`Damage from ${name(choice.sourceId)} to ${name(id)}`}
                    type="number"
                    min={dividing ? 1 : 0}
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
