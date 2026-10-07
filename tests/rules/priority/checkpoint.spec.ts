import { expect, test } from "@playwright/test";
import "../../support/round-trip";
import { RulesEngine } from "../../../src/server/match/rules-engine";
import { registerStateBasedRule } from "../../../src/server/rules/state-based/registry";
import { stateBasedRules } from "../../../src/server/rules/state-based/registry";
import type { StateBasedRule } from "../../../src/server/rules/state-based/types";
import type { GameObject, MatchState } from "../../../src/shared/model";
import { author } from "../../support/authored";
import { effectGame } from "../../support/effects";
import { force } from "../../support/force";

// Priority Checkpoint tests (rules-test-plan.md §23): whenever a player would
// receive Priority, state-based actions and trigger placement repeat until
// the game is stable, and only then is Priority granted.

type Game = Awaited<ReturnType<typeof effectGame>>;

const engine = (game: Game, match: MatchState = game.match) =>
  new RulesEngine(match, game.catalog);

/** A creature whose death makes its controller draw. */
async function dying(game: Game, seat = 0) {
  const creature = game.seed("Vedalken Archmage", "battlefield", seat);
  await author(
    game.catalog.definitions[
      game.match.instances[creature.cardInstanceIds[0]].definitionId
    ],
    [
      {
        id: "death",
        kind: "triggered",
        trigger: {
          event: "zone-change",
          object: "source",
          from: "battlefield",
          to: "graveyard",
        },
        effects: [{ kind: "draw", count: 1 }],
      },
    ],
  );
  return creature;
}

/** Runs with a synthetic State-Based Rule registered. */
async function withRule(rule: StateBasedRule, body: () => Promise<void>) {
  const remove = registerStateBasedRule(rule);
  try {
    await body();
  } finally {
    remove();
  }
}

/** A stable game: no state-based action applies and no trigger waits. */
function expectStable(game: Game, match: MatchState = game.match) {
  const query = engine(game, match).query;
  for (const rule of stateBasedRules())
    expect(rule.evaluate(query).kind, rule.id).not.toBe("changes");
  expect(match.rules!.waitingTriggers ?? []).toEqual([]);
  expect(match.rules).not.toHaveProperty("triggerPlacement");
  expect(match.rules).not.toHaveProperty("checkpoint");
}

const stackSources = (game: Game) =>
  game.ids("stack").map((id) => game.match.objects[id].sourceAbilityId);

test("a stable state grants Priority at once", async () => {
  const game = await effectGame();
  Reflect.deleteProperty(game.match, "priority");
  engine(game).checkpoint({ playerId: game.player(1) });
  expect(game.match.priority).toEqual({
    playerId: game.player(1),
    passedPlayerIds: [],
  });
  expectStable(game);
});

test("a state-based action is performed, then Priority is granted", async () => {
  const game = await effectGame();
  const myr = game.seed("Silver Myr", "battlefield");
  force.rules(game.match, { markedDamage: { [myr.id]: 1 } });
  Reflect.deleteProperty(game.match, "priority");
  engine(game).checkpoint();
  expect(game.match.objects[myr.id]).toBeUndefined();
  expect(game.match.priority?.playerId).toBe(game.player(0));
  expectStable(game);
});

test("a state-based action that causes another repeats the check before Priority", async () => {
  const game = await effectGame();
  const aura = game.seed("Untamed Hunger", "battlefield");
  const myr = game.seed("Silver Myr", "battlefield");
  force.attach(aura, myr);
  force.rules(game.match, { markedDamage: { [myr.id]: 1 } });
  engine(game).checkpoint();
  expect(game.match.objects[myr.id]).toBeUndefined();
  expect(game.match.objects[aura.id]).toBeUndefined();
  expect(game.match.priority).toBeDefined();
  expectStable(game);
});

test("a state-based action that triggers puts the trigger on the Stack before Priority", async () => {
  const game = await effectGame();
  const creature = await dying(game);
  force.rules(game.match, { markedDamage: { [creature.id]: 5 } });
  engine(game).checkpoint();
  expect(game.match.objects[creature.id]).toBeUndefined();
  expect(stackSources(game)).toEqual(["death"]);
  expect(game.match.priority?.playerId).toBe(game.player(0));
  expectStable(game);
});

test("trigger placement that causes a state-based action repeats the checkpoint", async () => {
  const game = await effectGame();
  const creature = await dying(game);
  const marker = game.seed("Silver Myr", "battlefield", 1);
  // Synthetic: the marker dies once a "death" ability is on the Stack.
  const rule: StateBasedRule = {
    id: "test-stack-watcher",
    evaluate: (query) =>
      query
        .zone("stack")
        .objectIds.some((id) => query.object(id).sourceAbilityId === "death") &&
      query.match.objects[marker.id]
        ? {
            kind: "changes",
            changes: [{ kind: "graveyard", objectId: marker.id }],
          }
        : { kind: "none" },
  };
  await withRule(rule, async () => {
    force.rules(game.match, { markedDamage: { [creature.id]: 5 } });
    engine(game).checkpoint();
    expect(stackSources(game)).toEqual(["death"]);
    expect(game.match.objects[marker.id]).toBeUndefined();
    expect(game.ids("graveyard", 1)).toHaveLength(1);
    expect(game.match.priority).toBeDefined();
    expectStable(game);
  });
});

/** Synthetic: while `marker` is on the Battlefield, its owner chooses. */
function choiceRule(marker: GameObject, answered: string[]): StateBasedRule {
  return {
    id: "test-choice",
    evaluate: (query) =>
      query.match.objects[marker.id]
        ? {
            kind: "choice",
            procedure: {
              id: crypto.randomUUID(),
              playerId: marker.controllerId,
              kind: "state-based-choice",
              stage: "selection",
              sourceId: marker.id,
              targetIds: [],
              selections: {},
              totalCost: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, generic: 0 },
            },
          }
        : { kind: "none" },
    answer(ctx, pending, input) {
      if (input.confirm === undefined)
        throw new Error("Choose Confirm or Decline.");
      answered.push(pending.id);
      ctx.propose({
        kind: "zone-change",
        objectId: pending.sourceId!,
        to: ctx.query.zone("graveyard", marker.ownerId),
      });
      return true;
    },
  };
}

test("a state-based choice suspends the checkpoint, survives restore, and resumes it to Priority", async () => {
  const game = await effectGame();
  const marker = await dying(game, 1);
  const answered: string[] = [];
  await withRule(choiceRule(marker, answered), async () => {
    // Player 0 passes: player 1 would receive Priority.
    expect(game.command(0, { type: "pass-priority" }).kind).toBe("pending");
    expect(game.match.priority).toBeUndefined();
    const pending = game.match.rules!.pending!;
    expect(pending).toMatchObject({
      kind: "state-based-choice",
      stateBasedRule: "test-choice",
      playerId: game.player(1),
    });
    expect(game.match.rules!.checkpoint).toEqual({
      playerId: game.player(1),
      passedPlayerIds: [game.player(0)],
    });
    // Only the chooser sees the procedure; nobody has Priority.
    expect(game.view(1).rules!.prompt!.procedureId).toBe(pending.id);
    expect(game.view(0).rules!.prompt).toBeUndefined();
    expect(game.view(0).priority).toBeUndefined();
    expect(game.command(1, { type: "pass-priority" }).kind).toBe("rejected");

    const restored: MatchState = JSON.parse(JSON.stringify(game.match));
    expect(
      game.service.execute(
        restored,
        game.room.participants[1],
        { type: "rules-input", procedureId: pending.id, confirm: true },
        game.catalog,
      ).kind,
    ).toBe("accepted");
    expect(answered).toEqual([pending.id]);
    expect(restored.objects[marker.id]).toBeUndefined();
    // The same checkpoint resumed: the death trigger went on the Stack, then
    // player 1 received Priority with player 0's pass kept.
    expect(
      restored.zones
        .find((z) => z.kind === "stack")!
        .objectIds.map((id) => restored.objects[id].sourceAbilityId),
    ).toEqual(["death"]);
    expect(restored.priority).toEqual({
      playerId: game.player(1),
      passedPlayerIds: [game.player(0)],
    });
    expectStable(game, restored);
  });
});

test("a stale state-based choice id is refused and changes nothing", async () => {
  const game = await effectGame();
  const marker = game.seed("Silver Myr", "battlefield");
  await withRule(choiceRule(marker, []), async () => {
    engine(game).checkpoint();
    const before = JSON.stringify(game.match);
    expect(
      game.command(0, {
        type: "rules-input",
        procedureId: "stale",
        confirm: true,
      }).kind,
    ).toBe("rejected");
    expect(JSON.stringify(game.match)).toBe(before);
  });
});

test("every Priority grant through a turn follows a stable checkpoint", async () => {
  const game = await effectGame();
  const creature = await dying(game);
  game.seed("Silver Myr", "battlefield", 1);
  force.rules(game.match, { markedDamage: { [creature.id]: 5 } });
  // The forced state reaches Priority the way the engine does.
  engine(game).checkpoint();
  const seen = new Set<number>();
  // Pass through every step to the next turn, resolving what triggers.
  for (let i = 0; i < 60 && game.match.turn.number < 3; i++) {
    const pending = game.match.rules!.pending;
    if (pending) {
      const seat = game.match.players.findIndex(
        (p) => p.id === pending.playerId,
      );
      const hand = game.ids("hand", seat);
      // Cleanup discards down to seven; other choices take no selection.
      const selections: Record<string, string[]> =
        pending.kind === "cleanup"
          ? { discard: hand.slice(0, hand.length - 7) }
          : {};
      expect(
        game.command(seat, {
          type: "rules-input",
          procedureId: pending.id,
          selections,
        }).kind,
      ).not.toBe("rejected");
      continue;
    }
    const priority = game.match.priority!;
    expect(priority).toBeDefined();
    expectStable(game);
    seen.add(game.match.turn.stepIndex);
    const seat = game.match.players.findIndex(
      (p) => p.id === priority.playerId,
    );
    expect(game.command(seat, { type: "pass-priority" }).kind).not.toBe(
      "rejected",
    );
  }
  expect(game.match.turn.number).toBe(3);
  expect(seen.size).toBeGreaterThan(5);
});
