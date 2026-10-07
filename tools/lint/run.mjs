// Runs ESLint from the tools/lint package (see eslint.config.js for why it is
// a separate package), installing that package first when it is missing or
// older than its lockfile. Arguments are passed to ESLint.
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL(".", import.meta.url));
const root = fileURLToPath(new URL("../..", import.meta.url));
const installed = `${dir}node_modules/.package-lock.json`;
const lockfile = `${dir}package-lock.json`;

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

if (
  !existsSync(installed) ||
  statSync(installed).mtimeMs < statSync(lockfile).mtimeMs
) {
  const status = run("npm", ["ci", "--no-audit", "--no-fund"], dir);
  if (status !== 0) process.exit(status);
}
process.exit(
  run(
    process.execPath,
    [`${dir}node_modules/eslint/bin/eslint.js`, ...process.argv.slice(2)],
    root,
  ),
);
