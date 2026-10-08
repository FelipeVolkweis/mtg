import { expect, test } from "@playwright/test";
import { unrunForm } from "../../../src/server/rules/ast";
import { checkSupport } from "../../../src/server/rules/support";
import type { PredicateFields } from "../../../src/shared/card-dsl";

// The Mono-G port added constructs to the card DSL (docs/plans/mono-g-port.md),
// then the runtime to run them. Each is accepted by the support check, and
// the forms the runtime still doesn't run are rejected naming the construct
// and its path, so a card using one stays unimplemented instead of running
// with part of its text ignored.

type Ability = Parameters<typeof checkSupport>[0][number];
const spell = (effects: unknown[], extra: object = {}) =>
  ({ id: "spell", kind: "spell", effects, ...extra }) as Ability;
const creatures: PredicateFields = { zone: "battlefield", type: ["Creature"] };
const mana: Extract<Ability, { kind: "mana" }> = {
  id: "mana",
  kind: "mana",
  activation: { costs: [{ kind: "tap-source" }] },
  produce: { quantity: 1, colors: ["G"] },
};

const supported: [string, Ability][] = [
  [
    "a product value in an effect",
    spell([
      {
        kind: "gain-life",
        amount: { product: [4, { count: { all: creatures } }] },
      },
    ]),
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
  ],
  [
    "a keyword predicate in an effect's objects",
    spell([
      {
        kind: "destroy",
        objects: { all: { ...creatures, keyword: "flying" } },
      },
    ]),
  ],
  [
    "a commander predicate in a target filter",
    spell([{ kind: "draw", count: 1 }], {
      targets: [{ id: "t", filter: { zone: "battlefield", commander: true } }],
    }),
  ],
  [
    "an attacking predicate in a value",
    spell([
      {
        kind: "draw",
        count: { count: { all: { ...creatures, attacking: "you" } } },
      },
    ]),
  ],
  [
    "a power and a specific color predicate",
    spell([{ kind: "draw", count: 1 }], {
      targets: [
        {
          id: "t",
          filter: { ...creatures, color: "G", power: { ">=": 4 } },
        },
      ],
    }),
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
  ],
  [
    "an activation restriction on a mana ability",
    {
      ...mana,
      activateOnlyIf: { exists: { all: creatures } },
      produce: { quantity: 2, colors: ["G"] },
    },
  ],
  [
    "an instead mana production",
    {
      ...mana,
      instead: {
        condition: { exists: { all: creatures } },
        produce: { quantity: 2, colors: ["G"] },
      },
    },
  ],
  [
    "a blocks trigger",
    {
      id: "blocks",
      kind: "triggered",
      trigger: { event: "blocks", blocker: { is: "source" } },
      effects: [{ kind: "draw", count: 1 }],
    },
  ],
  [
    "a conditional cant-attack grant",
    {
      id: "grant",
      kind: "static",
      condition: { not: { exists: { all: creatures } } },
      grants: [{ kind: "cant-attack", objects: "source" }],
    },
  ],
  [
    "a max-blockers grant",
    {
      id: "grant",
      kind: "static",
      grants: [{ kind: "max-blockers", objects: "source", count: 1 }],
    },
  ],
  [
    "a block restriction by a predicate",
    {
      id: "grant",
      kind: "static",
      grants: [
        {
          kind: "block-restriction",
          objects: "source",
          by: { power: { "<=": 2 } },
        },
      ],
    },
  ],
  [
    "an additional-land-plays grant",
    {
      id: "grant",
      kind: "static",
      grants: [{ kind: "additional-land-plays", player: "you", count: 1 }],
    },
  ],
  ...(
    [
      { kind: "set-types", types: ["Creature"] },
      { kind: "set-colors", colors: ["G"] },
      { kind: "remove-abilities" },
      { kind: "grant-ability", ability: mana },
    ] as object[]
  ).map((change): [string, Ability] => [
    `a ${(change as { kind: string }).kind} change in a static ability`,
    {
      id: "grant",
      kind: "static",
      grants: [{ kind: "continuous", objects: "source", changes: [change] }],
    } as Ability,
  ]),
  [
    "a double-stats change applied by an effect",
    spell([
      {
        kind: "apply-continuous",
        objects: "source",
        changes: [{ kind: "double-stats", stats: ["power"] }],
        duration: "end-of-turn",
      },
    ]),
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
  ],
  [
    "divided damage among a number of targets",
    spell([{ kind: "damage", amount: 3, to: { target: "t" }, divide: true }], {
      targets: [{ id: "t", count: { min: 0, max: 3 }, filter: creatures }],
    }),
  ],
  ...(
    [
      { kind: "fight", objects: "source", against: "source" },
      { kind: "add-mana", mana: { quantity: 1, colors: ["G"] } },
      { kind: "play", objects: { linked: "hideaway" }, payment: "free" },
      {
        kind: "apply-replacement",
        event: { event: "would-be-dealt-damage", combat: true },
        replace: { kind: "prevent" },
        duration: "end-of-turn",
      },
    ] as object[]
  ).map((effect): [string, Ability] => [
    `the ${(effect as { kind: string }).kind} effect`,
    spell([effect]),
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
  ],
  [
    "a hideaway library sequence",
    spell([
      {
        kind: "library-sequence",
        player: "you",
        operation: "look",
        count: 4,
        select: {
          max: 1,
          to: { zone: "exile", faceDown: true },
          linkAs: "hideaway",
        },
        rest: { to: { zone: "library", position: "bottom" }, order: "random" },
      },
    ]),
  ],
  [
    "the gift keyword and its condition",
    {
      id: "gift",
      kind: "keyword",
      keyword: { name: "gift", gift: "card" },
    },
  ],
  [
    "modes with several target clauses",
    spell([], {
      modes: {
        choose: { min: 1, max: 2 },
        options: [
          {
            id: "a",
            label: "A",
            targets: [{ id: "x", filter: creatures }],
            effects: [{ kind: "destroy", objects: { target: "x" } }],
          },
          { id: "b", label: "B", effects: [{ kind: "draw", count: 1 }] },
        ],
      },
    }),
  ],
];

for (const [name, ability] of supported)
  test(`the runtime supports ${name}`, () => {
    expect(checkSupport([ability])).toEqual({ ok: true });
  });

const rejected: [string, Ability, string, string][] = [
  [
    "a double-stats change in a static ability",
    {
      id: "grant",
      kind: "static",
      grants: [
        {
          kind: "continuous",
          objects: "source",
          changes: [{ kind: "double-stats", stats: ["power"] }],
        },
      ],
    },
    "abilities[0].grants[0]",
    "The double-stats change",
  ],
  [
    "a granted static ability",
    {
      id: "grant",
      kind: "static",
      grants: [
        {
          kind: "continuous",
          objects: "source",
          changes: [
            {
              kind: "grant-ability",
              ability: { id: "inner", kind: "static", grants: [] },
            },
          ],
        },
      ],
    },
    "abilities[0].grants[0]",
    "A granted static ability",
  ],
  [
    "a library selection that links a card put into the Hand",
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
    "a replacement of damage to a recipient",
    spell([
      {
        kind: "apply-replacement",
        event: {
          event: "would-be-dealt-damage",
          recipient: { zone: "battlefield" },
        },
        replace: { kind: "prevent" },
        duration: "end-of-turn",
      },
    ]),
    "abilities[0].effects[0]",
    "A prevent replacement of would-be-dealt-damage",
  ],
  [
    "mana of a color chosen as it is added",
    spell([
      {
        kind: "add-mana",
        mana: { quantity: 1, colors: ["W", "U", "B", "R", "G"] },
      },
    ]),
    "abilities[0].effects[0]",
    "Mana of a color chosen as it is added",
  ],
  [
    "a condition on a static ability that grants no restriction",
    {
      id: "grant",
      kind: "static",
      condition: { exists: { all: creatures } },
      grants: [{ kind: "cast-timing", spells: creatures, as: "flash" }],
    },
    "abilities[0]",
    "A condition on a static ability without continuous changes",
  ],
];

for (const [name, ability, path, what] of rejected)
  test(`the runtime rejects ${name}`, () => {
    expect(checkSupport([ability])).toEqual({
      ok: false,
      errors: [
        { path, message: `${what} is not supported by the current runtime.` },
      ],
    });
  });

test("a keyword ability or a granted keyword is not mistaken for an unsupported predicate", () => {
  const forms = { values: [], fields: ["keyword"] } as const;
  expect(
    unrunForm(
      [
        { id: "flying", kind: "keyword", keyword: "flying" },
        spell([
          {
            kind: "apply-continuous",
            objects: "source",
            changes: [{ kind: "grant-keyword", keyword: "flying" }],
            duration: "end-of-turn",
          },
        ]),
      ],
      "",
      forms,
    ),
  ).toBeUndefined();
});

test("the scan names the first form the evaluator doesn't run, with its path", () => {
  const forms = {
    values: ["total"],
    fields: ["commander"],
  } as const;
  expect(
    unrunForm({ effects: [{ amount: { total: {} } }] }, "", forms),
  ).toEqual({ what: "The total value", path: "effects[0].amount" });
  expect(unrunForm([{ all: { commander: true } }], "", forms)).toEqual({
    what: "The predicate field commander",
    path: "[0].all",
  });
  expect(
    unrunForm({ kind: "keyword", keyword: "commander" }, "", forms),
  ).toBeUndefined();
  expect(
    unrunForm({ sum: [1, { count: "source" }] }, "", forms),
  ).toBeUndefined();
  // The runtime runs every form of the DSL today.
  expect(unrunForm({ total: {}, commander: true })).toBeUndefined();
});
