import { expect, test } from "@playwright/test";
import { unrunForm } from "../../../src/server/rules/ast";
import { checkSupport } from "../../../src/server/rules/support";
import type { PredicateFields } from "../../../src/shared/card-dsl";

// The Mono-G port added constructs the compiler accepts and the runtime
// doesn't run yet (docs/plans/mono-g-port.md). Each must fail the support
// check naming the construct and its path, so a card using one stays
// unimplemented instead of running with part of its text ignored.

type Ability = Parameters<typeof checkSupport>[0][number];
const spell = (effects: unknown[], extra: object = {}) =>
  ({ id: "spell", kind: "spell", effects, ...extra }) as Ability;
const creatures: PredicateFields = { zone: "battlefield", type: ["Creature"] };

const cases: [string, Ability, string, string][] = [
  [
    "a product value in an effect",
    spell([
      {
        kind: "gain-life",
        amount: { product: [4, { count: { all: creatures } }] },
      },
    ]),
    "abilities[0].effects[0].amount",
    "The product value",
  ],
  [
    "a total value in a cost modifier",
    {
      id: "discount",
      kind: "static",
      activeFrom: "stack",
      grants: [
        {
          kind: "cost-modifier",
          applies: "this",
          reduce: { total: { of: { all: creatures }, name: "power" } },
        },
      ],
    },
    "abilities[0].grants[0].reduce",
    "The total value",
  ],
  [
    "an atCast value",
    spell([
      {
        kind: "gain-life",
        amount: {
          atCast: { greatest: { of: { all: creatures }, name: "power" } },
        },
      },
    ]),
    "abilities[0].effects[0].amount",
    "The atCast value",
  ],
  [
    "a keyword predicate in an effect's objects",
    spell([
      {
        kind: "destroy",
        objects: { all: { ...creatures, keyword: "flying" } },
      },
    ]),
    "abilities[0].effects[0].objects.all",
    "The predicate field keyword",
  ],
  [
    "a commander predicate in a target filter",
    spell([{ kind: "draw", count: 1 }], {
      targets: [{ id: "t", filter: { zone: "battlefield", commander: true } }],
    }),
    "abilities[0].targets[0].filter",
    "The predicate field commander",
  ],
  [
    "an attacking predicate in a value",
    spell([
      {
        kind: "draw",
        count: { count: { all: { ...creatures, attacking: "you" } } },
      },
    ]),
    "abilities[0].effects[0].count.count.all",
    "The predicate field attacking",
  ],
  [
    "an activation restriction on an activated ability",
    {
      id: "draw",
      kind: "activated",
      costs: [{ kind: "tap-source" }],
      activateOnlyIf: { exists: { all: creatures } },
      effects: [{ kind: "draw", count: 1 }],
    },
    "abilities[0]",
    "An activation restriction",
  ],
  [
    "an activation restriction on a mana ability",
    {
      id: "mana",
      kind: "mana",
      activation: { costs: [{ kind: "tap-source" }] },
      activateOnlyIf: { exists: { all: creatures } },
      produce: { quantity: 2, colors: ["G"] },
    },
    "abilities[0]",
    "An activation restriction",
  ],
  [
    "an instead mana production",
    {
      id: "mana",
      kind: "mana",
      activation: { costs: [{ kind: "tap-source" }] },
      produce: { quantity: 1, colors: ["G"] },
      instead: {
        condition: { exists: { all: creatures } },
        produce: { quantity: 2, colors: ["G"] },
      },
    },
    "abilities[0]",
    "An instead mana production",
  ],
  [
    "a blocks trigger",
    {
      id: "blocks",
      kind: "triggered",
      trigger: { event: "blocks", blocker: { is: "source" } },
      effects: [{ kind: "draw", count: 1 }],
    },
    "abilities[0].trigger",
    "The blocks trigger",
  ],
  [
    "a cant-attack grant",
    {
      id: "grant",
      kind: "static",
      grants: [{ kind: "cant-attack", objects: "source" }],
    },
    "abilities[0].grants[0]",
    "The cant-attack grant",
  ],
  [
    "a max-blockers grant",
    {
      id: "grant",
      kind: "static",
      grants: [{ kind: "max-blockers", objects: "source", count: 1 }],
    },
    "abilities[0].grants[0]",
    "The max-blockers grant",
  ],
  [
    "an additional-land-plays grant",
    {
      id: "grant",
      kind: "static",
      grants: [{ kind: "additional-land-plays", player: "you", count: 1 }],
    },
    "abilities[0].grants[0]",
    "The additional-land-plays grant",
  ],
  ...(
    [
      ["set-types", { kind: "set-types", types: ["Creature"] }],
      ["set-colors", { kind: "set-colors", colors: ["G"] }],
      ["remove-abilities", { kind: "remove-abilities" }],
      ["double-stats", { kind: "double-stats", stats: ["power"] }],
      [
        "grant-ability",
        {
          kind: "grant-ability",
          ability: {
            id: "mana",
            kind: "mana",
            activation: { costs: [{ kind: "tap-source" }] },
            produce: { quantity: 1, colors: ["G"] },
          },
        },
      ],
    ] as [string, object][]
  ).map(([name, change]): [string, Ability, string, string] => [
    `a ${name} change in a static ability`,
    {
      id: "grant",
      kind: "static",
      grants: [{ kind: "continuous", objects: "source", changes: [change] }],
    } as Ability,
    "abilities[0].grants[0]",
    `The ${name} change`,
  ]),
  ...(
    [
      ["set-types", { kind: "set-types", types: ["Creature"] }],
      ["double-stats", { kind: "double-stats", stats: ["power"] }],
    ] as [string, object][]
  ).map(([name, change]): [string, Ability, string, string] => [
    `a ${name} change applied by an effect`,
    spell([
      {
        kind: "apply-continuous",
        objects: "source",
        changes: [change],
        duration: "end-of-turn",
      },
    ]),
    "abilities[0].effects[0]",
    `The ${name} change`,
  ]),
  [
    "divided damage",
    spell([{ kind: "damage", amount: 3, to: { target: "t" }, divide: true }], {
      targets: [{ id: "t", count: { min: 0, max: 3 }, filter: creatures }],
    }),
    "abilities[0]",
    "A target clause with a count",
  ],
  [
    "excess damage",
    spell(
      [
        {
          kind: "damage",
          amount: 3,
          to: { target: "t" },
          excessTo: { controllerOf: { target: "t" } },
        },
      ],
      { targets: [{ id: "t", filter: creatures }] },
    ),
    "abilities[0].effects[0]",
    "Excess damage dealt elsewhere",
  ],
  ...(
    [
      ["fight", { kind: "fight", objects: "source", against: "source" }],
      ["add-mana", { kind: "add-mana", mana: { quantity: 1, colors: ["G"] } }],
      ["play", { kind: "play", objects: "source", payment: "free" }],
      [
        "apply-replacement",
        {
          kind: "apply-replacement",
          event: { event: "would-be-dealt-damage" },
          replace: { kind: "prevent" },
          duration: "end-of-turn",
        },
      ],
    ] as [string, object][]
  ).map(([name, effect]): [string, Ability, string, string] => [
    `the ${name} effect`,
    spell([effect]),
    "abilities[0].effects[0]",
    `The ${name} effect`,
  ]),
  [
    "a library sequence that stops at a matching card",
    spell([
      {
        kind: "library-sequence",
        player: "you",
        operation: "reveal",
        count: { until: { type: ["Land"] } },
        select: { max: 1, to: { zone: "battlefield", tapped: true } },
        rest: { to: { zone: "library", position: "bottom" }, order: "random" },
      },
    ]),
    "abilities[0].effects[0]",
    "This library sequence",
  ],
  [
    "a library selection that links its card",
    spell([
      {
        kind: "library-sequence",
        player: "you",
        operation: "look",
        count: 1,
        select: {
          filter: { type: ["Land"] },
          max: 1,
          to: "hand",
          linkAs: "kept",
        },
        rest: { to: { zone: "library", position: "bottom" }, order: "random" },
      },
    ]),
    "abilities[0].effects[0]",
    "This library sequence",
  ],
  [
    "the gift keyword",
    {
      id: "gift",
      kind: "keyword",
      keyword: { name: "gift", gift: "card" },
    },
    "abilities[0]",
    "The gift keyword",
  ],
];

for (const [name, ability, path, what] of cases)
  test(`the runtime rejects ${name}`, () => {
    expect(checkSupport([ability])).toEqual({
      ok: false,
      errors: [
        { path, message: `${what} is not supported by the current runtime.` },
      ],
    });
  });

test("a keyword ability or a granted keyword is not mistaken for an unsupported predicate", () => {
  expect(
    checkSupport([
      { id: "flying", kind: "keyword", keyword: "flying" },
      spell([
        {
          kind: "apply-continuous",
          objects: "source",
          changes: [{ kind: "grant-keyword", keyword: "flying" }],
          duration: "end-of-turn",
        },
      ]),
    ] as Ability[]),
  ).toEqual({ ok: true });
});

test("the scan names the first unsupported value or predicate field with its path", () => {
  expect(unrunForm({ effects: [{ amount: { total: {} } }] })).toEqual({
    what: "The total value",
    path: "effects[0].amount",
  });
  expect(unrunForm([{ all: { commander: true } }])).toEqual({
    what: "The predicate field commander",
    path: "[0].all",
  });
  expect(unrunForm({ kind: "keyword", keyword: "flying" })).toBeUndefined();
  expect(unrunForm({ id: "x", keyword: "flying" })).toBeUndefined();
  expect(unrunForm({ sum: [1, { count: "source" }] })).toBeUndefined();
});
