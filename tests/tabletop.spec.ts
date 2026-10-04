import { expect, test } from "@playwright/test";
import { exchange, snapshot } from "./support/peer";
import { table, saveDeck, startTable, act } from "./support/table";

test("Decklists are private, reusable and rejected as a whole for unavailable names or printings", async ({
  browser,
}) => {
  const {
    pages: [alice, bob],
    contexts,
  } = await table(browser);
  await saveDeck(alice);
  await expect(
    bob
      .getByLabel("Selected Decklist")
      .getByRole("option", { name: "My deck" }),
  ).not.toBeAttached();
  for (const invalid of [
    "1 Black Lotus",
    "1 Insectile Aberration",
    "1 Island (BAD) 1",
    "1 Island\n1 Missing Card",
  ]) {
    await alice.getByLabel("Decklist name").fill("Rejected list");
    await alice.getByLabel("Decklist text").fill(invalid);
    await alice
      .getByRole("button", { name: "Save Decklist", exact: true })
      .click();
    await expect(alice.getByRole("alert")).toBeVisible();
    await expect(
      alice
        .getByLabel("Selected Decklist")
        .getByRole("option", { name: "Rejected list" }),
    ).not.toBeAttached();
    await alice.getByRole("button", { name: "Dismiss error" }).click();
  }
  await saveDeck(alice, "Exact artwork", "1 Island (TST) 2");
  await alice.reload();
  await expect(
    alice
      .getByLabel("Selected Decklist")
      .getByRole("option", { name: "My deck" }),
  ).toBeAttached();
  await expect(
    alice
      .getByLabel("Selected Decklist")
      .getByRole("option", { name: "Exact artwork" }),
  ).toBeAttached();
  await saveDeck(bob, "Other deck", "1 Mountain");
  await bob.getByRole("button", { name: "Mark ready", exact: true }).click();
  await alice
    .getByLabel("Selected Decklist")
    .selectOption({ label: "Exact artwork" });
  await alice.getByRole("button", { name: "Mark ready", exact: true }).click();
  await bob.getByRole("button", { name: "Start Match", exact: true }).click();
  await expect(alice.getByTestId("match")).toBeVisible();
  expect(Object.values((await snapshot(alice)).match!.instances)).toMatchObject(
    [{ printingId: "10000000-0000-4000-8000-000000000002" }],
  );
  await Promise.all(contexts.map((context) => context.close()));
});

for (const playerCount of [2, 3, 4]) {
  test(`${playerCount} ready participants start with fresh Card Instances and private Libraries`, async ({
    browser,
  }) => {
    const { pages, contexts } = await table(browser, playerCount);
    for (const page of pages) {
      await saveDeck(page);
      await page
        .getByRole("button", { name: "Mark ready", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Not ready", exact: true }),
      ).toBeVisible();
    }
    for (const page of pages)
      await expect(
        page.getByRole("button", { name: "Start solo Match", exact: true }),
      ).toHaveCount(0);
    if (playerCount === 2) {
      const rejectedSoloStart = await exchange(pages[0], {
        type: "start-solo",
        startingLife: "20",
      });
      expect(rejectedSoloStart).toMatchObject({
        event: "rejected",
        data: {
          message: "Only the sole ready participant can start a solo Match.",
        },
      });
    }
    await pages[1].getByLabel("Starting life", { exact: true }).fill("40");
    await pages[1]
      .getByRole("button", { name: "Start Match", exact: true })
      .click();
    for (const page of pages) {
      await expect(page.getByTestId("match")).toBeVisible();
      await expect(
        page.getByTestId("match-players").locator("article"),
      ).toHaveCount(playerCount);
      await expect(page.getByLabel("Alice life", { exact: true })).toHaveValue(
        "40",
      );
    }
    await expect(pages[0].getByTestId("zone-library-Alice")).toContainText(
      "3 cards",
    );
    await expect(pages[1].getByTestId("zone-library-Alice")).not.toContainText(
      "Delver of Secrets",
    );
    await pages[0]
      .getByRole("button", { name: "Draw one", exact: true })
      .click();
    await expect(pages[0].getByTestId("zone-hand-Alice")).toContainText(
      "Island",
    );
    await expect(pages[1].getByTestId("zone-hand-Alice")).toContainText(
      "1 card",
    );
    await expect(pages[1].getByTestId("zone-hand-Alice")).not.toContainText(
      "Island",
    );
    await pages[0]
      .getByText("Room lobby and Decklists", { exact: true })
      .click();
    await pages[0]
      .getByRole("button", { name: "Edit selected Decklist" })
      .click();
    await expect(pages[0].getByLabel("Decklist text")).toHaveValue(
      "2 Island\n1 Delver of Secrets (TST) 3",
    );
    await Promise.all(contexts.map((context) => context.close()));
  });
}

test("one ready participant can start a solo Match that guests can only observe", async ({
  browser,
}) => {
  const {
    pages: [alice, bob],
    contexts,
  } = await table(browser);
  await saveDeck(alice);
  await alice.getByRole("button", { name: "Mark ready", exact: true }).click();
  await expect(
    alice.getByRole("button", { name: "Start solo Match", exact: true }),
  ).toBeVisible();
  await expect(
    alice.getByRole("button", { name: "Start Match", exact: true }),
  ).toBeDisabled();
  await expect(
    bob.getByRole("button", { name: "Start solo Match", exact: true }),
  ).toHaveCount(0);
  await expect(alice.locator(".start-match + .hint")).toContainText(
    "1 ready. The ready participant can start a solo Match",
  );

  const unauthorizedStart = await exchange(bob, {
    type: "start-solo",
    startingLife: "20",
  });
  expect(unauthorizedStart).toMatchObject({
    event: "rejected",
    data: {
      message: "Only the sole ready participant can start a solo Match.",
    },
  });
  expect((await snapshot(bob)).match).toBeUndefined();

  await alice
    .getByRole("button", { name: "Start solo Match", exact: true })
    .click();
  await expect(alice.getByTestId("match")).toBeVisible();
  await expect(bob.getByTestId("match")).toBeVisible();
  await expect(bob.getByRole("status")).toHaveText(
    "You are observing this solo Match. Only Alice can make changes.",
  );
  await expect(bob.getByTestId("battlefield")).toBeVisible();
  await expect(
    bob.getByRole("button", { name: "Next step", exact: true }),
  ).toBeDisabled();
  await bob
    .locator("details")
    .filter({ hasText: "Add token or ability" })
    .locator("summary")
    .click();
  await expect(
    bob.getByRole("button", { name: "Create object", exact: true }),
  ).toBeDisabled();
  await expect(
    alice.getByRole("button", { name: "Next step", exact: true }),
  ).toBeEnabled();
  let soloMatch = (await snapshot(alice)).match!;
  expect(soloMatch.players.map((player) => player.name)).toEqual(["Alice"]);
  expect(soloMatch.turn.order).toHaveLength(1);
  const acceptedTurnOrder = await exchange(alice, {
    type: "match-action",
    matchId: soloMatch.id,
    revision: soloMatch.revision,
    action: { type: "turn", order: [soloMatch.players[0].id] },
  });
  expect(acceptedTurnOrder.event).toBe("view");
  await expect(alice.getByTestId("match-revision")).toHaveText(
    `Revision ${soloMatch.revision + 1}`,
  );

  await alice.getByRole("button", { name: "Draw one", exact: true }).click();
  await expect(alice.getByTestId("zone-hand-Alice")).toContainText("1 card");
  soloMatch = (await snapshot(bob)).match!;
  const aliceHand = soloMatch.zones.find(
    (zone) => zone.kind === "hand" && zone.ownerId === soloMatch.players[0].id,
  )!;
  expect(aliceHand).toMatchObject({ count: 1 });
  expect(aliceHand).not.toHaveProperty("objectIds");

  const unauthorizedMutation = await exchange(bob, {
    type: "match-action",
    matchId: soloMatch.id,
    revision: soloMatch.revision,
    action: {
      type: "create-zone",
      kind: "special",
      name: "Unauthorized zone",
      visibility: "public",
    },
  });
  expect(unauthorizedMutation).toMatchObject({
    event: "rejected",
    data: { message: "Only the Match Player can change a solo Match." },
  });
  expect(
    (await snapshot(alice)).match!.zones.some(
      (zone) => zone.name === "Unauthorized zone",
    ),
  ).toBe(false);

  await Promise.all(contexts.map((context) => context.close()));
});

test("solo Match replacement waits for every current Match Player to confirm", async ({
  browser,
}) => {
  const {
    pages: [alice, bob],
    contexts,
  } = await startTable(browser);
  const originalMatchId = (await snapshot(alice)).match!.id;
  await bob.getByText("Room lobby and Decklists", { exact: true }).click();
  await bob.getByRole("button", { name: "Not ready", exact: true }).click();
  await alice.getByText("Room lobby and Decklists", { exact: true }).click();
  await alice
    .getByRole("button", { name: "Start solo Match", exact: true })
    .click();

  await expect(alice.getByText("New Match requested")).toBeVisible();
  let view = await snapshot(alice);
  expect(view.match!.id).toBe(originalMatchId);
  expect(view.rematch!.confirmations).toHaveLength(0);

  await alice
    .getByRole("button", { name: "Confirm new Match", exact: true })
    .click();
  await expect
    .poll(async () => (await snapshot(alice)).rematch!.confirmations.length)
    .toBe(1);
  view = await snapshot(alice);
  expect(view.match!.id).toBe(originalMatchId);
  expect(view.rematch!.confirmations).toHaveLength(1);

  await bob
    .getByRole("button", { name: "Confirm new Match", exact: true })
    .click();
  await expect
    .poll(async () => (await snapshot(alice)).match!.id)
    .not.toBe(originalMatchId);
  view = await snapshot(alice);
  expect(view.match!.players.map((player) => player.name)).toEqual(["Alice"]);
  expect(view.rematch).toBeUndefined();

  await Promise.all(contexts.map((context) => context.close()));
});

test("card drags commit on release and both participants receive ordered revisions and stale-action recovery", async ({
  browser,
}) => {
  const {
    pages: [alice, bob],
    contexts,
  } = await startTable(browser);
  await alice.getByRole("button", { name: "Draw one", exact: true }).click();
  const before = (await snapshot(alice)).match!;
  const hand = before.zones.find(
    (zone) => zone.kind === "hand" && zone.ownerId === before.players[0].id,
  )!;
  const drawn = before.objects[hand.objectIds![0]];
  const originalInstance = drawn.cardInstanceIds![0];
  const card = await alice
    .getByTestId("zone-hand-Alice")
    .getByRole("button", { name: "Island", exact: true })
    .boundingBox();
  const battlefield = await alice.getByTestId("battlefield").boundingBox();
  if (!card || !battlefield) throw new Error("No drag target");
  await alice.mouse.move(card.x + 10, card.y + 10);
  await alice.mouse.down();
  await alice.mouse.move(battlefield.x + 160, battlefield.y + 140, {
    steps: 6,
  });
  await expect(bob.getByTestId("match-revision")).toHaveText(
    `Revision ${before.revision}`,
  );
  await alice.mouse.up();
  await expect(
    bob
      .getByTestId("battlefield")
      .getByRole("button", { name: "Island", exact: true }),
  ).toBeVisible();
  const after = (await snapshot(bob)).match!;
  const permanent = Object.values(after.objects).find((object) =>
    object.cardInstanceIds?.includes(originalInstance),
  )!;
  expect(permanent.id).not.toBe(drawn.id);
  expect(after.instances[originalInstance].ownerId).toBe(before.players[0].id);
  expect(after.revision).toBe(before.revision + 1);
  const accepted = await exchange(alice, {
    type: "match-action",
    matchId: after.id,
    revision: after.revision,
    action: {
      type: "position",
      objectId: permanent.id,
      position: { x: 300, y: 100 },
    },
  });
  expect(accepted.event).toBe("view");
  const rejected = await exchange(bob, {
    type: "match-action",
    matchId: after.id,
    revision: after.revision,
    action: {
      type: "position",
      objectId: permanent.id,
      position: { x: 400, y: 200 },
    },
  });
  expect(rejected).toMatchObject({
    event: "rejected",
    data: {
      view: {
        match: {
          revision: after.revision + 1,
          layout: { positions: { [permanent.id]: { x: 300, y: 100 } } },
        },
      },
    },
  });
  const concurrent = await Promise.all([
    exchange(alice, {
      type: "match-action",
      matchId: after.id,
      revision: after.revision + 1,
      action: {
        type: "position",
        objectId: permanent.id,
        position: { x: 250, y: 50 },
      },
    }),
    exchange(bob, {
      type: "match-action",
      matchId: after.id,
      revision: after.revision + 1,
      action: {
        type: "position",
        objectId: permanent.id,
        position: { x: 200, y: 70 },
      },
    }),
  ]);
  expect(concurrent.map((response) => response.event).sort()).toEqual([
    "rejected",
    "view",
  ]);
  expect((await snapshot(alice)).match!.revision).toBe(after.revision + 2);
  await Promise.all(contexts.map((context) => context.close()));
});

test("life, turns, signed Counters, tokens, abilities and outcomes synchronize without applying rules", async ({
  browser,
}) => {
  const {
    pages: [alice, bob],
    contexts,
  } = await startTable(browser);
  await alice.getByLabel("Alice life", { exact: true }).fill("-5");
  await alice
    .getByRole("button", { name: "Save Alice life", exact: true })
    .click();
  await expect(bob.getByLabel("Alice life", { exact: true })).toHaveValue("-5");
  await expect(bob.getByLabel("Game outcome", { exact: true })).toHaveValue(
    "ongoing",
  );
  await alice.getByLabel("Phase and step", { exact: true }).selectOption("7");
  await alice.getByLabel("Turn number", { exact: true }).fill("3");
  await alice
    .getByRole("button", { name: "Save turn markers", exact: true })
    .click();
  await expect(bob.getByLabel("Phase and step", { exact: true })).toHaveValue(
    "7",
  );
  await alice.getByRole("button", { name: "Next step", exact: true }).click();
  await expect(bob.getByLabel("Phase and step", { exact: true })).toHaveValue(
    "8",
  );
  await alice
    .getByRole("button", { name: "Previous step", exact: true })
    .click();
  await expect(bob.getByLabel("Phase and step", { exact: true })).toHaveValue(
    "7",
  );
  await bob.getByRole("button", { name: "Draw one", exact: true }).click();
  await expect(bob.getByTestId("zone-hand-Bob")).toContainText("Island");
  await alice
    .getByLabel("Counter target", { exact: true })
    .selectOption({ label: "Alice (player)" });
  await alice.getByLabel("Counter kind", { exact: true }).fill("+1/+1");
  await alice
    .getByLabel("Counter quantity", { exact: true })
    .fill("-123456789012345678901234567890");
  await alice.getByRole("button", { name: "Set Counter", exact: true }).click();
  await expect(bob.getByTestId("match-players")).toContainText(
    "-123456789012345678901234567890 +1/+1",
  );
  await alice.getByText("Add token or ability", { exact: true }).click();
  const creator = alice.getByTestId("object-creator");
  await creator.getByLabel("Object name", { exact: true }).fill("Soldier");
  await creator.getByLabel("Power", { exact: true }).fill("1");
  await creator.getByLabel("Toughness", { exact: true }).fill("1");
  await creator
    .getByRole("button", { name: "Create object", exact: true })
    .click();
  await expect(
    bob
      .getByTestId("battlefield")
      .getByRole("button", { name: "Soldier", exact: true }),
  ).toBeVisible();
  await alice
    .getByTestId("battlefield")
    .getByRole("button", { name: "Soldier", exact: true })
    .click();
  await alice.getByRole("button", { name: "Tap", exact: true }).click();
  await expect(
    bob
      .getByTestId("battlefield")
      .getByRole("button", { name: "Soldier", exact: true }),
  ).toHaveClass(/tapped/);
  await creator
    .getByLabel("Object kind", { exact: true })
    .selectOption("ability");
  await creator.getByLabel("Object name", { exact: true }).fill("Draw trigger");
  await creator.getByLabel("Rules text", { exact: true }).fill("Draw a card.");
  const source = Object.values((await snapshot(alice)).match!.objects).find(
    (object) => object.characteristics.name === "Soldier",
  )!;
  await creator
    .getByLabel("Source Game Object", { exact: true })
    .selectOption(source.id);
  await creator
    .getByLabel("Source Card Ability", { exact: true })
    .fill("draw-trigger");
  await creator
    .getByRole("button", { name: "Create object", exact: true })
    .click();
  await expect(bob.getByTestId("zone-stack")).toContainText("Draw trigger");
  const ability = Object.values((await snapshot(bob)).match!.objects).find(
    (object) => object.characteristics.name === "Draw trigger",
  )!;
  expect(ability).toMatchObject({
    sourceObjectId: source.id,
    sourceAbilityId: "draw-trigger",
  });
  await alice
    .getByTestId("zone-stack")
    .getByRole("button", { name: "Draw trigger", exact: true })
    .click();
  await alice
    .getByText("Faces, choices and relationships", { exact: true })
    .click();
  await alice
    .getByLabel("Linked object", { exact: true })
    .selectOption(source.id);
  await alice
    .getByLabel("Linked Card Ability", { exact: true })
    .fill("draw-trigger");
  await alice
    .getByRole("button", { name: "Record Object Link", exact: true })
    .click();
  await expect
    .poll(async () => (await snapshot(bob)).match!.objects[ability.id].links)
    .toMatchObject([{ abilityId: "draw-trigger", objectIds: [source.id] }]);
  await alice
    .getByRole("button", { name: "Resolve ability", exact: true })
    .click();
  await expect(bob.getByTestId("zone-stack")).not.toContainText("Draw trigger");
  await expect(bob.getByTestId("zone-hand-Bob")).toContainText("1 card");
  await alice.getByLabel("Game outcome", { exact: true }).selectOption("draw");
  await expect(bob.getByLabel("Game outcome", { exact: true })).toHaveValue(
    "draw",
  );
  await Promise.all(contexts.map((context) => context.close()));
});

test("private Zones and face-down identities stay redacted even when a known card is moved by an ability", async ({
  browser,
}) => {
  const {
    pages: [alice, bob],
    contexts,
  } = await startTable(browser);
  let own = (await snapshot(alice)).match!;
  const alicePlayer = own.players[0];
  const bobPlayer = own.players[1];
  const library = own.zones.find(
    (zone) => zone.kind === "library" && zone.ownerId === alicePlayer.id,
  )!;
  const delver = Object.values(own.objects).find(
    (object) => object.characteristics.name === "Delver of Secrets",
  )!;
  const rejected = await exchange(bob, {
    type: "match-action",
    matchId: own.id,
    revision: own.revision,
    action: {
      type: "move",
      objectId: delver.id,
      zoneId: own.zones.find((zone) => zone.kind === "battlefield")!.id,
    },
  });
  expect(rejected.event).toBe("rejected");
  const opponent = (await snapshot(bob)).match!;
  expect(
    opponent.zones.find((zone) => zone.id === library.id),
  ).not.toHaveProperty("objectIds");
  expect(Object.values(opponent.objects)).toHaveLength(3);
  expect(opponent.objects).not.toHaveProperty(delver.id);
  await exchange(alice, {
    type: "match-action",
    matchId: own.id,
    revision: own.revision,
    action: {
      type: "move",
      objectId: delver.id,
      zoneId: own.zones.find((zone) => zone.kind === "battlefield")!.id,
    },
  });
  own = (await snapshot(alice)).match!;
  const publicDelver = Object.values(own.objects).find(
    (object) => object.characteristics.name === "Delver of Secrets",
  )!;
  const faceDown = {
    mode: "manifest",
    characteristics: {
      name: "Face-down creature",
      colors: [] as ("W" | "U" | "B" | "R" | "G")[],
      typeLine: "Creature",
      rulesText: "",
      power: "2",
      toughness: "2",
    },
    inspectableBy: [alicePlayer.id],
    turnUpProcedure: "Turn face up manually",
  };
  await exchange(alice, {
    type: "match-action",
    matchId: own.id,
    revision: own.revision,
    action: {
      type: "patch-object",
      objectId: publicDelver.id,
      patch: { faceDown },
    },
  });
  const redacted = (await snapshot(bob)).match!.objects[publicDelver.id];
  expect(redacted).toMatchObject({
    hidden: true,
    characteristics: { name: "Face-down creature" },
  });
  for (const field of [
    "cardInstanceIds",
    "artwork",
    "components",
    "casting",
    "choices",
    "variables",
    "faceDown",
    "copiableValuesId",
  ])
    expect(redacted).not.toHaveProperty(field);
  expect(JSON.stringify(redacted)).not.toContain("Delver of Secrets");
  expect((await snapshot(bob)).match!.instances).not.toHaveProperty(
    delver.cardInstanceIds![0],
  );
  own = (await snapshot(alice)).match!;
  await exchange(alice, {
    type: "match-action",
    matchId: own.id,
    revision: own.revision,
    action: {
      type: "patch-object",
      objectId: publicDelver.id,
      patch: { faceDown: null },
    },
  });
  own = (await snapshot(alice)).match!;
  const bobHand = own.zones.find(
    (zone) => zone.kind === "hand" && zone.ownerId === bobPlayer.id,
  )!;
  const forbidden = await exchange(alice, {
    type: "match-action",
    matchId: own.id,
    revision: own.revision,
    action: { type: "move", objectId: publicDelver.id, zoneId: bobHand.id },
  });
  expect(forbidden.event).toBe("rejected");
  const directed = await exchange(alice, {
    type: "match-action",
    matchId: own.id,
    revision: own.revision,
    action: {
      type: "move",
      objectId: publicDelver.id,
      zoneId: bobHand.id,
      directedBy: {
        sourceId: publicDelver.id,
        reason: "Manually resolved ability",
      },
    },
  });
  expect(directed.event).toBe("view");
  const hiddenHand = (await snapshot(alice)).match!.zones.find(
    (zone) => zone.id === bobHand.id,
  )!;
  expect(hiddenHand).toMatchObject({ count: 1 });
  expect(hiddenHand).not.toHaveProperty("objectIds");
  await expect(bob.getByTestId("zone-hand-Bob")).toContainText(
    "Delver of Secrets",
  );
  await bob.reload();
  await expect(bob.getByTestId("zone-hand-Bob")).toContainText(
    "Delver of Secrets",
  );
  await Promise.all(contexts.map((context) => context.close()));
});

test("late guests wait and an active Match survives disconnects until every current player confirms replacement", async ({
  browser,
}) => {
  const {
    pages: [alice, bob],
    contexts,
    invitation,
  } = await startTable(browser);
  const before = (await snapshot(alice)).match!;
  const lateContext = await browser.newContext();
  const late = await lateContext.newPage();
  await late.goto(invitation);
  await late.getByLabel("Your name").fill("Charlie");
  await late.getByRole("button", { name: "Join Room", exact: true }).click();
  await expect(late.getByTestId("match")).toBeVisible();
  expect((await snapshot(late)).match!.players).toHaveLength(2);
  await alice.getByText("Room lobby and Decklists", { exact: true }).click();
  await bob.goto("about:blank");
  await expect(alice.getByTestId("participants")).toContainText("Disconnected");
  await alice
    .getByRole("button", { name: "Request new Match", exact: true })
    .click();
  await alice
    .getByRole("button", { name: "Confirm new Match", exact: true })
    .click();
  expect((await snapshot(alice)).match!.id).toBe(before.id);
  await bob.goto(invitation);
  await expect(bob.getByTestId("match")).toBeVisible();
  expect((await snapshot(bob)).match!.id).toBe(before.id);
  await bob.getByText("Room lobby and Decklists", { exact: true }).click();
  await bob
    .getByRole("button", { name: "Confirm new Match", exact: true })
    .click();
  await expect
    .poll(async () => (await snapshot(alice)).match!.id)
    .not.toBe(before.id);
  const replacement = (await snapshot(alice)).match!;
  expect(replacement.players).toHaveLength(2);
  expect(Object.keys(replacement.instances)).not.toContain(
    Object.keys(before.instances)[0],
  );
  expect((await snapshot(alice)).decklists[0].text).toBe(
    "2 Island\n1 Delver of Secrets (TST) 3",
  );
  await Promise.all(
    [...contexts, lateContext].map((context) => context.close()),
  );
});

test("manual casting, faces, choices, links, copies, meld and supplementary areas retain separate card identities", async ({
  browser,
}) => {
  const {
    pages: [alice],
    contexts,
  } = await startTable(browser);
  let match = (await snapshot(alice)).match!;
  const player = match.players[0];
  const delver = Object.values(match.objects).find(
    (object) => object.characteristics.name === "Delver of Secrets",
  )!;
  const instanceId = delver.cardInstanceIds![0];
  match = await act(alice, {
    type: "opening-hand",
    objectId: delver.id,
    description: "Opening-hand ability",
    taken: false,
    result: "No action taken",
  });
  expect(match.openingHandActions).toMatchObject([
    { playerId: player.id, taken: false },
  ]);
  match = await act(alice, {
    type: "move",
    objectId: delver.id,
    zoneId: match.zones.find((zone) => zone.kind === "stack")!.id,
    cast: {
      sourceZoneId: delver.zoneId,
      chosenX: "12",
      modes: ["First mode"],
      components: [0],
      additionalCosts: [],
      manaSpent: ["U", "R"],
    },
  });
  let spell = Object.values(match.objects).find((object) =>
    object.cardInstanceIds?.includes(instanceId),
  )!;
  match = await act(alice, {
    type: "patch-object",
    objectId: spell.id,
    patch: {
      choices: [{ name: "card name", value: "A name outside the Catalog" }],
      variables: [{ name: "X", value: "12" }],
      protectorId: match.players[1].id,
    },
  });
  match = await act(alice, {
    type: "move",
    objectId: spell.id,
    zoneId: match.zones.find((zone) => zone.kind === "battlefield")!.id,
  });
  spell = Object.values(match.objects).find((object) =>
    object.cardInstanceIds?.includes(instanceId),
  )!;
  expect(spell.casting).toMatchObject({
    sourceZoneId: delver.zoneId,
    chosenX: "12",
    manaSpent: ["U", "R"],
  });
  expect(spell.choices).toMatchObject([
    { value: "A name outside the Catalog" },
  ]);
  match = await act(alice, {
    type: "patch-object",
    objectId: spell.id,
    patch: { currentFace: 1 },
  });
  expect(match.objects[spell.id].characteristics.name).toBe(
    "Insectile Aberration",
  );
  const characteristics = {
    name: "Custom token",
    colors: [] as ("W" | "U" | "B" | "R" | "G")[],
    typeLine: "Creature",
    rulesText: "",
    power: "1",
    toughness: "1",
  };
  match = await act(alice, {
    type: "create-object",
    kind: "token",
    zoneId: match.zones.find((zone) => zone.kind === "battlefield")!.id,
    controllerId: player.id,
    characteristics,
  });
  const original = Object.values(match.objects).find(
    (object) => object.characteristics.name === "Custom token",
  )!;
  match = await act(alice, { type: "copy", sourceId: original.id });
  const copy = Object.values(match.objects).find(
    (object) => object.copiableValuesId,
  )!;
  match = await act(alice, {
    type: "patch-object",
    objectId: original.id,
    patch: { characteristics: { ...characteristics, power: "9" } },
  });
  expect(match.objects[copy.id].characteristics.power).toBe("1");
  expect(match.copiableValues[copy.copiableValuesId!].power).toBe("1");
  match = await act(alice, {
    type: "patch-object",
    objectId: spell.id,
    patch: {
      attachmentTo: original.id,
      links: [{ label: "exiled card", objectIds: [copy.id] }],
    },
  });
  expect(match.objects[spell.id]).toMatchObject({
    attachmentTo: original.id,
    links: [{ objectIds: [copy.id] }],
  });
  const islands = Object.values(match.objects)
    .filter((object) => object.characteristics.name === "Island")
    .slice(0, 2);
  const islandInstances = islands.map((object) => object.cardInstanceIds![0]);
  match = await act(alice, {
    type: "meld",
    objectIds: islands.map((object) => object.id),
    characteristics: { ...characteristics, name: "Melded object" },
  });
  const meld = Object.values(match.objects).find(
    (object) => object.characteristics.name === "Melded object",
  )!;
  expect(meld.cardInstanceIds).toEqual(islandInstances);
  match = await act(alice, { type: "unmeld", objectId: meld.id });
  expect(
    islandInstances.every((instance) =>
      Object.values(match.objects).some((object) =>
        object.cardInstanceIds?.includes(instance),
      ),
    ),
  ).toBe(true);
  match = await act(alice, {
    type: "create-zone",
    kind: "special",
    name: "Planechase",
    visibility: "public",
  });
  const planeArea = match.zones.find((zone) => zone.name === "Planechase")!;
  for (const name of ["First Plane", "Second Plane"])
    match = await act(alice, {
      type: "create-object",
      kind: "plane",
      zoneId: planeArea.id,
      controllerId: player.id,
      characteristics: { ...characteristics, name },
    });
  expect(match.zones.find((zone) => zone.id === planeArea.id)!.count).toBe(2);
  await Promise.all(contexts.map((context) => context.close()));
});
