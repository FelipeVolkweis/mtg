import "reflect-metadata";
import { Database } from "../storage/database.js";
import { CatalogService } from "./catalog.service.js";

const database = new Database();
try {
  const code = process.argv[2];
  if (!code || process.argv.length !== 3)
    throw new Error("Usage: npm run catalog:import -- SET");
  await database.onModuleInit();
  console.log(
    JSON.stringify(await new CatalogService(database).importSet(code)),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "Import failed");
  process.exitCode = 1;
} finally {
  await database.onModuleDestroy();
}
