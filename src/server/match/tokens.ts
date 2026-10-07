import type { Characteristics } from "../../shared/card-dsl.js";

// Shared explicit descriptors: each token has its own Match state and no Card
// Instance. Keyed by token registry id (catalog/tokens/).
export const tokenCharacteristics: Record<string, Characteristics> = {
  "phyrexian-germ-0-0": {
    name: "Phyrexian Germ",
    colors: ["B"],
    typeLine: "Token Creature — Phyrexian Germ",
    types: ["Creature"],
    subtypes: ["Phyrexian", "Germ"],
    keywords: [],
    rulesText: "",
    power: "0",
    toughness: "0",
  },
  "thopter-1-1-flying": {
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
  "myr-1-1": {
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
