// Characterization tests: the Mono-G cards that need the rules grants the
// second phase of the port added (docs/plans/mono-g-port.md): attack and
// block restrictions, the limit on blockers and additional land plays.
//
// Classification (rules test plan §2):
// | Test | Class | Reason
// | --- | --- | ---
// | Rhonas can't attack or block without another creature with power 4 or greater | Add |
// | Rhonas's deathtouch destroys what it damages while indestructible keeps it alive | Add |
// | Rhonas's ability gives another creature +2/+0 and trample | Add |
// | Challenger Troll lets only one creature block a creature with power 4 or greater | Add |
// | Steel Leaf Champion can't be blocked by creatures with power 2 or less | Add |

import { expect, test } from "@playwright/test";
import "../../support/round-trip";
import {
  attack,
  both,
  declareAttackers,
  declareBlockers,
  life,
  promptOf,
  viewOf,
} from "../../support/combat";
import { rulesGame } from "../../support/rules-game";
import { force } from "../../support/force";

test("Rhonas can't attack or block without another creature with power 4 or greater", async () => {
  const game = await rulesGame();
  const rhonas = game.seed("Rhonas the Indomitable", "battlefield");
  both(game);
  both(game);
  // Alone, nothing is offered to attack with.
  expect(game.match.rules.pending).toBeUndefined();

  const other = await rulesGame();
  const mine = other.seed("Rhonas the Indomitable", "battlefield");
  other.seed("Gigantosaurus", "battlefield");
  both(other);
  both(other);
  expect(promptOf(other).options[mine.id]).toBeDefined();
  expect(rhonas.id).not.toBe(mine.id);

  // As a defender: it is offered no block while alone, and one with a big friend.
  for (const [friend, offered] of [
    [undefined, false],
    ["Gigantosaurus", true],
  ] as [string | undefined, boolean][]) {
    const defense = await rulesGame();
    const attacker = defense.seed("Llanowar Elves", "battlefield");
    const blocker = defense.seed("Rhonas the Indomitable", "battlefield", 1);
    if (friend) defense.seed(friend, "battlefield", 1);
    declareAttackers(defense, [attacker]);
    both(defense);
    expect(promptOf(defense, 1).options[blocker.id] !== undefined).toBe(
      offered,
    );
  }
});

test("Rhonas's deathtouch destroys what it damages while indestructible keeps it alive", async () => {
  const game = await rulesGame();
  const rhonas = game.seed("Rhonas the Indomitable", "battlefield");
  game.seed("Regal Imperiosaur", "battlefield");
  const blocker = game.seed("Gigantosaurus", "battlefield", 1);
  attack(game, [rhonas], { [blocker.id]: rhonas.id });
  // 5 damage is far short of the 10/10's toughness; only deathtouch kills it.
  expect(game.match.objects[blocker.id]).toBeUndefined();
  // 10 damage on a 5/5 is lethal, but indestructible.
  expect(game.match.objects[rhonas.id]).toBeDefined();
});

test("Rhonas's ability gives another creature +2/+0 and trample", async () => {
  const game = await rulesGame();
  const rhonas = game.seed("Rhonas the Indomitable", "battlefield");
  const elves = game.seed("Llanowar Elves", "battlefield");
  force.mana(game.match, game.match.players[0].id, { G: 1, C: 2 });
  expect(
    game.command(0, {
      type: "activate-ability",
      objectId: rhonas.id,
      abilityId: "pump",
    }).kind,
  ).toBe("pending");
  // "Another" creature: Rhonas itself isn't a legal target.
  expect(promptOf(game).targets[0].legalIds).toEqual([elves.id]);
  game.command(0, {
    type: "rules-input",
    procedureId: promptOf(game).procedureId,
    targetIds: [elves.id],
  });
  both(game);
  expect(viewOf(game).objects[elves.id].characteristics).toMatchObject({
    power: "3",
    toughness: "1",
    keywords: ["Trample"],
  });
});

test("Challenger Troll lets only one creature block a creature with power 4 or greater", async () => {
  for (const [name, doubleBlock] of [
    ["Challenger Troll", false],
    ["Gigantosaurus", false],
    ["Llanowar Elves", true],
  ] as [string, boolean][]) {
    const game = await rulesGame();
    game.seed("Challenger Troll", "battlefield");
    const attacker = game.seed(name, "battlefield");
    const a = game.seed("Silver Myr", "battlefield", 1);
    const b = game.seed("Silver Myr", "battlefield", 1);
    declareAttackers(game, [attacker]);
    const result = declareBlockers(game, {
      [a.id]: attacker.id,
      [b.id]: attacker.id,
    });
    expect(result.kind).toBe(doubleBlock ? "accepted" : "rejected");
  }
});

test("Steel Leaf Champion can't be blocked by creatures with power 2 or less", async () => {
  const game = await rulesGame();
  const champion = game.seed("Steel Leaf Champion", "battlefield");
  const small = game.seed("Silver Myr", "battlefield", 1);
  const big = game.seed("Regal Imperiosaur", "battlefield", 1);
  declareAttackers(game, [champion]);
  both(game);
  const options = promptOf(game, 1).options;
  expect(options[small.id].objectIds).toEqual([]);
  expect(options[big.id].objectIds).toEqual([champion.id]);
  expect(life(game, 1)).toBe(40);
});
