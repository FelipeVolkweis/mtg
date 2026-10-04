import { useRef, useState, type PointerEvent } from "react";
import type {
  MatchAction,
  ObjectView,
  RoomView,
  ZoneView,
} from "../shared/model";
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
    (player) => player.participantId === view.participantId,
  );
  const action: Act = (action) =>
    send({
      type: "match-action",
      matchId: match.id,
      revision: match.revision,
      action,
    });
  const [inspect, setInspect] = useState(false);
  const [selected, setSelected] = useState<string>();
  const [preview, setPreview] = useState<{
    id: string;
    x: number;
    y: number;
  }>();
  const drag = useRef<{
    id: string;
    x: number;
    y: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const battlefield = match.zones.find((zone) => zone.kind === "battlefield")!;
  function pointerDown(
    event: PointerEvent<HTMLButtonElement>,
    object: ObjectView,
  ) {
    setSelected(object.id);
    if (busy || event.button !== 0) return;
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
    if (!drag.current) return;
    if (
      Math.hypot(
        event.clientX - drag.current.x,
        event.clientY - drag.current.y,
      ) > 4
    )
      setPreview({ id: drag.current.id, x: event.clientX, y: event.clientY });
  }
  function pointerUp(event: PointerEvent<HTMLButtonElement>) {
    const origin = drag.current;
    drag.current = null;
    setPreview(undefined);
    if (
      !origin ||
      Math.hypot(event.clientX - origin.x, event.clientY - origin.y) < 4
    )
      return;
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-zone-id]");
    if (!target?.dataset.zoneId) return;
    const rect = target.getBoundingClientRect();
    const position = {
      x: Math.max(
        0,
        Math.min(rect.width - 110, event.clientX - rect.left - origin.offsetX),
      ),
      y: Math.max(
        0,
        Math.min(rect.height - 150, event.clientY - rect.top - origin.offsetY),
      ),
    };
    const object = match.objects[origin.id];
    if (!object) return;
    if (
      object.zoneId === target.dataset.zoneId &&
      target.dataset.zoneId === battlefield.id
    )
      action({ type: "position", objectId: object.id, position });
    else
      action({
        type: "move",
        objectId: object.id,
        zoneId: target.dataset.zoneId,
        ...(target.dataset.zoneId === battlefield.id ? { position } : {}),
      });
  }
  function card(object: ObjectView, spatial = false) {
    const position = match.layout.positions[object.id] ?? { x: 20, y: 80 };
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
          setPreview(undefined);
        }}
        onClick={() => setSelected(object.id)}
      >
        {object.artwork?.[object.currentFace ?? 0] && !object.hidden ? (
          <img
            draggable={false}
            src={object.artwork[object.currentFace ?? 0]}
            alt=""
          />
        ) : (
          <>
            <strong>{object.characteristics.name}</strong>
            <span>{object.characteristics.manaCost}</span>
            <small>{object.characteristics.typeLine}</small>
            <p>{object.characteristics.rulesText}</p>
          </>
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
    return zone.objectIds?.map((id) => card(match.objects[id]));
  }
  function ownZone(zone: ZoneView) {
    const name = match.players.find((p) => p.id === zone.ownerId)!.name;
    return (
      <section
        key={zone.id}
        data-zone-id={zone.id}
        data-testid={`zone-${zone.kind}-${name}`}
      >
        <h3>{zone.name}</h3>
        <span>
          {zone.count} {zone.count === 1 ? "card" : "cards"}
        </span>
        {zone.kind === "library" && zone.ownerId === player?.id && (
          <div className="button-row">
            <button
              disabled={busy}
              onClick={() => action({ type: "draw", count: 1 })}
            >
              Draw one
            </button>
            <button
              disabled={busy}
              onClick={() => action({ type: "shuffle", zoneId: zone.id })}
            >
              Shuffle Library
            </button>
            <button onClick={() => setInspect(!inspect)}>
              Inspect Library
            </button>
          </div>
        )}
        {zone.objectIds && (zone.kind !== "library" || inspect) && (
          <div className="card-list">{zoneContents(zone)}</div>
        )}
      </section>
    );
  }
  const isOwnPrivateZone = (zone: ZoneView) =>
    zone.ownerId === player?.id &&
    (zone.kind === "library" || zone.kind === "hand");
  const selection = selected ? match.objects[selected] : undefined;
  return (
    <main className="tabletop" data-testid="match">
      <div className="section-heading">
        <div>
          <h1>Manual Match</h1>
          <p>Play freely. Resolve card effects together.</p>
        </div>
        <span data-testid="match-revision">Revision {match.revision}</span>
      </div>
      <div data-testid="match-players" className="players">
        {match.players.map((p) => (
          <PlayerMarker
            key={p.id}
            player={p}
            match={match}
            act={action}
            busy={busy}
          />
        ))}
      </div>
      <TurnMarkers match={match} act={action} busy={busy} />
      <div className="board-grid">
        <div>
          <div className="private-zones">
            {match.zones.filter(isOwnPrivateZone).map(ownZone)}
          </div>
          <section
            data-testid="battlefield"
            data-zone-id={battlefield.id}
            className="battlefield"
          >
            <h2>Battlefield</h2>
            <p>Drag cards here. Release to share your move.</p>
            {battlefield.objectIds?.map((id) => card(match.objects[id], true))}
          </section>
          <div className="shared-zones">
            {match.zones
              .filter((zone) => !zone.ownerId && zone.kind !== "battlefield")
              .map((zone) => (
                <section
                  className="zone"
                  key={zone.id}
                  data-zone-id={zone.id}
                  data-testid={`zone-${zone.kind}`}
                >
                  <h3>
                    {zone.name} <small>{zone.count}</small>
                  </h3>
                  <div className="card-list">{zoneContents(zone)}</div>
                </section>
              ))}
          </div>
          <div className="zones">
            {match.zones
              .filter((zone) => zone.ownerId && !isOwnPrivateZone(zone))
              .map(ownZone)}
          </div>
        </div>
        <aside className="inspector">
          <h2>Card details</h2>
          {selection ? (
            <CardInspector
              key={selection.id}
              object={selection}
              match={match}
              act={action}
              busy={busy}
              playerId={player?.id}
            />
          ) : (
            <p>Select a card to move it or record its state.</p>
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
      {preview && (
        <div
          className="drag-preview"
          style={{ left: preview.x + 12, top: preview.y + 12 }}
        >
          {match.objects[preview.id]?.characteristics.name}
        </div>
      )}
    </main>
  );
}
