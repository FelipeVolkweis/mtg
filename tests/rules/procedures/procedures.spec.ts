// Procedure Registry tests (rules test plan §31, §32): every procedure kind
// refuses an old or unknown identifier without changing anything, and a
// Match saved and restored at the procedure continues the same way.

import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import type { MatchAction, MatchState } from "../../../src/shared/model";
import type { PendingProcedure } from "../../../src/shared/rules";
import "../../support/round-trip";
import { triggerGame } from "../../support/rules-game";
import { force } from "../../support/force";
import { logical } from "../../support/logical";

type Game = Awaited<ReturnType<typeof triggerGame>>;
interface Reached {
  /** The seat answering the procedure. */
  seat: number;
  answer(pending: PendingProcedure, game: Game): MatchAction;
  /** A procedure answered on the way here, whose id is now stale. */
  old?: string;
}

const input = (
  pending: PendingProcedure,
  fields: Omit<
    Extract<MatchAction, { type: "rules-input" }>,
    "type" | "procedureId"
  >,
): MatchAction => ({ type: "rules-input", procedureId: pending.id, ...fields });
const options = (game: Game, seat: number) =>
  game.view(seat).rules!.pending!.selectionOptions;

async function attack(game: Game, blockers: number) {
  const golem = game.seed("Spire Golem", "battlefield");
  const myrs = Array.from({ length: blockers }, () => {
    const myr = game.seed("Silver Myr", "battlefield", 1);
    myr.characteristics.keywords = ["Flying"];
    return myr;
  });
  game.pass();
  game.pass();
  const declare = game.match.rules.pending!;
  game.command(
    0,
    input(declare, { selections: { [golem.id]: [game.match.players[1].id] } }),
  );
  return { golem, myrs, declare };
}

const scenarios: Record<string, (game: Game) => Promise<Reached>> = {
  async cast(game) {
    const archive = game.seed("Hedron Archive", "hand");
    game.command(0, { type: "cast-spell", objectId: archive.id });
    force.mana(game.match, game.match.players[0].id, { C: 4 });
    return { seat: 0, answer: (p) => input(p, { confirm: true }) };
  },
  async activate(game) {
    const bomb = game.seed("Aether Spellbomb", "battlefield");
    const myr = game.seed("Silver Myr", "battlefield", 1);
    force.mana(game.match, game.match.players[0].id, { U: 1 });
    game.command(0, {
      type: "activate-ability",
      objectId: bomb.id,
      abilityId: "bounce",
    });
    return { seat: 0, answer: (p) => input(p, { targetIds: [myr.id] }) };
  },
  async resolve(game) {
    const pull = game.seed("Pull from Tomorrow", "hand");
    force.mana(game.match, game.match.players[0].id, { U: 3 });
    game.command(0, { type: "cast-spell", objectId: pull.id });
    game.command(0, input(game.match.rules.pending!, { variables: { X: 1 } }));
    const payment = game.match.rules.pending!;
    game.command(0, input(payment, { confirm: true }));
    game.pass();
    return {
      seat: 0,
      old: payment.id,
      answer: (p, g) =>
        input(p, {
          selections: { discard: [options(g, 0).discard.objectIds[0]] },
        }),
    };
  },
  async "trigger-order"(game) {
    game.seed("Sai, Master Thopterist", "battlefield");
    game.seed("Vedalken Archmage", "battlefield");
    const ring = game.seed("Sol Ring", "hand");
    force.mana(game.match, game.match.players[0].id, { C: 1 });
    game.command(0, { type: "cast-spell", objectId: ring.id });
    return {
      seat: 0,
      answer: (p, g) =>
        input(p, { selections: { order: options(g, 0).order.objectIds } }),
    };
  },
  async "trigger-target"(game) {
    const disk = game.seed("Nevinyrral's Disk", "battlefield");
    game.seed("Ichor Wellspring", "battlefield");
    game.seed("Myr Retriever", "battlefield");
    game.seed("Island", "battlefield");
    force.mana(game.match, game.match.players[0].id, { C: 1 });
    game.command(0, {
      type: "activate-ability",
      objectId: disk.id,
      abilityId: "destroy",
    });
    game.pass();
    const order = game.match.rules.pending!;
    game.command(
      0,
      input(order, { selections: { order: options(game, 0).order.objectIds } }),
    );
    return {
      seat: 0,
      old: order.id,
      answer: (p, g) =>
        input(p, { targetIds: [g.view(0).rules!.pending!.legalTargetIds[0]] }),
    };
  },
  async "declare-attackers"(game) {
    const golem = game.seed("Spire Golem", "battlefield");
    game.pass();
    game.pass();
    return {
      seat: 0,
      answer: (p, g) =>
        input(p, { selections: { [golem.id]: [g.match.players[1].id] } }),
    };
  },
  async "declare-blockers"(game) {
    const { golem, myrs, declare } = await attack(game, 1);
    game.pass();
    return {
      seat: 1,
      old: declare.id,
      answer: (p) => input(p, { selections: { [myrs[0].id]: [golem.id] } }),
    };
  },
  async "combat-damage"(game) {
    const { golem, myrs } = await attack(game, 2);
    game.pass();
    const blocks = game.match.rules.pending!;
    game.command(
      1,
      input(blocks, {
        selections: Object.fromEntries(myrs.map((m) => [m.id, [golem.id]])),
      }),
    );
    game.pass();
    return {
      seat: 0,
      old: blocks.id,
      answer: (p) =>
        input(p, {
          damageAssignments: myrs.map((m) => ({
            sourceId: golem.id,
            recipientId: m.id,
            amount: 1,
          })),
        }),
    };
  },
  async "attack-payment"(game) {
    const jug = game.seed("Darksteel Juggernaut", "battlefield");
    game.seed("Propaganda", "battlefield", 1);
    game.pass();
    game.pass();
    const declare = game.match.rules.pending!;
    game.command(
      0,
      input(declare, { selections: { [jug.id]: [game.match.players[1].id] } }),
    );
    force.mana(game.match, game.match.players[0].id, { C: 2 });
    return {
      seat: 0,
      old: declare.id,
      answer: (p) => input(p, { confirm: true }),
    };
  },
  async cleanup(game) {
    game.seed("Mind Stone", "hand");
    while (!game.match.rules.pending && game.match.turn.number === 1)
      game.pass();
    return {
      seat: 0,
      answer: (p, g) =>
        input(p, {
          selections: { discard: [options(g, 0).discard.objectIds[0]] },
        }),
    };
  },
  async "state-based-choice"(game) {
    const p = game.match.players[1].id;
    force.activePlayer(game.match, p);
    force.priority(game.match, p);
    const commander = Object.values(game.match.objects).find((o) =>
      o.cardInstanceIds.includes(game.match.rules.commanders[p].instanceId),
    )!;
    force.mana(game.match, p, { U: 1 });
    game.command(1, { type: "cast-spell", objectId: commander.id });
    game.pass();
    const disk = game.seed("Nevinyrral's Disk", "battlefield", 1);
    force.mana(game.match, p, { C: 1 });
    game.command(1, {
      type: "activate-ability",
      objectId: disk.id,
      abilityId: "destroy",
    });
    game.pass();
    return { seat: 1, answer: (p) => input(p, { confirm: true }) };
  },
  async "commander-return"(game) {
    const p = game.match.players[0].id;
    const instance = game.match.rules.commanders[p].instanceId;
    const find = () =>
      Object.values(game.match.objects).find((o) =>
        o.cardInstanceIds.includes(instance),
      )!;
    force.mana(game.match, p, { U: 1 });
    game.command(0, { type: "cast-spell", objectId: find().id });
    game.pass();
    const bomb = game.seed("Aether Spellbomb", "battlefield");
    force.mana(game.match, p, { U: 1 });
    game.command(0, {
      type: "activate-ability",
      objectId: bomb.id,
      abilityId: "bounce",
    });
    game.command(
      0,
      input(game.match.rules.pending!, { targetIds: [find().id] }),
    );
    game.pass();
    return { seat: 0, answer: (p) => input(p, { confirm: true }) };
  },
};

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
