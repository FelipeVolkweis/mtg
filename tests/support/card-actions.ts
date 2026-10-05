import { expect, type Page } from "@playwright/test";
import { readCatalog } from "../../src/server/catalog/catalog-files";

// Exercise the board gestures, rather than the retired global action list.
export async function cardAction(page: Page, label: string) {
  if (label.startsWith("Cast ") || label.startsWith("Play ")) {
    const name = label.slice(5);
    const card = page
      .locator(".rules-hand")
      .getByRole("button", { name: `Card: ${name}`, exact: true })
      .and(page.locator('[draggable="true"]'));
    await card.first().dragTo(page.locator(".rules-player-area.local-area"));
    return;
  }
  const name = label.split(":")[0];
  const pile = page
    .locator(".local-area .battlefield-groups")
    .getByRole("button", {
      name: new RegExp(
        `^Expand ${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} pile`,
      ),
    });
  if (await pile.count()) await pile.first().click();
  await page
    .locator(".local-area .battlefield-groups")
    .getByRole("button", { name: `Card: ${name}`, exact: true })
    .first()
    .click();
  const menu = page.getByRole("dialog", { name: "Card actions" });
  await expect(menu).toBeVisible();
  const catalog = await readCatalog();
  const identifier = label.slice(name.length + 2);
  const definition = Object.values(catalog.definitions).find(
    (card) => card.canonicalName === name,
  );
  const ability = definition?.abilities.find((ability) =>
    identifier.startsWith("add ")
      ? ability.rules?.manaAbility
      : ability.id === identifier,
  );
  const mana = ability?.rules?.effects.find(
    (effect) => effect.kind === "add-mana",
  );
  const chooseColor =
    mana?.kind === "add-mana" &&
    (mana.colors === "commander-colors" || mana.colors.length > 1);
  const description = ability?.description
    ? `${ability.description}${chooseColor ? ` Choose {${identifier.split(" ").at(-1)}}.` : ""}`
    : label;
  await menu.getByRole("button", { name: description, exact: true }).click();
}
