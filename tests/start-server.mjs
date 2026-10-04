import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("The test server needs DATABASE_URL.");
const databaseUrl = new URL(url);
const databaseName = databaseUrl.pathname.slice(1);
if (!/^[a-z][a-z0-9_]*_test$/.test(databaseName))
  throw new Error("Use a dedicated database name ending in _test.");
const adminUrl = new URL(databaseUrl);
adminUrl.pathname = "/postgres";
const pool = new pg.Pool({ connectionString: adminUrl.toString() });
try {
  const result = await pool.query(
    "SELECT 1 FROM pg_database WHERE datname = $1",
    [databaseName],
  );
  if (!result.rowCount) await pool.query(`CREATE DATABASE "${databaseName}"`);
} finally {
  await pool.end();
}
await import("../dist/server/main.js");
