import { createServer } from "node:http";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { catalogResponse } from "./support/catalog-fixture";
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { initializeTestCatalog } from "./support/empty-catalog";
import {
  readCatalog,
  publishCatalog,
} from "../src/server/catalog/catalog-files";
import type { CardDefinition } from "../src/shared/model";
import { Pool } from "pg";

export async function seedCatalog() {
  const root = process.env.CATALOG_ROOT!;
  try {
    await access(resolve(root, "sets.json"));
  } catch {
    await initializeTestCatalog(root);
  }
  const provider = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    const response = catalogResponse(
      req.url ?? "",
      `http://${req.headers.host}`,
    );
    res.end(Buffer.isBuffer(response) ? response : JSON.stringify(response));
  });
  await new Promise<void>((resolve) =>
    provider.listen(0, "127.0.0.1", resolve),
  );
  const address = provider.address();
  if (!address || typeof address === "string")
    throw new Error("Provider did not start");
  try {
    await promisify(execFile)(
      process.execPath,
      ["dist/server/catalog/import-cli.js", "tst"],
      {
        env: {
          ...process.env,
          SCRYFALL_API_ORIGIN: `http://127.0.0.1:${address.port}`,
        },
      },
    );
  } finally {
    await new Promise<void>((resolve) => provider.close(() => resolve()));
  }
  const catalog = await readCatalog(root);
  catalog.definitions["20000000-0000-4000-8000-000000000001"].automationStatus =
    "implemented";
  const commander: CardDefinition = {
    id: "30000000-0000-4000-8000-000000000001",
    canonicalName: "Rules Commander",
    defaultPrintingId: "40000000-0000-4000-8000-000000000001",
    form: "normal",
    colorIdentity: ["U"],
    components: [
      {
        name: "Rules Commander",
        manaCost: "{2}{U}",
        colors: ["U"],
        typeLine: "Legendary Creature — Wizard",
        types: ["Creature"],
        supertypes: ["Legendary"],
        subtypes: ["Wizard"],
        rulesText: "",
        power: "2",
        toughness: "2",
      },
    ],
    oracleText: "",
    keywords: [],
    manaValue: 3,
    automationStatus: "implemented",
    abilities: [],
  };
  catalog.definitions[commander.id] = commander;
  catalog.printings[commander.defaultPrintingId] = {
    id: commander.defaultPrintingId,
    definitionId: commander.id,
    setCode: "tst",
    collectorNumber: "7",
    artwork: ["https://cards.example.test/commander.svg"],
  };
  catalog.names["rules commander"] = {
    name: "Rules Commander",
    canonicalName: "Rules Commander",
  };
  const release = await readCatalog("catalog");
  for (const name of [
    "Sol Ring",
    "Counterspell",
    "Negate",
    "Mind Stone",
    "Hedron Archive",
    "Pull from Tomorrow",
    "Thirst for Knowledge",
    "Sai, Master Thopterist",
    "Vedalken Archmage",
    "Chief of the Foundry",
    "Steel Overseer",
  ]) {
    const card = Object.values(release.definitions).find(
      (card) => card.canonicalName === name,
    )!;
    catalog.definitions[card.id] = structuredClone(card);
    catalog.printings[card.defaultPrintingId] = structuredClone(
      release.printings[card.defaultPrintingId],
    );
    const printing = catalog.printings[card.defaultPrintingId];
    if (!catalog.importedSets.includes(printing.setCode))
      catalog.importedSets.push(printing.setCode);
    catalog.names[name.toLowerCase()] = { name, canonicalName: name };
  }
  await publishCatalog(catalog, root);
}
export default async function setup() {
  const pool = new Pool({
    connectionString:
      process.env.TEST_DATABASE_URL ??
      "postgres://mtg:mtg-local@127.0.0.1:5432/mtg_test",
  });
  try {
    await pool.query("DROP TABLE IF EXISTS catalog");
  } finally {
    await pool.end();
  }
  await seedCatalog();
}
