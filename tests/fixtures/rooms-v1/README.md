# Version 1 Room fixtures

Room documents in the version 1 snapshot shape: the runtime model before
ADR-0018 and the card model refactor (roadmap issue 3). `tests/rules/room-upgrade.spec.ts`
upgrades them with `upgradeRoom` and continues play from each.

| Fixture          | State                                                        |
| ---------------- | ------------------------------------------------------------ |
| `mid-casting`    | Hedron Archive waits for its mana payment                    |
| `mid-resolution` | Thirst for Knowledge waits for its discard choice            |
| `tokens`         | Myr Battlesphere's entry trigger has created four Myr tokens |
| `stack-ability`  | Mind Stone's draw ability waits on the Stack                 |

Each `<name>.catalog.json` holds the fixture-only cards (the generated
commander and Islands) that are not in the released catalog.

They were produced by real commands against commit `5f6423f` (branch
`refactor/2-scenario-builder`), with each Library trimmed to five cards to keep
the files small, by running this spec in a checkout of that commit:

```sh
CAPTURE_DIR=$PWD/tests/fixtures/rooms-v1 \
  npx playwright test --config playwright.rules.config.ts tests/rules/capture-v1.spec.ts
```

```ts
import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { force } from "../support/force";
import { triggerGame } from "../support/rules-game";

// Captures version 1 room documents from the pre-ADR-0018 runtime model.
const out = process.env.CAPTURE_DIR!;

function save(name: string, game: Awaited<ReturnType<typeof triggerGame>>) {
  mkdirSync(out, { recursive: true });
  for (const player of game.match.players)
    force.clearZone(game.match, "library", player.id, 5);
  const room = {
    id: game.room.id,
    invite: `fixture-${name}`,
    revision: game.room.revision,
    lastActivity: 0,
    participants: game.room.participants,
    match: game.match,
  };
  writeFileSync(`${out}/${name}.json`, JSON.stringify(room, null, 2) + "\n");
  // Fixture-only cards (generated commander and Islands) are not in the
  // released catalog; keep their records beside the room.
  const used = new Set(
    Object.values(game.match.instances).map((i) => i.definitionId),
  );
  const extra = Object.values(game.catalog.definitions).filter(
    (d) =>
      (used.has(d.id) && d.canonicalName.startsWith("Supported")) ||
      (used.has(d.id) &&
        d.canonicalName === "Island" &&
        d.components[0].manaCost === "{U}"),
  );
  writeFileSync(
    `${out}/${name}.catalog.json`,
    JSON.stringify(
      {
        definitions: Object.fromEntries(extra.map((d) => [d.id, d])),
        printings: Object.fromEntries(
          extra.map((d) => [
            d.defaultPrintingId,
            game.catalog.printings[d.defaultPrintingId],
          ]),
        ),
      },
      null,
      2,
    ) + "\n",
  );
}

test("mid-casting: a spell waits for its mana payment", async () => {
  const game = await triggerGame();
  game.seed("Sol Ring", "battlefield");
  const spell = game.seed("Hedron Archive", "hand");
  force.mana(game.match, game.match.players[0].id, { U: 2 });
  expect(game.command(0, { type: "cast-spell", objectId: spell.id }).kind).toBe(
    "pending",
  );
  save("mid-casting", game);
});

test("mid-resolution: Thirst for Knowledge waits for its discard choice", async () => {
  const game = await triggerGame();
  const spell = game.seed("Thirst for Knowledge", "hand");
  force.mana(game.match, game.match.players[0].id, { U: 3 });
  expect(game.command(0, { type: "cast-spell", objectId: spell.id }).kind).toBe(
    "accepted",
  );
  game.pass();
  expect(game.match.rules!.pending?.kind).toBe("resolve");
  save("mid-resolution", game);
});

test("tokens: Myr Battlesphere's entry trigger created four Myr", async () => {
  const game = await triggerGame();
  const sphere = game.seed("Myr Battlesphere", "hand");
  force.mana(game.match, game.match.players[0].id, { C: 7 });
  expect(
    game.command(0, { type: "cast-spell", objectId: sphere.id }).kind,
  ).toBe("accepted");
  game.pass();
  game.pass();
  const tokens = Object.values(game.match.objects).filter(
    (o) => o.kind === "token",
  );
  expect(tokens).toHaveLength(4);
  save("tokens", game);
});

test("stack ability: Mind Stone's draw ability waits on the Stack", async () => {
  const game = await triggerGame();
  const stone = game.seed("Mind Stone", "battlefield");
  force.mana(game.match, game.match.players[0].id, { C: 1 });
  expect(
    game.command(0, {
      type: "activate-ability",
      objectId: stone.id,
      abilityId: "draw",
    }).kind,
  ).toBe("accepted");
  const stack = game.match.zones.find((z) => z.kind === "stack")!;
  expect(game.match.objects[stack.objectIds[0]].kind).toBe("ability");
  save("stack-ability", game);
});
```

Delete these fixtures, their tests and the version 1 branch of `upgradeRoom` once every version 1 Room has expired (`ROOM_EXPIRY_DAYS` after the deploy that introduced version 2).
