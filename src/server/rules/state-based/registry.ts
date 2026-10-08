import { auraLegality, equipmentLegality } from "./rules/attachments.js";
import { commanderReturn } from "./rules/commander.js";
import { lethalDamage, zeroToughness } from "./rules/creatures.js";
import { counterCancellation, tokenCeasesToExist } from "./rules/objects.js";
import {
  commanderDamageLoss,
  failedDrawLoss,
  zeroLifeLoss,
} from "./rules/players.js";
import type { StateBasedRule } from "./types.js";

// State-Based Rule registry (CR 704.3). Changes from one
// check are performed in this order, as one simultaneous event.

const rules: StateBasedRule[] = [
  auraLegality,
  equipmentLegality,
  zeroToughness,
  lethalDamage,
  tokenCeasesToExist,
  counterCancellation,
  zeroLifeLoss,
  failedDrawLoss,
  commanderDamageLoss,
  commanderReturn,
];

export const stateBasedRules = (): readonly StateBasedRule[] => rules;

export function stateBasedRule(id: string) {
  const rule = rules.find((r) => r.id === id);
  if (!rule) throw new Error(`No state-based rule ${id}.`);
  return rule;
}

/** Adds a rule (tests register synthetic rules); returns its removal. */
export function registerStateBasedRule(rule: StateBasedRule) {
  if (rules.some((r) => r.id === rule.id))
    throw new Error(`State-based rule ${rule.id} is already registered.`);
  rules.push(rule);
  return () => {
    rules.splice(rules.indexOf(rule), 1);
  };
}
