import type { CardDefinition, Catalog, Decklist } from "../../shared/model.js";
import { deckFormatNames } from "../../shared/model.js";

export function commanderEligible(card: CardDefinition): boolean {
  const face = card.components[0];
  return (
    !!face.types?.includes("Creature") &&
    !!face.supertypes?.includes("Legendary")
  );
}

const basic = (card: CardDefinition) =>
  !!card.components[0].supertypes?.includes("Basic");

/**
 * Construction rules a Deck must meet for its format. Card legality lists
 * (bans, restrictions, set rotation) are not modeled.
 */
export function deckIssues(deck: Decklist, catalog: Catalog): string[] {
  const issues: string[] = [];
  const cards: { card: CardDefinition; quantity: number }[] = [];
  for (const entry of deck.entries) {
    const card = catalog.definitions[entry.definitionId];
    if (!card) issues.push("A Decklist card is no longer available.");
    else cards.push({ card, quantity: entry.quantity });
  }
  const size = deck.entries.reduce((sum, entry) => sum + entry.quantity, 0);
  const counts = new Map<string, number>();
  for (const { card, quantity } of cards)
    counts.set(
      card.canonicalName,
      (counts.get(card.canonicalName) ?? 0) + quantity,
    );
  const nonBasic = (name: string) =>
    !basic(cards.find(({ card }) => card.canonicalName === name)!.card);

  if (deck.format === "commander") {
    const commander = catalog.definitions[deck.commanderId ?? ""];
    if (
      !commander ||
      !commanderEligible(commander) ||
      !deck.entries.some(
        (entry) => entry.definitionId === commander.id && entry.quantity === 1,
      )
    )
      issues.push(
        "Choose a legendary creature from your selected Decklist as commander.",
      );
    if (size !== 100)
      issues.push(
        "Commander Decklists must contain exactly 100 cards, including the commander.",
      );
    for (const { card } of commander ? cards : [])
      if (
        card.colorIdentity.some(
          (color) => !commander.colorIdentity.includes(color),
        )
      )
        issues.push(
          `${card.canonicalName} is outside the commander's Color Identity.`,
        );
    for (const [name, quantity] of counts)
      if (quantity > 1 && nonBasic(name))
        issues.push(`Commander permits only one ${name}.`);
  } else {
    const format = deckFormatNames[deck.format];
    if (size < 60)
      issues.push(`${format} Decklists must contain at least 60 cards.`);
    for (const [name, quantity] of counts)
      if (quantity > 4 && nonBasic(name))
        issues.push(`${format} permits at most four copies of ${name}.`);
  }
  return [...new Set(issues)];
}
