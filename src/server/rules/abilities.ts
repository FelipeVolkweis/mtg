import {
  runtimeKeywords,
  type AppliedChange,
  type RuntimeKeyword,
} from "../../shared/rules.js";
import {
  turnSteps,
  type Ability,
  type Condition,
  type ContinuousChange,
  type Cost,
  type Effect,
  type ManaProduction,
  type PlayerRef,
  type Predicate,
  type PredicateFields,
  type Selector,
  type StaticGrant,
  type TargetClause,
  type Trigger,
  type Value,
} from "../../shared/rules-v2.js";

// Readers over Core abilities (dsl-redesign.md §4): what the engine asks of
// an ability, answered from the compiler's output. The runtime supports the
// subset `support.ts` accepts, so these read only that subset.

export const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

const sourceIs: Predicate = { is: "source" };

/** The ability's one target clause (the runtime supports one). */
export function targetClause(ability?: Ability): TargetClause | undefined {
  return ability && "targets" in ability ? ability.targets?.[0] : undefined;
}

export const targetFilter = (ability?: Ability) =>
  targetClause(ability)?.filter;

/** The instructions a resolving ability runs. */
export function effectsOf(ability?: Ability): Effect[] {
  return ability && "effects" in ability ? (ability.effects ?? []) : [];
}

/** An activated or mana ability's activation costs. */
export function costsOf(ability?: Ability): Cost[] {
  if (ability?.kind === "activated") return ability.costs;
  if (ability?.kind === "mana" && "costs" in ability.activation)
    return ability.activation.costs;
  return [];
}

export const manaSymbols = (costs: Cost[]) =>
  costs.flatMap((cost) => (cost.kind === "mana" ? cost.symbols : []));

/** Does casting or activating the ability choose X (CR 107.3)? */
export function choosesX(ability?: Ability) {
  if (ability?.kind !== "spell" && ability?.kind !== "activated") return false;
  const read = JSON.stringify([
    ability.targets,
    ability.effects,
    ability.kind === "activated" ? ability.costs : [],
  ]).includes('{"variable":"X"}');
  return read || manaSymbols(costsOf(ability)).includes("{X}");
}

/** Abilities a player activates: activated abilities and mana abilities with costs. */
export const activatable = (ability: Ability) =>
  ability.kind === "activated" ||
  (ability.kind === "mana" && "costs" in ability.activation);

export const isManaAbility = (ability?: Ability) => ability?.kind === "mana";

export function production(ability?: Ability): ManaProduction | undefined {
  return ability?.kind === "mana" ? ability.produce : undefined;
}

export const oncePerTurn = (ability?: Ability) =>
  ability?.kind === "activated" && !!ability.limit;

export const sorceryTiming = (ability?: Ability) =>
  ability?.kind === "activated" && ability.timing === "sorcery";

/** Where an activated ability's source must be. */
export const activationZone = (ability: Ability) =>
  ability.kind === "activated" && ability.activeFrom === "hand"
    ? "hand"
    : "battlefield";

/** A "dies" trigger: its targets and source are read from the dead object. */
export const isDiesTrigger = (ability?: Ability) =>
  ability?.kind === "triggered" &&
  (ability.trigger.event === "dies" ||
    (ability.trigger.event === "zone-change" &&
      ability.trigger.from === "battlefield" &&
      ability.trigger.to === "graveyard"));

export const interveningIf = (ability?: Ability): Condition | undefined =>
  ability?.kind === "triggered" ? ability.interveningIf : undefined;

const grantsOf = (ability: Ability): StaticGrant[] =>
  ability.kind === "static" ? ability.grants : [];

const grant = <K extends StaticGrant["kind"]>(abilities: Ability[], kind: K) =>
  abilities
    .flatMap(grantsOf)
    .filter((g): g is Extract<StaticGrant, { kind: K }> => g.kind === kind);

/** Enchant (CR 303.4a): what an Aura spell targets and enchants. */
export function enchantFilter(abilities: Ability[]): Predicate | undefined {
  for (const ability of abilities)
    if (
      ability.kind === "keyword" &&
      typeof ability.keyword === "object" &&
      ability.keyword.name === "enchant"
    )
      return ability.keyword.filter;
  return undefined;
}

export const hasImprovise = (abilities: Ability[]) =>
  abilities.some(
    (a) =>
      a.kind === "keyword" &&
      typeof a.keyword === "object" &&
      a.keyword.name === "improvise",
  );

/** "This enters tapped" (CR 614.1c). */
export const entersTapped = (abilities: Ability[]) =>
  abilities.some(
    (a) =>
      a.kind === "replacement" &&
      a.replace.kind === "enter-tapped" &&
      a.event.event === "would-enter" &&
      same(a.event.object, sourceIs),
  );

export const cantBeCountered = (abilities: Ability[]) =>
  grant(abilities, "cant-be-countered").some((g) => g.spells === "this");

/** Spells the controller may cast as though they had flash. */
export const castPermissions = (abilities: Ability[]) =>
  grant(abilities, "cast-timing").map((g) => g.spells);

export const unlimitedHandSize = (abilities: Ability[]) =>
  grant(abilities, "maximum-hand-size").some((g) => g.value === "unlimited");

/** The monarch untap lock (Fall from Favor). */
export const restrictsUntap = (abilities: Ability[]) =>
  grant(abilities, "untap-restriction").length > 0;

/** Mana symbols to pay for each creature attacking you. */
export function attackTax(abilities: Ability[]): string[] | undefined {
  const [tax] = grant(abilities, "attack-tax");
  const [cost] = tax?.costPerAttacker ?? [];
  return cost?.kind === "mana" ? cost.symbols : undefined;
}

export interface CostModifier {
  use: "cast" | "activate";
  /** `source`: the modifier's own object; `controller`: spells its controller casts. */
  scope: "source" | "controller";
  filter?: Predicate;
  amount: Value;
}

/** Generic cost reductions an object's static abilities apply (CR 601.2f). */
export function costModifiers(abilities: Ability[]): CostModifier[] {
  return grant(abilities, "cost-modifier").map((g) =>
    g.applies === "this"
      ? { use: "cast", scope: "source", amount: g.reduce! }
      : "spells" in g.applies
        ? {
            use: "cast",
            scope: "controller",
            filter: g.applies.spells,
            amount: g.reduce!,
          }
        : { use: "activate", scope: "source", amount: g.reduce! },
  );
}

// ------------------------------------------------------------- keywords

/** A rule keyword's runtime name ("flying" → "Flying"), if the runtime has it. */
export function runtimeKeyword(keyword: string): RuntimeKeyword | undefined {
  const name = keyword[0].toUpperCase() + keyword.slice(1);
  return (runtimeKeywords as readonly string[]).includes(name)
    ? (name as RuntimeKeyword)
    : undefined;
}

/** Attack and block grants the runtime applies as keywords. */
export function grantKeyword(
  grant: StaticGrant,
): { objects: Selector; keyword: RuntimeKeyword } | undefined {
  if (grant.kind === "attack-requirement")
    return { objects: grant.objects, keyword: "Must attack" };
  if (grant.kind !== "block-restriction") return undefined;
  if (!grant.by) return { objects: grant.objects, keyword: "Unblockable" };
  if (same(grant.by, { subtype: "Wall" }))
    return { objects: grant.objects, keyword: "Cannot be blocked by Walls" };
  return undefined;
}

/** A Core change as the characteristics engine applies it. */
export function appliedChange(change: ContinuousChange): AppliedChange {
  const { layer: _layer, ...rest } = change;
  if (rest.kind === "grant-keyword")
    return { kind: "grant-keyword", keyword: runtimeKeyword(rest.keyword)! };
  return rest as AppliedChange;
}

/**
 * The keyword an ability gives its own object: a keyword ability, or a static
 * ability whose only grant is one attack or block keyword on its source.
 */
export function ownKeyword(ability: Ability): RuntimeKeyword | undefined {
  if (ability.kind === "keyword")
    return typeof ability.keyword === "string"
      ? runtimeKeyword(ability.keyword)
      : undefined;
  if (ability.kind !== "static" || ability.condition) return undefined;
  const keywords = ability.grants.flatMap((g) => grantKeyword(g) ?? []);
  const continuous = ability.grants.some((g) => g.kind === "continuous");
  return keywords.length === 1 &&
    !continuous &&
    keywords[0].objects === "source"
    ? keywords[0].keyword
    : undefined;
}

export interface StaticContinuous {
  objects: Selector;
  changes: AppliedChange[];
  characteristicDefining: boolean;
  condition?: Condition;
}

/** A static ability's continuous effect, if it has one (CR 611.3). */
export function staticContinuous(
  ability: Ability,
): StaticContinuous | undefined {
  if (ability.kind !== "static" || ownKeyword(ability)) return undefined;
  let objects: Selector | undefined;
  const changes: AppliedChange[] = [];
  for (const g of ability.grants) {
    const keyword = grantKeyword(g);
    if (keyword) {
      objects = keyword.objects;
      changes.push({ kind: "grant-keyword", keyword: keyword.keyword });
    } else if (g.kind === "continuous") {
      objects = g.objects;
      changes.push(...g.changes.map(appliedChange));
    }
  }
  if (!changes.length) return undefined;
  return {
    objects: objects!,
    changes,
    characteristicDefining: !!ability.characteristicDefining,
    ...(ability.condition ? { condition: ability.condition } : {}),
  };
}

// ------------------------------------------------------------- triggers

/** A trigger's subject: "source" means the source on the Battlefield. */
export const triggerSubject = (object: Selector | Predicate): Predicate =>
  object === "source" || same(object, sourceIs)
    ? { zone: "battlefield", is: "source" }
    : (object as Predicate);
