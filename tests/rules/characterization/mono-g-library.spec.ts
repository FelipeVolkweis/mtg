// Characterization tests: the Mono-G cards that need the library sequences
// the second phase of the port added (docs/plans/mono-g-port.md): reveal
// until a card matches, a filtered pick onto the Battlefield and hideaway.
//
// Classification (rules test plan §2):
// | Test | Class | Reason
// | --- | --- | ---
// | Clifftop Lookout puts the first land revealed onto the Battlefield tapped and the rest on the bottom | Add |
// | Loot, Exuberant Explorer puts a creature with mana value up to your lands onto the Battlefield | Add |
// | Loot, Exuberant Explorer allows one additional land play each turn | Add |
// | Mosswort Bridge exiles a card face down, hidden from the opponent | Add |
// | Mosswort Bridge plays the hidden card free with total power 10 or greater | Add |
// | Mosswort Bridge can't play a hidden land without a land play | Add |

import { expect, test } from "@playwright/test";
import "../../support/round-trip";
import { triggerGame } from "../../support/rules-game";
import { force } from "../../support/force";

type Game = Awaited<ReturnType<typeof triggerGame>>;

/** Puts these cards on top of a player's Library, in order. */
function stack(game: Game, names: string[], seat = 0) {
  const playerId = game.match.players[seat].id;
  const top = names.map((name) => game.seed(name, "hand", seat));
  const library = game.match.zones.find(
    (z) => z.kind === "library" && z.ownerId === playerId,
  )!;
  force.zoneContents(game.match, "library", playerId, [
    ...top,
    ...library.objectIds.map((id) => game.match.objects[id]),
  ]);
  return top;
}
const library = (game: Game, seat = 0) =>
  game.match.zones.find(
    (z) => z.kind === "library" && z.ownerId === game.match.players[seat].id,
  )!;
const nameOf = (game: Game, id: string) =>
  game.match.objects[id].characteristics.name;
const onBattlefield = (game: Game, name: string) =>
  Object.values(game.match.objects).filter(
    (o) =>
      o.characteristics.name === name &&
      game.match.zones.find((z) => z.id === o.zoneId)!.kind === "battlefield",
  );

test("Clifftop Lookout puts the first land revealed onto the Battlefield tapped and the rest on the bottom", async () => {
  const game = await triggerGame();
  stack(game, ["Harmonize", "Llanowar Elves", "Forest", "Sol Ring"]);
  const before = library(game).objectIds.length;
  const spell = game.seed("Clifftop Lookout", "hand");
  force.mana(game.match, game.match.players[0].id, { G: 3 });
  game.command(0, { type: "cast-spell", objectId: spell.id });
  game.pass(); // the creature enters
  game.pass(); // its trigger
  const [forest] = onBattlefield(game, "Forest");
  expect(forest.status.tapped).toBe(true);
  const ids = library(game).objectIds;
  expect(ids).toHaveLength(before - 1);
  expect(nameOf(game, ids[0])).toBe("Sol Ring");
  expect(
    ids
      .slice(-2)
      .map((id) => nameOf(game, id))
      .sort(),
  ).toEqual(["Harmonize", "Llanowar Elves"]);
});

test("Loot, Exuberant Explorer puts a creature with mana value up to your lands onto the Battlefield", async () => {
  const game = await triggerGame();
  const loot = game.seed("Loot, Exuberant Explorer", "battlefield");
  for (let i = 0; i < 3; i++) game.seed("Forest", "battlefield");
  const [big, small] = stack(game, [
    "Gigantosaurus",
    "Llanowar Elves",
    "Harmonize",
    "Sol Ring",
    "Forest",
    "Silver Myr",
  ]);
  force.mana(game.match, game.match.players[0].id, { G: 2, C: 4 });
  expect(
    game.command(0, {
      type: "activate-ability",
      objectId: loot.id,
      abilityId: "dig",
    }).kind,
  ).toBe("accepted");
  game.pass();
  // Only the creature with mana value 1 or less … up to the three lands.
  const options = game.view().rules.prompt!.options.select;
  expect(options.objectIds).toEqual([
    small.id,
    game.match.zones
      .find(
        (z) => z.kind === "library" && z.ownerId === game.match.players[0].id,
      )!
      .objectIds.find((id) => nameOf(game, id) === "Silver Myr")!,
  ]);
  expect(options.objectIds).not.toContain(big.id);
  expect(options.minCount).toBe(0);
  game.answer({ select: [small.id] });
  expect(onBattlefield(game, "Llanowar Elves")).toHaveLength(1);
  expect(onBattlefield(game, "Gigantosaurus")).toHaveLength(0);
  // The five cards left of the six go to the bottom.
  const bottom = library(game)
    .objectIds.slice(-5)
    .map((id) => nameOf(game, id))
    .sort();
  expect(bottom).toEqual(
    ["Forest", "Gigantosaurus", "Harmonize", "Silver Myr", "Sol Ring"].sort(),
  );
});

test("Loot, Exuberant Explorer allows one additional land play each turn", async () => {
  const game = await triggerGame();
  const lands = [1, 2, 3].map(() => game.seed("Forest", "hand"));
  const play = (land: { id: string }) =>
    game.command(0, { type: "play-land", objectId: land.id }).kind;
  expect(play(lands[0])).toBe("accepted");
  expect(play(lands[1])).toBe("rejected");
  game.seed("Loot, Exuberant Explorer", "battlefield");
  expect(play(lands[1])).toBe("accepted");
  expect(play(lands[2])).toBe("rejected");
});

/** Plays Mosswort Bridge with these cards on top and hides the second. */
function hideaway(game: Game, names: string[]) {
  const top = stack(game, names);
  const bridge = game.seed("Mosswort Bridge", "hand");
  expect(game.command(0, { type: "play-land", objectId: bridge.id }).kind).toBe(
    "accepted",
  );
  game.pass(); // the hideaway trigger resolves and asks for a card
  return top;
}

test("Mosswort Bridge exiles a card face down, hidden from the opponent", async () => {
  const game = await triggerGame();
  const [, wanted] = hideaway(game, [
    "Harmonize",
    "Gigantosaurus",
    "Forest",
    "Sol Ring",
  ]);
  const prompt = game.view().rules.prompt!;
  expect(prompt.options.select.minCount).toBe(1);
  expect(prompt.options.select.objectIds).toHaveLength(4);
  game.answer({ select: [wanted.id] });
  const exiled = Object.values(game.match.objects).find(
    (o) => o.status.faceDown,
  )!;
  expect(exiled.characteristics.name).toBe("Gigantosaurus");
  const entered = onBattlefield(game, "Mosswort Bridge")[0];
  expect(entered.links).toEqual([
    { label: "hideaway", objectIds: [exiled.id] },
  ]);
  // The owner sees the card; the opponent only that something is exiled.
  expect(game.view(0).objects[exiled.id].characteristics.name).toBe(
    "Gigantosaurus",
  );
  expect(game.view(1).objects[exiled.id].characteristics.name).toBe(
    "Face-down card",
  );
  // The other three go to the bottom of the Library.
  expect(library(game).objectIds.slice(-3)).toHaveLength(3);
});

test("Mosswort Bridge plays the hidden card free with total power 10 or greater", async () => {
  for (const [power, played] of [
    ["Gigantosaurus", true],
    ["Llanowar Elves", false],
  ] as [string, boolean][]) {
    const game = await triggerGame();
    const [, wanted] = hideaway(game, ["Harmonize", "Gigantosaurus"]);
    game.answer({ select: [wanted.id] });
    game.seed(power, "battlefield");
    const bridge = onBattlefield(game, "Mosswort Bridge")[0];
    bridge.status.tapped = false;
    force.mana(game.match, game.match.players[0].id, { G: 1 });
    expect(
      game.command(0, {
        type: "activate-ability",
        objectId: bridge.id,
        abilityId: "play-hidden",
      }).kind,
    ).toBe("accepted");
    game.pass(); // the ability resolves
    if (played) {
      expect(game.view().rules.prompt!.promptKind).toBe("resolution-choice");
      game.command(0, {
        type: "rules-input",
        procedureId: game.view().rules.prompt!.procedureId,
        confirm: true,
      });
      // Gigantosaurus costs {G}{G}{G}{G}{G}, and none of it was paid.
      expect(game.match.rules.mana[game.match.players[0].id].G).toBe(0);
      expect(
        game.match.zones.find((z) => z.kind === "stack")!.objectIds,
      ).toHaveLength(1);
      game.pass();
    }
    expect(onBattlefield(game, "Gigantosaurus")).toHaveLength(played ? 2 : 0);
  }
});

test("Mosswort Bridge can't play a hidden land without a land play", async () => {
  const game = await triggerGame();
  const [, wanted] = hideaway(game, ["Harmonize", "Forest"]);
  game.answer({ select: [wanted.id] });
  game.seed("Gigantosaurus", "battlefield");
  const bridge = onBattlefield(game, "Mosswort Bridge")[0];
  bridge.status.tapped = false;
  force.mana(game.match, game.match.players[0].id, { G: 1 });
  game.command(0, {
    type: "activate-ability",
    objectId: bridge.id,
    abilityId: "play-hidden",
  });
  game.pass();
  game.command(0, {
    type: "rules-input",
    procedureId: game.view().rules.prompt!.procedureId,
    confirm: true,
  });
  // Playing the Bridge used this turn's land play.
  expect(game.match.rules.pending).toBeUndefined();
  expect(onBattlefield(game, "Forest")).toHaveLength(0);
});
