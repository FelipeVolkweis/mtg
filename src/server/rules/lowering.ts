import {
  supportedKeywordSchema,
  type ContinuousChange as V1Change,
  type RulesAbility,
  type RulesValue,
} from "../../shared/rules.js";
import type {
  ContinuousChange,
  Selector,
  StaticGrant,
  Value,
} from "../../shared/rules-v2.js";

// Core AST pieces the runtime still holds in version 1 shapes: keywords and
// continuous changes (applied through the characteristics calculator). The
// down-compiler lowers static abilities with these; the continuous-effect
// handlers lower their changes when they apply them.

export type V1Keyword = NonNullable<RulesAbility["keyword"]>;
/** Reports a construct the runtime can't run; never returns. */
export type Unsupported = (what: string) => never;

/** A DSL keyword as the runtime names it ("flying" → "Flying"). */
export function v1Keyword(keyword: string, unsupported: Unsupported) {
  const name = keyword[0].toUpperCase() + keyword.slice(1);
  const parsed = supportedKeywordSchema.safeParse(name);
  if (!parsed.success) return unsupported(`The ${keyword} keyword`);
  return parsed.data;
}

/** The runtime runs "Must attack" and the two block restrictions as keywords. */
export function grantKeyword(
  grant: StaticGrant,
  unsupported: Unsupported,
): { objects: Selector; keyword: V1Keyword } | undefined {
  if (grant.kind === "attack-requirement")
    return { objects: grant.objects, keyword: "Must attack" };
  if (grant.kind !== "block-restriction") return undefined;
  if (!grant.by) return { objects: grant.objects, keyword: "Unblockable" };
  if (JSON.stringify(grant.by) === JSON.stringify({ subtype: "Wall" }))
    return { objects: grant.objects, keyword: "Cannot be blocked by Walls" };
  return unsupported("A block restriction other than by Walls");
}

export function v1Change(
  change: ContinuousChange,
  value: (value: Value) => RulesValue,
  unsupported: Unsupported,
): V1Change {
  const { layer: _layer, ...rest } = change;
  switch (rest.kind) {
    case "add-types":
      return rest;
    case "set-base-stats":
      return {
        kind: "set-stats",
        power: value(rest.power),
        toughness: value(rest.toughness),
      };
    case "add-stats":
    case "define-stats":
      return {
        kind: rest.kind,
        power: value(rest.power),
        toughness: value(rest.toughness),
      };
    case "grant-keyword":
      return {
        kind: "grant-keyword",
        keyword: v1Keyword(rest.keyword, unsupported),
      };
    case "copy-linked":
      return {
        kind: "linked-characteristics",
        link: rest.link,
        retainSubtypes: rest.retainSubtypes,
      };
    case "gain-control":
      return unsupported("Gaining control");
  }
}

/** Runs a lowering and returns what it couldn't lower, if anything. */
export function lowersCleanly(lower: (unsupported: Unsupported) => unknown) {
  class Stop extends Error {}
  let what: string | undefined;
  try {
    lower((reason) => {
      what = reason;
      throw new Stop();
    });
  } catch (error) {
    if (!(error instanceof Stop)) throw error;
  }
  return what;
}
