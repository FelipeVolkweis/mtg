import { useState } from "react";
import { deckFormatNames, deckFormats } from "../shared/model";
import type { DeckFormat } from "../shared/model";
import type { Decks } from "./api";
import { DeckEditor, deckSize } from "./DeckEditor";

/** The signed-in User's Deck Catalog, independent of any Room. */
export function DeckCatalog({ decks }: { decks: Decks }) {
  const [editingId, setEditingId] = useState<string>();
  const [filter, setFilter] = useState<DeckFormat | "">("");
  const shown = decks.decks.filter((deck) => !filter || deck.format === filter);
  return (
    <section className="lobby deck-catalog">
      <div className="section-heading">
        <div>
          <h1>My decks</h1>
          <p>Build decks once and bring them to any Room.</p>
        </div>
      </div>
      <div className="lobby-grid">
        <section>
          <h2>
            Decklists <small>{decks.decks.length}</small>
          </h2>
          <label>
            Show format
            <select
              value={filter}
              onChange={(event) =>
                setFilter(event.target.value as DeckFormat | "")
              }
            >
              <option value="">All formats</option>
              {deckFormats.map((format) => (
                <option key={format} value={format}>
                  {deckFormatNames[format]}
                </option>
              ))}
            </select>
          </label>
          {shown.length ? (
            <ul data-testid="deck-catalog">
              {shown.map((deck) => (
                <li key={deck.id}>
                  <strong>{deck.name}</strong>
                  <span>
                    {deckFormatNames[deck.format]} · {deckSize(deck)} cards ·{" "}
                    {deck.issues.length ? "Incomplete" : "Legal"}
                  </span>
                  <div className="button-row">
                    <button onClick={() => setEditingId(deck.id)}>Edit</button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete ${deck.name}?`)) {
                          if (editingId === deck.id) setEditingId(undefined);
                          void decks.remove(deck.id);
                        }
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">No decks yet. Create one to get started.</p>
          )}
        </section>
        <section>
          <h2>{editingId ? "Edit Decklist" : "New Decklist"}</h2>
          <DeckEditor
            decks={decks}
            editing={decks.decks.find((deck) => deck.id === editingId)}
            onEdit={setEditingId}
          />
        </section>
      </div>
    </section>
  );
}
