import { expect, test } from "@playwright/test";
import { act, startTable } from "./support/table";
import { snapshot } from "./support/peer";

test("dragging a land and using its card menu keeps gameplay server-owned; Alt alone reveals the preview", async ({
  browser,
}) => {
  const {
    pages: [alice, bob],
    contexts,
  } = await startTable(browser);
  try {
    await act(alice, { type: "keep-hand", bottomIds: [] });
    await act(bob, { type: "keep-hand", bottomIds: [] });
    // Advance through the engine's explicit passes to the first main phase.
    for (let i = 0; i < 2; i++) {
      const current = (await snapshot(alice)).match!;
      const first =
        current.priority!.playerId === current.players[0].id ? alice : bob;
      const second = first === alice ? bob : alice;
      await act(first, { type: "pass-priority" });
      await act(second, { type: "pass-priority" });
    }
    const hand = alice.getByTestId("zone-hand-Alice");
    const card = hand
      .getByRole("button", { name: "Card: Island", exact: true })
      .first();
    await card.hover();
    await expect(alice.getByLabel("Enlarged card")).toHaveCount(0);
    await alice.keyboard.down("Alt");
    await expect(alice.getByLabel("Enlarged card")).toBeVisible();
    const bounds = await alice.getByLabel("Enlarged card").boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(720);
    await alice.keyboard.up("Alt");
    await expect(alice.getByLabel("Enlarged card")).toHaveCount(0);
    await card.dragTo(alice.getByLabel("Alice Battlefield"));
    const land = alice
      .getByLabel("Lands — Alice")
      .getByRole("button", { name: "Card: Island", exact: true });
    await expect(land).toBeVisible();
    await land.click();
    await expect(
      alice.getByRole("dialog", { name: "Card actions" }),
    ).toBeVisible();
    await alice.getByLabel("Turn and phase", { exact: true }).click();
    await expect(
      alice.getByRole("dialog", { name: "Card actions" }),
    ).toHaveCount(0);
    await land.click();
    await alice
      .getByRole("button", { name: "Island: add 1 U", exact: true })
      .click();
    await expect(land).toContainText("Tapped");
    const current = (await snapshot(alice)).match!;
    expect(current.rules!.mana[current.players[0].id].U).toBe(1);
    await expect(bob.getByTestId("zone-hand-Alice")).not.toContainText(
      "Island",
    );
    await expect(alice.getByLabel("Alice commander")).toContainText("Tax +0");
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});

import { seedRulesScenario } from "./support/rules-scenario";
import { cardAction } from "./support/card-actions";

test("equivalent copies expand individually while tapped, countered, attached and face-down permanents remain distinct", async ({
  browser,
}) => {
  const {
    pages: [alice],
    contexts,
    invitation,
  } = await startTable(browser);
  try {
    await seedRulesScenario(
      invitation.split("/").pop()!,
      undefined,
      false,
      "presentation",
    );
    await alice.reload();
    const creatures = alice.getByLabel("Creatures — Alice");
    const pile = creatures.getByRole("button", {
      name: "Expand Silver Myr pile (2)",
      exact: true,
    });
    await expect(pile).toHaveCount(1);
    await expect(
      creatures.getByRole("button", { name: "Card: Silver Myr", exact: true }),
    ).toHaveCount(3);
    await expect(creatures).toContainText("Tapped");
    await expect(creatures).toContainText("1 +1/+1 counters");
    await expect(creatures).toContainText("Attached to Silver Myr");
    await expect(alice.getByLabel("Artifacts — Alice")).not.toContainText(
      "Adaptive Omnitool",
    );
    await pile.click();
    await expect(
      creatures.getByRole("button", { name: "Card: Silver Myr", exact: true }),
    ).toHaveCount(5);
    await alice
      .getByLabel("Artifacts — Alice")
      .getByRole("button", { name: "Card: Sol Ring", exact: true })
      .click();
    await expect(pile).toHaveCount(1);
    await pile.click();
    const untapped = alice
      .getByRole("group", { name: "Silver Myr spread (2)", exact: true })
      .getByRole("button", { name: "Card: Silver Myr", exact: true })
      .filter({ hasNotText: "Tapped" })
      .first();
    await untapped.click();
    await alice
      .getByRole("button", { name: "{T}: Add {U}.", exact: true })
      .click();
    const spread = creatures.getByRole("group", {
      name: "Silver Myr spread (2)",
      exact: true,
    });
    await expect(
      spread.getByRole("button", { name: "Card: Silver Myr", exact: true }),
    ).toHaveCount(2);
    await expect(spread.locator(".is-tapped")).toHaveCount(1);
    await spread
      .getByRole("button", { name: "Card: Silver Myr", exact: true })
      .filter({ hasNotText: "Tapped" })
      .click();
    await alice
      .getByRole("button", { name: "{T}: Add {U}.", exact: true })
      .click();
    await expect(spread.locator(".is-tapped")).toHaveCount(2);
    await expect(
      alice.getByLabel("Alice mana").getByLabel("4 U", { exact: true }),
    ).toBeVisible();
    await alice.keyboard.press("Escape");
    await expect(spread).toHaveCount(0);
    await expect(
      creatures.getByRole("button", {
        name: "Expand Silver Myr pile (3)",
        exact: true,
      }),
    ).toContainText("Tapped");
    const hidden = alice
      .getByLabel("Creatures — Bob")
      .getByRole("button", { name: "Card: Face-down creature", exact: true });
    await hidden.hover();
    await alice.keyboard.down("Alt");
    await expect(alice.getByLabel("Enlarged card")).toContainText(
      "Face-down creature",
    );
    await expect(alice.getByLabel("Enlarged card").locator("img")).toHaveCount(
      0,
    );
    await alice.keyboard.up("Alt");
    const state = (await snapshot(alice)).match!;
    expect(
      Object.values(state.objects).find((o) => o.hidden)?.artwork,
    ).toBeUndefined();
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});

test("drag casting selects a Stack target by click and preserves payment through reload", async ({
  browser,
}) => {
  const {
    pages: [alice, bob],
    contexts,
    invitation,
  } = await startTable(browser);
  try {
    const { targetId } = await seedRulesScenario(invitation.split("/").pop()!);
    await alice.reload();
    await bob.reload();
    await alice
      .getByLabel("Artifacts — Alice")
      .getByRole("button", { name: "Card: Sol Ring", exact: true })
      .click();
    await expect(
      alice.getByRole("dialog", { name: "Card actions" }),
    ).toBeVisible();
    const before = (await snapshot(alice)).match!;
    const counter = Object.values(before.objects).find(
      (object) => object.characteristics.name === "Counterspell",
    )!;
    await act(alice, { type: "cast-spell", objectId: counter.id });
    const procedure = (await snapshot(alice)).match!.rules!.pending!;
    await expect(
      alice.getByRole("dialog", { name: "Card actions" }),
    ).toHaveCount(0);
    await act(alice, { type: "cancel-procedure", procedureId: procedure.id });
    await expect(
      alice.getByRole("dialog", { name: "Card actions" }),
    ).toHaveCount(0);
    await cardAction(alice, "Cast Counterspell");
    const target = alice.locator(`.rules-stack [data-object-id="${targetId}"]`);
    await expect(target).toHaveClass(/legal-target/);
    await target.click();
    await expect(target).toHaveClass(/chosen-card/);
    await expect(
      alice.getByRole("dialog", { name: "Card actions" }),
    ).toHaveCount(0);
    await alice
      .getByRole("button", { name: "Confirm target", exact: true })
      .click();
    const pending = (await snapshot(alice)).match!.rules!.pending!;
    await alice.reload();
    expect((await snapshot(alice)).match!.rules!.pending!.id).toBe(pending.id);
    await alice
      .getByRole("button", { name: "Complete payment", exact: true })
      .click();
    await expect(alice.getByLabel("Stack", { exact: true })).toContainText(
      "Stack (2)",
    );
    await alice
      .getByRole("button", { name: "Pass Priority", exact: true })
      .click();
    await bob
      .getByRole("button", { name: "Pass Priority", exact: true })
      .click();
    await expect(alice.getByTestId("zone-stack-shared")).toContainText(
      "Stack (0)",
    );
    await alice.getByTestId("zone-graveyard-Alice").getByRole("button").click();
    const drawer = alice.getByRole("dialog", { name: "Alice — Graveyard" });
    await expect(drawer).toContainText("Counterspell");
    await expect(drawer.locator('[draggable="true"]')).toHaveCount(0);
    await drawer.getByRole("button", { name: "Close", exact: true }).click();
    await cardAction(alice, "Mind Stone: draw");
    await cardAction(alice, "Sol Ring: add 2 C");
    await alice
      .getByRole("button", { name: "Complete payment", exact: true })
      .click();
    await alice
      .getByLabel("Stack", { exact: true })
      .getByRole("button", { name: "Card: Mind Stone: draw", exact: true })
      .click();
    await expect(
      alice.getByRole("dialog", { name: "Card actions" }),
    ).toContainText("Source: Mind Stone");
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});

test("a crowded pile keeps every member reachable without scrolling the page or changing the Match", async ({
  browser,
}) => {
  const {
    pages: [alice],
    contexts,
    invitation,
  } = await startTable(browser);
  try {
    await seedRulesScenario(
      invitation.split("/").pop()!,
      undefined,
      false,
      "crowded",
    );
    await alice.reload();
    const before = (await snapshot(alice)).match!.revision;
    await alice
      .getByRole("button", {
        name: "Expand Silver Myr pile (104)",
        exact: true,
      })
      .click();
    const cards = alice
      .getByLabel("Creatures — Alice")
      .getByRole("button", { name: "Card: Silver Myr", exact: true });
    await expect(cards).toHaveCount(104);
    await cards.last().scrollIntoViewIfNeeded();
    await cards.last().click();
    await expect(
      alice.getByRole("dialog", { name: "Card actions" }),
    ).toBeVisible();
    expect((await snapshot(alice)).match!.revision).toBe(before);
    expect(
      await alice.evaluate(() => document.documentElement.scrollHeight),
    ).toBeLessThanOrEqual(720);
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});

test("the match layout separates the Hand, hides empty groups, and puts phase below Priority", async ({
  browser,
}) => {
  const {
    pages: [alice],
    contexts,
    invitation,
  } = await startTable(browser);
  try {
    await seedRulesScenario(
      invitation.split("/").pop()!,
      undefined,
      false,
      "presentation",
    );
    await alice.reload();
    await expect(alice.getByTestId("match")).toBeVisible();
    await expect(alice.locator(".match-app > header")).toBeHidden();
    await expect(alice.locator(".group-label")).toHaveCount(0);
    await expect(alice.getByLabel("Planeswalkers — Alice")).toHaveCount(0);
    await expect(alice.getByLabel("Battles — Alice")).toHaveCount(0);
    await expect(
      alice.locator(".hand-dock").getByTestId("zone-hand-Alice"),
    ).toBeVisible();
    for (const kind of ["library", "graveyard", "exile"]) {
      await expect(
        alice.locator(".hand-dock").getByTestId(`zone-${kind}-Alice`),
      ).toBeVisible();
      await expect(
        alice.getByLabel("Bob Battlefield").getByTestId(`zone-${kind}-Bob`),
      ).toBeVisible();
    }
    const pass = await alice
      .getByRole("button", { name: "Pass Priority", exact: true })
      .boundingBox();
    const phase = await alice
      .getByLabel("Turn and phase", { exact: true })
      .boundingBox();
    const dock = await alice.locator(".hand-dock").boundingBox();
    expect(phase!.y).toBeGreaterThan(pass!.y + pass!.height);
    expect(phase!.y + phase!.height).toBeLessThanOrEqual(dock!.y);
    for (const group of await alice.locator(".battlefield-groups").all()) {
      const layout = await group.evaluate((node) => ({
        height: node.clientHeight,
        scroll: node.scrollHeight,
        cardWidth: getComputedStyle(node).getPropertyValue("--card-width"),
        cards: [...node.querySelectorAll(".rules-tile")].map((card) => ({
          name: card.getAttribute("aria-label"),
          width: card.getBoundingClientRect().width,
          height: card.getBoundingClientRect().height,
          y: card.getBoundingClientRect().y,
        })),
        y: node.getBoundingClientRect().y,
      }));
      expect(layout.scroll, JSON.stringify(layout)).toBeLessThanOrEqual(
        layout.height + 1,
      );
      expect(
        await group.evaluate((node) => getComputedStyle(node).overflowY),
      ).toBe("hidden");
    }
    const handLayout = await alice
      .locator(".local-hand .rules-hand-cards")
      .evaluate((node) => ({
        width: node.clientWidth,
        height: node.clientHeight,
        scrollWidth: node.scrollWidth,
        scrollHeight: node.scrollHeight,
      }));
    expect(handLayout.scrollWidth).toBeLessThanOrEqual(handLayout.width + 1);
    expect(handLayout.scrollHeight).toBeLessThanOrEqual(handLayout.height + 1);
    const tapped = alice
      .getByLabel("Creatures — Alice")
      .locator(".rules-tile.is-tapped")
      .first();
    const bounds = await tapped.boundingBox();
    expect(bounds!.width).toBeGreaterThan(bounds!.height);
    const stack = alice.getByLabel("Stack", { exact: true });
    await expect(stack.locator(".stack-entry")).toHaveCount(1);
    await expect(stack.locator(".stack-entry").first()).toContainText(
      "Next to resolve",
    );
    await alice.getByLabel("Room lobby and Decklists", { exact: true }).click();
    await expect(
      alice.getByRole("heading", { name: "Room lobby" }),
    ).toBeVisible();
    await alice.getByLabel("Room lobby and Decklists", { exact: true }).click();
    await expect(
      alice.getByRole("heading", { name: "Room lobby" }),
    ).toBeHidden();
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
