import type { Characteristics } from "../../shared/model.js";

// Shared explicit descriptors: each token has its own Match state and no Card Instance.
export const tokenCharacteristics: Record<"thopter" | "myr", Characteristics> =
  {
    thopter: {
      name: "Thopter",
      colors: [],
      typeLine: "Token Artifact Creature — Thopter",
      types: ["Artifact", "Creature"],
      subtypes: ["Thopter"],
      keywords: ["Flying"],
      rulesText: "Flying",
      power: "1",
      toughness: "1",
    },
    myr: {
      name: "Myr",
      colors: [],
      typeLine: "Token Artifact Creature — Myr",
      types: ["Artifact", "Creature"],
      subtypes: ["Myr"],
      keywords: [],
      rulesText: "",
      power: "1",
      toughness: "1",
    },
  };
