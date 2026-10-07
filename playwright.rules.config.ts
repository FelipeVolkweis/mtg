import { defineConfig } from "@playwright/test";

// The rules suite runs Match commands in memory: no web server, no Postgres.
export default defineConfig({
  testDir: "./tests",
  testMatch: ["rules-round-trip.spec.ts", "rules/**/*.spec.ts"],
  fullyParallel: true,
  timeout: 45_000,
  expect: { timeout: 10_000 },
});
