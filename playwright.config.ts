import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.CATALOG_ROOT ??= mkdtempSync(join(tmpdir(), "mtg-catalog-tests-"));

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./tests/setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: { baseURL: "http://127.0.0.1:4317", trace: "retain-on-failure" },
  webServer: {
    command: "npm run build && PORT=4317 node tests/start-server.mjs",
    url: "http://127.0.0.1:4317/api/health",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      AUTH_DEV_LOGIN: "1",
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        "postgres://mtg:mtg-local@127.0.0.1:5432/mtg_test",
    },
  },
});
