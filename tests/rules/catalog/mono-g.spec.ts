import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { CatalogService } from "../../../src/server/catalog/catalog.service";
import { readCatalog } from "../../../src/server/catalog/catalog-files";
import { automationEligible } from "../../../src/server/match/commander";
import { MatchService } from "../../../src/server/match/match.service";
import { emptyRoom } from "../../support/rules-game";

// The Mono-G decklist port (docs/plans/mono-g-port.md): every card of
// sample-decklists/mono-g.md is in the catalog, implemented and playable.

const decklist = readFileSync("sample-decklists/mono-g.md", "utf8");
const deck = decklist
  .split("\n")
  .filter(Boolean)
  .map((line) => {
    const [, quantity, name] = line.match(/^(\d+) (.+)$/)!;
    return { quantity: Number(quantity), name };
  });

/** Cards with nothing to author: vanilla creatures and basic lands. */
const withoutAbilities = ["Forest", "Gigantosaurus", "Terrian, World Tyrant"];

test("every Mono-G card is in the catalog with its abilities authored and implemented", async () => {
  const catalog = await readCatalog("catalog");
  const byName = new Map(
    Object.values(catalog.definitions).map((d) => [d.canonicalName, d]),
  );
  const missing: string[] = [];
  const unauthored: string[] = [];
  const unimplemented: string[] = [];
  for (const { name } of deck) {
    const card = byName.get(name);
    if (!card) missing.push(name);
    else {
      if (card.automationStatus !== "implemented") unimplemented.push(name);
      if (!card.authoredAbilities.length && !withoutAbilities.includes(name))
        unauthored.push(name);
    }
  }
  expect(missing).toEqual([]);
  expect(unauthored).toEqual([]);
  expect(unimplemented).toEqual([]);
});

test("the complete Mono-G pool resolves to 100 cards and 69 supported definitions in mirror and practice setup", async () => {
  const catalog = await readCatalog("catalog");
  const entries = new CatalogService().resolveDecklist(decklist, catalog);
  expect(entries.reduce((n, e) => n + e.quantity, 0)).toBe(100);
  expect(new Set(entries.map((e) => e.definitionId)).size).toBe(69);
  expect(
    entries
      .filter((e) => !automationEligible(catalog.definitions[e.definitionId]))
      .map((e) => catalog.definitions[e.definitionId].canonicalName),
  ).toEqual([]);
  const room = emptyRoom();
  const commander = Object.values(catalog.definitions).find(
    (d) => d.canonicalName === "Surrak and Goreclaw",
  )!;
  room.participants[0].deck!.entries = entries;
  room.participants[0].deck!.commanderId = commander.id;
  room.participants.push({
    ...structuredClone(room.participants[0]),
    id: randomUUID(),
    name: "Bob",
  });
  const mirror = new MatchService().createCommander(
    room,
    catalog,
    room.participants[0].id,
  );
  expect(Object.keys(mirror.instances)).toHaveLength(200);
  room.participants.pop();
  const practice = new MatchService().createCommander(
    room,
    catalog,
    room.participants[0].id,
  );
  expect(practice.rules.practice).toBeDefined();
  expect(Object.keys(practice.instances)).toHaveLength(200);
});
