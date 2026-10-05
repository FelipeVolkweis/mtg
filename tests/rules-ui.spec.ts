import { expect, test, type Browser } from "@playwright/test";
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

for (const name of ["Thirst for Knowledge", "Pull from Tomorrow"]) {
  test(`${name} restores its private resolution choice after reconnecting`, async ({
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
      await seedRulesScenario(invitation.split("/").pop()!, name);
      await alice.reload();
      await bob.reload();
      await alice
        .getByRole("button", { name: `Cast ${name}`, exact: true })
        .click();
      if (name === "Pull from Tomorrow") {
        await alice.getByLabel("X", { exact: true }).fill("2");
        const variableId = (await snapshot(alice)).match!.rules!.pending!.id;
        await alice
          .getByRole("button", { name: "Confirm X", exact: true })
          .click();
        await alice.reload();
        const payment = (await snapshot(alice)).match!.rules!.pending!;
        expect(payment.id).not.toBe(variableId);
        expect(payment.totalCost).toMatchObject({ U: 2, generic: 2 });
        await alice
          .getByRole("button", { name: "Complete payment", exact: true })
          .click();
      }
      await alice
        .getByRole("button", { name: "Pass Priority", exact: true })
        .click();
      await bob
        .getByRole("button", { name: "Pass Priority", exact: true })
        .click();
      await expect(
        alice.getByRole("heading", { name: "Resolve spell or ability" }),
      ).toBeVisible();
      await expect(
        bob.getByRole("heading", { name: "Resolve spell or ability" }),
      ).toHaveCount(0);
      const suspended = (await snapshot(alice)).match!;
      const player = suspended.players[0].id;
      const library = suspended.zones.find(
        (z) => z.kind === "library" && z.ownerId === player,
      )!.count;
      const pendingId = suspended.rules!.pending!.id;
      await alice.reload();
      const restored = (await snapshot(alice)).match!;
      expect(restored.rules!.pending!.id).toBe(pendingId);
      expect(
        restored.zones.find(
          (z) => z.kind === "library" && z.ownerId === player,
        )!.count,
      ).toBe(library);
      await expect(
        alice.getByRole("button", { name: "Pass Priority", exact: true }),
      ).toHaveCount(0);
      await expect(
        alice.getByRole("button", { name: "Cancel procedure", exact: true }),
      ).toHaveCount(0);
      if (name === "Thirst for Knowledge")
        await alice.getByLabel("Discard option").selectOption("artifact");
      const prompt = alice.getByRole("region", {
        name: "Pending rules choice",
      });
      await prompt.getByRole("checkbox").first().check();
      await alice
        .getByRole("button", { name: "Discard selected cards", exact: true })
        .click();
      await expect(
        alice.getByRole("heading", { name: "Resolve spell or ability" }),
      ).toHaveCount(0);
      const done = (await snapshot(alice)).match!;
      expect(
        done.zones.find((z) => z.kind === "library" && z.ownerId === player)!
          .count,
      ).toBe(library);
      expect(done.zones.find((z) => z.kind === "stack")!.count).toBe(0);
      const stale = await exchange(alice, {
        type: "match-action",
        matchId: done.id,
        revision: done.revision,
        action: { type: "rules-input", procedureId: pendingId, selections: {} },
      });
      expect(stale.event).toBe("rejected");
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
    }
  });
}

test("simultaneous trigger controls restore their order choice after reconnect and show effective stats", async ({
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
    await alice
      .getByLabel("Starting player")
      .selectOption((await snapshot(alice)).participantId);
    await alice
      .getByRole("button", { name: "Start Match", exact: true })
      .click();
    await expect(
      alice.getByRole("heading", { name: "Commander Match" }),
    ).toBeVisible();
    await seedRulesScenario(invitation.split("/").pop()!, "Sol Ring", true);
    await alice.reload();
    await bob.reload();
    await expect(alice.getByTestId("zone-battlefield-shared")).toContainText(
      "Power / Toughness: 2 / 2",
    );
    await alice
      .getByRole("button", { name: "Cast Sol Ring", exact: true })
      .click();
    await expect(
      alice.getByRole("heading", { name: "Order simultaneous triggers" }),
    ).toBeVisible();
    const id = (await snapshot(alice)).match!.rules!.pending!.id;
    await alice.reload();
    expect((await snapshot(alice)).match!.rules!.pending!.id).toBe(id);
    await expect(
      bob.getByRole("heading", { name: "Order simultaneous triggers" }),
    ).toHaveCount(0);
    await alice
      .getByLabel("Stack position 1 (bottom first)")
      .selectOption({ label: "Sai, Master Thopterist: artifact-cast" });
    await alice
      .getByLabel("Stack position 2 (bottom first)")
      .selectOption({ label: "Vedalken Archmage: artifact-cast" });
    await alice.getByRole("button", { name: "Confirm trigger order" }).click();
    await expect(alice.getByTestId("zone-stack-shared")).toContainText(
      "Stack (3)",
    );
    for (let i = 0; i < 2; i++) {
      await alice
        .getByRole("button", { name: "Pass Priority", exact: true })
        .click();
      await bob
        .getByRole("button", { name: "Pass Priority", exact: true })
        .click();
    }
    await expect(alice.getByTestId("zone-battlefield-shared")).toContainText(
      "Thopter",
    );
    await expect(alice.getByTestId("zone-stack-shared")).toContainText(
      "Stack (1)",
    );
  } finally {
    for (const context of contexts) await context.close();
  }
});

test("Tome restores private scry controls after reconnect and permits keeping the inspected card", async ({
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
    await alice
      .getByLabel("Starting player")
      .selectOption((await snapshot(alice)).participantId);
    await alice
      .getByRole("button", { name: "Start Match", exact: true })
      .click();
    await expect(
      alice.getByRole("heading", { name: "Commander Match" }),
    ).toBeVisible();
    await seedRulesScenario(invitation.split("/").pop()!, "Mazemind Tome");
    await alice.reload();
    await bob.reload();
    await alice
      .getByRole("button", { name: "Cast Mazemind Tome", exact: true })
      .click();
    await alice
      .getByRole("button", { name: "Pass Priority", exact: true })
      .click();
    await bob
      .getByRole("button", { name: "Pass Priority", exact: true })
      .click();
    await alice
      .getByRole("button", { name: "Mazemind Tome: scry", exact: true })
      .click();
    await alice
      .getByRole("button", { name: "Pass Priority", exact: true })
      .click();
    await bob
      .getByRole("button", { name: "Pass Priority", exact: true })
      .click();
    const prompt = alice.getByRole("region", { name: "Pending rules choice" });
    await expect(
      prompt.getByRole("checkbox", { name: "Island", exact: true }),
    ).toBeVisible();
    const before = (await snapshot(alice)).match!.rules!.pending!;
    const inspected = before.selectionOptions.bottom.objectIds[0];
    expect((await snapshot(bob)).match!.objects[inspected]).toBeUndefined();
    await expect(
      bob.getByRole("region", { name: "Pending rules choice" }),
    ).toHaveCount(0);
    await alice.reload();
    expect((await snapshot(alice)).match!.rules!.pending!.id).toBe(before.id);
    await prompt
      .getByRole("button", { name: "Confirm choice", exact: true })
      .click();
    await expect(prompt).toHaveCount(0);
    expect((await snapshot(alice)).match!.objects[inspected]).toBeUndefined();
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test("living weapon shows its Attachment and equip offers only controlled creatures", async ({
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
    await alice
      .getByLabel("Starting player")
      .selectOption((await snapshot(alice)).participantId);
    await alice
      .getByRole("button", { name: "Start Match", exact: true })
      .click();
    await expect(
      alice.getByRole("heading", { name: "Commander Match" }),
    ).toBeVisible();
    await seedRulesScenario(invitation.split("/").pop()!, "Nettlecyst");
    await alice.reload();
    await bob.reload();
    await alice
      .getByRole("button", { name: "Cast Nettlecyst", exact: true })
      .click();
    for (let i = 0; i < 2; i++) {
      await alice
        .getByRole("button", { name: "Pass Priority", exact: true })
        .click();
      await bob
        .getByRole("button", { name: "Pass Priority", exact: true })
        .click();
    }
    const battlefield = alice.getByTestId("zone-battlefield-shared");
    await expect(battlefield).toContainText("Attached to Phyrexian Germ");
    await expect(battlefield).toContainText("Power / Toughness: 3 / 3");
    await alice
      .getByRole("button", { name: "Nettlecyst: equip", exact: true })
      .click();
    await expect(
      alice.getByRole("heading", { name: "Choose target", exact: true }),
    ).toBeVisible();
    const pending = (await snapshot(alice)).match!.rules!.pending!;
    expect(pending.legalTargetIds).toHaveLength(1);
    await alice
      .getByLabel("Legal target")
      .selectOption(pending.legalTargetIds[0]);
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
    await expect(bob.getByTestId("zone-battlefield-shared")).toContainText(
      "Attached to Phyrexian Germ",
    );
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

async function preparedRulesTable(browser: Browser) {
  const result = await table(browser);
  const [alice, bob] = result.pages;
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
    await alice
      .getByLabel("Starting player")
      .selectOption((await snapshot(alice)).participantId);
    await alice
      .getByRole("button", { name: "Start Match", exact: true })
      .click();
    await expect(
      alice.getByRole("heading", { name: "Commander Match" }),
    ).toBeVisible();
    return result;
  } catch (error) {
    await Promise.all(result.contexts.map((context) => context.close()));
    throw error;
  }
}

test("players crew, pay attack costs, declare blocks and assign combat damage through shared controls", async ({
  browser,
}) => {
  const {
    pages: [alice, bob],
    contexts,
    invitation,
  } = await preparedRulesTable(browser);
  try {
    await seedRulesScenario(
      invitation.split("/").pop()!,
      undefined,
      false,
      "combat",
    );
    await alice.reload();
    await bob.reload();
    await alice
      .getByRole("button", { name: "Cultivator's Caravan: crew", exact: true })
      .click();
    await alice
      .getByRole("group", { name: /Crew: at least 3/ })
      .getByLabel("Silver Myr", { exact: true })
      .check();
    await alice
      .getByRole("button", { name: "Complete payment", exact: true })
      .click();
    const pass = async () => {
      await alice
        .getByRole("button", { name: "Pass Priority", exact: true })
        .click();
      await bob
        .getByRole("button", { name: "Pass Priority", exact: true })
        .click();
    };
    await pass();
    await expect(alice.getByTestId("zone-battlefield-shared")).toContainText(
      "Artifact Creature — Vehicle",
    );
    await pass();
    await pass();
    await expect(
      alice.getByRole("heading", { name: "Declare attackers", exact: true }),
    ).toBeVisible();
    await expect(
      bob.getByLabel("Attack with Cultivator's Caravan"),
    ).toHaveCount(0);
    await alice
      .getByLabel("Attack with Cultivator's Caravan", { exact: true })
      .selectOption({ label: "Bob" });
    await alice
      .getByRole("button", { name: "Confirm attackers", exact: true })
      .click();
    await expect(
      alice.getByRole("heading", { name: "Pay attack costs", exact: true }),
    ).toBeVisible();
    await alice
      .getByRole("button", { name: "Sol Ring: add 2 C", exact: true })
      .click();
    await alice.reload();
    await alice
      .getByRole("button", { name: "Complete payment", exact: true })
      .click();
    await expect(bob.getByLabel("Combat state")).toContainText(
      "Cultivator's Caravan attacks Bob",
    );
    await pass();
    const blocks = bob.getByLabel("Block with Silver Myr", { exact: true });
    await expect(blocks).toHaveCount(2);
    for (const block of await blocks.all())
      await block.selectOption({ label: "Cultivator's Caravan" });
    await bob
      .getByRole("button", { name: "Confirm blockers", exact: true })
      .click();
    await pass();
    await expect(
      alice.getByRole("heading", { name: "Assign combat damage", exact: true }),
    ).toBeVisible();
    const damage = alice.getByRole("spinbutton", {
      name: /Damage from Cultivator's Caravan to Silver Myr/,
    });
    await damage.nth(0).fill("2");
    await damage.nth(1).fill("3");
    await alice
      .getByRole("button", { name: "Confirm damage", exact: true })
      .click();
    await expect(bob.getByTestId("zone-graveyard-Bob")).toContainText(
      "Graveyard (2)",
    );
    await expect(alice.getByTestId("zone-battlefield-shared")).toContainText(
      "2 damage",
    );
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test("flash and source artifact casting permission use normal browser casting and Priority", async ({
  browser,
}) => {
  const {
    pages: [alice, bob],
    contexts,
    invitation,
  } = await preparedRulesTable(browser);
  try {
    await seedRulesScenario(
      invitation.split("/").pop()!,
      "Shimmer Myr",
      false,
      "flash",
    );
    await alice.reload();
    await bob.reload();
    await expect(
      alice.getByRole("button", { name: "Cast Mind Stone", exact: true }),
    ).toHaveCount(0);
    await alice
      .getByRole("button", { name: "Cast Shimmer Myr", exact: true })
      .click();
    const pass = async () => {
      await alice
        .getByRole("button", { name: "Pass Priority", exact: true })
        .click();
      await bob
        .getByRole("button", { name: "Pass Priority", exact: true })
        .click();
    };
    await pass();
    await expect(alice.getByTestId("zone-battlefield-shared")).toContainText(
      "Shimmer Myr",
    );
    await alice
      .getByRole("button", { name: "Cast Mind Stone", exact: true })
      .click();
    await expect(bob.getByTestId("zone-stack-shared")).toContainText(
      "Mind Stone",
    );
    await pass();
    await expect(alice.getByTestId("zone-stack-shared")).toContainText(
      "Stack (0)",
    );
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test("Mind's Eye restores its private mana choice and uses the shared source and decline controls", async ({
  browser,
}) => {
  const {
    pages: [alice, bob],
    contexts,
    invitation,
  } = await preparedRulesTable(browser);
  try {
    await seedRulesScenario(
      invitation.split("/").pop()!,
      undefined,
      false,
      "draw",
    );
    await alice.reload();
    await bob.reload();
    const pass = async (first = bob, second = alice) => {
      await first
        .getByRole("button", { name: "Pass Priority", exact: true })
        .click();
      await second
        .getByRole("button", { name: "Pass Priority", exact: true })
        .click();
    };
    await bob
      .getByRole("button", { name: "Mind Stone: draw", exact: true })
      .click();
    await pass();
    await pass(alice, bob);
    await expect(
      alice.getByRole("button", { name: "Decline payment", exact: true }),
    ).toBeVisible();
    await expect(
      bob.getByRole("button", { name: "Decline payment", exact: true }),
    ).toHaveCount(0);
    const pending = (await snapshot(alice)).match!.rules!.pending!;
    await alice.reload();
    await expect(
      alice.getByRole("button", { name: "Pay mana", exact: true }),
    ).toBeVisible();
    expect((await snapshot(alice)).match!.rules!.pending!.id).toBe(pending.id);
    const before = (await snapshot(alice)).match!.zones.find(
      (z) => z.kind === "hand" && z.name === "Alice's Hand",
    )!.count;
    await alice
      .getByRole("button", { name: "Sol Ring: add 2 C", exact: true })
      .click();
    await alice.getByRole("button", { name: "Pay mana", exact: true }).click();
    await expect(
      alice.getByRole("button", { name: "Pay mana", exact: true }),
    ).toHaveCount(0);
    await expect
      .poll(
        async () =>
          (await snapshot(alice)).match!.zones.find(
            (z) => z.kind === "hand" && z.name === "Alice's Hand",
          )!.count,
      )
      .toBe(before + 1);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test("Omnitool's private Library choice survives reload and publicly displays only the revealed artifact", async ({
  browser,
}) => {
  const {
    pages: [alice, bob],
    contexts,
    invitation,
  } = await preparedRulesTable(browser);
  try {
    await seedRulesScenario(
      invitation.split("/").pop()!,
      undefined,
      false,
      "inspect",
    );
    await alice.reload();
    await bob.reload();
    const pass = async () => {
      await alice
        .getByRole("button", { name: "Pass Priority", exact: true })
        .click();
      await bob
        .getByRole("button", { name: "Pass Priority", exact: true })
        .click();
    };
    await pass();
    await pass();
    await alice
      .getByLabel("Attack with Silver Myr", { exact: true })
      .selectOption({ label: "Bob" });
    await alice
      .getByRole("button", { name: "Confirm attackers", exact: true })
      .click();
    await pass();
    const selection = alice.getByRole("group", {
      name: /Select a card \(optional\)/,
    });
    await expect(
      selection.getByLabel("Mind Stone", { exact: true }),
    ).toBeVisible();
    await expect(
      bob.getByRole("group", { name: /Select a card \(optional\)/ }),
    ).toHaveCount(0);
    const pending = (await snapshot(alice)).match!.rules!.pending!;
    await alice.reload();
    await expect(
      selection.getByLabel("Mind Stone", { exact: true }),
    ).toBeVisible();
    expect((await snapshot(alice)).match!.rules!.pending!.id).toBe(pending.id);
    await selection.getByLabel("Mind Stone", { exact: true }).check();
    await alice
      .getByRole("button", { name: "Confirm choice", exact: true })
      .click();
    await expect(bob.getByTestId("zone-hand-Alice")).toContainText(
      "Revealed card: Mind Stone",
    );
    await expect(bob.getByTestId("zone-hand-Alice")).not.toContainText(
      "Island",
    );
    await bob.reload();
    await expect(bob.getByTestId("zone-hand-Alice")).toContainText(
      "Revealed card: Mind Stone",
    );
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
