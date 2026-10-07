import type { GameObject, ZoneKind } from "../../../shared/model.js";
import type {
  ManaPool,
  ManaType,
  RestrictedMana,
  RulesState,
  SelectionOption,
} from "../../../shared/rules.js";
import type { Ability } from "../../../shared/rules-v2.js";
import {
  costModifiers,
  costsOf,
  hasImprovise,
  manaSymbols,
} from "../abilities.js";
import { manaCost, spendMana, type ManaCost } from "../../match/mana.js";
import { CommanderRules } from "../../match/commander-rules.js";
import type { RulesEngine } from "../../match/rules-engine.js";
import { costHandler } from "./handlers.js";
import type { CostContext, CostMutation, CostPlan, CostUse } from "./types.js";

// The Cost Runtime (rules-engine-refactor.md §36–38): determine the total
// cost, lock it, plan every component, then commit the whole payment or
// nothing.

/** What a spell or ability's total cost is determined from (CR 601.2f). */
export interface CostProposal {
  use: CostUse;
  playerId: string;
  /** The spell being cast, or the activated ability's source. */
  source: GameObject;
  ability: Ability;
  variables?: Record<string, number>;
  /** A spell's Zone when its casting began (commander tax reads it). */
  sourceZone?: ZoneKind;
}

/** A total-cost adjustment: generic mana added (or removed when negative). */
type CostAdjustment = (engine: RulesEngine, proposal: CostProposal) => number;

/** CR 903.8: each earlier cast from the Command Zone adds {2}. */
const commanderTax: CostAdjustment = (engine, proposal) => {
  if (proposal.use !== "cast" || proposal.sourceZone !== "command") return 0;
  const instance = new CommanderRules(engine).instance(proposal.source);
  return instance ? 2 * (engine.rules.commanderCasts?.[instance] ?? 0) : 0;
};

/** Generic reductions from static abilities (CR 601.2f). */
const reductions: CostAdjustment = (engine, proposal) => {
  let reduction = 0;
  for (const source of Object.values(engine.match.objects)) {
    if (source.controllerId !== proposal.playerId) continue;
    for (const modifier of costModifiers(
      engine.definition(source)?.abilities ?? [],
    )) {
      if (modifier.use !== proposal.use) continue;
      if (
        modifier.scope === "source"
          ? source.id !== proposal.source.id
          : source.zoneId !== engine.zone("battlefield").id
      )
        continue;
      if (
        modifier.filter &&
        !engine.matches(
          proposal.source,
          modifier.filter,
          proposal.playerId,
          source.id,
        )
      )
        continue;
      reduction += engine.value(
        modifier.amount,
        proposal.playerId,
        source.id,
        proposal.variables,
      );
    }
  }
  return -reduction;
};

const adjustments: CostAdjustment[] = [commanderTax, reductions];

/** The printed mana symbols a proposal pays: mana cost or activation cost. */
function symbols(proposal: Pick<CostProposal, "use" | "source" | "ability">) {
  return proposal.use === "cast"
    ? (proposal.source.characteristics.manaCost?.match(/\{[^{}]+\}/g) ?? [])
    : manaSymbols(costsOf(proposal.ability));
}

/** The printed cost without X, before choices and adjustments. */
export function baseCost(
  proposal: Pick<CostProposal, "use" | "source" | "ability">,
): ManaCost {
  return manaCost(symbols(proposal).filter((symbol) => symbol !== "{X}"));
}

/**
 * The total cost (CR 601.2f): the printed cost with X, then increases and
 * reductions; generic mana can't go below zero.
 */
export function determineCost(
  engine: RulesEngine,
  proposal: CostProposal,
): ManaCost {
  const cost = baseCost(proposal);
  const x = proposal.variables?.X ?? 0;
  cost.generic +=
    symbols(proposal).filter((symbol) => symbol === "{X}").length * x;
  for (const adjust of adjustments) cost.generic += adjust(engine, proposal);
  cost.generic = Math.max(0, cost.generic);
  return cost;
}

// ----------------------------------------------------------- mana spending

/** Can this restricted mana pay for the proposal? */
export type ManaEligibility = (lot: RestrictedMana) => boolean;
const noRestrictedMana: ManaEligibility = () => false;

export function manaEligibility(
  use: CostUse,
  source: GameObject,
): ManaEligibility {
  return (lot) =>
    (!lot.restriction.use || lot.restriction.use === use) &&
    (!lot.restriction.spellTypes ||
      (use === "cast" &&
        lot.restriction.spellTypes.some((type) =>
          source.characteristics.types?.includes(type),
        )));
}

/** The pool a payment may spend: restricted mana it can't use is held back. */
function spendable(
  rules: RulesState,
  playerId: string,
  eligible: ManaEligibility,
): ManaPool {
  const available = { ...rules.mana[playerId] };
  for (const lot of rules.restrictedMana?.[playerId] ?? [])
    if (!eligible(lot)) available[lot.type] -= lot.amount;
  return available;
}

/** The mana a cost would spend, or nothing when the pool can't pay it. */
export function planMana(
  rules: RulesState,
  playerId: string,
  cost: ManaCost,
  eligible: ManaEligibility = noRestrictedMana,
): ManaType[] | undefined {
  return spendMana(spendable(rules, playerId, eligible), cost)?.spent;
}

/** Removes spent mana from the pool, using eligible restricted mana first. */
export function commitMana(
  rules: RulesState,
  playerId: string,
  spent: ManaType[],
  eligible: ManaEligibility = noRestrictedMana,
) {
  const lots = rules.restrictedMana?.[playerId] ?? [];
  for (const type of spent) {
    rules.mana[playerId][type]--;
    const lot = lots.find(
      (lot) => lot.type === type && lot.amount > 0 && eligible(lot),
    );
    if (lot) lot.amount--;
  }
  if (rules.restrictedMana?.[playerId])
    rules.restrictedMana[playerId] = lots.filter((lot) => lot.amount > 0);
}

/** Pays a mana cost from the pool; false when it can't be paid. */
export function payMana(
  rules: RulesState,
  playerId: string,
  cost: ManaCost,
  eligible: ManaEligibility = noRestrictedMana,
) {
  const spent = planMana(rules, playerId, cost, eligible);
  if (!spent) return undefined;
  commitMana(rules, playerId, spent, eligible);
  return spent;
}

// ---------------------------------------------------------------- payment

/** A payment request: the locked total cost and the player's selections. */
export interface CostPayment extends CostProposal {
  totalCost: ManaCost;
  selections: Record<string, string[]>;
}

/** Improvise (CR 702.126): untapped artifacts the player may tap for {1}. */
function improviseOption(
  ctx: CostContext,
  totalCost: ManaCost,
): SelectionOption | undefined {
  if (
    ctx.use !== "cast" ||
    !hasImprovise(ctx.engine.definition(ctx.source)?.abilities ?? [])
  )
    return undefined;
  return {
    count: totalCost.generic,
    minCount: 0,
    label: "Improvise: tap artifacts for generic mana",
    objectIds: ctx.engine
      .battlefieldSources()
      .filter(
        (o) =>
          o.controllerId === ctx.playerId &&
          !o.status.tapped &&
          ctx.engine.effective(o).types?.includes("Artifact"),
      )
      .map((o) => o.id),
  };
}

/** The objects the player may choose for each cost component. */
export function costOptions(
  engine: RulesEngine,
  payment: Omit<CostPayment, "selections">,
): Record<string, SelectionOption> {
  const ctx = context(engine, { ...payment, selections: {} });
  const options: Record<string, SelectionOption> = {};
  const improvise = improviseOption(ctx, payment.totalCost);
  if (improvise) options.improvise = improvise;
  for (const [index, cost] of costsOf(payment.ability).entries()) {
    const option = costHandler(cost).options?.(cost, ctx);
    if (option) options[String(index)] = option;
  }
  return options;
}

const context = (engine: RulesEngine, payment: CostPayment): CostContext => ({
  engine,
  playerId: payment.playerId,
  source: payment.source,
  selections: payment.selections,
  use: payment.use,
});

/**
 * Checks planned components against each other in payment order: an object
 * is tapped at most once and moved at most once, and nothing is tapped after
 * it moved (a tapped permanent can still be sacrificed).
 */
function checkCompatible(components: CostMutation[][]) {
  const tapped = new Set<string>(),
    moved = new Set<string>();
  for (const mutation of components.flat()) {
    if (mutation.kind === "tap" || mutation.kind === "untap") {
      if (tapped.has(mutation.objectId) || moved.has(mutation.objectId))
        throw new Error("A cost can't use the same object twice.");
      tapped.add(mutation.objectId);
    } else if (mutation.kind === "move") {
      if (moved.has(mutation.objectId))
        throw new Error("A cost can't use the same object twice.");
      moved.add(mutation.objectId);
    }
  }
}

/** A planned payment: component mutations and the mana it spends. */
export interface PlannedPayment {
  plan: CostPlan;
  spent: ManaType[];
  eligible: ManaEligibility;
}

/**
 * Plans the complete payment without changing anything. Throws when a
 * selection is illegal; returns undefined while it can't be paid yet
 * (selections missing or not enough mana).
 */
export function planPayment(
  engine: RulesEngine,
  payment: CostPayment,
): PlannedPayment | undefined {
  const ctx = context(engine, payment);
  const components: CostMutation[][] = [];
  const improvise = payment.selections.improvise ?? [];
  if (improvise.length) {
    const option = improviseOption(ctx, payment.totalCost);
    if (
      !option ||
      new Set(improvise).size !== improvise.length ||
      improvise.length > payment.totalCost.generic ||
      improvise.some((id) => !option.objectIds.includes(id))
    )
      throw new Error("Choose untapped artifacts you control for improvise.");
    components.push(
      improvise.map((objectId): CostMutation => ({ kind: "tap", objectId })),
    );
  }
  let incomplete = false;
  for (const [index, cost] of costsOf(payment.ability).entries()) {
    const component = costHandler(cost).plan(cost, String(index), ctx);
    if (component.kind === "incomplete") incomplete = true;
    else components.push(component.mutations);
  }
  if (incomplete) return undefined;
  checkCompatible(components);
  const life = components
    .flat()
    .reduce((sum, m) => sum + (m.kind === "pay-life" ? m.amount : 0), 0);
  const player = engine.match.players.find((p) => p.id === payment.playerId)!;
  if (BigInt(player.life) < BigInt(life))
    throw new Error("You cannot pay that much life.");
  const eligible = manaEligibility(payment.use, payment.source);
  const spent = planMana(
    engine.rules,
    payment.playerId,
    {
      ...payment.totalCost,
      generic: payment.totalCost.generic - improvise.length,
    },
    eligible,
  );
  if (!spent) return undefined;
  return { plan: { components, ordering: "rules-forced" }, spent, eligible };
}

/** Commits a planned payment: mana first, then each component in order. */
export function commitPayment(
  engine: RulesEngine,
  playerId: string,
  { plan, spent, eligible }: PlannedPayment,
) {
  commitMana(engine.rules, playerId, spent, eligible);
  for (const mutation of plan.components.flat())
    commit(engine, playerId, mutation);
}

function commit(engine: RulesEngine, playerId: string, mutation: CostMutation) {
  switch (mutation.kind) {
    case "tap":
    case "untap":
      engine.object(mutation.objectId).status.tapped = mutation.kind === "tap";
      return;
    case "pay-life":
      if (mutation.amount)
        engine.propose({
          kind: "life-change",
          playerId,
          amount: -mutation.amount,
        });
      return;
    case "counters": {
      const object = engine.object(mutation.objectId);
      const counter = object.counters.find((c) => c.kind === mutation.counter);
      const quantity =
        BigInt(counter?.quantity ?? "0") + BigInt(mutation.delta);
      if (counter) counter.quantity = String(quantity);
      else
        object.counters.push({
          kind: mutation.counter,
          quantity: String(quantity),
        });
      object.counters = object.counters.filter((c) => c.quantity !== "0");
      return;
    }
    case "move": {
      const object = engine.object(mutation.objectId);
      engine.propose({
        kind: "zone-change",
        objectId: object.id,
        to:
          mutation.to === "exile"
            ? engine.zone("exile")
            : engine.zone(mutation.to, object.ownerId),
      });
      return;
    }
  }
}

/**
 * Pays a locked total cost: plans everything, then commits it all. Returns
 * the mana spent, or undefined (nothing changed) when it can't be paid yet.
 */
export function pay(engine: RulesEngine, payment: CostPayment) {
  const planned = planPayment(engine, payment);
  if (!planned) return undefined;
  commitPayment(engine, payment.playerId, planned);
  return planned.spent;
}
