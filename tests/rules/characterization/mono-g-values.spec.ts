// Characterization tests: the Mono-G cards that need the values and
// conditions the second phase of the port added (docs/plans/mono-g-port.md):
// total, product and the generic static and intervening-if conditions.
//
// Classification (rules test plan §2):
// | Test | Class | Reason
// | --- | --- | ---
// | Paradise Druid has hexproof only while untapped | Add |
// | Colossal Majesty draws at your upkeep only with a creature of power 4 or greater | Add |
// | Garruk's Uprising draws on entering and for later big creatures, and gives trample | Add |
// | Garruk's Uprising draws nothing on entering without a creature of power 4 or greater | Add |
// | Ghalta costs {X} less, where X is the total power of your creatures | Add |
// | Shamanic Revelation draws per creature and gains 4 life per creature with power 4 or greater | Add |
// | Pugnacious Hammerskull stuns itself unless you control another Dinosaur, and a stunned permanent doesn't untap | Add |

import { expect, test } from "@playwright/test";
import "../../support/round-trip";
import { rulesGame, triggerGame } from "../../support/rules-game";
import { force } from "../../support/force";

test("Paradise Druid has hexproof only while untapped", async () => {
  const game = await triggerGame();
  const druid = game.seed("Paradise Druid", "battlefield");
  const keywords = () => game.view().objects[druid.id].characteristics.keywords;
  expect(keywords()).toEqual(["Hexproof"]);
  expect(
    game.command(0, {
      type: "activate-ability",
      objectId: druid.id,
      abilityId: "mana",
      color: "R",
    }).kind,
  ).toBe("accepted");
  expect(game.match.rules.mana[game.match.players[0].id].R).toBe(1);
  expect(keywords()).toEqual([]);
});

test("Colossal Majesty draws at your upkeep only with a creature of power 4 or greater", async () => {
  for (const [creature, draws] of [
    ["Gigantosaurus", 1],
    ["Llanowar Elves", 0],
  ] as [string, number][]) {
    const game = await triggerGame();
    game.seed("Colossal Majesty", "battlefield", 1);
    game.seed(creature, "battlefield", 1);
    force.step(game.match, "end");
    game.pass();
    expect(game.match.turn.step).toBe("upkeep");
    expect(game.match.turn.activePlayerId).toBe(game.match.players[1].id);
    const before = game.handCount(1);
    // The trigger waits on the Stack at the upkeep, or doesn't trigger.
    expect(game.view().zones.find((z) => z.kind === "stack")!.count).toBe(
      draws,
    );
    if (draws) game.pass();
    expect(game.handCount(1)).toBe(before + draws);
  }
});

test("Garruk's Uprising draws on entering and for later big creatures, and gives trample", async () => {
  const game = await triggerGame();
  const big = game.seed("Gigantosaurus", "battlefield");
  const uprising = game.seed("Garruk's Uprising", "hand");
  const imperiosaur = game.seed("Regal Imperiosaur", "hand");
  const small = game.seed("Llanowar Elves", "hand");
  force.mana(game.match, game.match.players[0].id, { G: 9, C: 9 });
  const before = game.handCount();
  game.command(0, { type: "cast-spell", objectId: uprising.id });
  game.pass(); // the enchantment enters
  game.pass(); // its entry trigger
  expect(game.handCount()).toBe(before - 1 + 1);
  expect(game.view().objects[big.id].characteristics.keywords).toEqual([
    "Trample",
  ]);
  game.command(0, { type: "cast-spell", objectId: small.id });
  game.pass();
  expect(game.handCount()).toBe(before - 2 + 1);
  game.command(0, { type: "cast-spell", objectId: imperiosaur.id });
  game.pass();
  game.pass();
  expect(game.handCount()).toBe(before - 3 + 2);
});

test("Garruk's Uprising draws nothing on entering without a creature of power 4 or greater", async () => {
  const game = await triggerGame();
  game.seed("Llanowar Elves", "battlefield");
  const uprising = game.seed("Garruk's Uprising", "hand");
  force.mana(game.match, game.match.players[0].id, { G: 3 });
  const before = game.handCount();
  game.command(0, { type: "cast-spell", objectId: uprising.id });
  game.pass();
  expect(game.match.zones.find((z) => z.kind === "stack")!.objectIds).toEqual(
    [],
  );
  expect(game.handCount()).toBe(before - 1);
});

test("Ghalta costs {X} less, where X is the total power of your creatures", async () => {
  const game = await rulesGame();
  const player = game.match.players[0].id;
  // {10}{G}{G} with no creatures can't be paid with {G}{G}.
  const alone = game.seed("Ghalta, Primal Hunger", "hand");
  force.mana(game.match, player, { G: 2 });
  expect(game.command(0, { type: "cast-spell", objectId: alone.id }).kind).toBe(
    "pending",
  );
  const other = await rulesGame();
  const ghalta = other.seed("Ghalta, Primal Hunger", "hand");
  other.seed("Gigantosaurus", "battlefield");
  other.seed("Gigantosaurus", "battlefield", 1); // not yours: not counted
  force.mana(other.match, other.match.players[0].id, { G: 2 });
  expect(
    other.command(0, { type: "cast-spell", objectId: ghalta.id }).kind,
  ).toBe("accepted");
  expect(other.match.rules.mana[other.match.players[0].id].G).toBe(0);
});

test("Shamanic Revelation draws per creature and gains 4 life per creature with power 4 or greater", async () => {
  const game = await triggerGame();
  game.seed("Llanowar Elves", "battlefield");
  game.seed("Gigantosaurus", "battlefield");
  game.seed("Regal Imperiosaur", "battlefield");
  game.seed("Gigantosaurus", "battlefield", 1);
  const spell = game.seed("Shamanic Revelation", "hand");
  force.mana(game.match, game.match.players[0].id, { G: 5, C: 5 });
  const before = game.handCount();
  game.command(0, { type: "cast-spell", objectId: spell.id });
  game.pass();
  expect(game.handCount()).toBe(before - 1 + 3);
  expect(game.match.players[0].life).toBe("48");
});

test("Pugnacious Hammerskull stuns itself unless you control another Dinosaur, and a stunned permanent doesn't untap", async () => {
  for (const [other, stunned] of [
    [undefined, true],
    ["Gigantosaurus", false],
  ] as [string | undefined, boolean][]) {
    const game = await triggerGame();
    const hammerskull = game.seed("Pugnacious Hammerskull", "battlefield");
    if (other) game.seed(other, "battlefield");
    game.pass();
    game.pass();
    game.answer({ [hammerskull.id]: [game.match.players[1].id] });
    game.pass(); // the stun trigger resolves
    const counters = () => game.match.objects[hammerskull.id].counters;
    expect(counters()).toEqual(
      stunned ? [{ kind: "stun", quantity: "1" }] : [],
    );
    force.step(game.match, "end");
    // Through the opponent's turn and into the next untap step.
    for (let turns = 0; game.match.turn.number < 3 && turns < 40; turns++) {
      const pending = game.match.rules.pending;
      if (pending) {
        const seat = game.match.players.findIndex(
          (p) => p.id === pending.playerId,
        );
        const hand = game.match.zones.find(
          (z) => z.kind === "hand" && z.ownerId === pending.playerId,
        )!;
        // Cleanup asks for a discard; a declaration is left empty.
        game.answer(
          pending.kind === "cleanup" ? { discard: [hand.objectIds[0]] } : {},
          seat,
        );
      } else game.pass();
    }
    expect(game.match.turn.number).toBe(3);
    expect(game.match.objects[hammerskull.id].status.tapped).toBe(stunned);
    expect(counters()).toEqual([]);
  }
});
