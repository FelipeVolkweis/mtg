import { expect, test } from "@playwright/test";
import { createRoom, joinRoom, signIn, testPassword } from "./support/table";

test("a visitor creates an account, signs out and signs back in with the password", async ({
  page,
}) => {
  const username = `Newcomer${Date.now()}`;
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Create Room" })).toHaveCount(
    0,
  );
  await page
    .getByRole("button", { name: "Create an account", exact: true })
    .click();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(testPassword);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByTestId("signed-in-user")).toHaveText(username);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByLabel("Username")).toBeVisible();

  await page.getByLabel("Username").fill(username.toLowerCase());
  await page.getByLabel("Password").fill("not the password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Incorrect username or password.",
  );
  await page.getByLabel("Password").fill(testPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByTestId("signed-in-user")).toHaveText(username);
  await expect(
    page.getByRole("button", { name: "Create Room", exact: true }),
  ).toBeVisible();
});

test("usernames are unique regardless of case and passwords have a minimum length", async ({
  request,
}) => {
  const username = `Taken${Date.now()}`;
  const register = (body: object) =>
    request.post("/api/auth/register", { data: body });
  expect((await register({ username, password: testPassword })).ok()).toBe(
    true,
  );
  const duplicate = await register({
    username: username.toUpperCase(),
    password: testPassword,
  });
  expect(duplicate.status()).toBe(400);
  expect((await duplicate.json()).message).toBe(
    "That username is already taken.",
  );
  const short = await register({ username: `${username}x`, password: "short" });
  expect((await short.json()).message).toBe(
    "Passwords need at least 8 characters.",
  );
});

test("ten failed sign-ins lock the username, even for the right password", async ({
  request,
}) => {
  const username = `Locked${Date.now()}`;
  await request.post("/api/auth/register", {
    data: { username, password: testPassword },
  });
  const login = (password: string) =>
    request.post("/api/auth/login", { data: { username, password } });
  for (let i = 0; i < 10; i++)
    expect((await login("wrong password")).status()).toBe(401);
  const locked = await login(testPassword);
  expect(locked.status()).toBe(401);
  expect((await locked.json()).message).toContain("Too many failed sign-ins");
});

test("signed-in Users create an invitation-only Room and return as the same participant", async ({
  page,
  browser,
}) => {
  const invitation = await createRoom(page, "Alice");
  await expect(page.getByTestId("signed-in-user")).toHaveText("Alice");
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
