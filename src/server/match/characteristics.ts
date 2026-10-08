import type { Catalog } from "../../shared/model.js";
import type { Characteristics, Value } from "../../shared/card-dsl.js";
import type {
  ActiveContinuousEffect,
  GameObject,
  MatchState,
} from "../../shared/rules-state.js";
import { ownKeyword, staticContinuous } from "../rules/abilities.js";
import { netStatCounters } from "./counters.js";
import type { RulesQuery } from "../rules/context.js";
import { Evaluator } from "../rules/vm/evaluate.js";
import { RuleViolation } from "../rules/rule-violation.js";
import { zoneById, zoneOf } from "./zones.js";

/**
 * A read-only rules context over a Match without an engine. `effective` is
 * supplied: the characteristics calculator reads base characteristics while
 * it computes effective ones, as the layer system requires.
 */
export function queryOver(
  match: MatchState,
  catalog: Catalog,
  effective: (object: GameObject) => Characteristics,
): RulesQuery {
  const query: RulesQuery = {
    match,
    catalog,
    object(id) {
      const object = match.objects[id];
      if (!object)
        throw new RuleViolation("This Game Object has already moved.");
      return object;
    },
    zone(kind, playerId) {
      const zone = zoneOf(match, kind, playerId);
      if (!zone) throw new Error("Zone not found.");
      return zone;
    },
    owner: (object) => object.ownerId,
    effective,
    definition: (object) =>
      catalog.definitions[
        match.instances[object.cardInstanceIds[0]]?.definitionId
      ],
    matches: (object, predicate, playerId, sourceId) =>
      new Evaluator(query, { playerId, sourceId }).matches(object, predicate),
  };
  return query;
}

const base = (object: GameObject) => object.characteristics;

/**
 * The layer system (CR 613): an object's effective characteristics from its
 * base characteristics and the continuous effects in force.
 *
 * A `cached` calculator computes the effects in force and each object's
 * effective characteristics once, so it must only live while the Match
 * can't change: `RulesEngine.reading` makes one per read pass and drops it
 * when the pass ends or the Match changes.
 */
export class CharacteristicsCalculator {
  private activeEffects?: ActiveContinuousEffect[];
  private readonly results = new Map<string, Characteristics>();
  constructor(
    readonly match: MatchState,
    readonly catalog: Catalog,
    readonly cached = false,
  ) {}
  /** A Core value over base characteristics (inside the layer system). */
  value(
    value: Value,
    playerId: string,
    sourceId?: string,
    bindings: Record<string, number> = {},
  ): number {
    return new Evaluator(queryOver(this.match, this.catalog, base), {
      playerId,
      sourceId,
      bindings,
    }).value(value);
  }
  /**
   * Does a continuous effect affect an object whose characteristics so far
   * are `characteristics`?
   */
  applies(
    effect: ActiveContinuousEffect,
    object: GameObject,
    characteristics: Characteristics,
  ) {
    const selector = effect.objects;
    if (selector === "source")
      return (
        object.id === effect.sourceId &&
        zoneById(this.match, object.zoneId)?.kind === "battlefield"
      );
    const evaluator = new Evaluator(
      queryOver(this.match, this.catalog, (o) =>
        o.id === object.id ? characteristics : o.characteristics,
      ),
      { playerId: effect.playerId, sourceId: effect.sourceId },
    );
    return typeof selector === "object" && "all" in selector
      ? evaluator.matches(object, selector.all)
      : evaluator.objects(selector).includes(object.id);
  }
  /** The continuous effects in force. */
  active(): ActiveContinuousEffect[] {
    if (!this.cached) return this.inForce();
    this.activeEffects ??= this.inForce();
    return [...this.activeEffects];
  }
  private inForce(): ActiveContinuousEffect[] {
    return [
      ...(this.match.rules.temporaryEffects ?? []).filter(
        (effect) => !!this.match.objects[effect.sourceId],
      ),
      ...Object.values(this.match.objects).flatMap((source) => {
        const card =
          this.catalog.definitions[
            this.match.instances[source.cardInstanceIds[0]]?.definitionId
          ];
        return (card?.abilities ?? []).flatMap((ability) => {
          const effect = staticContinuous(ability);
          if (!effect) return [];
          if (
            !effect.characteristicDefining &&
            zoneById(this.match, source.zoneId)?.kind !== "battlefield"
          )
            return [];
          if (
            effect.condition &&
            !new Evaluator(queryOver(this.match, this.catalog, base), {
              playerId: source.controllerId,
              sourceId: source.id,
            }).condition(effect.condition)
          )
            return [];
          return [
            {
              sourceId: source.id,
              abilityId: ability.id,
              playerId: source.controllerId,
              objects: effect.objects,
              changes: effect.changes,
              applicability: effect.characteristicDefining
                ? ("characteristic-defining" as const)
                : ("source-on-battlefield" as const),
            },
          ];
        });
      }),
    ];
  }
  typeCharacteristics(
    object: GameObject,
    active = this.active(),
  ): Characteristics {
    const result = structuredClone(object.characteristics);
    for (const effect of active)
      if (this.applies(effect, object, result))
        for (const change of effect.changes)
          if (change.kind === "add-types") {
            result.types = [
              ...new Set([...(result.types ?? []), ...(change.types ?? [])]),
            ];
            result.subtypes = [
              ...new Set([
                ...(result.subtypes ?? []),
                ...(change.subtypes ?? []),
              ]),
            ];
          }
    return result;
  }
  effective(object: GameObject): Characteristics {
    if (!this.cached) return this.compute(object);
    let result = this.results.get(object.id);
    if (!result) {
      result = this.compute(object);
      this.results.set(object.id, result);
    }
    // Callers may change what they get; the kept result stays as computed.
    return structuredClone(result);
  }
  private compute(object: GameObject): Characteristics {
    const active = this.active();
    const result = this.typeCharacteristics(object, active);
    const definition =
      this.catalog.definitions[
        this.match.instances[object.cardInstanceIds[0]]?.definitionId
      ];
    for (const ability of definition?.abilities ?? []) {
      const keyword = ownKeyword(ability);
      if (keyword)
        result.keywords = [...new Set([...(result.keywords ?? []), keyword])];
    }
    const changes = active.flatMap((effect) => {
      const applies =
        effect.applicability === "characteristic-defining"
          ? effect.sourceId === object.id
          : this.applies(effect, object, result);
      return applies
        ? effect.changes.map((change) => ({ effect, change }))
        : [];
    });
    for (const { change } of changes)
      if (change.kind === "grant-keyword")
        result.keywords = [
          ...new Set([...(result.keywords ?? []), change.keyword]),
        ];
    // CR 613: characteristic-defining values precede additive modifications;
    // counters contribute in the modification sublayer, after base values.
    for (const { effect, change } of changes.filter(
      (c) => c.change.kind === "define-stats",
    )) {
      result.power = String(
        this.value(
          change.kind === "define-stats" ? change.power : 0,
          effect.playerId,
          effect.sourceId,
        ),
      );
      result.toughness = String(
        this.value(
          change.kind === "define-stats" ? change.toughness : 0,
          effect.playerId,
          effect.sourceId,
        ),
      );
    }
    for (const { effect, change } of changes) {
      if (change.kind !== "copy-linked") continue;
      const source = this.match.objects[effect.sourceId];
      const linked = source.links
        .filter((link) => link.label === change.link)
        .flatMap((link) => link.objectIds)
        .map((id) => this.match.objects[id])
        .filter(
          (card) =>
            card &&
            card.kind === "card" &&
            card.characteristics.types?.includes("Creature") &&
            zoneById(this.match, card.zoneId)?.kind === "exile",
        )
        .at(-1);
      if (!linked) continue;
      const characteristics = this.effective(linked);
      result.power = characteristics.power;
      result.toughness = characteristics.toughness;
      result.subtypes = [
        ...new Set([
          ...(characteristics.subtypes ?? []),
          ...change.retainSubtypes,
        ]),
      ];
      result.typeLine =
        [...(result.supertypes ?? []), ...(result.types ?? [])].join(" ") +
        " — " +
        result.subtypes.join(" ");
    }
    for (const { effect, change } of changes)
      if (change.kind === "set-base-stats") {
        result.power = String(
          this.value(change.power, effect.playerId, effect.sourceId),
        );
        result.toughness = String(
          this.value(change.toughness, effect.playerId, effect.sourceId),
        );
      }
    if (changes.some(({ change }) => change.kind === "add-types"))
      result.typeLine =
        [...(result.supertypes ?? []), ...(result.types ?? [])].join(" ") +
        (result.subtypes?.length ? " — " + result.subtypes.join(" ") : "");
    for (const stat of ["power", "toughness"] as const) {
      if (!/^-?\d+$/.test(result[stat] ?? "")) continue;
      let amount = BigInt(result[stat]!);
      for (const { effect, change } of changes.filter(
        (c) => c.change.kind === "add-stats",
      ))
        amount += BigInt(
          this.value(
            change.kind === "add-stats" ? change[stat] : 0,
            effect.playerId,
            effect.sourceId,
          ),
        );
      amount += netStatCounters(object.counters);
      result[stat] = amount.toString();
    }
    return result;
  }
}
