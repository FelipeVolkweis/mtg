import { expect, test } from "@playwright/test";
import "../../support/round-trip";
import { gameObject } from "../../../src/server/match/game-objects";
import { RulesEngine } from "../../../src/server/match/rules-engine";
import { StackResolutionRuntime } from "../../../src/server/rules/stack/stack-resolution";
import type { GameObject } from "../../../src/shared/rules-state";
import type { Ability } from "../../../src/shared/card-dsl";
import { author } from "../../support/authored";
import { effectGame } from "../../support/effects";
import { force } from "../../support/force";

// Stack Resolution Runtime (rules-test-plan.md §22): the resolution envelope
// is tested apart from instruction semantics. Which path a Stack object takes
// is checked directly; each path's effect is checked through Match commands.

type Game = Awaited<ReturnType<typeof effectGame>>;

/** An ability: one creature target and an optional intervening-if. */
function ability(options: { target?: boolean; atLeast?: number }): Ability {
  const body = {
    ...(options.target
      ? {
          targets: [
            {
              id: "target-0",
              filter: { zone: "battlefield" as const, type: ["Creature"] },
            },
          ],
        }
      : {}),
    effects: [{ kind: "gain-life" as const, amount: 1 }],
  };
  if (options.atLeast === undefined)
    return { id: "test", kind: "activated", costs: [], ...body };
  return {
    id: "test",
    kind: "triggered",
    trigger: { event: "step", step: "upkeep" },
    interveningIf: {
      compare: [
        { count: { all: { zone: "battlefield", type: ["Artifact"] } } },
        ">=",
        options.atLeast,
      ],
    },
    ...body,
  };
}

/** An ability Game Object waiting on the Stack. */
function stacked(game: Game, rules: Ability, targetIds: string[] = []) {
  const object = gameObject(
    "ability",
    game.zone("stack").id,
    game.player(0),
    game.player(0),
    { name: "Test ability", colors: [], typeLine: "Ability", rulesText: "" },
  );
  object.resolution = { ability: rules, targetIds };
  force.addObject(game.match, object);
  return object;
}

const path = (game: Game, object: GameObject) =>
  new StackResolutionRuntime(new RulesEngine(game.match, game.catalog)).path(
    object,
  );

test("an object without targets resolves its program", async () => {
  const game = await effectGame();
  expect(path(game, stacked(game, ability({})))).toBe("program");
});

test("one legal target resolves; an illegal one fails to resolve", async () => {
  const game = await effectGame();
  const myr = game.seed("Silver Myr", "battlefield", 1);
  const ring = game.seed("Sol Ring", "battlefield", 1);
  expect(path(game, stacked(game, ability({ target: true }), [myr.id]))).toBe(
    "program",
  );
  expect(path(game, stacked(game, ability({ target: true }), [ring.id]))).toBe(
    "fizzle",
  );
});

test("all targets illegal fails to resolve; some legal resolves", async () => {
  const game = await effectGame();
  const myr = game.seed("Silver Myr", "battlefield", 1);
  const gone = game.seed("Silver Myr", "battlefield", 1);
  force.move(game.match, gone, "graveyard", game.player(1));
  const ring = game.seed("Sol Ring", "battlefield", 1);
  const rules = ability({ target: true });
  expect(path(game, stacked(game, rules, [gone.id, ring.id]))).toBe("fizzle");
  expect(path(game, stacked(game, rules, [gone.id, myr.id]))).toBe("program");
});

test("an intervening-if is checked again on resolution", async () => {
  const game = await effectGame();
  game.seed("Sol Ring", "battlefield");
  expect(path(game, stacked(game, ability({ atLeast: 1 })))).toBe("program");
  expect(path(game, stacked(game, ability({ atLeast: 2 })))).toBe("fizzle");
});

test("a permanent spell takes the permanent path; instants and sorceries run programs", async () => {
  const game = await effectGame();
  const ring = game.seed("Sol Ring", "hand");
  const negate = game.seed("Negate", "hand");
  force.move(game.match, ring, "stack");
  force.move(game.match, negate, "stack");
  const cast: Ability = { id: "cast", kind: "spell" };
  ring.resolution = { ability: cast, targetIds: [] };
  negate.resolution = { ability: cast, targetIds: [] };
  expect(path(game, game.match.objects[ring.id])).toBe("permanent");
  expect(path(game, game.match.objects[negate.id])).toBe("program");
});

test("a failed instruction program leaves no trace: an ability ceases, nothing runs", async () => {
  const game = await effectGame();
  const ring = game.seed("Sol Ring", "battlefield", 1);
  const object = stacked(game, ability({ target: true }), [ring.id]);
  force.priority(game.match, game.player(0));
  game.command(0, { type: "pass-priority" });
  game.command(1, { type: "pass-priority" });
  expect(game.match.objects[object.id]).toBeUndefined();
  expect(game.ids("stack")).toEqual([]);
  expect(game.life(0)).toBe("40");
  expect(game.match.priority?.playerId).toBe(game.match.turn.activePlayerId);
});

test("an Ability Game Object runs its program and ceases", async () => {
  const game = await effectGame();
  const object = stacked(game, ability({}));
  force.priority(game.match, game.player(0));
  game.command(0, { type: "pass-priority" });
  game.command(1, { type: "pass-priority" });
  expect(game.life(0)).toBe("41");
  expect(game.match.objects[object.id]).toBeUndefined();
});

test("a resolving instant runs its program, then goes to its owner's Graveyard; a fizzled one runs nothing", async () => {
  for (const legal of [true, false]) {
    const game = await effectGame();
    const myr = game.seed("Silver Myr", "battlefield", 1);
    const spell = game.seed("Counterspell", "hand");
    await author(
      game.catalog.definitions[
        game.match.instances[spell.cardInstanceIds[0]].definitionId
      ],
      [
        {
          id: "zap",
          kind: "spell",
          targets: [
            {
              id: "target-0",
              filter: { zone: "battlefield", type: ["Creature"] },
            },
          ],
          effects: [
            { kind: "tap", objects: "target" },
            { kind: "gain-life", amount: 2 },
          ],
        },
      ],
    );
    force.mana(game.match, game.player(0), { U: 2 });
    game.command(0, { type: "cast-spell", objectId: spell.id });
    game.command(0, {
      type: "rules-input",
      procedureId: game.match.rules!.pending!.id,
      targetIds: [myr.id],
    });
    if (!legal)
      force.move(
        game.match,
        game.match.objects[myr.id],
        "hand",
        game.player(1),
      );
    game.command(0, { type: "pass-priority" });
    game.command(1, { type: "pass-priority" });
    expect(game.life(0)).toBe(legal ? "42" : "40");
    // A zone change makes a new object (CR 400.7): compare by name.
    const graveyard = game.ids("graveyard", 0);
    expect(graveyard).toHaveLength(1);
    expect(game.match.objects[graveyard[0]].characteristics.name).toBe(
      "Counterspell",
    );
    expect(game.ids("stack")).toEqual([]);
  }
});

test("a permanent spell enters the Battlefield without an effect program", async () => {
  const game = await effectGame();
  const ring = game.seed("Sol Ring", "hand");
  force.mana(game.match, game.player(0), { C: 1 });
  game.command(0, { type: "cast-spell", objectId: ring.id });
  game.command(0, { type: "pass-priority" });
  game.command(1, { type: "pass-priority" });
  expect(
    game
      .ids("battlefield")
      .map((id) => game.match.objects[id].characteristics.name),
  ).toContain("Sol Ring");
  expect(game.match.rules!.resolving).toBeUndefined();
  expect(game.match.rules!.pending).toBeUndefined();
});
