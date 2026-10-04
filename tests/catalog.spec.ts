import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  cp,
  mkdtemp,
  readFile,
  writeFile,
  readdir,
  rename,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { fixtureCards, catalogResponse } from "./support/catalog-fixture";
import { startServer } from "./support/server";

test("set-code import is local, idempotent and preserves the catalog when the provider fails", async ({
  playwright,
}) => {
  const catalogRoot = await mkdtemp(join(tmpdir(), "mtg-catalog-import-"));
  await cp(resolve("catalog"), catalogRoot, { recursive: true });
  let failed = false;
  let legacyBulk = false;
  let truncatedBulk = false;
  const cards: Record<string, unknown>[] = structuredClone(fixtureCards);
  const provider = createServer((req, res) => {
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
    promisify(execFile)(
      process.execPath,
      ["dist/server/catalog/import-cli.js", "tst"],
      { env },
    );
  const app = await startServer("mtg_catalog_test", 4320, {
    CATALOG_ROOT: catalogRoot,
  });
  const request = await playwright.request.newContext({ baseURL: app.origin });
  try {
    await importSet();
    const island = JSON.parse(
      await readFile(
        join(
          catalogRoot,
          "definitions",
          "20000000-0000-4000-8000-000000000001.json",
        ),
        "utf8",
      ),
    );
    expect(island).toMatchObject({
      id: "20000000-0000-4000-8000-000000000001",
      canonicalName: "Island",
      automationStatus: "unimplemented",
      abilities: [],
    });
    expect(island).toMatchObject({
      defaultPrintingId: fixtureCards[0].id,
      components: [
        {
          supertypes: ["Basic"],
          types: ["Land"],
          subtypes: ["Island"],
          manaValue: 0,
        },
      ],
    });
    const printed = JSON.parse(
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
      `${fixtureCards[2].oracle_id}.json`,
    );
    const delver = JSON.parse(
      await readFile(
        join(catalogRoot, "definitions", `${fixtureCards[2].oracle_id}.json`),
        "utf8",
      ),
    );
    expect(delver).toMatchObject({
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
    expect(delver.components[0].keywords).toEqual([]);
    expect(delver.components[0]).not.toHaveProperty("manaValue");
    expect(await readdir(join(catalogRoot, "definitions"))).toContain(
      `${fixtureCards[4].oracle_id}.json`,
    );
    expect(await readdir(join(catalogRoot, "definitions"))).toContain(
      `${fixtureCards[5].oracle_id}.json`,
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
    const lookup = await (
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
    const before = await (await request.get("/api/catalog/sets")).json();
    const file = join(
      catalogRoot,
      "definitions",
      `${fixtureCards[4].oracle_id}.json`,
    );
    const authored = JSON.parse(await readFile(file, "utf8"));
    authored.automationStatus = "implemented";
    authored.abilities = [
      {
        id: "ward-blight",
        kind: "triggered",
        origin: "printed",
        applicableZone: "battlefield",
        keyword: "Ward",
        trigger: { kind: "event", condition: { primitive: "becomes-target" } },
        costs: [
          {
            kind: "primitive",
            primitive: "blight",
            parameters: { amount: { kind: "integer", value: 2 } },
          },
        ],
        effects: [{ primitive: "counter-spell" }],
      },
    ];
    await writeFile(file, `${JSON.stringify(authored, null, 2)}\n`);
    const unfinishedFile = join(
      catalogRoot,
      "definitions",
      `${fixtureCards[5].oracle_id}.json`,
    );
    const unfinished = JSON.parse(await readFile(unfinishedFile, "utf8"));
    unfinished.abilities = [
      {
        id: "haste",
        kind: "static",
        origin: "printed",
        keyword: "Haste",
        effects: [{ primitive: "grant-haste" }],
      },
    ];
    await writeFile(unfinishedFile, `${JSON.stringify(unfinished, null, 2)}\n`);
    const authoredBefore = await readFile(file, "utf8");
    cards[4].oracle_text = "Ward—Blight 2. Updated wording.";
    cards[4].image_uris = {
      normal: "https://cards.example.test/shared-one-new.svg",
    };
    await importSet();
    const refreshed = JSON.parse(await readFile(file, "utf8"));
    expect(refreshed).toMatchObject({
      oracleText: "Ward—Blight 2. Updated wording.",
      automationStatus: "implemented",
      abilities: authored.abilities,
      components: [
        {
          supertypes: ["Legendary"],
          types: ["Creature"],
          subtypes: ["Human", "Wizard"],
        },
      ],
    });
    expect(JSON.parse(await readFile(unfinishedFile, "utf8"))).toMatchObject({
      automationStatus: "unimplemented",
      abilities: unfinished.abilities,
    });
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
      `${mappedOracle}.json`,
    );
    await writeFile(
      join(catalogRoot, "identity-map.json"),
      `${JSON.stringify({ [mappedPrinting]: mappedOracle }, null, 2)}\n`,
    );
    await importSet();
    expect(
      JSON.parse(
        await readFile(
          join(catalogRoot, "definitions", `${mappedOracle}.json`),
          "utf8",
        ),
      ),
    ).toMatchObject({
      id: mappedOracle,
      form: "reversible_card",
      automationStatus: "unimplemented",
    });
  } finally {
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
  await rename(root, `${root}.previous`);
  const app = await startServer("mtg_catalog_recovery_test", 4321, {
    CATALOG_ROOT: root,
  });
  const request = await playwright.request.newContext({ baseURL: app.origin });
  try {
    expect(await (await request.get("/api/catalog/sets")).json()).toMatchObject(
      { sets: ["tst"], definitions: 5 },
    );
    expect(JSON.parse(await readFile(join(root, "sets.json"), "utf8"))).toEqual(
      ["tst"],
    );
  } finally {
    await request.dispose();
    await app.stop();
  }
});
