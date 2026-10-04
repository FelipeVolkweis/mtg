import { useState } from "react";
import type { MatchView, ObjectView } from "../shared/model";
import type { Act } from "./Tabletop";
import { AdvancedObject } from "./AdvancedObject";

export function CardInspector({
  object,
  match,
  act,
  busy,
  playerId,
}: {
  object: ObjectView;
  match: MatchView;
  act: Act;
  busy: boolean;
  playerId?: string;
}) {
  const [destination, setDestination] = useState(
    match.zones.find((zone) => zone.kind === "battlefield")!.id,
  );
  const [index, setIndex] = useState("");
  const [directedSource, setDirectedSource] = useState("");
  const [reason, setReason] = useState("");
  return (
    <>
      <h3>{object.characteristics.name}</h3>
      <p>{object.characteristics.typeLine}</p>
      <p>{object.characteristics.rulesText}</p>
      <div className="button-row">
        <button
          disabled={busy}
          onClick={() =>
            act({
              type: "patch-object",
              objectId: object.id,
              patch: {
                status: { ...object.status, tapped: !object.status.tapped },
              },
            })
          }
        >
          {object.status.tapped ? "Untap" : "Tap"}
        </button>
        <button
          disabled={busy}
          onClick={() =>
            act({
              type: "patch-object",
              objectId: object.id,
              patch: {
                status: {
                  ...object.status,
                  phasedOut: !object.status.phasedOut,
                },
              },
            })
          }
        >
          {object.status.phasedOut ? "Phase in" : "Phase out"}
        </button>
      </div>
      <label>
        Move to Zone
        <select
          aria-label="Move to Zone"
          value={destination}
          onChange={(event) => setDestination(event.target.value)}
        >
          {match.zones.map((zone) => (
            <option value={zone.id} key={zone.id}>
              {zone.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Zone position (0 = first; blank = last)
        <input
          type="number"
          min={0}
          value={index}
          onChange={(event) => setIndex(event.target.value)}
        />
      </label>
      <details>
        <summary>Ability-directed private move</summary>
        <p className="hint">
          For a known card that your ability directs into another player's Hand
          or Library.
        </p>
        <label>
          Ability source
          <select
            value={directedSource}
            onChange={(event) => setDirectedSource(event.target.value)}
          >
            <option value="">Normal move</option>
            {Object.values(match.objects)
              .filter(
                (candidate) =>
                  !candidate.hidden && candidate.controllerId === playerId,
              )
              .map((candidate) => (
                <option value={candidate.id} key={candidate.id}>
                  {candidate.characteristics.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Manual cost or effect
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
      </details>
      <button
        disabled={busy || (!!directedSource && !reason)}
        onClick={() =>
          act({
            type: "move",
            objectId: object.id,
            zoneId: destination,
            ...(index ? { index: Number(index) } : {}),
            ...(directedSource
              ? { directedBy: { sourceId: directedSource, reason } }
              : {}),
          })
        }
      >
        Move object
      </button>
      {!object.hidden && (
        <details>
          <summary>Casting choices and payment</summary>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const casting = {
                sourceZoneId: object.casting?.sourceZoneId ?? object.zoneId,
                chosenX: String(data.get("x")) || undefined,
                modes: String(data.get("modes"))
                  .split(",")
                  .map((value) => value.trim())
                  .filter(Boolean),
                components: [object.currentFace ?? 0],
                additionalCosts: String(data.get("additional"))
                  .split(",")
                  .filter(Boolean),
                alternativeCost: String(data.get("alternative")) || undefined,
                manaSpent: String(data.get("mana"))
                  .split(",")
                  .map((value) => value.trim().toUpperCase())
                  .filter(Boolean) as ("W" | "U" | "B" | "R" | "G" | "C")[],
              };
              const stack = match.zones.find((zone) => zone.kind === "stack")!;
              if (object.zoneId === stack.id)
                act({
                  type: "patch-object",
                  objectId: object.id,
                  patch: { casting },
                });
              else
                act({
                  type: "move",
                  objectId: object.id,
                  zoneId: stack.id,
                  cast: casting,
                });
            }}
          >
            <label>
              Casting X
              <input
                name="x"
                pattern="-?[0-9]+"
                defaultValue={object.casting?.chosenX ?? ""}
              />
            </label>
            <label>
              Selected modes
              <input
                name="modes"
                defaultValue={object.casting?.modes.join(", ") ?? ""}
              />
            </label>
            <label>
              Mana colors spent
              <input
                name="mana"
                placeholder="U, R, C…"
                defaultValue={object.casting?.manaSpent.join(", ") ?? ""}
              />
            </label>
            <label>
              Alternative cost
              <input
                name="alternative"
                defaultValue={object.casting?.alternativeCost ?? ""}
              />
            </label>
            <label>
              Additional costs
              <input
                name="additional"
                defaultValue={object.casting?.additionalCosts.join(", ") ?? ""}
              />
            </label>
            <button disabled={busy}>
              {object.zoneId ===
              match.zones.find((zone) => zone.kind === "stack")!.id
                ? "Save Casting Record"
                : "Cast onto Stack"}
            </button>
          </form>
        </details>
      )}
      {object.kind === "ability" && (
        <button
          disabled={busy}
          onClick={() => act({ type: "remove-object", objectId: object.id })}
        >
          Resolve ability
        </button>
      )}
      {object.cardInstanceIds?.length === 0 && object.kind !== "ability" && (
        <button
          disabled={busy}
          onClick={() => act({ type: "remove-object", objectId: object.id })}
        >
          Remove object
        </button>
      )}
      {object.counters.length > 0 && (
        <p>
          {object.counters
            .map((counter) => `${counter.quantity} ${counter.kind}`)
            .join(", ")}
        </p>
      )}
      <AdvancedObject
        object={object}
        match={match}
        act={act}
        busy={busy}
        playerId={playerId}
      />
    </>
  );
}
