import { expect, type Page, type Browser } from "@playwright/test";
import { exchange, snapshot } from "./peer";
import type { MatchAction } from "../../src/shared/model";

export async function table(browser: Browser, players = 2) {
  const contexts = await Promise.all(
    Array.from({ length: players }, () =>
      browser.newContext({ viewport: { width: 1280, height: 720 } }),
    ),
  );
  const pages = await Promise.all(contexts.map((context) => context.newPage()));
  await pages[0].goto("/");
  await pages[0].getByLabel("Your name").fill("Alice");
  await pages[0]
    .getByRole("button", { name: "Create Room", exact: true })
    .click();
  await expect(
    pages[0].getByRole("heading", { name: "Room lobby" }),
  ).toBeVisible();
  const invitation = pages[0].url();
  for (let i = 1; i < pages.length; i++) {
    await pages[i].goto(invitation);
    await pages[i]
      .getByLabel("Your name")
      .fill(["Alice", "Bob", "Charlie", "Diana"][i]);
    await pages[i]
      .getByRole("button", { name: "Join Room", exact: true })
      .click();
    await expect(
      pages[i].getByRole("heading", { name: "Room lobby" }),
    ).toBeVisible();
  }
  return { pages, contexts, invitation };
}
export async function saveDeck(
  page: Page,
  name = "My deck",
  text = "2 Island\n1 Delver of Secrets (TST) 3",
) {
  await page.getByLabel("Decklist name").fill(name);
  await page.getByLabel("Decklist text").fill(text);
  await page
    .getByRole("button", { name: "Save Decklist", exact: true })
    .click();
  await expect(
    page.getByLabel("Selected Decklist").getByRole("option", { name }),
  ).toBeAttached();
}
export async function startTable(browser: Browser) {
  const result = await table(browser);
  for (const page of result.pages) {
    await saveDeck(page);
    await page.getByRole("button", { name: "Mark ready", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Not ready", exact: true }),
    ).toBeVisible();
  }
  await result.pages[0]
    .getByRole("button", { name: "Start Match", exact: true })
    .click();
  await expect(result.pages[0].getByTestId("match")).toBeVisible();
  return result;
}
export async function act(page: Page, action: MatchAction) {
  const match = (await snapshot(page)).match!;
  const response = await exchange(page, {
    type: "match-action",
    matchId: match.id,
    revision: match.revision,
    action,
  });
  expect(response.event, JSON.stringify(response)).toBe("view");
  return (await snapshot(page)).match!;
}
