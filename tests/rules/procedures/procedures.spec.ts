// Procedure Registry tests (rules test plan §31, §32): every procedure kind
// refuses an old or unknown identifier without changing anything, and a
// Match saved and restored at the procedure continues the same way.

import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import type {
  MatchAction,
  MatchState,
  PendingProcedure,
} from "../../../src/shared/rules-state";
import "../../support/round-trip";
import { triggerGame } from "../../support/rules-game";
import { scenarios } from "../../support/procedure-scenarios";
import { logical } from "../../support/logical";

const kindOf = (pending: PendingProcedure) =>
  pending.stateBasedRule && pending.kind !== "state-based-choice"
    ? "state-based-choice"
    : pending.kind;

for (const [kind, reach] of Object.entries(scenarios)) {
  test(`${kind}: an old or unknown procedure id is refused and changes nothing`, async () => {
    const game = await triggerGame();
    const { seat, answer, old } = await reach(game);
    const pending = game.match.rules.pending!;
    expect(kindOf(pending)).toBe(kind);
    const action = answer(pending, game) as { procedureId: string };
    const before = structuredClone(game.match);
    for (const id of [randomUUID(), ...(old ? [old] : [])]) {
      expect(old).not.toBe(pending.id);
      expect(
        game.command(seat, { ...action, procedureId: id } as MatchAction).kind,
      ).toBe("rejected");
      expect(game.match).toEqual(before);
    }
    // Nobody else may answer it either.
    expect(game.command(1 - seat, action as MatchAction).kind).toBe("rejected");
    expect(game.match).toEqual(before);
  });

  test(`${kind}: saved and restored, it continues the same way`, async () => {
    const game = await triggerGame();
    const { seat, answer } = await reach(game);
    const pending = game.match.rules.pending!;
    const action = answer(pending, game);
    const restored = JSON.parse(JSON.stringify(game.match)) as MatchState;
    const direct = game.command(seat, action);
    const recovered = game.service.execute(
      restored,
      game.room.participants[seat],
      action,
      game.catalog,
    );
    expect(direct.kind).not.toBe("rejected");
    expect(recovered.kind).toBe(direct.kind);
    expect(logical(restored)).toEqual(logical(game.match));
  });
}
