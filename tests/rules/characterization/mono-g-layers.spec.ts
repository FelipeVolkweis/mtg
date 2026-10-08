// Characterization tests: the Mono-G cards that need the layer-4 to layer-6
// changes the second phase of the port added (docs/plans/mono-g-port.md):
// setting types and colors, removing abilities and granting an ability.
//
// Classification (rules test plan §2):
// | Test | Class | Reason
// | --- | --- | ---
// | Kenrith's Transformation makes the creature a green Elk 3/3 with no abilities | Add |
// | Kenrith's Transformation ends when it leaves the Battlefield | Add |
// | an ability granted after Kenrith's Transformation is kept, one granted before is lost | Add |
// | Rishkar, Peema Renegade puts counters on up to two target creatures | Add |
// | Rishkar, Peema Renegade gives creatures you control with a counter a mana ability | Add |

import { expect, test } from "@playwright/test";
import "../../support/round-trip";
import { promptOf, viewOf } from "../../support/combat";
import { rulesGame, triggerGame } from "../../support/rules-game";
import { force } from "../../support/force";

type Game = Awaited<ReturnType<typeof rulesGame>>;
const characteristics = (game: Game, id: string) =>
  viewOf(game).objects[id].characteristics;
const both = (game: Game) => {
  game.command(0, { type: "pass-priority" });
  game.command(1, { type: "pass-priority" });
};

async function transformed() {
  const game = await triggerGame();
  const birds = game.seed("Birds of Paradise", "battlefield");
  const myr = game.seed("Silver Myr", "battlefield");
  const aura = game.seed("Kenrith's Transformation", "hand");
  force.mana(game.match, game.match.players[0].id, { G: 2 });
  game.command(0, { type: "cast-spell", objectId: aura.id });
  game.command(0, {
    type: "rules-input",
    procedureId: promptOf(game).procedureId,
    targetIds: [birds.id],
  });
  game.pass(); // the Aura enters
  game.pass(); // its draw trigger
  const enchantment = Object.values(game.match.objects).find(
    (o) =>
      o.characteristics.name === "Kenrith's Transformation" &&
      game.match.zones.find((z) => z.id === o.zoneId)!.kind === "battlefield",
  )!;
  return { game, birds, myr, enchantment };
}

test("Kenrith's Transformation makes the creature a green Elk 3/3 with no abilities", async () => {
  const { game, birds, myr, enchantment } = await transformed();
  expect(game.match.objects[enchantment.id].attachmentTo).toBe(birds.id);
  expect(characteristics(game, birds.id)).toMatchObject({
    types: ["Creature"],
    subtypes: ["Elk"],
    colors: ["G"],
    typeLine: "Creature — Elk",
    power: "3",
    toughness: "3",
    keywords: [],
  });
  // It no longer taps for mana, and others keep their abilities.
  expect(
    game.command(0, {
      type: "activate-ability",
      objectId: birds.id,
      abilityId: "mana",
      color: "G",
    }).kind,
  ).toBe("rejected");
  expect(characteristics(game, myr.id)).toMatchObject({
    types: ["Artifact", "Creature"],
    power: "1",
  });
});

test("Kenrith's Transformation ends when it leaves the Battlefield", async () => {
  const { game, birds, enchantment } = await transformed();
  game.match.objects[enchantment.id].attachmentTo = null;
  delete game.match.objects[enchantment.id];
  for (const zone of game.match.zones)
    zone.objectIds = zone.objectIds.filter((id) => id !== enchantment.id);
  expect(characteristics(game, birds.id)).toMatchObject({
    types: ["Creature"],
    subtypes: expect.arrayContaining(["Bird"]),
    keywords: ["Flying"],
    power: "0",
  });
  expect(
    game.command(0, {
      type: "activate-ability",
      objectId: birds.id,
      abilityId: "mana",
      color: "G",
    }).kind,
  ).toBe("accepted");
});

test("an ability granted after Kenrith's Transformation is kept, one granted before is lost", async () => {
  const protect = (game: Game, target: string) => {
    const spell = game.seed("Tamiyo's Safekeeping", "hand");
    force.mana(game.match, game.match.players[0].id, { G: 1 });
    game.command(0, { type: "cast-spell", objectId: spell.id });
    game.command(0, {
      type: "rules-input",
      procedureId: promptOf(game).procedureId,
      targetIds: [target],
    });
    both(game);
  };
  // After: the protection came later (CR 613.7), so it stays.
  const after = await transformed();
  protect(after.game, after.birds.id);
  expect(characteristics(after.game, after.birds.id).keywords).toEqual(
    expect.arrayContaining(["Hexproof", "Indestructible"]),
  );
  // Before: Kenrith's Transformation removes what the creature had then.
  const before = await triggerGame();
  const creature = before.seed("Birds of Paradise", "battlefield");
  protect(before, creature.id);
  expect(characteristics(before, creature.id).keywords).toEqual(
    expect.arrayContaining(["Hexproof"]),
  );
  const aura = before.seed("Kenrith's Transformation", "hand");
  force.mana(before.match, before.match.players[0].id, { G: 2 });
  before.command(0, { type: "cast-spell", objectId: aura.id });
  before.command(0, {
    type: "rules-input",
    procedureId: promptOf(before).procedureId,
    targetIds: [creature.id],
  });
  both(before);
  expect(characteristics(before, creature.id).keywords).toEqual([]);
});

test("Rishkar, Peema Renegade puts counters on up to two target creatures", async () => {
  for (const count of [0, 1, 2]) {
    const game = await triggerGame();
    const creatures = [1, 2, 3].map(() =>
      game.seed("Gigantosaurus", "battlefield"),
    );
    const rishkar = game.seed("Rishkar, Peema Renegade", "hand");
    force.mana(game.match, game.match.players[0].id, { G: 3 });
    game.command(0, { type: "cast-spell", objectId: rishkar.id });
    game.pass(); // Rishkar enters; his trigger asks for targets
    const clause = promptOf(game).targets[0];
    expect([clause.min, clause.max]).toEqual([0, 2]);
    const answer = (ids: string[]) =>
      game.command(0, {
        type: "rules-input",
        procedureId: promptOf(game).procedureId,
        targets: { creatures: ids },
      }).kind;
    expect(answer(creatures.map((c) => c.id))).toBe("rejected");
    expect(answer(creatures.slice(0, count).map((c) => c.id))).toBe("accepted");
    game.pass();
    expect(
      creatures.map(
        (c) => game.match.objects[c.id].counters[0]?.quantity ?? "0",
      ),
    ).toEqual(creatures.map((_, i) => (i < count ? "1" : "0")));
  }
});

test("Rishkar, Peema Renegade gives creatures you control with a counter a mana ability", async () => {
  const game = await rulesGame();
  game.seed("Rishkar, Peema Renegade", "battlefield");
  const counted = game.seed("Gigantosaurus", "battlefield");
  const bare = game.seed("Gigantosaurus", "battlefield");
  const theirs = game.seed("Gigantosaurus", "battlefield", 1);
  for (const creature of [counted, theirs])
    force.counters(creature, [{ kind: "+1/+1", quantity: "1" }]);
  const tap = (id: string) =>
    game.command(0, {
      type: "activate-ability",
      objectId: id,
      abilityId: "mana",
    }).kind;
  expect(tap(bare.id)).toBe("rejected");
  expect(tap(theirs.id)).toBe("rejected");
  expect(tap(counted.id)).toBe("accepted");
  expect(game.match.rules.mana[game.match.players[0].id].G).toBe(1);
  expect(game.match.objects[counted.id].status.tapped).toBe(true);
});
