import { expect, test } from "@playwright/test";
import { CharacteristicsCalculator } from "../../src/server/match/characteristics";
import { adjustCounters } from "../../src/server/match/counters";
import { gameObject } from "../../src/server/match/game-objects";
import { RulesEngine } from "../../src/server/match/rules-engine";
import { zoneById, zoneOf } from "../../src/server/match/zones";
import type { GameObject } from "../../src/shared/rules-state";
import { force } from "../support/force";
import { rulesGame } from "../support/rules-game";

// Effective characteristics are computed once per object for a read pass
// (action listing, legal targets, a player's view) and never outlive a change
// to the Match: a stale read is impossible after any kind of mutation.

async function cacheGame() {
  const game = await rulesGame();
  const engine = new RulesEngine(game.match, game.catalog);
  // Master of Etherium's power and toughness count the artifacts you control.
  const master = game.seed("Master of Etherium", "battlefield");
  const ring = game.seed("Sol Ring", "battlefield");
  const fresh = (object: GameObject) =>
    new CharacteristicsCalculator(game.match, game.catalog).effective(
      game.match.objects[object.id],
    );
  const power = () => Number(engine.effective(master).power);
  return { ...game, engine, master, ring, fresh, power };
}

test("a read pass computes each object's characteristics once and hands out copies", async () => {
  const { engine, master, fresh } = await cacheGame();
  engine.reading(() => {
    const first = engine.effective(master);
    first.power = "99";
    expect(engine.effective(master)).toEqual(fresh(master));
    // Only the engine changes the Match during a pass; a direct write is
    // not seen until the pass ends.
    master.counters = [{ kind: "+1/+1", quantity: "1" }];
    expect(engine.effective(master).power).toBe("2");
  });
  expect(engine.effective(master).power).toBe("3");
});

test("a proposed event during a read pass drops what was computed", async () => {
  const { engine, match, master, ring, fresh, power, seed } = await cacheGame();
  const battlefield = engine.zone("battlefield");
  engine.reading(() => {
    expect(power()).toBe(2);
    // zone-change
    engine.propose({
      kind: "zone-change",
      objectId: ring.id,
      to: engine.zone("graveyard", ring.ownerId),
    });
    expect(power()).toBe(1);
    // create
    const thopter = gameObject(
      "token",
      battlefield.id,
      master.controllerId,
      master.ownerId,
      {
        name: "Thopter",
        typeLine: "Artifact Creature — Thopter",
        types: ["Artifact", "Creature"],
        subtypes: ["Thopter"],
        colors: [],
        rulesText: "",
        power: "1",
        toughness: "1",
      },
    );
    engine.propose({ kind: "create", object: thopter, zone: battlefield });
    expect(power()).toBe(2);
    // cease
    engine.propose({ kind: "cease", objectId: thopter.id });
    expect(power()).toBe(1);
    // draw, damage and life change leave Master unchanged but still refresh.
    const opponent = match.players[1].id;
    const victim = seed("Silver Myr", "battlefield", 1);
    expect(engine.effective(victim)).toEqual(fresh(victim));
    engine.propose({ kind: "draw", playerId: master.controllerId });
    engine.propose({
      kind: "damage",
      assignments: [{ sourceId: master.id, recipientId: opponent, amount: 1 }],
      combat: false,
    });
    engine.propose({ kind: "life-change", playerId: opponent, amount: -1 });
    expect(engine.effective(master)).toEqual(fresh(master));
    expect(engine.effective(victim)).toEqual(fresh(victim));
  });
});

test("a continuous-effect change during a read pass drops what was computed", async () => {
  const { engine, master, power } = await cacheGame();
  engine.reading(() => {
    expect(power()).toBe(2);
    engine.addTemporaryEffect({
      sourceId: master.id,
      abilityId: "pump",
      playerId: master.controllerId,
      objects: "source",
      changes: [{ kind: "add-stats", power: 2, toughness: 2 }],
      applicability: "until-end-of-turn",
    });
    expect(power()).toBe(4);
    expect(engine.continuousEffects().map((e) => e.abilityId)).toContain(
      "pump",
    );
    engine.endTemporaryEffects();
    expect(power()).toBe(2);
  });
});

test("a change between read passes is seen by the next pass", async () => {
  const { engine, match, master, ring, fresh, power, seed } = await cacheGame();
  const read = () => engine.reading(() => power());
  const changes: [string, () => void, number][] = [
    ["counters", () => adjustCounters(master, "+1/+1", 2), 4],
    ["control", () => force.controller(ring, match.players[1].id), 3],
    ["tap", () => (ring.status.tapped = true), 3],
    ["attach", () => force.attach(seed("Sol Ring", "battlefield"), master), 4],
    ["rollback", () => Object.assign(match, structuredClone(match)), 4],
  ];
  expect(read()).toBe(2);
  for (const [kind, change, expected] of changes) {
    change();
    expect(read(), kind).toBe(expected);
    expect(
      engine.reading(() => engine.effective(match.objects[master.id])),
      kind,
    ).toEqual(fresh(master));
  }
});

test("zone lookups by id and by kind and owner read as a scan would", async () => {
  const { match } = await rulesGame();
  const scan = (kind: string, playerId?: string) =>
    match.zones.find(
      (z) => z.kind === kind && (!playerId || z.ownerId === playerId),
    );
  const players = [undefined, ...match.players.map((p) => p.id), "nobody"];
  for (const zone of match.zones) {
    expect(zoneById(match, zone.id)).toBe(zone);
    for (const playerId of players)
      expect(zoneOf(match, zone.kind, playerId)).toBe(
        scan(zone.kind, playerId),
      );
  }
  expect(zoneById(match, "missing")).toBeUndefined();
  // A rolled-back proposal replaces the Zones: lookups follow the new ones.
  const before = zoneOf(match, "battlefield");
  Object.assign(match, structuredClone(match));
  expect(zoneOf(match, "battlefield")).not.toBe(before);
  expect(zoneOf(match, "battlefield")).toBe(scan("battlefield"));
});
