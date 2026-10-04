import { expect, test } from "@playwright/test";
import { table, saveDeck } from "./support/table";
import { snapshot, exchange } from "./support/peer";

test("two players configure Commander, keep private opening Hands, pass Priority, and play selected mana sources", async ({
  browser,
}) => {
  const {
    pages: [alice, bob],
    contexts,
  } = await table(browser);
  try {
    for (const page of [alice, bob]) {
      await saveDeck(
        page,
        "Supported Commander",
        "99 Island (TST) 1\n1 Rules Commander",
      );
      await page.getByLabel("Match format").selectOption("commander");
      await page
        .getByLabel("Commander", { exact: true })
        .selectOption({ label: "Rules Commander" });
      await page
        .getByRole("button", { name: "Mark ready", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Not ready", exact: true }),
      ).toBeVisible();
    }
    const initial = await snapshot(alice);
    await alice
      .getByLabel("Starting player")
      .selectOption(initial.participantId);
    await alice
      .getByRole("button", { name: "Start Match", exact: true })
      .click();
    await expect(
      alice.getByRole("heading", { name: "Commander Match" }),
    ).toBeVisible();
    await expect(alice.getByTestId("match-players")).toContainText(
      "Alice: 40 life",
    );
    await expect(alice.getByTestId("zone-hand-Alice")).toContainText("Island");
    await expect(bob.getByTestId("zone-hand-Alice")).not.toContainText(
      "Island",
    );
    await alice.getByRole("button", { name: "Keep Hand", exact: true }).click();
    await expect(bob.getByTestId("match-revision")).toContainText("Revision 1");
    await bob.getByRole("button", { name: "Keep Hand", exact: true }).click();
    for (let step = 0; step < 2; step++) {
      await alice
        .getByRole("button", { name: "Pass Priority", exact: true })
        .click();
      await expect(
        alice.getByRole("button", { name: "Pass Priority", exact: true }),
      ).toHaveCount(0);
      await bob
        .getByRole("button", { name: "Pass Priority", exact: true })
        .click();
    }
    await alice
      .getByRole("button", { name: "Play Island", exact: true })
      .first()
      .click();
    await expect(
      alice.getByRole("button", { name: "Play Island", exact: true }),
    ).toHaveCount(0);
    await alice
      .getByRole("button", { name: "Island: add 1 U", exact: true })
      .click();
    await expect(alice.getByTestId("zone-battlefield-shared")).toContainText(
      "Tapped",
    );
    const before = (await snapshot(alice)).match!;
    const stale = await exchange(alice, {
      type: "match-action",
      matchId: before.id,
      revision: before.revision - 1,
      action: { type: "pass-priority" },
    });
    expect(stale.event).toBe("rejected");
    await alice.reload();
    await expect(alice.getByTestId("zone-battlefield-shared")).toContainText(
      "Tapped",
    );
    const recovered = (await snapshot(alice)).match!;
    expect(recovered.revision).toBe(before.revision);
    expect(recovered.rules!.mana[recovered.players[0].id].U).toBe(1);
    await alice.getByText("Room lobby and Decklists", { exact: true }).click();
    await alice
      .getByRole("button", { name: "Request new Match", exact: true })
      .click();
    await expect(
      alice.getByText("New Match requested", { exact: true }),
    ).toBeVisible();
    await alice
      .getByRole("button", { name: "Confirm new Match", exact: true })
      .click();
    expect((await snapshot(alice)).match!.id).toBe(recovered.id);
    await bob.getByText("Room lobby and Decklists", { exact: true }).click();
    await bob
      .getByRole("button", { name: "Confirm new Match", exact: true })
      .click();
    await expect
      .poll(async () => (await snapshot(alice)).match!.id)
      .not.toBe(recovered.id);
    expect((await snapshot(alice)).match!.mode).toBe("rules");
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

import { seedRulesScenario } from "./support/rules-scenario";

test("target choices and activation payment resume after reload and stale input cannot duplicate costs", async ({
  browser,
}) => {
  const {
    pages: [alice, bob],
    contexts,
    invitation,
  } = await table(browser);
  try {
    for (const page of [alice, bob]) {
      await saveDeck(
        page,
        "Supported Commander",
        "99 Island (TST) 1\n1 Rules Commander",
      );
      await page.getByLabel("Match format").selectOption("commander");
      await page
        .getByLabel("Commander", { exact: true })
        .selectOption({ label: "Rules Commander" });
      await page
        .getByRole("button", { name: "Mark ready", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Not ready", exact: true }),
      ).toBeVisible();
    }
    const initial = await snapshot(alice);
    await alice
      .getByLabel("Starting player")
      .selectOption(initial.participantId);
    await alice
      .getByRole("button", { name: "Start Match", exact: true })
      .click();
    await expect(
      alice.getByRole("heading", { name: "Commander Match" }),
    ).toBeVisible();
    const scenario = await seedRulesScenario(invitation.split("/").pop()!);
    await alice.reload();
    await bob.reload();
    await alice
      .getByRole("button", { name: "Cast Counterspell", exact: true })
      .click();
    await expect(
      alice.getByRole("heading", { name: "Choose target", exact: true }),
    ).toBeVisible();
    const pendingId = (await snapshot(alice)).match!.rules!.pending!.id;
    await alice.reload();
    await expect(
      alice.getByRole("heading", { name: "Choose target", exact: true }),
    ).toBeVisible();
    await expect(
      bob.getByRole("heading", { name: "Choose target", exact: true }),
    ).toHaveCount(0);
    await alice.getByLabel("Legal target").selectOption(scenario.targetId);
    await alice
      .getByRole("button", { name: "Confirm target", exact: true })
      .click();
    await alice
      .getByRole("button", { name: "Complete payment", exact: true })
      .click();
    await alice
      .getByRole("button", { name: "Pass Priority", exact: true })
      .click();
    await bob
      .getByRole("button", { name: "Pass Priority", exact: true })
      .click();
    await expect(alice.getByTestId("zone-stack-shared")).toContainText(
      "Stack (0)",
    );
    await alice
      .getByRole("button", { name: "Mind Stone: draw", exact: true })
      .click();
    await expect(
      alice.getByRole("heading", { name: "Pay costs", exact: true }),
    ).toBeVisible();
    const activation = (await snapshot(alice)).match!.rules!.pending!.id;
    await alice.reload();
    expect((await snapshot(alice)).match!.rules!.pending!.id).toBe(activation);
    await alice
      .getByRole("button", { name: "Sol Ring: add 2 C", exact: true })
      .click();
    await alice
      .getByRole("button", { name: "Complete payment", exact: true })
      .click();
    await expect(
      alice.getByTestId("zone-battlefield-shared"),
    ).not.toContainText("Mind Stone");
    await expect(alice.getByTestId("zone-stack-shared")).toContainText(
      "Mind Stone: draw",
    );
    const current = (await snapshot(alice)).match!;
    const stale = await exchange(alice, {
      type: "match-action",
      matchId: current.id,
      revision: current.revision,
      action: { type: "rules-input", procedureId: pendingId, confirm: true },
    });
    expect(stale.event).toBe("rejected");
    expect((await snapshot(alice)).match!.revision).toBe(current.revision);
    await alice
      .getByRole("button", { name: "Pass Priority", exact: true })
      .click();
    await bob
      .getByRole("button", { name: "Pass Priority", exact: true })
      .click();
    await expect(alice.getByTestId("zone-stack-shared")).toContainText(
      "Stack (0)",
    );
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
