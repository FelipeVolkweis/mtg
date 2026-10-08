import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { compileCard } from "../../../src/server/rules/compiler";
import { readRegistries } from "../../../src/server/rules/registries";
import { checkSupport } from "../../../src/server/rules/support";
import { cardDefinitionFileSchema } from "../../../src/shared/card-dsl";

// The runtime support check (dsl-redesign.md §9): the engine runs the Core
// AST the compiler emits, and constructs it can't run yet fail with an error
// naming the construct and its path. The catalog gate runs it on every
// implemented definition.

test("constructs the current runtime can't run fail with a clear error", async () => {
  const card = cardDefinitionFileSchema.parse(
    JSON.parse(
      readFileSync(
        "tests/fixtures/dsl-expressiveness/austere-command.json",
        "utf8",
      ),
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
  expect(checkSupport(compiled.ok ? compiled.abilities : [])).toEqual({
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
  expect(
    checkSupport([
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
    ]),
  ).toEqual({
    ok: false,
    errors: [
      {
        path: "abilities[0].effects[1]",
        message: "The shuffle effect is not supported by the current runtime.",
      },
    ],
  });
});

test("targets, triggers, costs and grants outside the runtime are named", () => {
  const cases: [Parameters<typeof checkSupport>[0][number], string, string][] =
    [
      [
        {
          id: "two",
          kind: "spell",
          targets: [
            { id: "a", filter: { zone: "battlefield" } },
            { id: "b", filter: { zone: "battlefield" } },
          ],
          effects: [],
        },
        "abilities[0]",
        "More than one target clause",
      ],
      [
        {
          id: "zoneless",
          kind: "spell",
          targets: [{ id: "a", filter: { type: "Creature" } }],
          effects: [],
        },
        "abilities[0].targets[0].filter",
        "A predicate without a zone",
      ],
      [
        {
          id: "gain",
          kind: "triggered",
          trigger: { event: "gains-life", player: "you" },
          effects: [],
        },
        "abilities[0].trigger",
        "The gains-life trigger",
      ],
      [
        {
          id: "exile",
          kind: "activated",
          costs: [{ kind: "exile-source" }],
          effects: [],
        },
        "abilities[0].costs[0]",
        "The exile-source cost",
      ],
      [
        {
          id: "steal",
          kind: "static",
          grants: [
            {
              kind: "continuous",
              objects: "source",
              changes: [{ kind: "gain-control", player: "you" }],
            },
          ],
        },
        "abilities[0].grants[0]",
        "Gaining control",
      ],
      [
        {
          id: "prevent",
          kind: "replacement",
          event: { event: "would-gain-life", player: "you" },
          replace: { kind: "prevent" },
        },
        "abilities[0]",
        "A prevent replacement of would-gain-life",
      ],
    ];
  for (const [ability, path, what] of cases)
    expect(checkSupport([ability])).toEqual({
      ok: false,
      errors: [
        { path, message: `${what} is not supported by the current runtime.` },
      ],
    });
});
