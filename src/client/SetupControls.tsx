import type { MatchView } from "../shared/model";
import type { Act } from "./Tabletop";

export function SetupControls({
  match,
  playerId,
  act,
  busy,
}: {
  match: MatchView;
  playerId?: string;
  act: Act;
  busy: boolean;
}) {
  return (
    <>
      <details>
        <summary>Special areas and supplementary decks</summary>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            act({
              type: "create-zone",
              kind:
                data.get("kind") === "special" ? "special" : "supplementary",
              name: String(data.get("name")),
              visibility:
                data.get("visibility") === "private" ? "private" : "public",
              ownerId: String(data.get("owner")) || undefined,
            });
          }}
        >
          <label>
            Area name
            <input name="name" required />
          </label>
          <label>
            Area kind
            <select name="kind">
              <option value="special">Special area</option>
              <option value="supplementary">Supplementary deck</option>
            </select>
          </label>
          <label>
            Area visibility
            <select name="visibility">
              <option value="public">Public</option>
              <option value="private">Private</option>
            </select>
          </label>
          <label>
            Area owner
            <select name="owner">
              <option value="">Shared area</option>
              {match.players.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.name}
                </option>
              ))}
            </select>
          </label>
          <button disabled={busy}>Create area</button>
        </form>
      </details>
      {playerId && (
        <details>
          <summary>Opening hand and Sticker Sheets</summary>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              act({
                type: "opening-hand",
                objectId: String(data.get("object")) || undefined,
                description: String(data.get("description")),
                taken: data.get("taken") === "on",
                result: String(data.get("result")),
              });
            }}
          >
            <label>
              Opening-hand card
              <select name="object">
                <option value="">No source card</option>
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
              Opening-hand action
              <input name="description" required />
            </label>
            <label className="checkbox">
              <input name="taken" type="checkbox" />
              Action taken
            </label>
            <label>
              Result
              <textarea name="result" />
            </label>
            <button disabled={busy}>Record Opening-Hand Action</button>
          </form>
          {match.openingHandActions.map((record, i) => (
            <p className="hint" key={i}>
              {record.description}: {record.taken ? "taken" : "not taken"} ·{" "}
              {record.result}
            </p>
          ))}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              act({
                type: "sticker-sheets",
                sheetIds: String(data.get("sheets"))
                  .split(",")
                  .map((sheet) => sheet.trim())
                  .filter(Boolean),
              });
            }}
          >
            <label>
              Your selected Sticker Sheets
              <input
                name="sheets"
                placeholder="Sheet names, separated by commas"
                defaultValue={match.stickerSheets
                  .find((sheets) => sheets.playerId === playerId)
                  ?.sheetIds.join(", ")}
              />
            </label>
            <button disabled={busy}>Record Sticker Sheets</button>
          </form>
        </details>
      )}
    </>
  );
}
