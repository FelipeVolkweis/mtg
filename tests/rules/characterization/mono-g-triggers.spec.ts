// Characterization tests: the Mono-G cards that need the triggers the second
// phase of the port added (docs/plans/mono-g-port.md): step triggers, the
// damage trigger with a recipient predicate and the blocks trigger.
//
// Classification (rules test plan §2):
// | Test | Class | Reason
// | --- | --- | ---
// | Hulking Raptor adds {G}{G} at the beginning of your first main phase | Add |
// | Ripjaw Raptor draws whenever it is dealt damage | Add |
// | Surrak, the Hunt Caller gives haste at the beginning of combat with total power 8 or greater | Add |
// | Thickest in the Thicket puts counters equal to the creature's power | Add |
// | Thickest in the Thicket draws two at your end step with the greatest power | Add |

import { expect, test } from "@playwright/test";
import "../../support/round-trip";
import { triggerGame } from "../../support/rules-game";
import { force } from "../../support/force";

type Game = Awaited<ReturnType<typeof triggerGame>>;
const stackCount = (game: Game) =>
  game.match.zones.find((z) => z.kind === "stack")!.objectIds.length;
const keywords = (game: Game, id: string) =>
  game.view().objects[id].characteristics.keywords;

test("Hulking Raptor adds {G}{G} at the beginning of your first main phase", async () => {
  const game = await triggerGame();
  game.seed("Hulking Raptor", "battlefield", 1);
  expect(stackCount(game)).toBe(0);
  force.step(game.match, "end");
  game.pass(); // into the opponent's upkeep
  while (game.match.turn.step !== "precombat-main") game.pass();
  expect(game.match.turn.activePlayerId).toBe(game.match.players[1].id);
  expect(stackCount(game)).toBe(1);
  game.pass();
  expect(game.match.rules.mana[game.match.players[1].id].G).toBe(2);
});

test("Ripjaw Raptor draws whenever it is dealt damage", async () => {
  const game = await triggerGame();
  const attacker = game.seed("Llanowar Elves", "battlefield");
  const raptor = game.seed("Ripjaw Raptor", "battlefield", 1);
  game.pass();
  game.pass();
  game.answer({ [attacker.id]: [game.match.players[1].id] });
  game.pass();
  game.answer({ [raptor.id]: [attacker.id] }, 1);
  const before = game.handCount(1);
  game.pass(); // combat damage: the Elves deal 1 to the Raptor
  expect(game.match.objects[raptor.id]).toBeDefined();
  expect(stackCount(game)).toBe(1);
  game.pass();
  expect(game.handCount(1)).toBe(before + 1);
});

test("Surrak, the Hunt Caller gives haste at the beginning of combat with total power 8 or greater", async () => {
  for (const [extra, triggers] of [
    ["Gigantosaurus", true],
    ["Llanowar Elves", false],
  ] as [string, boolean][]) {
    const game = await triggerGame();
    game.seed("Surrak, the Hunt Caller", "battlefield");
    const target = game.seed("Silver Myr", "battlefield");
    game.seed(extra, "battlefield");
    game.pass(); // into the beginning of combat
    expect(game.match.turn.step).toBe("begin-combat");
    if (!triggers) {
      expect(stackCount(game)).toBe(0);
      continue;
    }
    game.command(0, {
      type: "rules-input",
      procedureId: game.view().rules.prompt!.procedureId,
      targetIds: [target.id],
    });
    expect(keywords(game, target.id)).toEqual([]);
    game.pass();
    expect(keywords(game, target.id)).toEqual(["Haste"]);
  }
});

test("Thickest in the Thicket puts counters equal to the creature's power", async () => {
  const game = await triggerGame();
  const creature = game.seed("Regal Imperiosaur", "battlefield");
  const enchantment = game.seed("Thickest in the Thicket", "hand");
  force.mana(game.match, game.match.players[0].id, { G: 5, C: 5 });
  game.command(0, { type: "cast-spell", objectId: enchantment.id });
  game.pass(); // the enchantment enters and its trigger asks for a target
  game.command(0, {
    type: "rules-input",
    procedureId: game.view().rules.prompt!.procedureId,
    targetIds: [creature.id],
  });
  game.pass();
  expect(game.match.objects[creature.id].counters).toEqual([
    { kind: "+1/+1", quantity: "5" },
  ]);
});

test("Thickest in the Thicket draws two at your end step with the greatest power", async () => {
  for (const [rival, draws] of [
    ["Llanowar Elves", 2],
    ["Gigantosaurus", 0],
  ] as [string, number][]) {
    const game = await triggerGame();
    game.seed("Thickest in the Thicket", "battlefield");
    game.seed("Regal Imperiosaur", "battlefield");
    game.seed(rival, "battlefield", 1);
    const before = game.handCount();
    force.step(game.match, "postcombat-main");
    game.pass();
    expect(game.match.turn.step).toBe("end");
    expect(stackCount(game)).toBe(1);
    game.pass();
    expect(game.handCount()).toBe(before + draws);
  }
});
