import { expect, test } from "@playwright/test";
import type { DeckView } from "../src/shared/model";
import { snapshot } from "./support/peer";
import { createRoom, saveDeck } from "./support/table";

const decks = (page: import("@playwright/test").Page) =>
  page.evaluate(
    async () => (await (await fetch("/api/decks")).json()) as DeckView[],
  );

test("a User's Deck Catalog is shared by every Room they join", async ({
  page,
}) => {
  await createRoom(page, "Collector");
  await saveDeck(
    page,
    "Travelling deck",
    "99 Island (TST) 1\n1 Rules Commander",
  );
  await page
    .getByLabel("Commander", { exact: true })
    .selectOption({ label: "Rules Commander" });
  await expect(page.getByLabel("Decklist issues")).toHaveCount(0);
  await page.goto("/");
  await page.getByRole("button", { name: "Create Room", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Room lobby" })).toBeVisible();
  await page
    .getByLabel("Selected Decklist")
    .selectOption({ label: "Travelling deck" });
  await page.getByRole("button", { name: "Mark ready", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Not ready", exact: true }),
  ).toBeVisible();
  const view = await snapshot(page);
  expect(view.selectedDeck?.name).toBe("Travelling deck");
  expect(view.selectedDeck?.format).toBe("commander");
});

test("each Deck has a format and only legal Commander Decks can be readied", async ({
  page,
}) => {
  await createRoom(page, "Formats");
  await saveDeck(
    page,
    "No commander yet",
    "99 Island (TST) 1\n1 Rules Commander",
  );
  await expect(page.getByLabel("Decklist issues")).toContainText(
    "Choose a legendary creature",
  );
  await expect(
    page.getByRole("button", { name: "Mark ready", exact: true }),
  ).toBeDisabled();

  await page.getByRole("button", { name: "New Decklist", exact: true }).click();
  await page.getByLabel("Decklist name").fill("Standard draft");
  await page.getByLabel("Format", { exact: true }).selectOption("standard");
  await page.getByLabel("Decklist text").fill("5 Delver of Secrets (TST) 3");
  await page
    .getByRole("button", { name: "Save Decklist", exact: true })
    .click();
  await expect(page.getByLabel("Decklist issues")).toContainText(
    "Standard Decklists must contain at least 60 cards.",
  );
  await expect(page.getByLabel("Decklist issues")).toContainText(
    "at most four copies of Delver of Secrets",
  );
  await page
    .getByLabel("Selected Decklist")
    .selectOption({ label: "Standard draft (Standard)" });
  await expect(
    page.getByText("Standard Matches are not available yet."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Mark ready", exact: true }),
  ).toBeDisabled();
  const saved = await decks(page);
  expect(saved.map((deck) => [deck.name, deck.format]).sort()).toEqual([
    ["No commander yet", "commander"],
    ["Standard draft", "standard"],
  ]);
});

test("the My decks page lists, edits and deletes Decks outside any Room", async ({
  page,
}) => {
  await page.goto("/");
  await createRoom(page, "CatalogPage");
  await page.getByRole("link", { name: "My decks" }).first().click();
  await expect(page.getByRole("heading", { name: "My decks" })).toBeVisible();
  await page.getByLabel("Decklist name").fill("Pauper brew");
  await page.getByLabel("Format", { exact: true }).selectOption("pauper");
  await page.getByLabel("Decklist text").fill("60 Island (TST) 1");
  await page
    .getByRole("button", { name: "Save Decklist", exact: true })
    .click();
  const list = page.getByTestId("deck-catalog");
  await expect(list).toContainText("Pauper brew");
  await expect(list).toContainText("Pauper · 60 cards · Legal");
  page.once("dialog", (dialog) => void dialog.accept());
  await list.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("No decks yet.")).toBeVisible();
  expect(await decks(page)).toEqual([]);
});
