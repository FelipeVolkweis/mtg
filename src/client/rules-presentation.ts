import type { MatchView, ObjectView, ZoneView } from "../shared/model";
import type { MatchPlayer } from "../shared/rules-state";

export const battlefieldTypes = [
  "Creature",
  "Planeswalker",
  "Battle",
  "Land",
  "Artifact",
  "Enchantment",
  "Other",
] as const;
export type BattlefieldType = (typeof battlefieldTypes)[number];
export function battlefieldType(object: ObjectView): BattlefieldType {
  return (
    battlefieldTypes.find((type) =>
      object.characteristics.types?.includes(type),
    ) ?? "Other"
  );
}
export function zoneObjects(
  match: MatchView,
  zone: ZoneView | undefined,
): ObjectView[] {
  if (!zone) return [];
  return (
    zone.objectIds ??
    Object.values(match.objects)
      .filter((o) => o.zoneId === zone.id)
      .map((o) => o.id)
  )
    .map((id) => match.objects[id])
    .filter((o): o is ObjectView => !!o);
}
/** A player's own Zone of `kind`, or the shared one. */
export function playerZone(
  match: MatchView,
  player: MatchPlayer,
  kind: ZoneView["kind"],
) {
  return match.zones.find(
    (z) => z.kind === kind && (z.ownerId === player.id || !z.ownerId),
  );
}
/** The cards in a Zone that belong to `playerId` (all of them in an owned Zone). */
export function playerZoneCards(
  match: MatchView,
  zone: ZoneView | undefined,
  playerId: string,
) {
  const objects = zoneObjects(match, zone);
  return zone?.ownerId
    ? objects
    : objects.filter((o) => objectOwner(match, o) === playerId);
}
export function objectOwner(match: MatchView, object: ObjectView): string {
  return object.ownerId;
}
export function objectActions(match: MatchView, id: string) {
  return (match.actions ?? []).filter(
    ({ action }) => "objectId" in action && action.objectId === id,
  );
}
export function dragAction(match: MatchView, id: string) {
  return objectActions(match, id).find(
    ({ action }) => action.type === "cast-spell" || action.type === "play-land",
  )?.action;
}
// Canonicalize public state, so property/Counter ordering cannot split identical copies.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  return value;
}
export function cardPiles(
  match: MatchView,
  objects: ObjectView[],
): ObjectView[][] {
  const piles = new Map<string, ObjectView[]>();
  for (const object of objects) {
    const attachments = Object.values(match.objects).filter(
      (o) => o.attachmentTo === object.id,
    );
    const combat = match.rules.combat?.attackers;
    const key =
      object.attachmentTo || attachments.length
        ? object.id
        : JSON.stringify(
            canonical({
              kind: object.kind,
              characteristics: object.characteristics,
              status: object.status,
              counters: [...object.counters].sort((a, b) =>
                a.kind.localeCompare(b.kind),
              ),
              variables: object.proposal?.variables,
              face: object.currentFace,
              links: object.links,
              damage: match.rules.markedDamage?.[object.id] ?? 0,
              attacker: combat?.find((a) => a.objectId === object.id),
              blocks: combat
                ?.filter((a) => a.blockerIds.includes(object.id))
                .map((a) => a.objectId),
              actions: objectActions(match, object.id).map((a) => a.label),
            }),
          );
    const pile = piles.get(key) ?? [];
    pile.push(object);
    piles.set(key, pile);
  }
  return [...piles.values()];
}
export function cardArtwork(object: ObjectView): string | undefined {
  return object.artwork?.[object.currentFace ?? 0] ?? object.artwork?.[0];
}
