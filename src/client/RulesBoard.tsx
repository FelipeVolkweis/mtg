import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { MatchAction } from "../shared/rules-state";
import type { MatchView } from "../shared/model";
import {
  battlefieldTypes,
  battlefieldType,
  dragAction,
  zoneObjects,
} from "./rules-presentation";
import type {
  BoardContext,
  BoardSelection,
  ZoneDrawerState,
} from "./board/board-context";
import { BattlefieldGroup } from "./board/BattlefieldGroup";
import { CardMenu, CardPreview } from "./board/CardMenu";
import { CombatLines } from "./board/CombatLines";
import { HandZone } from "./board/HandZone";
import { PlayerInfo } from "./board/PlayerInfo";
import { StackPanel } from "./board/StackPanel";
import { useCardSizing } from "./board/useCardSizing";
import { ZoneDrawer } from "./board/ZoneDrawer";
import { ZonePiles } from "./board/ZonePiles";

export type { BoardSelection } from "./board/board-context";

/**
 * The automated Match board: each player's area (Hand, life, Battlefield
 * groups, Zone piles), the local Hand dock, and the command rail (Stack,
 * prompt panel, controls), with the card menu, preview and Zone drawer.
 */
export function RulesBoard({
  match,
  participantId,
  busy,
  act,
  selection,
  children,
  controls,
}: {
  match: MatchView;
  participantId: string;
  busy: boolean;
  act: (action: MatchAction) => void;
  selection: BoardSelection;
  children?: ReactNode;
  controls: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const anchors = useRef(new Map<string, HTMLElement>());
  const lineObserver = useRef<ResizeObserver | null>(null);
  const [menu, setMenu] = useState<{
    id: string;
    rect: DOMRect;
    procedureKey: string;
  } | null>(null);
  const [hover, setHover] = useState<{ id: string; node: HTMLElement } | null>(
    null,
  );
  const [alt, setAlt] = useState(false);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [drawer, setDrawer] = useState<ZoneDrawerState | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const local = match.players.find((p) => p.participantId === participantId);
  const players = [
    ...match.players.filter((p) => p.id !== local?.id),
    ...(local ? [local] : []),
  ];
  const battlefield = match.zones.find((z) => z.kind === "battlefield");
  const permanents = zoneObjects(match, battlefield);
  const promptKey = `${match.rules.prompt?.procedureId}:${match.rules.prompt?.promptKind}`;
  useCardSizing(root, match.revision, expanded);
  useLayoutEffect(() => {
    setMenu(null);
  }, [promptKey]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      setAlt(event.altKey);
      if (event.key === "Escape") {
        setMenu(null);
        setDrawer(null);
        setExpanded([]);
      }
    };
    const blur = () => {
      setAlt(false);
      setHover(null);
    };
    const outside = (event: PointerEvent) => {
      const node = event.target as Element;
      if (!node.closest(".rules-card-menu")) setMenu(null);
      if (!selection.assigning && !node.closest(".rules-card-menu")) {
        const members =
          node
            .closest<HTMLElement>("[data-pile-members]")
            ?.dataset.pileMembers?.split(" ") ?? [];
        setExpanded((previous) =>
          previous.filter((id) => members.includes(id)),
        );
      }
    };
    const scroll = () => {
      setMenu((previous) =>
        previous
          ? {
              ...previous,
              rect:
                anchors.current.get(previous.id)?.getBoundingClientRect() ??
                previous.rect,
            }
          : null,
      );
      setHover((previous) => (previous ? { ...previous } : null));
    };
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", key);
    window.addEventListener("blur", blur);
    document.addEventListener("pointerdown", outside);
    window.addEventListener("scroll", scroll, true);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", key);
      window.removeEventListener("blur", blur);
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [selection.assigning]);
  const board: BoardContext = {
    match,
    busy,
    selection,
    anchor: (ids) => (node) => {
      for (const id of ids) {
        if (node) anchors.current.set(id, node);
        else anchors.current.delete(id);
      }
      if (node) lineObserver.current?.observe(node);
    },
    startDrag(id) {
      setMenu(null);
      setHover(null);
      setDragging(id);
    },
    endDrag: () => setDragging(null),
    hover(id, node, altKey) {
      setAlt(altKey);
      setHover({ id, node });
    },
    unhover: () => setHover(null),
    expand(ids) {
      setExpanded((previous) => [...previous, ...ids]);
      setMenu(null);
    },
    openMenu: (id, rect) => setMenu({ id, rect, procedureKey: promptKey }),
    closeMenu: () => setMenu(null),
    openDrawer: setDrawer,
  };
  const menuObject =
    menu && menu.procedureKey === promptKey
      ? match.objects[menu.id]
      : undefined;
  const preview = alt && hover && match.objects[hover.id];
  const drawerZone = match.zones.find((z) => z.id === drawer?.zoneId);
  return (
    <div
      className="rules-board"
      aria-busy={busy}
      ref={root}
      onMouseOver={(event) => {
        const node = (event.target as Element).closest<HTMLElement>(
          "[data-inspect-id]",
        );
        if (node?.dataset.inspectId && match.objects[node.dataset.inspectId]) {
          setAlt(event.altKey);
          setHover({ id: node.dataset.inspectId, node });
        }
      }}
      onMouseOut={(event) => {
        const node = (event.target as Element).closest("[data-inspect-id]");
        if (
          node &&
          !(
            event.relatedTarget instanceof Node &&
            node.contains(event.relatedTarget)
          )
        )
          setHover(null);
      }}
    >
      <div className="rules-player-areas" data-testid="zone-battlefield-shared">
        {players.map((player) => {
          const isLocal = player.id === local?.id;
          const mine = permanents.filter((o) => o.controllerId === player.id);
          const unattached = mine.filter(
            (o) =>
              !o.attachmentTo ||
              !permanents.some((host) => host.id === o.attachmentTo),
          );
          return (
            <section
              key={player.id}
              className={`rules-player-area accent-${player.seat % 4} ${isLocal ? "local-area" : "opponent-area"}`}
              aria-label={`${player.name} Battlefield`}
              onDragOver={(event) => {
                if (dragging && dragAction(match, dragging)) {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                const id = event.dataTransfer.getData(
                  "application/x-mtg-object",
                );
                const action = dragAction(match, id);
                setDragging(null);
                if (!busy && action) act(action);
              }}
            >
              {!isLocal && (
                <HandZone player={player} local={false} board={board} />
              )}
              <PlayerInfo player={player} board={board} />
              <div className="battlefield-groups">
                {battlefieldTypes.map((type) => {
                  const entries = unattached.filter(
                    (o) => battlefieldType(o) === type,
                  );
                  if (!entries.length) return null;
                  return (
                    <BattlefieldGroup
                      key={type}
                      type={type}
                      player={player}
                      entries={entries}
                      permanents={permanents}
                      expanded={expanded}
                      board={board}
                    />
                  );
                })}
              </div>
              {!isLocal && <ZonePiles player={player} board={board} />}
            </section>
          );
        })}
      </div>
      {local && (
        <div className={`hand-dock accent-${local.seat % 4}`}>
          <ZonePiles player={local} board={board} />
          <HandZone player={local} local board={board} />
        </div>
      )}
      <div className="match-command-rail">
        <StackPanel board={board} />
        {children}
        {controls}
      </div>
      <CombatLines
        root={root}
        anchors={anchors}
        observer={lineObserver}
        links={selection.links}
      />
      {drawer && drawerZone && (
        <ZoneDrawer
          drawer={drawer}
          zone={drawerZone}
          board={board}
          close={() => setDrawer(null)}
        />
      )}
      {menu && menuObject && (
        <CardMenu
          match={match}
          objectId={menu.id}
          rect={menu.rect}
          busy={busy}
          act={act}
          close={() => setMenu(null)}
        />
      )}
      {preview && hover && (
        <CardPreview match={match} object={preview} node={hover.node} />
      )}
    </div>
  );
}
