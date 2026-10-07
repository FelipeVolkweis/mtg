import { expect, type Page, type Browser } from "@playwright/test";
import { exchange, snapshot } from "./peer";
import type { MatchAction } from "../../src/shared/model";

/** Signs in with the development sign-in form on the current page. */
export async function signIn(page: Page, username: string) {
  await page.getByLabel("Username").fill(username);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByTestId("signed-in-user")).toBeVisible();
}
/** Deletes the signed-in User's Decks, so earlier tests' Decks are not listed. */
export async function clearDecks(page: Page) {
  await page.evaluate(async () => {
    const decks: { id: string }[] = await (await fetch("/api/decks")).json();
    for (const deck of decks)
      await fetch(`/api/decks/${deck.id}`, { method: "DELETE" });
  });
}
/** Opens the home page, signs in and creates a Room. */
/** Signs in on the home page with an empty Deck Catalog and creates a Room. */
export async function createRoom(page: Page, username: string, origin = "") {
  await page.goto(`${origin}/`);
  await signIn(page, username);
  await clearDecks(page);
  await page.getByRole("button", { name: "Create Room", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Room lobby" })).toBeVisible();
  return page.url();
}
/** Signs in with an empty Deck Catalog and opens the invitation to join. */
export async function joinRoom(
  page: Page,
  invitation: string,
  username: string,
) {
  await page.goto(new URL("/", invitation).toString());
  await signIn(page, username);
  await clearDecks(page);
  await page.goto(invitation);
  await expect(page.getByRole("heading", { name: "Room lobby" })).toBeVisible();
}
export async function table(browser: Browser, players = 2) {
  const contexts = await Promise.all(
    Array.from({ length: players }, () =>
      browser.newContext({ viewport: { width: 1280, height: 720 } }),
    ),
  );
  const pages = await Promise.all(contexts.map((context) => context.newPage()));
  const names = ["Alice", "Bob", "Charlie", "Diana"];
  const invitation = await createRoom(pages[0], names[0]);
  for (let i = 1; i < pages.length; i++)
    await joinRoom(pages[i], invitation, names[i]);
  return { pages, contexts, invitation };
}
export async function saveDeck(
  page: Page,
  name = "My deck",
  text = "2 Island\n1 Delver of Secrets (TST) 3",
) {
  if (
    await page
      .getByRole("button", { name: "New Decklist", exact: true })
      .isVisible()
  )
    await page
      .getByRole("button", { name: "New Decklist", exact: true })
      .click();
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
    await saveDeck(
      page,
      "Supported Commander",
      "99 Island (TST) 1\n1 Rules Commander",
    );
    await page
      .getByLabel("Commander", { exact: true })
      .selectOption({ label: "Rules Commander" });
    await page.getByRole("button", { name: "Mark ready", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Not ready", exact: true }),
    ).toBeVisible();
  }
  await result.pages[0]
    .getByLabel("Starting player")
    .selectOption((await snapshot(result.pages[0])).participantId);
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
