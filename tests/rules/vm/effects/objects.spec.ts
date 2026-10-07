import { expect, test } from "@playwright/test";
import "../../../support/round-trip";
import { effectGame } from "../../../support/effects";
import { force } from "../../../support/force";

// Object handlers: damage, tap, add-counters, attach, create-token,
// apply-continuous, apply-grant, reselect-defender (rules-test-plan.md §19).

test("damage to a target creature is marked and lethal damage destroys it", async () => {
  const game = await effectGame();
  const creature = game.seed("Silver Myr", "battlefield", 1);
  const source = game.seed("Skysovereign, Consul Flagship", "battlefield");
  game.resolve([{ kind: "damage", amount: 3, to: { target: "target-0" } }], {
    source,
    targetIds: [creature.id],
  });
  expect(game.match.objects[creature.id]).toBeUndefined();
  expect(game.match.rules!.damageEvents).toMatchObject([
    { sourceId: source.id, recipientId: creature.id, amount: 3, combat: false },
  ]);
});

test("damage to players by reference changes their life totals", async () => {
  const game = await effectGame();
  game.resolve([{ kind: "damage", amount: 2, to: "opponents" }]);
  expect(game.life(1)).toBe("38");
  expect(game.life(0)).toBe("40");
});

test("damage to the player an attacking source attacks", async () => {
  const game = await effectGame();
  const attacker = game.seed("Myr Battlesphere", "battlefield");
  force.rules(game.match, {
    combat: {
      attackers: [
        {
          objectId: attacker.id,
          defenderId: game.player(1),
          defendingPlayerId: game.player(1),
          blockerIds: [],
          blocked: false,
        },
      ],
      remainingDefenderIds: [],
    },
  });
  game.resolve([{ kind: "damage", amount: 4, to: { attackedBy: "source" } }], {
    source: attacker,
  });
  expect(game.life(1)).toBe("36");
});

test("tap a chosen set binds it for later instructions", async () => {
  const game = await effectGame();
  const source = game.seed("Myr Battlesphere", "battlefield");
  const myr = [0, 1, 2].map(() => game.seed("Silver Myr", "battlefield"));
  game.resolve(
    [
      {
        kind: "tap",
        objects: {
          choose: {
            from: {
              zone: "battlefield",
              subtype: ["Myr"],
              controller: "you",
              status: "untapped",
            },
            count: { min: 0 },
          },
        },
        bind: "tapped",
      },
      {
        kind: "apply-continuous",
        objects: "source",
        changes: [
          {
            kind: "add-stats",
            power: { count: { binding: "tapped" } },
            toughness: 0,
            layer: ["7c"],
          },
        ],
        duration: "end-of-turn",
      },
    ],
    { source },
  );
  const option = game.prompt().selectionOptions.select;
  expect(option.minCount).toBe(0);
  expect(option.objectIds).toEqual(
    expect.arrayContaining(myr.map((m) => m.id)),
  );
  expect(game.answer({ select: [myr[0].id, myr[1].id] }).kind).toBe("accepted");
  expect(myr.map((m) => game.match.objects[m.id].status.tapped)).toEqual([
    true,
    true,
    false,
  ]);
  const power = game.view().objects[source.id].characteristics!.power;
  expect(power).toBe(String(Number(source.characteristics.power) + 2));
});

test("tap the object the source is attached to", async () => {
  const game = await effectGame();
  const host = game.seed("Silver Myr", "battlefield", 1);
  const aura = game.seed("Fall from Favor", "battlefield");
  force.attach(aura, host);
  game.resolve([{ kind: "tap", objects: { attachedTo: "source" } }], {
    source: aura,
  });
  expect(game.match.objects[host.id].status.tapped).toBe(true);
});

test("add-counters puts counters on each permanent the selector names", async () => {
  const game = await effectGame();
  const creatures = [
    game.seed("Silver Myr", "battlefield"),
    game.seed("Silver Myr", "battlefield"),
  ];
  const card = game.seed("Silver Myr", "hand");
  game.resolve([
    {
      kind: "add-counters",
      objects: { all: { type: ["Creature"], controller: "you" } },
      counter: "+1/+1",
      count: 2,
    },
  ]);
  for (const creature of creatures)
    expect(game.match.objects[creature.id].counters).toEqual([
      { kind: "+1/+1", quantity: "2" },
    ]);
  expect(game.match.objects[card.id].counters).toEqual([]);
});

test("attach moves an Equipment onto a creature and ignores an illegal host", async () => {
  const game = await effectGame();
  const tool = game.seed("Adaptive Omnitool", "battlefield");
  const ring = game.seed("Sol Ring", "battlefield");
  const creature = game.seed("Silver Myr", "battlefield");
  game.resolve([{ kind: "attach", to: { target: "target-0" } }], {
    source: tool,
    targetIds: [ring.id],
  });
  expect(game.match.objects[tool.id].attachmentTo).toBeNull();
  game.resolve([{ kind: "attach", to: { target: "target-0" } }], {
    source: tool,
    targetIds: [creature.id],
  });
  expect(game.match.objects[tool.id].attachmentTo).toBe(creature.id);
});

test("create-token creates tokens its controller owns and binds them", async () => {
  const game = await effectGame();
  const source = game.seed("Nettlecyst", "battlefield");
  game.resolve(
    [
      { kind: "create-token", token: "phyrexian-germ-0-0", bind: "germ" },
      { kind: "attach", object: "source", to: { binding: "germ" } },
      { kind: "create-token", token: "thopter-1-1-flying", count: 2 },
    ],
    { source },
  );
  const tokens = game
    .ids("battlefield")
    .map((id) => game.match.objects[id])
    .filter((o) => o.kind === "token");
  expect(tokens.map((t) => t.characteristics.name)).toEqual([
    "Phyrexian Germ",
    "Thopter",
    "Thopter",
  ]);
  expect(tokens.every((t) => t.ownerId === game.player(0))).toBe(true);
  expect(game.match.objects[source.id].attachmentTo).toBe(tokens[0].id);
});

test("apply-continuous changes a permanent until end of turn", async () => {
  const game = await effectGame();
  const vehicle = game.seed("Cultivator's Caravan", "battlefield");
  game.resolve(
    [
      {
        kind: "apply-continuous",
        objects: "source",
        changes: [
          { kind: "add-types", types: ["Artifact", "Creature"], layer: ["4"] },
        ],
        duration: "end-of-turn",
      },
    ],
    { source: vehicle },
  );
  expect(game.view().objects[vehicle.id].characteristics!.types).toContain(
    "Creature",
  );
  expect(game.match.rules!.temporaryEffects).toMatchObject([
    { sourceId: vehicle.id, applicability: "until-end-of-turn" },
  ]);
});

test("apply-grant makes a target unblockable this turn", async () => {
  const game = await effectGame();
  const creature = game.seed("Silver Myr", "battlefield");
  game.resolve(
    [
      {
        kind: "apply-grant",
        grant: { kind: "block-restriction", objects: { target: "target-0" } },
        duration: "end-of-turn",
      },
    ],
    { targetIds: [creature.id] },
  );
  expect(game.view().objects[creature.id].characteristics!.keywords).toContain(
    "Unblockable",
  );
});

test("reselect-defender does nothing for a target that isn't attacking", async () => {
  const game = await effectGame();
  const creature = game.seed("Silver Myr", "battlefield");
  expect(
    game.resolve(
      [{ kind: "reselect-defender", attacker: { target: "target-0" } }],
      { targetIds: [creature.id] },
    ).kind,
  ).toBe("accepted");
  expect(game.match.rules!.pending).toBeUndefined();
});
