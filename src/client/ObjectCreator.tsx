import { useState } from "react";
import { objectKinds, type GameObject, type MatchView } from "../shared/model";
import {
  CharacteristicFields,
  readCharacteristics,
} from "./CharacteristicsForm";
import type { Act } from "./Tabletop";

export function ObjectCreator({
  match,
  act,
  busy,
  playerId,
}: {
  match: MatchView;
  act: Act;
  busy: boolean;
  playerId?: string;
}) {
  const [kind, setKind] = useState<GameObject["kind"]>("token");
  const [zone, setZone] = useState(
    match.zones.find((zone) => zone.kind === "battlefield")!.id,
  );
  const [error, setError] = useState("");
  return (
    <details>
      <summary>Add token or ability</summary>
      <form
        data-testid="object-creator"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          try {
            act({
              type: "create-object",
              kind,
              zoneId: zone,
              controllerId: String(data.get("controller")),
              characteristics: readCharacteristics(event.currentTarget),
              sourceObjectId: String(data.get("source")) || undefined,
              sourceAbilityId: String(data.get("ability")) || undefined,
            });
            setError("");
          } catch {
            setError(
              "Check the characteristic values; colors use W, U, B, R, or G.",
            );
          }
        }}
      >
        <label>
          Object kind
          <select
            aria-label="Object kind"
            value={kind}
            onChange={(event) => {
              const kind = event.target.value as GameObject["kind"];
              setKind(kind);
              setZone(
                match.zones.find(
                  (zone) =>
                    zone.kind ===
                    (kind === "ability"
                      ? "stack"
                      : kind === "token"
                        ? "battlefield"
                        : "command"),
                )!.id,
              );
            }}
          >
            {objectKinds
              .filter((kind) => kind !== "card")
              .map((kind) => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
          </select>
        </label>
        <label>
          Create in Zone
          <select
            aria-label="Create in Zone"
            value={zone}
            onChange={(event) => setZone(event.target.value)}
          >
            {match.zones
              .filter(
                (zone) =>
                  zone.visibility === "public" || zone.ownerId === playerId,
              )
              .map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Object controller
          <select
            aria-label="Object controller"
            name="controller"
            defaultValue={playerId ?? match.players[0].id}
          >
            {match.players.map((player) => (
              <option key={player.id} value={player.id}>
                {player.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Source Game Object
          <select name="source" aria-label="Source Game Object">
            <option value="">No source</option>
            {Object.values(match.objects)
              .filter((object) => !object.hidden)
              .map((object) => (
                <option key={object.id} value={object.id}>
                  {object.characteristics.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Source Card Ability
          <input
            name="ability"
            maxLength={200}
            placeholder="Ability name or reference"
          />
        </label>
        <CharacteristicFields />
        <button disabled={busy}>Create object</button>
        {error && <p role="alert">{error}</p>}
      </form>
    </details>
  );
}
