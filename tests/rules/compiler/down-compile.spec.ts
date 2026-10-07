import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { readCatalog } from "../../../src/server/catalog/catalog-files";
import { compileCard } from "../../../src/server/rules/compiler";
import { downCompile } from "../../../src/server/rules/down-compiler";
import { readRegistries } from "../../../src/server/rules/registries";
import type { CardAbility } from "../../../src/shared/model";
import { rulesAbilitySchema } from "../../../src/shared/rules";
import { cardDefinitionFileSchema } from "../../../src/shared/rules-v2";

// Golden test (rules-test-plan.md §17, "DSL migration"): every implemented
// card, loaded from its version 2 file through compiler and down-compiler,
// runs what the version 1 catalog ran. tests/fixtures/golden holds the
// version 1 runtime abilities, captured when the catalog was migrated
// (roadmap issue 6). Only the ability fields the engine reads are compared:
// id, kind, description, the activation zone of activated abilities
// (canActivateFromZone, the cycling check) and the rules.
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
const golden: Record<string, unknown[]> = JSON.parse(
  readFileSync("tests/fixtures/golden/v1-runtime-abilities.json", "utf8"),
);

test("every implemented card loads to the version 1 runtime abilities", async () => {
  const catalog = await readCatalog("catalog");
  const implemented = Object.values(catalog.definitions).filter(
    (card) => card.automationStatus === "implemented",
  );
  expect(implemented.length).toBe(67);
  for (const card of implemented)
    expect
      .soft(
        JSON.parse(JSON.stringify(card.abilities.map(engineView))),
        card.canonicalName,
      )
      .toEqual(golden[card.id] ?? []);
  expect(
    Object.keys(golden).filter(
      (id) => catalog.definitions[id]?.automationStatus !== "implemented",
    ),
  ).toEqual([]);
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
