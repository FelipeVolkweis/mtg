import { expect, test } from "@playwright/test";
import type { CardDefinitionFile } from "../src/shared/card-dsl";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRoom } from "./support/table";
import {
  cp,
  mkdtemp,
  readFile,
  writeFile,
  readdir,
  rename,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { initializeTestCatalog } from "./support/empty-catalog";
import { fixtureCards, catalogResponse } from "./support/catalog-fixture";
import { startServer } from "./support/server";

/** A stored definition file, read field by field. */
const definitionFile = async (path: string) =>
  JSON.parse(await readFile(path, "utf8")) as CardDefinitionFile;

test("set-code import is local, idempotent and preserves the catalog when the provider fails", async ({
  playwright,
  browser,
}) => {
  const catalogRoot = await mkdtemp(join(tmpdir(), "mtg-catalog-import-"));
  await initializeTestCatalog(catalogRoot);
  let failed = false;
  let legacyBulk = false;
  let truncatedBulk = false;
  let providerCalls = 0;
  const cards: Record<string, unknown>[] = structuredClone(fixtureCards);
  const provider = createServer((req, res) => {
    providerCalls++;
    res.setHeader("Content-Type", "application/json");
    if (failed) {
      res.writeHead(503);
      res.end(JSON.stringify({ error: "offline" }));
      return;
    }
    const response = req.url?.startsWith("/cards/search")
      ? { data: cards, has_more: false }
      : catalogResponse(
          req.url ?? "",
          `http://${req.headers.host}`,
          legacyBulk,
        );
    res.end(
      Buffer.isBuffer(response)
        ? truncatedBulk
          ? response.subarray(0, 5)
          : response
        : JSON.stringify(response),
    );
  });
  await new Promise<void>((resolve) =>
    provider.listen(0, "127.0.0.1", resolve),
  );
  const address = provider.address();
  if (!address || typeof address === "string")
    throw new Error("No provider address");
  const env = {
    ...process.env,
    CATALOG_ROOT: catalogRoot,
    DATABASE_URL:
      process.env.TEST_DATABASE_URL ??
      "postgres://mtg:mtg-local@127.0.0.1:5432/mtg_test",
    SCRYFALL_API_ORIGIN: `http://127.0.0.1:${address.port}`,
  };
  const importSet = () =>
    promisify(execFile)("npm", ["run", "catalog:import", "--", "tst"], { env });
  const app = await startServer("mtg_catalog_test", 4320, {
    CATALOG_ROOT: catalogRoot,
  });
  const request = await playwright.request.newContext({ baseURL: app.origin });
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await createRoom(page, "CatalogPlayer", app.origin);
    await page.getByLabel("Decklist name").fill("Before import");
    await page.getByLabel("Decklist text").fill("1 Island");
    await page
      .getByRole("button", { name: "Save Decklist", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      "not a canonical card name in the locally imported pool",
    );
    expect(providerCalls).toBe(0);
    await page.getByRole("button", { name: "Dismiss error" }).click();
    await importSet();
    const callsAfterImport = providerCalls;
    failed = true;
    await page.getByLabel("Decklist name").fill("After import");
    await page
      .getByRole("button", { name: "Save Decklist", exact: true })
      .click();
    await expect(
      page
        .getByLabel("Selected Decklist")
        .getByRole("option", { name: "After import" }),
    ).toBeAttached();
    await page.getByLabel("Decklist name").fill("Unavailable name");
    await page.getByLabel("Decklist text").fill("1 Black Lotus");
    await page
      .getByRole("button", { name: "Save Decklist", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      "not a canonical card name in the locally imported pool",
    );
    expect(providerCalls).toBe(callsAfterImport);
    failed = false;
    const island = await definitionFile(
      join(
        catalogRoot,
        "definitions",
        "island-20000000-0000-4000-8000-000000000001.json",
      ),
    );
    expect(island).toMatchObject({
      catalogVersion: 2,
      id: "20000000-0000-4000-8000-000000000001",
      authored: { automationStatus: "unimplemented", abilities: [] },
    });
    expect(island.imported).toMatchObject({
      defaultPrintingId: fixtureCards[0].id,
      components: [
        {
          name: "Island",
          supertypes: ["Basic"],
          types: ["Land"],
          subtypes: ["Island"],
          manaValue: 0,
        },
      ],
    });
    expect(island.imported.components[0]).not.toHaveProperty("typeLine");
    const printed: unknown = JSON.parse(
      await readFile(
        join(catalogRoot, "printings", `${fixtureCards[1].id}.json`),
        "utf8",
      ),
    );
    expect(printed).toEqual({
      id: fixtureCards[1].id,
      definitionId: island.id,
      setCode: "tst",
      collectorNumber: "2",
      artwork: ["https://cards.example.test/island.svg"],
    });
    expect(await readdir(join(catalogRoot, "definitions"))).toContain(
      `delver-of-secrets-${fixtureCards[2].oracle_id}.json`,
    );
    const delver = await definitionFile(
      join(
        catalogRoot,
        "definitions",
        `delver-of-secrets-${fixtureCards[2].oracle_id}.json`,
      ),
    );
    expect(delver.imported).toMatchObject({
      form: "transform",
      components: [
        {
          name: "Delver of Secrets",
          types: ["Creature"],
          subtypes: ["Human", "Wizard"],
        },
        { name: "Insectile Aberration", keywords: ["Flying"] },
      ],
    });
    expect(delver.imported.components[0].keywords).toEqual([]);
    expect(delver.imported.components[0]).not.toHaveProperty("manaValue");
    expect(await readdir(join(catalogRoot, "definitions"))).toContain(
      `shared-name-${fixtureCards[4].oracle_id}.json`,
    );
    expect(await readdir(join(catalogRoot, "definitions"))).toContain(
      `shared-name-${fixtureCards[5].oracle_id}.json`,
    );
    expect(JSON.stringify(island)).not.toMatch(
      /prices|edhrec_rank|purchase_uris/,
    );
    expect(
      await (
        await request.get(
          "/api/catalog/cards?q=Shared%20Name&status=unimplemented",
        )
      ).json(),
    ).toHaveLength(2);
    const lookup: unknown = await (
      await request.get("/api/catalog/cards?q=Island")
    ).json();
    expect(lookup).toMatchObject([
      {
        canonicalName: "Island",
        defaultPrintingId: fixtureCards[0].id,
        printings: [{ collectorNumber: "1" }, { collectorNumber: "2" }],
      },
    ]);
    expect(
      await (await request.get("/api/catalog/cards?q=Insectile")).json(),
    ).toMatchObject([{ id: fixtureCards[2].oracle_id }]);
    expect(
      await (await request.get("/api/catalog/cards?q=Echoing%20Isle")).json(),
    ).toMatchObject([{ id: fixtureCards[0].oracle_id }]);
    const before: unknown = await (
      await request.get("/api/catalog/sets")
    ).json();
    const file = join(
      catalogRoot,
      "definitions",
      `shared-name-${fixtureCards[4].oracle_id}.json`,
    );
    const authored = await definitionFile(file);
    // A reviewer's authored section; the fixture's ward pays {2}.
    authored.authored = {
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
    await writeFile(file, `${JSON.stringify(authored, null, 2)}\n`);
    const unfinishedFile = join(
      catalogRoot,
      "definitions",
      `shared-name-${fixtureCards[5].oracle_id}.json`,
    );
    const unfinished = await definitionFile(unfinishedFile);
    unfinished.authored.abilities = [
      { id: "haste", kind: "keyword", keyword: "haste" },
    ];
    await writeFile(unfinishedFile, `${JSON.stringify(unfinished, null, 2)}\n`);
    const authoredBefore = await readFile(file, "utf8");
    cards[4].oracle_text = "Ward—Blight 2. Updated wording.";
    cards[4].image_uris = {
      normal: "https://cards.example.test/shared-one-new.svg",
    };
    await importSet();
    const refreshed = await definitionFile(file);
    expect(refreshed.authored).toEqual(authored.authored);
    expect(refreshed.imported).toMatchObject({
      components: [
        {
          rulesText: "Ward—Blight 2. Updated wording.",
          supertypes: ["Legendary"],
          types: ["Creature"],
          subtypes: ["Human", "Wizard"],
        },
      ],
    });
    expect((await definitionFile(unfinishedFile)).authored).toEqual(
      unfinished.authored,
    );
    expect(
      await (
        await request.get(
          "/api/catalog/cards?q=Shared%20Name&status=implemented",
        )
      ).json(),
    ).toHaveLength(1);
    expect(
      await (
        await request.get(
          "/api/catalog/cards?q=Shared%20Name&status=unimplemented",
        )
      ).json(),
    ).toHaveLength(1);
    expect(await readFile(file, "utf8")).not.toEqual(authoredBefore);
    expect(
      JSON.parse(
        await readFile(
          join(catalogRoot, "printings", `${fixtureCards[4].id}.json`),
          "utf8",
        ),
      ),
    ).toMatchObject({
      artwork: ["https://cards.example.test/shared-one-new.svg"],
    });
    const unchanged = await readFile(file, "utf8");
    legacyBulk = true;
    await importSet();
    expect(await readFile(file, "utf8")).toEqual(unchanged);
    expect(await (await request.get("/api/catalog/sets")).json()).toEqual(
      before,
    );
    legacyBulk = false;
    truncatedBulk = true;
    await expect(importSet()).rejects.toThrow();
    expect(await readFile(file, "utf8")).toEqual(unchanged);
    expect(await (await request.get("/api/catalog/sets")).json()).toEqual(
      before,
    );
    failed = true;
    await expect(importSet()).rejects.toThrow();
    expect(await readFile(file, "utf8")).toEqual(unchanged);
    expect(await (await request.get("/api/catalog/sets")).json()).toEqual(
      before,
    );
    expect(
      await (await request.get("/api/catalog/names?q=Black")).json(),
    ).toMatchObject([{ name: "Black Lotus", canonicalName: "Black Lotus" }]);
    expect(
      await (await request.get("/api/catalog/names?q=Independent Back")).json(),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Independent Back",
          canonicalName: "Independent Front",
          component: 1,
        }),
      ]),
    );
    expect(
      await (await request.get("/api/catalog/names?q=Independent Left")).json(),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Independent Left // Independent Right",
          canonicalName: "Independent Left // Independent Right",
        }),
        expect.objectContaining({
          name: "Independent Left",
          canonicalName: "Independent Left // Independent Right",
          component: 0,
        }),
      ]),
    );
    expect(
      await (await request.get("/api/catalog/names?q=Alternate Lotus")).json(),
    ).toMatchObject([
      { name: "Alternate Lotus", canonicalName: "Black Lotus" },
    ]);
    expect(
      await (await request.get("/api/catalog/names?q=Fresh Card")).json(),
    ).toMatchObject([{ name: "Fresh Card", canonicalName: "Fresh Card" }]);
    expect(
      await (await request.get("/api/catalog/names?q=Island // Island")).json(),
    ).toMatchObject([{ name: "Island // Island", canonicalName: "Island" }]);
    expect(
      await (await request.get("/api/catalog/cards?q=Black")).json(),
    ).toEqual([]);
    failed = false;
    truncatedBulk = false;
    cards[0].oracle_id = "";
    await expect(importSet()).rejects.toThrow();
    expect(await readFile(file, "utf8")).toEqual(unchanged);
    cards[0].oracle_id = fixtureCards[0].oracle_id;
    cards[0].layout = "unsupported";
    await expect(importSet()).rejects.toThrow();
    expect(await readFile(file, "utf8")).toEqual(unchanged);
    expect(await (await request.get("/api/catalog/sets")).json()).toEqual(
      before,
    );
    cards[0].layout = fixtureCards[0].layout;
    const mappedPrinting = "10000000-0000-4000-8000-000000000007";
    const mappedOracle = "20000000-0000-4000-8000-000000000007";
    cards.push({
      ...cards[2],
      id: mappedPrinting,
      oracle_id: undefined,
      name: "Mapped Front // Mapped Back",
      layout: "reversible_card",
      collector_number: "7",
      card_faces: [
        { ...fixtureCards[2].card_faces![0], name: "Mapped Front" },
        { ...fixtureCards[2].card_faces![1], name: "Mapped Back" },
      ],
    });
    await expect(importSet()).rejects.toThrow();
    expect(await readdir(join(catalogRoot, "definitions"))).not.toContain(
      `mapped-front-${mappedOracle}.json`,
    );
    await writeFile(
      join(catalogRoot, "identity-map.json"),
      `${JSON.stringify({ [mappedPrinting]: mappedOracle }, null, 2)}\n`,
    );
    await importSet();
    expect(
      JSON.parse(
        await readFile(
          join(catalogRoot, "definitions", `mapped-front-${mappedOracle}.json`),
          "utf8",
        ),
      ),
    ).toMatchObject({
      id: mappedOracle,
      imported: { form: "reversible_card" },
      authored: { automationStatus: "unimplemented" },
    });
    cards[4].name = "Æther // Shared Card";
    await importSet();
    expect(await readdir(join(catalogRoot, "definitions"))).not.toContain(
      `shared-name-${fixtureCards[4].oracle_id}.json`,
    );
    expect(
      JSON.parse(
        await readFile(
          join(
            catalogRoot,
            "definitions",
            `æther-shared-card-${fixtureCards[4].oracle_id}.json`,
          ),
          "utf8",
        ),
      ),
    ).toMatchObject({
      id: fixtureCards[4].oracle_id,
      authored: authored.authored,
    });
  } finally {
    await context.close();
    await request.dispose();
    await app.stop();
    await new Promise<void>((resolve) => provider.close(() => resolve()));
  }
});

test("an interrupted publication restores the last complete catalog on startup", async ({
  playwright,
}) => {
  const root = await mkdtemp(join(tmpdir(), "mtg-catalog-recover-"));
  await cp(process.env.CATALOG_ROOT!, root, { recursive: true });
  const expectedSets: unknown = JSON.parse(
    await readFile(join(root, "sets.json"), "utf8"),
  );
  const expectedDefinitions = (await readdir(join(root, "definitions"))).filter(
    (file) => file.endsWith(".json"),
  ).length;
  await rename(root, `${root}.previous`);
  const app = await startServer("mtg_catalog_recovery_test", 4321, {
    CATALOG_ROOT: root,
  });
  const request = await playwright.request.newContext({ baseURL: app.origin });
  try {
    expect(await (await request.get("/api/catalog/sets")).json()).toMatchObject(
      { sets: expectedSets, definitions: expectedDefinitions },
    );
    expect(JSON.parse(await readFile(join(root, "sets.json"), "utf8"))).toEqual(
      expectedSets,
    );
  } finally {
    await request.dispose();
    await app.stop();
  }
});
