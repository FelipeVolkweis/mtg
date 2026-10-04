import { useState } from "react";
import type { MatchView, ObjectView, ObjectPatch } from "../shared/model";
import {
  CharacteristicFields,
  readCharacteristics,
} from "./CharacteristicsForm";
import type { Act } from "./Tabletop";

export function AdvancedObject({
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
  const patch = (patch: ObjectPatch) =>
    act({ type: "patch-object", objectId: object.id, patch });
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState<{ name: string }[]>([]);
  const visible = Object.values(match.objects).filter(
    (candidate) => !candidate.hidden,
  );
  return (
    <details>
      <summary>Faces, choices and relationships</summary>
      <label>
        Controller
        <select
          aria-label="Controller"
          value={object.controllerId}
          disabled={busy}
          onChange={(event) => patch({ controllerId: event.target.value })}
        >
          {match.players.map((player) => (
            <option key={player.id} value={player.id}>
              {player.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Protector
        <select
          aria-label="Protector"
          value={object.protectorId ?? ""}
          disabled={busy}
          onChange={(event) =>
            patch({ protectorId: event.target.value || null })
          }
        >
          <option value="">No protector</option>
          {match.players.map((player) => (
            <option key={player.id} value={player.id}>
              {player.name}
            </option>
          ))}
        </select>
      </label>
      <button
        disabled={busy}
        onClick={() =>
          patch({
            status: { ...object.status, flipped: !object.status.flipped },
          })
        }
      >
        {object.status.flipped ? "Unflip" : "Flip"}
      </button>
      {object.hidden && object.canTurnFaceUp && (
        <button disabled={busy} onClick={() => patch({ faceDown: null })}>
          Turn face up
        </button>
      )}
      {!object.hidden && (
        <>
          {object.components && object.components.length > 1 && (
            <label>
              Current face
              <select
                aria-label="Current face"
                disabled={busy}
                value={object.currentFace}
                onChange={(event) =>
                  patch({ currentFace: Number(event.target.value) })
                }
              >
                {object.components.map((face, i) => (
                  <option key={i} value={i}>
                    {face.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            disabled={busy || !playerId}
            onClick={() =>
              patch({
                faceDown: object.faceDown
                  ? null
                  : {
                      mode: "manual",
                      characteristics: {
                        name: "Face-down creature",
                        colors: [],
                        typeLine: "Creature",
                        rulesText: "",
                        power: "2",
                        toughness: "2",
                      },
                      inspectableBy: [playerId!],
                      turnUpProcedure: "Turn face up manually",
                    },
              })
            }
          >
            {object.faceDown ? "Turn face up" : "Turn face down"}
          </button>
          {object.faceDown && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                try {
                  patch({
                    faceDown: {
                      mode: String(data.get("mode")),
                      characteristics: readCharacteristics(event.currentTarget),
                      inspectableBy: data.getAll("inspector").map(String),
                      turnUpProcedure: String(data.get("procedure")),
                    },
                  });
                  setError("");
                } catch {
                  setError("Check the face-down characteristics.");
                }
              }}
            >
              <h4>Face-down state</h4>
              <label>
                Face-down source or mode
                <input
                  name="mode"
                  defaultValue={object.faceDown.mode}
                  required
                />
              </label>
              <CharacteristicFields value={object.faceDown.characteristics} />
              <label>
                Turn-up procedure
                <textarea
                  name="procedure"
                  defaultValue={object.faceDown.turnUpProcedure}
                />
              </label>
              <fieldset>
                <legend>May inspect the identity</legend>
                {match.players.map((player) => (
                  <label className="checkbox" key={player.id}>
                    <input
                      name="inspector"
                      type="checkbox"
                      value={player.id}
                      defaultChecked={object.faceDown?.inspectableBy.includes(
                        player.id,
                      )}
                    />
                    {player.name}
                  </label>
                ))}
              </fieldset>
              <button disabled={busy}>Save face-down state</button>
            </form>
          )}
          {object.cardInstanceIds?.length === 0 && (
            <details>
              <summary>Edit object characteristics</summary>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  try {
                    patch({
                      characteristics: readCharacteristics(event.currentTarget),
                    });
                    setError("");
                  } catch {
                    setError("Check the characteristic values.");
                  }
                }}
              >
                <CharacteristicFields value={object.characteristics} />
                <button disabled={busy}>Save characteristics</button>
              </form>
            </details>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const name = String(data.get("choice"));
              patch({
                choices: [
                  ...(object.choices ?? []).filter(
                    (choice) => choice.name !== name,
                  ),
                  { name, value: String(data.get("value")) },
                ],
              });
            }}
          >
            <label>
              Choice name
              <input name="choice" defaultValue="card name" required />
            </label>
            <label>
              Chosen value
              <input
                name="value"
                list="card-names"
                required
                onChange={(event) => {
                  const query = event.target.value;
                  if (query.length > 1)
                    void fetch(
                      `/api/catalog/names?q=${encodeURIComponent(query)}`,
                    )
                      .then((response) => response.json())
                      .then(setSuggestions);
                }}
              />
            </label>
            <datalist id="card-names">
              {suggestions.map((entry) => (
                <option key={entry.name} value={entry.name} />
              ))}
            </datalist>
            <button disabled={busy}>Record choice</button>
          </form>
          <p className="hint">
            {object.choices
              ?.map((choice) => `${choice.name}: ${choice.value}`)
              .join(" · ")}
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const name = String(data.get("variable"));
              patch({
                variables: [
                  ...(object.variables ?? []).filter(
                    (variable) => variable.name !== name,
                  ),
                  { name, value: String(data.get("value")) },
                ],
              });
            }}
          >
            <label>
              Variable name
              <input name="variable" defaultValue="X" required />
            </label>
            <label>
              Variable value
              <input
                name="value"
                defaultValue="0"
                required
                pattern="-?[0-9]+"
              />
            </label>
            <button disabled={busy}>Record variable</button>
          </form>
          <p className="hint">
            {object.variables
              ?.map((variable) => `${variable.name} = ${variable.value}`)
              .join(" · ")}
          </p>
          <div className="button-row">
            {(["solved", "prepared"] as const).map((kind) => (
              <button
                key={kind}
                disabled={busy}
                onClick={() =>
                  patch({
                    designations: [
                      ...(object.designations ?? []).filter(
                        (designation) => designation.kind !== kind,
                      ),
                      {
                        kind,
                        value: !object.designations?.some(
                          (designation) =>
                            designation.kind === kind && designation.value,
                        ),
                      },
                    ],
                  })
                }
              >
                Toggle {kind}
              </button>
            ))}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              patch({
                designations: [
                  ...(object.designations ?? []).filter(
                    (designation) => designation.kind !== "class-level",
                  ),
                  { kind: "class-level", value: String(data.get("level")) },
                ],
              });
            }}
          >
            <label>
              Class level
              <input
                name="level"
                defaultValue="1"
                required
                pattern="-?[0-9]+"
              />
            </label>
            <button disabled={busy}>Record Class level</button>
          </form>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              patch({
                designations: [
                  ...(object.designations ?? []).filter(
                    (designation) => designation.kind !== "room-unlocked",
                  ),
                  {
                    kind: "room-unlocked",
                    value: String(data.get("halves"))
                      .split(",")
                      .filter(Boolean)
                      .map(Number),
                  },
                ],
              });
            }}
          >
            <label>
              Unlocked Room halves (0, 1)
              <input name="halves" pattern="[0-9]+(,[0-9]+)*" />
            </label>
            <button disabled={busy}>Record unlocked halves</button>
          </form>
          <p className="hint">
            {object.designations
              ?.map(
                (designation) =>
                  `${designation.kind}: ${String(designation.value)}`,
              )
              .join(" · ")}
          </p>
          <label>
            Attachment
            <select
              aria-label="Attachment"
              value={object.attachmentTo ?? ""}
              disabled={busy}
              onChange={(event) =>
                patch({ attachmentTo: event.target.value || null })
              }
            >
              <option value="">Unattached</option>
              {visible
                .filter((candidate) => candidate.id !== object.id)
                .map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.characteristics.name}
                  </option>
                ))}
            </select>
          </label>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const label = String(data.get("label"));
              patch({
                links: [
                  ...(object.links ?? []).filter(
                    (link) => link.label !== label,
                  ),
                  {
                    label,
                    objectIds: [String(data.get("target"))],
                    abilityId: String(data.get("ability")) || undefined,
                  },
                ],
              });
            }}
          >
            <label>
              Link label
              <input name="label" defaultValue="related object" required />
            </label>
            <label>
              Linked object
              <select name="target" aria-label="Linked object">
                {visible.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.characteristics.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Linked Card Ability
              <input
                name="ability"
                maxLength={200}
                placeholder="Ability name or reference"
              />
            </label>
            <button disabled={busy}>Record Object Link</button>
          </form>
          <p className="hint">
            {object.links
              ?.map(
                (link) =>
                  `${link.label}: ${link.objectIds
                    .map((id) => match.objects[id]?.characteristics.name)
                    .filter(Boolean)
                    .join(", ")}`,
              )
              .join(" · ")}
          </p>
          <button
            disabled={busy}
            onClick={() => act({ type: "copy", sourceId: object.id })}
          >
            Create token copy
          </button>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              act({
                type: "copy",
                sourceId: String(data.get("source")),
                targetId: object.id,
              });
            }}
          >
            <label>
              Copy from
              <select aria-label="Copy from" name="source">
                {visible.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.characteristics.name}
                  </option>
                ))}
              </select>
            </label>
            <button disabled={busy}>Capture copy on this object</button>
          </form>
          <details>
            <summary>Copy with exceptions</summary>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                try {
                  act({
                    type: "copy",
                    sourceId: object.id,
                    characteristics: readCharacteristics(event.currentTarget),
                  });
                  setError("");
                } catch {
                  setError("Check the copy characteristics.");
                }
              }}
            >
              <CharacteristicFields value={object.characteristics} />
              <button disabled={busy}>Create modified token copy</button>
            </form>
          </details>
          {object.melded ? (
            <button
              disabled={busy}
              onClick={() => act({ type: "unmeld", objectId: object.id })}
            >
              Separate melded cards
            </button>
          ) : (
            object.cardInstanceIds?.length === 1 && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  act({
                    type: "meld",
                    objectIds: [object.id, String(data.get("partner"))],
                    characteristics: {
                      ...object.characteristics,
                      name: String(data.get("name")),
                    },
                  });
                }}
              >
                <label>
                  Meld with
                  <select name="partner" aria-label="Meld with">
                    {visible
                      .filter(
                        (candidate) =>
                          candidate.id !== object.id &&
                          candidate.zoneId === object.zoneId &&
                          candidate.cardInstanceIds?.length === 1,
                      )
                      .map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {candidate.characteristics.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Melded name
                  <input name="name" required />
                </label>
                <button disabled={busy}>Combine melded cards</button>
              </form>
            )
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              act({
                type: "sticker",
                objectId: object.id,
                stickerId: String(data.get("sticker")),
                order: Number(data.get("order")),
              });
            }}
          >
            <label>
              Sticker name
              <input name="sticker" required />
            </label>
            <label>
              Sticker order
              <input name="order" type="number" min={0} defaultValue={0} />
            </label>
            <button disabled={busy}>Record Sticker Placement</button>
          </form>
          <p className="hint">
            {object.stickerPlacements
              ?.map((sticker) => sticker.stickerId)
              .join(", ")}
          </p>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
