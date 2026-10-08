import type { CSSProperties } from "react";
import type { MatchAction } from "../../shared/rules-state";
import type { MatchView, ObjectView } from "../../shared/model";
import { objectActions } from "../rules-presentation";
import { CardState, Printing } from "./CardTile";

const menuWidth = 245;
const menuHeight = 310;
const previewWidth = 260;
const previewHeight = 490;
/** The space kept between a popup and its card or the window edge. */
const popupMargin = 8;

/** A popup's place beside `rect`: to its right if it fits, else to its left. */
function beside(rect: DOMRect, width: number, height: number): CSSProperties {
  const left =
    rect.right + width + 12 <= window.innerWidth
      ? rect.right + popupMargin
      : rect.left - width - popupMargin;
  const top = Math.max(
    popupMargin,
    Math.min(rect.top, window.innerHeight - height - popupMargin),
  );
  return {
    left: Math.max(
      popupMargin,
      Math.min(left, window.innerWidth - width - popupMargin),
    ),
    top,
    width,
    maxHeight: window.innerHeight - top - popupMargin,
  };
}

const cardActionTypes = ["activate-ability", "cast-spell", "play-land"];

/** A card's actions, rules text, source, targets and links, beside the card. */
export function CardMenu({
  match,
  objectId,
  rect,
  busy,
  act,
  close,
}: {
  match: MatchView;
  objectId: string;
  rect: DOMRect;
  busy: boolean;
  act: (action: MatchAction) => void;
  close: () => void;
}) {
  const object = match.objects[objectId];
  const source =
    (object.sourceObjectId &&
      match.objects[object.sourceObjectId]?.characteristics) ||
    object.resolution?.sourceSnapshot?.characteristics;
  const actions = objectActions(match, objectId);
  return (
    <aside
      className="rules-card-menu"
      role="dialog"
      aria-label="Card actions"
      style={beside(rect, menuWidth, menuHeight)}
    >
      <strong>{object.characteristics.name}</strong>
      {actions
        .filter(({ action }) => cardActionTypes.includes(action.type))
        .map(({ label, action }) => (
          <button
            type="button"
            key={JSON.stringify(action)}
            disabled={busy}
            onClick={() => {
              act(action);
              close();
            }}
          >
            {label}
          </button>
        ))}
      {!actions.some((a) => cardActionTypes.includes(a.action.type)) && (
        <span>No available card actions</span>
      )}
      <p>{object.characteristics.rulesText || source?.rulesText}</p>
      {(source || object.sourceObjectId) && (
        <p>Source: {source?.name ?? "Departed source"}</p>
      )}
      {object.resolution?.targetIds.length ? (
        <p>
          Targets:{" "}
          {object.resolution.targetIds
            .map(
              (id) =>
                match.objects[id]?.characteristics.name ??
                match.players.find((p) => p.id === id)?.name ??
                "Departed target",
            )
            .join(", ")}
        </p>
      ) : null}
      {object.links?.map((link, i) => (
        <p key={i}>
          {link.label}:{" "}
          {link.objectIds
            .map((id) => match.objects[id]?.characteristics.name)
            .join(", ")}
        </p>
      ))}
      <small>Alt + hover to enlarge</small>
    </aside>
  );
}

/** The hovered card enlarged while Alt is held. */
export function CardPreview({
  match,
  object,
  node,
}: {
  match: MatchView;
  object: ObjectView;
  node: HTMLElement;
}) {
  return (
    <aside
      className="rules-card-preview"
      aria-label="Enlarged card"
      style={beside(
        node.getBoundingClientRect(),
        previewWidth,
        Math.min(previewHeight, window.innerHeight - 2 * popupMargin),
      )}
    >
      <Printing object={object} />
      <CardState object={object} match={match} />
    </aside>
  );
}
