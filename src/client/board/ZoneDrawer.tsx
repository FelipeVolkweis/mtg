import type { ZoneView } from "../../shared/model";
import { playerZoneCards } from "../rules-presentation";
import type { BoardContext, ZoneDrawerState } from "./board-context";
import { CardTile } from "./CardTile";

/** An opened Graveyard or Exile: every card a player has there. */
export function ZoneDrawer({
  drawer,
  zone,
  board,
  close,
}: {
  drawer: ZoneDrawerState;
  zone: ZoneView;
  board: BoardContext;
  close: () => void;
}) {
  const cards = playerZoneCards(board.match, zone, drawer.playerId);
  return (
    <aside
      className="rules-zone-drawer"
      role="dialog"
      aria-label={drawer.title}
    >
      <div className="drawer-heading">
        <h2>
          {drawer.title} ({cards.length})
        </h2>
        <button type="button" onClick={close}>
          Close
        </button>
      </div>
      <div className="drawer-cards">
        {cards.map((o) => (
          <CardTile key={o.id} object={o} board={board} />
        ))}
      </div>
    </aside>
  );
}
