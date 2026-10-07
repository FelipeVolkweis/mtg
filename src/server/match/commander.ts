import type {
  CardDefinition,
  Catalog,
  Participant,
} from "../../shared/model.js";
import { rulesAbilitySchema } from "../../shared/rules.js";
import type { Effect } from "../../shared/rules-v2.js";
import { unsupportedEffect } from "../rules/vm/effects/registry.js";

export function commanderEligible(card: CardDefinition): boolean {
  const face = card.components[0];
  return (
    !!face.types?.includes("Creature") &&
    !!face.supertypes?.includes("Legendary")
  );
}

/** An instruction and every instruction nested in it. */
function flatten(effects: Effect[]): Effect[] {
  return effects.flatMap((effect) => [
    effect,
    ...flatten(
      effect.kind === "if"
        ? [...effect.then, ...(effect.else ?? [])]
        : effect.kind === "may-pay"
          ? [...(effect.then ?? []), ...(effect.else ?? [])]
          : effect.kind === "choose-one"
            ? effect.options.flatMap((option) => option.effects)
            : "effects" in effect
              ? effect.effects
              : [],
    ),
  ]);
}

const supported = (effects: Effect[]) =>
  effects.every((effect) => !unsupportedEffect(effect));

export function automationEligible(card: CardDefinition): boolean {
  return (
    card.automationStatus === "implemented" &&
    card.form === "normal" &&
    card.keywords.every((keyword) =>
      card.abilities.some((ability) => {
        if (!ability.rules) return false;
        const name = keyword.toLowerCase();
        const effects = flatten(ability.rules.effects);
        if (name === "cycling")
          return (
            ability.kind === "activated" &&
            ability.applicableZone === "hand" &&
            ability.rules.costs.some(
              (cost) => cost.kind === "discard-source",
            ) &&
            ability.rules.costs.some((cost) => cost.kind === "mana") &&
            effects.some(
              (effect) => effect.kind === "draw" && effect.count === 1,
            )
          );
        if (name === "affinity")
          return (
            ability.kind === "static" &&
            !!ability.rules.costModifiers?.some(
              (modifier) =>
                modifier.use === "cast" &&
                modifier.scope === "source" &&
                modifier.component === "generic" &&
                typeof modifier.amount === "object" &&
                "count" in modifier.amount &&
                modifier.amount.count.zone === "battlefield" &&
                modifier.amount.count.controller === "you" &&
                (!!modifier.amount.count.types?.length ||
                  !!modifier.amount.count.subtypes?.length),
            )
          );
        if (name === "improvise")
          return ability.kind === "static" && !!ability.rules.improvise;
        if (name === "ward") {
          const trigger = ability.rules.trigger;
          return (
            ability.kind === "triggered" &&
            trigger?.event === "target" &&
            trigger.player === "opponent" &&
            trigger.filter?.self === "only" &&
            effects.some(
              (effect) =>
                effect.kind === "may-pay" &&
                JSON.stringify(effect.player) ===
                  JSON.stringify({ event: "player" }) &&
                !!effect.else?.some(
                  (e) =>
                    e.kind === "counter" &&
                    JSON.stringify(e.objects) ===
                      JSON.stringify({ event: "source" }),
                ),
            )
          );
        }
        if (name === "scry")
          return effects.some(
            (e) => e.kind === "library-sequence" && !e.select?.filter,
          );
        if (name === "imprint")
          return effects.some((e) => e.kind === "exile" && !!e.linkAs);
        if (name === "living weapon")
          return (
            effects.some(
              (e) =>
                e.kind === "create-token" && e.token === "phyrexian-germ-0-0",
            ) &&
            effects.some(
              (e) =>
                e.kind === "attach" &&
                typeof e.to === "object" &&
                "binding" in e.to,
            )
          );
        if (name === "enchant") return !!ability.rules.aura;
        if (name === "equip")
          return (
            ability.id === "equip" && effects.some((e) => e.kind === "attach")
          );
        if (name === "crew")
          return (
            ability.rules.costs.some((cost) => cost.kind === "crew") &&
            effects.some((effect) => effect.kind === "apply-continuous")
          );
        return ability.rules.keyword?.toLowerCase() === name;
      }),
    ) &&
    card.abilities.every(
      (ability) =>
        ability.rules &&
        rulesAbilitySchema.safeParse(ability.rules).success &&
        ((ability.kind === "activated" && supported(ability.rules.effects)) ||
          (ability.kind === "triggered" &&
            !!ability.rules.trigger &&
            !ability.rules.costs.length &&
            supported(ability.rules.effects)) ||
          (ability.kind === "spell" &&
            !ability.rules.costs.length &&
            !ability.rules.manaAbility &&
            !ability.rules.produce &&
            supported(ability.rules.effects)) ||
          (ability.kind === "static" &&
            !ability.rules.costs.length &&
            !ability.rules.target &&
            !ability.rules.effects.length)),
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
