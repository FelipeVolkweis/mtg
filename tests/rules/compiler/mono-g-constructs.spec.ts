import { expect, test } from "@playwright/test";
import {
  compileCard,
  type CoreAbility,
} from "../../../src/server/rules/compiler";
import {
  counterKinds,
  type Registries,
} from "../../../src/server/rules/registries";
import {
  conditionSchema,
  effectSchema,
  type StaticGrant,
} from "../../../src/shared/card-dsl";

// The DSL constructs the Mono-G port added (docs/plans/mono-g-port.md): what
// the compiler resolves, normalizes and rejects for each. Compiler tests
// construct no Match (rules test plan §17).
const token = (id: string, name: string) => ({
  id,
  characteristics: {
    name,
    colors: ["G" as const],
    supertypes: [],
    types: ["Creature"],
    subtypes: [name],
    keywords: [],
    rulesText: "",
  },
  abilities: [],
});
const registries: Registries = {
  tokens: {
    "spider-1-2-green-reach": token("spider-1-2-green-reach", "Spider"),
  },
  counters: counterKinds,
};

function compile(abilities: unknown[], manaCost = "{2}{G}") {
  return compileCard(
    { components: [{ name: "Test Card", manaCost }], abilities },
    registries,
  );
}
function compiled(abilities: unknown[], manaCost?: string): CoreAbility[] {
  const result = compile(abilities, manaCost);
  if (!result.ok) throw new Error(JSON.stringify(result.errors, null, 2));
  return result.abilities;
}
function errors(abilities: unknown[], manaCost?: string) {
  const result = compile(abilities, manaCost);
  return result.ok ? [] : result.errors.map((e) => e.message);
}
const spell = (effects: unknown[], extra: object = {}) => ({
  id: "spell",
  kind: "spell",
  effects,
  ...extra,
});
const triggered = (
  effects: unknown[],
  trigger: object,
  extra: object = {},
) => ({
  id: "trigger",
  kind: "triggered",
  trigger,
  effects,
  ...extra,
});

// ------------------------------------------------------------ layer tagging

test("the new continuous changes are tagged with their CR 613 layers", () => {
  const [ability] = compiled([
    {
      id: "elk",
      kind: "static",
      grants: [
        {
          kind: "continuous",
          objects: { all: { type: "Creature", is: { attachedTo: "source" } } },
          changes: [
            { kind: "set-types", types: ["Creature"], subtypes: ["Elk"] },
            { kind: "set-colors", colors: ["G"] },
            { kind: "remove-abilities" },
            { kind: "double-stats", stats: ["power", "toughness"] },
          ],
        },
      ],
    },
  ]);
  const grant = (ability as { grants: StaticGrant[] }).grants[0];
  expect(
    grant.kind === "continuous" ? grant.changes.map((c) => c.layer) : [],
  ).toEqual([["4"], ["5"], ["6"], ["7c"]]);
});

test("a granted ability is compiled as a granted ability, and a granted keyword is refused", () => {
  const [ability] = compiled([
    {
      id: "counter-mana",
      kind: "static",
      grants: [
        {
          kind: "continuous",
          objects: {
            all: {
              type: "Creature",
              controller: "you",
              counters: { count: 1 },
            },
          },
          changes: [
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
        },
      ],
    },
  ]);
  const grant = (ability as { grants: StaticGrant[] }).grants[0];
  const change = grant.kind === "continuous" ? grant.changes[0] : undefined;
  expect(change).toMatchObject({
    kind: "grant-ability",
    layer: ["6"],
    ability: { id: "mana", origin: "granted", kind: "mana" },
  });
  expect(
    errors([
      {
        id: "bad",
        kind: "static",
        grants: [
          {
            kind: "continuous",
            objects: "source",
            changes: [
              {
                kind: "grant-ability",
                ability: { id: "flying", kind: "keyword", keyword: "flying" },
              },
            ],
          },
        ],
      },
    ]),
  ).toContain("A granted ability must be one ability, not a keyword.");
});

test("errors inside a granted ability carry the granting ability's path", () => {
  const result = compile([
    {
      id: "bad",
      kind: "static",
      grants: [
        {
          kind: "continuous",
          objects: "source",
          changes: [
            {
              kind: "grant-ability",
              ability: {
                id: "grow",
                kind: "activated",
                costs: [{ kind: "tap-source" }],
                effects: [
                  {
                    kind: "add-counters",
                    objects: "source",
                    counter: "nonsense",
                    count: 1,
                  },
                ],
              },
            },
          ],
        },
      ],
    },
  ]);
  expect(result.ok ? [] : result.errors).toEqual([
    {
      path: "abilities[0].grants[0].changes[0].effects[0].counter",
      message: 'Unknown counter kind "nonsense".',
    },
  ]);
});

// ------------------------------------------------------------------ values

test("total and product resolve their selectors and operands", () => {
  const [ability] = compiled([
    triggered(
      [
        {
          kind: "gain-life",
          amount: {
            product: [
              4,
              { count: { all: { type: "Creature", power: { ">=": 4 } } } },
            ],
          },
        },
      ],
      { event: "step", step: "begin-combat", player: "you" },
      {
        interveningIf: {
          compare: [
            { total: { of: { all: { type: "Creature" } }, name: "power" } },
            ">=",
            8,
          ],
        },
      },
    ),
  ]);
  expect(ability).toMatchObject({
    interveningIf: {
      compare: [{ total: { name: "power" } }, ">=", 8],
    },
    effects: [
      {
        amount: {
          product: [4, { count: { all: { power: { ">=": 4 } } } }],
        },
      },
    ],
  });
  expect(
    errors([
      spell([
        { kind: "gain-life", amount: { product: [{ binding: "missing" }, 2] } },
      ]),
    ]),
  ).toContain('Unknown binding "missing".');
});

test("atCast needs a spell ability: only a spell is cast (CR 601.2)", () => {
  const greatest = {
    atCast: { greatest: { of: { all: { type: "Creature" } }, name: "power" } },
  };
  expect(errors([spell([{ kind: "gain-life", amount: greatest }])])).toEqual(
    [],
  );
  expect(
    errors([
      triggered([{ kind: "gain-life", amount: greatest }], {
        event: "step",
        step: "upkeep",
      }),
    ]),
  ).toContain("atCast needs a spell ability: only a spell is cast (CR 601.2).");
  expect(
    errors([
      {
        id: "activated",
        kind: "activated",
        costs: [{ kind: "tap-source" }],
        effects: [{ kind: "gain-life", amount: greatest }],
      },
    ]),
  ).toContain("atCast needs a spell ability: only a spell is cast (CR 601.2).");
});

// -------------------------------------------------------------- predicates

test("attacking names a player, and counters without a kind count any counter", () => {
  const [ability] = compiled([
    spell([
      {
        kind: "create-token",
        token: "spider-1-2-green-reach",
        count: {
          count: { all: { type: "Creature", attacking: "you" } },
        },
      },
      {
        kind: "add-counters",
        objects: {
          all: { type: "Creature", counters: { count: { ">=": 1 } } },
        },
        counter: "+1/+1",
        count: 1,
      },
    ]),
  ]);
  expect(ability).toMatchObject({
    effects: [
      { count: { count: { all: { attacking: "you" } } } },
      { objects: { all: { counters: { count: { ">=": 1 } } } } },
    ],
  });
  expect(
    errors([
      spell([
        {
          kind: "draw",
          count: { count: { all: { attacking: { target: "missing" } } } },
        },
      ]),
    ]),
  ).toContain('Unknown target "missing".');
  expect(
    errors([
      spell([
        {
          kind: "draw",
          count: {
            count: { all: { counters: { kind: "nonsense", count: 1 } } },
          },
        },
      ]),
    ]),
  ).toContain('Unknown counter kind "nonsense".');
});

test("the stun counter is a registered counter kind", () => {
  expect(
    errors([
      triggered(
        [
          {
            kind: "add-counters",
            objects: "source",
            counter: "stun",
            count: 1,
          },
        ],
        { event: "attacks", attacker: "source" },
      ),
    ]),
  ).toEqual([]);
});

// ----------------------------------------------------------------- effects

test("divided damage needs a target clause that can choose more than one target", () => {
  const divided = (count: unknown) =>
    spell(
      [
        {
          kind: "damage",
          amount: 5,
          to: { target: "creatures" },
          divide: true,
        },
      ],
      {
        targets: [
          {
            id: "creatures",
            ...(count === undefined ? {} : { count }),
            filter: { type: "Creature" },
          },
        ],
      },
    );
  expect(errors([divided({ min: 0, max: 100 })])).toEqual([]);
  expect(errors([divided(3)])).toEqual([]);
  const message =
    "Divided damage needs a target clause that can choose more than one target.";
  expect(errors([divided(undefined)])).toContain(message);
  expect(errors([divided(1)])).toContain(message);
  expect(
    errors([
      spell([{ kind: "damage", amount: 5, to: "opponents", divide: true }]),
    ]),
  ).toContain(message);
});

test("excess damage is dealt to a resolved recipient", () => {
  const [ability] = compiled([
    spell(
      [
        {
          kind: "damage",
          amount: { stat: { of: { target: "rammer" }, name: "power" } },
          to: { target: "victim" },
          source: { target: "rammer" },
          excessTo: { controllerOf: { target: "victim" } },
        },
      ],
      {
        targets: [
          { id: "rammer", filter: { type: "Creature", controller: "you" } },
          { id: "victim", filter: { type: "Creature" } },
        ],
      },
    ),
  ]);
  expect(ability).toMatchObject({
    effects: [{ excessTo: { controllerOf: { target: "victim" } } }],
  });
  expect(
    errors([
      spell([
        {
          kind: "damage",
          amount: 1,
          to: "opponents",
          excessTo: { controllerOf: { target: "missing" } },
        },
      ]),
    ]),
  ).toContain('Unknown target "missing".');
});

test("fight, add-mana and play resolve their selectors and players", () => {
  const [ability] = compiled([
    spell([
      {
        kind: "create-token",
        token: "spider-1-2-green-reach",
        bind: "spiders",
      },
      {
        kind: "fight",
        objects: { binding: "spiders" },
        against: { all: { type: "Creature", controller: "opponents" } },
        pairing: "distinct",
      },
      {
        kind: "add-mana",
        mana: { quantity: 1, colors: { commanderColors: "you" } },
      },
      {
        kind: "play",
        objects: { choose: { count: 1, from: { zone: "hand" } } },
        payment: "free",
      },
    ]),
  ]);
  expect(ability).toMatchObject({
    effects: [
      {},
      { kind: "fight", objects: { binding: "spiders" } },
      { kind: "add-mana", mana: { colors: { commanderColors: "you" } } },
      { kind: "play", payment: "free" },
    ],
  });
  expect(
    errors([
      spell([
        { kind: "fight", objects: { binding: "nobody" }, against: "source" },
      ]),
    ]),
  ).toContain('Unknown binding "nobody".');
  expect(
    errors([
      spell([
        { kind: "play", objects: { linked: "missing" }, payment: "free" },
      ]),
    ]),
  ).toContain('No exile on this card links "missing".');
});

test("a temporary replacement effect resolves its event and its own event selectors", () => {
  const [ability] = compiled([
    spell([
      {
        kind: "apply-replacement",
        event: {
          event: "would-be-dealt-damage",
          combat: true,
          source: { not: { subtype: "Spider" } },
        },
        replace: { kind: "prevent" },
        duration: "end-of-turn",
      },
      {
        kind: "apply-replacement",
        event: { event: "would-be-dealt-damage", recipient: "source" },
        replace: {
          kind: "instead",
          effects: [{ kind: "draw", player: { event: "player" }, count: 1 }],
        },
        duration: "end-of-turn",
      },
    ]),
  ]);
  expect(ability).toMatchObject({
    effects: [
      {
        event: {
          combat: true,
          source: { not: { subtype: "Spider" } },
        },
      },
      { event: { recipient: { is: "source" } } },
    ],
  });
});

test("a library sequence stops at a matching card, and its selection can be linked", () => {
  const [reveal, hideaway] = compiled([
    triggered(
      [
        {
          kind: "library-sequence",
          player: "you",
          operation: "reveal",
          count: { until: { type: "Land" } },
          select: { max: 1, to: { zone: "battlefield", tapped: true } },
          rest: {
            to: { zone: "library", position: "bottom" },
            order: "random",
          },
        },
      ],
      { event: "enters", object: "source" },
    ),
    {
      id: "hideaway",
      kind: "triggered",
      trigger: { event: "enters", object: "source" },
      effects: [
        {
          kind: "library-sequence",
          player: "you",
          operation: "look",
          count: 4,
          select: {
            max: 1,
            to: { zone: "exile", faceDown: true },
            linkAs: "hidden",
          },
          rest: {
            to: { zone: "library", position: "bottom" },
            order: "random",
          },
        },
      ],
    },
    {
      id: "play-hidden",
      kind: "activated",
      costs: [{ kind: "tap-source" }],
      effects: [
        { kind: "play", objects: { linked: "hidden" }, payment: "free" },
      ],
    },
  ]);
  expect(reveal).toMatchObject({
    effects: [{ count: { until: { type: "Land" } } }],
  });
  expect(hideaway).toMatchObject({
    effects: [{ select: { to: { zone: "exile", faceDown: true } } }],
  });
});

// ------------------------------------------------------ abilities and grants

test("a blocks trigger is a zone-independent predicate on the blocker", () => {
  const [ability] = compiled([
    triggered([{ kind: "draw", count: 1 }], {
      event: "blocks",
      blocker: "source",
    }),
  ]);
  expect(ability).toMatchObject({
    trigger: { event: "blocks", blocker: { is: "source" } },
  });
});

test("the new rule-modifying grants resolve their objects and values", () => {
  const grants = (extra: unknown[]) => [
    {
      id: "rules",
      kind: "static",
      grants: [
        { kind: "cant-attack", objects: "source" },
        {
          kind: "max-blockers",
          objects: { all: { type: "Creature", power: { ">=": 4 } } },
          count: 1,
        },
        ...extra,
      ],
    },
  ];
  const [ability] = compiled(
    grants([
      {
        kind: "additional-land-plays",
        player: "you",
        count: { count: { all: { type: "Land" } } },
      },
    ]),
  );
  expect(ability).toMatchObject({
    grants: [
      { kind: "cant-attack", objects: "source" },
      {
        kind: "max-blockers",
        objects: { all: { power: { ">=": 4 } } },
        count: 1,
      },
      { kind: "additional-land-plays", player: "you" },
    ],
  });
  expect(
    errors(
      grants([
        {
          kind: "additional-land-plays",
          player: "you",
          count: { binding: "missing" },
        },
      ]),
    ),
  ).toContain('Unknown binding "missing".');
});

test("activation restrictions and instead productions are compiled conditions", () => {
  const [activated, mana] = compiled([
    {
      id: "draw",
      kind: "activated",
      costs: [{ kind: "tap-source" }],
      activateOnlyIf: { exists: { all: { type: "Creature", power: 4 } } },
      effects: [{ kind: "draw", count: 1 }],
    },
    {
      id: "mana",
      kind: "mana",
      activation: { costs: [{ kind: "tap-source" }] },
      activateOnlyIf: { exists: { all: { type: "Creature" } } },
      produce: { quantity: 1, colors: ["G"] },
      instead: {
        condition: { exists: { all: { type: "Creature", power: 4 } } },
        produce: { quantity: 2, colors: { commanderColors: "you" } },
      },
    },
  ]);
  expect(activated).toMatchObject({
    activateOnlyIf: { exists: { all: { power: { "=": 4 } } } },
  });
  expect(mana).toMatchObject({
    activateOnlyIf: { exists: { all: { type: "Creature" } } },
    instead: {
      condition: { exists: { all: { power: { "=": 4 } } } },
      produce: { quantity: 2, colors: { commanderColors: "you" } },
    },
  });
  expect(
    errors([
      {
        id: "draw",
        kind: "activated",
        costs: [{ kind: "tap-source" }],
        activateOnlyIf: { didPerform: "never" },
        effects: [{ kind: "draw", count: 1 }],
      },
    ]),
  ).toContain('Unknown binding "never".');
});

test("gift is an optional cost the promise condition reads, and its gift must exist", () => {
  const gift = (name: string) => ({
    id: "gift",
    kind: "keyword",
    keyword: { name: "gift", gift: name },
  });
  const promised = triggered(
    [{ kind: "draw", count: 1 }],
    { event: "enters", object: "source" },
    { interveningIf: { paid: "gift" } },
  );
  expect(errors([gift("card"), promised])).toEqual([]);
  expect(errors([promised])).toContain('No optional cost "gift" on this card.');
  expect(errors([gift("fish"), promised])).toContain('Unknown gift "fish".');
});

// ------------------------------------------------------------------ schema

test("the schema keeps the new constructs' fields independent", () => {
  for (const sample of [
    {
      kind: "fight",
      objects: "source",
      against: "source",
      pairing: "together",
    },
    { kind: "play", objects: "source", payment: "alternative" },
    { kind: "play", objects: "source" },
    {
      kind: "damage",
      amount: 1,
      to: "opponents",
      divide: false,
    },
    {
      kind: "library-sequence",
      player: "you",
      count: { until: {}, extra: 1 },
      operation: "reveal",
      rest: { to: "library", order: "random" },
    },
  ])
    expect(effectSchema.safeParse(sample).success, JSON.stringify(sample)).toBe(
      false,
    );
  expect(
    conditionSchema.safeParse({ exists: { all: { commander: true } } }).success,
  ).toBe(true);
  expect(
    conditionSchema.safeParse({ exists: { all: { commander: false } } })
      .success,
  ).toBe(false);
});
