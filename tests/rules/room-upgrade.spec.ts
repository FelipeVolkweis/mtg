import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { readCatalog } from "../../src/server/catalog/catalog-files";
import { MatchService } from "../../src/server/match/match.service";
import { matchView } from "../../src/server/match/match-view";
import {
  currentSnapshotVersion,
  upgradeRoom,
} from "../../src/server/room/room-upgrade";
import { liftResolution } from "../../src/server/room/lift-v1-effects";
import type { Catalog, MatchAction, RoomState } from "../../src/shared/model";

// Version 1 Room documents captured from the runtime model before ADR-0018
// (see tests/fixtures/rooms-v1/README.md).
const fixtures = ["mid-casting", "mid-resolution", "tokens", "stack-ability"];
const dir = "tests/fixtures/rooms-v1";

async function load(name: string) {
  const stored = JSON.parse(readFileSync(`${dir}/${name}.json`, "utf8"));
  const extra = JSON.parse(readFileSync(`${dir}/${name}.catalog.json`, "utf8"));
  const release = await readCatalog("catalog");
  const catalog: Catalog = {
    ...release,
    definitions: { ...release.definitions, ...extra.definitions },
    printings: { ...release.printings, ...extra.printings },
  };
  const original = structuredClone(stored);
  const room = upgradeRoom(stored as RoomState);
  const match = room.match!;
  const service = new MatchService();
  const command = (seat: number, action: MatchAction) =>
    service.execute(match, room.participants[seat], action, catalog);
  const view = (seat = 0) =>
    matchView(match, room.participants[seat].id, catalog);
  return { original, room, match, catalog, command, view };
}

const removedMatchFields = [
  "diceRolls",
  "openingHandActions",
  "stickerSheets",
  "copiableValues",
  "layout",
];
const removedObjectFields = [
  "designations",
  "choices",
  "stickerPlacements",
  "meldParts",
  "protectorId",
  "faceDown",
  "copiableValuesId",
];

for (const name of fixtures)
  test(`version 1 ${name} room upgrades to the current shape`, async () => {
    const { original, room, match } = await load(name);
    expect(original.snapshotVersion).toBeUndefined();
    expect(room.snapshotVersion).toBe(currentSnapshotVersion);
    for (const field of removedMatchFields)
      expect(match).not.toHaveProperty(field);
    for (const object of Object.values(match.objects)) {
      for (const field of removedObjectFields)
        expect(object).not.toHaveProperty(field);
      expect(Object.keys(object.status)).toEqual(["tapped"]);
      const before = original.match.objects[object.id];
      const expected =
        before.ownerId ??
        original.match.instances[before.cardInstanceIds[0]]?.ownerId ??
        before.controllerId;
      expect(object.ownerId).toBe(expected);
    }
    // Everything else is untouched; version 3 lifts an in-flight resolution
    // to Core AST effects and version 4 lifts stored abilities to Core
    // abilities (tested below).
    const { resolving, pending, ...rules } = match.rules!;
    const {
      resolving: stored,
      pending: storedPending,
      ...storedRules
    } = original.match.rules;
    expect(rules).toEqual(storedRules);
    expect(!!resolving).toBe(!!stored);
    const { ability: _ability, ...procedure } = pending ?? {};
    const { ability: _stored, ...storedProcedure } = storedPending ?? {};
    expect(procedure).toEqual(storedProcedure);
    if (pending?.ability) expect(pending.ability).toHaveProperty("kind");
    expect(match.zones).toEqual(original.match.zones);
    expect(match.instances).toEqual(original.match.instances);
    expect(room.participants).toEqual(original.participants);
    // Upgrading again changes nothing.
    expect(upgradeRoom(structuredClone(room))).toEqual(room);
  });

test("version 1 tokens keep their creator as owner and cards take their Card Instance owner", async () => {
  const { original, match } = await load("tokens");
  const tokens = Object.values(match.objects).filter((o) => o.kind === "token");
  expect(tokens).toHaveLength(4);
  for (const token of tokens)
    expect(token.ownerId).toBe(original.match.objects[token.id].ownerId);
  const card = Object.values(match.objects).find((o) => o.kind === "card")!;
  expect(original.match.objects[card.id].ownerId).toBeUndefined();
  expect(card.ownerId).toBe(match.instances[card.cardInstanceIds[0]].ownerId);
});

test("an upgraded mid-casting room completes its payment", async () => {
  const { match, command, view } = await load("mid-casting");
  const ring = view().actions!.find((a) => a.label === "{T}: Add {C}{C}.")!;
  expect(command(0, ring.action).kind).toBe("pending");
  expect(
    command(0, {
      type: "rules-input",
      procedureId: match.rules!.pending!.id,
      confirm: true,
    }).kind,
  ).toBe("accepted");
  const stack = match.zones.find((z) => z.kind === "stack")!;
  expect(match.objects[stack.objectIds[0]].characteristics.name).toBe(
    "Hedron Archive",
  );
});

test("an upgraded mid-resolution room accepts the pending discard", async () => {
  const { match, command, view } = await load("mid-resolution");
  const pending = view().rules!.pending!;
  const hand = () =>
    view().zones.find(
      (z) => z.kind === "hand" && z.ownerId === match.players[0].id,
    )!.count;
  const before = hand();
  expect(
    command(0, {
      type: "rules-input",
      procedureId: pending.id,
      selections: {
        cards: pending.selectionOptions.cards.objectIds.slice(0, 2),
      },
    }).kind,
  ).toBe("accepted");
  expect(hand()).toBe(before - 2);
  expect(match.rules!.pending).toBeUndefined();
});

test("an upgraded room with tokens keeps playing and new objects get an owner", async () => {
  const { match, command, view } = await load("tokens");
  const land = view().actions!.find((a) => a.label === "Play Island")!;
  expect(command(0, land.action).kind).toBe("accepted");
  const battlefield = match.zones.find((z) => z.kind === "battlefield")!;
  const island = match.objects[battlefield.objectIds.at(-1)!];
  expect(island.characteristics.name).toBe("Island");
  expect(island.ownerId).toBe(match.players[0].id);
});

test("an upgraded room resolves the ability waiting on the Stack", async () => {
  const { match, command, view } = await load("stack-ability");
  const hand = () =>
    view().zones.find(
      (z) => z.kind === "hand" && z.ownerId === match.players[0].id,
    )!.count;
  const before = hand();
  expect(command(0, { type: "pass-priority" }).kind).toBe("accepted");
  expect(command(1, { type: "pass-priority" }).kind).toBe("accepted");
  expect(match.zones.find((z) => z.kind === "stack")!.objectIds).toHaveLength(
    0,
  );
  expect(hand()).toBe(before + 1);
});

test("a room from a newer server version is refused", () => {
  expect(() =>
    upgradeRoom({ snapshotVersion: currentSnapshotVersion + 1 } as RoomState),
  ).toThrow("newer than this server supports");
});

// Snapshot version 3 lifts in-flight version 1 resolutions to Core AST
// effects. The captured fixtures cover a pending discard; these cover the
// other waiting choices the version 1 resolver stored.
test("a waiting version 1 payment becomes a may-pay holding its branches", () => {
  const progress: Record<string, unknown> = {
    sourceId: "s",
    playerId: "p",
    bindings: {},
    actionChoice: {
      kind: "pay-mana",
      symbols: ["{4}"],
      bind: "paid",
      player: "event-player",
    },
    remaining: [
      {
        kind: "if",
        condition: { binding: "paid", atLeast: 1 },
        then: [],
        otherwise: [{ kind: "counter-event" }],
      },
      { kind: "draw", count: 1 },
    ],
  };
  liftResolution(progress);
  expect(progress).toEqual({
    sourceId: "s",
    playerId: "p",
    bindings: {},
    remaining: [{ kind: "draw", count: 1 }],
    waiting: {
      effect: {
        kind: "may-pay",
        player: { event: "player" },
        costs: [{ kind: "mana", symbols: ["{4}"] }],
        else: [{ kind: "counter", objects: { event: "source" } }],
      },
      state: null,
    },
  });
});

test("waiting version 1 Library, each-player, tap and optional choices keep their progress", () => {
  const filter = { zone: "battlefield", colored: true };
  const cases: [Record<string, unknown>, unknown][] = [
    [
      { choiceEffect: { kind: "inspect", count: 2 }, inspectedIds: ["a", "b"] },
      {
        effect: expect.objectContaining({ kind: "library-sequence", count: 2 }),
        state: { inspected: ["a", "b"] },
      },
    ],
    [
      {
        choiceEffect: {
          kind: "sacrifice",
          subject: "set",
          eachPlayer: true,
          filter,
        },
        selectionPlayers: ["p2"],
        simultaneousIds: ["x"],
      },
      {
        effect: expect.objectContaining({ kind: "for-each-player" }),
        state: { players: ["p2"], chosen: ["x"] },
      },
    ],
    [
      { actionChoice: { kind: "tap-choice", filter, bind: "tapped" } },
      {
        effect: {
          kind: "tap",
          objects: {
            choose: {
              from: { zone: "battlefield", color: "any" },
              count: { min: 0 },
            },
          },
          bind: "tapped",
        },
        state: null,
      },
    ],
    [
      {
        choiceEffect: {
          kind: "exile",
          subject: "target",
          optional: true,
          link: "imprint",
        },
      },
      {
        effect: {
          kind: "may",
          effects: [
            {
              kind: "exile",
              objects: { target: "target-0" },
              linkAs: "imprint",
            },
          ],
        },
        state: null,
      },
    ],
  ];
  for (const [stored, waiting] of cases) {
    const progress: Record<string, unknown> = {
      remaining: [],
      bindings: {},
      ...stored,
    };
    liftResolution(progress);
    expect(progress.waiting).toEqual(waiting);
    for (const field of [
      "actionChoice",
      "choiceEffect",
      "selectionPlayers",
      "simultaneousIds",
    ])
      expect(progress).not.toHaveProperty(field);
  }
});

test("created tokens become the binding a lifted attach reads", () => {
  const progress: Record<string, unknown> = {
    remaining: [{ kind: "attach", to: "created" }],
    bindings: {},
    createdIds: ["germ"],
  };
  liftResolution(progress);
  expect(progress.objects).toEqual({ created: ["germ"] });
  expect(progress.remaining).toEqual([
    { kind: "attach", object: "source", to: { binding: "created" } },
  ]);
});

// Snapshot version 4 runs resolutions in the Rule VM: a version 3 queue
// becomes one frame with the waiting instruction at its program counter.
test("a version 3 resolution becomes a Rule VM execution waiting at pc 0", () => {
  const discard = { kind: "discard", count: 1 };
  const draw = { kind: "draw", count: 1 };
  const room = upgradeRoom({
    snapshotVersion: 3,
    match: {
      rules: {
        resolving: {
          sourceId: "s",
          playerId: "p",
          remaining: [draw],
          bindings: { X: 2 },
          objects: { created: ["t"] },
          players: { player: "q" },
          inspectedIds: ["a"],
          waiting: { effect: discard, state: { inspected: ["a"] } },
        },
      },
    },
  } as unknown as RoomState);
  expect(room.snapshotVersion).toBe(4);
  expect(room.match!.rules!.resolving).toEqual({
    stackObjectId: "s",
    controllerId: "p",
    frames: [{ instructions: [discard, draw], pc: 0 }],
    bindings: {
      X: { kind: "number", value: 2 },
      created: { kind: "objects", ids: ["t"] },
      player: { kind: "player", id: "q" },
    },
    waiting: { state: { inspected: ["a"] } },
    inspectedIds: ["a"],
  });
});

test("a version 3 resolution with nothing waiting runs its queue from the start", () => {
  const draw = { kind: "draw", count: 1 };
  const room = upgradeRoom({
    snapshotVersion: 3,
    match: {
      rules: {
        resolving: {
          sourceId: "s",
          playerId: "p",
          remaining: [draw],
          bindings: {},
        },
      },
    },
  } as unknown as RoomState);
  expect(room.match!.rules!.resolving).toEqual({
    stackObjectId: "s",
    controllerId: "p",
    frames: [{ instructions: [draw], pc: 0 }],
    bindings: {},
  });
});

// Snapshot version 4 also lifts the rest of a stored runtime ability, so the
// engine reads Core abilities everywhere.
test("stored version 3 abilities and continuous effects become Core", () => {
  const filter = { zone: "battlefield", types: ["Creature"] };
  const room = upgradeRoom({
    snapshotVersion: 3,
    match: {
      objects: {
        spell: {
          kind: "card",
          resolution: {
            ability: { costs: [], effects: [], target: filter },
            targetIds: ["c"],
          },
        },
        trigger: {
          kind: "ability",
          sourceAbilityId: "upkeep-thopter",
          resolution: {
            ability: {
              costs: [],
              effects: [{ kind: "draw", count: 1 }],
              trigger: { event: "upkeep", player: "you" },
              intervening: {
                value: { count: { zone: "battlefield", types: ["Artifact"] } },
                atLeast: 1,
              },
            },
            targetIds: [],
          },
        },
      },
      rules: {
        pending: {
          kind: "activate",
          abilityId: "crew",
          sourceId: "v",
          ability: {
            costs: [
              {
                kind: "crew",
                power: 3,
                filter: { zone: "battlefield", types: ["Creature"] },
              },
              { kind: "life", amount: "commander-colors" },
            ],
            effects: [],
            oncePerTurn: true,
          },
        },
        waitingTriggers: [
          {
            abilityId: "death",
            ability: {
              costs: [],
              effects: [],
              trigger: {
                event: "dies",
                filter: { zone: "battlefield", self: "only" },
              },
            },
          },
        ],
        temporaryEffects: [
          {
            sourceId: "c",
            filter: { zone: "battlefield", self: "only" },
            changes: [
              { kind: "set-stats", power: 1, toughness: 1 },
              { kind: "grant-keyword", keyword: "Flying" },
            ],
          },
        ],
      },
    },
  } as unknown as RoomState);
  const match = room.match!;
  expect(match.objects.spell.resolution!.ability).toEqual({
    id: "cast",
    kind: "spell",
    targets: [
      { id: "target-0", filter: { zone: "battlefield", type: ["Creature"] } },
    ],
    effects: [],
  });
  expect(match.objects.trigger.resolution!.ability).toEqual({
    id: "upkeep-thopter",
    kind: "triggered",
    trigger: { event: "step", step: "upkeep", player: "you" },
    interveningIf: {
      compare: [
        { count: { all: { zone: "battlefield", type: ["Artifact"] } } },
        ">=",
        1,
      ],
    },
    effects: [{ kind: "draw", count: 1 }],
  });
  expect(match.rules!.pending!.ability).toEqual({
    id: "crew",
    kind: "activated",
    costs: [
      {
        kind: "tap-total-power",
        power: 3,
        filter: {
          zone: "battlefield",
          type: ["Creature"],
          status: "untapped",
        },
      },
      { kind: "life", amount: { commanderColors: "you" } },
    ],
    limit: { perTurn: 1 },
    effects: [],
  });
  expect(match.rules!.waitingTriggers![0].ability).toMatchObject({
    id: "death",
    kind: "triggered",
    trigger: {
      event: "zone-change",
      object: { is: "source" },
      from: "battlefield",
      to: "graveyard",
    },
  });
  expect(match.rules!.temporaryEffects).toEqual([
    {
      sourceId: "c",
      objects: { all: { zone: "battlefield", is: "source" } },
      changes: [
        { kind: "set-base-stats", power: 1, toughness: 1 },
        { kind: "grant-keyword", keyword: "Flying" },
      ],
    },
  ]);
});
