// Characterization tests: static abilities, continuous effects, Equipment and linked abilities.
//
// Classification (rules test plan §2):
// | Test | Class | Reason
// | --- | --- | ---
// | continuous artifact bonuses, characteristic-defining counts and Overseer counters compose in player views | Preserve |
// | removing a continuous source updates recipients and captured abilities survive Foundry sacrifice | Preserve |
// | Nettlecyst creates and equips its Germ before checking toughness, then equip follows sorcery timing | Preserve |
// | Duplicant optionally exiles a nontoken creature and follows only its linked card across restore and zone changes | Preserve |
// | Duplicant … (parameterized) | Preserve |
// | Equipment counts an artifact enchantment once and detaches when its recipient or source leaves | Preserve |
// | Duplicant's new entry has no link to cards exiled during its previous lifetime | Preserve |
// | returning Equipment as a cost removes its bonus immediately and a pending living-weapon source can leave | Preserve |
// | source grants enforce opponent hexproof and artifact flash through current views | Preserve |
// | Propaganda payment is optional for required attackers and Graaz composes types, base stats and bonuses | Preserve |
// | Graaz animates no Vehicle itself, but layers its creature changes onto crewed Vehicles and prevents Wall blocks | Preserve |
// | hexproof gained in response invalidates an opponent target while preserving its controller's targets | Preserve |
// | Equipment attaches to a crewed Vehicle, composes its bonus, and detaches when animation expires | Preserve |
// | Padeem honors tied artifact maxima and rechecks upkeep while Dragon grants follow current artifact counts | Preserve |
// | Spy Network rechecks its artifact condition and Shimmer Dragon loses hexproof when its artifact count drops | Preserve |
// | {name} composes artifact affinity, flying and its distinct resolved characteristics (parameterized) | Preserve |

import { expect, test } from "@playwright/test";
import { matchView } from "../../../src/server/match/match-view";
import "../../support/round-trip";
import { rulesGame, triggerGame } from "../../support/rules-game";
import { force } from "../../support/force";
import { author } from "../../support/authored";

test("continuous artifact bonuses, characteristic-defining counts and Overseer counters compose in player views", async () => {
  const { match, command, seed, room, catalog } = await rulesGame();
  const chief = seed("Chief of the Foundry", "battlefield"),
    master = seed("Master of Etherium", "battlefield"),
    overseer = seed("Steel Overseer", "battlefield");
  seed("Sol Ring", "battlefield");
  seed("Chief of the Foundry", "battlefield", 1);
  const view = () => matchView(match, room.participants[0].id, catalog);
  expect(view().objects[master.id].characteristics).toMatchObject({
    power: "5",
    toughness: "5",
  });
  expect(view().objects[chief.id].characteristics).toMatchObject({
    power: "3",
    toughness: "4",
  });
  expect(
    command(0, {
      type: "activate-ability",
      objectId: overseer.id,
      abilityId: "counters",
    }).kind,
  ).toBe("accepted");
  command(0, { type: "pass-priority" });
  command(1, { type: "pass-priority" });
  expect(view().objects[master.id].characteristics).toMatchObject({
    power: "6",
    toughness: "6",
  });
  expect(view().objects[overseer.id].characteristics).toMatchObject({
    power: "4",
    toughness: "4",
  });
  expect(view().objects[overseer.id].counters).toEqual([
    { kind: "+1/+1", quantity: "1" },
  ]);
  expect(view().objects[chief.id].components![0].power).toBe("2");
});

test("removing a continuous source updates recipients and captured abilities survive Foundry sacrifice", async () => {
  const { match, command, seed, room, catalog } = await rulesGame();
  const sai = seed("Sai, Master Thopterist", "battlefield"),
    chief = seed("Chief of the Foundry", "battlefield"),
    overseer = seed("Steel Overseer", "battlefield"),
    ring = seed("Sol Ring", "battlefield");
  const view = () => matchView(match, room.participants[0].id, catalog);
  expect(view().objects[overseer.id].characteristics.power).toBe("2");
  force.mana(match, match.players[0].id, { U: 2 });
  command(0, { type: "activate-ability", objectId: sai.id, abilityId: "draw" });
  command(0, {
    type: "rules-input",
    procedureId: view().rules!.pending!.id,
    selections: { "1": [chief.id, ring.id] },
  });
  expect(view().objects[overseer.id].characteristics.power).toBe("1");
  command(0, { type: "pass-priority" });
  command(1, { type: "pass-priority" });
  const foundry = seed("Foundry of the Consuls", "battlefield");
  force.mana(match, match.players[0].id, { C: 5 });
  expect(
    command(0, {
      type: "activate-ability",
      objectId: foundry.id,
      abilityId: "tokens",
    }).kind,
  ).toBe("accepted");
  expect(view().objects[foundry.id]).toBeUndefined();
  command(0, { type: "pass-priority" });
  command(1, { type: "pass-priority" });
  expect(
    Object.values(view().objects).filter((o) => o.kind === "token"),
  ).toHaveLength(2);
});

test("Nettlecyst creates and equips its Germ before checking toughness, then equip follows sorcery timing", async () => {
  const game = await rulesGame();
  const equipment = game.seed("Nettlecyst", "hand");
  const spring = game.seed("Ichor Wellspring", "battlefield");
  force.mana(game.match, game.match.players[0].id, { C: 10 });
  const view = () =>
    matchView(game.match, game.room.participants[0].id, game.catalog);
  expect(
    game.command(0, { type: "cast-spell", objectId: equipment.id }).kind,
  ).toBe("accepted");
  game.command(0, { type: "pass-priority" });
  game.command(1, { type: "pass-priority" });
  game.command(0, { type: "pass-priority" });
  game.command(1, { type: "pass-priority" });
  const germ = Object.values(view().objects).find(
    (o) => o.kind === "token" && o.characteristics.name === "Phyrexian Germ",
  )!;
  expect(germ).toBeDefined();
  expect(germ.characteristics).toMatchObject({
    colors: ["B"],
    subtypes: ["Phyrexian", "Germ"],
    power: "2",
    toughness: "2",
  });
  const nettle = Object.values(view().objects).find(
    (o) => o.characteristics.name === "Nettlecyst",
  )!;
  expect(nettle.attachmentTo).toBe(germ.id);
  const creature = game.seed("Silver Myr", "battlefield");
  expect(
    game.command(0, {
      type: "activate-ability",
      objectId: nettle.id,
      abilityId: "equip",
    }).kind,
  ).toBe("pending");
  const pending = view().rules!.pending!;
  expect(
    game.command(0, {
      type: "rules-input",
      procedureId: pending.id,
      targetIds: [spring.id],
    }).kind,
  ).toBe("rejected");
  game.command(0, {
    type: "rules-input",
    procedureId: pending.id,
    targetIds: [creature.id],
  });
  expect(
    game.command(0, {
      type: "activate-ability",
      objectId: nettle.id,
      abilityId: "equip",
    }).kind,
  ).toBe("rejected");
  game.command(0, { type: "pass-priority" });
  game.command(1, { type: "pass-priority" });
  expect(view().objects[nettle.id].attachmentTo).toBe(creature.id);
  expect(view().objects[germ.id]).toBeUndefined();
  expect(view().objects[creature.id].characteristics).toMatchObject({
    power: "4",
    toughness: "4",
  });
});

test("Duplicant optionally exiles a nontoken creature and follows only its linked card across restore and zone changes", async () => {
  const game = await rulesGame();
  const duplicant = game.seed("Duplicant", "hand");
  const creature = game.seed("Master of Etherium", "battlefield", 1);
  game.seed("Sol Ring", "battlefield", 1);
  const retrieval = game.seed("Counterspell", "hand");
  // A fixture-authored retrieval effect supplies a subsequent Exile departure through the public seam.
  const retrievalCard = Object.values(game.catalog.definitions).find(
    (c) => c.canonicalName === "Counterspell",
  )!;
  retrievalCard.abilities[0].rules = {
    costs: [],
    target: { zone: "exile", kind: "card" },
    effects: [
      {
        kind: "move",
        objects: { target: "target-0" },
        to: { zone: "graveyard" },
      },
    ],
  };
  force.mana(game.match, game.match.players[0].id, { U: 8 });
  const view = () =>
    matchView(game.match, game.room.participants[0].id, game.catalog);
  expect(
    game.command(0, { type: "cast-spell", objectId: duplicant.id }).kind,
  ).toBe("accepted");
  game.command(0, { type: "pass-priority" });
  expect(game.command(1, { type: "pass-priority" }).kind).toBe("pending");
  const target = view().rules!.pending!;
  expect(target.kind).toBe("trigger-target");
  game.command(0, {
    type: "rules-input",
    procedureId: target.id,
    targetIds: [creature.id],
  });
  game.command(0, { type: "pass-priority" });
  game.command(1, { type: "pass-priority" });
  const choice = view().rules!.pending!;
  expect(choice.selectionOptions.select.minCount).toBe(0);
  game.command(0, {
    type: "rules-input",
    procedureId: choice.id,
    selections: { select: [creature.id] },
  });
  let permanent = Object.values(view().objects).find(
    (o) => o.characteristics.name === "Duplicant",
  )!;
  // Master counts its owner's artifacts even in Exile; its former Battlefield 2/2 is not frozen.
  expect(permanent.characteristics).toMatchObject({
    power: "1",
    toughness: "1",
    subtypes: ["Vedalken", "Wizard", "Shapeshifter"],
  });
  expect(permanent.attachmentTo).toBeNull();
  expect(permanent.links).toHaveLength(1);
  Object.assign(game.match, JSON.parse(JSON.stringify(game.match)));
  expect(view().objects[permanent.id].characteristics.power).toBe("1");
  const exiled = permanent.links![0].objectIds[0];
  game.command(0, { type: "cast-spell", objectId: retrieval.id });
  game.command(0, {
    type: "rules-input",
    procedureId: view().rules!.pending!.id,
    targetIds: [exiled],
  });
  game.command(0, { type: "pass-priority" });
  game.command(1, { type: "pass-priority" });
  permanent = view().objects[permanent.id];
  expect(permanent.characteristics).toMatchObject({
    power: "2",
    toughness: "4",
    subtypes: ["Shapeshifter"],
  });
});

for (const decline of [true, false]) {
  test(`Duplicant ${decline ? "declines exile" : "loses its target before resolution"} without a link or changed stats`, async () => {
    const game = await rulesGame();
    const duplicant = game.seed("Duplicant", "hand");
    const target = game.seed("Silver Myr", "battlefield");
    const bomb = game.seed("Aether Spellbomb", "battlefield");
    force.mana(game.match, game.match.players[0].id, {
      W: 0,
      U: 7,
      B: 0,
      R: 0,
      G: 0,
      C: 0,
    });
    const view = () =>
      matchView(game.match, game.room.participants[0].id, game.catalog);
    game.command(0, { type: "cast-spell", objectId: duplicant.id });
    game.command(0, { type: "pass-priority" });
    game.command(1, { type: "pass-priority" });
    game.command(0, {
      type: "rules-input",
      procedureId: view().rules!.pending!.id,
      targetIds: [target.id],
    });
    if (!decline) {
      game.command(0, {
        type: "activate-ability",
        objectId: bomb.id,
        abilityId: "bounce",
      });
      game.command(0, {
        type: "rules-input",
        procedureId: view().rules!.pending!.id,
        targetIds: [target.id],
      });
      game.command(0, { type: "pass-priority" });
      game.command(1, { type: "pass-priority" });
    }
    game.command(0, { type: "pass-priority" });
    game.command(1, { type: "pass-priority" });
    if (decline)
      expect(
        game.command(0, {
          type: "rules-input",
          procedureId: view().rules!.pending!.id,
          selections: { select: [] },
        }).kind,
      ).toBe("accepted");
    expect(view().rules!.pending).toBeUndefined();
    const permanent = Object.values(view().objects).find(
      (o) => o.characteristics.name === "Duplicant",
    )!;
    expect(permanent.characteristics).toMatchObject({
      power: "2",
      toughness: "4",
      subtypes: ["Shapeshifter"],
    });
    expect(permanent.links).toEqual([]);
    expect(view().zones.find((z) => z.kind === "exile")!.count).toBe(0);
  });
}

test("Equipment counts an artifact enchantment once and detaches when its recipient or source leaves", async () => {
  const game = await rulesGame();
  const tool = game.seed("Adaptive Omnitool", "battlefield");
  const creature = game.seed("Silver Myr", "battlefield");
  const both = game.seed("Mind Stone", "battlefield");
  both.characteristics.types = ["Artifact", "Enchantment"];
  const nettle = game.seed("Nettlecyst", "battlefield");
  const bomb = game.seed("Aether Spellbomb", "battlefield");
  force.attach(nettle, creature);
  force.mana(game.match, game.match.players[0].id, {
    W: 0,
    U: 4,
    B: 0,
    R: 0,
    G: 0,
    C: 0,
  });
  const view = () =>
    matchView(game.match, game.room.participants[0].id, game.catalog);
  expect(view().objects[creature.id].characteristics).toMatchObject({
    power: "6",
    toughness: "6",
  });
  game.command(0, {
    type: "activate-ability",
    objectId: tool.id,
    abilityId: "equip",
  });
  game.command(0, {
    type: "rules-input",
    procedureId: view().rules!.pending!.id,
    targetIds: [creature.id],
  });
  game.command(0, { type: "pass-priority" });
  game.command(1, { type: "pass-priority" });
  expect(view().objects[creature.id].characteristics).toMatchObject({
    power: "11",
    toughness: "11",
  });
  game.command(0, {
    type: "activate-ability",
    objectId: bomb.id,
    abilityId: "bounce",
  });
  game.command(0, {
    type: "rules-input",
    procedureId: view().rules!.pending!.id,
    targetIds: [creature.id],
  });
  game.command(0, { type: "pass-priority" });
  game.command(1, { type: "pass-priority" });
  expect(view().objects[nettle.id].attachmentTo).toBeNull();
  expect(view().objects[tool.id].attachmentTo).toBeNull();
});

test("Duplicant's new entry has no link to cards exiled during its previous lifetime", async () => {
  const game = await rulesGame();
  const duplicant = game.seed("Duplicant", "hand");
  const victim = game.seed("Silver Myr", "battlefield", 1);
  const bomb = game.seed("Aether Spellbomb", "battlefield");
  force.mana(game.match, game.match.players[0].id, { U: 13 });
  const view = () =>
    matchView(game.match, game.room.participants[0].id, game.catalog);
  const resolve = () => {
    game.command(0, { type: "pass-priority" });
    game.command(1, { type: "pass-priority" });
  };
  game.command(0, { type: "cast-spell", objectId: duplicant.id });
  resolve();
  game.command(0, {
    type: "rules-input",
    procedureId: view().rules!.pending!.id,
    targetIds: [victim.id],
  });
  resolve();
  game.command(0, {
    type: "rules-input",
    procedureId: view().rules!.pending!.id,
    selections: { select: [victim.id] },
  });
  const old = Object.values(view().objects).find(
    (o) => o.characteristics.name === "Duplicant",
  )!;
  expect(old.characteristics).toMatchObject({ power: "1", toughness: "1" });
  game.command(0, {
    type: "activate-ability",
    objectId: bomb.id,
    abilityId: "bounce",
  });
  game.command(0, {
    type: "rules-input",
    procedureId: view().rules!.pending!.id,
    targetIds: [old.id],
  });
  resolve();
  const returned = Object.values(view().objects).find(
    (o) => o.characteristics.name === "Duplicant",
  )!;
  game.command(0, { type: "cast-spell", objectId: returned.id });
  resolve();
  const fresh = Object.values(view().objects).find(
    (o) => o.characteristics.name === "Duplicant" && o.kind === "card",
  )!;
  expect(fresh.id).not.toBe(old.id);
  expect(fresh.links).toEqual([]);
  expect(fresh.characteristics).toMatchObject({ power: "2", toughness: "4" });
  const pending = view().rules!.pending!;
  expect(pending.legalTargetIds).toEqual([fresh.id]);
  game.command(0, {
    type: "rules-input",
    procedureId: pending.id,
    targetIds: [fresh.id],
  });
  resolve();
  game.command(0, {
    type: "rules-input",
    procedureId: view().rules!.pending!.id,
    selections: { select: [] },
  });
  expect(view().objects[fresh.id].links).toEqual([]);
  expect(view().zones.find((z) => z.kind === "exile")!.count).toBe(1);
});

test("returning Equipment as a cost removes its bonus immediately and a pending living-weapon source can leave", async () => {
  const game = await rulesGame();
  const creature = game.seed("Silver Myr", "battlefield");
  const nettle = game.seed("Nettlecyst", "battlefield");
  const transmuter = game.seed("Master Transmuter", "battlefield");
  const bomb = game.seed("Aether Spellbomb", "battlefield");
  Object.values(game.catalog.definitions).find(
    (c) => c.canonicalName === "Aether Spellbomb",
  )!.abilities[0].rules!.target = { zone: "battlefield", types: ["Artifact"] };
  force.attach(nettle, creature);
  force.mana(game.match, game.match.players[0].id, { U: 2 });
  const view = () =>
    matchView(game.match, game.room.participants[0].id, game.catalog);
  expect(view().objects[creature.id].characteristics.power).toBe("5");
  game.command(0, {
    type: "activate-ability",
    objectId: transmuter.id,
    abilityId: "transmute",
  });
  game.command(0, {
    type: "rules-input",
    procedureId: view().rules!.pending!.id,
    selections: { "2": [nettle.id] },
  });
  expect(view().objects[creature.id].characteristics.power).toBe("1");
  expect(view().objects[nettle.id]).toBeUndefined();
  game.command(0, { type: "pass-priority" });
  game.command(1, { type: "pass-priority" });
  game.command(0, {
    type: "rules-input",
    procedureId: view().rules!.pending!.id,
    selections: {
      select: [
        Object.values(view().objects).find(
          (o) => o.characteristics.name === "Nettlecyst",
        )!.id,
      ],
    },
  });
  const fresh = Object.values(view().objects).find(
    (o) => o.kind === "card" && o.characteristics.name === "Nettlecyst",
  )!;
  game.command(0, {
    type: "activate-ability",
    objectId: bomb.id,
    abilityId: "bounce",
  });
  game.command(0, {
    type: "rules-input",
    procedureId: view().rules!.pending!.id,
    targetIds: [fresh.id],
  });
  for (let i = 0; i < 2; i++) {
    game.command(0, { type: "pass-priority" });
    game.command(1, { type: "pass-priority" });
  }
  expect(
    Object.values(view().objects).filter((o) => o.kind === "token"),
  ).toHaveLength(0);
  expect(view().objects[creature.id].characteristics.power).toBe("1");
});

test("source grants enforce opponent hexproof and artifact flash through current views", async () => {
  const game = await rulesGame();
  const { match, command, seed, catalog, room } = game;
  const myr = seed("Shimmer Myr", "battlefield");
  const ring = seed("Sol Ring", "hand");
  const protectedMyr = seed("Silver Myr", "battlefield", 1);
  const padeem = seed("Padeem, Consul of Innovation", "battlefield", 1);
  const padeemCard = Object.values(catalog.definitions).find(
    (c) => c.canonicalName === "Padeem, Consul of Innovation",
  )!;
  await author(padeemCard, [
    ...padeemCard.authoredAbilities,
    {
      id: "protection",
      kind: "static",
      grants: [
        {
          kind: "continuous",
          objects: {
            all: { zone: "battlefield", controller: "you", type: ["Artifact"] },
          },
          changes: [{ kind: "grant-keyword", keyword: "hexproof" }],
        },
      ],
    },
  ]);
  const bomb = seed("Aether Spellbomb", "battlefield");
  force.step(match, "begin-combat");
  force.mana(match, match.players[0].id, { U: 2 });
  const view = () => matchView(match, room.participants[0].id, catalog);
  expect(view().actions!.some((a) => a.label === "Cast Sol Ring")).toBe(true);
  expect(command(0, { type: "cast-spell", objectId: ring.id }).kind).toBe(
    "accepted",
  );
  command(0, { type: "pass-priority" });
  command(1, { type: "pass-priority" });
  expect(
    command(0, {
      type: "activate-ability",
      objectId: bomb.id,
      abilityId: "bounce",
    }).kind,
  ).toBe("pending");
  expect(view().rules!.pending!.legalTargetIds).not.toContain(protectedMyr.id);
  expect(view().rules!.pending!.legalTargetIds).toContain(myr.id);
  expect(
    command(0, {
      type: "rules-input",
      procedureId: view().rules!.pending!.id,
      targetIds: [protectedMyr.id],
    }).kind,
  ).toBe("rejected");
  expect(
    command(0, {
      type: "rules-input",
      procedureId: view().rules!.pending!.id,
      targetIds: [padeem.id],
    }).kind,
  ).toBe("accepted");
  command(0, { type: "pass-priority" });
  command(1, { type: "pass-priority" });
  const secondBomb = seed("Aether Spellbomb", "battlefield");
  command(0, {
    type: "activate-ability",
    objectId: secondBomb.id,
    abilityId: "bounce",
  });
  expect(view().rules!.pending!.legalTargetIds).toContain(protectedMyr.id);
});

test("Propaganda payment is optional for required attackers and Graaz composes types, base stats and bonuses", async () => {
  const game = await rulesGame();
  const graaz = game.seed("Graaz, Unstoppable Juggernaut", "battlefield");
  const jug = game.seed("Darksteel Juggernaut", "battlefield");
  const chief = game.seed("Chief of the Foundry", "battlefield");
  force.counters(jug, [{ kind: "+1/+1", quantity: "2" }]);
  game.seed("Propaganda", "battlefield", 1);
  const view = () =>
    matchView(game.match, game.room.participants[0].id, game.catalog);
  expect(view().objects[jug.id].characteristics.power).toBe("8");
  expect(view().objects[jug.id].characteristics.toughness).toBe("6");
  expect(view().objects[chief.id].characteristics.subtypes).toContain(
    "Juggernaut",
  );
  const pass = () => {
    game.command(0, { type: "pass-priority" });
    game.command(1, { type: "pass-priority" });
  };
  pass();
  pass();
  const declare = view().rules!.pending!;
  expect(
    game.command(0, {
      type: "rules-input",
      procedureId: declare.id,
      selections: {
        [jug.id]: [game.match.players[1].id],
        [graaz.id]: [game.match.players[1].id],
      },
    }).kind,
  ).toBe("pending");
  const payment = view().rules!.pending!;
  expect(payment.kind).toBe("attack-payment");
  expect(payment.totalCost.generic).toBe(4);
  expect(view().objects[jug.id].status.tapped).toBe(false);
  const ring = game.seed("Sol Ring", "battlefield");
  game.command(0, {
    type: "activate-ability",
    objectId: ring.id,
    abilityId: "mana",
  });
  expect(
    game.command(0, {
      type: "rules-input",
      procedureId: payment.id,
      confirm: true,
    }).kind,
  ).toBe("rejected");
  const ring2 = game.seed("Sol Ring", "battlefield");
  game.command(0, {
    type: "activate-ability",
    objectId: ring2.id,
    abilityId: "mana",
  });
  expect(
    game.command(0, {
      type: "rules-input",
      procedureId: payment.id,
      confirm: true,
    }).kind,
  ).toBe("accepted");
  expect(view().rules!.combat!.attackers).toHaveLength(2);
  expect(view().objects[jug.id].status.tapped).toBe(true);
  const other = await rulesGame();
  other.seed("Darksteel Juggernaut", "battlefield");
  other.seed("Propaganda", "battlefield", 1);
  for (let i = 0; i < 2; i++) {
    other.command(0, { type: "pass-priority" });
    other.command(1, { type: "pass-priority" });
  }
  expect(
    other.command(0, {
      type: "rules-input",
      procedureId: other.match.rules!.pending!.id,
      selections: {},
    }).kind,
  ).toBe("accepted");
});

test("Graaz animates no Vehicle itself, but layers its creature changes onto crewed Vehicles and prevents Wall blocks", async () => {
  const game = await rulesGame();
  const vehicle = game.seed("Cultivator's Caravan", "battlefield");
  const graaz = game.seed("Graaz, Unstoppable Juggernaut", "battlefield");
  const myr = game.seed("Silver Myr", "battlefield");
  const wall = game.seed("Silver Myr", "battlefield", 1);
  wall.characteristics.subtypes = ["Wall"];
  const view = (seat = 0) =>
    matchView(game.match, game.room.participants[seat].id, game.catalog);
  expect(view().objects[vehicle.id].characteristics.types).toEqual([
    "Artifact",
  ]);
  game.command(0, {
    type: "activate-ability",
    objectId: vehicle.id,
    abilityId: "crew",
  });
  game.command(0, {
    type: "rules-input",
    procedureId: view().rules!.pending!.id,
    selections: { "0": [myr.id] },
  });
  const pass = () => {
    game.command(0, { type: "pass-priority" });
    game.command(1, { type: "pass-priority" });
  };
  pass();
  expect(view().objects[vehicle.id].characteristics.subtypes).toEqual([
    "Vehicle",
    "Juggernaut",
  ]);
  expect(view().objects[vehicle.id].characteristics.toughness).toBe("3");
  pass();
  pass();
  const pending = view().rules!.pending!;
  expect(
    game.command(0, {
      type: "rules-input",
      procedureId: pending.id,
      selections: {},
    }).kind,
  ).toBe("rejected");
  game.command(0, {
    type: "rules-input",
    procedureId: pending.id,
    selections: {
      [vehicle.id]: [game.match.players[1].id],
      [graaz.id]: [game.match.players[1].id],
    },
  });
  pass();
  expect(view(1).rules!.pending!.selectionOptions[wall.id].objectIds).toEqual(
    [],
  );
  expect(
    game.command(1, {
      type: "rules-input",
      procedureId: view(1).rules!.pending!.id,
      selections: { [wall.id]: [vehicle.id] },
    }).kind,
  ).toBe("rejected");
});

test("hexproof gained in response invalidates an opponent target while preserving its controller's targets", async () => {
  const game = await rulesGame();
  const myr = game.seed("Silver Myr", "battlefield", 1);
  const bomb = game.seed("Aether Spellbomb", "battlefield");
  const padeem = game.seed("Padeem, Consul of Innovation", "hand", 1);
  const card =
    game.catalog.definitions[
      game.match.instances[padeem.cardInstanceIds[0]].definitionId
    ];
  await author(card, [
    { id: "flash", kind: "keyword", keyword: "flash" },
    {
      id: "scenario-grant",
      kind: "static",
      grants: [
        {
          kind: "continuous",
          objects: {
            all: { zone: "battlefield", controller: "you", type: ["Artifact"] },
          },
          changes: [{ kind: "grant-keyword", keyword: "hexproof" }],
        },
      ],
    },
  ]);
  const view = (seat = 0) =>
    matchView(game.match, game.room.participants[seat].id, game.catalog);
  force.mana(game.match, game.match.players[0].id, { U: 1 });
  force.mana(game.match, game.match.players[1].id, { U: 1 });
  force.mana(game.match, game.match.players[1].id, { C: 3 });
  game.command(0, {
    type: "activate-ability",
    objectId: bomb.id,
    abilityId: "bounce",
  });
  game.command(0, {
    type: "rules-input",
    procedureId: view().rules!.pending!.id,
    targetIds: [myr.id],
  });
  game.command(0, { type: "pass-priority" });
  expect(
    game.command(1, { type: "cast-spell", objectId: padeem.id }).kind,
  ).toBe("accepted");
  game.command(1, { type: "pass-priority" });
  game.command(0, { type: "pass-priority" });
  game.command(0, { type: "pass-priority" });
  game.command(1, { type: "pass-priority" });
  expect(view().objects[myr.id]).toBeDefined();
  const ownBomb = game.seed("Aether Spellbomb", "battlefield", 1);
  game.command(0, { type: "pass-priority" });
  game.command(1, {
    type: "activate-ability",
    objectId: ownBomb.id,
    abilityId: "bounce",
  });
  expect(view(1).rules!.pending!.legalTargetIds).toContain(myr.id);
});

test("Equipment attaches to a crewed Vehicle, composes its bonus, and detaches when animation expires", async () => {
  const game = await rulesGame();
  const vehicle = game.seed("Cultivator's Caravan", "battlefield");
  const myr = game.seed("Silver Myr", "battlefield");
  force.counters(myr, [{ kind: "+1/+1", quantity: "2" }]);
  const nettle = game.seed("Nettlecyst", "battlefield");
  const view = () =>
    matchView(game.match, game.room.participants[0].id, game.catalog);
  const pass = () => {
    game.command(0, { type: "pass-priority" });
    game.command(1, { type: "pass-priority" });
  };
  game.command(0, {
    type: "activate-ability",
    objectId: vehicle.id,
    abilityId: "crew",
  });
  game.command(0, {
    type: "rules-input",
    procedureId: view().rules!.pending!.id,
    selections: { "0": [myr.id] },
  });
  pass();
  force.mana(game.match, game.match.players[0].id, { C: 2 });
  game.command(0, {
    type: "activate-ability",
    objectId: nettle.id,
    abilityId: "equip",
  });
  expect(view().rules!.pending!.legalTargetIds).toContain(vehicle.id);
  game.command(0, {
    type: "rules-input",
    procedureId: view().rules!.pending!.id,
    targetIds: [vehicle.id],
  });
  pass();
  expect(view().objects[nettle.id].attachmentTo).toBe(vehicle.id);
  expect(view().objects[vehicle.id].characteristics.power).toBe("8");
  force.step(game.match, "end");
  pass();
  expect(view().objects[nettle.id].attachmentTo).toBeNull();
  expect(view().objects[vehicle.id].characteristics.types).toEqual([
    "Artifact",
  ]);
  expect(view().objects[myr.id].counters).toEqual([
    { kind: "+1/+1", quantity: "2" },
  ]);
});

test("Padeem honors tied artifact maxima and rechecks upkeep while Dragon grants follow current artifact counts", async () => {
  const game = await rulesGame();
  game.seed("Padeem, Consul of Innovation", "battlefield");
  const dragon = game.seed("Shimmer Dragon", "battlefield");
  const own = game.seed("Mind Stone", "battlefield");
  game.seed("Mind Stone", "battlefield", 1);
  const artifacts = [
    own,
    game.seed("Sol Ring", "battlefield"),
    game.seed("Silver Myr", "battlefield"),
    game.seed("Thought Vessel", "battlefield"),
  ];
  const view = () =>
    matchView(game.match, game.room.participants[0].id, game.catalog);
  expect(view().objects[own.id].characteristics.keywords).toContain("Hexproof");
  expect(view().objects[dragon.id].characteristics.keywords).toContain(
    "Hexproof",
  );
  // Start just before the next upkeep, exercising the ordinary turn commands.
  force.step(game.match, "end");
  game.seed("Thought Vessel", "battlefield", 1);
  const pass = () => {
    const id = game.match.priority!.playerId;
    const seat = game.match.players.findIndex((p) => p.id === id);
    game.command(seat, { type: "pass-priority" });
    game.command(1 - seat, { type: "pass-priority" });
  };
  pass();
  for (let i = 0; i < 8; i++) pass();
  expect(game.match.turn.activePlayerId).toBe(game.match.players[0].id);
  expect(view().zones.find((z) => z.kind === "stack")!.count).toBe(1);
  const before = view().zones.find(
    (z) => z.kind === "hand" && z.ownerId === game.match.players[0].id,
  )!.count;
  // Respond with a higher-valued artifact; the intervening condition must fail.
  const archive = game.seed("Hedron Archive", "hand", 1);
  force.mana(game.match, game.match.players[1].id, { C: 4 });
  game.seed("Shimmer Myr", "battlefield", 1);
  game.command(0, { type: "pass-priority" });
  game.command(1, { type: "cast-spell", objectId: archive.id });
  pass();
  pass();
  expect(
    view().zones.find(
      (z) => z.kind === "hand" && z.ownerId === game.match.players[0].id,
    )!.count,
  ).toBe(before);
  // Selected-object tap costs can use newly controlled artifacts.
  force.controlledSince(game.match, artifacts[0], game.match.turn.number);
  expect(
    game.command(0, {
      type: "activate-ability",
      objectId: dragon.id,
      abilityId: "draw",
    }).kind,
  ).toBe("pending");
  const pending = view().rules!.pending!;
  game.command(0, {
    type: "rules-input",
    procedureId: pending.id,
    selections: { "0": artifacts.slice(0, 2).map((o) => o.id) },
    confirm: true,
  });
  pass();
  expect(
    view().zones.find(
      (z) => z.kind === "hand" && z.ownerId === game.match.players[0].id,
    )!.count,
  ).toBe(before + 1);
});

test("Spy Network rechecks its artifact condition and Shimmer Dragon loses hexproof when its artifact count drops", async () => {
  const game = await triggerGame();
  game.seed("Thopter Spy Network", "battlefield", 1);
  const dragon = game.seed("Shimmer Dragon", "battlefield", 1);
  const artifacts = Array.from({ length: 4 }, () =>
    game.seed("Mind Stone", "battlefield", 1),
  );
  const transmuter = game.seed("Master Transmuter", "battlefield", 1);
  force.step(game.match, "end");
  game.pass();
  expect(game.view().objects[dragon.id].characteristics.keywords).toContain(
    "Hexproof",
  );
  force.mana(game.match, game.match.players[1].id, { U: 1 });
  game.command(1, {
    type: "activate-ability",
    objectId: transmuter.id,
    abilityId: "transmute",
  });
  game.answer({ "2": [transmuter.id] }, 1);
  game.pass();
  game.answer({ select: [] }, 1);
  // Remove the four remaining artifacts through paid draw abilities, retaining the upkeep trigger.
  for (const artifact of artifacts) {
    force.mana(game.match, game.match.players[1].id, { U: 1 });
    game.command(1, {
      type: "activate-ability",
      objectId: artifact.id,
      abilityId: "draw",
    });
    game.pass();
  }
  expect(game.view().objects[dragon.id].characteristics.keywords).not.toContain(
    "Hexproof",
  );
  game.pass();
  expect(
    Object.values(game.view().objects).filter((o) => o.kind === "token"),
  ).toHaveLength(0);
});

for (const name of ["Thought Monitor", "Memory Guardian", "Broodstar"])
  test(`${name} composes artifact affinity, flying and its distinct resolved characteristics`, async () => {
    const g = await triggerGame();
    const spell = g.seed(name, "hand");
    for (let i = 0; i < 7; i++) g.seed("Mind Stone", "battlefield");
    const p = g.match.players[0].id;
    const before = g.handCount();
    force.mana(g.match, p, { U: name === "Broodstar" ? 2 : 1 });
    if (name === "Broodstar") force.mana(g.match, p, { C: 1 });
    expect(g.command(0, { type: "cast-spell", objectId: spell.id }).kind).toBe(
      "accepted",
    );
    g.pass();
    if (name === "Thought Monitor") g.pass();
    const permanent = Object.values(g.view().objects).find((o) =>
      o.cardInstanceIds?.includes(spell.cardInstanceIds[0]),
    )!;
    expect(permanent.characteristics.keywords).toContain("Flying");
    expect(g.view().rules!.mana[p].U).toBe(0);
    expect(g.handCount()).toBe(
      before - 1 + (name === "Thought Monitor" ? 2 : 0),
    );
    if (name === "Broodstar") expect(permanent.characteristics.power).toBe("7");
  });
