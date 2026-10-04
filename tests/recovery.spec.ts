import { expect, test } from "@playwright/test";
import { startServer } from "./support/server";
import { snapshot } from "./support/peer";
import { seedCatalog } from "./setup";

test("a server restart restores the persisted revision and private participant view", async ({
  browser,
}) => {
  let server = await startServer("mtg_recovery_test", 4318);
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
  ]);
  const pages = await Promise.all(contexts.map((context) => context.newPage()));
  try {
    await seedCatalog();
    await pages[0].goto(server.origin);
    await pages[0].getByLabel("Your name").fill("Alice");
    await pages[0]
      .getByRole("button", { name: "Create Room", exact: true })
      .click();
    await expect(
      pages[0].getByRole("heading", { name: "Room lobby" }),
    ).toBeVisible();
    const invitation = pages[0].url();
    await pages[1].goto(invitation);
    await pages[1].getByLabel("Your name").fill("Bob");
    await pages[1]
      .getByRole("button", { name: "Join Room", exact: true })
      .click();
    for (const page of pages) {
      await page.getByLabel("Decklist name").fill("Persistent list");
      await page
        .getByLabel("Decklist text")
        .fill("2 Island\n1 Delver of Secrets");
      await page
        .getByRole("button", { name: "Save Decklist", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Mark ready", exact: true })
        .click();
    }
    await pages[0]
      .getByRole("button", { name: "Start Match", exact: true })
      .click();
    await expect(pages[0].getByTestId("match")).toBeVisible();
    await pages[0]
      .getByRole("button", { name: "Draw one", exact: true })
      .click();
    await expect(pages[0].getByTestId("zone-hand-Alice")).toContainText(
      "Island",
    );
    const before = await snapshot(pages[0]);
    await server.stop();
    server = await startServer("mtg_recovery_test", 4318);
    await expect(pages[0].getByTestId("match-revision")).toHaveText(
      `Revision ${before.match!.revision}`,
    );
    await pages[0].reload();
    await expect(pages[0].getByTestId("zone-hand-Alice")).toContainText(
      "Island",
    );
    const restored = await snapshot(pages[0]);
    expect(restored.match).toEqual(before.match);
    expect(restored.decklists).toEqual(before.decklists);
    await expect(pages[1].getByTestId("zone-hand-Alice")).not.toContainText(
      "Island",
    );
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    await server.stop();
  }
});

test("Room keepalives do not extend configurable inactivity expiry", async ({
  browser,
}) => {
  const server = await startServer("mtg_expiry_test", 4319, {
    ROOM_EXPIRY_DAYS: String(2500 / 86_400_000),
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(server.origin);
    await page.getByLabel("Your name").fill("Expiry guest");
    await page
      .getByRole("button", { name: "Create Room", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Room lobby" }),
    ).toBeVisible();
    await page.evaluate(() => {
      const invite = location.pathname.split("/").pop()!;
      const socket = new WebSocket(`ws://${location.host}/ws`);
      socket.onopen = () =>
        socket.send(
          JSON.stringify({
            event: "authenticate",
            data: { invite, credential: localStorage.getItem(`mtg:${invite}`) },
          }),
        );
      const timer = setInterval(
        () =>
          socket.readyState === WebSocket.OPEN &&
          socket.send(JSON.stringify({ event: "ping", data: {} })),
        100,
      );
      socket.onclose = () => clearInterval(timer);
    });
    await expect(page.getByRole("alert")).toContainText("closed or expired", {
      timeout: 7000,
    });
    await page.getByLabel("Your name").fill("Expiry guest");
    await page.getByRole("button", { name: "Join Room", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("closed or expired");
  } finally {
    await context.close();
    await server.stop();
  }
});
