import {
  type AppliedChange,
  type RuntimeKeyword,
  runtimeKeywords,
} from "../../shared/rules-state.js";
import {
  type Ability,
  type Condition,
  type ContinuousChange,
  type Cost,
  type Effect,
  type MacroKeyword,
  type ManaProduction,
  type Predicate,
  type Replacement,
  type Selector,
  type StaticGrant,
  type TargetClause,
  type Value,
} from "../../shared/card-dsl.js";
import {
  astEqual,
  isAttachedToSource,
  isSourcePredicate,
  isSourceSelector,
  mentionsVariable,
} from "./ast.js";
import {
  type Registry,
  type RegistryEntry,
  supported,
  type SupportCheck,
} from "./support-check.js";

// Readers over Core abilities (docs/card-model.md): what the engine asks of
// an ability, answered from the compiler's output. The runtime supports the
// subset `support.ts` accepts, so these read only that subset. Static grants,
// replacements and keywords declare that subset here, next to their readers.

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
  const read = mentionsVariable(
    [
      ability.targets,
      ability.effects,
      ability.kind === "activated" ? ability.costs : [],
    ],
    "X",
  );
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

// ---------------------------------------------------------- replacements

type ReplacementAbility = Extract<Ability, { kind: "replacement" }>;

/** "This enters tapped" (CR 614.1c). */
const isEntersTapped = (a: ReplacementAbility) =>
  a.replace.kind === "enter-tapped" &&
  a.event.event === "would-enter" &&
  isSourcePredicate(a.event.object);

export const entersTapped = (abilities: Ability[]) =>
  abilities.some((a) => a.kind === "replacement" && isEntersTapped(a));

/**
 * Replacement Registry: the replacement effects the runtime applies, each
 * with the forms it supports. Only "this enters tapped" runs today.
 */
const replacementHandlers: {
  [K in Replacement["kind"]]?: RegistryEntry & {
    support(ability: ReplacementAbility, check: SupportCheck): void;
  };
} = {
  "enter-tapped": {
    reader: entersTapped,
    support(ability, check) {
      if (!isEntersTapped(ability))
        check.unsupported(
          `A ${ability.replace.kind} replacement of ${ability.event.event}`,
        );
    },
  },
};

/** The replacement kinds the runtime applies, each with its support declaration. */
export const replacementRegistry: Registry = replacementHandlers;

/** Rejects a replacement ability the runtime can't apply. */
export function replacementSupport(
  ability: ReplacementAbility,
  check: SupportCheck,
) {
  const handler = replacementHandlers[ability.replace.kind];
  if (!handler)
    return check.unsupported(
      `A ${ability.replace.kind} replacement of ${ability.event.event}`,
    );
  handler.support(ability, check);
}

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

/** Fall from Favor's lock: "unless that creature's controller is the monarch". */
const isMonarchLock = (
  g: Extract<StaticGrant, { kind: "untap-restriction" }>,
) =>
  isAttachedToSource(g.objects) &&
  astEqual(g.unless, { monarch: { controllerOf: { attachedTo: "source" } } });

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
  if (astEqual(grant.by, { subtype: "Wall" }))
    return { objects: grant.objects, keyword: "Cannot be blocked by Walls" };
  return undefined;
}

// ---------------------------------------------------------- static grants

type GrantOf<K extends StaticGrant["kind"]> = Extract<StaticGrant, { kind: K }>;

/**
 * Static Grant Registry: the grants the runtime applies through the readers
 * above, each with the forms it supports. A grant without an entry can't be
 * applied, and the support check rejects it.
 */
const grantHandlers: {
  [K in StaticGrant["kind"]]?: RegistryEntry & {
    support(grant: GrantOf<K>, check: SupportCheck): void;
  };
} = {
  continuous: {
    reader: staticContinuous,
    support(grant, check) {
      for (const change of grant.changes)
        switch (change.kind) {
          case "set-base-stats":
          case "add-stats":
          case "define-stats":
            check.value(change.power);
            check.value(change.toughness);
            break;
          case "grant-keyword":
            check.keyword(change.keyword);
            break;
          case "gain-control":
            check.unsupported("Gaining control");
            break;
          case "add-types":
          case "copy-linked":
            break;
          default:
            check.unsupported(`The ${change.kind} change`);
        }
    },
  },
  "cost-modifier": {
    reader: costModifiers,
    support(grant, check) {
      if (grant.increase !== undefined || grant.condition)
        check.unsupported("A cost increase or conditional cost modifier");
      check.value(grant.reduce!);
      if (typeof grant.applies === "object" && "spells" in grant.applies)
        check.filter(grant.applies.spells);
      else if (
        typeof grant.applies === "object" &&
        grant.applies.abilitiesOf !== "source"
      )
        check.unsupported("A cost modifier for another object's abilities");
    },
  },
  "attack-tax": {
    reader: attackTax,
    support(grant, check) {
      const [cost] = grant.costPerAttacker;
      if (
        grant.defender !== "you" ||
        grant.costPerAttacker.length !== 1 ||
        cost.kind !== "mana"
      )
        check.unsupported("An attack tax other than mana to attack you");
    },
  },
  "cast-timing": {
    reader: castPermissions,
    support: (grant, check) => check.filter(grant.spells),
  },
  "maximum-hand-size": {
    reader: unlimitedHandSize,
    support(grant, check) {
      if (grant.player !== "you" || grant.value !== "unlimited")
        check.unsupported("A maximum hand size other than your unlimited one");
    },
  },
  "untap-restriction": {
    reader: restrictsUntap,
    support(grant, check) {
      if (!isMonarchLock(grant))
        check.unsupported("An untap restriction other than the monarch lock");
    },
  },
  "cant-be-countered": {
    reader: cantBeCountered,
    support(grant, check) {
      if (grant.spells !== "this")
        check.unsupported("Can't be countered for other spells");
    },
  },
  // Applied as keywords.
  "attack-requirement": { reader: grantKeyword, support: supported },
  "block-restriction": {
    reader: grantKeyword,
    support(grant, check) {
      if (grant.by && !grantKeyword(grant))
        check.unsupported("A block restriction other than by Walls");
    },
  },
};

/** The grant kinds the runtime applies, each with its support declaration. */
export const grantRegistry: Registry = grantHandlers;

/** Rejects a static grant the runtime can't apply. */
export function grantSupport(grant: StaticGrant, check: SupportCheck) {
  const handler = grantHandlers[grant.kind] as
    { support(grant: StaticGrant, check: SupportCheck): void } | undefined;
  if (!handler) return check.unsupported(`The ${grant.kind} grant`);
  handler.support(grant, check);
}

/**
 * What a static ability's grants apply continuously, as `staticContinuous`
 * reads them: each keyword or continuous grant's objects and change count.
 */
export function continuousGrants(
  grants: StaticGrant[],
): ({ objects: Selector; changes: number } | undefined)[] {
  return grants.map((g) => {
    const keyword = grantKeyword(g);
    if (keyword) return { objects: keyword.objects, changes: 1 };
    if (g.kind === "continuous")
      return { objects: g.objects, changes: g.changes.length };
    return undefined;
  });
}

// --------------------------------------------------------------- keywords

/**
 * Keyword Registry for keywords with parameters: the casting options the
 * runtime applies (enchant targets, improvise pays). A rule keyword is
 * supported when it has a runtime name (`runtimeKeyword`).
 */
const macroKeywordHandlers: {
  [K in MacroKeyword["name"]]?: RegistryEntry & {
    support(
      keyword: Extract<MacroKeyword, { name: K }>,
      check: SupportCheck,
    ): void;
  };
} = {
  enchant: {
    reader: enchantFilter,
    support: (keyword, check) =>
      check.at("keyword.filter", () => check.filter(keyword.filter)),
  },
  improvise: { reader: hasImprovise, support: supported },
};

/** The keywords with parameters the runtime applies, with their support declarations. */
export const macroKeywordRegistry: Registry = macroKeywordHandlers;

/** Rejects a keyword ability the runtime can't apply. */
export function keywordSupport(
  keyword: Extract<Ability, { kind: "keyword" }>["keyword"],
  check: SupportCheck,
) {
  if (typeof keyword === "string") return check.keyword(keyword);
  const handler = macroKeywordHandlers[keyword.name] as
    { support(keyword: MacroKeyword, check: SupportCheck): void } | undefined;
  if (!handler) return check.unsupported(`The ${keyword.name} keyword`);
  handler.support(keyword, check);
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
  isSourceSelector(object)
    ? { zone: "battlefield", is: "source" }
    : (object as Predicate);
