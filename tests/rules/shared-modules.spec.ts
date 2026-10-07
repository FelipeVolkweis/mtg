import { expect, test } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import {
  characteristicSchema,
  colors,
  manaTypes,
  zoneKinds,
} from "../../src/shared/card-dsl";
import { matchActionSchema } from "../../src/shared/rules-state";

// The shared modules: the card DSL defines the card vocabulary, the runtime
// Match state builds on it, and the model builds on both.

const dir = "src/shared";
const modules = readdirSync(dir).filter((f) => f.endsWith(".ts"));

function sharedImports(file: string) {
  const text = readFileSync(join(dir, file), "utf8");
  return [...text.matchAll(/from "\.\/([\w-]+)\.js"/g)].map(
    (m) => `${m[1]}.ts`,
  );
}

test("shared modules import each other without a cycle", () => {
  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (file: string, path: string[]) => {
    if (done.has(file)) return;
    expect(visiting.has(file), [...path, file].join(" -> ")).toBe(false);
    visiting.add(file);
    for (const next of sharedImports(file)) visit(next, [...path, file]);
    visiting.delete(file);
    done.add(file);
  };
  for (const file of modules) visit(file, []);
  expect(sharedImports("card-dsl.ts")).toEqual([]);
});

test("shared modules use no inline import() types", () => {
  for (const file of modules)
    expect(readFileSync(join(dir, file), "utf8"), file).not.toContain(
      "import(",
    );
});

function enumValues(schema: z.ZodType): readonly string[] {
  let current: z.ZodType = schema;
  for (;;) {
    if (current instanceof z.ZodOptional || current instanceof z.ZodDefault)
      current = current.unwrap() as z.ZodType;
    else if (current instanceof z.ZodArray)
      current = current.element as z.ZodType;
    else break;
  }
  expect(current).toBeInstanceOf(z.ZodEnum);
  return (current as z.ZodEnum).options as string[];
}

test("Characteristics colors are the shared colors", () => {
  const { shape } = characteristicSchema;
  expect(enumValues(shape.colors)).toEqual(colors);
  expect(enumValues(shape.colorIndicator)).toEqual(colors);
});

test("Match action colors are the shared mana types", () => {
  const colorOf = (type: string) => {
    const option = matchActionSchema.options.find(
      (o) => o.shape.type.value === type,
    )!;
    return (option.shape as Record<string, z.ZodType>).color;
  };
  expect(enumValues(colorOf("activate-ability"))).toEqual(manaTypes);
  expect(enumValues(colorOf("rules-input"))).toEqual(manaTypes);
});

test("mana types are the colors and colorless; zone kinds are the seven Zones", () => {
  expect(manaTypes).toEqual([...colors, "C"]);
  expect(zoneKinds).toEqual([
    "library",
    "hand",
    "graveyard",
    "battlefield",
    "stack",
    "exile",
    "command",
  ]);
});
