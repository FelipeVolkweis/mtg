import { expect, test } from "@playwright/test";
import { exchange, snapshot } from "./support/peer";
import { act, saveDeck, startTable, table } from "./support/table";
import { playerAreas } from "../src/shared/table-layout";

test("opening draw and mulligan change one revision while keeping the Hand private", async ({
  browser,
}) => {
  const {
    pages: [alice, bob],
    contexts,
  } = await table(browser);
  for (const page of [alice, bob]) {
    await saveDeck(page, "Seven cards", "7 Island");
    await page.getByRole("button", { name: "Mark ready", exact: true }).click();
  }
  await alice.getByRole("button", { name: "Start Match", exact: true }).click();
  await expect(alice.getByTestId("match")).toBeVisible();
  let match = (await snapshot(alice)).match!;
  const aliceId = match.players[0].id;
  const opening = await act(alice, { type: "opening-draw" });
  expect(opening.revision).toBe(match.revision + 1);
  expect(opening.players[0].mulliganCount).toBe(0);
  expect(
    opening.zones.find(
      (zone) => zone.kind === "hand" && zone.ownerId === aliceId,
    )?.count,
  ).toBe(7);
  const concealed = (await snapshot(bob)).match!.zones.find(
    (zone) => zone.kind === "hand" && zone.ownerId === aliceId,
  )!;
  expect(concealed.count).toBe(7);
  expect(concealed).not.toHaveProperty("objectIds");
  match = opening;
  const unauthorized = await exchange(bob, {
    type: "match-action",
    matchId: match.id,
    revision: match.revision,
    action: { type: "mulligan", playerId: aliceId },
  });
  expect(unauthorized.event).toBe("rejected");
  expect((await snapshot(alice)).match!.revision).toBe(match.revision);
  const redrawn = await act(alice, { type: "mulligan", playerId: aliceId });
  expect(redrawn.revision).toBe(match.revision + 1);
  expect(redrawn.players[0].mulliganCount).toBe(1);
  expect(
    redrawn.zones.find(
      (zone) => zone.kind === "hand" && zone.ownerId === aliceId,
    )?.count,
  ).toBe(7);
  expect(
    redrawn.zones.find(
      (zone) => zone.kind === "library" && zone.ownerId === aliceId,
    )?.count,
  ).toBe(0);
  const corrected = await act(alice, {
    type: "mulligan-count",
    playerId: aliceId,
    value: 2,
  });
  expect(corrected.players[0].mulliganCount).toBe(2);
  await alice.reload();
  await expect
    .poll(async () => (await snapshot(alice)).match?.players[0].mulliganCount)
    .toBe(2);
  await Promise.all(contexts.map((context) => context.close()));
});

for (const count of [1, 2, 3, 4]) {
  test(`${count} player table keeps the viewer at the bottom without page scrolling`, async ({
    browser,
  }, testInfo) => {
    const { pages, contexts } = await table(browser, count);
    for (const page of pages) {
      await saveDeck(page, "Seven cards", "7 Island");
      await page
        .getByRole("button", { name: "Mark ready", exact: true })
        .click();
    }
    await pages[0]
      .getByRole("button", {
        name: count === 1 ? "Start solo Match" : "Start Match",
        exact: true,
      })
      .click();
    for (const page of pages) {
      await expect(page.getByTestId("match")).toBeVisible();
      const view = await snapshot(page);
      const ownName = view.match!.players.find(
        (entry) => entry.participantId === view.participantId,
      )!.name;
      const own = page.getByTestId(`player-area-${ownName}`);
      const ownBox = await own.boundingBox();
      const boardBox = await page.getByTestId("battlefield").boundingBox();
      expect(
        ownBox &&
          boardBox &&
          ownBox.y + ownBox.height / 2 > boardBox.y + boardBox.height / 2,
      ).toBeTruthy();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollHeight <= innerHeight + 1,
        ),
      ).toBe(true);
    }
    await pages[0].screenshot({
      path: testInfo.outputPath(`table-${count}-empty.png`),
    });
    await act(pages[0], { type: "opening-draw" });
    const match = (await snapshot(pages[0])).match!;
    const hand = match.zones.find(
      (zone) => zone.kind === "hand" && zone.ownerId === match.players[0].id,
    )!;
    await act(pages[0], {
      type: "move",
      objectId: hand.objectIds![0],
      zoneId: match.zones.find((zone) => zone.kind === "battlefield")!.id,
    });
    await pages[0].screenshot({
      path: testInfo.outputPath(`table-${count}-populated.png`),
    });
    await Promise.all(contexts.map((context) => context.close()));
  });
}

test("explicit controller change relocates a permanent while placement alone preserves control and ownership", async ({
  browser,
}) => {
  const {
    pages: [alice, bob],
    contexts,
  } = await startTable(browser);
  let match = (await snapshot(alice)).match!;
  const aliceId = match.players[0].id;
  const bobId = match.players[1].id;
  const library = match.zones.find(
    (zone) => zone.kind === "library" && zone.ownerId === aliceId,
  )!;
  const battlefield = match.zones.find((zone) => zone.kind === "battlefield")!;
  const instanceId = match.objects[library.objectIds![0]].cardInstanceIds![0];
  match = await act(alice, {
    type: "move",
    objectId: library.objectIds![0],
    zoneId: battlefield.id,
  });
  const permanent = Object.values(match.objects).find((object) =>
    object.cardInstanceIds?.includes(instanceId),
  )!;
  const before = match.revision;
  match = await act(bob, {
    type: "patch-object",
    objectId: permanent.id,
    patch: { controllerId: bobId },
  });
  expect(match.revision).toBe(before + 1);
  expect(match.objects[permanent.id].controllerId).toBe(bobId);
  expect(match.instances[instanceId].ownerId).toBe(aliceId);
  const bobArea = playerAreas(2, 0).find(
    (area) => area.seat === match.players[1].seat,
  )!;
  expect(match.layout.positions[permanent.id].y).toBeGreaterThanOrEqual(
    bobArea.y,
  );
  expect(match.layout.positions[permanent.id].y).toBeLessThan(
    bobArea.y + bobArea.height,
  );
  await expect
    .poll(
      async () => (await snapshot(alice)).match!.layout.positions[permanent.id],
    )
    .toEqual(match.layout.positions[permanent.id]);
  match = await act(alice, {
    type: "position",
    objectId: permanent.id,
    position: { x: 100, y: 450 },
  });
  expect(match.objects[permanent.id].controllerId).toBe(bobId);
  expect(match.instances[instanceId].ownerId).toBe(aliceId);
  await act(alice, {
    type: "position",
    objectId: permanent.id,
    position: { x: 9999, y: 9999 },
  });
  const cardBox = await alice
    .getByTestId("battlefield")
    .getByRole("button", { name: permanent.characteristics.name })
    .boundingBox();
  const boardBox = await alice.getByTestId("battlefield").boundingBox();
  expect(
    cardBox &&
      boardBox &&
      cardBox.x + cardBox.width <= boardBox.x + boardBox.width + 1,
  ).toBeTruthy();
  expect(
    cardBox &&
      boardBox &&
      cardBox.y + cardBox.height <= boardBox.y + boardBox.height + 1,
  ).toBeTruthy();
  await Promise.all(contexts.map((context) => context.close()));
});

test("local navigation, card gestures, preview, and Zone drawer work without moving shared state", async ({
  browser,
}) => {
  const {
    pages: [alice, bob],
    contexts,
  } = await table(browser);
  for (const page of [alice, bob]) {
    await saveDeck(page, "Seven cards", "7 Island");
    await page.getByRole("button", { name: "Mark ready", exact: true }).click();
  }
  await alice.getByRole("button", { name: "Start Match", exact: true }).click();
  await expect(alice.getByTestId("match")).toBeVisible();
  await alice.getByRole("button", { name: "Draw opening seven" }).click();
  const card = alice
    .getByTestId("zone-hand-Alice")
    .getByRole("button", { name: "Island" })
    .first();
  await expect(card.locator(".card-fallback")).toBeVisible();
  await card.hover();
  await alice.keyboard.down("Alt");
  await expect(
    alice.getByRole("img", { name: "Full card preview: Island" }),
  ).toBeVisible();
  await alice.keyboard.up("Alt");
  await expect(
    alice.getByRole("img", { name: "Full card preview: Island" }),
  ).toHaveCount(0);
  const before = (await snapshot(alice)).match!;
  const boardZone = before.zones.find((zone) => zone.kind === "battlefield")!;
  const handZone = before.zones.find(
    (zone) => zone.kind === "hand" && zone.ownerId === before.players[0].id,
  )!;
  await act(alice, {
    type: "move",
    objectId: handZone.objectIds![0],
    zoneId: boardZone.id,
  });
  const board = alice.getByTestId("battlefield");
  const permanent = board.getByRole("button", { name: "Island", exact: true });
  await expect(permanent).toBeVisible();
  const revision = (await snapshot(alice)).match!.revision;
  const sizeBefore = await permanent.boundingBox();
  await board.hover({ position: { x: 400, y: 250 } });
  await alice.mouse.wheel(0, -300);
  await expect
    .poll(async () => (await permanent.boundingBox())?.width)
    .toBeGreaterThan(sizeBefore!.width);
  await alice.keyboard.down("Space");
  const boardBox = await board.boundingBox();
  await alice.mouse.move(boardBox!.x + 120, boardBox!.y + 280);
  await alice.mouse.down();
  await alice.mouse.move(boardBox!.x + 180, boardBox!.y + 280);
  await alice.mouse.up();
  await alice.keyboard.up("Space");
  expect((await snapshot(alice)).match!.revision).toBe(revision);
  expect((await snapshot(bob)).match!.revision).toBe(revision);
  const beforeDrag = (await snapshot(alice)).match!;
  const permanentId = (await permanent.getAttribute("data-object-id"))!;
  const start = await permanent.boundingBox();
  await alice.mouse.move(start!.x + 12, start!.y + 12);
  await alice.mouse.down();
  await alice.mouse.move(boardBox!.x + 650, boardBox!.y + 250, { steps: 5 });
  await alice.mouse.up();
  await expect
    .poll(async () => (await snapshot(bob)).match!.revision)
    .toBe(revision + 1);
  const afterDrag = (await snapshot(bob)).match!;
  expect(afterDrag.layout.positions[permanentId]).not.toEqual(
    beforeDrag.layout.positions[permanentId],
  );
  expect(afterDrag.objects[permanentId].controllerId).toBe(
    beforeDrag.objects[permanentId].controllerId,
  );
  await alice.getByRole("button", { name: "Fit table" }).click();
  await expect
    .poll(async () => (await permanent.boundingBox())?.width)
    .toBeCloseTo(sizeBefore!.width, 0);
  await permanent.dblclick();
  await expect
    .poll(
      async () =>
        (await snapshot(bob)).match!.objects[permanentId].status.tapped,
    )
    .toBe(true);
  await alice.keyboard.press("t");
  await expect(permanent).not.toHaveClass(/tapped/);
  await alice.getByLabel("Alice life", { exact: true }).focus();
  await alice.keyboard.press("t");
  await expect(permanent).not.toHaveClass(/tapped/);
  await alice.getByTestId("zone-graveyard-Alice").getByRole("button").click();
  await expect(
    alice.getByRole("button", { name: "Close Zone drawer" }),
  ).toBeVisible();
  await Promise.all(contexts.map((context) => context.close()));
});
