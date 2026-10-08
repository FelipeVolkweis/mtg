import { expect, test } from "@playwright/test";
import {
  cp,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  definitionFromFile,
  publishCatalog,
  readCatalog,
} from "../../../src/server/catalog/catalog-files";
import { CatalogService } from "../../../src/server/catalog/catalog.service";
import type { ScryfallSource } from "../../../src/server/catalog/scryfall-source";
import { readRegistries } from "../../../src/server/rules/registries";
import {
  cardDefinitionFileSchema,
  type CardDefinitionFile,
} from "../../../src/shared/card-dsl";
import { initializeTestCatalog } from "../../support/empty-catalog";

// The version 2 catalog (card-model-refactor.md §3, §6; dsl-redesign.md §9):
// files hold `imported` and `authored` sections; the reader derives the
// stored-no-more values and loads abilities through the compiler; the engine
// runs the Core AST it emits.

const definitions = "catalog/definitions";
const fileNamed = async (prefix: string) =>
  join(
    definitions,
    (await readdir(definitions)).find((f) => f.startsWith(prefix))!,
  );
// A stored definition file; the tests below read it field by field.
const json = async (path: string) =>
  JSON.parse(await readFile(path, "utf8")) as CardDefinitionFile;

async function tempCatalog() {
  const parent = await mkdtemp(join(tmpdir(), "mtg-catalog-"));
  const root = join(parent, "catalog");
  return { parent, root };
}

test("every catalog definition is a version 2 file", async () => {
  for (const file of (await readdir(definitions)).filter((f) =>
    f.endsWith(".json"),
  )) {
    const raw = await json(join(definitions, file));
    expect(Object.keys(raw), file).toEqual([
      "catalogVersion",
      "id",
      "imported",
      "authored",
    ]);
    expect(cardDefinitionFileSchema.safeParse(raw).success, file).toBe(true);
  }
});

test("the reader derives name, mana value, keywords, Oracle text and type lines", async () => {
  const catalog = await readCatalog("catalog");
  const file = await json(await fileNamed("sol-ring-"));
  const card = catalog.definitions[file.id];
  expect(card).toMatchObject({
    canonicalName: "Sol Ring",
    manaValue: 1,
    keywords: [],
    oracleText: "{T}: Add {C}{C}.",
    form: "normal",
    automationStatus: "implemented",
    authoredAbilities: file.authored.abilities,
  });
  expect(card.components[0].typeLine).toBe("Artifact");
  // The engine runs the compiled Core abilities.
  expect(card.abilities).toMatchObject([
    {
      id: "mana",
      kind: "mana",
      activation: { costs: [{ kind: "tap-source" }] },
      produce: { quantity: 2, colors: ["C"] },
    },
  ]);
});

test("publishing a read catalog rewrites every definition file unchanged", async () => {
  const { parent, root } = await tempCatalog();
  try {
    await cp("catalog", root, { recursive: true });
    await publishCatalog(await readCatalog(root), root);
    for (const file of await readdir(join(root, "definitions")))
      expect(
        await readFile(join(root, "definitions", file), "utf8"),
        file,
      ).toBe(await readFile(join(definitions, file), "utf8"));
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("an authored error fails the load with the card and path", async () => {
  const file = await json(await fileNamed("thoughtcast-"));
  const spell = file.authored.abilities[1];
  if (!("effects" in spell) || !spell.effects)
    throw new Error("Thoughtcast's spell has effects");
  spell.effects[0] = {
    kind: "create-token",
    token: "dragon-5-5",
    count: 1,
  };
  expect(() =>
    definitionFromFile(cardDefinitionFileSchema.parse(file), {
      tokens: {},
      counters: {},
    }),
  ).toThrow(/Thoughtcast: abilities\[1\]\.effects\[0\].*dragon-5-5/);
});

test("an implemented card the runtime can't run fails to load; unimplemented loads without runtime abilities", async () => {
  const registries = await readRegistries("catalog");
  const file = cardDefinitionFileSchema.parse(
    await json("tests/fixtures/dsl-expressiveness/ajani-s-pridemate.json"),
  );
  expect(() =>
    definitionFromFile(
      {
        ...file,
        authored: { ...file.authored, automationStatus: "implemented" },
      },
      registries,
    ),
  ).toThrow(
    "Ajani's Pridemate: abilities[0].trigger: The gains-life trigger is not supported by the current runtime.",
  );
  const card = definitionFromFile(
    {
      ...file,
      authored: { ...file.authored, automationStatus: "unimplemented" },
    },
    registries,
  );
  expect(card.abilities).toEqual([]);
  expect(card.authoredAbilities).toEqual(file.authored.abilities);
});

test("a set import writes only the imported section and leaves authored unchanged", async () => {
  const { parent, root } = await tempCatalog();
  const previousRoot = process.env.CATALOG_ROOT;
  process.env.CATALOG_ROOT = root;
  try {
    await initializeTestCatalog(root);
    const oracleId = "20000000-0000-4000-8000-000000000101";
    const card = {
      id: "10000000-0000-4000-8000-000000000101",
      oracle_id: oracleId,
      name: "Warded Wizard",
      set: "tst",
      collector_number: "1",
      layout: "normal",
      color_identity: ["U"],
      colors: ["U"],
      mana_cost: "{1}{U}",
      cmc: 2,
      keywords: ["Ward"],
      type_line: "Legendary Creature — Human Wizard",
      oracle_text: "Ward {2}",
      power: "1",
      toughness: "2",
      image_uris: { normal: "https://cards.example.test/wizard.svg" },
    };
    const source = (oracle: string) =>
      ({
        fetchSet: () =>
          Promise.resolve({
            cards: [{ ...card, oracle_text: oracle }],
            names: [{ name: card.name, canonicalName: card.name }],
          }),
      }) as unknown as ScryfallSource;
    await new CatalogService().importSet("tst", source("Ward {2}"));
    const path = join(root, "definitions", `warded-wizard-${oracleId}.json`);
    const imported = await json(path);
    expect(imported).toEqual({
      catalogVersion: 2,
      id: oracleId,
      imported: {
        form: "normal",
        components: [
          {
            name: "Warded Wizard",
            manaCost: "{1}{U}",
            colors: ["U"],
            manaValue: 2,
            supertypes: ["Legendary"],
            types: ["Creature"],
            subtypes: ["Human", "Wizard"],
            keywords: ["Ward"],
            rulesText: "Ward {2}",
            power: "1",
            toughness: "2",
          },
        ],
        colorIdentity: ["U"],
        defaultPrintingId: card.id,
      },
      authored: { automationStatus: "unimplemented", abilities: [] },
    });
    const authored = {
      automationStatus: "implemented",
      abilities: [
        {
          id: "ward",
          kind: "keyword",
          keyword: {
            name: "ward",
            costs: [{ kind: "mana", symbols: ["{2}"] }],
          },
        },
      ],
    };
    await writeFile(
      path,
      `${JSON.stringify({ ...imported, authored }, null, 2)}\n`,
    );
    await new CatalogService().importSet("tst", source("Ward {2}. Updated."));
    const refreshed = await json(path);
    expect(refreshed.authored).toEqual(authored);
    expect(refreshed.imported.components[0].rulesText).toBe(
      "Ward {2}. Updated.",
    );
    const loaded = (await readCatalog(root)).definitions[oracleId];
    expect(loaded.oracleText).toBe("Ward {2}. Updated.");
    expect(loaded.abilities.map((a) => a.kind)).toEqual(["triggered"]);
  } finally {
    if (previousRoot === undefined) delete process.env.CATALOG_ROOT;
    else process.env.CATALOG_ROOT = previousRoot;
    await rm(parent, { recursive: true, force: true });
  }
});
