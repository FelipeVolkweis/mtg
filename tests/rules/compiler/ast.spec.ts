import { expect, test } from "@playwright/test";
import {
  astEqual,
  isAttachedToSource,
  isEventReference,
  isSourcePredicate,
  isSourceSelector,
  mentionsVariable,
} from "../../../src/server/rules/ast";
import { choosesX } from "../../../src/server/rules/abilities";

// Structural reads over Core AST nodes (quality roadmap Q6): meanings such
// as "the source" are recognized by structure, never by serialized text.

test("AST nodes compare by structure, not key order", () => {
  expect(
    astEqual(
      { zone: "library", position: "bottom" },
      { position: "bottom", zone: "library" },
    ),
  ).toBe(true);
  expect(astEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
  expect(astEqual({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
  expect(astEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  expect(astEqual({ a: 1 }, { b: 1 })).toBe(false);
  expect(astEqual([1], { 0: 1 })).toBe(false);
  expect(astEqual("source", "source")).toBe(true);
  expect(astEqual(1, "1")).toBe(false);
  expect(astEqual(null, {})).toBe(false);
});

test("a key holding undefined is absent, as it is once stored as JSON", () => {
  expect(astEqual({ is: "source", zone: undefined }, { is: "source" })).toBe(
    true,
  );
  expect(astEqual({ is: undefined }, {})).toBe(true);
});

test("the source is recognized as a selector or a predicate", () => {
  expect(isSourceSelector("source")).toBe(true);
  expect(isSourceSelector({ is: "source" })).toBe(true);
  expect(isSourceSelector({ is: "source", zone: "battlefield" })).toBe(false);
  expect(isSourceSelector({ all: { zone: "battlefield" } })).toBe(false);
  expect(isSourceSelector(undefined)).toBe(false);
  expect(isSourcePredicate({ is: "source" })).toBe(true);
  expect(isSourcePredicate("source")).toBe(false);
  expect(isAttachedToSource({ attachedTo: "source" })).toBe(true);
  expect(isAttachedToSource({ attachedTo: "target" })).toBe(false);
  expect(isEventReference({ event: "player" }, "player")).toBe(true);
  expect(isEventReference({ event: "player" }, "source")).toBe(false);
});

test("a variable is found anywhere in a node, and only as a variable", () => {
  expect(mentionsVariable({ variable: "X" }, "X")).toBe(true);
  expect(
    mentionsVariable(
      [undefined, [{ kind: "draw", count: { sum: [1, { variable: "X" }] } }]],
      "X",
    ),
  ).toBe(true);
  expect(mentionsVariable({ variable: "Y" }, "X")).toBe(false);
  expect(mentionsVariable({ name: "X", note: '{"variable":"X"}' }, "X")).toBe(
    false,
  );
  expect(mentionsVariable("X", "X")).toBe(false);
});

test("an ability chooses X when it reads X or costs {X}", () => {
  expect(
    choosesX({
      id: "sum",
      kind: "spell",
      effects: [{ kind: "draw", count: { variable: "X" } }],
    }),
  ).toBe(true);
  expect(
    choosesX({
      id: "pump",
      kind: "activated",
      costs: [{ kind: "mana", symbols: ["{X}"] }],
      effects: [],
    }),
  ).toBe(true);
  expect(
    choosesX({
      id: "draw",
      kind: "spell",
      effects: [{ kind: "draw", count: 1 }],
    }),
  ).toBe(false);
  expect(
    choosesX({
      id: "copy",
      kind: "triggered",
      trigger: { event: "draws", player: "you" },
      effects: [{ kind: "draw", count: { variable: "X" } }],
    }),
  ).toBe(false);
});
