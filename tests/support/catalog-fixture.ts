import { gzipSync } from "node:zlib";

export const fixtureCards = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    oracle_id: "20000000-0000-4000-8000-000000000001",
    name: "Island",
    flavor_name: "Echoing Isle",
    set: "tst",
    collector_number: "1",
    layout: "normal",
    color_identity: [],
    cmc: 0,
    keywords: [],
    colors: [],
    mana_cost: "",
    type_line: "Basic Land — Island",
    oracle_text: "",
    image_uris: { normal: "https://cards.example.test/island-one.svg" },
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    oracle_id: "20000000-0000-4000-8000-000000000001",
    name: "Island",
    set: "tst",
    collector_number: "2",
    layout: "normal",
    color_identity: [],
    cmc: 0,
    keywords: [],
    colors: [],
    mana_cost: "",
    type_line: "Basic Land — Island",
    oracle_text: "",
    image_uris: { normal: "https://cards.example.test/island.svg" },
  },
  {
    id: "10000000-0000-4000-8000-000000000003",
    oracle_id: "20000000-0000-4000-8000-000000000003",
    name: "Delver of Secrets // Insectile Aberration",
    set: "tst",
    collector_number: "3",
    layout: "transform",
    color_identity: ["U"],
    cmc: 1,
    keywords: ["Flying"],
    card_faces: [
      {
        name: "Delver of Secrets",
        mana_cost: "{U}",
        colors: ["U"],
        type_line: "Creature — Human Wizard",
        oracle_text:
          "At the beginning of your upkeep, look at the top card of your library.",
        power: "1",
        toughness: "1",
        image_uris: { normal: "https://cards.example.test/delver-front.svg" },
      },
      {
        name: "Insectile Aberration",
        keywords: ["Flying"],
        colors: ["U"],
        type_line: "Creature — Human Insect",
        oracle_text: "Flying",
        power: "3",
        toughness: "2",
        image_uris: { normal: "https://cards.example.test/delver-back.svg" },
      },
    ],
  },
  {
    id: "10000000-0000-4000-8000-000000000004",
    oracle_id: "20000000-0000-4000-8000-000000000004",
    name: "Mountain",
    set: "tst",
    collector_number: "4",
    layout: "normal",
    color_identity: [],
    cmc: 0,
    keywords: [],
    colors: [],
    mana_cost: "",
    type_line: "Basic Land — Mountain",
    oracle_text: "",
    image_uris: { normal: "https://cards.example.test/mountain.svg" },
  },
  {
    id: "10000000-0000-4000-8000-000000000005",
    oracle_id: "20000000-0000-4000-8000-000000000005",
    name: "Shared Name",
    set: "tst",
    collector_number: "5",
    layout: "normal",
    color_identity: ["B"],
    colors: ["B"],
    mana_cost: "{B}",
    cmc: 1,
    keywords: ["Ward"],
    type_line: "Legendary Creature — Human Wizard",
    oracle_text: "Ward—Blight 2",
    power: "1",
    toughness: "2",
    image_uris: { normal: "https://cards.example.test/shared-one.svg" },
  },
  {
    id: "10000000-0000-4000-8000-000000000006",
    oracle_id: "20000000-0000-4000-8000-000000000006",
    name: "Shared Name",
    set: "tst",
    collector_number: "6",
    layout: "normal",
    color_identity: ["R"],
    colors: ["R"],
    mana_cost: "{R}",
    cmc: 1,
    keywords: [],
    type_line: "Creature — Human Shaman",
    oracle_text: "Haste",
    power: "2",
    toughness: "1",
    image_uris: { normal: "https://cards.example.test/shared-two.svg" },
  },
];

export const directoryCards = [
  ...fixtureCards,
  { name: "Black Lotus", layout: "normal", flavor_name: "Alternate Lotus" },
  {
    name: "Independent Front // Independent Back",
    layout: "modal_dfc",
    card_faces: [{ name: "Independent Front" }, { name: "Independent Back" }],
  },
  {
    name: "Independent Left // Independent Right",
    layout: "split",
    card_faces: [{ name: "Independent Left" }, { name: "Independent Right" }],
  },
];

export function catalogResponse(
  path: string,
  origin: string,
  legacyBulk = false,
) {
  if (path.startsWith("/catalog/card-names"))
    return {
      data: [
        ...directoryCards.map((card) => card.name),
        "Fresh Card",
        "Island // Island",
      ],
    };
  if (path.startsWith("/bulk-data/oracle_cards"))
    return legacyBulk
      ? { download_uri: `${origin}/bulk/oracle.json` }
      : { jsonl_download_uri: `${origin}/bulk/oracle.jsonl.gz` };
  if (path.startsWith("/bulk/oracle.jsonl.gz"))
    return gzipSync(
      directoryCards.map((card) => JSON.stringify(card)).join("\n"),
    );
  if (path.startsWith("/bulk/oracle.json")) return directoryCards;
  if (path.startsWith("/cards/collection"))
    return { data: [{ name: "Fresh Card", layout: "normal" }] };
  return { data: fixtureCards, has_more: false };
}
