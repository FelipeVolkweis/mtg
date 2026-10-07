import { expect, test } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import { compileCard } from "../../../src/server/rules/compiler";
import { downCompile } from "../../../src/server/rules/down-compiler";
import { readRegistries } from "../../../src/server/rules/registries";
import { cardDefinitionFileSchema } from "../../../src/shared/rules-v2";

// The catalog gate (roadmap issues 4 and 6): every version 2 definition, in
// the catalog and in tests/fixtures/dsl-v2, parses and compiles, and every
// implemented catalog definition down-compiles to the runtime the engine
// executes today.

test("the token registry loads from the catalog", async () => {
  const { tokens } = await readRegistries("catalog");
  expect(Object.keys(tokens).sort()).toEqual([
    "beast-3-3-green",
    "food",
    "myr-1-1",
    "phyrexian-germ-0-0",
    "thopter-1-1-flying",
    "treasure",
    "zombie-2-2-black",
  ]);
});

const files = (dir: string) =>
  readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => `${dir}/${f}`);

test("every catalog definition compiles, and every implemented one is executable", async () => {
  const registries = await readRegistries("catalog");
  const definitions = files("catalog/definitions");
  expect(definitions).toHaveLength(783);
  const failures: string[] = [];
  let implemented = 0;
  for (const path of definitions) {
    const card = cardDefinitionFileSchema.safeParse(
      JSON.parse(readFileSync(path, "utf8")),
    );
    if (!card.success) {
      failures.push(`${path}: ${card.error.message}`);
      continue;
    }
    const compiled = compileCard(
      {
        components: card.data.imported.components,
        abilities: card.data.authored.abilities,
      },
      registries,
    );
    if (!compiled.ok) {
      failures.push(`${path}: ${JSON.stringify(compiled.errors)}`);
      continue;
    }
    if (card.data.authored.automationStatus !== "implemented") continue;
    implemented++;
    const down = downCompile(compiled.abilities);
    if (!down.ok) failures.push(`${path}: ${JSON.stringify(down.errors)}`);
  }
  expect(failures).toEqual([]);
  expect(implemented).toBe(67);
});

for (const path of files("tests/fixtures/dsl-v2"))
  test(`${path} is a valid version 2 definition that compiles`, async () => {
    const card = cardDefinitionFileSchema.parse(
      JSON.parse(readFileSync(path, "utf8")),
    );
    const result = compileCard(
      {
        components: card.imported.components,
        abilities: card.authored.abilities,
      },
      await readRegistries("catalog"),
    );
    expect(result.ok ? [] : result.errors).toEqual([]);
  });
