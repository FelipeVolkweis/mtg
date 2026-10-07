import { useEffect, useState } from "react";
import type { DeckFormat, DeckView } from "../shared/model";
import { deckFormatNames, deckFormats } from "../shared/model";
import type { Decks } from "./api";

export const deckSize = (deck: DeckView) =>
  deck.entries.reduce((sum, entry) => sum + entry.quantity, 0);

/** Creates or edits one Deck in the User's Deck Catalog. */
export function DeckEditor({
  decks,
  editing,
  onEdit,
  onSaved,
}: {
  decks: Decks;
  editing?: DeckView;
  onEdit: (id?: string) => void;
  onSaved?: (deck: DeckView) => void;
}) {
  const [name, setName] = useState("");
  const [format, setFormat] = useState<DeckFormat>("commander");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setName(editing?.name ?? "");
    setFormat(editing?.format ?? "commander");
    setText(editing?.text ?? "");
  }, [editing?.id]);
  async function save(commanderId?: string | null) {
    setSaving(true);
    const deck = await decks.save(
      { name, format, text, commanderId },
      editing?.id,
    );
    setSaving(false);
    if (!deck) return;
    onEdit(deck.id);
    onSaved?.(deck);
  }
  return (
    <form
      className="deck-editor"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <label>
        Decklist name
        <input
          required
          maxLength={100}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label>
        Format
        <select
          aria-label="Format"
          value={format}
          onChange={(event) => setFormat(event.target.value as DeckFormat)}
        >
          {deckFormats.map((format) => (
            <option key={format} value={format}>
              {deckFormatNames[format]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Decklist text
        <textarea
          required
          rows={10}
          placeholder={"4 Island\n1 Card Name (SET) 123"}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      <p className="hint">
        Use canonical card names from locally imported sets. Specify an exact
        printing with (SET) and collector number.
      </p>
      {editing?.format === "commander" && (
        <label>
          Commander
          <select
            aria-label="Commander"
            disabled={saving}
            value={editing.commanderId ?? ""}
            onChange={(event) => void save(event.target.value || null)}
          >
            <option value="">Choose a commander</option>
            {editing.commanderOptions.map((option) => (
              <option key={option.definitionId} value={option.definitionId}>
                {option.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {editing && editing.issues.length > 0 && (
        <ul className="deck-issues" aria-label="Decklist issues">
          {editing.issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}
      <div className="button-row">
        <button className="primary" disabled={saving}>
          Save Decklist
        </button>
        {editing && (
          <button type="button" onClick={() => onEdit(undefined)}>
            New Decklist
          </button>
        )}
      </div>
    </form>
  );
}
