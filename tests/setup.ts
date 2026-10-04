import { createServer } from "node:http";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { catalogResponse } from "./support/catalog-fixture";
import { cp, access } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";

export async function seedCatalog() {
  const root = process.env.CATALOG_ROOT!;
  try {
    await access(resolve(root, "sets.json"));
  } catch {
    await cp(resolve("catalog"), root, { recursive: true });
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
