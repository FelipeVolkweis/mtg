import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { readCatalog } from "../../../src/server/catalog/catalog-files";
import { migrateDefinition } from "../../../src/server/catalog/migrate-rules-v2";
import { compileCard } from "../../../src/server/rules/compiler";
import { downCompile } from "../../../src/server/rules/down-compiler";
import { readRegistries } from "../../../src/server/rules/registries";
import type { CardAbility } from "../../../src/shared/model";
import { rulesAbilitySchema } from "../../../src/shared/rules";
import { cardDefinitionFileSchema } from "../../../src/shared/rules-v2";

// Golden test (rules-test-plan.md §17, "DSL migration"): for every
// implemented card, the migration's output compiled and down-compiled equals
// what the engine runs today. Only the ability fields the engine reads are
// compared: id, kind, description, the activation zone of activated
// abilities (canActivateFromZone, the cycling check) and the rules. The
// ability-level keyword and origin are never read; applicableZone on other
// kinds is never read.
const engineView = (ability: CardAbility) => ({
  id: ability.id,
  kind: ability.kind,
  description: ability.description,
  activationZone:
    ability.kind === "activated"
      ? (ability.applicableZone ?? "battlefield")
      : undefined,
  rules: rulesAbilitySchema.parse(ability.rules),
});

test("every implemented card round-trips through migration, compiler and down-compiler", async () => {
  const catalog = await readCatalog("catalog");
  const registries = await readRegistries("catalog");
  const implemented = Object.values(catalog.definitions).filter(
    (card) => card.automationStatus === "implemented",
  );
  expect(implemented.length).toBe(67);
  const failures: string[] = [];
  for (const card of implemented) {
    const migrated = migrateDefinition(card);
    if (!migrated.ok) {
      failures.push(
        `${card.canonicalName}: ${JSON.stringify(migrated.errors)}`,
      );
      continue;
    }
    const compiled = compileCard(
      {
        components: migrated.file.imported.components,
        abilities: migrated.file.authored.abilities,
      },
      registries,
    );
    if (!compiled.ok) {
      failures.push(
        `${card.canonicalName}: ${JSON.stringify(compiled.errors)}`,
      );
      continue;
    }
    const down = downCompile(compiled.abilities);
    if (!down.ok) {
      failures.push(`${card.canonicalName}: ${JSON.stringify(down.errors)}`);
      continue;
    }
    const expected = JSON.stringify(card.abilities.map(engineView));
    const actual = JSON.stringify(down.abilities.map(engineView));
    if (expected !== actual)
      expect
        .soft(down.abilities.map(engineView), card.canonicalName)
        .toEqual(card.abilities.map(engineView));
  }
  expect(failures).toEqual([]);
});

test("constructs the current runtime can't run fail with a clear error", async () => {
  const card = cardDefinitionFileSchema.parse(
    JSON.parse(
      readFileSync("tests/fixtures/dsl-v2/austere-command.json", "utf8"),
    ),
  );
  const compiled = compileCard(
    {
      components: card.imported.components,
      abilities: card.authored.abilities,
    },
    await readRegistries("catalog"),
  );
  expect(compiled.ok).toBe(true);
  const down = downCompile(compiled.ok ? compiled.abilities : []);
  expect(down).toEqual({
    ok: false,
    errors: [
      {
        path: "abilities[0]",
        message: "Modes is not supported by the current runtime.",
      },
    ],
  });
});

test("unsupported constructs name their path", () => {
  const down = downCompile([
    {
      id: "drain",
      kind: "spell",
      effects: [
        { kind: "draw", count: 1 },
        { kind: "lose-life", player: { target: "t" }, amount: 1 },
      ],
    },
  ]);
  expect(down).toEqual({
    ok: false,
    errors: [
      {
        path: "abilities[0].effects[1]",
        message:
          'Life loss for {"target":"t"} is not supported by the current runtime.',
      },
    ],
  });
});
