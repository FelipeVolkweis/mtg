// Characterization tests: private inspections and hidden Library information.
//
// Classification (rules test plan §2):
// | Test | Class | Reason
// | --- | --- | ---
// | Omnitool privately inspects a short Library and reveals only its selected artifact | Preserve |
// | Omnitool handles {selection} without exposing the inspected Library (parameterized) | Preserve |
// | {kind}: only the responsible player sees the prompt, and its private options don't leak (parameterized) | New | issue 10: projected prompts (TP §33)

import { expect, test } from "@playwright/test";
import type { MatchState } from "../../../src/shared/rules-state";
import { matchView } from "../../../src/server/match/match-view";
import "../../support/round-trip";
import { rulesGame, triggerGame } from "../../support/rules-game";
import { force } from "../../support/force";
import { scenarios } from "../../support/procedure-scenarios";

test("Omnitool privately inspects a short Library and reveals only its selected artifact", async () => {
  const game = await rulesGame();
  const creature = game.seed("Silver Myr", "battlefield");
  const tool = game.seed("Adaptive Omnitool", "battlefield");
  force.attach(tool, creature);
  const artifact = game.seed("Mind Stone", "hand");
  const library = game.match.zones.find(
    (z) => z.kind === "library" && z.ownerId === game.match.players[0].id,
  )!;
  force.zoneContents(game.match, "library", game.match.players[0].id, [
    artifact,
    ...library.objectIds.slice(0, 2).map((id) => game.match.objects[id]),
  ]);
  const view = (seat = 0) =>
    matchView(game.match, game.room.participants[seat].id, game.catalog);
  for (let i = 0; i < 2; i++) {
    game.command(0, { type: "pass-priority" });
    game.command(1, { type: "pass-priority" });
  }
  game.command(0, {
    type: "rules-input",
    procedureId: view().rules.prompt!.procedureId,
    selections: { [creature.id]: [game.match.players[1].id] },
  });
  game.command(0, { type: "pass-priority" });
  game.command(1, { type: "pass-priority" });
  const choice = view().rules.prompt!;
  expect(choice.promptKind).toBe("resolution-choice");
  expect(view().objects[artifact.id]).toBeDefined();
  expect(view(1).objects[artifact.id]).toBeUndefined();
  const recovered = JSON.parse(JSON.stringify(game.match)) as MatchState;
  expect(
    game.service.execute(
      recovered,
      game.room.participants[0],
      {
        type: "rules-input",
        procedureId: choice.procedureId,
        selections: { select: [artifact.id] },
      },
      game.catalog,
    ).kind,
  ).toBe("accepted");
  const publicView = matchView(
    recovered,
    game.room.participants[1].id,
    game.catalog,
  );
  expect(
    Object.values(publicView.objects).some(
      (o) => o.characteristics.name === "Mind Stone",
    ),
  ).toBe(true);
  expect(publicView.zones.find((z) => z.id === library.id)!.count).toBe(2);
});

for (const selection of ["decline", "no-artifact", "empty"] as const) {
  test(`Omnitool handles ${selection} without exposing the inspected Library`, async () => {
    const game = await triggerGame();
    const myr = game.seed("Silver Myr", "battlefield");
    force.attach(game.seed("Adaptive Omnitool", "battlefield"), myr);
    const library = game.match.zones.find(
      (z) => z.kind === "library" && z.ownerId === game.match.players[0].id,
    )!;
    if (selection === "empty")
      force.clearZone(game.match, "library", game.match.players[0].id);
    const initial = [...library.objectIds];
    const count = game.handCount();
    game.pass();
    game.pass();
    game.answer({ [myr.id]: [game.match.players[1].id] });
    game.pass();
    if (selection !== "empty") {
      const pending = game.view().rules.prompt!;
      expect(pending.options.select.objectIds).toEqual([]);
      expect(initial.slice(0, 6).every((id) => !game.view(1).objects[id])).toBe(
        true,
      );
      game.answer({ select: [] });
      const recovered = JSON.parse(JSON.stringify(game.match)) as MatchState;
      expect(
        game.service.execute(
          recovered,
          game.room.participants[0],
          {
            type: "rules-input",
            procedureId: pending.procedureId,
            selections: { select: [] },
          },
          game.catalog,
        ).kind,
      ).toBe("rejected");
    }
    expect(game.handCount()).toBe(count);
    expect(game.view().zones.find((z) => z.id === library.id)!.count).toBe(
      initial.length,
    );
  });
}

// The hidden-information matrix (rules test plan §33): every procedure from
// the responsible player's view and from the other player's view.
for (const [kind, reach] of Object.entries(scenarios))
  test(`${kind}: only the responsible player sees the prompt, and its private options don't leak`, async () => {
    const game = await triggerGame();
    const { seat } = reach(game);
    const actor = game.view(seat),
      other = game.view(1 - seat);
    const prompt = actor.rules.prompt!;
    expect(prompt.procedureId).toBe(game.match.rules.pending!.id);
    // A projected prompt, not the procedure's internals.
    const serialized = JSON.stringify(prompt);
    for (const internal of ['"ability"', '"stage"', '"base"', '"proposal"'])
      expect(serialized).not.toContain(internal);
    expect(other.rules.prompt).toBeUndefined();
    expect(other.rules.waiting).toEqual({
      playerId: game.match.rules.pending!.playerId,
      promptKind: prompt.promptKind,
    });
    expect(other.actions).toEqual([]);
    // Option ids the other player can't see never reach their view.
    const hidden = [
      ...Object.values(prompt.options).flatMap((o) => o.objectIds),
      ...prompt.targets.flatMap((t) => t.legalIds),
    ].filter(
      (id) =>
        !other.objects[id] && !game.match.players.some((p) => p.id === id),
    );
    const otherJson = JSON.stringify(other);
    for (const id of hidden) expect(otherJson).not.toContain(id);
    // Nor does the proposal's rollback snapshot, in either view.
    const base = game.match.rules.pending!.proposal?.base;
    if (base)
      for (const id of Object.keys(base.objects))
        if (!game.match.objects[id]) {
          expect(otherJson).not.toContain(id);
          expect(JSON.stringify(actor)).not.toContain(id);
        }
  });
