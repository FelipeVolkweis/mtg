import { expect, test } from "@playwright/test";
import "../../../support/round-trip";
import { effectGame } from "../../../support/effects";
import { gameObject } from "../../../../src/server/match/game-objects";
import { force } from "../../../support/force";

// Zone-change handlers: move, destroy, sacrifice, exile, counter
// (rules-test-plan.md §19).

test("move sends every matching object to its owner's Zone as one set", async () => {
  const game = await effectGame();
  const attacker = game.seed("Silver Myr", "battlefield", 1);
  const blocker = game.seed("Silver Myr", "battlefield", 0);
  force.rules(game.match, {
    combat: {
      attackers: [
        {
          objectId: attacker.id,
          defenderId: game.player(0),
          defendingPlayerId: game.player(0),
          blockerIds: [blocker.id],
          blocked: true,
        },
      ],
      remainingDefenderIds: [],
    },
  });
  game.resolve([
    {
      kind: "move",
      objects: {
        all: { zone: "battlefield", type: ["Creature"], status: "attacking" },
      },
      to: { zone: "hand" },
    },
  ]);
  const hand = game.ids("hand", 1).map((id) => game.match.objects[id]);
  expect(hand.at(-1)!.characteristics.name).toBe("Silver Myr");
  expect(hand.at(-1)!.ownerId).toBe(game.player(1));
  expect(game.ids("battlefield")).toContain(blocker.id);
  expect(game.match.objects[attacker.id]).toBeUndefined();
});

test("destroy skips indestructible permanents and binds what it moved", async () => {
  const game = await effectGame();
  const ring = game.seed("Sol Ring", "battlefield");
  const citadel = game.seed("Darksteel Citadel", "battlefield");
  game.resolve([
    {
      kind: "destroy",
      objects: { all: { zone: "battlefield", type: ["Artifact"] } },
      bind: "destroyed",
    },
    { kind: "gain-life", amount: { count: { binding: "destroyed" } } },
  ]);
  expect(game.match.objects[ring.id]).toBeUndefined();
  expect(game.ids("battlefield")).toContain(citadel.id);
  // Only the Sol Ring moved, so the bound set has one object.
  expect(game.life(0)).toBe("41");
});

test("sacrifice affects only permanents; a card in a Hand stays", async () => {
  const game = await effectGame();
  const permanent = game.seed("Sol Ring", "battlefield");
  const card = game.seed("Sol Ring", "hand");
  game.resolve([
    {
      kind: "sacrifice",
      objects: { all: { type: ["Artifact"], controller: "you" } },
    },
  ]);
  expect(game.match.objects[permanent.id]).toBeUndefined();
  expect(game.ids("hand", 0)).toContain(card.id);
  expect(
    game
      .ids("graveyard", 0)
      .some((id) => game.match.objects[id].characteristics.name === "Sol Ring"),
  ).toBe(true);
});

test("exile with a link records the exiled card on the source", async () => {
  const game = await effectGame();
  const source = game.seed("Duplicant", "battlefield");
  const target = game.seed("Silver Myr", "battlefield", 1);
  game.resolve(
    [{ kind: "exile", objects: { target: "target-0" }, linkAs: "imprint" }],
    { source, targetIds: [target.id] },
  );
  const [exiled] = game.ids("exile");
  expect(game.match.objects[exiled].characteristics.name).toBe("Silver Myr");
  expect(game.match.objects[source.id].links).toEqual([
    { label: "imprint", objectIds: [exiled] },
  ]);
});

test("a chosen object waits for its controller's selection and resumes once", async () => {
  const game = await effectGame();
  const first = game.seed("Mind Stone", "hand");
  const second = game.seed("Sol Ring", "hand");
  expect(
    game.resolve([
      {
        kind: "move",
        objects: {
          choose: { from: { zone: "hand", type: ["Artifact"] }, count: 1 },
        },
        to: { zone: "battlefield" },
      },
    ]).kind,
  ).toBe("pending");
  const prompt = game.prompt();
  expect(prompt.selectionOptions.select.objectIds.sort()).toEqual(
    [first.id, second.id].sort(),
  );
  // Choosing two objects for a one-object choice is rejected.
  expect(game.answer({ select: [first.id, second.id] }).kind).toBe("rejected");
  expect(game.answer({ select: [second.id] }).kind).toBe("accepted");
  expect(game.ids("hand", 0)).toContain(first.id);
  expect(
    game
      .ids("battlefield")
      .map((id) => game.match.objects[id].characteristics.name),
  ).toContain("Sol Ring");
  expect(game.match.rules!.resolving).toBeUndefined();
});

test("counter puts a spell into its owner's Graveyard and ends an ability", async () => {
  const game = await effectGame();
  const spell = game.seed("Silver Myr", "hand", 1);
  force.move(game.match, spell, "stack");
  const ability = gameObject(
    "ability",
    game.zone("stack").id,
    game.player(1),
    game.player(1),
    {
      name: "Countered ability",
      colors: [],
      typeLine: "Ability",
      rulesText: "",
    },
  );
  force.addObject(game.match, ability);
  game.resolve([{ kind: "counter", objects: { target: "target-0" } }], {
    targetIds: [spell.id, ability.id],
  });
  expect(game.match.objects[ability.id]).toBeUndefined();
  expect(game.ids("stack")).toEqual([]);
  expect(
    game
      .ids("graveyard", 1)
      .map((id) => game.match.objects[id].characteristics.name),
  ).toEqual(["Silver Myr"]);
});

test("counter ignores an object that is no longer on the Stack", async () => {
  const game = await effectGame();
  const permanent = game.seed("Silver Myr", "battlefield", 1);
  game.resolve([{ kind: "counter", objects: { target: "target-0" } }], {
    targetIds: [permanent.id],
  });
  expect(game.ids("battlefield")).toContain(permanent.id);
});
