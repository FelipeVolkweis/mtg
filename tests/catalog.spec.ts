import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { fixtureCards, catalogResponse } from "./support/catalog-fixture";

test("set-code import is local, idempotent and preserves the catalog when the provider fails", async ({
  request,
}) => {
  let failed = false;
  let legacyBulk = false;
  let truncatedBulk = false;
  const provider = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (failed) {
      res.writeHead(503);
      res.end(JSON.stringify({ error: "offline" }));
      return;
    }
    const response = catalogResponse(
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
  try {
    await importSet();
    const cards = await (
      await request.get("/api/catalog/cards?q=Island")
    ).json();
    expect(cards).toMatchObject([
      {
        canonicalName: "Island",
        defaultPrintingId: fixtureCards[0].id,
        printings: [{ collectorNumber: "1" }, { collectorNumber: "2" }],
      },
    ]);
    const before = await (await request.get("/api/catalog/sets")).json();
    legacyBulk = true;
    await importSet();
    expect(await (await request.get("/api/catalog/sets")).json()).toEqual(
      before,
    );
    legacyBulk = false;
    truncatedBulk = true;
    await expect(importSet()).rejects.toThrow();
    expect(await (await request.get("/api/catalog/sets")).json()).toEqual(
      before,
    );
    failed = true;
    await expect(importSet()).rejects.toThrow();
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
  } finally {
    await new Promise<void>((resolve) => provider.close(() => resolve()));
  }
});
