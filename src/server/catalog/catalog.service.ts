import { Injectable } from "@nestjs/common";
import type {
  Catalog,
  Characteristics,
  DeckEntry,
} from "../../shared/model.js";
import { ScryfallSource, SourceCard } from "./scryfall-source.js";
import {
  publishCatalog,
  readCatalog,
  readIdentityMap,
} from "./catalog-files.js";
import {
  canonicalName as cardName,
  nameEntries,
  nameKey as key,
} from "./card-names.js";

function characteristics(
  face: SourceCard | NonNullable<SourceCard["card_faces"]>[number],
  card: SourceCard,
): Characteristics {
  return {
    name: face.name,
    manaCost: face.mana_cost,
    colors: face.colors ?? [],
    colorIndicator: face.color_indicator,
    typeLine: face.type_line,
    manaValue: face.cmc ?? (face === card ? card.cmc : undefined),
    ...parseTypes(face.type_line),
    keywords: face.keywords ?? (face === card ? card.keywords : []),
    rulesText: face.oracle_text ?? "",
    power: face.power,
    toughness: face.toughness,
    loyalty: face.loyalty,
    defense: face.defense,
  };
}

const supertypes = new Set(["Basic", "Legendary", "Snow", "World", "Ongoing"]);
const types = new Set([
  "Artifact",
  "Battle",
  "Conspiracy",
  "Creature",
  "Dungeon",
  "Enchantment",
  "Instant",
  "Kindred",
  "Land",
  "Phenomenon",
  "Plane",
  "Planeswalker",
  "Scheme",
  "Sorcery",
  "Tribal",
  "Vanguard",
]);
function parseTypes(line: string) {
  const [left, right] = line.split(/\s+[—–-]\s+/, 2);
  const words = left.split(/\s+/).filter(Boolean);
  return {
    supertypes: words.filter((word) => supertypes.has(word)),
    types: words.filter((word) => types.has(word)),
    subtypes: right?.split(/\s+/).filter(Boolean) ?? [],
  };
}

const supportedLayouts = new Set([
  "normal",
  "transform",
  "modal_dfc",
  "split",
  "reversible_card",
  "room",
  "flip",
]);
function importedDefinition(
  card: SourceCard,
  oracleId: string,
  defaultPrintingId: string,
) {
  if (
    !supportedLayouts.has(card.layout) ||
    (card.layout !== "normal" && !card.card_faces?.length) ||
    (card.layout === "normal" && card.card_faces?.length)
  )
    throw new Error(`Unsupported card form: ${card.layout} (${card.name})`);
  const faces = card.card_faces ?? [card];
  if (faces.some((face) => !face.type_line))
    throw new Error(`Missing card type for ${card.id}`);
  return {
    id: oracleId,
    canonicalName: cardName(card),
    defaultPrintingId,
    form: card.layout,
    colorIdentity: card.color_identity,
    components: faces.map((face) => characteristics(face, card)),
    oracleText:
      card.oracle_text ??
      faces.map((face) => face.oracle_text ?? "").join("\n//\n"),
    keywords: card.keywords,
    manaValue: card.cmc,
  };
}

@Injectable()
export class CatalogService {
  async importSet(code: string, source = new ScryfallSource()) {
    const setCode = code.trim().toLowerCase();
    const fetched = await source.fetchSet(setCode);
    const [current, identityMap] = await Promise.all([
      readCatalog(),
      readIdentityMap(),
    ]);
    const catalog = structuredClone(current);
    const seen = new Set<string>();
    const candidates = new Map<string, SourceCard[]>();
    const resolved: { card: SourceCard; oracleId: string }[] = [];
    for (const card of fetched.cards) {
      if (seen.has(card.id)) throw new Error(`Duplicate printing ${card.id}`);
      seen.add(card.id);
      const oracleId = card.oracle_id ?? identityMap[card.id];
      if (!oracleId)
        throw new Error(
          `Missing Oracle identity mapping for ${card.id} (${card.name})`,
        );
      if (
        card.oracle_id &&
        identityMap[card.id] &&
        identityMap[card.id] !== card.oracle_id
      )
        throw new Error(`Conflicting Oracle identity mapping for ${card.id}`);
      if (
        current.printings[card.id] &&
        current.printings[card.id].definitionId !== oracleId
      )
        throw new Error(`Printing ${card.id} changed Oracle identity`);
      resolved.push({ card, oracleId });
      const group = candidates.get(oracleId) ?? [];
      group.push(card);
      candidates.set(oracleId, group);
    }
    for (const entry of fetched.names) catalog.names[key(entry.name)] = entry;
    for (const [oracleId, cards] of candidates) {
      const existing = catalog.definitions[oracleId];
      const chosen =
        cards.find((card) => card.id === existing?.defaultPrintingId) ??
        cards[0];
      const fields = importedDefinition(
        chosen,
        oracleId,
        existing?.defaultPrintingId ?? chosen.id,
      );
      catalog.definitions[oracleId] = {
        ...fields,
        automationStatus: existing?.automationStatus ?? "unimplemented",
        abilities: existing?.abilities ?? [],
      };
    }
    for (const { card, oracleId } of resolved) {
      const artwork = (card.card_faces ?? [card])
        .map((face) => face.image_uris?.normal ?? card.image_uris?.normal)
        .filter((url): url is string => Boolean(url));
      if (!artwork.length) throw new Error(`Missing artwork for ${card.id}`);
      catalog.printings[card.id] = {
        id: card.id,
        definitionId: oracleId,
        setCode,
        collectorNumber: card.collector_number,
        artwork,
      };
      for (const entry of nameEntries(card))
        catalog.names[key(entry.name)] = entry;
    }
    if (!catalog.importedSets.includes(setCode))
      catalog.importedSets.push(setCode);
    if (JSON.stringify(current) !== JSON.stringify(catalog))
      await publishCatalog(catalog);
    return { setCode, printings: fetched.cards.length };
  }

  resolveDecklist(text: string, catalog: Catalog): DeckEntry[] {
    const entries: DeckEntry[] = [];
    const definitions = new Map(
      Object.values(catalog.definitions).map((definition) => [
        definition.id,
        definition,
      ]),
    );
    const lines = text.split(/\r?\n/);
    for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
      const line = lines[lineNumber].trim();
      if (!line || line.startsWith("#")) continue;
      const match =
        /^(\d+)x?\s+(.+?)(?:\s+\(([a-zA-Z0-9]+)\)\s+([^\s]+))?$/.exec(line);
      const quantity = Number(match?.[1]);
      if (
        !match ||
        !Number.isSafeInteger(quantity) ||
        quantity < 1 ||
        quantity > 10000
      )
        throw new Error(
          `Line ${lineNumber + 1}: use "quantity Card Name" or "quantity Card Name (SET) collector".`,
        );
      const matching = [...definitions.values()].filter(
        (definition) => key(definition.canonicalName) === key(match[2]),
      );
      if (!matching.length)
        throw new Error(
          `Line ${lineNumber + 1}: "${match[2]}" is not a canonical card name in the locally imported pool.`,
        );
      const printings = match[3]
        ? Object.values(catalog.printings).filter(
            (p) =>
              matching.some((definition) => definition.id === p.definitionId) &&
              p.setCode === match[3].toLowerCase() &&
              p.collectorNumber === match[4],
          )
        : matching
            .map(
              (definition) => catalog.printings[definition.defaultPrintingId],
            )
            .filter((printing) => Boolean(printing));
      if (!printings.length)
        throw new Error(
          `Line ${lineNumber + 1}: that exact printing is not locally imported.`,
        );
      if (printings.length > 1)
        throw new Error(
          `Line ${lineNumber + 1}: "${match[2]}" is ambiguous; specify (SET) and collector number.`,
        );
      const printing = printings[0];
      const definition = definitions.get(printing.definitionId)!;
      const existing = entries.find(
        (entry) => entry.printingId === printing.id,
      );
      if (existing) existing.quantity += quantity;
      else
        entries.push({
          quantity,
          definitionId: definition.id,
          printingId: printing.id,
        });
    }
    if (!entries.length) throw new Error("Enter at least one card.");
    if (entries.reduce((sum, entry) => sum + entry.quantity, 0) > 10000)
      throw new Error("A Decklist can contain at most 10,000 copies.");
    return entries;
  }
  async sets() {
    const catalog = await readCatalog();
    return {
      sets: catalog.importedSets,
      definitions: Object.keys(catalog.definitions).length,
      printings: Object.keys(catalog.printings).length,
      names: Object.keys(catalog.names).length,
    };
  }
  async cards(query: string, status?: "unimplemented" | "implemented") {
    const catalog = await readCatalog();
    const matchingNames = new Set(
      Object.values(catalog.names)
        .filter((entry) => key(entry.name).includes(key(query)))
        .map((entry) => key(entry.canonicalName ?? entry.name)),
    );
    return Object.values(catalog.definitions)
      .filter(
        (definition) =>
          (key(definition.canonicalName).includes(key(query)) ||
            matchingNames.has(key(definition.canonicalName))) &&
          (!status || definition.automationStatus === status),
      )
      .slice(0, 50)
      .map((definition) => ({
        ...definition,
        printings: Object.values(catalog.printings).filter(
          (printing) => printing.definitionId === definition.id,
        ),
      }));
  }
  async names(query: string) {
    const catalog = await readCatalog();
    return Object.values(catalog.names)
      .filter((entry) => key(entry.name).includes(key(query)))
      .slice(0, 100);
  }
}
