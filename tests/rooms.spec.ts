import { expect, test } from "@playwright/test";
import { createRoom, joinRoom, signIn } from "./support/table";

test("signed-in Users create an invitation-only Room and return as the same participant", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Create Room" })).toHaveCount(
    0,
  );
  await page.getByLabel("Username").fill("Alice");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByTestId("signed-in-user")).toHaveText("Alice");
  await page.getByRole("button", { name: "Create Room", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Room lobby" })).toBeVisible();
  const invitation = page.url();
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await guest.goto(invitation);
  // Signing in on the invitation link joins the Room.
  await signIn(guest, "Bob");
  await expect(page.getByTestId("participants")).toContainText("Bob");
  await expect(guest.getByTestId("participants")).toContainText("Alice");
  await guest.reload();
  await expect(
    guest.getByRole("heading", { name: "Room lobby" }),
  ).toBeVisible();
  await guestContext.clearCookies();
  await guest.reload();
  await expect(guest.getByLabel("Username")).toBeVisible();
  await signIn(guest, "bob");
  await expect(guest.getByTestId("participants").locator("li")).toHaveCount(2);
  await guestContext.close();
});

test("a full Room refuses new Users, keeps its participants and any participant can close it", async ({
  page,
  browser,
}) => {
  const invitation = await createRoom(page, "Alice");
  const contexts = [];
  const guests = [];
  for (const name of ["Bob", "Charlie", "Diana"]) {
    const context = await browser.newContext();
    contexts.push(context);
    const guest = await context.newPage();
    guests.push(guest);
    await joinRoom(guest, invitation, name);
  }
  const lateContext = await browser.newContext();
  contexts.push(lateContext);
  const late = await lateContext.newPage();
  await late.goto(invitation);
  await signIn(late, "Eve");
  await expect(late.getByRole("alert")).toContainText("no open seats");
  await expect(guests[2].getByTestId("participants").locator("li")).toHaveCount(
    4,
  );
  await guests[0]
    .getByRole("button", { name: "Close Room", exact: true })
    .click();
  await expect(guests[2].getByRole("alert")).toContainText("closed or expired");
  await Promise.all(contexts.map((context) => context.close()));
});

test("Rooms and Decks require a signed-in User", async ({ request }) => {
  expect((await request.post("/api/rooms")).status()).toBe(401);
  expect((await request.get("/api/decks")).status()).toBe(401);
  expect(
    (await request.post(`/api/rooms/${"a".repeat(48)}/join`)).status(),
  ).toBe(401);
});
