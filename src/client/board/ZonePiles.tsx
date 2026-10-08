import type { MatchPlayer } from "../../shared/rules-state";
import { playerZone, playerZoneCards } from "../rules-presentation";
import type { BoardContext } from "./board-context";
import { Printing } from "./CardTile";

/** A player's Library, Graveyard and Exile as piles; a click opens the Zone. */
export function ZonePiles({
  player,
  board,
}: {
  player: MatchPlayer;
  board: BoardContext;
}) {
  const { match } = board;
  return (
    <div className="player-zone-piles" aria-label={`${player.name} zones`}>
      {(["library", "graveyard", "exile"] as const).map((kind) => {
        const zone = playerZone(match, player, kind);
        const objects = playerZoneCards(match, zone, player.id);
        const count = kind === "library" ? (zone?.count ?? 0) : objects.length;
        const title = `${kind[0].toUpperCase()}${kind.slice(1)}`;
        return (
          <section key={kind} data-testid={`zone-${kind}-${player.name}`}>
            <button
              type="button"
              className="zone-pile-control"
              disabled={kind === "library"}
              aria-label={`${player.name} ${title} (${count})`}
              onClick={() =>
                zone &&
                board.openDrawer({
                  zoneId: zone.id,
                  playerId: player.id,
                  title: `${player.name} — ${title}`,
                })
              }
            >
              <span className="zone-pile-image">
                {kind === "library" ? (
                  <span className="library-back" />
                ) : objects.length ? (
                  <Printing object={objects[objects.length - 1]} />
                ) : (
                  <span className="empty-zone" />
                )}
              </span>
              <span className="zone-pile-title">
                {title} <b>{count}</b>
              </span>
            </button>
          </section>
        );
      })}
    </div>
  );
}
