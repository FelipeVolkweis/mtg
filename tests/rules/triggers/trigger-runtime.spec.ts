import { expect, test } from "@playwright/test";
import "../../support/round-trip";
import { RulesEngine } from "../../../src/server/match/rules-engine";
import {
  EventTriggerObserver,
  eventMatches,
  StateTriggerObserver,
} from "../../../src/server/rules/triggers/trigger-runtime";
import type { SemanticEvent } from "../../../src/shared/rules-state";
import type { Trigger, TurnStep } from "../../../src/shared/card-dsl";
import { author } from "../../support/authored";
import { effectGame } from "../../support/effects";
import { force } from "../../support/force";

// Trigger Runtime tests (rules-test-plan.md §24): event triggers match a
// source's Core trigger against semantic events; state triggers watch the
// game state, independently of any event.

const you = "you-id",
  them = "them-id";

function event(
  kind: SemanticEvent["kind"],
  extra: Partial<SemanticEvent> = {},
) {
  return {
    kind,
    sourceId: "o",
    affectedId: "o",
    controllerId: you,
    ownerId: you,
    after: { name: "O", colors: [], typeLine: "", rulesText: "" },
    ...extra,
  };
}

const upkeep: TurnStep = "upkeep";
const matches = (trigger: Trigger, e: SemanticEvent, step = upkeep) =>
  eventMatches(trigger, e, you, step);

test("enters and zone-change triggers match their zone events", () => {
  const enters: Trigger = {
    event: "zone-change",
    object: "source",
    to: "battlefield",
  };
  expect(matches(enters, event("enter"))).toBe(true);
  expect(matches(enters, event("zone-change"))).toBe(false);
  expect(
    matches({ ...enters, during: "precombat-main" }, event("enter"), upkeep),
  ).toBe(false);
  expect(matches({ event: "enters", object: "source" }, event("enter"))).toBe(
    true,
  );
  const dies: Trigger = {
    event: "zone-change",
    object: "source",
    from: "battlefield",
    to: "graveyard",
  };
  const died = event("zone-change", { from: "battlefield", to: "graveyard" });
  expect(matches(dies, died)).toBe(true);
  expect(matches({ event: "dies", object: "source" }, died)).toBe(true);
  expect(
    matches(dies, event("zone-change", { from: "battlefield", to: "exile" })),
  ).toBe(false);
});

test("cast, attack, draw, upkeep and target triggers match their events and players", () => {
  expect(matches({ event: "cast", spell: {} }, event("cast"))).toBe(true);
  expect(
    matches({ event: "cast", spell: {}, caster: "opponents" }, event("cast")),
  ).toBe(false);
  expect(
    matches({ event: "attacks", attacker: "source" }, event("attack")),
  ).toBe(true);
  const draws: Trigger = { event: "draws", player: "opponents", nth: 2 };
  expect(matches(draws, event("draw", { playerId: them, ordinal: 2 }))).toBe(
    true,
  );
  expect(matches(draws, event("draw", { playerId: them, ordinal: 1 }))).toBe(
    false,
  );
  expect(matches(draws, event("draw", { playerId: you, ordinal: 2 }))).toBe(
    false,
  );
  const step: Trigger = { event: "step", step: "upkeep", player: "you" };
  expect(matches(step, event("upkeep", { playerId: you }))).toBe(true);
  expect(matches(step, event("upkeep", { playerId: them }))).toBe(false);
  expect(
    matches({ event: "step", step: "end" }, event("upkeep", { playerId: you })),
  ).toBe(false);
  const target: Trigger = {
    event: "becomes-target",
    object: "source",
    by: "opponents",
  };
  expect(matches(target, event("target", { playerId: them }))).toBe(true);
  expect(matches(target, event("target", { playerId: you }))).toBe(false);
});

test("damage triggers match combat and recipient kind", () => {
  const damage = (combat: boolean, recipientKind: "player" | "object") =>
    event("damage", {
      damage: {
        sourceId: "o",
        recipientId: "r",
        amount: 1,
        combat,
        recipientKind,
      },
    });
  const trigger: Trigger = {
    event: "deals-damage",
    source: "source",
    to: "player",
    combat: true,
  };
  expect(matches(trigger, damage(true, "player"))).toBe(true);
  expect(matches(trigger, damage(false, "player"))).toBe(false);
  expect(matches(trigger, damage(true, "object"))).toBe(false);
});

test("life and state triggers never match an event", () => {
  expect(matches({ event: "gains-life", player: "you" }, event("state"))).toBe(
    false,
  );
  expect(
    matches(
      { event: "state", condition: { compare: [1, ">=", 1] } },
      event("state"),
    ),
  ).toBe(false);
});

test("an event trigger reads the affected object as the event saw it", async () => {
  const game = await effectGame();
  const watcher = game.seed("Vedalken Archmage", "battlefield");
  await author(
    game.catalog.definitions[
      game.match.instances[watcher.cardInstanceIds[0]].definitionId
    ],
    [
      {
        id: "artifact-dies",
        kind: "triggered",
        trigger: {
          event: "zone-change",
          object: { zone: "battlefield", type: ["Artifact"] },
          from: "battlefield",
          to: "graveyard",
        },
        effects: [{ kind: "draw", count: 1 }],
      },
    ],
  );
  const myr = game.seed("Silver Myr", "battlefield");
  const engine = new RulesEngine(game.match, game.catalog);
  const died = (before: string[]) =>
    event("zone-change", {
      sourceId: myr.id,
      affectedId: myr.id,
      from: "battlefield",
      to: "graveyard",
      before: { ...myr.characteristics, types: before },
    });
  new EventTriggerObserver(engine).collect(died(["Creature"]), myr, [watcher]);
  expect(game.match.rules.waitingTriggers ?? []).toHaveLength(0);
  new EventTriggerObserver(engine).collect(
    died(["Artifact", "Creature"]),
    myr,
    [watcher],
  );
  expect(game.match.rules.waitingTriggers).toMatchObject([
    { abilityId: "artifact-dies", playerId: game.player(0) },
  ]);
});

test("a state trigger triggers when its condition becomes true, once while it waits or is on the Stack", async () => {
  const game = await effectGame();
  const tome = game.seed("Mazemind Tome", "battlefield");
  const engine = new RulesEngine(game.match, game.catalog);
  const observe = () => new StateTriggerObserver(engine).collect();
  const waiting = () => game.match.rules.waitingTriggers ?? [];
  force.counters(tome, [{ kind: "page", quantity: "3" }]);
  observe();
  expect(waiting()).toHaveLength(0);
  force.counters(tome, [{ kind: "page", quantity: "4" }]);
  observe();
  expect(waiting()).toHaveLength(1);
  expect(waiting()[0]).toMatchObject({
    sourceId: tome.id,
    event: { kind: "state" },
  });
  observe();
  expect(waiting()).toHaveLength(1);
  // On the Stack it still doesn't trigger again.
  engine.checkpoint();
  expect(waiting()).toHaveLength(0);
  expect(game.ids("stack")).toHaveLength(1);
  observe();
  expect(waiting()).toHaveLength(0);
});
