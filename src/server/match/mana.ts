import { type ManaType, manaTypes } from "../../shared/card-dsl.js";
import type { ManaPool } from "../../shared/rules-state.js";
import { emptyMana } from "./rules-engine.js";

export type ManaCost = ManaPool & { generic: number };
export function manaCost(symbols: string[]): ManaCost {
  const cost = { ...emptyMana(), generic: 0 };
  for (const symbol of symbols) {
    const value = symbol.slice(1, -1);
    if (/^\d+$/.test(value)) cost.generic += Number(value);
    else if (manaTypes.includes(value as ManaType)) cost[value as ManaType]++;
    else throw new Error(`Unsupported mana cost ${symbol}.`);
  }
  return cost;
}

// Reserve specific mana first. Generic ties follow W, U, B, R, G; C is last.
export function spendMana(
  pool: ManaPool,
  cost: ManaCost,
): { remaining: ManaPool; spent: ManaType[] } | undefined {
  const remaining = { ...pool },
    spent: ManaType[] = [];
  for (const type of manaTypes) {
    if (remaining[type] < cost[type]) return undefined;
    remaining[type] -= cost[type];
    for (let i = 0; i < cost[type]; i++) spent.push(type);
  }
  const colored = manaTypes
    .filter((type) => type !== "C")
    .sort((a, b) => remaining[b] - remaining[a]);
  let generic = cost.generic;
  for (const type of [...colored, "C"] as ManaType[]) {
    const amount = Math.min(generic, remaining[type]);
    remaining[type] -= amount;
    generic -= amount;
    for (let i = 0; i < amount; i++) spent.push(type);
  }
  return generic ? undefined : { remaining, spent };
}
