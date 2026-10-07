import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { readCatalog } from "../../../src/server/catalog/catalog-files";
import { compileCard } from "../../../src/server/rules/compiler";
import { downCompile } from "../../../src/server/rules/down-compiler";
import { readRegistries } from "../../../src/server/rules/registries";
import type { CardAbility } from "../../../src/shared/model";
import { liftAbility } from "../../../src/server/room/lift-v1-effects";
import { rulesAbilitySchema } from "../../../src/shared/rules";
import { cardDefinitionFileSchema } from "../../../src/shared/rules-v2";

// Golden test (rules-test-plan.md §17, "DSL migration"): every implemented
// card, loaded from its version 2 file through compiler and down-compiler,
// runs what the version 1 catalog ran. tests/fixtures/golden holds the
// version 1 runtime abilities, captured when the catalog was migrated
// (roadmap issue 6). Since roadmap issue 7 the runtime keeps Core AST effects,
// so each golden ability is lifted the way snapshot version 3 lifts a stored
// Room (src/server/room/lift-v1-effects.ts) before comparing. Only the ability
// fields the engine reads are compared: id, kind, description, the activation
// zone of activated abilities (canActivateFromZone, the cycling check) and
// the rules.
const engineView = (ability: CardAbility) => ({
  id: ability.id,
  kind: ability.kind,
  description: ability.description,
  activationZone:
    ability.kind === "activated"
      ? (ability.applicableZone ?? "battlefield")
      : undefined,
  rules: canonical(rulesAbilitySchema.parse(ability.rules)),
});

/**
 * Equivalent Core forms that differ only in spelling: a token count of 1 is
 * the default, binding names are local ("germ" vs the lifted "created"), and
 * a number read from an object binding is its count.
 */
function canonical(node: unknown, names = new Map<string, string>()): unknown {
  if (Array.isArray(node)) return node.map((n) => canonical(n, names));
  if (!node || typeof node !== "object") return node;
  const record = node as Record<string, unknown>;
  const token = record.kind === "create-token";
  if (token && typeof record.bind === "string")
    names.set(record.bind, "created");
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record))
    if (!(token && key === "count" && value === 1))
      out[key] = canonical(value, names);
  if (token && out.bind) out.bind = "created";
  const keys = Object.keys(out);
  if (keys.length === 1 && typeof out.binding === "string")
    return { binding: names.get(out.binding) ?? out.binding };
  if (
    keys.length === 1 &&
    out.count &&
    typeof out.count === "object" &&
    "binding" in out.count
  )
    return out.count;
  return out;
}
const golden: Record<string, { rules: Record<string, unknown> }[]> = JSON.parse(
  readFileSync("tests/fixtures/golden/v1-runtime-abilities.json", "utf8"),
);
for (const abilities of Object.values(golden))
  for (const ability of abilities) {
    liftAbility(ability.rules);
    ability.rules = JSON.parse(
      JSON.stringify(canonical(rulesAbilitySchema.parse(ability.rules))),
    );
  }

test("every implemented card loads to the lifted version 1 runtime abilities", async () => {
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
        {
          kind: "if",
          condition: { compare: [1, ">=", 1] },
          then: [{ kind: "shuffle", player: "you" }],
        },
      ],
    },
  ]);
  expect(down).toEqual({
    ok: false,
    errors: [
      {
        path: "abilities[0].effects[1]",
        message: "The shuffle effect is not supported by the current runtime.",
      },
    ],
  });
});
