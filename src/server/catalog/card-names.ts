import { z } from "zod";
import type { NameEntry } from "../../shared/model.js";

const nameFaceSchema = z.object({
  name: z.string().min(1),
  flavor_name: z.string().optional(),
});
export const nameCardSchema = nameFaceSchema.extend({
  layout: z.string(),
  card_faces: z.array(nameFaceSchema).optional(),
});
export type NameCard = z.infer<typeof nameCardSchema>;
export const nameKey = (name: string) =>
  name.normalize("NFKC").trim().toLowerCase();
const frontIdentityLayouts = new Set([
  "transform",
  "modal_dfc",
  "reversible_card",
  "double_faced_token",
  "adventure",
  "omen",
]);

export function canonicalName(card: NameCard): string {
  return frontIdentityLayouts.has(card.layout)
    ? (card.card_faces?.[0].name ?? card.name)
    : card.name;
}

export function nameEntries(card: NameCard): NameEntry[] {
  const canonical = canonicalName(card);
  const entries: NameEntry[] = [{ name: card.name, canonicalName: canonical }];
  if (card.flavor_name)
    entries.push({ name: card.flavor_name, canonicalName: canonical });
  if (card.card_faces)
    card.card_faces.forEach((face, component) => {
      entries.push({ name: face.name, canonicalName: canonical, component });
      if (face.flavor_name)
        entries.push({
          name: face.flavor_name,
          canonicalName: canonical,
          component,
        });
    });
  return entries;
}
