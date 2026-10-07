import { expect, test } from "@playwright/test";
import "../../../support/round-trip";
import { effectGame } from "../../../support/effects";

// Library handler: library-sequence (rules-test-plan.md §19).

test("scry puts chosen cards on the bottom, then orders the rest on top", async () => {
  const game = await effectGame();
  const [a, b, c, after] = game.ids("library", 0);
  game.resolve([
    {
      kind: "library-sequence",
      player: "you",
      count: 3,
      operation: "look",
      select: { max: 3, to: { zone: "library", position: "bottom" } },
      rest: { to: { zone: "library", position: "top" }, order: "any" },
    },
  ]);
  // The chooser sees the cards; the opponent doesn't.
  expect(game.view(0).objects[a]).toBeDefined();
  expect(game.view(1).objects[a]).toBeUndefined();
  expect(game.prompt().options.bottom.objectIds).toEqual([a, b, c]);
  expect(game.answer({ bottom: [b] }).kind).toBe("pending");
  expect(game.prompt().options.top.objectIds).toEqual([a, c]);
  // Ordering must name every remaining card.
  expect(game.answer({ top: [c] }).kind).toBe("rejected");
  expect(game.answer({ top: [c, a] }).kind).toBe("accepted");
  const library = game.ids("library", 0);
  expect(library.slice(0, 3)).toEqual([c, a, after]);
  expect(library.at(-1)).toBe(b);
  expect(game.match.rules!.resolving).toBeUndefined();
});

test("select one matching card to the Hand, revealed, and the rest to the bottom", async () => {
  const game = await effectGame();
  const artifact = game.seed("Sol Ring", "hand");
  const library = game.zone("library", 0);
  // Put the artifact on top of the Library.
  game
    .zone("hand", 0)
    .objectIds.splice(game.zone("hand", 0).objectIds.indexOf(artifact.id), 1);
  artifact.zoneId = library.id;
  library.objectIds.unshift(artifact.id);
  const [, second, third] = game.ids("library", 0);
  game.resolve([
    {
      kind: "library-sequence",
      player: "you",
      count: 3,
      operation: "look",
      select: {
        filter: { zone: "library", type: ["Artifact"] },
        max: 1,
        to: { zone: "hand" },
        reveal: true,
      },
      rest: { to: { zone: "library", position: "bottom" }, order: "keep" },
    },
  ]);
  const option = game.prompt().options.select;
  expect(option.objectIds).toContain(artifact.id);
  expect(option.minCount).toBe(0);
  expect(game.answer({ select: [artifact.id] }).kind).toBe("accepted");
  const [inHand] = game
    .ids("hand", 0)
    .filter((id) => game.match.objects[id].characteristics.name === "Sol Ring");
  expect(game.match.rules!.revealedHandIds).toContain(inHand);
  expect(game.view(1).objects[inHand]).toBeDefined();
  expect(game.ids("library", 0).slice(-2)).toEqual([second, third]);
});
