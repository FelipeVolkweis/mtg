import { expect, test } from "@playwright/test";
import "../../../support/round-trip";
import { effectGame } from "../../../support/effects";
import { force } from "../../../support/force";

// Player handlers: draw, gain-life, lose-life, become-monarch
// (rules-test-plan.md §19).

test("draw draws for each named player and binds the controller's count", async () => {
  const game = await effectGame();
  const hands = [0, 1].map((seat) => game.ids("hand", seat).length);
  game.resolve([
    { kind: "draw", player: "each-player", count: 2, bind: "drawn" },
    { kind: "gain-life", amount: { binding: "drawn" } },
  ]);
  expect(game.ids("hand", 0).length).toBe(hands[0] + 2);
  expect(game.ids("hand", 1).length).toBe(hands[1] + 2);
  expect(game.life(0)).toBe("42");
});

test("draw from an empty Library stops and records the failed draw", async () => {
  const game = await effectGame();
  force.clearZone(game.match, "library", game.player(0), 1);
  const hand = game.ids("hand", 0).length;
  game.resolve([{ kind: "draw", count: 3 }]);
  expect(game.ids("hand", 0).length).toBe(hand + 1);
  // The state-based check after resolution makes the player lose.
  expect(game.match.players[0].outcome).toBe("lost");
});

test("draw reads the chosen X", async () => {
  const game = await effectGame();
  const hand = game.ids("hand", 0).length;
  game.resolve([{ kind: "draw", count: { variable: "X" } }], { x: 3 });
  expect(game.ids("hand", 0).length).toBe(hand + 3);
});

test("life gain and loss change the named players' totals", async () => {
  const game = await effectGame();
  game.resolve([
    { kind: "gain-life", amount: 4 },
    { kind: "lose-life", player: "opponents", amount: 3 },
  ]);
  expect(game.life(0)).toBe("44");
  expect(game.life(1)).toBe("37");
});

test("lose-life can name the triggering event's player", async () => {
  const game = await effectGame();
  const source = game.seed("Scrawling Crawler", "battlefield");
  game.resolve(
    [{ kind: "lose-life", player: { event: "player" }, amount: 1 }],
    {
      source,
      event: {
        kind: "draw",
        playerId: game.player(1),
        sourceId: source.id,
        affectedId: source.id,
        controllerId: game.player(1),
        ownerId: game.player(1),
        after: source.characteristics,
      },
    },
  );
  expect(game.life(0)).toBe("40");
  expect(game.life(1)).toBe("39");
});

test("become-monarch makes the named player the monarch", async () => {
  const game = await effectGame();
  game.resolve([{ kind: "become-monarch", player: "you" }], { seat: 1 });
  expect(game.match.rules.monarchId).toBe(game.player(1));
});

test("become-monarch can name the controller of the event's object from last known information", async () => {
  const game = await effectGame();
  game.resolve(
    [
      {
        kind: "become-monarch",
        player: { controllerOf: { event: "object" } },
      },
    ],
    {
      event: {
        kind: "damage",
        sourceId: "gone",
        affectedId: "gone",
        controllerId: game.player(1),
        ownerId: game.player(1),
        after: { name: "Gone", colors: [], typeLine: "", rulesText: "" },
      },
    },
  );
  expect(game.match.rules.monarchId).toBe(game.player(1));
});
