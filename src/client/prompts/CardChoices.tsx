import type { MatchView } from "../../shared/model";
import { cardArtwork } from "../rules-presentation";

/** A choice of cards: checkboxes, or one select per position when ordered. */
export function CardChoices({
  match,
  ids,
  count,
  minCount,
  ordered,
  label,
  selected,
  onChange,
}: {
  match: MatchView;
  ids: string[];
  count: number;
  minCount?: number;
  ordered?: boolean;
  label: string;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <fieldset>
      <legend>
        {label} — choose{" "}
        {minCount !== undefined ? `${minCount}–${count}` : count}
      </legend>
      {ordered && minCount === undefined
        ? Array.from({ length: count }, (_, index) => (
            <label key={index}>
              Position {index + 1}
              <select
                required
                value={selected[index] ?? ""}
                onChange={(event) => {
                  const next = [...selected];
                  next[index] = event.target.value;
                  onChange(next);
                }}
              >
                <option value="">Choose card</option>
                {ids.map((id) => (
                  <option key={id} value={id}>
                    {match.objects[id]?.characteristics.name ?? "Card"}
                  </option>
                ))}
              </select>
            </label>
          ))
        : ids.map((id) => (
            <label key={id} data-inspect-id={id}>
              <input
                type="checkbox"
                checked={selected.includes(id)}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...selected, id]
                      : selected.filter((entry) => entry !== id),
                  )
                }
              />
              {match.objects[id] && cardArtwork(match.objects[id]) && (
                <img
                  className="choice-printing"
                  alt=""
                  src={cardArtwork(match.objects[id])}
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                  }}
                />
              )}
              {match.objects[id]?.characteristics.name ?? "Card"}
            </label>
          ))}
      {ordered && minCount !== undefined && selected.length > 0 && (
        <p>
          Selected order:{" "}
          {selected
            .map((id) => match.objects[id]?.characteristics.name ?? "Card")
            .join(" → ")}
        </p>
      )}
    </fieldset>
  );
}
