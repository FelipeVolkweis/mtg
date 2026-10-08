import { cardAction } from "./support/card-actions";
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
    await expect(alice.getByTestId("player-Alice")).toContainText(
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
    await cardAction(alice, "Play Island");
    await expect(
      alice
        .locator('.rules-hand .rules-tile[draggable="true"]')
        .filter({ hasText: "Island" }),
    ).toHaveCount(0);
    await cardAction(alice, "Island: add 1 U");
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
    await alice.getByLabel("Room lobby and Decklists", { exact: true }).click();
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
    await bob.getByLabel("Room lobby and Decklists", { exact: true }).click();
    await bob
      .getByRole("button", { name: "Confirm new Match", exact: true })
      .click();
    await expect
      .poll(async () => (await snapshot(alice)).match!.id)
      .not.toBe(recovered.id);
    expect((await snapshot(alice)).match!.rules).toBeDefined();
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
    await cardAction(alice, "Cast Counterspell");
    await expect(
      alice.getByRole("heading", { name: "Choose target", exact: true }),
    ).toBeVisible();
    const pendingId = (await snapshot(alice)).match!.rules!.prompt!.procedureId;
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
    await cardAction(alice, "Mind Stone: draw");
    await expect(
      alice.getByRole("heading", { name: "Pay costs", exact: true }),
    ).toBeVisible();
    const activation = (await snapshot(alice)).match!.rules!.prompt!
      .procedureId;
    await alice.reload();
    expect((await snapshot(alice)).match!.rules!.prompt!.procedureId).toBe(
      activation,
    );
    await cardAction(alice, "Sol Ring: add 2 C");
    await alice
      .getByRole("button", { name: "Complete payment", exact: true })
      .click();
    await expect(
      alice.locator(".local-area .battlefield-groups"),
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
      await cardAction(alice, `Cast ${name}`);
      if (name === "Pull from Tomorrow") {
        await alice.getByLabel("X", { exact: true }).fill("2");
        const variableId = (await snapshot(alice)).match!.rules!.prompt!
          .procedureId;
        await alice
          .getByRole("button", { name: "Confirm X", exact: true })
          .click();
        await alice.reload();
        const payment = (await snapshot(alice)).match!.rules!.prompt!;
        expect(payment.procedureId).not.toBe(variableId);
        expect(payment.lockedCost!).toMatchObject({ U: 2, generic: 2 });
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
      const pendingId = suspended.rules!.prompt!.procedureId;
      await alice.reload();
      const restored = (await snapshot(alice)).match!;
      expect(restored.rules!.prompt!.procedureId).toBe(pendingId);
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
      "2/2",
    );
    await cardAction(alice, "Cast Sol Ring");
    await expect(
      alice.getByRole("heading", { name: "Order simultaneous triggers" }),
    ).toBeVisible();
    const id = (await snapshot(alice)).match!.rules!.prompt!.procedureId;
    await alice.reload();
    expect((await snapshot(alice)).match!.rules!.prompt!.procedureId).toBe(id);
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
    await cardAction(alice, "Cast Mazemind Tome");
    await alice
      .getByRole("button", { name: "Pass Priority", exact: true })
      .click();
    await bob
      .getByRole("button", { name: "Pass Priority", exact: true })
      .click();
    await cardAction(alice, "Mazemind Tome: scry");
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
    const before = (await snapshot(alice)).match!.rules!.prompt!;
    const inspected = before.options.bottom.objectIds[0];
    expect((await snapshot(bob)).match!.objects[inspected]).toBeUndefined();
    await expect(
      bob.getByRole("region", { name: "Pending rules choice" }),
    ).toHaveCount(0);
    await alice.reload();
    expect((await snapshot(alice)).match!.rules!.prompt!.procedureId).toBe(
      before.procedureId,
    );
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
    await cardAction(alice, "Cast Nettlecyst");
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
    await expect(battlefield).toContainText("3/3");
    await cardAction(alice, "Nettlecyst: equip");
    await expect(
      alice.getByRole("heading", { name: "Choose target", exact: true }),
    ).toBeVisible();
    const pending = (await snapshot(alice)).match!.rules!.prompt!;
    expect(pending.targets[0].legalIds).toHaveLength(1);
    await alice
      .getByLabel("Legal target")
      .selectOption(pending.targets[0].legalIds[0]);
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
    await cardAction(alice, "Cultivator's Caravan: crew");
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
      .getByLabel("Creatures — Alice")
      .getByRole("button", { name: "Card: Cultivator's Caravan", exact: true })
      .click();
    await alice
      .getByRole("button", { name: "Player: Bob", exact: true })
      .click();
    await expect(alice.locator(".combat-lines line")).toHaveCount(1);
    await alice
      .getByRole("button", { name: "Confirm attackers", exact: true })
      .click();
    await expect(
      alice.getByRole("heading", { name: "Pay attack costs", exact: true }),
    ).toBeVisible();
    await cardAction(alice, "Sol Ring: add 2 C");
    await expect(
      alice.getByLabel("Alice mana").getByLabel("2 C", { exact: true }),
    ).toBeVisible();
    await alice.reload();
    await alice
      .getByRole("button", { name: "Complete payment", exact: true })
      .click();
    await expect(bob.getByLabel("Combat state")).toContainText(
      "Cultivator's Caravan attacks Bob",
    );
    await pass();
    const creatures = bob.getByLabel("Creatures — Bob");
    await creatures
      .getByRole("button", { name: "Expand Silver Myr pile (2)", exact: true })
      .click();
    const blocks = creatures.getByRole("button", {
      name: "Card: Silver Myr",
      exact: true,
    });
    await expect(blocks).toHaveCount(2);
    for (const block of await blocks.all()) {
      await block.click();
      await bob
        .getByLabel("Creatures — Alice")
        .getByRole("button", {
          name: "Card: Cultivator's Caravan",
          exact: true,
        })
        .click();
    }
    await expect(bob.locator(".combat-lines line")).toHaveCount(3);
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
    await expect(
      bob
        .getByTestId("zone-graveyard-Bob")
        .getByRole("button", { name: "Bob Graveyard (2)", exact: true }),
    ).toBeVisible();
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
      alice
        .locator('.rules-hand .rules-tile[draggable="true"]')
        .filter({ hasText: "Mind Stone" }),
    ).toHaveCount(0);
    await cardAction(alice, "Cast Shimmer Myr");
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
    await cardAction(alice, "Cast Mind Stone");
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
    await cardAction(bob, "Mind Stone: draw");
    await pass();
    await pass(alice, bob);
    await expect(
      alice.getByRole("button", { name: "Decline payment", exact: true }),
    ).toBeVisible();
    await expect(
      bob.getByRole("button", { name: "Decline payment", exact: true }),
    ).toHaveCount(0);
    const pending = (await snapshot(alice)).match!.rules!.prompt!;
    await alice.reload();
    await expect(
      alice.getByRole("button", { name: "Pay mana", exact: true }),
    ).toBeVisible();
    expect((await snapshot(alice)).match!.rules!.prompt!.procedureId).toBe(
      pending.procedureId,
    );
    const before = (await snapshot(alice)).match!.zones.find(
      (z) => z.kind === "hand" && z.name === "Alice's Hand",
    )!.count;
    await cardAction(alice, "Sol Ring: add 2 C");
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
    await expect(
      alice.getByRole("heading", { name: "Declare attackers", exact: true }),
    ).toBeVisible();
    await alice
      .getByLabel("Creatures — Alice")
      .getByRole("button", { name: "Card: Silver Myr", exact: true })
      .click();
    await alice
      .getByRole("button", { name: "Player: Bob", exact: true })
      .click();
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
    const pending = (await snapshot(alice)).match!.rules!.prompt!;
    await alice.reload();
    await expect(
      selection.getByLabel("Mind Stone", { exact: true }),
    ).toBeVisible();
    expect((await snapshot(alice)).match!.rules!.prompt!.procedureId).toBe(
      pending.procedureId,
    );
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

test("solo full mono-U practice resumes, delegates opponent choices and replaces only with human consent", async ({
  browser,
}) => {
  const { readFile } = await import("node:fs/promises");
  const {
    pages: [alice, spectator],
    contexts,
  } = await table(browser);
  try {
    const deck = (await readFile("sample-decklists/mono-u.md", "utf8")).replace(
      "34 Island",
      "34 Island (TST) 1",
    );
    await saveDeck(alice, "Full mono-U", deck);
    await alice
      .getByLabel("Commander", { exact: true })
      .selectOption({ label: "Sai, Master Thopterist" });
    await alice
      .getByRole("button", { name: "Mark ready", exact: true })
      .click();
    await alice
      .getByRole("button", { name: "Start solo practice", exact: true })
      .click();
    await expect(
      alice.getByRole("heading", { name: "Commander Match" }),
    ).toBeVisible();
    await alice.getByRole("button", { name: "Keep Hand", exact: true }).click();
    await expect(
      alice.getByRole("button", { name: "Pass Priority", exact: true }),
    ).toBeVisible();
    const before = (await snapshot(alice)).match!;
    expect(before.players).toHaveLength(2);
    expect((await snapshot(alice)).participants).toHaveLength(2);
    expect(before.outcome).toBe("ongoing");
    const hidden = (await snapshot(spectator)).match!;
    expect(hidden.actions).toEqual([]);
    expect(
      hidden.zones.filter((z) => z.kind === "hand").every((z) => !z.objectIds),
    ).toBe(true);
    await alice.reload();
    expect((await snapshot(alice)).match).toEqual(before);
    await alice
      .getByRole("button", { name: "Pass Priority", exact: true })
      .click();
    await expect
      .poll(async () => (await snapshot(alice)).match!.turn.step)
      .toBe("draw");
    await alice.getByLabel("Room lobby and Decklists", { exact: true }).click();
    await alice
      .getByRole("button", { name: "Start solo practice", exact: true })
      .click();
    expect((await snapshot(alice)).match!.id).toBe(before.id);
    await alice
      .getByRole("button", { name: "Confirm new Match", exact: true })
      .click();
    await expect
      .poll(async () => (await snapshot(alice)).match!.id)
      .not.toBe(before.id);
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});

test("a spell being cast shows on the Stack for both players and its locked payment can only be completed or reversed", async ({
  browser,
}) => {
  const {
    pages: [alice, bob],
    contexts,
    invitation,
  } = await preparedRulesTable(browser);
  try {
    await seedRulesScenario(invitation.split("/").pop()!, "Kappa Cannoneer");
    await alice.reload();
    await bob.reload();
    await cardAction(alice, "Cast Kappa Cannoneer");
    for (const page of [alice, bob])
      await expect(page.getByTestId("zone-stack-shared")).toContainText(
        "Being cast",
      );
    const prompt = alice.getByRole("region", { name: "Pending rules choice" });
    await expect(
      prompt.getByRole("heading", { name: "Pay costs" }),
    ).toBeVisible();
    // The total cost is locked: no abort, only reversal (RE §16).
    await expect(
      alice.getByRole("button", { name: "Cancel procedure", exact: true }),
    ).toHaveCount(0);
    await expect(
      bob.getByRole("region", { name: "Pending rules choice" }),
    ).toHaveCount(0);
    await alice
      .getByRole("button", { name: "Can't pay — reverse", exact: true })
      .click();
    for (const page of [alice, bob])
      await expect(page.getByTestId("zone-stack-shared")).not.toContainText(
        "Kappa Cannoneer",
      );
    await expect(
      alice
        .locator(".rules-hand")
        .getByRole("button", { name: "Card: Kappa Cannoneer", exact: true }),
    ).toHaveCount(1);
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});

test("improvise choices survive reload and share the locked payment controls", async ({
  browser,
}) => {
  const {
    pages: [alice, bob],
    contexts,
    invitation,
  } = await preparedRulesTable(browser);
  try {
    await seedRulesScenario(invitation.split("/").pop()!, "Kappa Cannoneer");
    await alice.reload();
    await bob.reload();
    await cardAction(alice, "Cast Kappa Cannoneer");
    await expect(
      alice.getByRole("group", { name: /Improvise: tap artifacts/ }),
    ).toBeVisible();
    const pending = (await snapshot(alice)).match!.rules!.prompt!;
    await alice.reload();
    expect((await snapshot(alice)).match!.rules!.prompt!.procedureId).toBe(
      pending.procedureId,
    );
    const group = alice.getByRole("group", {
      name: /Improvise: tap artifacts/,
    });
    await group.getByLabel("Mind Stone", { exact: true }).check();
    await group.getByLabel("Sol Ring", { exact: true }).check();
    await alice
      .getByRole("button", { name: "Complete payment", exact: true })
      .click();
    await expect(group).toHaveCount(0);
    const match = (await snapshot(alice)).match!;
    expect(match.rules!.prompt).toBeUndefined();
    expect(match.zones.find((z) => z.kind === "stack")!.count).toBe(1);
    const artifacts = Object.values(match.objects).filter(
      (o) =>
        ["Mind Stone", "Sol Ring"].includes(o.characteristics.name) &&
        o.zoneId === match.zones.find((z) => z.kind === "battlefield")!.id,
    );
    expect(artifacts.every((o) => o.status.tapped)).toBe(true);
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
