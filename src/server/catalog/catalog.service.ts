import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type {
  Catalog,
  Characteristics,
  DeckEntry,
} from "../../shared/model.js";
import { Database } from "../storage/database.js";
import { ScryfallSource, SourceCard } from "./scryfall-source.js";
import {
  canonicalName as cardName,
  nameEntries,
  nameKey as key,
} from "./card-names.js";

function characteristics(
  face: SourceCard | NonNullable<SourceCard["card_faces"]>[number],
): Characteristics {
  return {
    name: face.name,
    manaCost: face.mana_cost,
    colors: face.colors ?? [],
    colorIndicator: face.color_indicator,
    typeLine: face.type_line,
    rulesText: face.oracle_text ?? "",
    power: face.power,
    toughness: face.toughness,
    loyalty: face.loyalty,
    defense: face.defense,
  };
}

@Injectable()
export class CatalogService {
  constructor(@Inject(Database) private readonly database: Database) {}

  async importSet(code: string, source = new ScryfallSource()) {
    const setCode = code.trim().toLowerCase();
    const fetched = await source.fetchSet(setCode);
    return this.database.transaction(async (client) => {
      const catalog = await this.database.readCatalog(client, true);
      const definitionsByName = new Map(
        Object.values(catalog.definitions).map((definition) => [
          key(definition.canonicalName),
          definition,
        ]),
      );
      for (const entry of fetched.names) catalog.names[key(entry.name)] = entry;
      for (const card of fetched.cards) {
        const canonicalName = cardName(card);
        let definition = definitionsByName.get(key(canonicalName));
        if (!definition) {
          definition = {
            id: randomUUID(),
            canonicalName,
            defaultPrintingId: card.id,
            form: card.layout,
            colorIdentity: card.color_identity,
            components: (card.card_faces ?? [card]).map(characteristics),
          };
          catalog.definitions[definition.id] = definition;
          definitionsByName.set(key(canonicalName), definition);
        } else if (definition.defaultPrintingId === card.id) {
          definition.components = (card.card_faces ?? [card]).map(
            characteristics,
          );
          definition.form = card.layout;
          definition.colorIdentity = card.color_identity;
        }
        catalog.printings[card.id] = {
          id: card.id,
          definitionId: definition.id,
          setCode,
          collectorNumber: card.collector_number,
          artwork: (card.card_faces ?? [card])
            .map(
              (face) =>
                face.image_uris?.normal ?? card.image_uris?.normal ?? "",
            )
            .filter(Boolean),
        };
        for (const entry of nameEntries(card))
          catalog.names[key(entry.name)] = entry;
      }
      if (!catalog.importedSets.includes(setCode))
        catalog.importedSets.push(setCode);
      await client.query("UPDATE catalog SET document = $1 WHERE id = 1", [
        JSON.stringify(catalog),
      ]);
      return { setCode, printings: fetched.cards.length };
    });
  }

  resolveDecklist(text: string, catalog: Catalog): DeckEntry[] {
    const entries: DeckEntry[] = [];
    const definitions = new Map(
      Object.values(catalog.definitions).map((definition) => [
        key(definition.canonicalName),
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
      const definition = definitions.get(key(match[2]));
      if (!definition)
        throw new Error(
          `Line ${lineNumber + 1}: "${match[2]}" is not a canonical card name in the locally imported pool.`,
        );
      const printing = match[3]
        ? Object.values(catalog.printings).find(
            (p) =>
              p.definitionId === definition.id &&
              p.setCode === match[3].toLowerCase() &&
              p.collectorNumber === match[4],
          )
        : catalog.printings[definition.defaultPrintingId];
      if (!printing)
        throw new Error(
          `Line ${lineNumber + 1}: that exact printing is not locally imported.`,
        );
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
    const catalog = await this.database.readCatalog();
    return {
      sets: catalog.importedSets,
      definitions: Object.keys(catalog.definitions).length,
      printings: Object.keys(catalog.printings).length,
      names: Object.keys(catalog.names).length,
    };
  }
  async cards(query: string) {
    const catalog = await this.database.readCatalog();
    return Object.values(catalog.definitions)
      .filter((definition) =>
        key(definition.canonicalName).includes(key(query)),
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
    const catalog = await this.database.readCatalog();
    return Object.values(catalog.names)
      .filter((entry) => key(entry.name).includes(key(query)))
      .slice(0, 100);
  }
}
