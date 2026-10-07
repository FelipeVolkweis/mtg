import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { abilitySchema, componentSchema } from "../../shared/rules-v2.js";

// Vocabularies the rules DSL references by name (dsl-redesign.md §4.11).

export const tokenDefinitionSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    characteristics: componentSchema,
    abilities: z.array(abilitySchema).max(20),
  })
  .strict();
export type TokenDefinition = z.infer<typeof tokenDefinitionSchema>;

/** Counter kinds; `stats` marks counters that modify power and toughness. */
export const counterKinds = {
  "+1/+1": { stats: { power: 1, toughness: 1 } },
  "-1/-1": { stats: { power: -1, toughness: -1 } },
  page: {},
  loyalty: {},
} as const;
export type CounterKind = keyof typeof counterKinds;

export interface Registries {
  tokens: Record<string, TokenDefinition>;
  counters: Record<string, unknown>;
}

/**
 * Reads `catalog/tokens/<id>.json` files; the file name must match the id. A
 * catalog without a tokens directory has no tokens.
 */
export async function readTokens(
  root: string,
): Promise<Record<string, TokenDefinition>> {
  const tokens: Record<string, TokenDefinition> = {};
  const directory = join(root, "tokens");
  let files: string[];
  try {
    files = await readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return tokens;
    throw error;
  }
  for (const file of files.sort()) {
    if (!file.endsWith(".json")) continue;
    const token = tokenDefinitionSchema.parse(
      JSON.parse(await readFile(join(directory, file), "utf8")),
    );
    if (file !== `${token.id}.json`)
      throw new Error(`Token file ${file} must be named ${token.id}.json.`);
    tokens[token.id] = token;
  }
  return tokens;
}

export async function readRegistries(root: string): Promise<Registries> {
  return { tokens: await readTokens(root), counters: counterKinds };
}
