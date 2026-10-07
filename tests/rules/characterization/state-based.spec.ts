// Characterization tests: state-based actions.
//
// Classification (rules test plan §2):
// | Test | Class | Reason
// | --- | --- | ---
// | Myr token descriptors and state-based checks wait until the whole resolution completes | Preserve |
// | creatures with zero toughness die at checkpoints and hidden characteristic definitions do not leak | Preserve |
// | noncombat damage retains lethal marks on indestructible creatures and cleanup removes damage with temporary effects | Preserve |

import { expect, test } from "@playwright/test";
import { matchView } from "../../../src/server/match/match-view";
import type { Selector } from "../../../src/shared/rules-v2";
import "../../support/round-trip";
import { rulesGame } from "../../support/rules-game";
import { force } from "../../support/force";
import { author } from "../../support/authored";

test("Myr token descriptors and state-based checks wait until the whole resolution completes", async () => {
  const { match, command, seed, room, catalog } = await rulesGame();
  const spell = seed("Thoughtcast", "hand");
  const definition =
    catalog.definitions[match.instances[spell.cardInstanceIds[0]].definitionId];
  const yourMyr: Selector = {
    all: { zone: "battlefield", controller: "you", subtype: ["Myr"] },
  };
  await author(definition, [
    {
      id: "tokens",
      kind: "spell",
      effects: [
        { kind: "create-token", token: "myr-1-1", count: 1 },
        { kind: "add-counters", objects: yourMyr, counter: "-1/-1", count: 1 },
        { kind: "add-counters", objects: yourMyr, counter: "+1/+1", count: 1 },
      ],
    },
  ]);
  force.mana(match, match.players[0].id, {
    W: 0,
    U: 1,
    B: 0,
    R: 0,
    G: 0,
    C: 4,
  });
  command(0, { type: "cast-spell", objectId: spell.id });
  command(0, { type: "pass-priority" });
  command(1, { type: "pass-priority" });
  const view = matchView(match, room.participants[0].id, catalog);
  const myr = Object.values(view.objects).find((o) => o.kind === "token")!;
  expect(myr.characteristics).toMatchObject({
    name: "Myr",
    power: "1",
    toughness: "1",
    keywords: [],
    colors: [],
  });
  expect(myr.cardInstanceIds).toEqual([]);
});

test("creatures with zero toughness die at checkpoints and hidden characteristic definitions do not leak", async () => {
  const { match, command, seed, room, catalog } = await rulesGame();
  const master = seed("Master of Etherium", "hand", 1);
  const creature = seed("Silver Myr", "battlefield");
  const spell = seed("Thoughtcast", "hand");
  await author(
    catalog.definitions[match.instances[spell.cardInstanceIds[0]].definitionId],
    [
      {
        id: "shrink",
        kind: "spell",
        effects: [
          { kind: "create-token", token: "myr-1-1", count: 1 },
          {
            kind: "add-counters",
            objects: { all: { zone: "battlefield", subtype: ["Myr"] } },
            counter: "-1/-1",
            count: 1,
          },
        ],
      },
    ],
  );
  force.mana(match, match.players[0].id, { U: 1 });
  force.mana(match, match.players[0].id, { C: 4 });
  command(0, { type: "cast-spell", objectId: spell.id });
  command(0, { type: "pass-priority" });
  command(1, { type: "pass-priority" });
  const view = matchView(match, room.participants[0].id, catalog);
  expect(view.objects[creature.id]).toBeUndefined();
  expect(
    Object.values(view.objects).filter((o) => o.kind === "token"),
  ).toHaveLength(0);
  expect(
    view.rules!.continuousEffects?.some(
      (effect) => effect.sourceId === master.id,
    ),
  ).toBe(false);
});

test("noncombat damage retains lethal marks on indestructible creatures and cleanup removes damage with temporary effects", async () => {
  const game = await rulesGame();
  const jug = game.seed("Darksteel Juggernaut", "battlefield", 1);
  const spell = game.seed("Counterspell", "hand");
  const card =
    game.catalog.definitions[
      game.match.instances[spell.cardInstanceIds[0]].definitionId
    ];
  await author(card, [
    {
      id: "damage",
      kind: "spell",
      targets: [
        { id: "target-0", filter: { zone: "battlefield", type: ["Creature"] } },
      ],
      effects: [{ kind: "damage", amount: 5, to: "target" }],
    },
  ]);
  force.mana(game.match, game.match.players[0].id, { U: 2 });
  const view = () =>
    matchView(game.match, game.room.participants[0].id, game.catalog);
  game.command(0, { type: "cast-spell", objectId: spell.id });
  game.command(0, {
    type: "rules-input",
    procedureId: view().rules!.pending!.id,
    targetIds: [jug.id],
  });
  game.command(0, { type: "pass-priority" });
  game.command(1, { type: "pass-priority" });
  expect(view().objects[jug.id]).toBeDefined();
  expect(view().rules!.markedDamage![jug.id]).toBe(5);
  expect(view().rules!.damageEvents!.at(-1)).toMatchObject({
    recipientId: jug.id,
    amount: 5,
    combat: false,
  });
  force.step(game.match, "end");
  game.command(0, { type: "pass-priority" });
  game.command(1, { type: "pass-priority" });
  expect(view().rules!.markedDamage).toEqual({});
  expect(view().objects[jug.id]).toBeDefined();
});
