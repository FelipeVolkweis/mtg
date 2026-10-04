import { characteristicSchema, type Characteristics } from "../shared/model";

export function CharacteristicFields({ value }: { value?: Characteristics }) {
  const fields = [
    ["name", "Object name"],
    ["manaCost", "Mana cost"],
    ["typeLine", "Types"],
    ["power", "Power"],
    ["toughness", "Toughness"],
    ["loyalty", "Loyalty"],
    ["defense", "Defense"],
  ] as const;
  return (
    <>
      <div className="characteristic-fields">
        {fields.map(([key, label]) => (
          <label key={key}>
            {label}
            <input
              name={key}
              defaultValue={value?.[key] ?? ""}
              required={key === "name"}
              maxLength={key === "name" ? 200 : 100}
            />
          </label>
        ))}
        <label>
          Colors
          <input
            name="colors"
            defaultValue={value?.colors.join(", ") ?? ""}
            placeholder="W, U, B, R, G"
          />
        </label>
        <label>
          Color indicator
          <input
            name="colorIndicator"
            defaultValue={value?.colorIndicator?.join(", ") ?? ""}
          />
        </label>
      </div>
      <label>
        Rules text
        <textarea
          name="rulesText"
          defaultValue={value?.rulesText ?? ""}
          rows={3}
          maxLength={8000}
        />
      </label>
    </>
  );
}
export function readCharacteristics(form: HTMLFormElement): Characteristics {
  const data = new FormData(form);
  const result: Record<string, unknown> = {
    name: data.get("name"),
    typeLine: data.get("typeLine"),
    rulesText: data.get("rulesText"),
    colors: String(data.get("colors") ?? "")
      .split(",")
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean),
  };
  for (const key of ["manaCost", "power", "toughness", "loyalty", "defense"])
    if (data.get(key)) result[key] = data.get(key);
  if (data.get("colorIndicator"))
    result.colorIndicator = String(data.get("colorIndicator"))
      .split(",")
      .map((value) => value.trim().toUpperCase());
  return characteristicSchema.parse(result);
}
