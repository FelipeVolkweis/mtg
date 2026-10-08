import { useEffect, useState, type ReactNode } from "react";
import type { MatchView, ObjectView } from "../../shared/model";
import { cardArtwork, dragAction } from "../rules-presentation";
import type { BoardContext } from "./board-context";

/** A card's name, stats and status as text. */
export function CardState({
  object,
  match,
}: {
  object: ObjectView;
  match: MatchView;
}) {
  const c = object.characteristics;
  return (
    <span className="card-state">
      <strong>{c.name}</strong>
      <span className="sr-only">{c.typeLine}</span>
      {c.power !== undefined && (
        <span>
          {c.power}/{c.toughness}
        </span>
      )}
      {c.loyalty !== undefined && <span>Loyalty {c.loyalty}</span>}
      {c.defense !== undefined && <span>Defense {c.defense}</span>}
      {object.beingCast && <span>Being cast</span>}
      {object.status.tapped && <span>Tapped</span>}
      {object.counters.map((counter) => (
        <span key={counter.kind}>
          {counter.quantity} {counter.kind} counters
        </span>
      ))}
      {!!match.rules.markedDamage?.[object.id] && (
        <span>{match.rules.markedDamage[object.id]} damage</span>
      )}
    </span>
  );
}

/** A card's artwork, or its text when there is none or it fails to load. */
export function Printing({ object }: { object: ObjectView }) {
  const artwork = cardArtwork(object);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [artwork]);
  return artwork && !failed ? (
    <img
      src={artwork}
      alt=""
      draggable={false}
      onError={() => setFailed(true)}
    />
  ) : (
    <span className="printing-fallback">
      <strong>{object.characteristics.name}</strong>
      <span>{object.characteristics.manaCost}</span>
      <span>{object.characteristics.typeLine}</span>
      <span>{object.characteristics.rulesText}</span>
    </span>
  );
}

/**
 * One card on the board: a button the player clicks for actions, drags to
 * play, or picks during a prompt. A folded `pile` shows as one tile with a
 * count; a Stack entry (`stackIndex`) renders `children` as its content.
 */
export function CardTile({
  object,
  pile,
  stackIndex,
  board,
  children,
}: {
  object: ObjectView;
  pile?: ObjectView[];
  stackIndex?: number;
  board: BoardContext;
  children?: ReactNode;
}) {
  const { match, busy, selection } = board;
  const folded = pile && pile.length > 1;
  const ids = folded ? pile.map((o) => o.id) : [object.id];
  const action = dragAction(match, object.id);
  return (
    <button
      ref={board.anchor(ids)}
      type="button"
      disabled={busy}
      data-card-surface
      data-object-id={object.id}
      className={`rules-tile ${object.status.tapped ? "is-tapped" : ""} ${selection.eligible.some((id) => ids.includes(id)) ? "legal-target" : ""} ${selection.selected.some((id) => ids.includes(id)) ? "chosen-card" : ""} ${folded ? "folded-pile" : ""} ${stackIndex !== undefined ? "stack-entry" : ""}`}
      aria-label={
        folded
          ? `Expand ${object.characteristics.name} pile (${pile.length})`
          : `Card: ${object.characteristics.name}`
      }
      aria-pressed={selection.selected.some((id) => ids.includes(id))}
      draggable={!busy && !!action && !folded}
      onDragStart={(event) => {
        if (!action || folded || busy) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.setData("application/x-mtg-object", object.id);
        event.dataTransfer.effectAllowed = "move";
        board.startDrag(object.id);
      }}
      onDragEnd={board.endDrag}
      onMouseEnter={(event) =>
        board.hover(object.id, event.currentTarget, event.altKey)
      }
      onMouseLeave={board.unhover}
      onClick={(event) => {
        if (folded) {
          board.expand(ids);
          return;
        }
        if (busy) return;
        if (selection.choose(object.id)) {
          board.closeMenu();
          return;
        }
        board.openMenu(object.id, event.currentTarget.getBoundingClientRect());
      }}
    >
      {stackIndex === undefined ? (
        <>
          <Printing object={object} />
          <CardState object={object} match={match} />
        </>
      ) : (
        children
      )}
      {folded && <span className="pile-count">×{pile.length}</span>}
      {object.attachmentTo && (
        <span className="attachment-label">
          Attached to{" "}
          {match.objects[object.attachmentTo]?.characteristics.name ??
            "permanent"}
        </span>
      )}
    </button>
  );
}
