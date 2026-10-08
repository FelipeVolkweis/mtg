import { expect, test } from "@playwright/test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  adjustCounters,
  cancellableStatCounters,
  cancelStatCounters,
  counterCount,
  dropEmptyCounters,
  hasCounters,
  netStatCounters,
  removeCountersDownToZero,
} from "../../src/server/match/counters";
import {
  canPayLife,
  changeLife,
  hasNoLife,
  lifeValue,
} from "../../src/server/match/life";
import type { Counter, MatchPlayer } from "../../src/shared/rules-state";

// Life Totals and Counter quantities are integers of any size stored as
// decimal strings. One module each reads, compares and changes them.

function player(life: string): MatchPlayer {
  return {
    id: "p",
    participantId: "p",
    name: "P",
    seat: 0,
    life,
    mulliganCount: 0,
    outcome: "playing",
    counters: [],
  };
}

test("a Life Total changes without losing precision", () => {
  const p = player("9007199254740993");
  changeLife(p, 2);
  expect(p.life).toBe("9007199254740995");
  changeLife(p, -9007199254740994);
  expect(p.life).toBe("1");
  changeLife(p, -4);
  expect(p.life).toBe("-3");
});

test("paying life needs at least that much life", () => {
  expect(canPayLife(player("2"), 2)).toBe(true);
  expect(canPayLife(player("1"), 2)).toBe(false);
  expect(canPayLife(player("0"), 0)).toBe(true);
});

test("a player with 0 or less life has no life left", () => {
  expect(hasNoLife(player("1"))).toBe(false);
  expect(hasNoLife(player("0"))).toBe(true);
  expect(hasNoLife(player("-5"))).toBe(true);
});

test("a Life Total is a DSL number value, 0 without a player", () => {
  expect(lifeValue(player("40"))).toBe(40);
  expect(lifeValue(undefined)).toBe(0);
});

test("counters are added, counted and dropped when empty", () => {
  const object = { counters: [] as Counter[] };
  adjustCounters(object, "+1/+1", 2);
  adjustCounters(object, "+1/+1", 3);
  adjustCounters(object, "charge", 1);
  expect(object.counters).toEqual([
    { kind: "+1/+1", quantity: "5" },
    { kind: "charge", quantity: "1" },
  ]);
  expect(counterCount(object.counters, "+1/+1")).toBe(5);
  expect(counterCount(object.counters, "loyalty")).toBe(0);
  // No kind counts the counters of every kind ("a counter on it").
  expect(counterCount(object.counters)).toBe(6);
  expect(counterCount([])).toBe(0);
  expect(hasCounters(object.counters, "charge", 1)).toBe(true);
  expect(hasCounters(object.counters, "charge", 2)).toBe(false);
  // A counter cost needs the counter, even for zero of them.
  expect(hasCounters(object.counters, "loyalty", 0)).toBe(false);
  adjustCounters(object, "charge", -1);
  dropEmptyCounters(object);
  expect(object.counters).toEqual([{ kind: "+1/+1", quantity: "5" }]);
});

test("+1/+1 and -1/-1 counters net out and cancel", () => {
  const object = {
    counters: [
      { kind: "+1/+1", quantity: "3" },
      { kind: "-1/-1", quantity: "5" },
    ],
  };
  expect(netStatCounters(object.counters)).toBe(-2n);
  const common = cancellableStatCounters(object.counters);
  expect(common).toBe("3");
  cancelStatCounters(object, common!);
  expect(object.counters).toEqual([{ kind: "-1/-1", quantity: "2" }]);
  expect(cancellableStatCounters(object.counters)).toBeUndefined();
});

test("removing counters stops at zero", () => {
  const counters = [{ kind: "loyalty", quantity: "3" }];
  removeCountersDownToZero(counters, "loyalty", 2);
  expect(counters[0].quantity).toBe("1");
  removeCountersDownToZero(counters, "loyalty", 5);
  expect(counters[0].quantity).toBe("0");
  removeCountersDownToZero(counters, "defense", 5);
  expect(counters).toEqual([{ kind: "loyalty", quantity: "0" }]);
});

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

test("only the life and counter modules parse, compare or change those numbers", () => {
  const owners = ["src/server/match/life.ts", "src/server/match/counters.ts"];
  const files = ["src/server/match", "src/server/rules", "src/shared"].flatMap(
    sources,
  );
  for (const file of files) {
    if (owners.includes(file)) continue;
    const text = readFileSync(file, "utf8");
    expect(text, file).not.toMatch(/(BigInt|Number)\([^)]*\b(life|quantity)\b/);
    expect(text, file).not.toMatch(/\.(life|quantity)\s*[-+*/]?=[^=]/);
    expect(text, file).not.toMatch(/\.(life|quantity)\s*[!=<>]=/);
    expect(text, file).not.toMatch(/\.(life|quantity)\s*[<>]/);
  }
});
