import { expect, test } from "@playwright/test";
import type { z } from "zod";
import {
  abilitySchema,
  conditionSchema,
  continuousChangeSchema,
  costSchema,
  destinationSchema,
  durationSchema,
  effectSchema,
  eventPatternSchema,
  keywordSchema,
  manaProductionSchema,
  playerRefSchema,
  predicateSchema,
  replacementSchema,
  selectorSchema,
  staticGrantSchema,
  triggerSchema,
  valueSchema,
} from "../../../src/shared/card-dsl";

// One valid sample per union branch of each authored AST family (DSL §4).
const valid: [string, z.ZodType, unknown[]][] = [
  [
    "player references",
    playerRefSchema,
    [
      "you",
      "opponents",
      "each-player",
      "active-player",
      { target: "t" },
      { controllerOf: "source" },
      { ownerOf: { target: "t" } },
      { event: "player" },
      { binding: "player" },
    ],
  ],
  [
    "selectors",
    selectorSchema,
    [
      "source",
      "target",
      { target: "t" },
      { all: { type: "Creature" } },
      { choose: { from: { type: "Myr" }, count: { min: 0 } } },
      { choose: { chooser: "opponents", from: {}, count: 1 } },
      { binding: "b" },
      { event: "object" },
      { attachedTo: "source" },
      { attachedBy: "source" },
      { linked: "imprint" },
      { attackedBy: "source" },
    ],
  ],
  [
    "predicates",
    predicateSchema,
    [
      { and: [{ type: "Artifact" }, { type: "Creature" }] },
      { or: [{ type: "Artifact" }, { type: "Enchantment" }] },
      { not: { is: "source" } },
      {
        zone: "battlefield",
        object: "permanent",
        type: ["Artifact", "Creature"],
        subtype: "Myr",
        supertype: "Legendary",
        color: ["U", "R"],
        controller: "you",
        owner: "opponents",
        status: ["untapped", "attacking"],
        manaValue: { "<=": 3 },
        power: 2,
        toughness: { ">": 1 },
        counters: { kind: "+1/+1", count: { ">=": 1 } },
        dealtDamageBy: "source",
      },
      { color: "colorless" },
      { color: "any" },
      { player: "opponents" },
      { anyTarget: true },
    ],
  ],
  [
    "values",
    valueSchema,
    [
      3,
      { variable: "X" },
      { binding: "n" },
      { count: { all: { type: "Artifact" } } },
      { sum: [1, { binding: "n" }] },
      { stat: { of: "source", name: "power" } },
      { greatest: { of: { all: { type: "Artifact" } }, name: "manaValue" } },
      { cardsIn: { zone: "hand", player: "you" } },
      { lifeTotal: "you" },
      { commanderColors: "you" },
      { eventAmount: true },
      { if: { paid: "kicker" }, then: 4, else: 2 },
    ],
  ],
  [
    "conditions",
    conditionSchema,
    [
      { and: [{ exists: "source" }, { monarch: "you" }] },
      { or: [{ exists: "source" }, { paid: "kicker" }] },
      { not: { exists: "source" } },
      { compare: [{ lifeTotal: "you" }, ">=", 25] },
      { exists: { all: { type: "Wizard", controller: "you" } } },
      { matches: { selector: "source", predicate: { status: "untapped" } } },
      { happened: { event: "attacks", player: "you", during: "this-turn" } },
      { paid: "kicker" },
      { monarch: "you" },
      { didPerform: "discarded" },
    ],
  ],
  [
    "destinations",
    destinationSchema,
    [
      "hand",
      {
        zone: "battlefield",
        player: "you",
        tapped: true,
        controller: "you",
      },
      { zone: "library", position: "bottom" },
    ],
  ],
  [
    "event patterns",
    eventPatternSchema,
    [
      { event: "would-enter", object: "source" },
      { event: "would-gain-life", player: "you" },
      { event: "would-draw", player: "you" },
      { event: "would-be-dealt-damage", recipient: { type: "Creature" } },
      { event: "leaves-battlefield", object: "source" },
    ],
  ],
  [
    "durations",
    durationSchema,
    [
      "end-of-turn",
      "while-source-on-battlefield",
      { until: { event: "leaves-battlefield", object: "source" } },
    ],
  ],
  [
    "costs",
    costSchema,
    [
      { kind: "mana", symbols: ["{X}", "{2}", "{U}"] },
      { kind: "tap-source" },
      { kind: "untap-source" },
      { kind: "sacrifice-source" },
      { kind: "discard-source" },
      { kind: "exile-source" },
      { kind: "life", amount: { commanderColors: "you" } },
      { kind: "counter-source", counter: "page", count: 1, operation: "put" },
      { kind: "tap", count: 2, filter: { type: "Artifact" } },
      { kind: "sacrifice", count: 1, filter: { type: "Creature" } },
      { kind: "discard", count: 1, filter: {} },
      { kind: "return", count: 1, filter: { type: "Artifact" } },
      { kind: "exile", count: 1, filter: { zone: "graveyard" } },
      { kind: "tap-total-power", power: 3, filter: { type: "Creature" } },
    ],
  ],
  [
    "keywords",
    keywordSchema,
    [
      "flying",
      "first strike",
      { name: "affinity", for: { type: "Artifact" } },
      { name: "ward", costs: [{ kind: "mana", symbols: ["{4}"] }] },
      { name: "cycling", costs: [{ kind: "mana", symbols: ["{U}"] }] },
      { name: "equip", costs: [{ kind: "mana", symbols: ["{2}"] }] },
      { name: "kicker", costs: [{ kind: "mana", symbols: ["{4}"] }] },
      { name: "escalate", costs: [{ kind: "mana", symbols: ["{G}"] }] },
      { name: "flashback", costs: [{ kind: "mana", symbols: ["{7}"] }] },
      { name: "crew", power: 3 },
      { name: "enchant", filter: { type: "Creature" } },
      { name: "improvise" },
      { name: "living-weapon" },
    ],
  ],
  [
    "continuous changes",
    continuousChangeSchema,
    [
      { kind: "add-types", types: ["Artifact"], subtypes: ["Juggernaut"] },
      { kind: "set-base-stats", power: 5, toughness: 3 },
      { kind: "add-stats", power: { count: { binding: "b" } }, toughness: 0 },
      { kind: "define-stats", power: 1, toughness: 1 },
      { kind: "grant-keyword", keyword: "hexproof" },
      { kind: "gain-control", player: "you" },
      {
        kind: "copy-linked",
        link: "imprint",
        retainSubtypes: ["Shapeshifter"],
      },
    ],
  ],
  [
    "static grants",
    staticGrantSchema,
    [
      {
        kind: "continuous",
        objects: "source",
        changes: [{ kind: "add-stats", power: 1, toughness: 1 }],
      },
      { kind: "cost-modifier", applies: "this", reduce: 1 },
      {
        kind: "cost-modifier",
        applies: { spells: { type: "Artifact" } },
        reduce: 1,
        condition: { exists: "source" },
      },
      {
        kind: "cost-modifier",
        applies: { abilitiesOf: "source" },
        increase: 1,
      },
      { kind: "cast-timing", spells: { type: "Artifact" }, as: "flash" },
      {
        kind: "play-permission",
        objects: { binding: "b" },
        duration: "end-of-turn",
      },
      { kind: "maximum-hand-size", player: "you", value: "unlimited" },
      {
        kind: "attack-tax",
        defender: "you",
        costPerAttacker: [{ kind: "mana", symbols: ["{2}"] }],
      },
      {
        kind: "block-tax",
        costPerBlocker: [{ kind: "mana", symbols: ["{1}"] }],
      },
      { kind: "attack-requirement", objects: "source" },
      { kind: "block-restriction", objects: "source", by: { subtype: "Wall" } },
      { kind: "cant-block", objects: "source" },
      { kind: "cant-be-countered", spells: "this" },
      {
        kind: "untap-restriction",
        objects: { attachedTo: "source" },
        unless: { monarch: "you" },
      },
    ],
  ],
  [
    "triggers",
    triggerSchema,
    [
      {
        event: "zone-change",
        object: "source",
        from: "battlefield",
        to: "graveyard",
      },
      { event: "enters", object: { type: "Artifact", controller: "you" } },
      { event: "dies", object: "source" },
      { event: "cast", spell: { type: "Artifact" }, caster: "you" },
      { event: "attacks", attacker: "source" },
      {
        event: "deals-damage",
        source: { type: "Creature" },
        to: "player",
        combat: true,
        batch: "one-or-more",
      },
      { event: "draws", player: "you", nth: 2 },
      { event: "step", step: "upkeep", player: "you" },
      { event: "step", step: "end", player: "next" },
      { event: "becomes-target", object: "source", by: "opponents" },
      { event: "gains-life", player: "you" },
      { event: "loses-life", player: "opponents" },
      { event: "state", condition: { exists: "source" } },
    ],
  ],
  [
    "replacements",
    replacementSchema,
    [
      { kind: "enter-tapped" },
      { kind: "prevent" },
      { kind: "modify-amount", add: 1 },
      { kind: "instead", effects: [{ kind: "draw", count: 1 }] },
    ],
  ],
  [
    "mana production",
    manaProductionSchema,
    [
      { quantity: 2, colors: ["C"] },
      { quantity: 1, colors: { commanderColors: "you" } },
      {
        quantity: 1,
        colors: ["U"],
        restriction: { use: "cast", spellTypes: ["Artifact"] },
      },
    ],
  ],
];

const effects: unknown[] = [
  { kind: "move", objects: "source", to: "hand" },
  { kind: "destroy", objects: "target" },
  {
    kind: "sacrifice",
    objects: { choose: { from: { type: "Creature" }, count: 1 } },
  },
  {
    kind: "exile",
    objects: "target",
    until: { event: "leaves-battlefield", object: "source" },
    linkAs: "held",
  },
  { kind: "counter", objects: "target" },
  {
    kind: "library-sequence",
    player: "you",
    count: 6,
    operation: "look",
    select: { filter: { type: "Artifact" }, max: 1, to: "hand", reveal: true },
    rest: { to: { zone: "library", position: "bottom" }, order: "random" },
  },
  { kind: "scry", count: 2 },
  {
    kind: "search",
    player: "you",
    zone: "library",
    filter: { supertype: "Basic", type: "Land" },
    count: { min: 0, max: 2 },
    to: { zone: "battlefield", tapped: true },
  },
  { kind: "shuffle", player: "you" },
  { kind: "draw", count: 1, bind: "drawn" },
  { kind: "discard", player: "you", count: 1, filter: { type: "Artifact" } },
  { kind: "gain-life", amount: 3 },
  { kind: "lose-life", player: "opponents", amount: 1 },
  { kind: "become-monarch", player: "you" },
  {
    kind: "damage",
    amount: 13,
    to: { all: { type: "Creature" } },
    source: "source",
  },
  { kind: "damage", amount: 4, to: "opponents" },
  { kind: "tap", objects: { attachedTo: "source" } },
  { kind: "untap", objects: "source" },
  { kind: "add-counters", objects: "source", counter: "+1/+1", count: 1 },
  { kind: "remove-counters", objects: "source", counter: "page", count: 1 },
  { kind: "attach", object: "source", to: { binding: "germ" } },
  {
    kind: "create-token",
    token: "food",
    count: 1,
    controller: { controllerOf: "target" },
    tapped: true,
  },
  {
    kind: "apply-continuous",
    objects: "target",
    changes: [{ kind: "grant-keyword", keyword: "double strike" }],
    duration: "end-of-turn",
  },
  {
    kind: "apply-grant",
    grant: { kind: "block-restriction", objects: "source" },
    duration: "end-of-turn",
  },
  { kind: "reselect-defender", attacker: "target" },
  {
    kind: "create-delayed-trigger",
    trigger: { event: "step", step: "end", player: "next" },
    effects: [{ kind: "move", objects: { binding: "b" }, to: "battlefield" }],
  },
  { kind: "sequence", effects: [{ kind: "draw", count: 1 }] },
  {
    kind: "if",
    condition: { paid: "kicker" },
    then: [],
    else: [{ kind: "draw", count: 1 }],
  },
  { kind: "may", effects: [{ kind: "discard", count: 1 }], bind: "did" },
  {
    kind: "may-pay",
    player: { event: "player" },
    costs: [{ kind: "mana", symbols: ["{1}"] }],
    then: [{ kind: "draw", count: 1 }],
  },
  {
    kind: "choose-one",
    options: [
      {
        id: "a",
        label: "A",
        available: { exists: "source" },
        effects: [{ kind: "draw", count: 1 }],
      },
      { id: "b", label: "B", effects: [{ kind: "gain-life", amount: 3 }] },
    ],
  },
  {
    kind: "for-each-player",
    players: "each-player",
    order: "APNAP",
    effects: [{ kind: "draw", count: 1 }],
  },
];

const abilities: unknown[] = [
  {
    id: "s",
    kind: "spell",
    targets: [{ id: "t", count: { min: 0, max: 2 }, filter: {} }],
    effects: [{ kind: "draw", count: 1 }],
  },
  {
    id: "m",
    kind: "spell",
    modes: {
      choose: { min: 1, max: 2 },
      options: [
        {
          id: "a",
          label: "A",
          targets: [{ id: "t", filter: {} }],
          effects: [{ kind: "destroy", objects: "target" }],
        },
        { id: "b", label: "B", effects: [{ kind: "draw", count: 1 }] },
      ],
    },
  },
  {
    id: "a",
    kind: "activated",
    origin: "printed",
    description: "{T}: Draw a card.",
    costs: [{ kind: "tap-source" }],
    timing: "sorcery",
    limit: { perTurn: 1 },
    activeFrom: "battlefield",
    effects: [{ kind: "draw", count: 1 }],
  },
  {
    id: "mana",
    kind: "mana",
    activation: { costs: [{ kind: "tap-source" }] },
    produce: { quantity: 1, colors: ["U"] },
  },
  {
    id: "tmana",
    kind: "mana",
    activation: {
      trigger: {
        event: "tapped-for-mana",
        object: { controller: "you" },
        produced: "C",
      },
    },
    produce: { quantity: 1, colors: ["C"] },
  },
  {
    id: "t",
    kind: "triggered",
    trigger: { event: "step", step: "upkeep", player: "you" },
    interveningIf: { exists: { all: { type: "Artifact", controller: "you" } } },
    effects: [{ kind: "draw", count: 1 }],
  },
  {
    id: "st",
    kind: "static",
    activeFrom: "battlefield",
    condition: { compare: [{ count: { all: { type: "Artifact" } } }, ">=", 4] },
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
    id: "r",
    kind: "replacement",
    activeFrom: "battlefield",
    event: { event: "would-enter", object: "source" },
    replace: { kind: "enter-tapped" },
  },
  { id: "k", kind: "keyword", keyword: "flying" },
];

for (const [name, schema, samples] of valid)
  test(`every branch of ${name} parses`, () => {
    for (const sample of samples) {
      const result = schema.safeParse(sample);
      expect(result.success, JSON.stringify(sample)).toBe(true);
    }
  });

test("every effect kind parses", () => {
  for (const sample of effects)
    expect(effectSchema.safeParse(sample).success, JSON.stringify(sample)).toBe(
      true,
    );
});

test("every ability kind parses", () => {
  for (const sample of abilities)
    expect(
      abilitySchema.safeParse(sample).success,
      JSON.stringify(sample),
    ).toBe(true);
});

test("the effect samples cover every effect kind", () => {
  const kinds = new Set(effects.map((e) => (e as { kind: string }).kind));
  // Keep in step with the Effect type in src/shared/card-dsl.ts.
  expect([...kinds].sort()).toEqual(
    [
      "move",
      "destroy",
      "sacrifice",
      "exile",
      "counter",
      "library-sequence",
      "scry",
      "search",
      "shuffle",
      "draw",
      "discard",
      "gain-life",
      "lose-life",
      "become-monarch",
      "damage",
      "tap",
      "untap",
      "add-counters",
      "remove-counters",
      "attach",
      "create-token",
      "apply-continuous",
      "apply-grant",
      "reselect-defender",
      "create-delayed-trigger",
      "sequence",
      "if",
      "may",
      "may-pay",
      "choose-one",
      "for-each-player",
    ].sort(),
  );
});

for (const [name, schema, sample] of [
  ["an unknown effect kind", effectSchema, { kind: "explode" }],
  [
    "an unknown field",
    effectSchema,
    { kind: "draw", count: 1, optional: true },
  ],
  [
    "a v1 subject flag",
    effectSchema,
    { kind: "move", subject: "target", destination: "hand" },
  ],
  [
    "a token enum value as a field",
    effectSchema,
    { kind: "create-token", token: "thopter", count: 1, each: true },
  ],
  ["an unknown keyword", keywordSchema, "banding"],
  ["an unknown status", predicateSchema, { status: "phased-out" }],
  [
    "an unknown turn step",
    triggerSchema,
    { event: "step", step: "second-main" },
  ],
  [
    "a costs field on a static ability",
    abilitySchema,
    {
      id: "x",
      kind: "static",
      costs: [],
      grants: [{ kind: "cant-block", objects: "source" }],
    },
  ],
  [
    "a mana ability with targets",
    abilitySchema,
    {
      id: "x",
      kind: "mana",
      activation: { costs: [] },
      produce: { quantity: 1, colors: ["U"] },
      targets: [],
    },
  ],
  [
    "two choose-one options minimum",
    effectSchema,
    {
      kind: "choose-one",
      options: [{ id: "a", label: "A", effects: [{ kind: "draw", count: 1 }] }],
    },
  ],
] as [string, z.ZodType, unknown][])
  test(`the schema rejects ${name}`, () => {
    expect(schema.safeParse(sample).success).toBe(false);
  });
