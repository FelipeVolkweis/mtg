import { expect, test } from "@playwright/test";
import { readCatalog } from "../../../src/server/catalog/catalog-files";
import { deriveFields, manaValueOf } from "../../../src/server/catalog/derive";
import type { CardForm } from "../../../src/shared/card-dsl";

// Derived fields must reproduce what the catalog stores today before the
// stored copies are deleted (card-model-refactor.md §7).

test("derived fields equal the stored values for every catalog definition", async () => {
  const catalog = await readCatalog("catalog");
  const mismatches: string[] = [];
  for (const card of Object.values(catalog.definitions)) {
    const derived = deriveFields(card.form, card.components);
    const stored = {
      canonicalName: card.canonicalName,
      manaValue: card.manaValue,
      keywords: card.keywords,
      oracleText: card.oracleText,
      typeLines: card.components.map((c) => c.typeLine),
    };
    for (const key of Object.keys(stored) as (keyof typeof stored)[])
      if (JSON.stringify(derived[key]) !== JSON.stringify(stored[key]))
        mismatches.push(
          `${card.canonicalName}: ${key} ${JSON.stringify(derived[key])} ≠ ${JSON.stringify(stored[key])}`,
        );
    for (const component of card.components)
      if (
        component.manaValue !== undefined &&
        manaValueOf(component.manaCost) !== component.manaValue
      )
        mismatches.push(`${component.name}: component mana value`);
  }
  expect(mismatches).toEqual([]);
  expect(Object.keys(catalog.definitions).length).toBeGreaterThan(700);
});

for (const [cost, value] of [
  [undefined, 0],
  ["{2}{U}", 3],
  ["{X}{U}{U}", 2],
  ["{2/W}{2/W}", 4],
  ["{W/U}{B/P}", 2],
  ["{C}{C}", 2],
  ["{0}", 0],
] as [string | undefined, number][])
  test(`mana value of ${cost ?? "no cost"} is ${value}`, () => {
    expect(manaValueOf(cost)).toBe(value);
  });

// One hand-checked card per multi-face layout the importer accepts.
const face = (
  name: string,
  manaCost: string | undefined,
  types: string[],
  rulesText: string,
  extra: {
    subtypes?: string[];
    keywords?: string[];
    supertypes?: string[];
  } = {},
) => ({ name, manaCost, types, rulesText, ...extra });

for (const [form, components, expected] of [
  [
    "transform",
    [
      face(
        "Delver of Secrets",
        "{U}",
        ["Creature"],
        "At the beginning of your upkeep, look at the top card of your library…",
        { subtypes: ["Human", "Wizard"] },
      ),
      face("Insectile Aberration", undefined, ["Creature"], "Flying", {
        subtypes: ["Human", "Insect"],
        keywords: ["Flying"],
      }),
    ],
    { canonicalName: "Delver of Secrets", manaValue: 1, keywords: ["Flying"] },
  ],
  [
    "modal_dfc",
    [
      face(
        "Agadeem's Awakening",
        "{X}{B}{B}{B}",
        ["Sorcery"],
        "Return from your graveyard…",
      ),
      face(
        "Agadeem, the Undercrypt",
        undefined,
        ["Land"],
        "As Agadeem enters…",
        { keywords: [] },
      ),
    ],
    { canonicalName: "Agadeem's Awakening", manaValue: 3, keywords: [] },
  ],
  [
    "split",
    [
      face(
        "Fire",
        "{1}{R}",
        ["Instant"],
        "Fire deals 2 damage divided as you choose…",
      ),
      face("Ice", "{1}{U}", ["Instant"], "Tap target permanent. Draw a card."),
    ],
    { canonicalName: "Fire // Ice", manaValue: 4, keywords: [] },
  ],
  [
    "room",
    [
      face(
        "Bottomless Pool",
        "{U}",
        ["Enchantment"],
        "When you unlock this door…",
        { subtypes: ["Room"] },
      ),
      face(
        "Locker Room",
        "{4}{U}",
        ["Enchantment"],
        "Whenever one or more creatures…",
        { subtypes: ["Room"] },
      ),
    ],
    {
      canonicalName: "Bottomless Pool // Locker Room",
      manaValue: 6,
      keywords: [],
    },
  ],
  [
    "flip",
    [
      face(
        "Akki Lavarunner",
        "{3}{R}",
        ["Creature"],
        "Whenever Akki Lavarunner deals damage…",
        { subtypes: ["Goblin", "Warrior"] },
      ),
      face(
        "Tok-Tok, Volcano Born",
        undefined,
        ["Creature"],
        "Protection from red…",
        { supertypes: ["Legendary"], subtypes: ["Goblin", "Shaman"] },
      ),
    ],
    {
      canonicalName: "Akki Lavarunner // Tok-Tok, Volcano Born",
      manaValue: 4,
      keywords: [],
    },
  ],
  [
    "reversible_card",
    [
      face("Zndrsplt, Eye of Wisdom", "{4}{U}", ["Creature"], "Alliance — …", {
        supertypes: ["Legendary"],
        subtypes: ["Homunculus"],
      }),
      face("Zndrsplt, Eye of Wisdom", "{4}{U}", ["Creature"], "Alliance — …", {
        supertypes: ["Legendary"],
        subtypes: ["Homunculus"],
      }),
    ],
    { canonicalName: "Zndrsplt, Eye of Wisdom", manaValue: 5, keywords: [] },
  ],
] as [
  CardForm,
  ReturnType<typeof face>[],
  { canonicalName: string; manaValue: number; keywords: string[] },
][])
  test(`derives a ${form} card's name, mana value and keywords`, () => {
    const derived = deriveFields(form, components);
    expect(derived).toMatchObject(expected);
    expect(derived.oracleText).toBe(
      components.map((c) => c.rulesText).join("\n//\n"),
    );
    expect(derived.typeLines).toHaveLength(2);
  });
