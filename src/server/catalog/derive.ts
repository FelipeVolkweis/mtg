import type { CardForm } from "../../shared/card-dsl.js";

// Values derived from a Card Definition's components instead of being stored
// (docs/card-model.md). The importer's rules (catalog.service.ts,
// card-names.ts) define what "derived" must reproduce.

export interface DerivableComponent {
  name: string;
  manaCost?: string;
  supertypes?: string[];
  types?: string[];
  subtypes?: string[];
  keywords?: string[];
  rulesText: string;
}

export interface DerivedFields {
  canonicalName: string;
  manaValue: number;
  keywords: string[];
  oracleText: string;
  typeLines: string[];
}

/** Layouts whose canonical name is the front face's (card-names.ts). */
const frontNamed = new Set<CardForm>([
  "transform",
  "modal_dfc",
  "reversible_card",
]);
/** Layouts whose halves combine into one mana value (CR 709.4: split cards; Rooms are split cards). */
const combinedValue = new Set<CardForm>(["split", "room"]);

/** Mana value of a mana cost (CR 202.3): X is 0, hybrid counts its largest part. */
export function manaValueOf(manaCost?: string): number {
  if (!manaCost) return 0;
  let total = 0;
  for (const [, symbol] of manaCost.matchAll(/\{([^}]+)\}/g)) {
    const parts = symbol.split("/").filter((part) => part !== "P");
    total += Math.max(
      ...parts.map((part) =>
        /^\d+$/.test(part)
          ? Number(part)
          : part === "X" || part === "Y" || part === "Z"
            ? 0
            : 1,
      ),
    );
  }
  return total;
}

/** "Legendary Creature — Human Artificer". */
export function typeLine(component: DerivableComponent): string {
  const left = [
    ...(component.supertypes ?? []),
    ...(component.types ?? []),
  ].join(" ");
  return component.subtypes?.length
    ? `${left} — ${component.subtypes.join(" ")}`
    : left;
}

export function deriveFields(
  form: CardForm,
  components: DerivableComponent[],
): DerivedFields {
  const [front] = components;
  const single = components.length === 1;
  return {
    canonicalName:
      single || frontNamed.has(form)
        ? front.name
        : components.map((c) => c.name).join(" // "),
    manaValue: combinedValue.has(form)
      ? components.reduce((sum, c) => sum + manaValueOf(c.manaCost), 0)
      : manaValueOf(front.manaCost),
    keywords: [...new Set(components.flatMap((c) => c.keywords ?? []))],
    oracleText: single
      ? front.rulesText
      : components.map((c) => c.rulesText).join("\n//\n"),
    typeLines: components.map(typeLine),
  };
}
