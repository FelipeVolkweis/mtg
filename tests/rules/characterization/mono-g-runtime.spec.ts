// Characterization tests: the Mono-G cards whose runtime the second phase of
// the port added (docs/plans/mono-g-port.md). The first phase's tests are in
// mono-g.spec.ts.
//
// Classification (rules test plan §2):
// | Test | Class | Reason
// | --- | --- | ---
// | Whiptongue Hydra destroys every flier and grows for each | Add |
// | Elemental Bond draws for a creature with power 3 or greater only | Add |
// | Tangleweave Armor's germ gets +X/+X for the greatest mana value among your commanders | Add |
// | Yeva lets you cast green creature spells at instant speed | Add |
// | Managorger Hydra grows whenever a player casts a spell | Add |
// | Overwhelming Stampede gives each creature trample and the greatest power | Add |
// | Rhonas's Monument discounts green creature spells and pumps a creature when you cast one | Add |
// | Beast Within destroys a permanent and gives its controller a Beast | Add |
// | Arasta makes a Spider whenever an opponent casts an instant or sorcery spell | Add |

import { expect, test } from "@playwright/test";
import { matchView } from "../../../src/server/match/match-view";
import "../../support/round-trip";
import { rulesGame, triggerGame } from "../../support/rules-game";
import { force } from "../../support/force";

test("Whiptongue Hydra destroys every flier and grows for each", async () => {
  const game = await triggerGame();
  const own = game.seed("Birds of Paradise", "battlefield");
  const theirs = game.seed("Birds of Paradise", "battlefield", 1);
  const ground = game.seed("Llanowar Elves", "battlefield", 1);
  const hydra = game.seed("Whiptongue Hydra", "hand");
  force.mana(game.match, game.match.players[0].id, { G: 5, C: 5 });
  game.command(0, { type: "cast-spell", objectId: hydra.id });
  game.pass(); // the creature spell enters
  game.pass(); // its trigger
  expect(game.match.objects[own.id]).toBeUndefined();
  expect(game.match.objects[theirs.id]).toBeUndefined();
  expect(game.match.objects[ground.id]).toBeDefined();
  const entered = Object.values(game.match.objects).find(
    (o) => o.characteristics.name === "Whiptongue Hydra",
  )!;
  expect(entered.counters).toEqual([{ kind: "+1/+1", quantity: "2" }]);
});

test("Elemental Bond draws for a creature with power 3 or greater only", async () => {
  for (const [name, draws] of [
    ["Gigantosaurus", 1],
    ["Llanowar Elves", 0],
  ] as [string, number][]) {
    const game = await triggerGame();
    game.seed("Elemental Bond", "battlefield");
    const creature = game.seed(name, "hand");
    force.mana(game.match, game.match.players[0].id, { G: 9, C: 9 });
    const before = game.handCount();
    game.command(0, { type: "cast-spell", objectId: creature.id });
    game.pass();
    game.pass();
    expect(game.handCount()).toBe(before - 1 + draws);
  }
});

test("Tangleweave Armor's germ gets +X/+X for the greatest mana value among your commanders", async () => {
  const game = await triggerGame();
  const armor = game.seed("Tangleweave Armor", "hand");
  const player = game.match.players[0].id;
  const commander = Object.values(game.match.objects).find((o) =>
    o.cardInstanceIds.includes(game.match.rules.commanders[player].instanceId),
  )!;
  commander.characteristics.manaValue = 4;
  force.mana(game.match, player, { C: 9, G: 9 });
  game.command(0, { type: "cast-spell", objectId: armor.id });
  game.pass(); // the Equipment enters
  game.pass(); // living weapon
  const germ = Object.values(game.match.objects).find(
    (o) => o.characteristics.name === "Phyrexian Germ",
  )!;
  const c = game.view().objects[germ.id].characteristics;
  expect([c.power, c.toughness]).toEqual(["4", "4"]);
});

test("Yeva lets you cast green creature spells at instant speed", async () => {
  const game = await rulesGame();
  const green = game.seed("Llanowar Elves", "hand");
  const colorless = game.seed("Silver Myr", "hand");
  force.mana(game.match, game.match.players[0].id, { G: 5, C: 5 });
  force.step(game.match, "upkeep");
  expect(game.command(0, { type: "cast-spell", objectId: green.id }).kind).toBe(
    "rejected",
  );
  game.seed("Yeva, Nature's Herald", "battlefield");
  expect(
    game.command(0, { type: "cast-spell", objectId: colorless.id }).kind,
  ).toBe("rejected");
  expect(game.command(0, { type: "cast-spell", objectId: green.id }).kind).toBe(
    "accepted",
  );
});

const stats = (game: Awaited<ReturnType<typeof rulesGame>>, id: string) => {
  const c = matchView(game.match, game.room.participants[0].id, game.catalog)
    .objects[id].characteristics;
  return { power: c.power, toughness: c.toughness, keywords: c.keywords };
};
/** Both players pass: the top of the Stack resolves. */
const resolveTop = (game: Awaited<ReturnType<typeof rulesGame>>) => {
  game.command(0, { type: "pass-priority" });
  game.command(1, { type: "pass-priority" });
};

test("Managorger Hydra grows whenever a player casts a spell", async () => {
  const game = await rulesGame();
  const hydra = game.seed("Managorger Hydra", "battlefield");
  expect(stats(game, hydra.id).keywords).toEqual(["Trample"]);
  force.mana(game.match, game.match.players[0].id, { G: 8, C: 8 });
  for (let casts = 1; casts <= 2; casts++) {
    const spell = game.seed("Harmonize", "hand");
    game.command(0, { type: "cast-spell", objectId: spell.id });
    resolveTop(game); // the trigger above the spell
    resolveTop(game); // the spell
    expect(game.match.objects[hydra.id].counters).toEqual([
      { kind: "+1/+1", quantity: String(casts) },
    ]);
  }
  expect(stats(game, hydra.id)).toMatchObject({ power: "3", toughness: "3" });
});

test("Overwhelming Stampede gives each creature trample and the greatest power", async () => {
  const game = await rulesGame();
  const small = game.seed("Llanowar Elves", "battlefield");
  const big = game.seed("Gigantosaurus", "battlefield");
  const theirs = game.seed("Llanowar Elves", "battlefield", 1);
  const spell = game.seed("Overwhelming Stampede", "hand");
  force.mana(game.match, game.match.players[0].id, { G: 5, C: 5 });
  game.command(0, { type: "cast-spell", objectId: spell.id });
  resolveTop(game);
  expect(stats(game, small.id)).toEqual({
    power: "11",
    toughness: "11",
    keywords: ["Trample"],
  });
  expect(stats(game, big.id)).toMatchObject({ power: "20", toughness: "20" });
  expect(stats(game, theirs.id)).toMatchObject({ power: "1", keywords: [] });
});

test("Rhonas's Monument discounts green creature spells and pumps a creature when you cast one", async () => {
  const game = await rulesGame();
  game.seed("Rhonas's Monument", "battlefield");
  const elves = game.seed("Llanowar Elves", "battlefield");
  const green = game.seed("Regal Imperiosaur", "hand");
  const colorless = game.seed("Silver Myr", "hand");
  const player = game.match.players[0].id;
  force.mana(game.match, player, { G: 3, C: 3 });
  game.command(0, { type: "cast-spell", objectId: green.id });
  // Regal Imperiosaur costs {1}{G}{G} less {1}.
  expect(game.match.rules.mana[player]).toMatchObject({ G: 1, C: 3 });
  const pump = game.match.rules.pending;
  if (pump)
    game.command(0, {
      type: "rules-input",
      procedureId: matchView(
        game.match,
        game.room.participants[0].id,
        game.catalog,
      ).rules.prompt!.procedureId,
      targetIds: [elves.id],
    });
  resolveTop(game); // the pump above the spell
  expect(stats(game, elves.id)).toEqual({
    power: "3",
    toughness: "3",
    keywords: ["Trample"],
  });
  resolveTop(game); // the creature spell
  force.mana(game.match, player, { G: 0, C: 2 });
  game.command(0, { type: "cast-spell", objectId: colorless.id });
  // Not green: Silver Myr costs its full {2}.
  expect(game.match.rules.mana[player].C).toBe(0);
});

const battlefieldTokens = (
  game: Awaited<ReturnType<typeof rulesGame>>,
  name: string,
) =>
  Object.values(game.match.objects).filter(
    (o) =>
      o.kind === "token" &&
      o.characteristics.name === name &&
      game.match.zones.find((z) => z.id === o.zoneId)!.kind === "battlefield",
  );

test("Beast Within destroys a permanent and gives its controller a Beast", async () => {
  const game = await rulesGame();
  const ring = game.seed("Sol Ring", "battlefield", 1);
  const spell = game.seed("Beast Within", "hand");
  force.mana(game.match, game.match.players[0].id, { G: 3 });
  game.command(0, { type: "cast-spell", objectId: spell.id });
  game.command(0, {
    type: "rules-input",
    procedureId: matchView(
      game.match,
      game.room.participants[0].id,
      game.catalog,
    ).rules.prompt!.procedureId,
    targetIds: [ring.id],
  });
  resolveTop(game);
  expect(game.match.objects[ring.id]).toBeUndefined();
  const [beast, ...rest] = battlefieldTokens(game, "Beast");
  expect(rest).toEqual([]);
  expect(beast.controllerId).toBe(game.match.players[1].id);
  expect(stats(game, beast.id)).toMatchObject({ power: "3", toughness: "3" });
});

test("Arasta makes a Spider whenever an opponent casts an instant or sorcery spell", async () => {
  const game = await rulesGame();
  game.seed("Arasta of the Endless Web", "battlefield", 1);
  const creature = game.seed("Llanowar Elves", "hand");
  const sorcery = game.seed("Harmonize", "hand");
  force.mana(game.match, game.match.players[0].id, { G: 6, C: 6 });
  game.command(0, { type: "cast-spell", objectId: creature.id });
  expect(
    game.match.zones.find((z) => z.kind === "stack")!.objectIds,
  ).toHaveLength(1);
  resolveTop(game);
  expect(battlefieldTokens(game, "Spider")).toHaveLength(0);
  game.command(0, { type: "cast-spell", objectId: sorcery.id });
  resolveTop(game); // the trigger
  const [spider] = battlefieldTokens(game, "Spider");
  expect(spider.controllerId).toBe(game.match.players[1].id);
  expect(stats(game, spider.id)).toEqual({
    power: "1",
    toughness: "2",
    keywords: ["Reach"],
  });
});
