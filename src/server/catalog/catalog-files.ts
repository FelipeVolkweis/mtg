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
import {
  characteristicSchema,
  zoneKinds,
  type Catalog,
} from "../../shared/model.js";
import { nameKey } from "./card-names.js";

const uuid = z.uuid();
const abilityValue = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("integer"), value: z.number().int() }).strict(),
  z.object({ kind: z.literal("boolean"), value: z.boolean() }).strict(),
  z.object({ kind: z.literal("text"), value: z.string() }).strict(),
  z.object({ kind: z.literal("reference"), value: z.string().min(1) }).strict(),
  z
    .object({
      kind: z.literal("mana-symbols"),
      symbols: z.array(z.string().regex(/^\{[^{}]+\}$/)).min(1),
    })
    .strict(),
]);
const primitive = z
  .object({
    primitive: z.string().min(1),
    parameters: z.record(z.string(), abilityValue).optional(),
  })
  .strict();
const cost = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("mana"),
      symbols: z.array(z.string().regex(/^\{[^{}]+\}$/)).min(1),
    })
    .strict(),
  primitive.extend({ kind: z.literal("primitive") }),
]);
const ability = z
  .object({
    id: z.string().min(1),
    kind: z.enum(["static", "triggered", "activated", "spell"]),
    origin: z.enum(["printed", "rules"]),
    applicableZone: z.enum(zoneKinds).optional(),
    keyword: z.string().optional(),
    trigger: z
      .object({ kind: z.enum(["event", "state"]), condition: primitive })
      .strict()
      .optional(),
    costs: z.array(cost).optional(),
    conditions: z.array(primitive).optional(),
    effects: z.array(primitive).optional(),
  })
  .strict();
const definition = z
  .object({
    id: uuid,
    canonicalName: z.string().min(1),
    defaultPrintingId: uuid,
    form: z.string().min(1),
    colorIdentity: z.array(z.enum(["W", "U", "B", "R", "G"])),
    components: z.array(characteristicSchema).min(1),
    oracleText: z.string(),
    keywords: z.array(z.string()),
    manaValue: z.number().nonnegative(),
    automationStatus: z.enum(["unimplemented", "implemented"]),
    abilities: z.array(ability),
  })
  .strict();
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

async function records<T>(
  root: string,
  directory: string,
  schema: z.ZodType<T>,
  filename: (record: T & { id: string }) => string = (record) =>
    `${record.id}.json`,
): Promise<Record<string, T>> {
  const result: Record<string, T> = {};
  for (const file of await readdir(join(root, directory))) {
    if (!file.endsWith(".json")) continue;
    const record = schema.parse(
      await json(join(root, directory, file)),
    ) as T & { id: string };
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
  const [definitions, printings, directory, importedSets] = await Promise.all([
    records(root, "definitions", definition, definitionFilename),
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
        put(stage, `definitions/${definitionFilename(card)}`, card),
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
