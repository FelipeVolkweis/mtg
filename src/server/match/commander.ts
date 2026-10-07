import type {
  CardDefinition,
  Catalog,
  Participant,
} from "../../shared/model.js";
import type { Effect } from "../../shared/card-dsl.js";
import {
  activationZone,
  costModifiers,
  costsOf,
  effectsOf,
  enchantFilter,
  hasImprovise,
  ownKeyword,
  triggerSubject,
} from "../rules/abilities.js";
import { conjuncts } from "../rules/support.js";
import { unsupportedEffect } from "../rules/vm/effects/registry.js";
import { commanderEligible, deckIssues } from "../deck/format-rules.js";
import { RuleViolation } from "../rules/rule-violation.js";

export { commanderEligible };

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
          const trigger =
            ability.kind === "triggered" ? ability.trigger : undefined;
          return (
            trigger?.event === "becomes-target" &&
            trigger.by === "opponents" &&
            conjuncts(triggerSubject(trigger.object)).some(
              (f) => f.is === "source",
            ) &&
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
  const deck = participant.deck;
  if (!deck) throw new RuleViolation("Select a Decklist first.");
  if (deck.format !== "commander")
    throw new RuleViolation("Select a Commander Decklist for a Commander Match.");
  const [issue] = deckIssues(deck, catalog);
  if (issue) throw new RuleViolation(issue);
  const unsupported = deck.entries
    .map((entry) => catalog.definitions[entry.definitionId])
    .filter((card) => !automationEligible(card))
    .map((card) => card.canonicalName);
  if (unsupported.length)
    throw new RuleViolation(
      `Unsupported cards: ${[...new Set(unsupported)].join(", ")}.`,
    );
  return catalog.definitions[deck.commanderId!];
}
