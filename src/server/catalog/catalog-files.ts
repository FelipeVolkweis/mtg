import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import type { CardDefinition, Catalog } from "../../shared/model.js";
import {
  type CardDefinitionFile,
  cardDefinitionFileSchema,
} from "../../shared/card-dsl.js";
import { compileCard, type CompileError } from "../rules/compiler.js";
import { checkSupport } from "../rules/support.js";
import { readRegistries, type Registries } from "../rules/registries.js";
import { nameKey } from "./card-names.js";
import { deriveFields, typeLine } from "./derive.js";

const uuid = z.uuid();

const loadError = (name: string, errors: CompileError[]) =>
  new Error(errors.map((e) => `${name}: ${e.path}: ${e.message}`).join("\n"));

/**
 * Loads a version 2 file into the Card Definition the engine uses: derived
 * values, then the compiler and the runtime support check
 * (docs/rules-engine.md); the engine runs the Core AST it emits. An authored
 * error fails the load. An implemented card the current runtime can't run
 * fails too; an unimplemented one loads without runtime abilities.
 */
export function definitionFromFile(
  file: CardDefinitionFile,
  registries: Registries,
): CardDefinition {
  const { form, components, colorIdentity, defaultPrintingId } = file.imported;
  const { automationStatus, abilities } = file.authored;
  const derived = deriveFields(form, components);
  const compiled = compileCard({ components, abilities }, registries);
  if (!compiled.ok) throw loadError(derived.canonicalName, compiled.errors);
  const runtime = checkSupport(compiled.abilities);
  if (!runtime.ok && automationStatus === "implemented")
    throw loadError(derived.canonicalName, runtime.errors);
  return {
    id: file.id,
    canonicalName: derived.canonicalName,
    defaultPrintingId,
    form,
    colorIdentity,
    components: components.map((component) => ({
      ...component,
      typeLine: typeLine(component),
    })),
    oracleText: derived.oracleText,
    keywords: derived.keywords,
    manaValue: derived.manaValue,
    automationStatus,
    abilities: runtime.ok ? compiled.abilities : [],
    authoredAbilities: abilities,
  };
}

/** The version 2 file of a Card Definition: imported facts and authored abilities only. */
export function definitionFile(card: CardDefinition): CardDefinitionFile {
  return cardDefinitionFileSchema.parse({
    catalogVersion: 2,
    id: card.id,
    imported: {
      form: card.form,
      components: card.components.map(
        ({ typeLine: _typeLine, ...component }) => component,
      ),
      colorIdentity: card.colorIdentity,
      defaultPrintingId: card.defaultPrintingId,
    },
    authored: {
      automationStatus: card.automationStatus,
      abilities: card.authoredAbilities,
    },
  });
}

const printing = z
  .object({
    id: uuid,
    definitionId: uuid,
    setCode: z.string().min(2),
    collectorNumber: z.string().min(1),
    artwork: z.array(z.url()).min(1),
  })
  .strict();
const names = z.array(
  z
    .object({
      name: z.string().min(1),
      canonicalName: z.string().optional(),
      component: z.number().int().nonnegative().optional(),
    })
    .strict(),
);
const sets = z.array(z.string().min(2));
const identities = z.record(uuid, uuid);

export function catalogRoot() {
  return resolve(process.env.CATALOG_ROOT ?? "catalog");
}

async function json(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

async function catalogInode(root: string) {
  try {
    return (await stat(root)).ino;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    if (loaded?.root === root) return loaded.inode;
    // A live directory swap normally finishes immediately. An interrupted one
    // leaves the previous complete release at this deterministic backup path.
    for (let retry = 0; retry < 5; retry++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      try {
        return (await stat(root)).ino;
      } catch (retryError) {
        if ((retryError as NodeJS.ErrnoException).code !== "ENOENT")
          throw retryError;
      }
    }
    await rename(`${root}.previous`, root);
    return (await stat(root)).ino;
  }
}

function definitionFilename(card: { id: string; canonicalName: string }) {
  const parts = Array.from(
    card.canonicalName
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-|-$/g, ""),
  );
  while (Buffer.byteLength(parts.join("")) > 180) parts.pop();
  const slug = parts.join("").replace(/-$/g, "") || "card";
  return `${slug}-${card.id}.json`;
}

async function records<T, R extends { id: string } = T & { id: string }>(
  root: string,
  directory: string,
  schema: z.ZodType<T>,
  filename: (record: R) => string = (record) => `${record.id}.json`,
  load: (parsed: T) => R = (parsed) => parsed as unknown as R,
): Promise<Record<string, R>> {
  const result: Record<string, R> = {};
  for (const file of await readdir(join(root, directory))) {
    if (!file.endsWith(".json")) continue;
    const record = load(schema.parse(await json(join(root, directory, file))));
    if (file !== filename(record) || result[record.id])
      throw new Error(`Invalid ${directory} filename or duplicate: ${file}`);
    result[record.id] = record;
  }
  return result;
}

let loaded: { root: string; inode: number; catalog: Catalog } | undefined;
export async function readCatalog(root = catalogRoot()): Promise<Catalog> {
  const inode = await catalogInode(root);
  if (loaded?.root === root && loaded.inode === inode) return loaded.catalog;
  const registries = await readRegistries(root);
  const [definitions, printings, directory, importedSets] = await Promise.all([
    records(
      root,
      "definitions",
      cardDefinitionFileSchema,
      definitionFilename,
      (file) => definitionFromFile(file, registries),
    ),
    records(root, "printings", printing),
    json(join(root, "names.json")).then((value) => names.parse(value)),
    json(join(root, "sets.json")).then((value) => sets.parse(value)),
  ]);
  for (const card of Object.values(definitions)) {
    const defaultPrinting = printings[card.defaultPrintingId];
    if (!defaultPrinting || defaultPrinting.definitionId !== card.id)
      throw new Error(`Missing default printing for ${card.id}`);
  }
  for (const card of Object.values(printings))
    if (!definitions[card.definitionId])
      throw new Error(`Missing definition for ${card.id}`);
  for (const card of Object.values(printings))
    if (!importedSets.includes(card.setCode))
      throw new Error(`Missing imported set for ${card.id}`);
  const nameMap = Object.fromEntries(
    directory.map((entry) => [nameKey(entry.name), entry]),
  );
  if (
    Object.keys(nameMap).length !== directory.length ||
    new Set(importedSets).size !== importedSets.length
  )
    throw new Error("Catalog contains duplicate names or sets");
  const catalog = { definitions, printings, names: nameMap, importedSets };
  loaded = { root, inode, catalog };
  return catalog;
}

export async function readIdentityMap(root = catalogRoot()) {
  return identities.parse(await json(join(root, "identity-map.json")));
}

async function put(root: string, relative: string, value: unknown) {
  const path = join(root, relative);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function publishCatalog(catalog: Catalog, root = catalogRoot()) {
  const parent = dirname(root);
  await mkdir(parent, { recursive: true });
  const stage = await mkdtemp(join(parent, ".catalog-stage-"));
  const backup = `${root}.previous`;
  let moved = false;
  try {
    await cp(root, stage, { recursive: true });
    await Promise.all(
      (await readdir(join(stage, "definitions")))
        .filter((file) => file.endsWith(".json"))
        .map((file) => rm(join(stage, "definitions", file))),
    );
    await Promise.all([
      ...Object.values(catalog.definitions).map((card) =>
        put(
          stage,
          `definitions/${definitionFilename(card)}`,
          definitionFile(card),
        ),
      ),
      ...Object.values(catalog.printings).map((card) =>
        put(stage, `printings/${card.id}.json`, card),
      ),
      put(
        stage,
        "names.json",
        Object.values(catalog.names).sort((a, b) =>
          nameKey(a.name).localeCompare(nameKey(b.name)),
        ),
      ),
      put(stage, "sets.json", catalog.importedSets),
    ]);
    await readCatalog(stage);
    await rm(backup, { recursive: true, force: true });
    await rename(root, backup);
    moved = true;
    await rename(stage, root);
    moved = false;
  } catch (error) {
    if (moved) await rename(backup, root);
    throw error;
  } finally {
    await rm(stage, { recursive: true, force: true });
    if (!moved) await rm(backup, { recursive: true, force: true });
  }
}
