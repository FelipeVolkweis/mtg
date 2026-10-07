import { changes, type StateBasedRule } from "../types.js";
import { battlefield, hasKeyword, toughness } from "./support.js";

/** CR 704.5f: a creature with toughness 0 or less goes to the Graveyard. */
export const zeroToughness: StateBasedRule = {
  id: "zero-toughness",
  evaluate: (query) =>
    changes(
      battlefield(query)
        .filter((object) => {
          const value = toughness(query, object);
          return value !== undefined && value <= 0n;
        })
        .map((object) => ({ kind: "graveyard", objectId: object.id })),
    ),
};

/** CR 704.5g: a creature with lethal damage marked on it is destroyed. */
export const lethalDamage: StateBasedRule = {
  id: "lethal-damage",
  evaluate: (query) =>
    changes(
      battlefield(query)
        .filter((object) => {
          const value = toughness(query, object);
          return (
            value !== undefined &&
            value > 0n &&
            !hasKeyword(query, object, "Indestructible") &&
            BigInt(query.match.rules!.markedDamage?.[object.id] ?? 0) >= value
          );
        })
        .map((object) => ({ kind: "graveyard", objectId: object.id })),
    ),
};
