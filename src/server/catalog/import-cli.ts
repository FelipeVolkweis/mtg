import "reflect-metadata";
import { CatalogService } from "./catalog.service.js";

try {
  const code = process.argv[2];
  if (!code || process.argv.length !== 3)
    throw new Error("Usage: npm run catalog:import -- SET");
  console.log(JSON.stringify(await new CatalogService().importSet(code)));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Import failed");
  process.exitCode = 1;
}
