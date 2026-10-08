import { expect, test } from "@playwright/test";
import "../../support/round-trip";
import { RulesEngine } from "../../../src/server/match/rules-engine";
import { PutTriggeredAbilityOnStackProcedure } from "../../../src/server/rules/triggers/put-triggered-ability";
import {
  placementPart,
  TriggerPlacement,
  type PlacementPart,
} from "../../../src/server/rules/triggers/trigger-placement";
import type { WaitingTrigger } from "../../../src/shared/rules-state";
import type {
  Ability,
  ManaTrigger,
  Trigger,
} from "../../../src/shared/card-dsl";
import { effectGame } from "../../support/effects";
import { force } from "../../support/force";

// Trigger placement tests (rules-test-plan.md §24): batches, CR 603.3b
// two-part placement, APNAP order, per-player ordering, and putting a
// triggered ability on the Stack.

type Game = Awaited<ReturnType<typeof effectGame>>;

function ability(id: string, targeted = false): Ability {
  return {
    id,
    kind: "triggered",
    trigger: { event: "step", step: "upkeep" },
    ...(targeted
      ? {
          targets: [
            {
              id: "target-0",
              filter: { zone: "battlefield" as const, type: ["Creature"] },
            },
          ],
        }
      : {}),
    effects: [{ kind: "gain-life", amount: 1 }],
  };
}

function waiting(
  game: Game,
  seat: number,
  abilityId: string,
  targeted = false,
): WaitingTrigger {
  return {
    id: crypto.randomUUID(),
    playerId: game.player(seat),
    source: { kind: "object", id: `source-${abilityId}` },
    abilityId,
    sourceName: "Test",
    ability: ability(abilityId, targeted),
    event: {
      kind: "upkeep",
      sourceId: "s",
      affectedId: "s",
      controllerId: game.player(seat),
      ownerId: game.player(seat),
      after: { name: "Test", colors: [], typeLine: "", rulesText: "" },
    },
  };
}

function setup(game: Game, triggers: WaitingTrigger[]) {
  force.rules(game.match, { waitingTriggers: triggers });
  return new RulesEngine(game.match, game.catalog);
}

const stack = (game: Game) =>
  game.ids("stack").map((id) => game.match.objects[id].sourceAbilityId);

test("every current trigger is placed in part 1", () => {
  for (const trigger of [
    { event: "step", step: "upkeep" },
    { event: "zone-change", object: "source", to: "battlefield" },
    { event: "deals-damage", source: "source" },
    { event: "state", condition: { compare: [1, ">=", 1] } },
    { event: "tapped-for-mana", object: {} },
  ] as (Trigger | ManaTrigger)[])
    expect(placementPart(trigger)).toBe(1);
});

test("APNAP: the active player's triggers go on the Stack first", async () => {
  for (const active of [0, 1]) {
    const game = await effectGame();
    force.activePlayer(game.match, game.player(active));
    const engine = setup(game, [waiting(game, 1, "b"), waiting(game, 0, "a")]);
    expect(new TriggerPlacement(engine).place()).toBe("placed");
    expect(stack(game)).toEqual(active === 0 ? ["a", "b"] : ["b", "a"]);
    expect(game.match.rules).not.toHaveProperty("triggerPlacement");
  }
});

test("no waiting trigger means nothing to place", async () => {
  const game = await effectGame();
  expect(new TriggerPlacement(setup(game, [])).place()).toBe("idle");
});

test("a player with simultaneous triggers orders them, bottom of the Stack first", async () => {
  const game = await effectGame();
  const engine = setup(game, [
    waiting(game, 0, "a"),
    waiting(game, 0, "b"),
    waiting(game, 1, "c"),
  ]);
  const placement = new TriggerPlacement(engine);
  expect(placement.place()).toBe("suspended");
  const pending = game.match.rules.pending!;
  expect(pending).toMatchObject({
    kind: "trigger-order",
    playerId: game.player(0),
  });
  expect(game.match.priority).toBeUndefined();
  const [a, b] = pending.options!.order.objectIds;
  expect(() =>
    placement.answer({
      type: "rules-input",
      procedureId: pending.id,
      selections: { order: [a, a] },
    }),
  ).toThrow("Order each waiting trigger exactly once.");
  placement.answer({
    type: "rules-input",
    procedureId: pending.id,
    selections: { order: [b, a] },
  });
  expect(placement.place()).toBe("placed");
  expect(stack(game)).toEqual(["b", "a", "c"]);
  expect(game.match.rules).not.toHaveProperty("orderedTriggerPlayerIds");
});

test("two-part placement: part 1 in APNAP order, then part 2, each ordered separately", async () => {
  const game = await effectGame();
  const engine = setup(game, [
    waiting(game, 0, "p2-x"),
    waiting(game, 1, "p1-b"),
    waiting(game, 0, "p1-a"),
    waiting(game, 0, "p2-y"),
  ]);
  // No Core trigger is "another ability triggering" yet; the partition is
  // supplied to exercise part 2.
  const part = (t: WaitingTrigger): PlacementPart =>
    t.abilityId.startsWith("p2") ? 2 : 1;
  const placement = new TriggerPlacement(engine, part);
  expect(placement.place()).toBe("suspended");
  // Player 0 has one part-1 trigger, then two part-2 triggers to order.
  const pending = game.match.rules.pending!;
  expect(pending.options!.order.objectIds).toHaveLength(2);
  expect(stack(game)).toEqual(["p1-a", "p1-b"]);
  const [x, y] = pending.options!.order.objectIds;
  placement.answer({
    type: "rules-input",
    procedureId: pending.id,
    selections: { order: [y, x] },
  });
  expect(placement.place()).toBe("placed");
  expect(stack(game)).toEqual(["p1-a", "p1-b", "p2-y", "p2-x"]);
});

test("an order applies to its part: a later part asks the player again", async () => {
  const game = await effectGame();
  const engine = setup(game, [
    waiting(game, 0, "p1-a"),
    waiting(game, 0, "p1-b"),
    waiting(game, 0, "p2-c"),
    waiting(game, 0, "p2-d"),
  ]);
  const placement = new TriggerPlacement(engine, (t) =>
    t.abilityId.startsWith("p2") ? 2 : 1,
  );
  const answer = () => {
    const pending = game.match.rules.pending!;
    placement.answer({
      type: "rules-input",
      procedureId: pending.id,
      selections: { order: pending.options!.order.objectIds },
    });
  };
  expect(placement.place()).toBe("suspended");
  answer();
  expect(placement.place()).toBe("suspended");
  expect(game.match.rules.pending!.options!.order.objectIds).toHaveLength(2);
  answer();
  expect(placement.place()).toBe("placed");
  expect(stack(game)).toEqual(["p1-a", "p1-b", "p2-c", "p2-d"]);
});

test("triggers that happen while a batch is placed wait for the next batch", async () => {
  const game = await effectGame();
  const creature = game.seed("Silver Myr", "battlefield");
  const engine = setup(game, [
    waiting(game, 0, "first", true),
    waiting(game, 1, "second"),
  ]);
  const placement = new TriggerPlacement(engine);
  expect(placement.place()).toBe("suspended");
  expect(game.match.rules.pending!.kind).toBe("trigger-target");
  // Something triggers during the target choice: the next batch.
  game.match.rules.waitingTriggers = [waiting(game, 0, "later")];
  expect(game.match.rules.triggerPlacement!.map((t) => t.abilityId)).toEqual([
    "second",
  ]);
  new PutTriggeredAbilityOnStackProcedure(engine).answer({
    type: "rules-input",
    procedureId: game.match.rules.pending!.id,
    targetIds: [creature.id],
  });
  // Player 1's trigger finishes the current batch before player 0's new one.
  expect(placement.place()).toBe("placed");
  expect(stack(game)).toEqual(["first", "second"]);
  expect(placement.place()).toBe("placed");
  expect(stack(game)).toEqual(["first", "second", "later"]);
  expect(placement.place()).toBe("idle");
});

test("a triggered ability's targets are chosen as it goes on the Stack", async () => {
  const game = await effectGame();
  const creature = game.seed("Silver Myr", "battlefield");
  const engine = setup(game, [waiting(game, 0, "aim", true)]);
  expect(new TriggerPlacement(engine).place()).toBe("suspended");
  const pending = game.match.rules.pending!;
  expect(pending).toMatchObject({ kind: "trigger-target", stage: "targets" });
  const object = game.match.objects[pending.sourceId!];
  expect(object.zoneId).toBe(game.zone("stack").id);
  const put = new PutTriggeredAbilityOnStackProcedure(engine);
  const choose = (id: string) =>
    put.answer({
      type: "rules-input",
      procedureId: pending.id,
      targetIds: [id],
    });
  expect(() => choose(game.ids("hand", 0)[0])).toThrow(
    "Choose one legal trigger target.",
  );
  choose(creature.id);
  expect(object.resolution!.targetIds).toEqual([creature.id]);
  expect(game.match.rules).not.toHaveProperty("pending");
});

test("a triggered ability with no legal target is removed from the batch", async () => {
  const game = await effectGame();
  const engine = setup(game, [waiting(game, 0, "aim", true)]);
  expect(new TriggerPlacement(engine).place()).toBe("placed");
  expect(stack(game)).toEqual([]);
  expect(game.match.rules).not.toHaveProperty("pending");
});
