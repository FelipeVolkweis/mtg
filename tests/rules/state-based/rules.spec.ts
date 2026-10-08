import { expect, test } from "@playwright/test";
import "../../support/round-trip";
import { gameObject } from "../../../src/server/match/game-objects";
import { RulesEngine } from "../../../src/server/match/rules-engine";
import { stateBasedRule } from "../../../src/server/rules/state-based/registry";
import { StateBasedRuntime } from "../../../src/server/rules/state-based/state-based-runtime";
import { effectGame } from "../../support/effects";
import { force } from "../../support/force";

// State-Based Action tests (rules-test-plan.md §26): each State-Based Rule
// is evaluated on its own against a forced state, then the runtime performs
// what it found.

type Game = Awaited<ReturnType<typeof effectGame>>;

const engine = (game: Game) => new RulesEngine(game.match, game.catalog);
const evaluate = (game: Game, id: string) =>
  stateBasedRule(id).evaluate(engine(game).query);
const check = (game: Game) => new StateBasedRuntime(engine(game)).check();

test("a stable state has no state-based action", async () => {
  const game = await effectGame();
  game.seed("Silver Myr", "battlefield");
  expect(check(game)).toEqual({ kind: "stable", performed: false });
});

test("zero toughness: a creature with toughness 0 or less goes to its owner's Graveyard", async () => {
  const game = await effectGame();
  const myr = game.seed("Silver Myr", "battlefield", 1);
  expect(evaluate(game, "zero-toughness")).toEqual({ kind: "none" });
  force.counters(myr, [{ kind: "-1/-1", quantity: "1" }]);
  expect(evaluate(game, "zero-toughness")).toEqual({
    kind: "changes",
    changes: [{ kind: "graveyard", objectId: myr.id }],
  });
  expect(check(game).performed).toBe(true);
  expect(game.match.objects[myr.id]).toBeUndefined();
  expect(game.ids("graveyard", 1)).toHaveLength(1);
});

test("lethal damage: marked damage at least toughness destroys, unless indestructible", async () => {
  const game = await effectGame();
  const myr = game.seed("Silver Myr", "battlefield");
  force.rules(game.match, { markedDamage: { [myr.id]: 0 } });
  expect(evaluate(game, "lethal-damage")).toEqual({ kind: "none" });
  force.rules(game.match, { markedDamage: { [myr.id]: 1 } });
  expect(evaluate(game, "lethal-damage")).toEqual({
    kind: "changes",
    changes: [{ kind: "graveyard", objectId: myr.id }],
  });
  myr.characteristics = {
    ...myr.characteristics,
    keywords: ["Indestructible"],
  };
  expect(evaluate(game, "lethal-damage")).toEqual({ kind: "none" });
});

test("Aura legality: an Aura attached to nothing or a noncreature goes to the Graveyard", async () => {
  const game = await effectGame();
  const aura = game.seed("Untamed Hunger", "battlefield");
  const myr = game.seed("Silver Myr", "battlefield");
  force.attach(aura, myr);
  expect(evaluate(game, "aura-legality")).toEqual({ kind: "none" });
  force.move(game.match, myr, "graveyard", game.player(0));
  expect(evaluate(game, "aura-legality")).toEqual({
    kind: "changes",
    changes: [{ kind: "graveyard", objectId: aura.id }],
  });
  force.attach(aura, null);
  expect(evaluate(game, "aura-legality")).toMatchObject({ kind: "changes" });
});

test("Equipment legality: an Equipment attached illegally becomes unattached and stays", async () => {
  const game = await effectGame();
  const gear = game.seed("Adventuring Gear", "battlefield");
  const myr = game.seed("Silver Myr", "battlefield");
  force.attach(gear, myr);
  expect(evaluate(game, "equipment-legality")).toEqual({ kind: "none" });
  force.attach(gear, null);
  expect(evaluate(game, "equipment-legality")).toEqual({ kind: "none" });
  const land = game.seed("Island", "battlefield");
  force.attach(gear, land);
  expect(evaluate(game, "equipment-legality")).toEqual({
    kind: "changes",
    changes: [{ kind: "unattach", objectId: gear.id }],
  });
  check(game);
  expect(game.match.objects[gear.id].attachmentTo).toBeNull();
  expect(game.ids("battlefield")).toContain(gear.id);
});

test("+1/+1 and -1/-1 counters cancel out", async () => {
  const game = await effectGame();
  const myr = game.seed("Silver Myr", "battlefield");
  force.counters(myr, [
    { kind: "+1/+1", quantity: "3" },
    { kind: "-1/-1", quantity: "1" },
  ]);
  expect(evaluate(game, "counter-cancellation")).toEqual({
    kind: "changes",
    changes: [{ kind: "cancel-counters", objectId: myr.id, amount: "1" }],
  });
  check(game);
  expect(game.match.objects[myr.id].counters).toEqual([
    { kind: "+1/+1", quantity: "2" },
  ]);
});

test("a token outside the Battlefield ceases to exist", async () => {
  const game = await effectGame();
  const token = gameObject(
    "token",
    game.zone("graveyard", 0).id,
    game.player(0),
    game.player(0),
    { name: "Thopter", colors: [], typeLine: "Token", rulesText: "" },
  );
  force.addObject(game.match, token);
  expect(evaluate(game, "token-ceases-to-exist")).toEqual({
    kind: "changes",
    changes: [{ kind: "cease", objectId: token.id }],
  });
  check(game);
  expect(game.match.objects[token.id]).toBeUndefined();
  expect(game.ids("graveyard", 0)).not.toContain(token.id);
});

test("zero life, a failed draw and 21 commander damage each lose the game", async () => {
  for (const [id, setup] of [
    ["zero-life-loss", (g: Game) => (g.match.players[1].life = "0")],
    [
      "failed-draw-loss",
      (g: Game) => force.rules(g.match, { failedDrawPlayerIds: [g.player(1)] }),
    ],
    [
      "commander-damage-loss",
      (g: Game) =>
        force.rules(g.match, {
          commanderDamage: { [g.player(1)]: { commander: 21 } },
        }),
    ],
  ] as const) {
    const game = await effectGame();
    expect(evaluate(game, id)).toEqual({ kind: "none" });
    setup(game);
    expect(evaluate(game, id)).toEqual({
      kind: "changes",
      changes: [{ kind: "lose", playerId: game.player(1) }],
    });
    check(game);
    expect(game.match.players[1].outcome).toBe("lost");
    expect(game.match.players[0].outcome).toBe("won");
    expect(game.match.outcome).toBe("complete");
    expect(game.match.priority).toBeUndefined();
  }
});

test("20 commander damage and positive life don't lose", async () => {
  const game = await effectGame();
  force.rules(game.match, {
    commanderDamage: { [game.player(1)]: { a: 20, b: 20 } },
  });
  expect(evaluate(game, "commander-damage-loss")).toEqual({ kind: "none" });
  expect(evaluate(game, "zero-life-loss")).toEqual({ kind: "none" });
});

test("all applicable state-based actions are performed as one simultaneous event", async () => {
  const game = await effectGame();
  const lethal = game.seed("Silver Myr", "battlefield");
  const zero = game.seed("Silver Myr", "battlefield", 1);
  force.rules(game.match, { markedDamage: { [lethal.id]: 1 } });
  force.counters(zero, [{ kind: "-1/-1", quantity: "1" }]);
  const zoneChanges: unknown[] = [];
  const e = engine(game);
  const propose = e.propose.bind(e);
  e.propose = (event) => {
    zoneChanges.push(event);
    return propose(event);
  };
  new StateBasedRuntime(e).check();
  // Both deaths see the same Battlefield, captured before either moved.
  const [first, second] = zoneChanges as {
    simultaneous: { sources: { id: string }[] };
  }[];
  expect(zoneChanges).toHaveLength(2);
  expect(first.simultaneous.sources.map((o) => o.id)).toEqual(
    second.simultaneous.sources.map((o) => o.id),
  );
  expect(first.simultaneous.sources.map((o) => o.id)).toEqual(
    expect.arrayContaining([lethal.id, zero.id]),
  );
});

test("a state-based action that causes another repeats the check", async () => {
  const game = await effectGame();
  const aura = game.seed("Untamed Hunger", "battlefield");
  const myr = game.seed("Silver Myr", "battlefield");
  force.attach(aura, myr);
  force.rules(game.match, { markedDamage: { [myr.id]: 1 } });
  // The creature dies first; then its Aura is attached to nothing.
  expect(check(game)).toEqual({ kind: "stable", performed: true });
  expect(game.match.objects[myr.id]).toBeUndefined();
  expect(game.match.objects[aura.id]).toBeUndefined();
  expect(game.ids("graveyard", 0)).toHaveLength(2);
});

test("commander return: a commander in a Graveyard is a choice; answering resumes the checkpoint", async () => {
  const game = await effectGame();
  const p = game.player(0);
  const commander = Object.values(game.match.objects).find((o) =>
    o.cardInstanceIds.includes(game.match.rules.commanders[p].instanceId),
  )!;
  force.move(game.match, commander, "graveyard", p);
  force.rules(game.match, { commanderReturns: ["gone", commander.id] });
  const result = evaluate(game, "commander-return");
  expect(result).toMatchObject({
    kind: "choice",
    procedure: {
      kind: "commander-return",
      playerId: p,
      sourceId: commander.id,
    },
  });
  expect(check(game)).toEqual({ kind: "suspended", performed: false });
  expect(game.match.priority).toBeUndefined();
  const pending = game.match.rules.pending!;
  expect(pending.stateBasedRule).toBe("commander-return");
  // Restore, then answer: the checkpoint resumes and grants Priority.
  const restored = JSON.parse(JSON.stringify(game.match)) as typeof game.match;
  force.rules(restored, { checkpoint: { playerId: game.player(1) } });
  expect(
    game.service.execute(
      restored,
      game.room.participants[0],
      { type: "rules-input", procedureId: pending.id, confirm: true },
      game.catalog,
    ).kind,
  ).toBe("accepted");
  expect(restored.rules.commanderReturns).toBeUndefined();
  expect(restored.objects[commander.id]).toBeUndefined();
  expect(
    restored.zones.find((z) => z.kind === "command")!.objectIds,
  ).toHaveLength(game.ids("command").length + 1);
  expect(restored.priority).toEqual({
    playerId: game.player(1),
    passedPlayerIds: [],
  });
});

test("a commander that already left its Graveyard offers no choice", async () => {
  const game = await effectGame();
  force.rules(game.match, { commanderReturns: ["gone"] });
  expect(evaluate(game, "commander-return")).toEqual({ kind: "none" });
  check(game);
  expect(game.match.rules.commanderReturns).toBeUndefined();
});
