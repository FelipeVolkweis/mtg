import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type WheelEvent,
} from "react";
import type {
  MatchAction,
  ObjectView,
  RoomView,
  ZoneView,
} from "../shared/model";
import {
  TABLE_HEIGHT,
  TABLE_WIDTH,
  playerAreas,
  projectPosition,
  unprojectPosition,
} from "../shared/table-layout";
import type { Send } from "./Lobby";
import { PlayerMarker, TurnMarkers, CounterMarker } from "./TableMarkers";
import { ObjectCreator } from "./ObjectCreator";
import { CardInspector } from "./CardInspector";
import { SetupControls } from "./SetupControls";

export type Act = (action: MatchAction) => void;

export function Tabletop({
  view,
  send,
  busy,
}: {
  view: RoomView;
  send: Send;
  busy: boolean;
}) {
  const match = view.match!;
  const player = match.players.find(
    (entry) => entry.participantId === view.participantId,
  );
  const readOnly = match.players.length === 1 && !player;
  const action: Act = (next) =>
    send({
      type: "match-action",
      matchId: match.id,
      revision: match.revision,
      action: next,
    });
  const battlefield = match.zones.find((zone) => zone.kind === "battlefield")!;
  const stack = match.zones.find((zone) => zone.kind === "stack")!;
  const viewerSeat = player?.seat ?? 0;
  const areas = playerAreas(match.players.length, viewerSeat);
  const [selected, setSelected] = useState<string>();
  const [drawerId, setDrawerId] = useState<string>();
  const [inspectLibrary, setInspectLibrary] = useState(false);
  const [failedArt, setFailedArt] = useState<string[]>([]);
  const [hovered, setHovered] = useState<string>();
  const [alt, setAlt] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [viewport, setViewport] = useState({ width: 1000, height: 600 });
  const viewportRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const space = useRef(false);
  const panning = useRef<{
    x: number;
    y: number;
    originX: number;
    originY: number;
  } | null>(null);
  const drag = useRef<{
    id: string;
    x: number;
    y: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [dragLabel, setDragLabel] = useState<{
    x: number;
    y: number;
    name: string;
  }>();
  const [mulliganInput, setMulliganInput] = useState(
    String(player?.mulliganCount ?? 0),
  );
  const scale =
    Math.min(viewport.width / TABLE_WIDTH, viewport.height / TABLE_HEIGHT) *
    zoom;
  const selection = selected ? match.objects[selected] : undefined;
  const ownHand = match.zones.find(
    (zone) => zone.kind === "hand" && zone.ownerId === player?.id,
  );
  const ownLibrary = match.zones.find(
    (zone) => zone.kind === "library" && zone.ownerId === player?.id,
  );
  const drawer = match.zones.find((zone) => zone.id === drawerId);
  function toggleTapped(object: ObjectView) {
    action({
      type: "patch-object",
      objectId: object.id,
      patch: { status: { ...object.status, tapped: !object.status.tapped } },
    });
  }

  useEffect(
    () => setMulliganInput(String(player?.mulliganCount ?? 0)),
    [player?.mulliganCount],
  );

  useEffect(() => {
    const target = viewportRef.current;
    if (!target) return;
    const observer = new ResizeObserver(() =>
      setViewport({ width: target.clientWidth, height: target.clientHeight }),
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    function editable(target: EventTarget | null) {
      return (
        target instanceof HTMLElement &&
        !!target.closest("input, textarea, select, [contenteditable='true']")
      );
    }
    function down(event: KeyboardEvent) {
      if (event.key === "Alt") setAlt(true);
      if (editable(event.target)) return;
      if (event.code === "Space") {
        space.current = true;
        event.preventDefault();
      }
      if (
        event.key.toLowerCase() === "t" &&
        !event.repeat &&
        selection?.zoneId === battlefield.id &&
        !busy &&
        !readOnly
      )
        toggleTapped(selection);
    }
    function up(event: KeyboardEvent) {
      if (event.key === "Alt") setAlt(false);
      if (event.code === "Space") space.current = false;
    }
    function blur() {
      setAlt(false);
      space.current = false;
    }
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [selection, battlefield.id, busy, readOnly, match.revision]);

  function pointerDown(
    event: PointerEvent<HTMLButtonElement>,
    object: ObjectView,
  ) {
    if (space.current) return;
    setSelected(object.id);
    if (busy || readOnly || event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    drag.current = {
      id: object.id,
      x: event.clientX,
      y: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function pointerMove(event: PointerEvent<HTMLButtonElement>) {
    if (
      drag.current &&
      Math.hypot(
        event.clientX - drag.current.x,
        event.clientY - drag.current.y,
      ) > 4
    )
      setDragLabel({
        x: event.clientX,
        y: event.clientY,
        name: match.objects[drag.current.id]?.characteristics.name ?? "Card",
      });
  }
  function pointerUp(event: PointerEvent<HTMLButtonElement>) {
    const origin = drag.current;
    drag.current = null;
    setDragLabel(undefined);
    if (
      !origin ||
      Math.hypot(event.clientX - origin.x, event.clientY - origin.y) < 4
    )
      return;
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-zone-id]");
    if (!target?.dataset.zoneId) return;
    const object = match.objects[origin.id];
    if (!object) return;
    let position;
    if (target.dataset.zoneId === battlefield.id && surfaceRef.current) {
      const rect = surfaceRef.current.getBoundingClientRect();
      position = unprojectPosition(
        {
          x: Math.max(
            0,
            Math.min(
              TABLE_WIDTH - 80,
              (event.clientX - rect.left - origin.offsetX) / scale,
            ),
          ),
          y: Math.max(
            0,
            Math.min(
              TABLE_HEIGHT - 110,
              (event.clientY - rect.top - origin.offsetY) / scale,
            ),
          ),
        },
        match.players.length,
        viewerSeat,
      );
    }
    if (object.zoneId === target.dataset.zoneId && position)
      action({ type: "position", objectId: object.id, position });
    else if (object.zoneId !== target.dataset.zoneId)
      action({
        type: "move",
        objectId: object.id,
        zoneId: target.dataset.zoneId,
        ...(position ? { position } : {}),
      });
  }
  function card(object: ObjectView, spatial = false) {
    const face = object.currentFace ?? 0;
    const artwork =
      !object.hidden && !failedArt.includes(`${object.id}:${face}`)
        ? object.artwork?.[face]
        : undefined;
    const position = projectPosition(
      match.layout.positions[object.id] ?? { x: 24, y: 76 },
      match.players.length,
      viewerSeat,
    );
    return (
      <button
        key={object.id}
        className={`game-card ${spatial ? "spatial" : ""} ${object.status.tapped ? "tapped" : ""} ${object.status.phasedOut ? "phased-out" : ""}`}
        aria-label={object.characteristics.name}
        aria-pressed={selected === object.id}
        data-object-id={object.id}
        style={spatial ? { left: position.x, top: position.y } : undefined}
        onPointerDown={(event) => pointerDown(event, object)}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={() => {
          drag.current = null;
          setDragLabel(undefined);
        }}
        onClick={() => setSelected(object.id)}
        onMouseEnter={() => setHovered(object.id)}
        onMouseLeave={() => setHovered(undefined)}
        onDoubleClick={() => {
          if (spatial && !busy && !readOnly) toggleTapped(object);
        }}
      >
        {artwork ? (
          <img
            src={artwork}
            alt=""
            draggable={false}
            onError={() =>
              setFailedArt((current) => [...current, `${object.id}:${face}`])
            }
          />
        ) : (
          <span className="card-fallback">
            <strong>{object.characteristics.name}</strong>
            <span>{object.characteristics.manaCost}</span>
            <small>{object.characteristics.typeLine}</small>
            <span>{object.characteristics.rulesText}</span>
          </span>
        )}
        {object.counters.length > 0 && (
          <span className="counter-badge">
            {object.counters
              .map((counter) => `${counter.quantity} ${counter.kind}`)
              .join(", ")}
          </span>
        )}
      </button>
    );
  }
  function zoneContents(zone: ZoneView) {
    return zone.objectIds?.map(
      (id) => match.objects[id] && card(match.objects[id]),
    );
  }
  function zoneIndicator(zone: ZoneView) {
    const owner = match.players.find((entry) => entry.id === zone.ownerId);
    const testId = `zone-${zone.kind}${owner ? `-${owner.name}` : ""}`;
    return (
      <section
        key={zone.id}
        className="zone-indicator"
        data-testid={testId}
        data-zone-id={zone.id}
      >
        <button type="button" onClick={() => setDrawerId(zone.id)}>
          {zone.kind === "library"
            ? "Library"
            : zone.kind === "graveyard"
              ? "Graveyard"
              : zone.name}{" "}
          <b>{zone.count}</b>{" "}
          <span className="sr-only">{zone.count === 1 ? "card" : "cards"}</span>
        </button>
        {zone.kind === "hand" && !zone.objectIds && (
          <div
            className="concealed-hand"
            aria-label={`${owner?.name} concealed Hand`}
          >
            {Array.from({ length: Math.min(zone.count, 5) }, (_, i) => (
              <span
                key={i}
                className={`card-back accent-${owner?.seat ?? 0}`}
              />
            ))}
          </div>
        )}
        {(zone.kind === "hand" || zone.kind === "stack") && zone.objectIds && (
          <div className="card-list">{zoneContents(zone)}</div>
        )}
      </section>
    );
  }
  function onWheel(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    setZoom((current) =>
      Math.max(
        0.5,
        Math.min(3, current * (event.deltaY < 0 ? 1.12 : 1 / 1.12)),
      ),
    );
  }
  return (
    <main className="tabletop" data-testid="match">
      {readOnly && (
        <p className="observer-hint" role="status">
          You are observing this solo Match. Only {match.players[0].name} can
          make changes.
        </p>
      )}
      <fieldset disabled={readOnly} className="tabletop-controls">
        <div className="tabletop-heading">
          <div>
            <h1>Manual Match</h1>
            <span>Shared Battlefield · play freely</span>
          </div>
          <div className="tabletop-heading-actions">
            <span data-testid="match-revision">Revision {match.revision}</span>
            <button
              type="button"
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
            >
              Fit table
            </button>
          </div>
        </div>
        <div className="tabletop-turn">
          <TurnMarkers match={match} act={action} busy={busy} />
        </div>
        <div className="tabletop-workspace">
          <div className="table-main">
            <div
              className="battlefield"
              data-testid="battlefield"
              data-zone-id={battlefield.id}
              ref={viewportRef}
              onWheel={onWheel}
              onPointerDown={(event) => {
                if (space.current) {
                  panning.current = {
                    x: event.clientX,
                    y: event.clientY,
                    originX: pan.x,
                    originY: pan.y,
                  };
                  event.currentTarget.setPointerCapture(event.pointerId);
                }
              }}
              onPointerMove={(event) => {
                if (panning.current)
                  setPan({
                    x:
                      panning.current.originX +
                      event.clientX -
                      panning.current.x,
                    y:
                      panning.current.originY +
                      event.clientY -
                      panning.current.y,
                  });
              }}
              onPointerUp={() => {
                panning.current = null;
              }}
              onPointerCancel={() => {
                panning.current = null;
              }}
            >
              <div
                className="table-surface"
                ref={surfaceRef}
                style={{
                  left: (viewport.width - TABLE_WIDTH * scale) / 2 + pan.x,
                  top: (viewport.height - TABLE_HEIGHT * scale) / 2 + pan.y,
                  transform: `scale(${scale})`,
                }}
              >
                <div data-testid="match-players" className="player-areas">
                  {areas.map((area) => {
                    const matchPlayer = match.players.find(
                      (entry) => entry.seat === area.seat,
                    )!;
                    const zones = match.zones.filter(
                      (zone) =>
                        zone.ownerId === matchPlayer.id && zone.kind !== "hand",
                    );
                    const hand = match.zones.find(
                      (zone) =>
                        zone.ownerId === matchPlayer.id && zone.kind === "hand",
                    )!;
                    return (
                      <section
                        key={area.seat}
                        className={`player-area accent-${area.seat}`}
                        data-testid={`player-area-${matchPlayer.name}`}
                        style={{
                          left: area.x,
                          top: area.y,
                          width: area.width,
                          height: area.height,
                        }}
                      >
                        <PlayerMarker
                          player={matchPlayer}
                          match={match}
                          act={action}
                          busy={busy}
                        />
                        <div className="area-zones">
                          {zones.map(zoneIndicator)}
                          {matchPlayer.id !== player?.id && zoneIndicator(hand)}
                        </div>
                      </section>
                    );
                  })}
                </div>
                {battlefield.objectIds?.map(
                  (id) => match.objects[id] && card(match.objects[id], true),
                )}
                {selection?.zoneId === battlefield.id && (
                  <div
                    className="card-quick-menu"
                    style={{
                      left: Math.min(
                        820,
                        projectPosition(
                          match.layout.positions[selection.id] ?? {
                            x: 24,
                            y: 76,
                          },
                          match.players.length,
                          viewerSeat,
                        ).x + 94,
                      ),
                      top: Math.min(
                        465,
                        projectPosition(
                          match.layout.positions[selection.id] ?? {
                            x: 24,
                            y: 76,
                          },
                          match.players.length,
                          viewerSeat,
                        ).y,
                      ),
                    }}
                  >
                    <strong>{selection.characteristics.name}</strong>
                    <button
                      disabled={busy}
                      onClick={() => toggleTapped(selection)}
                    >
                      Toggle tap
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        action({
                          type: "move",
                          objectId: selection.id,
                          zoneId: stack.id,
                        })
                      }
                    >
                      Move to Stack
                    </button>
                    <label>
                      Change controller
                      <select
                        aria-label="Change controller"
                        disabled={busy}
                        value={selection.controllerId}
                        onChange={(event) =>
                          action({
                            type: "patch-object",
                            objectId: selection.id,
                            patch: { controllerId: event.target.value },
                          })
                        }
                      >
                        {match.players.map((entry) => (
                          <option key={entry.id} value={entry.id}>
                            {entry.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
                <div className="center-zones">
                  {zoneIndicator(stack)}
                  {match.zones
                    .filter(
                      (zone) =>
                        zone.kind === "exile" || zone.kind === "command",
                    )
                    .map(zoneIndicator)}
                </div>
              </div>
            </div>
            <div className="hand-dock">
              {player && ownHand && ownLibrary ? (
                <>
                  <div className="hand-heading">
                    <strong>{player.name}'s Hand</strong>
                    <span>
                      {ownHand.count} cards · Mulligans {player.mulliganCount}
                    </span>
                  </div>
                  <div className="hand-actions">
                    <button
                      disabled={
                        busy || ownHand.count > 0 || ownLibrary.count < 7
                      }
                      onClick={() => action({ type: "opening-draw" })}
                    >
                      Draw opening seven
                    </button>
                    <button
                      disabled={
                        busy ||
                        ownHand.count === 0 ||
                        ownHand.count + ownLibrary.count < 7
                      }
                      onClick={() =>
                        action({ type: "mulligan", playerId: player.id })
                      }
                    >
                      Mulligan
                    </button>
                    <button
                      disabled={busy || ownLibrary.count === 0}
                      onClick={() => action({ type: "draw", count: 1 })}
                    >
                      Draw one
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        action({ type: "shuffle", zoneId: ownLibrary.id })
                      }
                    >
                      Shuffle Library
                    </button>
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        action({
                          type: "mulligan-count",
                          playerId: player.id,
                          value: Number(mulliganInput),
                        });
                      }}
                    >
                      <label>
                        Mulligan Count{" "}
                        <input
                          type="number"
                          min={0}
                          max={1000}
                          required
                          value={mulliganInput}
                          onChange={(event) =>
                            setMulliganInput(event.target.value)
                          }
                        />
                      </label>
                      <button disabled={busy}>Save count</button>
                    </form>
                  </div>
                  <section
                    className="hand-cards"
                    data-zone-id={ownHand.id}
                    data-testid={`zone-hand-${player.name}`}
                  >
                    <span className="sr-only">
                      {ownHand.count} {ownHand.count === 1 ? "card" : "cards"}
                    </span>
                    {zoneContents(ownHand)}
                  </section>
                </>
              ) : (
                <span>Observe the shared table</span>
              )}
            </div>
          </div>
          <aside className="inspector">
            <h2>Card details</h2>
            {selection ? (
              <>
                <CardInspector
                  key={selection.id}
                  object={selection}
                  match={match}
                  act={action}
                  busy={busy}
                  playerId={player?.id}
                />
              </>
            ) : (
              <p>Select a card for actions and details.</p>
            )}
            <hr />
            <CounterMarker match={match} act={action} busy={busy} />
            <ObjectCreator
              match={match}
              act={action}
              busy={busy}
              playerId={player?.id}
            />
            <SetupControls
              match={match}
              act={action}
              busy={busy}
              playerId={player?.id}
            />
          </aside>
        </div>
        {drawer && (
          <div className="zone-drawer" data-zone-id={drawer.id}>
            <div className="drawer-heading">
              <h2>{drawer.name}</h2>
              <button
                onClick={() => setDrawerId(undefined)}
                aria-label="Close Zone drawer"
              >
                ×
              </button>
            </div>
            <p>
              {drawer.count} {drawer.count === 1 ? "card" : "cards"}
            </p>
            {drawer.kind === "library" && drawer.ownerId === player?.id && (
              <button onClick={() => setInspectLibrary((current) => !current)}>
                {inspectLibrary ? "Hide Library" : "Inspect Library"}
              </button>
            )}
            <div className="drawer-cards card-list">
              {drawer.kind !== "library" || inspectLibrary
                ? zoneContents(drawer)
                : null}
            </div>
          </div>
        )}
        {alt &&
          hovered &&
          match.objects[hovered] &&
          !match.objects[hovered].hidden && (
            <div
              className="card-preview"
              role="img"
              aria-label={`Full card preview: ${match.objects[hovered].characteristics.name}`}
            >
              {match.objects[hovered].artwork?.[
                match.objects[hovered].currentFace ?? 0
              ] &&
              !failedArt.includes(
                `${hovered}:${match.objects[hovered].currentFace ?? 0}`,
              ) ? (
                <img
                  src={
                    match.objects[hovered].artwork![
                      match.objects[hovered].currentFace ?? 0
                    ]
                  }
                  alt={match.objects[hovered].characteristics.name}
                />
              ) : (
                <div className="card-fallback">
                  <strong>{match.objects[hovered].characteristics.name}</strong>
                  <p>{match.objects[hovered].characteristics.rulesText}</p>
                </div>
              )}
            </div>
          )}
        {dragLabel && (
          <div
            className="drag-preview"
            style={{ left: dragLabel.x + 12, top: dragLabel.y + 12 }}
          >
            {dragLabel.name}
          </div>
        )}
      </fieldset>
    </main>
  );
}
