import {
  compileCard,
  type CompileError,
} from "../../src/server/rules/compiler";
import { readRegistries } from "../../src/server/rules/registries";
import { checkSupport } from "../../src/server/rules/support";
import type { CardDefinition } from "../../src/shared/model";
import type { Ability } from "../../src/shared/rules-v2";

// Inline test cards are authored in DSL version 2 and load the way catalog
// files do: the compiler, then the runtime support check (dsl-redesign.md
// §9). Authoring errors throw with their paths.

/** Replaces a Card Definition's authored abilities and the Core abilities the engine runs. */
export async function author(
  definition: CardDefinition,
  abilities: Ability[],
): Promise<CardDefinition> {
  const compiled = compileCard(
    { components: definition.components, abilities },
    await readRegistries("catalog"),
  );
  const fail = (errors: CompileError[]) =>
    new Error(errors.map((e) => `${e.path}: ${e.message}`).join("\n"));
  if (!compiled.ok) throw fail(compiled.errors);
  const runtime = checkSupport(compiled.abilities);
  if (!runtime.ok) throw fail(runtime.errors);
  definition.authoredAbilities = abilities;
  definition.abilities = compiled.abilities;
  return definition;
}
