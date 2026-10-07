// Cost Runtime tests (rules test plan §20): determination, locking,
// planning, atomicity and mana spending, against the runtime directly.

import { expect, test } from "@playwright/test";
import { RulesEngine } from "../../../src/server/match/rules-engine";
import { moveObject } from "../../../src/server/match/game-objects";
import {
  determineCost,
  manaEligibility,
  pay,
  payMana,
  planMana,
  planPayment,
  type CostPayment,
} from "../../../src/server/rules/costs/cost-runtime";
import type { GameObject } from "../../../src/shared/model";
import type { Ability, Cost } from "../../../src/shared/rules-v2";
import "../../support/round-trip";
import { rulesGame } from "../../support/rules-game";
import { force } from "../../support/force";

const none = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };

async function costGame() {
  const game = await rulesGame();
  const engine = new RulesEngine(game.match, game.catalog);
  const playerId = game.match.players[0].id;
  const ability = (object: GameObject, id: string) =>
    engine.definition(object)!.abilities.find((a) => a.id === id)!;
  const activation = (
    source: GameObject,
    costs: Cost[] | Ability,
    selections: Record<string, string[]> = {},
    totalCost = { ...none, generic: 0 },
  ): CostPayment => ({
    use: "activate",
    playerId,
    source,
    ability: Array.isArray(costs)
      ? { id: "test", kind: "activated", costs, effects: [] }
      : costs,
    totalCost,
    selections,
  });
  return { ...game, engine, playerId, ability, activation };
}

const spell = (source: GameObject, playerId: string) =>
  ({
    use: "cast",
    playerId,
    source,
    ability: { id: "cast", kind: "spell" },
  }) as const;

test.describe("determination", () => {
  test("the printed mana cost is the total without adjustments", async () => {
    const g = await costGame();
    const archive = g.seed("Hedron Archive", "hand");
    expect(determineCost(g.engine, spell(archive, g.playerId))).toEqual({
      ...none,
      generic: 4,
    });
  });

  test("X adds its chosen value for each {X}", async () => {
    const g = await costGame();
    const pull = g.seed("Pull from Tomorrow", "hand");
    expect(
      determineCost(g.engine, {
        ...spell(pull, g.playerId),
        variables: { X: 3 },
      }),
    ).toMatchObject({ generic: 3, U: 2 });
  });

  test("reductions from several sources stack", async () => {
    const g = await costGame();
    g.seed("Etherium Sculptor", "battlefield");
    g.seed("Foundry Inspector", "battlefield");
    const archive = g.seed("Hedron Archive", "hand");
    // The reducers apply to artifact spells: a spell being cast is on the Stack.
    expect(determineCost(g.engine, spell(archive, g.playerId)).generic).toBe(4);
    force.move(g.match, archive, "stack");
    expect(determineCost(g.engine, spell(archive, g.playerId)).generic).toBe(2);
  });

  test("affinity counts only the caster's artifacts and generic mana stops at zero", async () => {
    const g = await costGame();
    const thoughtcast = g.seed("Thoughtcast", "hand");
    for (let i = 0; i < 3; i++) g.seed("Sol Ring", "battlefield", 1);
    expect(
      determineCost(g.engine, spell(thoughtcast, g.playerId)),
    ).toMatchObject({ generic: 4, U: 1 });
    for (let i = 0; i < 6; i++) g.seed("Sol Ring", "battlefield");
    expect(
      determineCost(g.engine, spell(thoughtcast, g.playerId)),
    ).toMatchObject({ generic: 0, U: 1 });
  });

  test("commander tax adds {2} per earlier cast from the Command Zone only", async () => {
    const g = await costGame();
    const graaz = g.seed("Graaz, Unstoppable Juggernaut", "hand");
    force.commander(g.match, graaz.cardInstanceIds[0]);
    force.rules(g.match, {
      commanderCasts: { [graaz.cardInstanceIds[0]]: 2 },
    });
    const printed = determineCost(g.engine, spell(graaz, g.playerId)).generic;
    expect(
      determineCost(g.engine, {
        ...spell(graaz, g.playerId),
        sourceZone: "command",
      }).generic,
    ).toBe(printed + 4);
    expect(
      determineCost(g.engine, {
        ...spell(graaz, g.playerId),
        sourceZone: "hand",
      }).generic,
    ).toBe(printed);
  });

  test("an activation reduction applies to its own source's ability", async () => {
    const g = await costGame();
    const logbook = g.seed("Tamiyo's Logbook", "battlefield");
    g.seed("Sol Ring", "battlefield");
    g.seed("Mind Stone", "battlefield");
    expect(
      determineCost(g.engine, {
        use: "activate",
        playerId: g.playerId,
        source: logbook,
        ability: g.ability(logbook, "draw"),
      }),
    ).toMatchObject({ generic: 3, U: 1 });
  });
});

test("a locked total ignores changes during the mana ability window", async () => {
  const g = await costGame();
  const thoughtcast = g.seed("Thoughtcast", "hand");
  g.seed("Sol Ring", "battlefield");
  const stone = g.seed("Mind Stone", "battlefield");
  expect(
    g.command(0, { type: "cast-spell", objectId: thoughtcast.id }).kind,
  ).toBe("pending");
  const locked = structuredClone(g.match.rules.pending!.totalCost);
  expect(locked).toMatchObject({ generic: 2, U: 1 });
  // Sacrificing an artifact for mana would raise a freshly determined cost.
  g.command(0, {
    type: "activate-ability",
    objectId: stone.id,
    abilityId: "mana",
  });
  moveObject(
    g.match,
    stone.id,
    g.match.zones.find(
      (z) => z.kind === "graveyard" && z.ownerId === g.playerId,
    )!,
  );
  expect(g.match.rules.pending!.totalCost).toEqual(locked);
});

test.describe("planning", () => {
  test("selected sacrifices wait for a complete, distinct, legal choice", async () => {
    const g = await costGame();
    const sai = g.seed("Sai, Master Thopterist", "battlefield");
    const [a, b] = [
      g.seed("Sol Ring", "battlefield"),
      g.seed("Sol Ring", "battlefield"),
    ];
    const theirs = g.seed("Sol Ring", "battlefield", 1);
    const draw = g.ability(sai, "draw");
    force.mana(g.match, g.playerId, { U: 2 });
    const totalCost = { ...none, generic: 1, U: 1 };
    expect(
      planPayment(g.engine, g.activation(sai, draw, {}, totalCost)),
    ).toBeUndefined();
    expect(
      planPayment(
        g.engine,
        g.activation(sai, draw, { "1": [a.id] }, totalCost),
      ),
    ).toBeUndefined();
    expect(() =>
      planPayment(
        g.engine,
        g.activation(sai, draw, { "1": [a.id, a.id] }, totalCost),
      ),
    ).toThrow("distinct");
    expect(() =>
      planPayment(
        g.engine,
        g.activation(sai, draw, { "1": [a.id, theirs.id] }, totalCost),
      ),
    ).toThrow("legal");
    const planned = planPayment(
      g.engine,
      g.activation(sai, draw, { "1": [a.id, b.id] }, totalCost),
    )!;
    expect(planned.plan.components.flat()).toEqual([
      { kind: "move", objectId: a.id, to: "graveyard" },
      { kind: "move", objectId: b.id, to: "graveyard" },
    ]);
    expect(planned.spent.sort()).toEqual(["U", "U"]);
  });

  test("a permanent can be tapped and then sacrificed, but not used after it moved", async () => {
    const g = await costGame();
    const archive = g.seed("Hedron Archive", "battlefield");
    force.mana(g.match, g.playerId, { C: 2 });
    expect(
      planPayment(
        g.engine,
        g.activation(
          archive,
          g.ability(archive, "draw"),
          {},
          {
            ...none,
            generic: 2,
          },
        ),
      )?.plan.components.flat(),
    ).toEqual([
      { kind: "tap", objectId: archive.id },
      { kind: "move", objectId: archive.id, to: "graveyard" },
    ]);
    expect(() =>
      planPayment(
        g.engine,
        g.activation(archive, [
          { kind: "sacrifice-source" },
          { kind: "tap-source" },
        ]),
      ),
    ).toThrow("same object twice");
    expect(() =>
      planPayment(
        g.engine,
        g.activation(archive, [
          { kind: "sacrifice-source" },
          { kind: "sacrifice-source" },
        ]),
      ),
    ).toThrow("same object twice");
  });

  test("removing counters requires enough counters on the source", async () => {
    const g = await costGame();
    const tome = g.seed("Mazemind Tome", "battlefield");
    const remove: Cost = {
      kind: "counter-source",
      counter: "page",
      count: 2,
      operation: "remove",
    };
    force.counters(tome, [{ kind: "page", quantity: "1" }]);
    expect(() => planPayment(g.engine, g.activation(tome, [remove]))).toThrow(
      "Remove 2 page counters",
    );
    force.counters(tome, [{ kind: "page", quantity: "3" }]);
    expect(pay(g.engine, g.activation(tome, [remove]))).toEqual([]);
    expect(g.match.objects[tome.id].counters).toEqual([
      { kind: "page", quantity: "1" },
    ]);
  });
});

test.describe("atomicity", () => {
  test("not enough mana commits none of the other components", async () => {
    const g = await costGame();
    const sai = g.seed("Sai, Master Thopterist", "battlefield");
    const [a, b] = [
      g.seed("Sol Ring", "battlefield"),
      g.seed("Sol Ring", "battlefield"),
    ];
    force.mana(g.match, g.playerId, { U: 1 });
    const before = structuredClone(g.match);
    expect(
      pay(
        g.engine,
        g.activation(
          sai,
          g.ability(sai, "draw"),
          { "1": [a.id, b.id] },
          {
            ...none,
            generic: 1,
            U: 1,
          },
        ),
      ),
    ).toBeUndefined();
    expect(g.match).toEqual(before);
  });

  test("an unpayable life cost leaves an earlier tap cost unpaid", async () => {
    const g = await costGame();
    const stone = g.seed("Mind Stone", "battlefield");
    const before = structuredClone(g.match);
    expect(() =>
      pay(
        g.engine,
        g.activation(stone, [
          { kind: "tap-source" },
          { kind: "life", amount: 1000 },
        ]),
      ),
    ).toThrow("life");
    expect(g.match).toEqual(before);
  });

  test("a complete payment commits mana, life and every component", async () => {
    const g = await costGame();
    const stone = g.seed("Mind Stone", "battlefield");
    force.mana(g.match, g.playerId, { C: 1 });
    const life = BigInt(g.match.players[0].life);
    expect(
      pay(
        g.engine,
        g.activation(
          stone,
          [{ kind: "tap-source" }, { kind: "life", amount: 2 }],
          {},
          { ...none, generic: 1 },
        ),
      ),
    ).toEqual(["C"]);
    expect(g.match.objects[stone.id].status.tapped).toBe(true);
    expect(BigInt(g.match.players[0].life)).toBe(life - 2n);
    expect(g.match.rules.mana[g.playerId].C).toBe(0);
  });
});

test.describe("mana spending", () => {
  test("colored requirements are reserved before generic, with deterministic ties", async () => {
    const g = await costGame();
    force.mana(g.match, g.playerId, { W: 1, U: 2, C: 1 });
    expect(
      planMana(g.match.rules, g.playerId, { ...none, U: 1, generic: 2 }),
    ).toEqual(["U", "W", "U"]);
    expect(
      planMana(g.match.rules, g.playerId, { ...none, U: 3, generic: 0 }),
    ).toBeUndefined();
  });

  test("restricted mana pays only an eligible spell and is spent first", async () => {
    const g = await costGame();
    const creature = g.seed("Silver Myr", "hand");
    const sorcery = g.seed("Pull from Tomorrow", "hand");
    force.mana(g.match, g.playerId, { C: 2 });
    force.rules(g.match, {
      restrictedMana: {
        [g.playerId]: [
          {
            type: "C",
            amount: 1,
            restriction: { use: "cast", spellTypes: ["Artifact"] },
          },
        ],
      },
    });
    const cost = { ...none, generic: 2 };
    expect(
      planMana(
        g.match.rules,
        g.playerId,
        cost,
        manaEligibility("cast", sorcery),
      ),
    ).toBeUndefined();
    expect(
      payMana(
        g.match.rules,
        g.playerId,
        { ...none, generic: 1 },
        manaEligibility("cast", creature),
      ),
    ).toEqual(["C"]);
    // The eligible restricted mana went first; the unrestricted mana is left.
    expect(g.match.rules.restrictedMana![g.playerId]).toEqual([]);
    expect(g.match.rules.mana[g.playerId].C).toBe(1);
  });
});
