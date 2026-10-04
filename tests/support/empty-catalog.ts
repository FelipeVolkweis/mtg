import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

// Test-provider Oracle identities deliberately differ from the release catalog.
export async function initializeTestCatalog(root: string) {
  for (const directory of ["definitions", "printings"])
    await mkdir(join(root, directory), { recursive: true });
  for (const [file, content] of [
    ["sets.json", []],
    ["names.json", []],
    ["identity-map.json", {}],
  ] as const)
    await writeFile(join(root, file), JSON.stringify(content));
}
