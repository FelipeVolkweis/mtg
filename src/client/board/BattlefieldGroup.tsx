import type { ReactNode } from "react";
import type { ObjectView } from "../../shared/model";
import type { MatchPlayer } from "../../shared/rules-state";
import { cardPiles, type BattlefieldType } from "../rules-presentation";
import type { BoardContext } from "./board-context";
import { CardTile } from "./CardTile";

interface GroupProps {
  board: BoardContext;
  /** Every permanent on the Battlefield, for finding attachments. */
  permanents: ObjectView[];
  /** The ids of the piles the player spread open. */
  expanded: string[];
}

/** A permanent with whatever is attached to it, nested below it. */
function permanent(
  props: GroupProps,
  object: ObjectView,
  pile?: ObjectView[],
  ancestors: string[] = [],
): ReactNode {
  if (ancestors.includes(object.id)) return null;
  return (
    <div className="permanent-with-attachments" key={object.id}>
      <CardTile object={object} pile={pile} board={props.board} />
      {props.permanents
        .filter((child) => child.attachmentTo === object.id)
        .map((child) =>
          permanent(props, child, undefined, [...ancestors, object.id]),
        )}
    </div>
  );
}

/** Identical permanents fold into one pile; the spread ones lie side by side. */
function piles(props: GroupProps, objects: ObjectView[]) {
  const { board, expanded } = props;
  // Keep the opened identities together even when tapping, counters, or
  // attachments would normally split them into different collapsed piles.
  const spread = objects.filter((object) => expanded.includes(object.id));
  const folded = cardPiles(
    board.match,
    objects.filter((object) => !expanded.includes(object.id)),
  );
  const groups = spread.length ? [spread, ...folded] : folded;
  return groups.map((pile) => {
    const opened = pile === spread;
    return (
      <div
        className={`card-pile ${opened ? "spread-pile" : ""}`}
        data-pile-members={pile.map((object) => object.id).join(" ")}
        key={pile.map((object) => object.id).join(":")}
        role={opened ? "group" : undefined}
        aria-label={
          opened
            ? `${pile[0].characteristics.name} spread (${pile.length})`
            : undefined
        }
      >
        {opened
          ? pile.map((object) => permanent(props, object))
          : permanent(props, pile[0], pile)}
      </div>
    );
  });
}

/** One card type's permanents (creatures, lands, …) in a player's area. */
export function BattlefieldGroup({
  type,
  player,
  entries,
  ...props
}: GroupProps & {
  type: BattlefieldType;
  player: MatchPlayer;
  entries: ObjectView[];
}) {
  const label =
    type === "Other"
      ? "Other permanents"
      : `${type === "Battle" ? "Battle" : type}s`;
  return (
    <section
      className={`battlefield-group group-${type.toLowerCase()}`}
      aria-label={`${label} — ${player.name}`}
    >
      <div className="group-cards">{piles(props, entries)}</div>
    </section>
  );
}
