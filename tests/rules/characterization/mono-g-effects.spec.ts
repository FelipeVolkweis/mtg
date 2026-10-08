// Characterization tests: the Mono-G cards that need the effects the second
// phase of the port added (docs/plans/mono-g-port.md): doubling, temporary
// prevention, fighting, free plays and the rest.
//
// Classification (rules test plan §2):
// | Test | Class | Reason
// | --- | --- | ---
// | Unnatural Growth doubles the power and toughness of your creatures at the beginning of combat | Add |
// | Ezuri's Predation makes a Beast for each opposing creature and each fights a different one | Add |
// | Rishkar's Expertise draws for the greatest power and casts a spell of mana value 5 or less free | Add |
// | Rishkar's Expertise casts a spell with targets free once they are chosen | Add |
// | Rishkar's Expertise returns to the choice of a card when casting it is cancelled | Add |
// | Arachnogenesis makes a Spider per attacker and prevents combat damage from non-Spiders | Add |

import { expect, test } from "@playwright/test";
import "../../support/round-trip";
import { triggerGame } from "../../support/rules-game";
import { force } from "../../support/force";

type Game = Awaited<ReturnType<typeof triggerGame>>;
const stackCount = (game: Game) =>
  game.match.zones.find((z) => z.kind === "stack")!.objectIds.length;
const stats = (game: Game, id: string) => {
  const c = game.view().objects[id].characteristics;
  return [c.power, c.toughness];
};
const tokens = (game: Game, name: string) =>
  Object.values(game.match.objects).filter(
    (o) =>
      o.kind === "token" &&
      o.characteristics.name === name &&
      game.match.zones.find((z) => z.id === o.zoneId)!.kind === "battlefield",
  );

test("Unnatural Growth doubles the power and toughness of your creatures at the beginning of combat", async () => {
  const game = await triggerGame();
  game.seed("Unnatural Growth", "battlefield");
  const small = game.seed("Llanowar Elves", "battlefield");
  const big = game.seed("Gigantosaurus", "battlefield");
  const theirs = game.seed("Llanowar Elves", "battlefield", 1);
  game.pass(); // into the beginning of combat
  expect(game.match.turn.step).toBe("begin-combat");
  expect(stackCount(game)).toBe(1);
  game.pass();
  expect(stats(game, small.id)).toEqual(["2", "2"]);
  expect(stats(game, big.id)).toEqual(["20", "20"]);
  expect(stats(game, theirs.id)).toEqual(["1", "1"]);
});

test("Ezuri's Predation makes a Beast for each opposing creature and each fights a different one", async () => {
  const game = await triggerGame();
  const big = game.seed("Regal Imperiosaur", "battlefield", 1);
  const a = game.seed("Silver Myr", "battlefield", 1);
  const b = game.seed("Silver Myr", "battlefield", 1);
  const mine = game.seed("Llanowar Elves", "battlefield");
  const spell = game.seed("Ezuri's Predation", "hand");
  force.mana(game.match, game.match.players[0].id, { G: 9, C: 9 });
  game.command(0, { type: "cast-spell", objectId: spell.id });
  game.pass();
  expect(tokens(game, "Phyrexian Beast")).toHaveLength(3);
  // The first Beast fights the big creature; the second picks a Myr; the
  // last Beast is left with the remaining Myr.
  const pick = (id: string) =>
    game.command(0, {
      type: "rules-input",
      procedureId: game.view().rules.prompt!.procedureId,
      selections: { select: [id] },
    });
  expect(game.view().rules.prompt!.options.select.objectIds).toEqual([
    big.id,
    a.id,
    b.id,
  ]);
  expect(pick(big.id).kind).toBe("pending");
  expect(game.view().rules.prompt!.options.select.objectIds).toEqual([
    a.id,
    b.id,
  ]);
  expect(pick(a.id).kind).toBe("accepted");
  // Each Beast (4/4) dealt 4 damage; the 5/4 dealt 5 to its Beast.
  for (const dead of [big, a, b])
    expect(game.match.objects[dead.id]).toBeUndefined();
  expect(game.match.objects[mine.id]).toBeDefined();
  const beasts = tokens(game, "Phyrexian Beast");
  expect(beasts).toHaveLength(2);
  expect(
    beasts
      .map((beast) => game.match.rules.markedDamage?.[beast.id] ?? 0)
      .sort(),
  ).toEqual([1, 1]);
});

test("Rishkar's Expertise draws for the greatest power and casts a spell of mana value 5 or less free", async () => {
  const game = await triggerGame();
  game.seed("Regal Imperiosaur", "battlefield");
  const free = game.seed("Harmonize", "hand");
  const costly = game.seed("Ezuri's Predation", "hand");
  const land = game.seed("Forest", "hand");
  const expertise = game.seed("Rishkar's Expertise", "hand");
  const player = game.match.players[0].id;
  force.mana(game.match, player, { G: 6 });
  const before = game.handCount();
  game.command(0, { type: "cast-spell", objectId: expertise.id });
  game.pass(); // resolves: draws 5, then asks whether to cast
  expect(game.handCount()).toBe(before - 1 + 5);
  game.command(0, {
    type: "rules-input",
    procedureId: game.view().rules.prompt!.procedureId,
    confirm: true,
  });
  // Only a nonland spell with mana value 5 or less is offered.
  const options = game.view().rules.prompt!.options.select;
  expect(options.objectIds).toContain(free.id);
  expect(options.objectIds).not.toContain(costly.id);
  expect(options.objectIds).not.toContain(land.id);
  game.answer({ select: [free.id] });
  expect(game.match.rules.pending).toBeUndefined();
  expect(game.match.rules.mana[player].G).toBe(0);
  // The free spell waits on the Stack, above the finished Expertise.
  expect(stackCount(game)).toBe(1);
  const handBefore = game.handCount();
  game.pass();
  expect(game.handCount()).toBe(handBefore + 3);
});

test("Rishkar's Expertise casts a spell with targets free once they are chosen", async () => {
  const game = await triggerGame();
  const biter = game.seed("Regal Imperiosaur", "battlefield");
  const victim = game.seed("Silver Myr", "battlefield", 1);
  const spell = game.seed("Bite Down", "hand");
  const expertise = game.seed("Rishkar's Expertise", "hand");
  force.mana(game.match, game.match.players[0].id, { G: 6 });
  game.command(0, { type: "cast-spell", objectId: expertise.id });
  game.pass();
  game.command(0, {
    type: "rules-input",
    procedureId: game.view().rules.prompt!.procedureId,
    confirm: true,
  });
  game.answer({ select: [spell.id] });
  // The casting asks for its targets; the resolution waits.
  expect(game.view().rules.prompt!.promptKind).toBe("choose-targets");
  expect(
    game.command(0, {
      type: "rules-input",
      procedureId: game.view().rules.prompt!.procedureId,
      targets: { biter: [biter.id], victim: [victim.id] },
    }).kind,
  ).toBe("accepted");
  expect(game.match.rules.resolving).toBeUndefined();
  expect(game.match.rules.pending).toBeUndefined();
  expect(stackCount(game)).toBe(1);
  game.pass();
  expect(game.match.objects[victim.id]).toBeUndefined();
});

test("Rishkar's Expertise returns to the choice of a card when casting it is cancelled", async () => {
  const game = await triggerGame();
  game.seed("Regal Imperiosaur", "battlefield");
  const spell = game.seed("Bite Down", "hand");
  game.seed("Silver Myr", "battlefield", 1);
  const expertise = game.seed("Rishkar's Expertise", "hand");
  force.mana(game.match, game.match.players[0].id, { G: 6 });
  game.command(0, { type: "cast-spell", objectId: expertise.id });
  game.pass();
  game.command(0, {
    type: "rules-input",
    procedureId: game.view().rules.prompt!.procedureId,
    confirm: true,
  });
  game.answer({ select: [spell.id] });
  expect(game.view().rules.prompt!.promptKind).toBe("choose-targets");
  expect(game.view().rules.prompt!.canAbort).toBe(true);
  game.command(0, {
    type: "cancel-procedure",
    procedureId: game.view().rules.prompt!.procedureId,
  });
  // Back at the choice of a card.
  expect(game.view().rules.prompt!.options.select.objectIds).toContain(
    spell.id,
  );
  expect(game.match.objects[spell.id]).toBeDefined();
});

test("Arachnogenesis makes a Spider per attacker and prevents combat damage from non-Spiders", async () => {
  const game = await triggerGame();
  const small = game.seed("Llanowar Elves", "battlefield");
  const big = game.seed("Gigantosaurus", "battlefield");
  const spell = game.seed("Arachnogenesis", "hand", 1);
  const defender = game.match.players[1].id;
  game.pass();
  game.pass();
  game.answer({ [small.id]: [defender], [big.id]: [defender] });
  game.command(0, { type: "pass-priority" });
  // Mana empties as each step ends, so it is added once the step has begun.
  force.mana(game.match, game.match.players[1].id, { G: 3 });
  expect(game.command(1, { type: "cast-spell", objectId: spell.id }).kind).toBe(
    "accepted",
  );
  game.pass(); // Arachnogenesis resolves
  const spiders = tokens(game, "Spider");
  expect(spiders).toHaveLength(2);
  expect(spiders.every((s) => s.controllerId === defender)).toBe(true);
  game.pass(); // into declare blockers
  game.answer({ [spiders[0].id]: [big.id] }, 1);
  game.pass(); // combat damage
  expect(game.match.players[1].life).toBe("40");
  expect(game.match.rules.markedDamage?.[big.id]).toBe(1);
  expect(game.match.objects[spiders[0].id]).toBeDefined();
  expect(game.match.rules.thisTurn.damageEvents.map((e) => e.amount)).toEqual([
    1,
  ]);
});
