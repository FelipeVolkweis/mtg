import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import type {
  MatchAction,
  MatchPlayer,
  MatchView,
  ObjectView,
  ZoneView,
} from "../shared/model";
import { manaTypes } from "../shared/rules";
import {
  battlefieldTypes,
  battlefieldType,
  cardArtwork,
  cardPiles,
  dragAction,
  objectActions,
  objectOwner,
  zoneObjects,
} from "./rules-presentation";

export interface BoardSelection {
  choose: (id: string) => boolean;
  eligible: string[];
  selected: string[];
  links: { from: string; to: string }[];
  assigning: boolean;
}
function CardState({
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
      {object.status.tapped && <span>Tapped</span>}
      {object.status.phasedOut && <span>Phased out</span>}
      {object.status.flipped && <span>Flipped</span>}
      {object.counters.map((counter) => (
        <span key={counter.kind}>
          {counter.quantity} {counter.kind} counters
        </span>
      ))}
      {!!match.rules?.markedDamage?.[object.id] && (
        <span>{match.rules.markedDamage[object.id]} damage</span>
      )}
    </span>
  );
}
function Printing({ object }: { object: ObjectView }) {
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
    <span
      className={`printing-fallback ${object.hidden || object.faceDown ? "concealed-printing" : ""}`}
    >
      <strong>{object.characteristics.name}</strong>
      <span>{object.characteristics.manaCost}</span>
      <span>{object.characteristics.typeLine}</span>
      <span>{object.characteristics.rulesText}</span>
    </span>
  );
}
function beside(rect: DOMRect, width: number, height: number): CSSProperties {
  const left =
    rect.right + width + 12 <= window.innerWidth
      ? rect.right + 8
      : rect.left - width - 8;
  const top = Math.max(8, Math.min(rect.top, window.innerHeight - height - 8));
  return {
    left: Math.max(8, Math.min(left, window.innerWidth - width - 8)),
    top,
    width,
    maxHeight: window.innerHeight - top - 8,
  };
}
function CombatLines({
  root,
  anchors,
  links,
}: {
  root: RefObject<HTMLDivElement | null>;
  anchors: RefObject<Map<string, HTMLElement>>;
  links: BoardSelection["links"];
}) {
  const [lines, setLines] = useState<
    {
      from: string;
      to: string;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    }[]
  >([]);
  useEffect(() => {
    const update = () => {
      const board = root.current?.getBoundingClientRect();
      if (!board) return;
      const visible = (r: DOMRect) =>
        r.bottom > board.top &&
        r.top < board.bottom &&
        r.right > board.left &&
        r.left < board.right;
      setLines(
        links.flatMap((link) => {
          const a = anchors.current.get(link.from)?.getBoundingClientRect();
          const b = anchors.current.get(link.to)?.getBoundingClientRect();
          return a && b && visible(a) && visible(b)
            ? [
                {
                  ...link,
                  x1: a.left + a.width / 2 - board.left,
                  y1: a.top + a.height / 2 - board.top,
                  x2: b.left + b.width / 2 - board.left,
                  y2: b.top + b.height / 2 - board.top,
                },
              ]
            : [];
        }),
      );
    };
    update();
    const observer = new ResizeObserver(update);
    if (root.current) observer.observe(root.current);
    for (const node of anchors.current.values()) observer.observe(node);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [links, root, anchors]);
  return (
    <svg className="combat-lines" aria-hidden="true">
      <defs>
        <marker
          id="combat-arrow"
          markerWidth="7"
          markerHeight="7"
          refX="6"
          refY="3"
          orient="auto"
        >
          <path d="M0,0 L0,6 L7,3 z" fill="#ffe39b" />
        </marker>
      </defs>
      {lines.map((line, i) => (
        <line
          key={`${line.from}:${line.to}:${i}`}
          {...{ x1: line.x1, y1: line.y1, x2: line.x2, y2: line.y2 }}
          markerEnd="url(#combat-arrow)"
        />
      ))}
    </svg>
  );
}
export function RulesBoard({
  match,
  participantId,
  busy,
  act,
  selection,
  children,
}: {
  match: MatchView;
  participantId: string;
  busy: boolean;
  act: (action: MatchAction) => void;
  selection: BoardSelection;
  children?: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const anchors = useRef(new Map<string, HTMLElement>());
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
  const [drawer, setDrawer] = useState<{
    zoneId: string;
    playerId: string;
    title: string;
  } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const local = match.players.find((p) => p.participantId === participantId);
  const players = [
    ...match.players.filter((p) => p.id !== local?.id),
    ...(local ? [local] : []),
  ];
  const battlefield = match.zones.find((z) => z.kind === "battlefield");
  const permanents = zoneObjects(match, battlefield);
  const stack = match.zones.find((z) => z.kind === "stack");
  const stackObjects = zoneObjects(match, stack).slice().reverse();
  const pendingKey = `${match.rules?.pending?.id}:${match.rules?.pending?.stage}`;
  useLayoutEffect(() => {
    setMenu(null);
  }, [pendingKey]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      setAlt(event.altKey);
      if (event.key === "Escape") {
        setMenu(null);
        setDrawer(null);
        if (!selection.assigning) setExpanded([]);
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
  const anchor = (ids: string[]) => (node: HTMLElement | null) => {
    for (const id of ids) {
      if (node) anchors.current.set(id, node);
      else anchors.current.delete(id);
    }
  };
  function card(object: ObjectView, pile?: ObjectView[]) {
    const folded = pile && pile.length > 1;
    const ids = folded ? pile.map((o) => o.id) : [object.id];
    const action = dragAction(match, object.id);
    return (
      <button
        key={object.id}
        ref={anchor(ids)}
        type="button"
        disabled={busy}
        data-card-surface
        data-object-id={object.id}
        className={`rules-tile ${object.status.tapped ? "is-tapped" : ""} ${selection.eligible.some((id) => ids.includes(id)) ? "legal-target" : ""} ${selection.selected.some((id) => ids.includes(id)) ? "chosen-card" : ""} ${folded ? "folded-pile" : ""}`}
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
          setMenu(null);
          setHover(null);
          event.dataTransfer.setData("application/x-mtg-object", object.id);
          event.dataTransfer.effectAllowed = "move";
          setDragging(object.id);
        }}
        onDragEnd={() => setDragging(null)}
        onMouseEnter={(event) => {
          setAlt(event.altKey);
          setHover({ id: object.id, node: event.currentTarget });
        }}
        onMouseLeave={() => setHover(null)}
        onClick={(event) => {
          if (folded) {
            setExpanded((previous) => [...previous, ...ids]);
            setMenu(null);
            return;
          }
          if (busy) return;
          if (selection.choose(object.id)) {
            setMenu(null);
            return;
          }
          setMenu({
            id: object.id,
            rect: event.currentTarget.getBoundingClientRect(),
            procedureKey: pendingKey,
          });
        }}
      >
        <Printing object={object} />
        <CardState object={object} match={match} />
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
  function zoneForPlayer(player: MatchPlayer, kind: ZoneView["kind"]) {
    return match.zones.find(
      (z) => z.kind === kind && (z.ownerId === player.id || !z.ownerId),
    );
  }
  function zoneCards(zone: ZoneView | undefined, playerId: string) {
    const objects = zoneObjects(match, zone);
    return zone?.ownerId
      ? objects
      : objects.filter((o) => objectOwner(match, o) === playerId);
  }
  function commander(player: MatchPlayer) {
    const info = match.rules?.commanders[player.id];
    const object = Object.values(match.objects).find((o) =>
      o.cardInstanceIds?.includes(info?.instanceId ?? ""),
    );
    const kind = match.zones.find((z) => z.id === object?.zoneId)?.kind;
    const tax =
      2 * (match.rules?.commanderCasts?.[info?.instanceId ?? ""] ?? 0);
    return (
      <section
        className="commander-slot"
        aria-label={`${player.name} commander`}
      >
        <span>Commander · Tax +{tax}</span>
        {object && kind === "command" ? (
          card(object)
        ) : (
          <span className="commander-placeholder">
            {object?.characteristics.name ?? "Commander"}
            <br />
            {kind ?? "Hidden zone"}
          </span>
        )}
      </section>
    );
  }
  function hand(player: MatchPlayer) {
    const zone = zoneForPlayer(player, "hand");
    const visible = zoneObjects(match, zone);
    return (
      <section
        className={`rules-hand ${player.id === local?.id ? "local-hand" : "opponent-hand"}`}
        data-testid={`zone-hand-${player.name}`}
      >
        <span>Hand ({zone?.count ?? 0})</span>
        <div className="hand-with-commander">
          <div className="rules-hand-cards">
            {!zone?.objectIds && (
              <div
                className="hidden-hand"
                aria-label={`${zone?.count ?? 0} concealed cards`}
              >
                {Array.from(
                  { length: Math.min(zone?.count ?? 0, 12) },
                  (_, i) => (
                    <span className="card-back" key={i} />
                  ),
                )}
              </div>
            )}
            {visible.map((o) => (
              <div key={o.id}>
                {!zone?.objectIds && (
                  <span>Revealed card: {o.characteristics.name}</span>
                )}
                {card(o)}
              </div>
            ))}
          </div>
          {commander(player)}
        </div>
      </section>
    );
  }
  function permanent(
    object: ObjectView,
    pile?: ObjectView[],
    ancestors: string[] = [],
  ): ReactNode {
    if (ancestors.includes(object.id)) return null;
    return (
      <div className="permanent-with-attachments" key={object.id}>
        {card(object, pile)}
        {permanents
          .filter((child) => child.attachmentTo === object.id)
          .map((child) =>
            permanent(child, undefined, [...ancestors, object.id]),
          )}
      </div>
    );
  }
  function piles(objects: ObjectView[]) {
    return cardPiles(match, objects).map((pile) => {
      const opened = pile.some((object) => expanded.includes(object.id));
      return (
        <div
          className={`card-pile ${opened ? "expanded-pile" : ""}`}
          data-pile-members={pile.map((object) => object.id).join(" ")}
          key={pile.map((object) => object.id).join(":")}
        >
          {opened
            ? pile.map((object) => permanent(object))
            : permanent(pile[0], pile)}
        </div>
      );
    });
  }
  function playerInfo(player: MatchPlayer) {
    const damage = match.rules?.commanderDamage?.[player.id] ?? {};
    return (
      <div className="rules-player-info" data-testid={`player-${player.name}`}>
        <button
          type="button"
          disabled={busy}
          ref={anchor([player.id])}
          className={`player-target ${selection.eligible.includes(player.id) ? "legal-target" : ""}`}
          onClick={() => {
            if (!busy) selection.choose(player.id);
          }}
          aria-label={`Player: ${player.name}`}
        >
          {player.name}: {player.life} life{" "}
          <span>
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
              aria-label={`${match.rules?.mana[player.id]?.[type] ?? 0} ${type}`}
            >
              {match.rules?.mana[player.id]?.[type] ?? 0}
              <small>{type}</small>
            </span>
          ))}
        </div>
        <span className="player-extra">
          {player.counters.map((c) => `${c.quantity} ${c.kind}`).join(" · ")}
          {match.rules?.monarchId === player.id && " · Monarch"}
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
  const menuObject =
    menu && menu.procedureKey === pendingKey
      ? match.objects[menu.id]
      : undefined;
  const menuSource =
    menuObject &&
    ((menuObject.sourceObjectId &&
      match.objects[menuObject.sourceObjectId]?.characteristics) ||
      menuObject.resolution?.sourceSnapshot?.characteristics);
  const preview = alt && hover && match.objects[hover.id];
  const drawerZone = match.zones.find((z) => z.id === drawer?.zoneId);
  return (
    <div
      className="rules-board"
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
          const mine = permanents.filter((o) => o.controllerId === player.id);
          const unattached = mine.filter(
            (o) =>
              !o.attachmentTo ||
              !permanents.some((host) => host.id === o.attachmentTo),
          );
          const area = (
            <section
              key={player.id}
              className={`rules-player-area accent-${player.seat % 4} ${player.id === local?.id ? "local-area" : "opponent-area"}`}
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
              {player.id !== local?.id && hand(player)}
              {playerInfo(player)}
              <div className="battlefield-groups">
                {battlefieldTypes.map((type) => {
                  const entries = unattached.filter(
                    (o) => battlefieldType(o) === type,
                  );
                  const label =
                    type === "Other"
                      ? "Other permanents"
                      : `${type === "Battle" ? "Battle" : type}s`;
                  return (
                    <section
                      className={`battlefield-group group-${type.toLowerCase()}`}
                      aria-label={`${label} — ${player.name}`}
                      key={type}
                    >
                      <span className="group-label">{label}</span>
                      <div className="group-cards">{piles(entries)}</div>
                    </section>
                  );
                })}
              </div>
              <div className="player-zone-piles">
                {(["library", "graveyard", "exile"] as const).map((kind) => {
                  const zone = zoneForPlayer(player, kind);
                  const objects = zoneCards(zone, player.id);
                  const count =
                    kind === "library" ? (zone?.count ?? 0) : objects.length;
                  const title = `${kind[0].toUpperCase()}${kind.slice(1)}`;
                  return (
                    <section
                      key={kind}
                      data-testid={`zone-${kind}-${player.name}`}
                    >
                      <button
                        type="button"
                        className="zone-pile-control"
                        disabled={kind === "library"}
                        onClick={() =>
                          zone &&
                          setDrawer({
                            zoneId: zone.id,
                            playerId: player.id,
                            title: `${player.name} — ${title}`,
                          })
                        }
                      >
                        <span className="zone-pile-image">
                          {kind === "library" ? (
                            <span className="library-back">Library</span>
                          ) : objects.length ? (
                            <Printing object={objects[objects.length - 1]} />
                          ) : (
                            <span>Empty</span>
                          )}
                        </span>
                        {title} ({count})
                      </button>
                    </section>
                  );
                })}
              </div>
              {player.id === local?.id && hand(player)}
            </section>
          );
          return area;
        })}
      </div>
      <aside
        className={`rules-stack ${stackObjects.length ? "nonempty-stack" : "empty-stack"}`}
        data-testid="zone-stack-shared"
        aria-label="Stack"
      >
        <h2>Stack ({stack?.count ?? 0})</h2>
        <div className="stack-cards">
          {stackObjects.map((object, i) => (
            <div key={object.id} style={{ zIndex: stackObjects.length - i }}>
              {i === 0 && <span className="next-resolve">Next to resolve</span>}
              {card(object)}
            </div>
          ))}
        </div>
      </aside>
      <CombatLines root={root} anchors={anchors} links={selection.links} />
      {children}
      {drawer && drawerZone && (
        <aside
          className="rules-zone-drawer"
          role="dialog"
          aria-label={drawer.title}
        >
          <div className="drawer-heading">
            <h2>
              {drawer.title} ({zoneCards(drawerZone, drawer.playerId).length})
            </h2>
            <button type="button" onClick={() => setDrawer(null)}>
              Close
            </button>
          </div>
          <div className="drawer-cards">
            {zoneCards(drawerZone, drawer.playerId).map((o) => card(o))}
          </div>
        </aside>
      )}
      {menu && menuObject && (
        <aside
          className="rules-card-menu"
          role="dialog"
          aria-label="Card actions"
          style={beside(menu.rect, 245, 310)}
        >
          <strong>{menuObject.characteristics.name}</strong>
          {objectActions(match, menu.id)
            .filter(({ action }) => action.type === "activate-ability")
            .map(({ label, action }) => (
              <button
                type="button"
                key={JSON.stringify(action)}
                disabled={busy}
                onClick={() => {
                  act(action);
                  setMenu(null);
                }}
              >
                {label}
              </button>
            ))}
          {!objectActions(match, menu.id).some(
            (a) => a.action.type === "activate-ability",
          ) && <span>No available activated abilities</span>}
          <p>{menuObject.characteristics.rulesText || menuSource?.rulesText}</p>
          {(menuSource || menuObject.sourceObjectId) && (
            <p>Source: {menuSource?.name ?? "Departed source"}</p>
          )}
          {menuObject.resolution?.targetIds.length ? (
            <p>
              Targets:{" "}
              {menuObject.resolution.targetIds
                .map(
                  (id) =>
                    match.objects[id]?.characteristics.name ??
                    match.players.find((p) => p.id === id)?.name ??
                    "Departed target",
                )
                .join(", ")}
            </p>
          ) : null}
          {menuObject.links?.map((link, i) => (
            <p key={i}>
              {link.label}:{" "}
              {link.objectIds
                .map((id) => match.objects[id]?.characteristics.name)
                .join(", ")}
            </p>
          ))}
          <small>Alt + hover to enlarge</small>
        </aside>
      )}
      {preview && hover && (
        <aside
          className="rules-card-preview"
          aria-label="Enlarged card"
          style={beside(
            hover.node.getBoundingClientRect(),
            260,
            Math.min(490, window.innerHeight - 16),
          )}
        >
          <Printing object={preview} />
          <CardState object={preview} match={match} />
        </aside>
      )}
    </div>
  );
}
