import type {
  CardDefinition,
  Catalog,
  Participant,
} from "../../shared/model.js";
import type { Effect } from "../../shared/rules-v2.js";
import {
  activationZone,
  costModifiers,
  costsOf,
  effectsOf,
  enchantFilter,
  hasImprovise,
  ownKeyword,
  triggerPattern,
} from "../rules/abilities.js";
import { conjuncts } from "../rules/support.js";
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
        const name = keyword.toLowerCase();
        const effects = flatten(effectsOf(ability));
        const costs = costsOf(ability);
        if (name === "cycling")
          return (
            activationZone(ability) === "hand" &&
            costs.some((cost) => cost.kind === "discard-source") &&
            costs.some((cost) => cost.kind === "mana") &&
            effects.some(
              (effect) => effect.kind === "draw" && effect.count === 1,
            )
          );
        if (name === "affinity")
          return costModifiers([ability]).some((modifier) => {
            const amount = modifier.amount;
            if (
              modifier.use !== "cast" ||
              modifier.scope !== "source" ||
              typeof amount !== "object" ||
              !("count" in amount) ||
              typeof amount.count !== "object" ||
              !("all" in amount.count)
            )
              return false;
            const fields = conjuncts(amount.count.all);
            return (
              fields.some((f) => f.zone === "battlefield") &&
              fields.some((f) => f.controller === "you") &&
              fields.some((f) => !!f.type?.length || !!f.subtype?.length)
            );
          });
        if (name === "improvise") return hasImprovise([ability]);
        if (name === "ward") {
          const trigger = triggerPattern(ability);
          return (
            ability.kind === "triggered" &&
            trigger?.event === "target" &&
            trigger.player === "opponent" &&
            conjuncts(trigger.filter ?? {}).some((f) => f.is === "source") &&
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
        if (name === "enchant") return !!enchantFilter([ability]);
        if (name === "equip")
          return (
            ability.id === "equip" && effects.some((e) => e.kind === "attach")
          );
        if (name === "crew")
          return (
            costs.some((cost) => cost.kind === "tap-total-power") &&
            effects.some((effect) => effect.kind === "apply-continuous")
          );
        return ownKeyword(ability)?.toLowerCase() === name;
      }),
    ) &&
    card.abilities.every((ability) => supported(effectsOf(ability)))
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
