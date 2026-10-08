import { expect, test } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import { compileCard } from "../../../src/server/rules/compiler";
import { readRegistries } from "../../../src/server/rules/registries";
import { cardDefinitionFileSchema } from "../../../src/shared/card-dsl";

// The expressiveness gate (dsl-redesign.md §8, rules-test-plan.md §17): every
// card of the fixed test set is written in version 2 and compiles. The strict
// schema rejects any construct outside the documented AST. Runtime support is
// not required.
const dir = "tests/fixtures/dsl-expressiveness";
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));

test("the expressiveness set has all 26 cards", () => {
  expect(files.length).toBe(26);
});

for (const file of files)
  test(`${file} is expressible in version 2`, async () => {
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
