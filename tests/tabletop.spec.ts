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
    "1 Shared Name",
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
  await saveDeck(
    alice,
    "Colliding name with exact printing",
    "1 Shared Name (TST) 5",
  );
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
  await Promise.all(contexts.map((context) => context.close()));
});
