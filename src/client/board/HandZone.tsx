import type { MatchPlayer } from "../../shared/rules-state";
import { playerZone, zoneObjects } from "../rules-presentation";
import type { BoardContext } from "./board-context";
import { CardTile } from "./CardTile";

/** A player's commander: in the Command Zone as a card, elsewhere as a note. */
function CommanderSlot({
  player,
  board,
}: {
  player: MatchPlayer;
  board: BoardContext;
}) {
  const { match } = board;
  const info = match.rules.commanders[player.id];
  const object = Object.values(match.objects).find((o) =>
    o.cardInstanceIds?.includes(info?.instanceId ?? ""),
  );
  const kind = match.zones.find((z) => z.id === object?.zoneId)?.kind;
  const tax = 2 * (match.rules.commanderCasts?.[info?.instanceId ?? ""] ?? 0);
  return (
    <section className="commander-slot" aria-label={`${player.name} commander`}>
      <span>Commander · Tax +{tax}</span>
      {object && kind === "command" ? (
        <CardTile object={object} board={board} />
      ) : (
        <span className="commander-placeholder">
          {object?.characteristics.name ?? "Commander"}
          <br />
          {kind ?? "Hidden zone"}
        </span>
      )}
    </section>
  );
}

/** A player's Hand beside their commander; an opponent's shows card backs. */
export function HandZone({
  player,
  local,
  board,
}: {
  player: MatchPlayer;
  local: boolean;
  board: BoardContext;
}) {
  const zone = playerZone(board.match, player, "hand");
  const visible = zoneObjects(board.match, zone);
  return (
    <section
      className={`rules-hand ${local ? "local-hand" : "opponent-hand"}`}
      data-testid={`zone-hand-${player.name}`}
    >
      <span className="hand-label">
        {local ? "Your hand" : "Hand"} · {zone?.count ?? 0}
      </span>
      <div className="hand-with-commander">
        <div className="rules-hand-cards">
          {!zone?.objectIds && (
            <div
              className="hidden-hand"
              aria-label={`${zone?.count ?? 0} concealed cards`}
            >
              {Array.from(
                { length: Math.min(zone?.count ?? 0, 12) },
                (_, i) => (
                  <span className="card-back" key={i} />
                ),
              )}
            </div>
          )}
          {visible.map((o) => (
            <div key={o.id}>
              {!zone?.objectIds && (
                <span>Revealed card: {o.characteristics.name}</span>
              )}
              <CardTile object={o} board={board} />
            </div>
          ))}
        </div>
        <CommanderSlot player={player} board={board} />
      </div>
    </section>
  );
}
