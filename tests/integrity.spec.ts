import { expect, test } from "@playwright/test";
import { act, startTable } from "./support/table";
import { exchange, snapshot } from "./support/peer";

test("chosen faces and captured copy values survive casting, resolution and playing a land", async ({
  browser,
}) => {
  const {
    pages: [alice, bob],
    contexts,
  } = await startTable(browser);
  let match = (await snapshot(alice)).match!;
  const delver = Object.values(match.objects).find(
    (object) => object.characteristics.name === "Delver of Secrets",
  )!;
  const instanceId = delver.cardInstanceIds![0];
  const stack = match.zones.find((zone) => zone.kind === "stack")!;
  const battlefield = match.zones.find((zone) => zone.kind === "battlefield")!;
  match = await act(alice, {
    type: "patch-object",
    objectId: delver.id,
    patch: { currentFace: 1 },
  });
  match = await act(alice, {
    type: "move",
    objectId: delver.id,
    zoneId: stack.id,
    cast: {
      sourceZoneId: delver.zoneId,
      components: [1],
      modes: [],
      additionalCosts: [],
      manaSpent: [],
    },
  });
  let spell = Object.values(match.objects).find((object) =>
    object.cardInstanceIds?.includes(instanceId),
  )!;
  expect(spell).toMatchObject({
    currentFace: 1,
    characteristics: { name: "Insectile Aberration" },
    casting: { components: [1] },
  });
  match = await act(alice, { type: "copy", sourceId: spell.id });
  const copy = Object.values(match.objects).find(
    (object) => object.copiableValuesId,
  )!;
  const copyValuesId = copy.copiableValuesId!;
  match = await act(alice, {
    type: "move",
    objectId: copy.id,
    zoneId: battlefield.id,
  });
  const resolvedCopy = Object.values(match.objects).find(
    (object) => object.copiableValuesId === copyValuesId,
  )!;
  expect(resolvedCopy).toMatchObject({
    zoneId: battlefield.id,
    characteristics: { name: "Insectile Aberration" },
  });
  expect(
    (await snapshot(bob)).match!.copiableValues[copyValuesId],
  ).toMatchObject({ name: "Insectile Aberration" });
  match = await act(alice, {
    type: "move",
    objectId: spell.id,
    zoneId: battlefield.id,
  });
  spell = Object.values(match.objects).find((object) =>
    object.cardInstanceIds?.includes(instanceId),
  )!;
  expect(spell.currentFace).toBe(1);
  const hand = match.zones.find(
    (zone) => zone.kind === "hand" && zone.ownerId === match.players[0].id,
  )!;
  match = await act(alice, {
    type: "move",
    objectId: spell.id,
    zoneId: hand.id,
  });
  spell = Object.values(match.objects).find((object) =>
    object.cardInstanceIds?.includes(instanceId),
  )!;
  match = await act(alice, {
    type: "patch-object",
    objectId: spell.id,
    patch: { currentFace: 1 },
  });
  match = await act(alice, {
    type: "move",
    objectId: spell.id,
    zoneId: battlefield.id,
  });
  expect(
    Object.values(match.objects).find((object) =>
      object.cardInstanceIds?.includes(instanceId),
    ),
  ).toMatchObject({
    currentFace: 1,
    characteristics: { name: "Insectile Aberration" },
  });
  await Promise.all(contexts.map((context) => context.close()));
});

test("meld transport keeps hidden parts private and a controller can reveal an uninspectable object", async ({
  browser,
}) => {
  const {
    pages: [alice, bob],
    contexts,
  } = await startTable(browser);
  let match = (await snapshot(alice)).match!;
  const playerId = match.players[0].id;
  const battlefield = match.zones.find((zone) => zone.kind === "battlefield")!;
  const islands = Object.values(match.objects).filter(
    (object) => object.characteristics.name === "Island",
  );
  const instanceIds = islands.map((object) => object.cardInstanceIds![0]);
  for (const island of islands)
    match = await act(alice, {
      type: "move",
      objectId: island.id,
      zoneId: battlefield.id,
    });
  let parts = instanceIds.map((id) =>
    Object.values(match.objects).find((object) =>
      object.cardInstanceIds?.includes(id),
    )!,
  );
  const shown = {
    name: "Unknown card",
    colors: [],
    typeLine: "Creature",
    rulesText: "",
    power: "2",
    toughness: "2",
  };
  match = await act(alice, {
    type: "patch-object",
    objectId: parts[0].id,
    patch: {
      faceDown: {
        mode: "manual",
        characteristics: shown,
        inspectableBy: [playerId],
        turnUpProcedure: "Reveal manually",
      },
    },
  });
  match = await act(alice, {
    type: "meld",
    objectIds: parts.map((object) => object.id),
    characteristics: { ...shown, name: "Melded form" },
  });
  const meld = Object.values(match.objects).find(
    (object) => object.characteristics.name === "Melded form",
  )!;
  const opponent = (await snapshot(bob)).match!;
  expect(opponent.objects[meld.id]).not.toHaveProperty("meldParts");
  expect(opponent.instances).not.toHaveProperty(instanceIds[0]);
  expect(opponent.objects[meld.id].cardInstanceIds).not.toContain(
    instanceIds[0],
  );
  match = await act(alice, { type: "unmeld", objectId: meld.id });
  let secret = Object.values(match.objects).find((object) =>
    object.cardInstanceIds?.includes(instanceIds[0]),
  )!;
  expect((await snapshot(bob)).match!.objects[secret.id]).toMatchObject({
    hidden: true,
    characteristics: { name: "Unknown card" },
  });
  match = await act(alice, {
    type: "patch-object",
    objectId: secret.id,
    patch: {
      faceDown: {
        mode: "manual",
        characteristics: shown,
        inspectableBy: [],
        turnUpProcedure: "Reveal manually",
      },
    },
  });
  await expect(
    alice
      .getByTestId("battlefield")
      .getByRole("button", { name: "Unknown card", exact: true }),
  ).toBeVisible();
  await alice
    .getByTestId("battlefield")
    .getByRole("button", { name: "Unknown card", exact: true })
    .click();
  await alice
    .getByText("Faces, choices and relationships", { exact: true })
    .click();
  await alice
    .getByRole("button", { name: "Turn face up", exact: true })
    .click();
  await expect
    .poll(async () => (await snapshot(bob)).match!.objects[secret.id].hidden)
    .toBe(false);
  await Promise.all(contexts.map((context) => context.close()));
});

test("repeated authentication on one socket cannot leave a disconnected guest connected", async ({
  browser,
}) => {
  const {
    pages: [alice, bob],
    contexts,
  } = await startTable(browser);
  await bob.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const invite = location.pathname.split("/").pop()!;
        const credential = localStorage.getItem(`mtg:${invite}`);
        const ws = new WebSocket(`ws://${location.host}/ws`);
        const timeout = setTimeout(() => {
          ws.close();
          reject(new Error("Authentication timeout"));
        }, 10000);
        let quiet: ReturnType<typeof setTimeout>;
        ws.onopen = () => {
          for (let i = 0; i < 20; i++)
            ws.send(
              JSON.stringify({
                event: "authenticate",
                data: { invite, credential },
              }),
            );
        };
        ws.onmessage = () => {
          clearTimeout(quiet);
          quiet = setTimeout(() => {
            clearTimeout(timeout);
            ws.close();
            resolve();
          }, 200);
        };
      }),
  );
  await bob.goto("about:blank");
  const room = alice.getByText("Room lobby and Decklists", { exact: true });
  await room.click();
  await expect(
    alice.getByTestId("participants").locator("li").filter({ hasText: "Bob" }),
  ).toContainText("Disconnected");
  await Promise.all(contexts.map((context) => context.close()));
});
