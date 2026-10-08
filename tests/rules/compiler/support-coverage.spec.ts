import { expect, test } from "@playwright/test";
import type { z } from "zod";
import {
  grantRegistry,
  grantSupport,
  keywordSupport,
  macroKeywordRegistry,
  replacementRegistry,
  replacementSupport,
  runtimeKeyword,
} from "../../../src/server/rules/abilities";
import {
  costRegistry,
  costSupport,
} from "../../../src/server/rules/costs/handlers";
import type {
  Registry,
  SupportCheck,
} from "../../../src/server/rules/support-check";
import {
  triggerRegistry,
  triggerSupport,
} from "../../../src/server/rules/triggers/trigger-runtime";
import {
  effectRegistry,
  unsupportedEffect,
} from "../../../src/server/rules/vm/effects/registry";
import {
  costSchema,
  effectSchema,
  keywordSchema,
  manaTriggerSchema,
  replacementSchema,
  ruleKeywords,
  staticGrantSchema,
  triggerSchema,
} from "../../../src/shared/card-dsl";

// Runtime support coverage (quality roadmap Q6): every Core kind either has
// a registry entry holding both its runtime code and its support declaration,
// or is rejected by the support check. The registries are the only list of
// what runs; support.ts walks an ability and asks them.

type Schema = z.ZodType;
const def = (schema: Schema) =>
  (schema as unknown as { _zod: { def: Record<string, unknown> } })._zod.def;

/** The values a schema's discriminating `field` takes, across its union members. */
function kinds(schema: Schema, field: string): string[] {
  const d = def(schema);
  if (d.type === "lazy") return kinds((d.getter as () => Schema)(), field);
  if (d.type === "union")
    return (d.options as Schema[]).flatMap((o) => kinds(o, field));
  if (d.type === "object") {
    const member = (d.shape as Record<string, Schema>)[field];
    return member ? literals(member) : [];
  }
  return [];
}
function literals(schema: Schema): string[] {
  const d = def(schema);
  if (d.type === "literal") return d.values as string[];
  if (d.type === "enum")
    return Object.values(d.entries as Record<string, string>);
  throw new Error(`Not a literal or enum: ${String(d.type)}`);
}

class Rejected extends Error {}
/** A support check that records nothing and rejects by throwing. */
const check: SupportCheck = {
  unsupported(what) {
    throw new Rejected(what);
  },
  at: (_field, run) => run(),
  filter() {},
  condition() {},
  value() {},
  objects() {},
  keyword() {},
  costs() {},
};
const rejection = (run: () => void) => {
  try {
    run();
  } catch (error) {
    if (error instanceof Rejected) return error.message;
    throw error;
  }
  return undefined;
};

interface Construct {
  name: string;
  coreKinds: string[];
  registry: Registry;
  /** The member holding the entry's runtime code. */
  runtime: string;
  /** Whether every entry must declare `support` (effects may omit it). */
  supportRequired: boolean;
  /** The support check's answer for a kind with no entry. */
  rejectUnknown: (kind: string) => string | undefined;
  /** What the support check says of a kind with no entry. */
  unknown: (kind: string) => string;
}

const constructs: Construct[] = [
  {
    name: "effect",
    coreKinds: kinds(effectSchema, "kind"),
    registry: effectRegistry,
    runtime: "execute",
    supportRequired: false,
    rejectUnknown: (kind) => unsupportedEffect({ kind } as never),
    unknown: (kind) => `The ${kind} effect`,
  },
  {
    name: "trigger",
    coreKinds: [
      ...kinds(triggerSchema, "event"),
      ...kinds(manaTriggerSchema, "event"),
    ],
    registry: triggerRegistry,
    runtime: "matches",
    supportRequired: true,
    rejectUnknown: (event) =>
      rejection(() => triggerSupport({ event } as never, check)),
    unknown: (event) => `The ${event} trigger`,
  },
  {
    name: "cost",
    coreKinds: kinds(costSchema, "kind"),
    registry: costRegistry,
    runtime: "plan",
    supportRequired: true,
    rejectUnknown: (kind) =>
      rejection(() => costSupport({ kind } as never, check)),
    unknown: (kind) => `The ${kind} cost`,
  },
  {
    name: "static grant",
    coreKinds: kinds(staticGrantSchema, "kind"),
    registry: grantRegistry,
    runtime: "reader",
    supportRequired: true,
    rejectUnknown: (kind) =>
      rejection(() => grantSupport({ kind } as never, check)),
    unknown: (kind) => `The ${kind} grant`,
  },
  {
    name: "replacement",
    coreKinds: kinds(replacementSchema, "kind"),
    registry: replacementRegistry,
    runtime: "reader",
    supportRequired: true,
    rejectUnknown: (kind) =>
      rejection(() =>
        replacementSupport(
          {
            id: "r",
            kind: "replacement",
            event: { event: "would-draw", player: "you" },
            replace: { kind } as never,
          },
          check,
        ),
      ),
    unknown: (kind) => `A ${kind} replacement of would-draw`,
  },
  {
    name: "keyword",
    coreKinds: kinds(keywordSchema, "name"),
    registry: macroKeywordRegistry,
    runtime: "reader",
    supportRequired: true,
    rejectUnknown: (name) =>
      rejection(() => keywordSupport({ name } as never, check)),
    unknown: (name) => `The ${name} keyword`,
  },
];

for (const construct of constructs)
  test(`every Core ${construct.name} kind has runtime code and a support declaration, or neither`, () => {
    expect(construct.coreKinds.length).toBeGreaterThan(0);
    const core = new Set(construct.coreKinds);
    for (const [kind, entry] of Object.entries(construct.registry)) {
      // A declaration for a kind the Core AST never holds is dead code.
      expect(core.has(kind), `${kind} is a Core ${construct.name} kind`).toBe(
        true,
      );
      const members = entry as Record<string, unknown>;
      expect(typeof members[construct.runtime], `${kind} runtime code`).toBe(
        "function",
      );
      const declaration = construct.supportRequired
        ? members.support
        : (members.unsupported ?? (() => undefined));
      expect(typeof declaration, `${kind} support declaration`).toBe(
        "function",
      );
    }
    for (const kind of core)
      if (!construct.registry[kind])
        expect(construct.rejectUnknown(kind), kind).toBe(
          construct.unknown(kind),
        );
  });

test("a rule keyword is supported exactly when the runtime has it", () => {
  for (const keyword of ruleKeywords)
    expect(rejection(() => keywordSupport(keyword, realKeywords))).toBe(
      runtimeKeyword(keyword) ? undefined : `The ${keyword} keyword`,
    );
});
const realKeywords: SupportCheck = {
  ...check,
  keyword(keyword) {
    if (!runtimeKeyword(keyword)) check.unsupported(`The ${keyword} keyword`);
  },
};

test("the registries run these kinds", () => {
  const handled = (registry: Registry) => Object.keys(registry).sort();
  expect(handled(triggerRegistry)).toEqual([
    "attacks",
    "becomes-target",
    "blocks",
    "cast",
    "deals-damage",
    "dies",
    "draws",
    "enters",
    "state",
    "step",
    "tapped-for-mana",
    "zone-change",
  ]);
  expect(handled(costRegistry)).toEqual(kinds(costSchema, "kind").sort());
  expect(handled(grantRegistry)).toEqual([
    "additional-land-plays",
    "attack-requirement",
    "attack-tax",
    "block-restriction",
    "cant-attack",
    "cant-be-countered",
    "cant-block",
    "cast-timing",
    "continuous",
    "cost-modifier",
    "max-blockers",
    "maximum-hand-size",
    "untap-restriction",
  ]);
  expect(handled(replacementRegistry)).toEqual(["enter-tapped"]);
  expect(handled(macroKeywordRegistry)).toEqual([
    "enchant",
    "escalate",
    "gift",
    "improvise",
  ]);
});
