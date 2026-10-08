import { expect, test } from "@playwright/test";
import { MatchService } from "../src/server/match/match.service";
import type { MatchState } from "../src/shared/rules-state";
import type { Participant } from "../src/shared/model";
import { assertJsonSafe, roundTripEnabled } from "./support/round-trip";

test("JSON-safe Match state passes the persistence check", () => {
  expect(() =>
    assertJsonSafe({ a: [1, "x", true, null, { b: undefined }] }),
  ).not.toThrow();
});

for (const [name, value, message] of [
  ["a Map", { zones: new Map() }, "match.zones is a Map"],
  ["a Set", { ids: [new Set()] }, "match.ids[0] is a Set"],
  ["a Date", { at: new Date() }, "match.at is a Date"],
  ["a BigInt", { life: 40n }, "match.life is a bigint"],
  ["a function", { run: () => 0 }, "match.run is a function"],
  [
    "a non-finite number",
    { x: Number.POSITIVE_INFINITY },
    "match.x is Infinity",
  ],
  [
    "an undefined array item",
    { ids: [undefined] },
    "match.ids[0] is undefined",
  ],
] as [string, unknown, string][])
  test(`the persistence check rejects ${name}`, () => {
    expect(() => assertJsonSafe(value)).toThrow(message);
  });

test("round-trip mode reloads the Match around every command", () => {
  test.skip(!roundTripEnabled, "Runs only with ROUND_TRIP=1.");
  const players: MatchState["players"] = [];
  const match = { players, rules: {} } as unknown as MatchState;
  const result = new MatchService().execute(
    match,
    { id: "someone" } as Participant,
    { type: "pass-priority" },
    { definitions: {}, printings: {}, names: {}, importedSets: [] },
  );
  expect(result.kind).toBe("rejected");
  expect(match.players).toEqual([]);
  expect(match.players).not.toBe(players);
});

test("round-trip mode rejects state that would not survive persistence", () => {
  test.skip(!roundTripEnabled, "Runs only with ROUND_TRIP=1.");
  const match = { seen: new Set() } as unknown as MatchState;
  expect(() =>
    new MatchService().execute(
      match,
      { id: "someone" } as Participant,
      { type: "pass-priority" },
      { definitions: {}, printings: {}, names: {}, importedSets: [] },
    ),
  ).toThrow("match.seen is a Set");
});
