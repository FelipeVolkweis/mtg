import { expect, test } from "@playwright/test";
import { startServer } from "./support/server";
import { snapshot } from "./support/peer";
import { seedCatalog } from "./setup";
import { createRoom, joinRoom } from "./support/table";

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
    const invitation = await createRoom(pages[0], "Alice", server.origin);
    await joinRoom(pages[1], invitation, "Bob");
    for (const page of pages) {
      await page.getByLabel("Decklist name").fill("Persistent list");
      await page
        .getByLabel("Decklist text")
        .fill("99 Island (TST) 1\n1 Rules Commander");
      await page
        .getByRole("button", { name: "Save Decklist", exact: true })
        .click();
      await page
        .getByLabel("Commander", { exact: true })
        .selectOption({ label: "Rules Commander" });
      await page
        .getByRole("button", { name: "Mark ready", exact: true })
        .click();
    }
    await pages[0]
      .getByRole("button", { name: "Start Match", exact: true })
      .click();
    await expect(pages[0].getByTestId("match")).toBeVisible();
    await pages[0]
      .getByRole("button", { name: "Keep Hand", exact: true })
      .click();
    await expect(
      pages[0].getByRole("button", { name: "Keep Hand", exact: true }),
    ).toHaveCount(0);
    await expect(pages[0].getByTestId("zone-hand-Alice")).toContainText(
      "Island",
    );
    const before = await snapshot(pages[0]);
    await server.stop();
    server = await startServer("mtg_recovery_test", 4318);
    await expect(pages[0].getByTestId("match-revision")).toContainText(
      `Revision ${before.match!.revision}`,
    );
    await pages[0].reload();
    await expect(pages[0].getByTestId("zone-hand-Alice")).toContainText(
      "Island",
    );
    const restored = await snapshot(pages[0]);
    expect(restored.match).toEqual(before.match);
    expect(restored.selectedDeck).toEqual(before.selectedDeck);
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
    await createRoom(page, "ExpiryPlayer", server.origin);
    await page.evaluate(() => {
      const invite = location.pathname.split("/").pop()!;
      const socket = new WebSocket(`ws://${location.host}/ws`);
      socket.onopen = () =>
        socket.send(
          JSON.stringify({
            event: "authenticate",
            data: { invite },
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
    await page.reload();
    await expect(page.getByRole("alert")).toContainText("closed or expired");
  } finally {
    await context.close();
    await server.stop();
  }
});

for (const kind of ["casting", "resolution", "ordering", "practice"] as const)
  test(`server restart resumes ${kind} procedure with identical private views and no duplicate effects`, async ({
    browser,
  }) => {
    const { saveDeck } = await import("./support/table");
    const { exchange } = await import("./support/peer");
    const { seedRulesScenario } = await import("./support/rules-scenario");
    let server = await startServer("mtg_rules_recovery_test", 4321);
    const contexts = await Promise.all([
      browser.newContext(),
      browser.newContext(),
    ]);
    const pages = await Promise.all(contexts.map((c) => c.newPage()));
    try {
      await seedCatalog();
      const invitation = await createRoom(pages[0], "Alice", server.origin);
      await joinRoom(pages[1], invitation, "Bob");
      for (const [seat, page] of pages.entries()) {
        await saveDeck(
          page,
          "Supported",
          "99 Island (TST) 1\n1 Rules Commander",
        );
        await page
          .getByLabel("Commander", { exact: true })
          .selectOption({ label: "Rules Commander" });
        if (kind !== "practice" || seat === 0)
          await page
            .getByRole("button", { name: "Mark ready", exact: true })
            .click();
      }
      await pages[0]
        .getByRole("button", {
          name: kind === "practice" ? "Start solo practice" : "Start Match",
          exact: true,
        })
        .click();
      await expect(pages[0].getByTestId("match")).toBeVisible();
      const name =
        kind === "casting" || kind === "practice"
          ? "Kappa Cannoneer"
          : kind === "resolution"
            ? "Thirst for Knowledge"
            : "Sol Ring";
      const { targetId } = await seedRulesScenario(
        invitation.split("/").pop()!,
        name,
        kind === "ordering",
        undefined,
        server.databaseUrl,
      );
      await pages[0].reload();
      const act = async (
        seat: number,
        action: import("../src/shared/rules-state").MatchAction,
      ) => {
        const match = (await snapshot(pages[seat])).match!;
        return exchange(pages[seat], {
          type: "match-action",
          matchId: match.id,
          revision: match.revision,
          action,
        });
      };
      expect(
        (await act(0, { type: "cast-spell", objectId: targetId })).event,
      ).toBe("view");
      if (kind === "resolution") {
        await act(0, { type: "pass-priority" });
        await act(1, { type: "pass-priority" });
      }
      const before = await snapshot(pages[0]);
      expect(before.match!.rules!.prompt!.promptKind).toBe(
        kind === "casting" || kind === "practice"
          ? "pay-costs"
          : kind === "resolution"
            ? "resolution-choice"
            : "order-triggers",
      );
      const opponentBefore = await snapshot(pages[1]);
      expect(opponentBefore.match!.rules!.prompt).toBeUndefined();
      await server.stop();
      server = await startServer("mtg_rules_recovery_test", 4321);
      await pages[0].reload();
      await pages[1].reload();
      await expect(pages[0].getByTestId("match")).toBeVisible();
      const restored = await snapshot(pages[0]);
      expect(restored.match).toEqual(before.match);
      expect((await snapshot(pages[1])).match).toEqual(opponentBefore.match);
      const pending = restored.match!.rules!.prompt!;
      if (kind === "ordering")
        expect(
          (
            await act(0, {
              type: "rules-input",
              procedureId: pending.procedureId,
              selections: { order: pending.options.order.objectIds },
            })
          ).event,
        ).toBe("view");
      else if (kind === "casting" || kind === "practice")
        expect(
          (
            await act(0, {
              type: "reverse-proposal",
              procedureId: pending.procedureId,
            })
          ).event,
        ).toBe("view");
      else {
        const [key, option] = Object.entries(pending.options)[0];
        expect(
          (
            await act(0, {
              type: "rules-input",
              procedureId: pending.procedureId,
              selections: { [key]: option.objectIds.slice(0, option.count) },
            })
          ).event,
        ).toBe("view");
      }
      expect(
        (
          await act(0, {
            type: "rules-input",
            procedureId: pending.procedureId,
            selections: {},
          })
        ).event,
      ).toBe("rejected");
    } finally {
      await Promise.all(contexts.map((c) => c.close()));
      await server.stop();
    }
  });
