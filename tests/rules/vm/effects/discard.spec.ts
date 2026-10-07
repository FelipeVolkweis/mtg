import { expect, test } from "@playwright/test";
import "../../../support/round-trip";
import { effectGame } from "../../../support/effects";
import { force } from "../../../support/force";

// Discard handlers: discard and choose-one among discards
// (rules-test-plan.md §19).

test("discard offers only matching cards and binds how many were discarded", async () => {
  const game = await effectGame();
  force.clearZone(game.match, "hand", game.player(0));
  const artifact = game.seed("Sol Ring", "hand");
  game.seed("Negate", "hand");
  expect(
    game.resolve([
      {
        kind: "discard",
        count: 2,
        filter: { type: ["Artifact"] },
        bind: "discarded",
      },
      { kind: "gain-life", amount: { binding: "discarded" } },
    ]).kind,
  ).toBe("pending");
  const option = game.prompt().selectionOptions.discard;
  // Only one artifact can be discarded of the two requested.
  expect(option).toMatchObject({
    count: 1,
    requestedCount: 2,
    objectIds: [artifact.id],
    types: ["Artifact"],
  });
  expect(game.answer({ discard: [artifact.id] }).kind).toBe("accepted");
  expect(game.ids("graveyard", 0).length).toBe(1);
  expect(game.life(0)).toBe("41");
});

test("discard with nothing to discard binds zero without a prompt", async () => {
  const game = await effectGame();
  force.clearZone(game.match, "hand", game.player(0));
  expect(
    game.resolve([
      { kind: "discard", count: 1, bind: "discarded" },
      {
        kind: "if",
        condition: { compare: [{ binding: "discarded" }, "=", 0] },
        then: [{ kind: "gain-life", amount: 5 }],
      },
    ]).kind,
  ).toBe("accepted");
  expect(game.life(0)).toBe("45");
});

const thirst = [
  {
    kind: "choose-one" as const,
    options: [
      {
        id: "artifact",
        label: "Discard one artifact card",
        available: {
          exists: { all: { zone: "hand" as const, type: ["Artifact"] } },
        },
        effects: [
          {
            kind: "discard" as const,
            count: 1,
            filter: { type: ["Artifact"] },
          },
        ],
      },
      {
        id: "cards",
        label: "Discard two cards",
        effects: [{ kind: "discard" as const, count: 2 }],
      },
    ],
  },
];

test("choose-one offers every complete discard and takes one answer", async () => {
  const game = await effectGame();
  force.clearZone(game.match, "hand", game.player(0));
  const artifact = game.seed("Sol Ring", "hand");
  const other = game.seed("Negate", "hand");
  game.resolve(thirst);
  const options = game.prompt().selectionOptions;
  expect(Object.keys(options).sort()).toEqual(["artifact", "cards"]);
  // Answering two options at once is rejected.
  expect(
    game.answer({ artifact: [artifact.id], cards: [artifact.id, other.id] })
      .kind,
  ).toBe("rejected");
  expect(game.answer({ cards: [artifact.id, other.id] }).kind).toBe("accepted");
  expect(game.ids("hand", 0)).toEqual([]);
});

test("choose-one drops an incomplete option when a complete one exists", async () => {
  const game = await effectGame();
  force.clearZone(game.match, "hand", game.player(0));
  game.seed("Sol Ring", "hand");
  game.resolve(thirst);
  // One card can't complete "discard two"; the artifact option can.
  expect(Object.keys(game.prompt().selectionOptions)).toEqual(["artifact"]);
});
