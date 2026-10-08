import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CatalogService } from "../../src/server/catalog/catalog.service.js";
import type { ScryfallSource } from "../../src/server/catalog/scryfall-source.js";

void test("imports a single-faced Saga with its chapter text", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "mtg-saga-import-"));
  const previousRoot = process.env.CATALOG_ROOT;
  t.after(async () => {
    if (previousRoot === undefined) delete process.env.CATALOG_ROOT;
    else process.env.CATALOG_ROOT = previousRoot;
    await rm(root, { recursive: true, force: true });
  });
  process.env.CATALOG_ROOT = root;
  await mkdir(join(root, "definitions"));
  await mkdir(join(root, "printings"));
  await writeFile(join(root, "names.json"), "[]\n");
  await writeFile(join(root, "sets.json"), "[]\n");
  await writeFile(join(root, "identity-map.json"), "{}\n");
  const printingId = "10000000-0000-4000-8000-000000000008";
  const oracleId = "20000000-0000-4000-8000-000000000008";
  const source = {
    fetchSet: async () => ({
      cards: [
        {
          id: printingId,
          oracle_id: oracleId,
          name: "The Elder Dragon War",
          set: "fdc",
          collector_number: "1",
          layout: "saga",
          color_identity: ["R"],
          colors: ["R"],
          cmc: 4,
          keywords: ["Read Ahead"],
          mana_cost: "{2}{R}{R}",
          type_line: "Enchantment — Saga",
          oracle_text:
            "Read ahead\nI — Deal 2 damage.\nII — Discard.\nIII — Create a Dragon.",
          image_uris: { normal: "https://cards.example.test/saga.svg" },
        },
      ],
      names: [
        { name: "The Elder Dragon War", canonicalName: "The Elder Dragon War" },
      ],
    }),
  } as unknown as ScryfallSource;
  await new CatalogService().importSet("fdc", source);
  const definition = JSON.parse(
    await readFile(
      join(root, "definitions", `the-elder-dragon-war-${oracleId}.json`),
      "utf8",
    ),
  );
  assert.equal(definition.catalogVersion, 2);
  assert.equal(definition.imported.form, "saga");
  assert.equal(definition.imported.components.length, 1);
  assert.deepEqual(definition.imported.components[0].types, ["Enchantment"]);
  assert.deepEqual(definition.imported.components[0].subtypes, ["Saga"]);
  assert.match(
    definition.imported.components[0].rulesText,
    /III — Create a Dragon/,
  );
});
