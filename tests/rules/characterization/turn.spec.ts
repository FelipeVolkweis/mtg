// Characterization tests: turn structure and cleanup.
//
// Classification (rules test plan §2):
// | Test | Class | Reason
// | --- | --- | ---
// | turn transitions expire mana, untap only the active player's permanents and require private cleanup choices | Preserve |
// | cleanup removes damage and temporary bonuses together, gives Priority for deaths and repeats cleanup | Preserve |

import { expect, test } from "@playwright/test";
import { matchView } from "../../../src/server/match/match-view";
import "../../support/round-trip";
import { rulesGame } from "../../support/rules-game";
import { force } from "../../support/force";
import { author } from "../../support/authored";

test("turn transitions expire mana, untap only the active player's permanents and require private cleanup choices", async () => {
  const { match, command, seed, room } = await rulesGame();
  const land = seed("Sol Ring", "battlefield");
  land.status.tapped = true;
  force.mana(match, match.players[0].id, { C: 5 });
  // Eight starting cards require exactly one selected discard in cleanup.
  seed("Mind Stone", "hand");
  while (!match.rules!.pending && match.turn.number === 1) {
    const seat = match.players.findIndex(
      (player) => player.id === match.priority!.playerId,
    );
    expect(command(seat, { type: "pass-priority" }).kind).not.toBe("rejected");
  }
  expect(match.turn.stepIndex).toBe(11);
  expect(match.priority).toBeUndefined();
  expect(match.rules!.mana[match.players[0].id].C).toBe(0);
  const hand = matchView(match, room.participants[0].id).zones.find(
    (zone) => zone.kind === "hand" && zone.ownerId === match.players[0].id,
  )!;
  expect(
    command(0, {
      type: "rules-input",
      procedureId: match.rules!.pending!.id,
      selections: { discard: [hand.objectIds![0]] },
      confirm: true,
    }).kind,
  ).toBe("accepted");
  expect(match.turn.number).toBe(2);
  expect(match.turn.stepIndex).toBe(1);
  expect(match.objects[land.id].status.tapped).toBe(true);
  command(1, { type: "pass-priority" });
  command(0, { type: "pass-priority" });
  expect(
    matchView(match, room.participants[1].id).zones.find(
      (zone) => zone.kind === "hand" && zone.ownerId === match.players[1].id,
    )!.count,
  ).toBe(8);
});

test("cleanup removes damage and temporary bonuses together, gives Priority for deaths and repeats cleanup", async () => {
  const game = await rulesGame();
  const creature = game.seed("Silver Myr", "battlefield");
  creature.characteristics.toughness = "0";
  const card =
    game.catalog.definitions[
      game.match.instances[creature.cardInstanceIds[0]].definitionId
    ];
  await author(card, [
    ...card.authoredAbilities,
    {
      id: "death-draw",
      kind: "triggered",
      trigger: {
        event: "zone-change",
        object: "source",
        from: "battlefield",
        to: "graveyard",
      },
      effects: [{ kind: "draw", count: 1 }],
    },
  ]);
  force.rules(game.match, {
    temporaryEffects: [
      {
        sourceId: creature.id,
        abilityId: "bonus",
        playerId: game.match.players[0].id,
        objects: { all: { zone: "battlefield", is: "source" } },
        changes: [{ kind: "add-stats", power: 0, toughness: 2 }],
        applicability: "until-end-of-turn",
      },
    ],
  });
  force.rules(game.match, { markedDamage: { [creature.id]: 1 } });
  force.step(game.match, "end");
  const view = () =>
    matchView(game.match, game.room.participants[0].id, game.catalog);
  const pass = () => {
    game.command(0, { type: "pass-priority" });
    game.command(1, { type: "pass-priority" });
  };
  pass();
  expect(view().turn.stepIndex).toBe(11);
  expect(view().turn.number).toBe(1);
  expect(view().zones.find((z) => z.kind === "stack")!.count).toBe(1);
  pass(); // Resolve the death draw during cleanup.
  pass(); // A further cleanup requires discarding the newly drawn eighth card.
  expect(view().rules!.pending!.kind).toBe("cleanup");
  const pending = view().rules!.pending!;
  game.command(0, {
    type: "rules-input",
    procedureId: pending.id,
    selections: { discard: [pending.selectionOptions.discard.objectIds[0]] },
  });
  expect(view().turn.number).toBe(2);
  expect(view().rules!.markedDamage).toEqual({});
});
