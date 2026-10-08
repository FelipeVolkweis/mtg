import type {
  Ability,
  Characteristics,
  ManaType,
} from "../../shared/card-dsl.js";

const basicLandColors: Record<string, ManaType> = {
  Plains: "W",
  Island: "U",
  Swamp: "B",
  Mountain: "R",
  Forest: "G",
};

/**
 * The intrinsic mana abilities of a land's basic land types (CR 305.6):
 * "{T}: Add [mana]" for each type, with ids `intrinsic-<type>`.
 */
export function intrinsicManaAbilities(
  characteristics: Characteristics,
): Ability[] {
  if (!characteristics.types?.includes("Land")) return [];
  return (characteristics.subtypes ?? [])
    .filter((subtype) => basicLandColors[subtype])
    .map((subtype): Ability => ({
      id: `intrinsic-${subtype}`,
      kind: "mana",
      origin: "printed",
      activation: { costs: [{ kind: "tap-source" }] },
      produce: { quantity: 1, colors: [basicLandColors[subtype]] },
    }));
}
