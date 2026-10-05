import type {
  Catalog,
  Characteristics,
  GameObject,
  MatchState,
} from "../../shared/model.js";
import type {
  ActiveContinuousEffect,
  ObjectFilter,
  RulesValue,
} from "../../shared/rules.js";

export function matchesFilter(
  match: MatchState,
  object: GameObject,
  filter: ObjectFilter,
  playerId: string,
  sourceId?: string,
) {
  const zone = match.zones.find((z) => z.id === object.zoneId)!;
  const types = object.characteristics.types ?? [];
  return (
    zone.kind === filter.zone &&
    !object.status.phasedOut &&
    (zone.visibility !== "private" || zone.ownerId === playerId) &&
    (!filter.controller ||
      (filter.controller === "you"
        ? object.controllerId === playerId
        : object.controllerId !== playerId)) &&
    (!filter.owner ||
      (filter.owner === "you"
        ? (match.instances[object.cardInstanceIds[0]]?.ownerId ??
            object.ownerId ??
            object.controllerId) === playerId
        : (match.instances[object.cardInstanceIds[0]]?.ownerId ??
            object.ownerId ??
            object.controllerId) !== playerId)) &&
    (!filter.nontoken || object.kind !== "token") &&
    (!filter.colored || !!object.characteristics.colors.length) &&
    (!filter.colorless || !object.characteristics.colors.length) &&
    (!filter.attached ||
      match.objects[sourceId ?? ""]?.attachmentTo === object.id) &&
    (!filter.self ||
      (filter.self === "only"
        ? object.id === sourceId
        : object.id !== sourceId)) &&
    (!filter.kind ||
      (filter.kind === "spell"
        ? object.kind === "card" && zone.kind === "stack"
        : filter.kind === "permanent"
          ? zone.kind === "battlefield"
          : object.kind === "card")) &&
    (!filter.types || filter.types.some((t) => types.includes(t))) &&
    (!filter.allTypes || filter.allTypes.every((t) => types.includes(t))) &&
    (!filter.subtypes ||
      filter.subtypes.some((t) =>
        object.characteristics.subtypes?.includes(t),
      )) &&
    (!filter.excludeTypes ||
      filter.excludeTypes.every((t) => !types.includes(t))) &&
    (!filter.untapped || !object.status.tapped) &&
    (!filter.attacking ||
      !!match.rules?.combat?.attackers.some((a) => a.objectId === object.id))
  );
}

export class CharacteristicsCalculator {
  constructor(
    readonly match: MatchState,
    readonly catalog: Catalog,
  ) {}
  value(
    value: RulesValue,
    playerId: string,
    sourceId?: string,
    bindings: Record<string, number> = {},
  ): number {
    if (typeof value === "number") return value;
    if ("count" in value)
      return Object.values(this.match.objects).filter((o) =>
        matchesFilter(this.match, o, value.count, playerId, sourceId),
      ).length;
    if ("sum" in value)
      return value.sum.reduce<number>(
        (sum, part) => sum + this.value(part, playerId, sourceId, bindings),
        0,
      );
    if ("handSize" in value)
      return this.match.zones.find(
        (z) => z.kind === "hand" && z.ownerId === playerId,
      )!.objectIds.length;
    if ("greatestManaValue" in value)
      return Math.max(
        0,
        ...Object.values(this.match.objects)
          .filter((o) =>
            matchesFilter(
              this.match,
              o,
              value.greatestManaValue,
              playerId,
              sourceId,
            ),
          )
          .map((o) => o.characteristics.manaValue ?? 0),
      );
    const result = bindings[value.binding];
    if (!Number.isSafeInteger(result) || result < 0)
      throw new Error("Invalid quantity binding.");
    return result;
  }
  active(): ActiveContinuousEffect[] {
    return [
      ...(this.match.rules?.temporaryEffects ?? []).filter(
        (effect) => !!this.match.objects[effect.sourceId],
      ),
      ...Object.values(this.match.objects).flatMap((source) => {
        const card =
          this.catalog.definitions[
            this.match.instances[source.cardInstanceIds[0]]?.definitionId
          ];
        return (card?.abilities ?? []).flatMap((ability) => {
          const effect = ability.rules?.continuous;
          if (!effect || ability.kind !== "static" || source.status.phasedOut)
            return [];
          if (
            !effect.characteristicDefining &&
            this.match.zones.find((z) => z.id === source.zoneId)?.kind !==
              "battlefield"
          )
            return [];
          if (
            effect.condition &&
            this.value(effect.condition.value, source.controllerId, source.id) <
              effect.condition.atLeast
          )
            return [];
          return [
            {
              sourceId: source.id,
              abilityId: ability.id,
              playerId: source.controllerId,
              filter: effect.filter,
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
  typeCharacteristics(object: GameObject): Characteristics {
    const result = structuredClone(object.characteristics);
    for (const effect of this.active())
      if (
        matchesFilter(
          this.match,
          { ...object, characteristics: result },
          effect.filter,
          effect.playerId,
          effect.sourceId,
        )
      )
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
    const result = this.typeCharacteristics(object);
    const definition =
      this.catalog.definitions[
        this.match.instances[object.cardInstanceIds[0]]?.definitionId
      ];
    for (const ability of definition?.abilities ?? [])
      if (ability.rules?.keyword)
        result.keywords = [
          ...new Set([...(result.keywords ?? []), ability.rules.keyword]),
        ];
    const changes = this.active().flatMap((effect) => {
      const applies =
        effect.applicability === "characteristic-defining"
          ? effect.sourceId === object.id
          : matchesFilter(
              this.match,
              { ...object, characteristics: result },
              effect.filter,
              effect.playerId,
              effect.sourceId,
            );
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
      if (change.kind !== "linked-characteristics") continue;
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
            this.match.zones.find((z) => z.id === card.zoneId)?.kind ===
              "exile",
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
      if (change.kind === "set-stats") {
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
      for (const counter of object.counters) {
        if (counter.kind === "+1/+1") amount += BigInt(counter.quantity);
        if (counter.kind === "-1/-1") amount -= BigInt(counter.quantity);
      }
      result[stat] = amount.toString();
    }
    return result;
  }
}
