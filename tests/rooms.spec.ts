import { expect, test } from "@playwright/test";

test("guests create an invitation-only Room and recover the same participant", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await page.getByLabel("Your name").fill("Alice");
  await page.getByRole("button", { name: "Create Room", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Room lobby" })).toBeVisible();
  const invitation = page.url();
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await guest.goto(invitation);
  await guest.getByLabel("Your name").fill("Bob");
  await guest.getByRole("button", { name: "Join Room", exact: true }).click();
  await expect(page.getByTestId("participants")).toContainText("Bob");
  await expect(guest.getByTestId("participants")).toContainText("Alice");
  await guest.reload();
  await expect(
    guest.getByRole("heading", { name: "Room lobby" }),
  ).toBeVisible();
  await guestContext.clearCookies();
  await guest.evaluate(() => localStorage.clear());
  await guest.reload();
  await guest.getByLabel("Your name").fill("Bob");
  await guest.getByRole("button", { name: "Join Room", exact: true }).click();
  await expect(guest.getByTestId("participants").locator("li")).toHaveCount(2);
  await guestContext.close();
});

test("a full Room accepts identity recovery and any participant can close it", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await page.getByLabel("Your name").fill("Alice");
  await page.getByRole("button", { name: "Create Room", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Room lobby" })).toBeVisible();
  const invitation = page.url();
  const contexts = [];
  const guests = [];
  for (const name of ["Bob", "Charlie", "Diana", "Eve"]) {
    const context = await browser.newContext();
    contexts.push(context);
    const guest = await context.newPage();
    guests.push(guest);
    await guest.goto(invitation);
    await guest.getByLabel("Your name").fill(name);
    await guest.getByRole("button", { name: "Join Room", exact: true }).click();
    if (name === "Eve")
      await expect(guest.getByRole("alert")).toContainText("no open seats");
    else
      await expect(
        guest.getByRole("heading", { name: "Room lobby" }),
      ).toBeVisible();
  }
  await guests[3].getByLabel("Your name").fill(" alice ");
  await guests[3]
    .getByRole("button", { name: "Join Room", exact: true })
    .click();
  await expect(guests[3].getByTestId("participants").locator("li")).toHaveCount(
    4,
  );
  await guests[0]
    .getByRole("button", { name: "Close Room", exact: true })
    .click();
  await expect(guests[3].getByRole("alert")).toContainText("closed or expired");
  await Promise.all(contexts.map((context) => context.close()));
});
