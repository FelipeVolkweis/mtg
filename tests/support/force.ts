import { randomUUID } from "node:crypto";
import { gameObject } from "../../src/server/match/game-objects";
import type {
  CardDefinition,
  Counter,
  GameObject,
  MatchState,
  ZoneKind,
} from "../../src/shared/model";
import type { ManaPool, RulesState } from "../../src/shared/rules";

// Force helpers set up states that would be tedious or impossible to reach
// through Match commands (rules test plan §16). The name says it: they bypass
// the rules on purpose. Use them only for scenario setup, never to act.

/** Turn steps in order; the index is the current `turn.stepIndex`. */
export const turnSteps = [
  "untap",
  "upkeep",
  "draw",
  "precombat-main",
  "begin-combat",
  "declare-attackers",
  "declare-blockers",
  "combat-damage",
  "end-combat",
  "postcombat-main",
  "end",
  "cleanup",
] as const;
export type TurnStep = (typeof turnSteps)[number];

function rules(match: MatchState): RulesState {
  if (!match.rules) throw new Error("force helpers need a rules Match.");
  return match.rules;
}

export const force = {
  /** Merges amounts into a player's mana pool. */
  mana(match: MatchState, playerId: string, pool: Partial<ManaPool>) {
    const mana = rules(match).mana;
    mana[playerId] = {
      ...{ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
      ...mana[playerId],
      ...pool,
    };
  },

  /** Jumps to a turn step without performing turn-based actions. */
  step(match: MatchState, step: TurnStep) {
    match.turn.stepIndex = turnSteps.indexOf(step);
  },

  /** Makes a seat the active player without changing Priority. */
  activePlayer(match: MatchState, playerId: string) {
    match.turn.activePlayerId = playerId;
  },

  /** Replaces an object's counters. */
  counters(object: GameObject, counters: Counter[]) {
    object.counters = counters;
  },

  /** Attaches an object to a host, or detaches it with `null`. */
  attach(object: GameObject, host: GameObject | null) {
    object.attachmentTo = host?.id ?? null;
  },

  /** Changes an object's controller. */
  controller(object: GameObject, playerId: string) {
    object.controllerId = playerId;
  },

  /**
   * Moves an object to a Zone, keeping its identity (a real zone change
   * creates a new Game Object). `ownerId` picks the owner's Zone for
   * player-owned Zones.
   */
  move(
    match: MatchState,
    object: GameObject,
    kind: ZoneKind,
    ownerId?: string,
  ) {
    const from = match.zones.find((zone) => zone.id === object.zoneId)!;
    const to = match.zones.find(
      (zone) => zone.kind === kind && (!ownerId || zone.ownerId === ownerId),
    );
    if (!to) throw new Error(`No ${kind} Zone for ${ownerId ?? "the Match"}.`);
    from.objectIds.splice(from.objectIds.indexOf(object.id), 1);
    to.objectIds.push(object.id);
    object.zoneId = to.id;
  },

  /** Replaces a Zone's contents, in order (first is the top of a Library). */
  zoneContents(
    match: MatchState,
    kind: ZoneKind,
    ownerId: string | undefined,
    objects: GameObject[],
  ) {
    const zone = match.zones.find(
      (zone) => zone.kind === kind && (!ownerId || zone.ownerId === ownerId),
    );
    if (!zone)
      throw new Error(`No ${kind} Zone for ${ownerId ?? "the Match"}.`);
    for (const object of objects) {
      const from = match.zones.find((z) => z.id === object.zoneId);
      if (from && from !== zone)
        from.objectIds.splice(from.objectIds.indexOf(object.id), 1);
      object.zoneId = zone.id;
    }
    zone.objectIds = objects.map((object) => object.id);
  },

  /** Deletes a Zone's objects, keeping the first `keep` (top of a Library). */
  clearZone(
    match: MatchState,
    kind: ZoneKind,
    ownerId: string | undefined,
    keep = 0,
  ) {
    const zone = match.zones.find(
      (zone) => zone.kind === kind && (!ownerId || zone.ownerId === ownerId),
    );
    if (!zone)
      throw new Error(`No ${kind} Zone for ${ownerId ?? "the Match"}.`);
    for (const id of zone.objectIds.slice(keep)) delete match.objects[id];
    zone.objectIds = zone.objectIds.slice(0, keep);
  },

  /** Puts a new object, such as an Ability Game Object, into its Zone. */
  addObject(match: MatchState, object: GameObject) {
    const zone = match.zones.find((z) => z.id === object.zoneId);
    if (!zone) throw new Error("The object's Zone does not exist.");
    match.objects[object.id] = object;
    zone.objectIds.push(object.id);
  },

  /**
   * Creates a Card Instance and its Game Object in a Zone, controlled and
   * owned by `playerId`, as if it had been there since the first turn.
   */
  card(
    match: MatchState,
    definition: CardDefinition,
    kind: ZoneKind,
    playerId: string,
  ): GameObject {
    const zone = match.zones.find(
      (zone) =>
        zone.kind === kind &&
        (kind === "battlefield" ||
          kind === "stack" ||
          zone.ownerId === playerId),
    );
    if (!zone) throw new Error(`No ${kind} Zone for ${playerId}.`);
    const instanceId = randomUUID();
    match.instances[instanceId] = {
      id: instanceId,
      ownerId: playerId,
      definitionId: definition.id,
      printingId: definition.defaultPrintingId,
    };
    const object = gameObject(
      "card",
      zone.id,
      playerId,
      playerId,
      definition.components[0],
    );
    object.cardInstanceIds = [instanceId];
    match.objects[object.id] = object;
    zone.objectIds.push(object.id);
    rules(match).controlledSinceTurn[object.id] = 0;
    return object;
  },

  /** Sets the turn since which a permanent has been continuously controlled. */
  controlledSince(match: MatchState, object: { id: string }, turn: number) {
    rules(match).controlledSinceTurn[object.id] = turn;
  },

  /** Marks a Card Instance as a commander. */
  commander(match: MatchState, instanceId: string) {
    match.instances[instanceId].commander = true;
  },

  /** Gives a player Priority with no passes recorded. */
  priority(match: MatchState, playerId: string) {
    match.priority = { playerId, passedPlayerIds: [] };
  },

  /** Sets rules-state fields directly, for one-off scenario setup. */
  rules(match: MatchState, patch: Partial<RulesState>) {
    Object.assign(rules(match), patch);
  },
};
