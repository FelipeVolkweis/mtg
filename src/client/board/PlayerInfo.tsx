import { manaTypes } from "../../shared/card-dsl";
import type { MatchPlayer } from "../../shared/rules-state";
import type { BoardContext } from "./board-context";

/** A player's life (a target button), mana pool, counters and commander damage. */
export function PlayerInfo({
  player,
  board,
}: {
  player: MatchPlayer;
  board: BoardContext;
}) {
  const { match, busy, selection } = board;
  const damage = match.rules.commanderDamage?.[player.id] ?? {};
  return (
    <div className="rules-player-info" data-testid={`player-${player.name}`}>
      <button
        type="button"
        disabled={busy}
        ref={board.anchor([player.id])}
        className={`player-target ${selection.eligible.includes(player.id) ? "legal-target" : ""}`}
        onClick={() => {
          if (!busy) selection.choose(player.id);
        }}
        aria-label={`Player: ${player.name}`}
      >
        <span className="life-total" aria-hidden="true">
          {player.life}
        </span>
        <span className="player-name" aria-hidden="true">
          {player.name}
        </span>
        <span className="sr-only">
          {player.name}: {player.life} life
        </span>
        <span className="player-turn-status">
          {player.outcome !== "playing"
            ? player.outcome
            : match.turn.activePlayerId === player.id
              ? "Active player"
              : ""}
        </span>
      </button>
      <div className="mana-pool" aria-label={`${player.name} mana`}>
        {manaTypes.map((type) => (
          <span
            key={type}
            className={`mana-circle mana-${type}`}
            title={type}
            aria-label={`${match.rules.mana[player.id]?.[type] ?? 0} ${type}`}
          >
            {match.rules.mana[player.id]?.[type] ?? 0}
            <small>{type}</small>
          </span>
        ))}
      </div>
      <span className="player-extra">
        {player.counters.map((c) => `${c.quantity} ${c.kind}`).join(" · ")}
        {match.rules.monarchId === player.id && " · Monarch"}
      </span>
      <span className="commander-damage">
        Commander damage:{" "}
        {Object.entries(damage)
          .map(
            ([instanceId, amount]) =>
              `${Object.values(match.objects).find((o) => o.cardInstanceIds?.includes(instanceId))?.characteristics.name ?? "Commander"}: ${amount}`,
          )
          .join(" · ") || "0"}
      </span>
    </div>
  );
}
