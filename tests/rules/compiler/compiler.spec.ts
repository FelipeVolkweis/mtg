import { expect, test } from "@playwright/test";
import {
  compileCard,
  type CoreAbility,
} from "../../../src/server/rules/compiler";
import {
  counterKinds,
  type Registries,
} from "../../../src/server/rules/registries";

// Compiler tests construct no Match (rules test plan §17).
const registries: Registries = {
  tokens: {
    "thopter-1-1-flying": {
      id: "thopter-1-1-flying",
      characteristics: {
        name: "Thopter",
        colors: [],
        supertypes: [],
        types: ["Artifact", "Creature"],
        subtypes: ["Thopter"],
        keywords: ["Flying"],
        rulesText: "Flying",
      },
      abilities: [],
    },
    "phyrexian-germ-0-0": {
      id: "phyrexian-germ-0-0",
      characteristics: {
        name: "Phyrexian Germ",
        colors: ["B"],
        supertypes: [],
        types: ["Creature"],
        subtypes: ["Phyrexian", "Germ"],
        keywords: [],
        rulesText: "",
      },
      abilities: [],
    },
  },
  counters: counterKinds,
};

function compile(abilities: unknown[], manaCost = "{2}{U}") {
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

// ------------------------------------------------------------- validation

test("schema errors carry the path into the card", () => {
  const result = compile([
    { id: "x", kind: "spell", effects: [{ kind: "explode" }] },
  ]);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.errors[0].path).toMatch(/^abilities\[0\]/);
});

for (const [name, abilities, message, manaCost] of [
  [
    "duplicate ability ids",
    [spell([{ kind: "draw", count: 1 }]), spell([{ kind: "draw", count: 1 }])],
    'Duplicate ability id "spell".',
  ],
  [
    "modes and effects together",
    [
      spell([{ kind: "draw", count: 1 }], {
        modes: {
          choose: 1,
          options: [
            { id: "a", label: "A", effects: [{ kind: "draw", count: 1 }] },
            { id: "b", label: "B", effects: [{ kind: "draw", count: 1 }] },
          ],
        },
      }),
    ],
    "Use either modes or effects, not both.",
  ],
  [
    "more modes than options",
    [
      {
        id: "s",
        kind: "spell",
        modes: {
          choose: 3,
          options: [
            { id: "a", label: "A", effects: [{ kind: "draw", count: 1 }] },
            { id: "b", label: "B", effects: [{ kind: "draw", count: 1 }] },
          ],
        },
      },
    ],
    "Cannot choose more modes than there are options.",
  ],
  [
    "an unknown target",
    [spell([{ kind: "destroy", objects: { target: "nope" } }])],
    'Unknown target "nope".',
  ],
  [
    '"target" with two clauses',
    [
      spell([{ kind: "destroy", objects: "target" }], {
        targets: [
          { id: "a", filter: { type: "Artifact" } },
          { id: "b", filter: { type: "Creature" } },
        ],
      }),
    ],
    '"target" needs exactly one target clause; name it instead.',
  ],
  [
    "duplicate target ids",
    [
      spell([{ kind: "destroy", objects: { target: "a" } }], {
        targets: [
          { id: "a", filter: {} },
          { id: "a", filter: {} },
        ],
      }),
    ],
    'Duplicate target id "a".',
  ],
  [
    "a binding read before it is defined",
    [
      spell([
        { kind: "draw", count: { binding: "drawn" } },
        { kind: "draw", count: 1, bind: "drawn" },
      ]),
    ],
    'Unknown binding "drawn".',
  ],
  [
    "an object binding used as a number",
    [
      spell([
        {
          kind: "destroy",
          objects: { all: { type: "Artifact" } },
          bind: "gone",
        },
        { kind: "draw", count: { binding: "gone" } },
      ]),
    ],
    'Binding "gone" holds objects, not number.',
  ],
  [
    "a number binding used as objects",
    [
      spell([
        { kind: "draw", count: 1, bind: "drawn" },
        { kind: "destroy", objects: { binding: "drawn" } },
      ]),
    ],
    'Binding "drawn" holds number, not objects.',
  ],
  [
    "a binding defined twice",
    [
      spell([
        { kind: "draw", count: 1, bind: "n" },
        { kind: "draw", count: 1, bind: "n" },
      ]),
    ],
    'Binding "n" is already defined.',
  ],
  [
    "a binding on an instruction without a result",
    [spell([{ kind: "shuffle", player: "you", bind: "s" }])],
    "A shuffle instruction produces no result to bind.",
  ],
  [
    "a binding leaking out of a branch",
    [
      spell([
        {
          kind: "if",
          condition: { exists: "source" },
          then: [{ kind: "draw", count: 1, bind: "inner" }],
        },
        { kind: "draw", count: { binding: "inner" } },
      ]),
    ],
    'Unknown binding "inner".',
  ],
  [
    "an event selector outside a trigger",
    [spell([{ kind: "counter", objects: { event: "source" } }])],
    "Event selectors need a triggered or replacement ability.",
  ],
  [
    "eventAmount outside a trigger",
    [spell([{ kind: "gain-life", amount: { eventAmount: true } }])],
    "eventAmount needs a triggered or replacement ability.",
  ],
  [
    "X without {X} in the mana cost",
    [spell([{ kind: "draw", count: { variable: "X" } }])],
    "{ variable: X } needs {X} in a cost or mana cost.",
  ],
  [
    "{X} in an activated cost of a different ability",
    [
      {
        id: "a",
        kind: "activated",
        costs: [],
        effects: [{ kind: "draw", count: { variable: "X" } }],
      },
    ],
    "{ variable: X } needs {X} in a cost or mana cost.",
  ],
  [
    "an unknown token",
    [spell([{ kind: "create-token", token: "dragon" }])],
    'Unknown token "dragon".',
  ],
  [
    "an unknown counter kind",
    [
      spell([
        {
          kind: "add-counters",
          objects: "source",
          counter: "charge",
          count: 1,
        },
      ]),
    ],
    'Unknown counter kind "charge".',
  ],
  [
    "a linked selector without a linking exile",
    [spell([{ kind: "move", objects: { linked: "imprint" }, to: "hand" }])],
    'No exile on this card links "imprint".',
  ],
  [
    "a paid condition without the optional cost",
    [
      spell([
        {
          kind: "if",
          condition: { paid: "kicker" },
          then: [{ kind: "draw", count: 1 }],
        },
      ]),
    ],
    'No optional cost "kicker" on this card.',
  ],
  [
    "define-stats outside a characteristic-defining ability",
    [
      {
        id: "s",
        kind: "static",
        grants: [
          {
            kind: "continuous",
            objects: "source",
            changes: [{ kind: "define-stats", power: 1, toughness: 1 }],
          },
        ],
      },
    ],
    "define-stats is only allowed in a characteristic-defining ability.",
  ],
  [
    "a characteristic-defining ability changing other objects",
    [
      {
        id: "s",
        kind: "static",
        characteristicDefining: true,
        grants: [
          {
            kind: "continuous",
            objects: { all: { type: "Creature" } },
            changes: [{ kind: "define-stats", power: 1, toughness: 1 }],
          },
        ],
      },
    ],
    "Characteristic-defining abilities only define their own source's stats (CR 604.3).",
  ],
  [
    "an exile cost without a Zone",
    [
      {
        id: "a",
        kind: "activated",
        costs: [{ kind: "exile", count: 1, filter: { type: "Creature" } }],
        effects: [{ kind: "draw", count: 1 }],
      },
    ],
    "An exile cost must say which Zone it exiles from.",
  ],
  [
    "a cost modifier changing nothing",
    [
      {
        id: "s",
        kind: "static",
        grants: [{ kind: "cost-modifier", applies: "this" }],
      },
    ],
    "A cost modifier needs reduce or increase.",
  ],
  [
    "duplicate choose-one options",
    [
      spell([
        {
          kind: "choose-one",
          options: [
            { id: "a", label: "A", effects: [{ kind: "draw", count: 1 }] },
            { id: "a", label: "B", effects: [{ kind: "draw", count: 1 }] },
          ],
        },
      ]),
    ],
    'Duplicate option id "a".',
  ],
] as [string, unknown[], string, string?][])
  test(`the compiler rejects ${name}`, () => {
    expect(errors(abilities, manaCost)).toContain(message);
  });

test("valid references compile: targets, bindings, X, links and kicker", () => {
  expect(
    errors(
      [
        {
          id: "kicker",
          kind: "keyword",
          keyword: {
            name: "kicker",
            costs: [{ kind: "mana", symbols: ["{4}"] }],
          },
        },
        spell(
          [
            {
              kind: "exile",
              objects: "target",
              linkAs: "held",
              bind: "exiled",
            },
            { kind: "draw", count: { variable: "X" }, bind: "drawn" },
            { kind: "draw", count: { binding: "drawn" } },
            { kind: "move", objects: { binding: "exiled" }, to: "graveyard" },
            { kind: "move", objects: { linked: "held" }, to: "hand" },
            {
              kind: "if",
              condition: { paid: "kicker" },
              then: [{ kind: "draw", count: 1 }],
            },
            { kind: "may", effects: [{ kind: "draw", count: 1 }], bind: "did" },
            {
              kind: "if",
              condition: { didPerform: "did" },
              then: [{ kind: "draw", count: 1 }],
            },
            {
              kind: "for-each-player",
              players: "each-player",
              order: "APNAP",
              effects: [
                { kind: "draw", player: { binding: "player" }, count: 1 },
              ],
            },
          ],
          { targets: [{ id: "victim", filter: { type: "Creature" } }] },
        ),
      ],
      "{X}{R}",
    ),
  ).toEqual([]);
});

test("event selectors and amounts are allowed in triggered, replacement and delayed abilities", () => {
  expect(
    errors([
      {
        id: "t",
        kind: "triggered",
        trigger: { event: "gains-life", player: "you" },
        effects: [{ kind: "gain-life", amount: { eventAmount: true } }],
      },
      {
        id: "r",
        kind: "replacement",
        event: { event: "would-gain-life", player: "you" },
        replace: { kind: "modify-amount", add: 1 },
      },
      spell([
        {
          kind: "create-delayed-trigger",
          trigger: { event: "step", step: "end", player: "next" },
          effects: [
            { kind: "move", objects: { event: "object" }, to: "battlefield" },
          ],
        },
      ]),
    ]),
  ).toEqual([]);
});

// ------------------------------------------------------------- desugaring

test('"target" shorthand names the single target clause', () => {
  const [ability] = compiled([
    spell([{ kind: "destroy", objects: "target" }], {
      targets: [{ id: "victim", filter: { type: "Creature" } }],
    }),
  ]);
  expect(ability.kind === "spell" && ability.effects![0]).toEqual({
    kind: "destroy",
    objects: { target: "victim" },
  });
});

test("destination shorthand becomes an owner-relative destination object", () => {
  const [ability] = compiled([
    spell([{ kind: "move", objects: "source", to: "hand" }]),
  ]);
  expect(ability.kind === "spell" && ability.effects![0]).toEqual({
    kind: "move",
    objects: "source",
    to: { zone: "hand" },
  });
});

test("enters and dies become zone-change triggers on predicates", () => {
  const [enters, dies] = compiled([
    {
      id: "e",
      kind: "triggered",
      trigger: { event: "enters", object: "source" },
      effects: [{ kind: "draw", count: 1 }],
    },
    {
      id: "d",
      kind: "triggered",
      trigger: {
        event: "dies",
        object: { type: "Artifact", controller: "you" },
      },
      effects: [{ kind: "draw", count: 1 }],
    },
  ]);
  expect(enters.kind === "triggered" && enters.trigger).toEqual({
    event: "zone-change",
    object: { is: "source" },
    to: "battlefield",
  });
  expect(dies.kind === "triggered" && dies.trigger).toEqual({
    event: "zone-change",
    object: {
      and: [{ type: "Artifact", controller: "you" }, { type: "Creature" }],
    },
    from: "battlefield",
    to: "graveyard",
  });
});

test("anyTarget expands to creature, player, planeswalker or battle", () => {
  const [ability] = compiled([
    spell([{ kind: "damage", amount: 2, to: "target" }], {
      targets: [{ id: "t", filter: { anyTarget: true } }],
    }),
  ]);
  expect(ability.kind === "spell" && ability.targets![0].filter).toEqual({
    or: [
      { object: "player" },
      { zone: "battlefield", type: ["Creature", "Planeswalker", "Battle"] },
    ],
  });
});

test("bare comparison values mean equality", () => {
  const [ability] = compiled([
    spell([
      {
        kind: "destroy",
        objects: { all: { manaValue: 3, power: { ">=": 4 } } },
      },
    ]),
  ]);
  expect(ability.kind === "spell" && ability.effects![0]).toEqual({
    kind: "destroy",
    objects: { all: { manaValue: { "=": 3 }, power: { ">=": 4 } } },
  });
});

test("object costs gain their implied Zone and controller", () => {
  const [ability] = compiled([
    {
      id: "a",
      kind: "activated",
      costs: [
        { kind: "sacrifice", count: 2, filter: { type: "Artifact" } },
        { kind: "discard", count: 1, filter: { type: "Land" } },
        {
          kind: "tap",
          count: 1,
          filter: { zone: "battlefield", controller: "opponents" },
        },
      ],
      effects: [{ kind: "draw", count: 1 }],
    },
  ]);
  expect(ability.kind === "activated" && ability.costs).toEqual([
    {
      kind: "sacrifice",
      count: 2,
      filter: { zone: "battlefield", controller: "you", type: "Artifact" },
    },
    {
      kind: "discard",
      count: 1,
      filter: { zone: "hand", owner: "you", type: "Land" },
    },
    {
      kind: "tap",
      count: 1,
      filter: { zone: "battlefield", controller: "opponents" },
    },
  ]);
});

test("scry becomes a Library sequence", () => {
  const [ability] = compiled([spell([{ kind: "scry", count: 2 }])]);
  expect(ability.kind === "spell" && ability.effects![0]).toEqual({
    kind: "library-sequence",
    player: "you",
    count: 2,
    operation: "look",
    select: { max: 2, to: { zone: "library", position: "bottom" } },
    rest: { to: { zone: "library", position: "top" }, order: "any" },
  });
});

// ------------------------------------------------------ keyword expansion

test("affinity becomes a this-spell cost reduction counting your matching permanents", () => {
  const [ability] = compiled([
    {
      id: "affinity",
      kind: "keyword",
      keyword: { name: "affinity", for: { type: "Artifact" } },
    },
  ]);
  expect(ability).toEqual({
    id: "affinity",
    kind: "static",
    activeFrom: "stack",
    grants: [
      {
        kind: "cost-modifier",
        applies: "this",
        reduce: {
          count: {
            all: {
              and: [
                { zone: "battlefield", controller: "you" },
                { type: "Artifact" },
              ],
            },
          },
        },
      },
    ],
  });
});

test("ward becomes a becomes-target trigger that counters unless its cost is paid", () => {
  const [ability] = compiled([
    {
      id: "ward",
      kind: "keyword",
      keyword: { name: "ward", costs: [{ kind: "mana", symbols: ["{4}"] }] },
    },
  ]);
  expect(ability).toMatchObject({
    kind: "triggered",
    trigger: {
      event: "becomes-target",
      object: { is: "source" },
      by: "opponents",
    },
    effects: [
      {
        kind: "may-pay",
        player: { event: "player" },
        costs: [{ kind: "mana", symbols: ["{4}"] }],
        else: [{ kind: "counter", objects: { event: "source" } }],
      },
    ],
  });
});

test("cycling, equip, crew and living weapon expand into ordinary abilities", () => {
  const [cycling, equip, crew, living] = compiled([
    {
      id: "cycling",
      kind: "keyword",
      keyword: { name: "cycling", costs: [{ kind: "mana", symbols: ["{U}"] }] },
    },
    {
      id: "equip",
      kind: "keyword",
      keyword: { name: "equip", costs: [{ kind: "mana", symbols: ["{2}"] }] },
    },
    { id: "crew", kind: "keyword", keyword: { name: "crew", power: 3 } },
    { id: "living", kind: "keyword", keyword: { name: "living-weapon" } },
  ]);
  expect(cycling).toMatchObject({
    kind: "activated",
    activeFrom: "hand",
    costs: [{ kind: "mana", symbols: ["{U}"] }, { kind: "discard-source" }],
    effects: [{ kind: "draw", count: 1 }],
  });
  expect(equip).toMatchObject({
    kind: "activated",
    timing: "sorcery",
    targets: [
      {
        id: "target-0",
        filter: { zone: "battlefield", type: "Creature", controller: "you" },
      },
    ],
    effects: [{ kind: "attach", to: { target: "target-0" } }],
  });
  expect(crew).toMatchObject({
    kind: "activated",
    costs: [
      {
        kind: "tap-total-power",
        power: 3,
        filter: {
          zone: "battlefield",
          controller: "you",
          type: "Creature",
          status: "untapped",
        },
      },
    ],
    effects: [
      {
        kind: "apply-continuous",
        objects: "source",
        duration: "end-of-turn",
        changes: [
          { kind: "add-types", types: ["Artifact", "Creature"], layer: ["4"] },
        ],
      },
    ],
  });
  expect(living).toMatchObject({
    kind: "triggered",
    trigger: {
      event: "zone-change",
      object: { is: "source" },
      to: "battlefield",
    },
    effects: [
      { kind: "create-token", token: "phyrexian-germ-0-0", bind: "germ" },
      { kind: "attach", object: "source", to: { binding: "germ" } },
    ],
  });
});

test("rule keywords and casting options stay keyword abilities", () => {
  const abilities = compiled([
    { id: "flying", kind: "keyword", keyword: "flying" },
    {
      id: "enchant",
      kind: "keyword",
      keyword: { name: "enchant", filter: { type: "Creature" } },
    },
    { id: "improvise", kind: "keyword", keyword: { name: "improvise" } },
    {
      id: "flashback",
      kind: "keyword",
      keyword: {
        name: "flashback",
        costs: [{ kind: "mana", symbols: ["{2}"] }],
      },
    },
  ]);
  expect(abilities.map((a) => a.kind)).toEqual([
    "keyword",
    "keyword",
    "keyword",
    "keyword",
  ]);
});

// ----------------------------------------------------------- layer tagging

test("every continuous change is tagged with its CR 613 layer", () => {
  const [stat, grant] = compiled([
    {
      id: "cda",
      kind: "static",
      characteristicDefining: true,
      grants: [
        {
          kind: "continuous",
          objects: "source",
          changes: [{ kind: "define-stats", power: 1, toughness: 1 }],
        },
      ],
    },
    {
      id: "lord",
      kind: "static",
      grants: [
        {
          kind: "continuous",
          objects: { all: { type: "Creature" } },
          changes: [
            { kind: "gain-control", player: "you" },
            { kind: "add-types", subtypes: ["Juggernaut"] },
            { kind: "grant-keyword", keyword: "flying" },
            { kind: "set-base-stats", power: 5, toughness: 3 },
            { kind: "add-stats", power: 1, toughness: 1 },
          ],
        },
      ],
    },
  ]);
  const layersOf = (ability: CoreAbility) =>
    ability.kind === "static" && ability.grants[0].kind === "continuous"
      ? ability.grants[0].changes.map((c) => c.layer)
      : [];
  expect(layersOf(stat)).toEqual([["7a"]]);
  expect(layersOf(grant)).toEqual([["2"], ["4"], ["6"], ["7b"], ["7c"]]);
});
