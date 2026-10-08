// Characterization tests: the Mono-G cards that need the choices the second
// phase of the port added (docs/plans/mono-g-port.md): several target
// clauses, a number of targets, modes with escalate and damage divided as a
// spell is cast.
//
// Classification (rules test plan §2):
// | Test | Class | Reason
// | --- | --- | ---
// | Bite Down has your creature deal damage equal to its power to another creature | Add |
// | Ram Through sends the excess damage to the creature's controller only with trample | Add |
// | Monstrous Onslaught divides the greatest power as cast among any number of targets | Add |
// | Monstrous Onslaught can't target more creatures than it has damage | Add |
// | Collective Resistance escalates for each mode beyond the first | Add |
// | Collective Resistance needs the right number of modes | Add |
// | Scrapshooter's gift is promised as it is cast and destroys an artifact or enchantment | Add |
// | Scrapshooter without a promised gift gives nothing and destroys nothing | Add |
// | Elder Gargaroth chooses a mode when it attacks | Add |
// | Elder Gargaroth chooses a mode when it blocks | Add |

import { expect, test } from "@playwright/test";
import "../../support/round-trip";
import {
  both,
  declareAttackers,
  declareBlockers,
  life,
  promptOf,
  viewOf,
} from "../../support/combat";
import { rulesGame } from "../../support/rules-game";
import { force } from "../../support/force";

type Game = Awaited<ReturnType<typeof rulesGame>>;

const cast = (game: Game, objectId: string) =>
  game.command(0, { type: "cast-spell", objectId });
const answer = (
  game: Game,
  input: {
    targets?: Record<string, string[]>;
    modes?: string[];
    damageAssignments?: {
      sourceId: string;
      recipientId: string;
      amount: number;
    }[];
  },
) =>
  game.command(0, {
    type: "rules-input",
    procedureId: promptOf(game).procedureId,
    ...input,
  });
const stackSize = (game: Game) =>
  game.match.zones.find((z) => z.kind === "stack")!.objectIds.length;
const marked = (game: Game, id: string) =>
  game.match.rules.markedDamage?.[id] ?? 0;

test("Bite Down has your creature deal damage equal to its power to another creature", async () => {
  const game = await rulesGame();
  const biter = game.seed("Regal Imperiosaur", "battlefield");
  const mine = game.seed("Llanowar Elves", "battlefield");
  const victim = game.seed("Gigantosaurus", "battlefield", 1);
  const spell = game.seed("Bite Down", "hand");
  force.mana(game.match, game.match.players[0].id, { G: 2 });
  expect(cast(game, spell.id).kind).toBe("pending");
  const prompt = promptOf(game);
  expect(prompt.promptKind).toBe("choose-targets");
  expect(prompt.targets.map((t) => t.clauseId)).toEqual(["biter", "victim"]);
  expect(prompt.targets[0].legalIds).toEqual([biter.id, mine.id]);
  expect(prompt.targets[1].legalIds).toEqual([victim.id]);
  // The second target must be a creature you don't control.
  expect(
    answer(game, { targets: { biter: [biter.id], victim: [mine.id] } }).kind,
  ).toBe("rejected");
  expect(answer(game, { targets: { biter: [biter.id] } }).kind).toBe(
    "rejected",
  );
  expect(
    answer(game, { targets: { biter: [biter.id], victim: [victim.id] } }).kind,
  ).toBe("accepted");
  both(game);
  // Regal Imperiosaur is 5/4: it deals 5, and the victim deals nothing back.
  expect(marked(game, victim.id)).toBe(5);
  expect(marked(game, biter.id)).toBe(0);
});

test("Ram Through sends the excess damage to the creature's controller only with trample", async () => {
  for (const [name, excess] of [
    ["Carnage Tyrant", 6],
    ["Gigantosaurus", 0],
  ] as [string, number][]) {
    const game = await rulesGame();
    const rammer = game.seed(name, "battlefield");
    const victim = game.seed("Silver Myr", "battlefield", 1);
    const spell = game.seed("Ram Through", "hand");
    force.mana(game.match, game.match.players[0].id, { G: 2 });
    cast(game, spell.id);
    answer(game, { targets: { rammer: [rammer.id], victim: [victim.id] } });
    both(game);
    expect(game.match.objects[victim.id]).toBeUndefined();
    // Carnage Tyrant (7 power) needs 1 for the Myr's toughness 1.
    expect(life(game, 1)).toBe(40 - excess);
  }
});

test("Monstrous Onslaught divides the greatest power as cast among any number of targets", async () => {
  const game = await rulesGame();
  game.seed("Gigantosaurus", "battlefield");
  const a = game.seed("Gigantosaurus", "battlefield", 1);
  const b = game.seed("Regal Imperiosaur", "battlefield", 1);
  const c = game.seed("Silver Myr", "battlefield", 1);
  const spell = game.seed("Monstrous Onslaught", "hand");
  force.mana(game.match, game.match.players[0].id, { G: 5, C: 5 });
  expect(cast(game, spell.id).kind).toBe("pending");
  const targets = promptOf(game).targets[0];
  expect([targets.min, targets.max]).toEqual([0, 100]);
  expect(
    answer(game, { targets: { creatures: [a.id, b.id, c.id] } }).kind,
  ).toBe("pending");
  const division = promptOf(game);
  expect(division.promptKind).toBe("divide-damage");
  // X is 10: the power of the biggest creature you controlled as you cast it.
  expect(division.damageChoices![0].amount).toBe(10);
  const assign = (amounts: number[]) =>
    answer(game, {
      damageAssignments: [a, b, c].map((creature, i) => ({
        sourceId: division.damageChoices![0].sourceId,
        recipientId: creature.id,
        amount: amounts[i],
      })),
    }).kind;
  expect(assign([5, 5, 5])).toBe("rejected");
  expect(assign([10, 0, 0])).toBe("rejected");
  expect(assign([4, 4, 2])).toBe("accepted");
  both(game);
  expect(marked(game, a.id)).toBe(4);
  expect(game.match.objects[b.id]).toBeUndefined();
  expect(game.match.objects[c.id]).toBeUndefined();
});

test("Monstrous Onslaught can't target more creatures than it has damage", async () => {
  const game = await rulesGame();
  game.seed("Llanowar Elves", "battlefield");
  const a = game.seed("Silver Myr", "battlefield", 1);
  const b = game.seed("Silver Myr", "battlefield", 1);
  const spell = game.seed("Monstrous Onslaught", "hand");
  force.mana(game.match, game.match.players[0].id, { G: 5, C: 5 });
  cast(game, spell.id);
  expect(answer(game, { targets: { creatures: [a.id, b.id] } }).kind).toBe(
    "rejected",
  );
  expect(answer(game, { targets: { creatures: [a.id] } }).kind).toBe(
    "accepted",
  );
  both(game);
  expect(game.match.objects[a.id]).toBeUndefined();
  expect(game.match.objects[b.id]).toBeDefined();
});

test("Collective Resistance escalates for each mode beyond the first", async () => {
  const game = await rulesGame();
  const ring = game.seed("Sol Ring", "battlefield", 1);
  const creature = game.seed("Llanowar Elves", "battlefield");
  const spell = game.seed("Collective Resistance", "hand");
  force.mana(game.match, game.match.players[0].id, { G: 3 });
  expect(cast(game, spell.id).kind).toBe("pending");
  const options = promptOf(game).options.modes;
  expect(promptOf(game).promptKind).toBe("choose-modes");
  expect(options.objectIds).toEqual(["artifact", "enchantment", "protect"]);
  expect([options.minCount, options.count]).toEqual([1, 3]);
  expect(answer(game, { modes: ["artifact", "protect"] }).kind).toBe("pending");
  const targets = promptOf(game).targets;
  expect(targets.map((t) => t.clauseId)).toEqual(["artifact", "creature"]);
  expect(
    answer(game, {
      targets: { artifact: [ring.id], creature: [creature.id] },
    }).kind,
  ).toBe("accepted");
  // {1}{G} plus {G} for the second mode: all three of the {G} paid.
  expect(game.match.rules.mana[game.match.players[0].id].G).toBe(0);
  both(game);
  expect(game.match.objects[ring.id]).toBeUndefined();
  expect(viewOf(game).objects[creature.id].characteristics.keywords).toEqual(
    expect.arrayContaining(["Hexproof", "Indestructible"]),
  );
});

test("Collective Resistance needs the right number of modes", async () => {
  const game = await rulesGame();
  game.seed("Llanowar Elves", "battlefield");
  const spell = game.seed("Collective Resistance", "hand");
  force.mana(game.match, game.match.players[0].id, { G: 3 });
  cast(game, spell.id);
  expect(answer(game, { modes: [] }).kind).toBe("rejected");
  expect(answer(game, { modes: ["artifact", "artifact"] }).kind).toBe(
    "rejected",
  );
  expect(answer(game, { modes: ["unknown"] }).kind).toBe("rejected");
  expect(answer(game, { modes: ["protect"] }).kind).toBe("pending");
});

test("Scrapshooter's gift is promised as it is cast and destroys an artifact or enchantment", async () => {
  const game = await rulesGame();
  const ring = game.seed("Sol Ring", "battlefield", 1);
  const mine = game.seed("Sol Ring", "battlefield");
  const spell = game.seed("Scrapshooter", "hand");
  const opponent = game.match.players[1].id;
  force.mana(game.match, game.match.players[0].id, { G: 3 });
  expect(cast(game, spell.id).kind).toBe("pending");
  const prompt = promptOf(game);
  expect(prompt.promptKind).toBe("promise-gift");
  expect(prompt.options.gift.objectIds).toEqual([opponent]);
  // The promise is optional and the recipient must be an opponent.
  expect(
    game.command(0, {
      type: "rules-input",
      procedureId: prompt.procedureId,
      confirm: true,
      selections: { gift: [game.match.players[0].id] },
    }).kind,
  ).toBe("rejected");
  expect(
    game.command(0, {
      type: "rules-input",
      procedureId: prompt.procedureId,
      confirm: true,
    }).kind,
  ).toBe("accepted");
  const before = game.match.zones.find(
    (z) => z.kind === "hand" && z.ownerId === opponent,
  )!.objectIds.length;
  both(game); // Scrapshooter enters: the gift and the destroy trigger
  // Two triggers of yours: order them, then choose the destroy target.
  if (promptOf(game).promptKind === "order-triggers")
    game.command(0, {
      type: "rules-input",
      procedureId: promptOf(game).procedureId,
      selections: { order: promptOf(game).options.order.objectIds },
    });
  expect(promptOf(game).targets[0].legalIds).toEqual([ring.id]);
  expect(mine.id).not.toBe(ring.id);
  game.command(0, {
    type: "rules-input",
    procedureId: promptOf(game).procedureId,
    targetIds: [ring.id],
  });
  both(game);
  both(game);
  expect(game.match.objects[ring.id]).toBeUndefined();
  expect(
    game.match.zones.find((z) => z.kind === "hand" && z.ownerId === opponent)!
      .objectIds.length,
  ).toBe(before + 1);
});

test("Scrapshooter without a promised gift gives nothing and destroys nothing", async () => {
  const game = await rulesGame();
  const ring = game.seed("Sol Ring", "battlefield", 1);
  const spell = game.seed("Scrapshooter", "hand");
  const opponent = game.match.players[1].id;
  force.mana(game.match, game.match.players[0].id, { G: 3 });
  cast(game, spell.id);
  game.command(0, {
    type: "rules-input",
    procedureId: promptOf(game).procedureId,
    confirm: false,
  });
  const before = game.match.zones.find(
    (z) => z.kind === "hand" && z.ownerId === opponent,
  )!.objectIds.length;
  both(game);
  expect(stackSize(game)).toBe(0);
  expect(game.match.rules.pending).toBeUndefined();
  expect(game.match.objects[ring.id]).toBeDefined();
  expect(
    game.match.zones.find((z) => z.kind === "hand" && z.ownerId === opponent)!
      .objectIds.length,
  ).toBe(before);
});

for (const side of ["attacks", "blocks"] as const)
  test(`Elder Gargaroth chooses a mode when it ${side}`, async () => {
    const game = await rulesGame();
    const gargaroth = game.seed(
      "Elder Gargaroth",
      "battlefield",
      side === "attacks" ? 0 : 1,
    );
    const other = game.seed(
      "Llanowar Elves",
      "battlefield",
      side === "attacks" ? 1 : 0,
    );
    if (side === "attacks") declareAttackers(game, [gargaroth]);
    else {
      declareAttackers(game, [other]);
      declareBlockers(game, { [gargaroth.id]: other.id });
    }
    const seat = side === "attacks" ? 0 : 1;
    // The trigger asks for its mode as it goes on the Stack.
    expect(promptOf(game, seat).promptKind).toBe("choose-modes");
    expect(promptOf(game, seat).options.modes.objectIds).toEqual([
      "beast",
      "life",
      "draw",
    ]);
    expect(
      game.command(seat, {
        type: "rules-input",
        procedureId: promptOf(game, seat).procedureId,
        modes: ["beast", "life"],
      }).kind,
    ).toBe("rejected");
    expect(
      game.command(seat, {
        type: "rules-input",
        procedureId: promptOf(game, seat).procedureId,
        modes: ["life"],
      }).kind,
    ).toBe("accepted");
    game.command(0, { type: "pass-priority" });
    game.command(1, { type: "pass-priority" });
    expect(life(game, seat)).toBe(43);
  });
