// Characterization tests: the Mono-G cards the runtime runs today
// (docs/plans/mono-g-port.md). The cards that need new runtime stay
// unimplemented and are pinned in tests/rules/catalog/mono-g.spec.ts.
//
// Classification (rules test plan §2):
// | Test | Class | Reason
// | --- | --- | ---
// | {name} taps once for its green mana (parameterized) | Preserve |
// | Birds of Paradise fly and tap for the chosen color only | Preserve |
// | Commander's Sphere taps for the commander's colors and sacrifices to draw | Preserve |
// | Forest taps for green and Tranquil Thicket enters tapped, cycles for green and taps for green | Preserve |
// | Rogue's Passage makes a target creature unable to be blocked | Preserve |
// | Scavenger Grounds sacrifices a Desert to exile every graveyard | Preserve |
// | Scavenging Ooze grows and gains life only for a creature card | Preserve |
// | Dungrove Elder counts Forests and has hexproof | Preserve |
// | Regal Imperiosaur pumps other Dinosaurs only | Preserve |
// | Swiftfoot Boots give the equipped creature hexproof and haste | Preserve |
// | Tamiyo's Safekeeping protects a permanent you control and gains 2 life | Preserve |
// | Harmonize draws three cards | Preserve |
// | Thrashing Brontodon sacrifices to destroy a target artifact or enchantment | Preserve |
// | Beast Whisperer draws for creature spells only | Preserve |
// | Verdant Sun's Avatar gains life equal to each entering creature's toughness | Preserve |
// | Curious Altisaur draws when a Dinosaur deals combat damage to a player | Preserve |
// | Gigantosaurus and Terrian have no abilities | Preserve |

import { expect, test } from "@playwright/test";
import { matchView } from "../../../src/server/match/match-view";
import type { MatchState } from "../../../src/shared/rules-state";
import "../../support/round-trip";
import { rulesGame, triggerGame } from "../../support/rules-game";
import { force } from "../../support/force";
import { moveObject } from "../../../src/server/match/game-objects";

type Game = Awaited<ReturnType<typeof rulesGame>>;

const zoneOf = (match: MatchState, kind: string, seat = 0) =>
  match.zones.find(
    (z) => z.kind === kind && z.ownerId === match.players[seat].id,
  )!;
const viewOf =
  (game: Game, seat = 0) =>
  () =>
    matchView(game.match, game.room.participants[seat].id, game.catalog);
const handCount = (game: Game, seat = 0) =>
  viewOf(game, seat)().zones.find(
    (z) => z.kind === "hand" && z.ownerId === game.match.players[seat].id,
  )!.count;
/** Both players pass: the top of the Stack resolves. */
function resolveTop({ command }: Game) {
  command(0, { type: "pass-priority" });
  command(1, { type: "pass-priority" });
}
const pool = (game: Game, seat = 0) =>
  game.match.rules.mana[game.match.players[seat].id];
const life = (game: Game, seat = 0) => Number(game.match.players[seat].life);

/** Answers the pending cast or activation: the targets, then payment. */
function proceed(game: Game, targetIds: string[] = []) {
  for (let step = 0; step < 5 && game.match.rules.pending; step++) {
    const prompt = viewOf(game)().rules.prompt!;
    game.command(0, {
      type: "rules-input",
      procedureId: prompt.procedureId,
      ...(prompt.promptKind === "choose-targets"
        ? { targetIds }
        : { confirm: true }),
    });
  }
  expect(game.match.rules.pending).toBeUndefined();
}

for (const [name, produced] of [
  ["Llanowar Elves", 1],
  ["Fyndhorn Elves", 1],
  ["Elvish Mystic", 1],
  ["Llanowar Tribe", 3],
] as [string, number][])
  test(`${name} taps once for its green mana`, async () => {
    const game = await rulesGame();
    const creature = game.seed(name, "battlefield");
    const tap = () =>
      game.command(0, {
        type: "activate-ability",
        objectId: creature.id,
        abilityId: "mana",
      });
    expect(tap().kind).toBe("accepted");
    expect(pool(game)).toMatchObject({ G: produced, W: 0, U: 0, B: 0, R: 0 });
    expect(game.match.objects[creature.id].status.tapped).toBe(true);
    expect(tap().kind).toBe("rejected");
    expect(pool(game).G).toBe(produced);
  });

test("Birds of Paradise fly and tap for the chosen color only", async () => {
  const game = await rulesGame();
  const birds = game.seed("Birds of Paradise", "battlefield");
  expect(viewOf(game)().objects[birds.id].characteristics.keywords).toEqual([
    "Flying",
  ]);
  const tap = (color?: "R") =>
    game.command(0, {
      type: "activate-ability",
      objectId: birds.id,
      abilityId: "mana",
      color,
    });
  expect(tap().kind).toBe("rejected");
  expect(game.match.objects[birds.id].status.tapped).toBe(false);
  expect(tap("R").kind).toBe("accepted");
  expect(pool(game)).toMatchObject({ R: 1, G: 0, C: 0 });
});

test("Commander's Sphere taps for the commander's colors and sacrifices to draw", async () => {
  const game = await rulesGame();
  const sphere = game.seed("Commander's Sphere", "battlefield");
  const activate = (abilityId: string, color?: "U" | "G") =>
    game.command(0, {
      type: "activate-ability",
      objectId: sphere.id,
      abilityId,
      color,
    });
  // The fixture's commander has a blue identity.
  expect(activate("mana", "G").kind).toBe("rejected");
  expect(activate("mana", "U").kind).toBe("accepted");
  expect(pool(game)).toMatchObject({ U: 1, G: 0 });
  const before = handCount(game);
  expect(activate("draw").kind).toBe("accepted");
  expect(game.match.objects[sphere.id]).toBeUndefined();
  resolveTop(game);
  expect(handCount(game)).toBe(before + 1);
});

test("Forest taps for green and Tranquil Thicket enters tapped, cycles for green and taps for green", async () => {
  const game = await rulesGame();
  const forest = game.seed("Forest", "battlefield");
  expect(
    game.command(0, {
      type: "activate-ability",
      objectId: forest.id,
      abilityId: "intrinsic-Forest",
    }).kind,
  ).toBe("accepted");
  expect(pool(game).G).toBe(1);

  const played = game.seed("Tranquil Thicket", "hand");
  const instance = played.cardInstanceIds[0];
  expect(game.command(0, { type: "play-land", objectId: played.id }).kind).toBe(
    "accepted",
  );
  const land = Object.values(game.match.objects).find((o) =>
    o.cardInstanceIds.includes(instance),
  )!;
  expect(game.match.objects[land.id].status.tapped).toBe(true);
  expect(
    game.command(0, {
      type: "activate-ability",
      objectId: land.id,
      abilityId: "mana",
    }).kind,
  ).toBe("rejected");
  game.match.objects[land.id].status.tapped = false;
  expect(
    game.command(0, {
      type: "activate-ability",
      objectId: land.id,
      abilityId: "mana",
    }).kind,
  ).toBe("accepted");
  expect(pool(game).G).toBe(2);

  const cycled = game.seed("Tranquil Thicket", "hand");
  force.mana(game.match, game.match.players[0].id, { G: 1 });
  const before = handCount(game);
  expect(
    game.command(0, {
      type: "activate-ability",
      objectId: cycled.id,
      abilityId: "cycling",
    }).kind,
  ).toBe("accepted");
  expect(game.match.objects[cycled.id]).toBeUndefined();
  resolveTop(game);
  expect(handCount(game)).toBe(before); // one discarded, one drawn
  expect(zoneOf(game.match, "graveyard").objectIds).toHaveLength(1);
});

test("Rogue's Passage makes a target creature unable to be blocked", async () => {
  const game = await rulesGame();
  const passage = game.seed("Rogue's Passage", "battlefield");
  const creature = game.seed("Llanowar Elves", "battlefield");
  force.mana(game.match, game.match.players[0].id, { C: 4 });
  expect(
    game.command(0, {
      type: "activate-ability",
      objectId: passage.id,
      abilityId: "unblockable",
    }).kind,
  ).toBe("pending");
  game.command(0, {
    type: "rules-input",
    procedureId: viewOf(game)().rules.prompt!.procedureId,
    targetIds: [creature.id],
  });
  expect(game.match.objects[passage.id].status.tapped).toBe(true);
  resolveTop(game);
  expect(
    viewOf(game)().objects[creature.id].characteristics.keywords,
  ).toContain("Unblockable");
});

test("Scavenger Grounds sacrifices a Desert to exile every graveyard", async () => {
  const game = await rulesGame();
  const grounds = game.seed("Scavenger Grounds", "battlefield");
  const desert = game.seed("Forest", "battlefield");
  game.match.objects[desert.id].characteristics.subtypes = ["Desert"];
  const mine = game.seed("Harmonize", "hand");
  const theirs = game.seed("Harmonize", "hand", 1);
  moveObject(game.match, mine.id, zoneOf(game.match, "graveyard", 0));
  moveObject(game.match, theirs.id, zoneOf(game.match, "graveyard", 1));
  expect(zoneOf(game.match, "graveyard", 0).objectIds).toHaveLength(1);
  expect(zoneOf(game.match, "graveyard", 1).objectIds).toHaveLength(1);
  force.mana(game.match, game.match.players[0].id, { C: 2 });
  const result = game.command(0, {
    type: "activate-ability",
    objectId: grounds.id,
    abilityId: "exile-graveyards",
  });
  if (result.kind === "pending")
    game.command(0, {
      type: "rules-input",
      procedureId: viewOf(game)().rules.prompt!.procedureId,
      selections: { "2": [desert.id] },
    });
  expect(game.match.objects[desert.id]).toBeUndefined();
  expect(game.match.objects[grounds.id].status.tapped).toBe(true);
  resolveTop(game);
  expect(zoneOf(game.match, "graveyard", 0).objectIds).toHaveLength(0);
  expect(zoneOf(game.match, "graveyard", 1).objectIds).toHaveLength(0);
  // Both graveyard cards and the sacrificed Desert, which the cost put there.
  expect(
    game.match.zones.find((z) => z.kind === "exile")!.objectIds,
  ).toHaveLength(3);
});

test("Scavenging Ooze grows and gains life only for a creature card", async () => {
  const game = await rulesGame();
  const ooze = game.seed("Scavenging Ooze", "battlefield");
  const creature = moveObject(
    game.match,
    game.seed("Llanowar Elves", "hand").id,
    zoneOf(game.match, "graveyard", 0),
  );
  const spell = moveObject(
    game.match,
    game.seed("Harmonize", "hand", 1).id,
    zoneOf(game.match, "graveyard", 1),
  );
  const devour = (target: { id: string }) => {
    force.mana(game.match, game.match.players[0].id, { G: 1 });
    game.command(0, {
      type: "activate-ability",
      objectId: ooze.id,
      abilityId: "devour",
    });
    proceed(game, [target.id]);
    resolveTop(game);
  };
  devour(spell);
  expect(game.match.objects[spell.id]).toBeUndefined();
  expect(game.match.objects[ooze.id].counters).toEqual([]);
  expect(life(game)).toBe(40);
  devour(creature);
  expect(game.match.objects[creature.id]).toBeUndefined();
  expect(game.match.objects[ooze.id].counters).toEqual([
    { kind: "+1/+1", quantity: "1" },
  ]);
  expect(life(game)).toBe(41);
  expect(
    game.match.zones.find((z) => z.kind === "exile")!.objectIds,
  ).toHaveLength(2);
});

test("Dungrove Elder counts Forests and has hexproof", async () => {
  const game = await rulesGame();
  const elder = game.seed("Dungrove Elder", "battlefield");
  const stats = () => {
    const c = viewOf(game)().objects[elder.id].characteristics;
    return [c.power, c.toughness];
  };
  expect(viewOf(game)().objects[elder.id].characteristics.keywords).toEqual([
    "Hexproof",
  ]);
  expect(stats()).toEqual(["0", "0"]);
  for (let forests = 1; forests <= 3; forests++) {
    game.seed("Forest", "battlefield");
    expect(stats()).toEqual([String(forests), String(forests)]);
  }
  game.seed("Forest", "battlefield", 1);
  expect(stats()).toEqual(["3", "3"]);
});

test("Regal Imperiosaur pumps other Dinosaurs only", async () => {
  const game = await rulesGame();
  const imperiosaur = game.seed("Regal Imperiosaur", "battlefield");
  const own = game.seed("Gigantosaurus", "battlefield");
  const notDinosaur = game.seed("Llanowar Elves", "battlefield");
  const opposing = game.seed("Gigantosaurus", "battlefield", 1);
  const read = (object: { id: string }) => {
    const c = viewOf(game)().objects[object.id].characteristics;
    return [c.power, c.toughness];
  };
  const base =
    game.catalog.definitions[
      Object.keys(game.catalog.definitions).find(
        (id) =>
          game.catalog.definitions[id].canonicalName === "Regal Imperiosaur",
      )!
    ].components[0];
  expect(read(imperiosaur)).toEqual([base.power, base.toughness]);
  expect(read(own)).toEqual(["11", "11"]);
  expect(read(notDinosaur)).toEqual(["1", "1"]);
  expect(read(opposing)).toEqual(["10", "10"]);
});

test("Gigantosaurus and Terrian have no abilities to run", async () => {
  const game = await rulesGame();
  for (const [name, power, toughness] of [
    ["Gigantosaurus", "10", "10"],
    ["Terrian, World Tyrant", "9", "7"],
  ]) {
    const card = game.seed(name, "battlefield");
    expect(viewOf(game)().objects[card.id].characteristics).toMatchObject({
      power,
      toughness,
      keywords: [],
    });
  }
});

test("Swiftfoot Boots give the equipped creature hexproof and haste", async () => {
  const game = await rulesGame();
  const boots = game.seed("Swiftfoot Boots", "battlefield");
  const equipped = game.seed("Llanowar Elves", "battlefield");
  const other = game.seed("Fyndhorn Elves", "battlefield");
  const keywords = (object: { id: string }) =>
    viewOf(game)().objects[object.id].characteristics.keywords;
  expect(keywords(equipped)).toEqual([]);
  force.mana(game.match, game.match.players[0].id, { C: 1 });
  expect(
    game.command(0, {
      type: "activate-ability",
      objectId: boots.id,
      abilityId: "equip",
    }).kind,
  ).toBe("pending");
  proceed(game, [equipped.id]);
  resolveTop(game);
  expect(keywords(equipped)).toEqual(
    expect.arrayContaining(["Hexproof", "Haste"]),
  );
  expect(keywords(other)).toEqual([]);
});

test("Tamiyo's Safekeeping protects a permanent you control and gains 2 life", async () => {
  const game = await rulesGame();
  const own = game.seed("Llanowar Elves", "battlefield");
  const opposing = game.seed("Fyndhorn Elves", "battlefield", 1);
  const spell = game.seed("Tamiyo's Safekeeping", "hand");
  force.mana(game.match, game.match.players[0].id, { G: 1 });
  expect(game.command(0, { type: "cast-spell", objectId: spell.id }).kind).toBe(
    "pending",
  );
  const legal = viewOf(game)().rules.prompt!.targets[0].legalIds;
  expect(legal).toContain(own.id);
  expect(legal).not.toContain(opposing.id);
  proceed(game, [own.id]);
  resolveTop(game);
  expect(viewOf(game)().objects[own.id].characteristics.keywords).toEqual(
    expect.arrayContaining(["Hexproof", "Indestructible"]),
  );
  expect(life(game)).toBe(42);
  expect(viewOf(game)().objects[opposing.id].characteristics.keywords).toEqual(
    [],
  );
});

test("Harmonize draws three cards", async () => {
  const game = await rulesGame();
  const spell = game.seed("Harmonize", "hand");
  force.mana(game.match, game.match.players[0].id, { G: 2, C: 2 });
  const before = handCount(game);
  expect(game.command(0, { type: "cast-spell", objectId: spell.id }).kind).toBe(
    "accepted",
  );
  resolveTop(game);
  expect(handCount(game)).toBe(before - 1 + 3);
});

test("Thrashing Brontodon sacrifices to destroy a target artifact or enchantment", async () => {
  const game = await rulesGame();
  const brontodon = game.seed("Thrashing Brontodon", "battlefield");
  const ring = game.seed("Sol Ring", "battlefield", 1);
  const creature = game.seed("Llanowar Elves", "battlefield", 1);
  force.mana(game.match, game.match.players[0].id, { C: 1 });
  expect(
    game.command(0, {
      type: "activate-ability",
      objectId: brontodon.id,
      abilityId: "destroy",
    }).kind,
  ).toBe("pending");
  const legal = viewOf(game)().rules.prompt!.targets[0].legalIds;
  expect(legal).toContain(ring.id);
  expect(legal).not.toContain(creature.id);
  proceed(game, [ring.id]);
  expect(game.match.objects[brontodon.id]).toBeUndefined();
  resolveTop(game);
  expect(game.match.objects[ring.id]).toBeUndefined();
  expect(game.match.objects[creature.id]).toBeDefined();
});

test("Beast Whisperer draws for creature spells only", async () => {
  const game = await rulesGame();
  game.seed("Beast Whisperer", "battlefield");
  const creature = game.seed("Llanowar Elves", "hand");
  const spell = game.seed("Harmonize", "hand");
  force.mana(game.match, game.match.players[0].id, { G: 3, C: 2 });
  const stack = () => game.match.zones.find((z) => z.kind === "stack")!;
  const before = handCount(game);
  expect(
    game.command(0, { type: "cast-spell", objectId: creature.id }).kind,
  ).toBe("accepted");
  resolveTop(game); // the trigger above the spell
  expect(stack().objectIds).toHaveLength(1);
  expect(handCount(game)).toBe(before - 1 + 1);
  resolveTop(game); // the creature spell
  expect(stack().objectIds).toHaveLength(0);
  const afterCreature = handCount(game);
  expect(game.command(0, { type: "cast-spell", objectId: spell.id }).kind).toBe(
    "accepted",
  );
  expect(stack().objectIds).toHaveLength(1);
  resolveTop(game);
  expect(handCount(game)).toBe(afterCreature - 1 + 3);
});

test("Verdant Sun's Avatar gains life equal to each entering creature's toughness", async () => {
  const game = await rulesGame();
  const avatar = game.seed("Verdant Sun's Avatar", "hand");
  const dinosaur = game.seed("Gigantosaurus", "hand");
  const toughness = (name: string) =>
    Number(
      Object.values(game.catalog.definitions).find(
        (c) => c.canonicalName === name,
      )!.components[0].toughness,
    );
  force.mana(game.match, game.match.players[0].id, { G: 20, C: 20 });
  game.command(0, { type: "cast-spell", objectId: avatar.id });
  resolveTop(game); // the creature spell enters
  resolveTop(game); // its own trigger
  expect(life(game)).toBe(40 + toughness("Verdant Sun's Avatar"));
  const gained = life(game);
  game.command(0, { type: "cast-spell", objectId: dinosaur.id });
  resolveTop(game);
  resolveTop(game);
  expect(life(game)).toBe(gained + 10);
});

test("Curious Altisaur draws when a Dinosaur deals combat damage to a player", async () => {
  for (const [attacker, draws] of [
    ["Gigantosaurus", 1],
    ["Llanowar Elves", 0],
  ] as [string, number][]) {
    const game = await triggerGame();
    game.seed("Curious Altisaur", "battlefield");
    const creature = game.seed(attacker, "battlefield");
    game.pass();
    game.pass();
    game.answer({ [creature.id]: [game.match.players[1].id] });
    game.pass();
    game.answer({}, 1);
    const before = game.handCount();
    game.pass();
    game.pass();
    expect(game.handCount()).toBe(before + draws);
  }
});
