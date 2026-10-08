import type { Counter } from "../../shared/rules-state.js";

// A Counter's quantity is an integer of any size, stored as a decimal string
// like a Life Total and changed with BigInt arithmetic. This module is the
// only code that parses, compares or changes `Counter.quantity`.

interface WithCounters {
  counters: Counter[];
}

/**
 * The quantity of a kind of counter as a DSL number value; 0 without one. No
 * kind counts the counters of every kind.
 */
export function counterCount(counters: Counter[], kind?: string) {
  if (kind === undefined)
    return counters.reduce((sum, c) => sum + Number(c.quantity), 0);
  return Number(counters.find((c) => c.kind === kind)?.quantity ?? 0);
}

/** Whether there is a counter of a kind, with at least `count` of them. */
export function hasCounters(counters: Counter[], kind: string, count: number) {
  const counter = counters.find((c) => c.kind === kind);
  return !!counter && BigInt(counter.quantity) >= BigInt(count);
}

/**
 * Puts `delta` counters of a kind on an object (removes them when negative).
 * A Counter left at 0 stays until `dropEmptyCounters`.
 */
export function adjustCounters(
  object: WithCounters,
  kind: string,
  delta: number,
) {
  const counter = object.counters.find((c) => c.kind === kind);
  if (counter)
    counter.quantity = (BigInt(counter.quantity) + BigInt(delta)).toString();
  else object.counters.push({ kind, quantity: String(delta) });
}

/** Removes up to `amount` counters of a kind, stopping at 0 (CR 120.3c). */
export function removeCountersDownToZero(
  counters: Counter[],
  kind: string,
  amount: number,
) {
  const counter = counters.find((c) => c.kind === kind);
  if (!counter) return;
  const quantity = BigInt(counter.quantity);
  counter.quantity = (
    quantity > BigInt(amount) ? quantity - BigInt(amount) : 0n
  ).toString();
}

/** Removes every Counter whose quantity is 0. */
export function dropEmptyCounters(object: WithCounters) {
  object.counters = object.counters.filter((c) => c.quantity !== "0");
}

/** +1/+1 counters less -1/-1 counters: what they add to power and toughness. */
export function netStatCounters(counters: Counter[]) {
  let amount = 0n;
  for (const counter of counters) {
    if (counter.kind === "+1/+1") amount += BigInt(counter.quantity);
    if (counter.kind === "-1/-1") amount -= BigInt(counter.quantity);
  }
  return amount;
}

/**
 * CR 704.5q: how many +1/+1 and -1/-1 counters cancel out, as a quantity;
 * undefined unless the object has both.
 */
export function cancellableStatCounters(counters: Counter[]) {
  const plus = counters.find((c) => c.kind === "+1/+1");
  const minus = counters.find((c) => c.kind === "-1/-1");
  if (!plus || !minus) return undefined;
  return BigInt(plus.quantity) < BigInt(minus.quantity)
    ? plus.quantity
    : minus.quantity;
}

/** Removes `amount` +1/+1 and `amount` -1/-1 counters, dropping empty ones. */
export function cancelStatCounters(object: WithCounters, amount: string) {
  for (const counter of object.counters)
    if (counter.kind === "+1/+1" || counter.kind === "-1/-1")
      counter.quantity = (BigInt(counter.quantity) - BigInt(amount)).toString();
  dropEmptyCounters(object);
}
