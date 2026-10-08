import type {
  DamageAssignment,
  GameObject,
  LastKnownInformation,
  ZoneState,
} from "../../../shared/rules-state.js";
import { moveObject } from "../../match/game-objects.js";
import { removeCountersDownToZero } from "../../match/counters.js";
import { changeLife } from "../../match/life.js";
import { entersTapped } from "../abilities.js";
import { CommanderRules } from "../../match/commander-rules.js";
import { EventTriggerObserver } from "../triggers/trigger-runtime.js";
import type { RulesEngine } from "../../match/rules-engine.js";
import type {
  EventResult,
  ProposedEvent,
  SimultaneousSnapshot,
} from "../context.js";

// Semantic Event Runtime (rules-engine-refactor.md §40-41). Every zone
// change, draw, damage event and life change is proposed here, applied, and
// reported to trigger observation. Replacement and prevention will run
// between proposal and application; today only the commander's Hand and
// Library replacement does.

export class EventRuntime {
  constructor(readonly engine: RulesEngine) {}

  propose(event: ProposedEvent): EventResult {
    switch (event.kind) {
      case "zone-change":
        return this.zoneChange(
          event.objectId,
          event.to,
          event.position,
          event.cause,
          event.simultaneous,
        );
      case "draw":
        return this.draw(event.playerId);
      case "damage":
        this.damage(event.assignments, event.combat);
        return {};
      case "life-change":
        this.lifeChange(event.playerId, event.amount);
        return {};
      case "create":
        return { object: this.create(event.object, event.zone) };
      case "cease":
        this.cease(event.objectId);
        return {};
    }
  }

  /** The object as it last existed, for bindings and look-back triggers (§56). */
  lastKnown(object: GameObject): LastKnownInformation {
    return {
      objectId: object.id,
      zoneId: object.zoneId,
      controllerId: object.controllerId,
      ownerId: object.ownerId,
      characteristics: this.engine.effective(object),
      counters: structuredClone(object.counters),
      attachmentTo: object.attachmentTo,
      tapped: object.status.tapped,
    };
  }

  private zoneChange(
    id: string,
    to: ZoneState,
    position: "top" | "bottom" | undefined,
    cause: "cast" | "setup" | undefined,
    simultaneous: SimultaneousSnapshot | undefined,
  ): EventResult {
    const engine = this.engine;
    const object = engine.object(id);
    const from = engine.match.zones.find((z) => z.id === object.zoneId)!;
    // Moving within a Zone reorders it; it isn't a zone change (CR 400.7).
    const index = position === "top" ? 0 : undefined;
    if (from.id === to.id) {
      moveObject(engine.match, id, to, index);
      return { object };
    }
    const lastKnown = this.lastKnown(object);
    if (cause) {
      const fresh = moveObject(engine.match, id, to, index);
      if (cause === "cast")
        engine.rules.revealedHandIds = engine.rules.revealedHandIds?.filter(
          (revealed) => revealed !== id,
        );
      return { object: fresh, lastKnown };
    }
    if (to.kind === "battlefield") {
      const fresh = moveObject(engine.match, id, to, index);
      fresh.status.tapped = entersTapped(
        engine.definition(fresh)?.abilities ?? [],
      );
      engine.emit("enter", fresh);
      return { object: fresh, lastKnown };
    }
    const sources = simultaneous?.sources ?? engine.battlefieldSources();
    const before = simultaneous?.before ?? lastKnown.characteristics;
    const destination = new CommanderRules(engine).replacement(object, to);
    const fresh = moveObject(engine.match, id, destination, index);
    new CommanderRules(engine).moved(fresh, destination);
    engine.rules.revealedHandIds = engine.rules.revealedHandIds?.filter(
      (revealed) => revealed !== id,
    );
    new EventTriggerObserver(engine).collect(
      {
        kind: "zone-change",
        sourceId: id,
        affectedId: fresh.id,
        controllerId: object.controllerId,
        ownerId: object.ownerId,
        from: from.kind,
        to: destination.kind,
        before,
        after: engine.effective(fresh),
        lastKnown,
      },
      object,
      sources,
    );
    return { object: fresh, lastKnown };
  }

  private draw(playerId: string): EventResult {
    const engine = this.engine;
    const library = engine.zone("library", playerId),
      hand = engine.zone("hand", playerId);
    if (!library.objectIds.length) {
      engine.rules.failedDrawPlayerIds ??= [];
      if (!engine.rules.failedDrawPlayerIds.includes(playerId))
        engine.rules.failedDrawPlayerIds.push(playerId);
      return {};
    }
    const card = moveObject(engine.match, library.objectIds[0], hand);
    const draws = engine.rules.thisTurn.draws;
    const ordinal = (draws[playerId] = (draws[playerId] ?? 0) + 1);
    new EventTriggerObserver(engine).collect(
      {
        kind: "draw",
        playerId,
        ordinal,
        sourceId: card.id,
        affectedId: card.id,
        controllerId: playerId,
        ownerId: playerId,
        after: card.characteristics,
      },
      card,
      engine.battlefieldSources(),
    );
    return { object: card };
  }

  private lifeChange(playerId: string, amount: number) {
    const player = this.engine.match.players.find((p) => p.id === playerId);
    if (!player) return;
    changeLife(player, amount);
  }

  private create(object: GameObject, zone: ZoneState) {
    const engine = this.engine;
    engine.match.objects[object.id] = object;
    zone.objectIds.push(object.id);
    if (zone.kind === "battlefield") {
      engine.rules.controlledSinceTurn[object.id] = engine.match.turn.number;
      engine.emit("enter", object);
    }
    return object;
  }

  private cease(id: string) {
    const match = this.engine.match;
    const object = match.objects[id];
    if (!object) return;
    const zone = match.zones.find((z) => z.id === object.zoneId)!;
    zone.objectIds.splice(zone.objectIds.indexOf(id), 1);
    delete match.objects[id];
  }

  private damage(assignments: DamageAssignment[], combat: boolean) {
    const engine = this.engine;
    // Capture all sources before the checkpoint so lethal damage is simultaneous.
    const sources = structuredClone(engine.battlefieldSources());
    const groups = new Set<string>();
    for (const assignment of assignments) {
      if (!Number.isSafeInteger(assignment.amount) || assignment.amount < 0)
        throw new Error("Invalid damage amount.");
      if (!assignment.amount) continue;
      const stackSource = engine.match.objects[assignment.sourceId];
      if (!stackSource) continue;
      const sourceId =
        stackSource.kind === "ability"
          ? (stackSource.sourceObjectId ?? stackSource.id)
          : stackSource.id;
      const live = engine.match.objects[sourceId];
      const characteristics = live
        ? engine.effective(live)
        : (stackSource.resolution?.sourceSnapshot?.characteristics ??
          stackSource.resolution?.event?.after ??
          stackSource.characteristics);
      const source = live ?? {
        ...stackSource,
        id: sourceId,
        zoneId: engine.zone("battlefield").id,
        characteristics,
      };
      const recorded = { ...assignment, sourceId };
      const player = engine.match.players.find(
        (p) => p.id === assignment.recipientId,
      );
      const recipient = engine.match.objects[assignment.recipientId];
      if (player && combat) {
        const instance = new CommanderRules(engine).instance(source);
        if (instance) {
          engine.rules.commanderDamage ??= {};
          engine.rules.commanderDamage[player.id] ??= {};
          engine.rules.commanderDamage[player.id][instance] =
            (engine.rules.commanderDamage[player.id][instance] ?? 0) +
            assignment.amount;
        }
        if (engine.rules.monarchId === player.id)
          engine.monarchTrigger(
            player.id,
            [
              {
                kind: "become-monarch",
                player: { controllerOf: { event: "object" } },
              },
            ],
            "monarch-transfer",
            source,
          );
      }
      if (player) this.lifeChange(player.id, -assignment.amount);
      else if (recipient?.zoneId === engine.zone("battlefield").id) {
        const types = engine.effective(recipient).types ?? [];
        if (types.includes("Creature")) {
          engine.rules.markedDamage ??= {};
          engine.rules.markedDamage[recipient.id] =
            (engine.rules.markedDamage[recipient.id] ?? 0) + assignment.amount;
        } else if (types.includes("Planeswalker") || types.includes("Battle")) {
          removeCountersDownToZero(
            recipient.counters,
            types.includes("Planeswalker") ? "loyalty" : "defense",
            assignment.amount,
          );
        } else continue;
      } else continue;
      engine.rules.thisTurn.damageEvents.push({
        ...recorded,
        sourceCharacteristics: structuredClone(characteristics),
        combat,
        controllerId: source.controllerId,
        recipientKind: player ? "player" : "object",
        turn: engine.match.turn.number,
      });
      new EventTriggerObserver(engine).collect(
        {
          kind: "damage",
          sourceId: source.id,
          affectedId: source.id,
          controllerId: source.controllerId,
          ownerId: live
            ? engine.owner(source)
            : (stackSource.resolution?.sourceSnapshot ?? source).ownerId,
          after: characteristics,
          damage: {
            ...recorded,
            combat,
            recipientKind: player ? "player" : "object",
          },
        },
        source,
        sources,
        groups,
      );
    }
  }
}
