// Characterization tests: the Mono-G cards that need the activation
// restrictions, conditional mana and optional effects the second phase of the
// port added (docs/plans/mono-g-port.md).
//
// Classification (rules test plan §2):
// | Test | Class | Reason
// | --- | --- | ---
// | Bonders' Enclave draws only if you control a creature with power 4 or greater | Add |
// | Whisperer of the Wilds adds {G}{G} only if you control a creature with power 4 or greater | Add |
// | Ilysian Caryatid adds two mana of one color instead with a creature of power 4 or greater | Add |
// | Garruk's Packleader draws when you accept and when another creature with power 3 or greater enters | Add |

import { expect, test } from "@playwright/test";
import "../../support/round-trip";
import { promptOf, viewOf } from "../../support/combat";
import { rulesGame, triggerGame } from "../../support/rules-game";
import { force } from "../../support/force";

const activate = (
  game: Awaited<ReturnType<typeof rulesGame>>,
  objectId: string,
  abilityId: string,
  color?: "G" | "R",
) =>
  game.command(0, { type: "activate-ability", objectId, abilityId, color })
    .kind;

test("Bonders' Enclave draws only if you control a creature with power 4 or greater", async () => {
  const game = await triggerGame();
  const enclave = game.seed("Bonders' Enclave", "battlefield");
  force.mana(game.match, game.match.players[0].id, { C: 3 });
  expect(activate(game, enclave.id, "draw")).toBe("rejected");
  expect(game.match.objects[enclave.id].status.tapped).toBe(false);
  expect(
    viewOf(game).actions!.some((a) => a.label.includes("Draw a card")),
  ).toBe(false);
  game.seed("Gigantosaurus", "battlefield");
  expect(
    viewOf(game).actions!.some((a) => a.label.includes("Draw a card")),
  ).toBe(true);
  const before = game.handCount();
  expect(activate(game, enclave.id, "draw")).toBe("accepted");
  game.pass();
  expect(game.handCount()).toBe(before + 1);
});

test("Whisperer of the Wilds adds {G}{G} only if you control a creature with power 4 or greater", async () => {
  const game = await rulesGame();
  const whisperer = game.seed("Whisperer of the Wilds", "battlefield");
  const pool = () => game.match.rules.mana[game.match.players[0].id].G;
  expect(activate(game, whisperer.id, "ferocious-mana", "G")).toBe("rejected");
  expect(pool()).toBe(0);
  game.seed("Gigantosaurus", "battlefield");
  expect(activate(game, whisperer.id, "ferocious-mana", "G")).toBe("accepted");
  expect(pool()).toBe(2);
  force.mana(game.match, game.match.players[0].id, { G: 0 });
  game.match.objects[whisperer.id].status.tapped = false;
  expect(activate(game, whisperer.id, "mana", "G")).toBe("accepted");
  expect(pool()).toBe(1);
});

test("Ilysian Caryatid adds two mana of one color instead with a creature of power 4 or greater", async () => {
  const game = await rulesGame();
  const caryatid = game.seed("Ilysian Caryatid", "battlefield");
  const pool = () => game.match.rules.mana[game.match.players[0].id];
  expect(activate(game, caryatid.id, "mana", "R")).toBe("accepted");
  expect(pool()).toMatchObject({ R: 1, G: 0 });
  game.match.objects[caryatid.id].status.tapped = false;
  game.seed("Gigantosaurus", "battlefield");
  expect(activate(game, caryatid.id, "mana", "R")).toBe("accepted");
  expect(pool()).toMatchObject({ R: 3 });
});

test("Garruk's Packleader draws when you accept and when another creature with power 3 or greater enters", async () => {
  for (const [creature, accept, draws] of [
    ["Gigantosaurus", true, 1],
    ["Gigantosaurus", false, 0],
    ["Llanowar Elves", true, 0],
  ] as [string, boolean, number][]) {
    const game = await triggerGame();
    game.seed("Garruk's Packleader", "battlefield");
    const spell = game.seed(creature, "hand");
    force.mana(game.match, game.match.players[0].id, { G: 9, C: 9 });
    game.command(0, { type: "cast-spell", objectId: spell.id });
    const before = game.handCount();
    game.pass(); // the creature enters
    const stack = game.match.zones.find((z) => z.kind === "stack")!;
    expect(stack.objectIds).toHaveLength(creature === "Gigantosaurus" ? 1 : 0);
    if (creature === "Gigantosaurus") {
      game.pass(); // the trigger asks whether you draw
      expect(promptOf(game).promptKind).toBe("resolution-choice");
      expect(
        game.command(0, {
          type: "rules-input",
          procedureId: promptOf(game).procedureId,
          confirm: accept,
        }).kind,
      ).toBe("accepted");
    }
    expect(game.handCount()).toBe(before + draws);
  }
});
