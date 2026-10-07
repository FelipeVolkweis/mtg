import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Catalog, Deck, DeckInput, DeckView } from "../../shared/model.js";
import { CatalogService } from "../catalog/catalog.service.js";
import { readCatalog } from "../catalog/catalog-files.js";
import { Database } from "../storage/database.js";
import { commanderEligible, deckIssues } from "./format-rules.js";

export class DeckError extends Error {}
const maxDecks = 100;

/** Each User's private Deck Catalog. */
@Injectable()
export class DeckService {
  constructor(
    @Inject(Database) private readonly database: Database,
    @Inject(CatalogService) private readonly catalog: CatalogService,
  ) {}

  async list(userId: string): Promise<DeckView[]> {
    const result = await this.database.pool.query<{ document: Deck }>(
      "SELECT document FROM decks WHERE user_id = $1 ORDER BY updated_at DESC",
      [userId],
    );
    const catalog = await readCatalog();
    return result.rows.map((row) => this.view(row.document, catalog));
  }
  async get(userId: string, id: string): Promise<Deck> {
    const result = await this.database.pool.query<{ document: Deck }>(
      "SELECT document FROM decks WHERE user_id = $1 AND id = $2",
      [userId, id],
    );
    if (!result.rows[0]) throw new DeckError("Decklist not found.");
    return result.rows[0].document;
  }
  async save(userId: string, input: DeckInput, id?: string): Promise<DeckView> {
    const catalog = await readCatalog();
    const entries = this.catalog.resolveDecklist(input.text, catalog);
    return this.database.transaction(async (client) => {
      // Serialize a User's saves so the Deck limit holds.
      await client.query("SELECT 1 FROM users WHERE id = $1 FOR UPDATE", [
        userId,
      ]);
      const existing = id
        ? (
            await client.query<{ document: Deck }>(
              "SELECT document FROM decks WHERE user_id = $1 AND id = $2",
              [userId, id],
            )
          ).rows[0]?.document
        : undefined;
      if (id && !existing) throw new DeckError("Decklist not found.");
      if (!existing) {
        const count = await client.query<{ count: string }>(
          "SELECT count(*) FROM decks WHERE user_id = $1",
          [userId],
        );
        if (Number(count.rows[0].count) >= maxDecks)
          throw new DeckError(`You already have ${maxDecks} Decklists.`);
      }
      const commanderId =
        input.commanderId === undefined
          ? existing?.commanderId
          : (input.commanderId ?? undefined);
      const deck: Deck = {
        id: existing?.id ?? randomUUID(),
        name: input.name,
        format: input.format,
        text: input.text,
        entries,
        commanderId:
          input.format === "commander" &&
          entries.some((entry) => entry.definitionId === commanderId)
            ? commanderId
            : undefined,
        updatedAt: Date.now(),
      };
      await client.query(
        `INSERT INTO decks (id, user_id, document, updated_at) VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET document = EXCLUDED.document, updated_at = EXCLUDED.updated_at`,
        [deck.id, userId, JSON.stringify(deck), new Date(deck.updatedAt)],
      );
      return this.view(deck, catalog);
    });
  }
  async delete(userId: string, id: string) {
    const result = await this.database.pool.query(
      "DELETE FROM decks WHERE user_id = $1 AND id = $2",
      [userId, id],
    );
    if (!result.rowCount) throw new DeckError("Decklist not found.");
  }

  view(deck: Deck, catalog: Catalog): DeckView {
    return {
      ...deck,
      issues: deckIssues(deck, catalog),
      commanderOptions:
        deck.format === "commander"
          ? deck.entries
              .map((entry) => catalog.definitions[entry.definitionId])
              .filter((card) => card && commanderEligible(card))
              .map((card) => ({
                definitionId: card.id,
                name: card.canonicalName,
              }))
          : [],
    };
  }
}
