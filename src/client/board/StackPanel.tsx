import type { ObjectView } from "../../shared/model";
import { cardArtwork, zoneObjects } from "../rules-presentation";
import type { BoardContext } from "./board-context";
import { CardState, CardTile, Printing } from "./CardTile";

/** One Stack object: its order, a thumbnail, and what it is and targets. */
function StackEntry({
  object,
  index,
  board,
}: {
  object: ObjectView;
  index: number;
  board: BoardContext;
}) {
  const { match } = board;
  const source = object.sourceObjectId
    ? match.objects[object.sourceObjectId]
    : undefined;
  const sourceName =
    source?.characteristics.name ??
    object.resolution?.sourceSnapshot?.characteristics.name;
  const ownerName =
    match.players.find((p) => p.id === object.controllerId)?.name ?? "Player";
  const abilityKind = object.characteristics.typeLine?.includes("Triggered")
    ? "Triggered ability"
    : "Activated ability";
  return (
    <CardTile object={object} stackIndex={index} board={board}>
      <span className="stack-order">{index + 1}</span>
      <span className="stack-thumbnail">
        {object.kind === "ability" ? (
          source && cardArtwork(source) ? (
            <Printing object={source} />
          ) : (
            <span className="ability-thumbnail">Ability</span>
          )
        ) : (
          <Printing object={object} />
        )}
      </span>
      <span className="stack-description">
        <strong>{object.characteristics.name}</strong>
        <span>
          {ownerName} · {object.kind === "ability" ? abilityKind : "Spell"}
        </span>
        {index === 0 && <span className="next-resolve">Next to resolve</span>}
        {sourceName && <small>Source: {sourceName}</small>}
        {!!object.resolution?.targetIds.length && (
          <small>
            Target:{" "}
            {object.resolution.targetIds
              .map(
                (id) =>
                  match.objects[id]?.characteristics.name ??
                  match.players.find((p) => p.id === id)?.name ??
                  "Departed target",
              )
              .join(", ")}
          </small>
        )}
      </span>
      <span className="sr-only">
        <CardState object={object} match={match} />
      </span>
    </CardTile>
  );
}

/** The shared Stack, top object first. */
export function StackPanel({ board }: { board: BoardContext }) {
  const stack = board.match.zones.find((z) => z.kind === "stack");
  const objects = zoneObjects(board.match, stack).slice().reverse();
  return (
    <aside
      className={`rules-stack ${objects.length ? "nonempty-stack" : "empty-stack"}`}
      data-testid="zone-stack-shared"
      aria-label="Stack"
    >
      <h2>Stack ({stack?.count ?? 0})</h2>
      <div className="stack-cards">
        {objects.map((object, i) => (
          <StackEntry key={object.id} object={object} index={i} board={board} />
        ))}
      </div>
    </aside>
  );
}
