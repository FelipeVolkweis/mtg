import type { MatchView } from "../../shared/model";

/** What the board lets a player pick during a prompt, and the combat lines it draws. */
export interface BoardSelection {
  choose: (id: string) => boolean;
  eligible: string[];
  selected: string[];
  links: { from: string; to: string }[];
  assigning: boolean;
}

/** The board state and handlers every card tile and zone reads. */
export interface BoardContext {
  match: MatchView;
  busy: boolean;
  selection: BoardSelection;
  /** A ref that registers a node as the anchor of `ids` (combat lines, menus). */
  anchor: (ids: string[]) => (node: HTMLElement | null) => void;
  startDrag: (id: string) => void;
  endDrag: () => void;
  hover: (id: string, node: HTMLElement, altKey: boolean) => void;
  unhover: () => void;
  /** Spreads a folded pile. */
  expand: (ids: string[]) => void;
  openMenu: (id: string, rect: DOMRect) => void;
  closeMenu: () => void;
  openDrawer: (drawer: ZoneDrawerState) => void;
}

export interface ZoneDrawerState {
  zoneId: string;
  playerId: string;
  title: string;
}
