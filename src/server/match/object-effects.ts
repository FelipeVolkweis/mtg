import type { GameObject } from "../../shared/model.js";
import type { MovementEffect } from "../../shared/rules.js";
import type { RulesEngine } from "./rules-engine.js";

// Removal retains a common pre-change snapshot for every member of a simultaneous set.
export class ObjectEffects {
  constructor(readonly engine: RulesEngine) {}
  sourceId() {
    const resolving = this.engine.object(this.engine.rules.resolving!.sourceId);
    return resolving.sourceObjectId ?? resolving.id;
  }
  candidates(effect: MovementEffect) {
    const progress = this.engine.rules.resolving!;
    const stackSource = this.engine.object(progress.sourceId);
    const ids =
      effect.subject === "source"
        ? [this.sourceId()]
        : effect.subject === "target"
          ? stackSource.resolution!.targetIds
          : Object.keys(this.engine.match.objects);
    return ids.filter((id) => {
      const object = this.engine.match.objects[id];
      return (
        object &&
        (!effect.filter ||
          this.engine.matches(
            object,
            effect.filter,
            progress.playerId,
            this.sourceId(),
          ))
      );
    });
  }
  move(effect: MovementEffect, ids = this.candidates(effect)) {
    const engine = this.engine;
    const source = engine.match.objects[this.sourceId()];
    const sources = structuredClone(engine.battlefieldSources());
    const snapshots = new Map(
      ids.map((id) => [id, engine.effective(engine.object(id))]),
    );
    let moved = 0;
    for (const id of new Set(ids)) {
      const object = engine.match.objects[id];
      if (!object) continue;
      const zone = engine.match.zones.find((z) => z.id === object.zoneId)!;
      if (
        (effect.kind === "destroy" || effect.kind === "sacrifice") &&
        zone.kind !== "battlefield"
      )
        continue;
      if (
        effect.kind === "destroy" &&
        snapshots
          .get(id)
          ?.keywords?.some((k) => k.toLowerCase() === "indestructible")
      )
        continue;
      const destination =
        effect.kind === "exile"
          ? "exile"
          : effect.kind === "move"
            ? effect.destination!
            : "graveyard";
      if (!destination) throw new Error("Movement requires a destination.");
      const fresh =
        destination === "battlefield"
          ? engine.enter(object)
          : engine.move(
              id,
              engine.zone(
                destination,
                destination === "exile" ? undefined : engine.owner(object),
              ),
              sources,
              snapshots.get(id),
            );
      if (destination !== "battlefield")
        fresh.controllerId = engine.owner(fresh);
      moved++;
      if (effect.link && source && object.kind === "card") {
        source.links.push({ label: effect.link, objectIds: [fresh.id] });
      }
    }
    if (effect.bind) engine.rules.resolving!.bindings[effect.bind] = moved;
  }
  attach(toId: string) {
    const source = this.engine.match.objects[this.sourceId()];
    const target = this.engine.match.objects[toId];
    if (!source || !target) return;
    const battlefield = this.engine.zone("battlefield").id;
    if (
      source.zoneId !== battlefield ||
      target.zoneId !== battlefield ||
      source.id === target.id ||
      !target.characteristics.types?.includes("Creature") ||
      !source.characteristics.subtypes?.includes("Equipment") ||
      source.characteristics.types?.includes("Creature")
    )
      return;
    source.attachmentTo = target.id;
  }
}
