import { expect, test } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
import {
  dryRun,
  migrateAbilities,
  migrateDefinition,
} from "../../../src/server/catalog/migrate-rules-v2";
import type { CardAbility } from "../../../src/shared/model";
import { rulesAbilitySchema } from "../../../src/shared/rules";

// The version 1 → version 2 migration (dsl-redesign.md §9, card-model-refactor.md §6).
// Inline test definitions are rewritten by hand in roadmap issue 6.

const definitions = "catalog/definitions";
const files = readdirSync(definitions).filter((f) => f.endsWith(".json"));
const read = (file: string) =>
  JSON.parse(readFileSync(`${definitions}/${file}`, "utf8"));

test("the dry run maps every catalog definition", async () => {
  const report = await dryRun("catalog");
  expect(report.unmapped).toEqual([]);
  expect(report.definitions).toBe(783);
  expect(report.migrated).toBe(783);
});

test("migration is idempotent and deterministic", () => {
  for (const file of files) {
    const once = migrateDefinition(read(file));
    expect(once.ok, file).toBe(true);
    if (!once.ok) continue;
    const twice = migrateDefinition(once.file);
    expect(twice.ok && twice.file, file).toEqual(once.file);
    const again = migrateDefinition(read(file));
    expect(again.ok && again.file, file).toEqual(once.file);
  }
});

test("migrated files drop stored derived values and the type line", () => {
  const file = files.find((f) => f.startsWith("sol-ring-"))!;
  const result = migrateDefinition(read(file));
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(Object.keys(result.file).sort()).toEqual([
    "authored",
    "catalogVersion",
    "id",
    "imported",
  ]);
  expect(result.file.imported.components[0]).not.toHaveProperty("typeLine");
  expect(result.file.authored.abilities).toEqual([
    {
      id: "mana",
      description: "{T}: Add {C}{C}.",
      kind: "mana",
      activation: { costs: [{ kind: "tap-source" }] },
      produce: { quantity: 2, colors: ["C"] },
    },
  ]);
});

test("a stored derived value that disagrees with derivation stops the migration", () => {
  const raw = read(files.find((f) => f.startsWith("sol-ring-"))!);
  const result = migrateDefinition({ ...raw, manaValue: 7 });
  expect(result).toEqual({
    ok: false,
    errors: [{ path: "manaValue", message: "Derived manaValue 1 ≠ stored 7." }],
  });
});

const ability = (
  kind: CardAbility["kind"],
  rules: unknown,
  extra: Partial<CardAbility> = {},
): CardAbility => ({
  id: "a",
  kind,
  origin: "printed",
  rules: rulesAbilitySchema.parse(rules),
  ...extra,
});

test("constructs without a mapping are reported with their path", () => {
  const { errors } = migrateAbilities([
    ability("triggered", {
      trigger: { event: "cast", filter: { zone: "stack" }, step: 2 },
      effects: [{ kind: "draw", count: 1 }],
    }),
    ability("activated", {
      costs: [{ kind: "tap-source" }],
      effects: [{ kind: "pay-mana", symbols: ["{1}"], bind: "paid" }],
    }),
    ability("static", { effects: [] }, { origin: "rules" }),
  ]);
  expect(errors).toEqual([
    {
      path: "abilities[0].rules.trigger.step",
      message: "Unmapped field step on a cast trigger.",
    },
    {
      path: "abilities[1].rules.effects[0]",
      message: "pay-mana must be followed by an if on its binding.",
    },
    {
      path: "abilities[1].rules.effects",
      message: "The ability has no effects.",
    },
    { path: "abilities[2].origin", message: 'Origin "rules" has no mapping.' },
    {
      path: "abilities[2].rules",
      message: "A static ability with nothing to grant.",
    },
  ]);
});

test("version 1 filters map field by field (dsl-redesign.md §6.3)", () => {
  const { abilities, errors } = migrateAbilities([
    ability("spell", {
      target: {
        zone: "battlefield",
        kind: "permanent",
        controller: "opponent",
        allTypes: ["Artifact", "Creature"],
        excludeTypes: ["Land"],
        self: "exclude",
        nontoken: true,
        untapped: true,
        colorless: true,
      },
      effects: [{ kind: "destroy", subject: "target" }],
    }),
  ]);
  expect(errors).toEqual([]);
  expect(abilities[0]).toEqual({
    id: "a",
    kind: "spell",
    targets: [
      {
        id: "target-0",
        filter: {
          and: [
            {
              zone: "battlefield",
              object: "permanent",
              controller: "opponents",
              status: "untapped",
              color: "colorless",
            },
            { type: "Artifact" },
            { type: "Creature" },
            { not: { is: "source" } },
            { not: { object: "token" } },
            { not: { type: ["Land"] } },
          ],
        },
      },
    ],
    effects: [{ kind: "destroy", objects: "target" }],
  });
});
