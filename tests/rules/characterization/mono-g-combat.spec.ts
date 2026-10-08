// Characterization tests: the Mono-G cards that need the combat keywords the
// second phase of the port added (docs/plans/mono-g-port.md): trample,
// deathtouch and lifelink.
//
// Classification (rules test plan §2):
// | Test | Class | Reason
// | --- | --- | ---
// | Carnage Tyrant assigns lethal damage to its blocker before trampling over to the player | Add |
// | a trampler whose blocker left combat assigns all its damage to the player | Add |
// | a creature without trample can't assign past its blocker | Add |
// | Witch's Clinic gives a commander lifelink until end of turn | Add |
// | Goreclaw's attack trigger pumps and tramples only creatures with power 4 or greater | Add |
// | Goreclaw reduces the cost of creature spells with power 4 or greater by {2} | Add |
// | Surrak and Goreclaw gives other creatures trample and grows each nontoken creature that enters | Add |

import { expect, test } from "@playwright/test";
import "../../support/round-trip";
import {
  assign,
  attack,
  both,
  life,
  promptOf,
  viewOf,
} from "../../support/combat";
import { rulesGame } from "../../support/rules-game";
import { force } from "../../support/force";

type Game = Awaited<ReturnType<typeof rulesGame>>;

test("Carnage Tyrant assigns lethal damage to its blocker before trampling over to the player", async () => {
  const game = await rulesGame();
  const tyrant = game.seed("Carnage Tyrant", "battlefield");
  const blocker = game.seed("Silver Myr", "battlefield", 1);
  attack(game, [tyrant], { [blocker.id]: tyrant.id });
  const choice = promptOf(game);
  expect(choice.promptKind).toBe("combat-damage");
  expect(choice.damageChoices![0].recipientIds).toEqual([
    blocker.id,
    game.match.players[1].id,
  ]);
  expect(choice.damageChoices![0].trample).toEqual({
    defenderId: game.match.players[1].id,
    lethal: { [blocker.id]: 1 },
  });
  const player = { id: game.match.players[1].id };
  // Damage to the player before lethal damage to the blocker is refused.
  expect(assign(game, tyrant, [[player, 7]]).kind).toBe("rejected");
  expect(
    assign(game, tyrant, [
      [blocker, 0],
      [player, 7],
    ]).kind,
  ).toBe("rejected");
  expect(
    assign(game, tyrant, [
      [blocker, 1],
      [player, 6],
    ]).kind,
  ).toBe("accepted");
  expect(game.match.objects[blocker.id]).toBeUndefined();
  expect(life(game, 1)).toBe(34);
});

test("a trampler whose blocker left combat assigns all its damage to the player", async () => {
  const game = await rulesGame();
  const tyrant = game.seed("Carnage Tyrant", "battlefield");
  const blocker = game.seed("Silver Myr", "battlefield", 1);
  both(game);
  both(game);
  game.command(0, {
    type: "rules-input",
    procedureId: promptOf(game).procedureId,
    selections: { [tyrant.id]: [game.match.players[1].id] },
  });
  both(game);
  game.command(1, {
    type: "rules-input",
    procedureId: promptOf(game, 1).procedureId,
    selections: { [blocker.id]: [tyrant.id] },
  });
  delete game.match.objects[blocker.id];
  for (const zone of game.match.zones)
    zone.objectIds = zone.objectIds.filter((id) => id !== blocker.id);
  both(game);
  expect(life(game, 1)).toBe(33);
});

test("a creature without trample can't assign past its blocker", async () => {
  const game = await rulesGame();
  const brute = game.seed("Gigantosaurus", "battlefield");
  const blocker = game.seed("Silver Myr", "battlefield", 1);
  attack(game, [brute], { [blocker.id]: brute.id });
  expect(game.match.objects[blocker.id]).toBeUndefined();
  expect(life(game, 1)).toBe(40);
});

test("Witch's Clinic gives a commander lifelink until end of turn", async () => {
  const game = await rulesGame();
  const clinic = game.seed("Witch's Clinic", "battlefield");
  const commander = game.seed("Gigantosaurus", "battlefield");
  const other = game.seed("Llanowar Elves", "battlefield");
  force.commander(game.match, commander.cardInstanceIds[0]);
  force.mana(game.match, game.match.players[0].id, { C: 2 });
  expect(
    game.command(0, {
      type: "activate-ability",
      objectId: clinic.id,
      abilityId: "lifelink",
    }).kind,
  ).toBe("pending");
  expect(promptOf(game).targets[0].legalIds).toEqual([commander.id]);
  game.command(0, {
    type: "rules-input",
    procedureId: promptOf(game).procedureId,
    targetIds: [commander.id],
  });
  both(game);
  expect(viewOf(game).objects[commander.id].characteristics.keywords).toEqual([
    "Lifelink",
  ]);
  expect(viewOf(game).objects[other.id].characteristics.keywords).toEqual([]);
  attack(game, [commander]);
  expect(life(game, 1)).toBe(30);
  expect(life(game, 0)).toBe(50);
});

const characteristics = (game: Game, id: string) =>
  viewOf(game).objects[id].characteristics;

test("Goreclaw's attack trigger pumps and tramples only creatures with power 4 or greater", async () => {
  const game = await rulesGame();
  const goreclaw = game.seed("Goreclaw, Terror of Qal Sisma", "battlefield");
  const big = game.seed("Gigantosaurus", "battlefield");
  const small = game.seed("Llanowar Elves", "battlefield");
  both(game);
  both(game);
  game.command(0, {
    type: "rules-input",
    procedureId: promptOf(game).procedureId,
    selections: { [goreclaw.id]: [game.match.players[1].id] },
  });
  both(game); // the attack trigger resolves
  expect(characteristics(game, goreclaw.id)).toMatchObject({
    power: "5",
    toughness: "4",
    keywords: ["Trample"],
  });
  expect(characteristics(game, big.id)).toMatchObject({
    power: "11",
    keywords: ["Trample"],
  });
  expect(characteristics(game, small.id)).toMatchObject({
    power: "1",
    keywords: [],
  });
});

test("Goreclaw reduces the cost of creature spells with power 4 or greater by {2}", async () => {
  const game = await rulesGame();
  game.seed("Goreclaw, Terror of Qal Sisma", "battlefield");
  const big = game.seed("Regal Imperiosaur", "hand");
  const small = game.seed("Llanowar Elves", "hand");
  const player = game.match.players[0].id;
  force.mana(game.match, player, { G: 3, C: 0 });
  // {1}{G}{G} less {2}: {G}{G}.
  game.command(0, { type: "cast-spell", objectId: big.id });
  expect(game.match.rules.mana[player].G).toBe(1);
  both(game);
  force.mana(game.match, player, { G: 1 });
  game.command(0, { type: "cast-spell", objectId: small.id });
  expect(game.match.rules.mana[player].G).toBe(0);
});

test("Surrak and Goreclaw gives other creatures trample and grows each nontoken creature that enters", async () => {
  const game = await rulesGame();
  const surrak = game.seed("Surrak and Goreclaw", "battlefield");
  const other = game.seed("Llanowar Elves", "battlefield");
  expect(characteristics(game, surrak.id).keywords).toEqual(["Trample"]);
  expect(characteristics(game, other.id).keywords).toEqual(["Trample"]);
  const entering = game.seed("Fyndhorn Elves", "hand");
  force.mana(game.match, game.match.players[0].id, { G: 2 });
  game.command(0, { type: "cast-spell", objectId: entering.id });
  both(game); // the creature spell enters
  both(game); // the trigger
  const entered = Object.values(game.match.objects).find(
    (o) =>
      o.characteristics.name === "Fyndhorn Elves" &&
      game.match.zones.find((z) => z.id === o.zoneId)!.kind === "battlefield",
  )!;
  expect(entered.counters).toEqual([{ kind: "+1/+1", quantity: "1" }]);
  expect(characteristics(game, entered.id)).toMatchObject({
    power: "2",
    keywords: expect.arrayContaining(["Haste", "Trample"]),
  });
  // Its own entry doesn't trigger it, and tokens don't either.
  expect(game.match.objects[surrak.id].counters).toEqual([]);
});
