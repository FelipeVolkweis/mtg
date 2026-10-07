import { expect, test } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import { compileCard } from "../../../src/server/rules/compiler";
import { readRegistries } from "../../../src/server/rules/registries";
import { cardDefinitionFileSchema } from "../../../src/shared/rules-v2";

// The catalog gate (roadmap issue 4): every version 2 definition parses and
// compiles. It covers tests/fixtures/dsl-v2 until the catalog itself moves to
// version 2 (roadmap issue 6).
const dir = "tests/fixtures/dsl-v2";

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

for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")))
  test(`${file} is a valid version 2 definition that compiles`, async () => {
    const card = cardDefinitionFileSchema.parse(
      JSON.parse(readFileSync(`${dir}/${file}`, "utf8")),
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
