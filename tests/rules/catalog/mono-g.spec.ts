import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { readCatalog } from "../../../src/server/catalog/catalog-files";

// The Mono-G decklist port (docs/plans/mono-g-port.md): every card of
// sample-decklists/mono-g.md is in the catalog with its abilities authored,
// and the cards the runtime can't run yet are pinned here. Implementing one
// moves its name out of the list; the list is the port's remaining work.

const deck = readFileSync("sample-decklists/mono-g.md", "utf8")
  .split("\n")
  .filter(Boolean)
  .map((line) => {
    const [, quantity, name] = line.match(/^(\d+) (.+)$/)!;
    return { quantity: Number(quantity), name };
  });

/** Cards whose authored abilities need runtime the engine doesn't have. */
const unimplemented = [
  "Arachnogenesis",
  "Arasta of the Endless Web",
  "Beast Within",
  "Bite Down",
  "Bonders' Enclave",
  "Carnage Tyrant",
  "Challenger Troll",
  "Clifftop Lookout",
  "Collective Resistance",
  "Colossal Majesty",
  "Elder Gargaroth",
  "Elemental Bond",
  "Ezuri's Predation",
  "Garruk's Packleader",
  "Garruk's Uprising",
  "Ghalta, Primal Hunger",
  "Goreclaw, Terror of Qal Sisma",
  "Hulking Raptor",
  "Ilysian Caryatid",
  "Kenrith's Transformation",
  "Loot, Exuberant Explorer",
  "Managorger Hydra",
  "Monstrous Onslaught",
  "Mosswort Bridge",
  "Overwhelming Stampede",
  "Paradise Druid",
  "Pugnacious Hammerskull",
  "Ram Through",
  "Rhonas the Indomitable",
  "Rhonas's Monument",
  "Ripjaw Raptor",
  "Rishkar's Expertise",
  "Rishkar, Peema Renegade",
  "Scrapshooter",
  "Shamanic Revelation",
  "Steel Leaf Champion",
  "Surrak and Goreclaw",
  "Surrak, the Hunt Caller",
  "Tangleweave Armor",
  "Thickest in the Thicket",
  "Unnatural Growth",
  "Whiptongue Hydra",
  "Whisperer of the Wilds",
  "Witch's Clinic",
  "Yeva, Nature's Herald",
];

/** Cards with nothing to author: vanilla creatures and basic lands. */
const withoutAbilities = ["Forest", "Gigantosaurus", "Terrian, World Tyrant"];

test("every Mono-G card is in the catalog with its abilities authored", async () => {
  const catalog = await readCatalog("catalog");
  const byName = new Map(
    Object.values(catalog.definitions).map((d) => [d.canonicalName, d]),
  );
  const missing: string[] = [];
  const unauthored: string[] = [];
  for (const { name } of deck) {
    const card = byName.get(name);
    if (!card) missing.push(name);
    else if (
      !card.authoredAbilities.length &&
      !withoutAbilities.includes(name) &&
      card.automationStatus !== "implemented"
    )
      unauthored.push(name);
  }
  expect(missing).toEqual([]);
  expect(unauthored).toEqual([]);
});

test("the Mono-G cards the runtime can't run yet are the pinned ones", async () => {
  const catalog = await readCatalog("catalog");
  const byName = new Map(
    Object.values(catalog.definitions).map((d) => [d.canonicalName, d]),
  );
  const names = [...new Set(deck.map((entry) => entry.name))];
  const notImplemented = names
    .filter((name) => byName.get(name)!.automationStatus !== "implemented")
    .sort();
  expect(notImplemented).toEqual([...unimplemented].sort());
  expect(names.length - notImplemented.length).toBe(24);
});

test("an unimplemented Mono-G card keeps no runtime abilities", async () => {
  const catalog = await readCatalog("catalog");
  for (const definition of Object.values(catalog.definitions))
    if (unimplemented.includes(definition.canonicalName))
      expect(definition.abilities, definition.canonicalName).toEqual([]);
});
