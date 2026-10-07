import {
  compileCard,
  type CompileError,
} from "../../src/server/rules/compiler";
import { downCompile } from "../../src/server/rules/down-compiler";
import { readRegistries } from "../../src/server/rules/registries";
import type { CardDefinition } from "../../src/shared/model";
import type { Ability } from "../../src/shared/rules-v2";

// Inline test cards are authored in DSL version 2 and load the way catalog
// files do: compiler, then down-compiler (dsl-redesign.md §9). Authoring
// errors throw with their paths.

/** Replaces a Card Definition's authored abilities and its runtime abilities. */
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
  const runtime = downCompile(compiled.abilities);
  if (!runtime.ok) throw fail(runtime.errors);
  definition.authoredAbilities = abilities;
  definition.abilities = runtime.abilities;
  return definition;
}
