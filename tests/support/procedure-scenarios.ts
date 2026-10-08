import type {
  MatchAction,
  PendingProcedure,
} from "../../src/shared/rules-state";
import { triggerGame } from "./rules-game";
import { force } from "./force";

// One way to reach each pending procedure kind, and a legal answer to it
// (rules test plan §31–33).

export type Game = Awaited<ReturnType<typeof triggerGame>>;
export interface Reached {
  /** The seat answering the procedure. */
  seat: number;
  answer: (pending: PendingProcedure, game: Game) => MatchAction;
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
  game.view(seat).rules.prompt!.options;

function attack(game: Game, blockers: number) {
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

export const scenarios: Record<string, (game: Game) => Reached> = {
  cast(game) {
    const archive = game.seed("Hedron Archive", "hand");
    game.command(0, { type: "cast-spell", objectId: archive.id });
    force.mana(game.match, game.match.players[0].id, { C: 4 });
    return { seat: 0, answer: (p) => input(p, { confirm: true }) };
  },
  activate(game) {
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
  resolve(game) {
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
  "trigger-order"(game) {
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
  "trigger-target"(game) {
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
        input(p, {
          targetIds: [g.view(0).rules.prompt!.targets[0].legalIds[0]],
        }),
    };
  },
  "declare-attackers"(game) {
    const golem = game.seed("Spire Golem", "battlefield");
    game.pass();
    game.pass();
    return {
      seat: 0,
      answer: (p, g) =>
        input(p, { selections: { [golem.id]: [g.match.players[1].id] } }),
    };
  },
  "declare-blockers"(game) {
    const { golem, myrs, declare } = attack(game, 1);
    game.pass();
    return {
      seat: 1,
      old: declare.id,
      answer: (p) => input(p, { selections: { [myrs[0].id]: [golem.id] } }),
    };
  },
  "combat-damage"(game) {
    const { golem, myrs } = attack(game, 2);
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
  "attack-payment"(game) {
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
  cleanup(game) {
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
  "state-based-choice"(game) {
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
  "commander-return"(game) {
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
