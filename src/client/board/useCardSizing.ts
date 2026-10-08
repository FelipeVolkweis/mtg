import { useLayoutEffect, type RefObject } from "react";

// Card sizing: the largest card that lets every permanent of a player's area
// fit its rows, and every card of the local Hand fit the dock. The sizes are
// set as CSS variables (`--card-width`, `--hand-card-width`) that style.css
// reads; the constants mirror the paddings and gaps there.

/** Card height over width. */
const cardAspect = 1.4;
/** A tapped card's width, in untapped card widths (it lies sideways). */
const tappedWidth = 1.4;

const maxCardWidth = 100;
const minCardWidth = 16;
/** `.battlefield-groups` padding, both sides. */
const groupsPadding = 12;
/** `.battlefield-groups` gaps between rows and between groups in a row. */
const rowGap = 16;
const groupGap = 36;
/** `.group-cards` padding, both sides, above and below a row. */
const groupCardsPadding = 12;
/** The width a group takes around its cards. */
const groupInset = 20;
/** `.group-cards` gap between cards. */
const cardGap = 12;
/** The width an attachment's label adds. */
const attachmentWidth = 12;

const maxHandCardWidth = 98;
const minHandCardWidth = 8;
/** `.rules-hand-cards` padding, both sides. */
const handPadding = 6;
/** The card width the Hand's gap is fitted against. */
const handGapCardWidth = 40;
const minHandGap = 2;
const maxHandGap = 14;

/** Sizes one `.battlefield-groups` area's cards to fit it. */
function fitBattlefield(groups: HTMLElement) {
  const sections = [
    ...groups.querySelectorAll<HTMLElement>(":scope > .battlefield-group"),
  ];
  const land = sections.find((section) =>
    section.classList.contains("group-land"),
  );
  const front = sections.filter((section) => section !== land);
  const opponent = !!groups.closest(".opponent-area");
  // The local player's lands get a row of their own.
  const rows = !opponent && land && front.length ? 2 : 1;
  const height =
    (groups.clientHeight - groupsPadding - (rows - 1) * rowGap) / rows -
    groupCardsPadding;
  const widthFor = (row: HTMLElement[]) => {
    const cards = row.flatMap((section) => [
      ...section.querySelectorAll<HTMLElement>(
        ":scope > .group-cards > .card-pile > .permanent-with-attachments .rules-tile",
      ),
    ]);
    const count = cards.length;
    const units = cards.reduce(
      (sum, card) =>
        sum + (card.classList.contains("is-tapped") ? tappedWidth : 1),
      0,
    );
    const attachments = row.reduce(
      (sum, section) =>
        sum + section.querySelectorAll(".attachment-label").length,
      0,
    );
    return count
      ? (groups.clientWidth -
          groupsPadding -
          Math.max(0, row.length - 1) * groupGap -
          row.length * groupInset -
          Math.max(0, count - row.length) * cardGap -
          attachments * attachmentWidth) /
          units
      : maxCardWidth;
  };
  const width = Math.floor(
    Math.min(
      maxCardWidth,
      height / cardAspect,
      opponent
        ? widthFor(sections)
        : Math.min(widthFor(front), widthFor(land ? [land] : [])),
    ),
  );
  groups.style.setProperty(
    "--card-width",
    `${Math.max(minCardWidth, width)}px`,
  );
  groups.style.setProperty("--card-height", "calc(var(--card-width) * 1.4)");
}

/** Sizes the local Hand's cards and gap to fit the dock. */
function fitHand(hand: HTMLElement) {
  const count = hand.querySelectorAll(":scope > div > .rules-tile").length;
  if (!count) return;
  const gap = Math.max(
    minHandGap,
    Math.min(
      maxHandGap,
      Math.floor(
        (hand.clientWidth - count * handGapCardWidth) / Math.max(1, count - 1),
      ),
    ),
  );
  const width = Math.floor(
    Math.min(
      maxHandCardWidth,
      (hand.clientHeight - handPadding) / cardAspect,
      (hand.clientWidth - handPadding - (count - 1) * gap) / count,
    ),
  );
  hand.style.setProperty(
    "--hand-card-width",
    `${Math.max(minHandCardWidth, width)}px`,
  );
  hand.style.gap = `${gap}px`;
}

/**
 * Fits the board's cards on every render that may change them (`revision`,
 * `expanded`) and whenever the board, the Hand or an area resizes.
 */
export function useCardSizing(
  root: RefObject<HTMLElement | null>,
  revision: number,
  expanded: string[],
) {
  useLayoutEffect(() => {
    const board = root.current;
    if (!board) return;
    const handSelector = ".local-hand .rules-hand-cards";
    const fit = () => {
      for (const groups of board.querySelectorAll<HTMLElement>(
        ".battlefield-groups",
      ))
        fitBattlefield(groups);
      const hand = board.querySelector<HTMLElement>(handSelector);
      if (hand) fitHand(hand);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(board);
    const hand = board.querySelector(handSelector);
    if (hand) observer.observe(hand);
    for (const group of board.querySelectorAll(".battlefield-groups"))
      observer.observe(group);
    return () => observer.disconnect();
  }, [root, revision, expanded]);
}
