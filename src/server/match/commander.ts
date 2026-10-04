import type {
  CardDefinition,
  Catalog,
  Participant,
} from "../../shared/model.js";
import { rulesAbilitySchema } from "../../shared/rules.js";

export function commanderEligible(card: CardDefinition): boolean {
  const face = card.components[0];
  return (
    !!face.types?.includes("Creature") &&
    !!face.supertypes?.includes("Legendary")
  );
}

export function automationEligible(card: CardDefinition): boolean {
  return (
    card.automationStatus === "implemented" &&
    card.form === "normal" &&
    card.keywords.every(
      (keyword) =>
        keyword.toLowerCase() === "cycling" &&
        card.abilities.some(
          (ability) =>
            ability.keyword?.toLowerCase() === keyword.toLowerCase() &&
            ability.rules,
        ),
    ) &&
    card.abilities.every(
      (ability) =>
        ability.rules &&
        rulesAbilitySchema.safeParse(ability.rules).success &&
        ((ability.kind === "activated" &&
          !ability.rules.effects.some(
            (effect) => effect.kind === "enter-tapped",
          )) ||
          (ability.kind === "spell" &&
            !ability.rules.costs.length &&
            !ability.rules.manaAbility &&
            ability.rules.effects.every(
              (effect) =>
                effect.kind === "counter-target" || effect.kind === "draw",
            )) ||
          (ability.kind === "static" &&
            !ability.rules.costs.length &&
            !ability.rules.target &&
            ability.rules.effects.every(
              (effect) => effect.kind === "enter-tapped",
            ))),
    )
  );
}

export function validateCommanderDeck(
  participant: Participant,
  catalog: Catalog,
) {
  const deck = participant.decklists.find(
    (deck) => deck.id === participant.selectedDecklistId,
  );
  if (!deck) throw new Error("Select a Decklist first.");
  const commander = catalog.definitions[participant.selectedCommanderId ?? ""];
  if (
    !commander ||
    !commanderEligible(commander) ||
    !deck.entries.some(
      (entry) => entry.definitionId === commander.id && entry.quantity === 1,
    )
  )
    throw new Error(
      "Choose a legendary creature from your selected Decklist as commander.",
    );
  if (deck.entries.reduce((sum, entry) => sum + entry.quantity, 0) !== 100)
    throw new Error(
      "Commander Decklists must contain exactly 100 cards, including the commander.",
    );
  const counts = new Map<string, number>();
  const unsupported: string[] = [];
  for (const entry of deck.entries) {
    const card = catalog.definitions[entry.definitionId];
    if (!card) throw new Error("A Decklist card is no longer available.");
    if (
      card.colorIdentity.some(
        (color) => !commander.colorIdentity.includes(color),
      )
    )
      throw new Error(
        `${card.canonicalName} is outside the commander's Color Identity.`,
      );
    const quantity = (counts.get(card.canonicalName) ?? 0) + entry.quantity;
    counts.set(card.canonicalName, quantity);
    if (quantity > 1 && !card.components[0].supertypes?.includes("Basic"))
      throw new Error(`Commander permits only one ${card.canonicalName}.`);
    if (!automationEligible(card)) unsupported.push(card.canonicalName);
  }
  if (unsupported.length)
    throw new Error(
      `Unsupported cards: ${[...new Set(unsupported)].join(", ")}.`,
    );
  return commander;
}
