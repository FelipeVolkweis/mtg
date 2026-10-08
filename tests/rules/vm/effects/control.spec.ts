import { expect, test } from "@playwright/test";
import "../../../support/round-trip";
import { effectGame } from "../../../support/effects";
import { force } from "../../../support/force";

// Control-flow handlers: sequence, if, may, may-pay, for-each-player
// (rules-test-plan.md §19).

test("sequence and if run nested instructions through the registry", async () => {
  const game = await effectGame();
  game.resolve([
    {
      kind: "sequence",
      effects: [
        { kind: "gain-life", amount: 1 },
        {
          kind: "if",
          condition: { compare: [{ lifeTotal: "you" }, ">", 50] },
          then: [{ kind: "gain-life", amount: 100 }],
          else: [{ kind: "lose-life", player: "opponents", amount: 2 }],
        },
      ],
    },
  ]);
  expect(game.life(0)).toBe("41");
  expect(game.life(1)).toBe("38");
});

test("may lets the controller decline an optional move and binds whether it happened", async () => {
  for (const accept of [true, false]) {
    const game = await effectGame();
    const target = game.seed("Silver Myr", "battlefield", 1);
    game.resolve(
      [
        {
          kind: "may",
          bind: "exiled",
          effects: [{ kind: "exile", objects: { target: "target-0" } }],
        },
        {
          kind: "if",
          condition: { didPerform: "exiled" },
          then: [{ kind: "gain-life", amount: 3 }],
        },
      ],
      { targetIds: [target.id] },
    );
    const option = game.prompt().options.select;
    expect(option).toMatchObject({ minCount: 0, objectIds: [target.id] });
    game.answer({ select: accept ? [target.id] : [] });
    expect(!!game.match.objects[target.id]).toBe(!accept);
    expect(game.life(0)).toBe(accept ? "43" : "40");
  }
});

test("may-pay asks the named player and runs then or else", async () => {
  for (const pay of [true, false]) {
    const game = await effectGame();
    force.mana(game.match, game.player(1), { C: 2 });
    game.resolve(
      [
        {
          kind: "may-pay",
          player: { event: "player" },
          costs: [{ kind: "mana", symbols: ["{2}"] }],
          then: [{ kind: "gain-life", amount: 1 }],
          else: [{ kind: "draw", count: 1 }],
        },
      ],
      {
        event: {
          kind: "target",
          playerId: game.player(1),
          sourceId: "x",
          affectedId: "x",
          controllerId: game.player(0),
          ownerId: game.player(0),
          after: { name: "X", colors: [], typeLine: "", rulesText: "" },
        },
      },
    );
    const pending = game.view(1).rules.prompt!;
    expect(game.match.rules.pending!.playerId).toBe(game.player(1));
    const hand = game.ids("hand", 0).length;
    expect(
      game.command(1, {
        type: "rules-input",
        procedureId: pending.procedureId,
        confirm: pay,
      }).kind,
    ).toBe("accepted");
    expect(game.match.rules.mana[game.player(1)].C).toBe(pay ? 0 : 2);
    expect(game.life(0)).toBe(pay ? "41" : "40");
    expect(game.ids("hand", 0).length).toBe(pay ? hand : hand + 1);
  }
});

test("may-pay can't be paid without the mana", async () => {
  const game = await effectGame();
  game.resolve([
    {
      kind: "may-pay",
      costs: [{ kind: "mana", symbols: ["{3}"] }],
      then: [{ kind: "gain-life", amount: 1 }],
    },
  ]);
  expect(
    game.command(0, {
      type: "rules-input",
      procedureId: game.prompt().procedureId,
      confirm: true,
    }).kind,
  ).toBe("rejected");
});

test("for-each-player collects each player's selection, then all leave together", async () => {
  const game = await effectGame();
  const mine = game.seed("Mind Stone", "battlefield");
  const theirs = game.seed("Negate", "hand", 1);
  // Colored permanents: put a blue card onto the Battlefield for each player.
  const blue = [game.seed("Negate", "hand"), theirs].map((card) => {
    force.move(game.match, card, "battlefield");
    return card;
  });
  game.resolve([
    {
      kind: "for-each-player",
      players: "each-player",
      order: "APNAP",
      effects: [
        {
          kind: "sacrifice",
          objects: {
            all: {
              zone: "battlefield",
              color: "any",
              controller: { binding: "player" },
            },
          },
        },
      ],
    },
  ]);
  expect(game.prompt(0).options.select.objectIds).toEqual([blue[0].id]);
  expect(game.answer({ select: [blue[0].id] }).kind).toBe("pending");
  // Nothing has left yet: every selection leaves at once.
  expect(game.match.objects[blue[0].id]).toBeDefined();
  expect(game.prompt(1).options.select.objectIds).toEqual([blue[1].id]);
  expect(game.answer({ select: [blue[1].id] }, 1).kind).toBe("accepted");
  expect(game.match.objects[blue[0].id]).toBeUndefined();
  expect(game.match.objects[blue[1].id]).toBeUndefined();
  expect(game.match.objects[mine.id]).toBeDefined();
});
