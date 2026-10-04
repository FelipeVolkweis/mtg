import { z } from "zod";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import type { NameEntry } from "../../shared/model.js";
import { nameCardSchema, nameEntries, nameKey } from "./card-names.js";

const faceSchema = z.object({
  name: z.string().min(1),
  flavor_name: z.string().optional(),
  mana_cost: z.string().optional(),
  colors: z.array(z.enum(["W", "U", "B", "R", "G"])).optional(),
  color_indicator: z.array(z.enum(["W", "U", "B", "R", "G"])).optional(),
  type_line: z.string().default(""),
  oracle_text: z.string().optional(),
  power: z.string().optional(),
  toughness: z.string().optional(),
  loyalty: z.string().optional(),
  defense: z.string().optional(),
  image_uris: z.object({ normal: z.string().url() }).optional(),
});
export const sourceCardSchema = faceSchema.extend({
  id: z.string().uuid(),
  set: z.string(),
  collector_number: z.string(),
  layout: z.string(),
  color_identity: z.array(z.string()),
  card_faces: z.array(faceSchema).optional(),
});
export type SourceCard = z.infer<typeof sourceCardSchema>;

export class ScryfallSource {
  constructor(
    private readonly origin = process.env.SCRYFALL_API_ORIGIN ??
      "https://api.scryfall.com",
  ) {}
  private async response(
    url: string,
    bulk = false,
    body?: unknown,
  ): Promise<Response> {
    const origin = new URL(url).origin;
    if (
      origin !== new URL(this.origin).origin &&
      !(bulk && origin === "https://data.scryfall.io")
    )
      throw new Error("Unexpected catalog pagination origin");
    const response = await fetch(url, {
      headers: {
        "User-Agent": "MagicTabletop/0.1",
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      method: body ? "POST" : "GET",
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(bulk ? 180_000 : 30_000),
    });
    if (!response.ok)
      throw new Error(
        `Catalog provider returned ${response.status}; local data was preserved.`,
      );
    return response;
  }
  private async read(
    url: string,
    bulk = false,
    body?: unknown,
  ): Promise<unknown> {
    return (await this.response(url, bulk, body)).json();
  }
  private async fetchNames(): Promise<NameEntry[]> {
    const names = z
      .object({ data: z.array(z.string().min(1)).min(1) })
      .parse(await this.read(`${this.origin}/catalog/card-names`)).data;
    await new Promise((resolve) => setTimeout(resolve, 100));
    const bulk = z
      .object({
        download_uri: z.string().url().optional(),
        jsonl_download_uri: z.string().url().optional(),
      })
      .refine(
        (value) => value.download_uri || value.jsonl_download_uri,
        "Missing bulk download URL",
      )
      .parse(await this.read(`${this.origin}/bulk-data/oracle_cards`));
    const directory = new Map<string, NameEntry>();
    const add = (card: z.infer<typeof nameCardSchema>) => {
      for (const entry of nameEntries(card))
        directory.set(nameKey(entry.name), entry);
    };
    if (bulk.jsonl_download_uri) {
      const response = await this.response(bulk.jsonl_download_uri, true);
      if (!response.body) throw new Error("Missing catalog bulk response body");
      const compressed = Readable.fromWeb(response.body);
      const input = createGunzip();
      const lines = createInterface({ input, crlfDelay: Infinity });
      try {
        const consume = async () => {
          for await (const line of lines)
            if (line.trim()) add(nameCardSchema.parse(JSON.parse(line)));
        };
        await Promise.all([pipeline(compressed, input), consume()]);
      } finally {
        lines.close();
        input.destroy();
        compressed.destroy();
      }
    } else {
      const cards = z
        .array(nameCardSchema)
        .min(1)
        .parse(await this.read(bulk.download_uri!, true));
      cards.forEach(add);
    }
    if (!directory.size)
      throw new Error("The provider returned an empty Card Name Directory.");
    const addCompositeNames = () => {
      for (const name of names) {
        if (directory.has(nameKey(name))) continue;
        const parts = name
          .split(" // ")
          .map((part) => directory.get(nameKey(part)));
        const canonical = parts[0]?.canonicalName;
        if (
          parts.length > 1 &&
          canonical &&
          parts.every((part) => part?.canonicalName === canonical)
        )
          directory.set(nameKey(name), { name, canonicalName: canonical });
      }
    };
    // Reversible printings can repeat the same rules identity on both sides,
    // while the Oracle bulk snapshot chooses an ordinary printing of that card.
    addCompositeNames();
    // The live names index may include names introduced since the daily bulk snapshot.
    const missing = names.filter((name) => !directory.has(nameKey(name)));
    for (let start = 0; start < missing.length; start += 75) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const page = z.object({ data: z.array(nameCardSchema) }).parse(
        await this.read(`${this.origin}/cards/collection`, false, {
          identifiers: missing
            .slice(start, start + 75)
            .map((name) => ({ name })),
        }),
      );
      page.data.forEach(add);
    }
    addCompositeNames();
    const unresolved = names.filter((name) => !directory.has(nameKey(name)));
    if (unresolved.length)
      throw new Error(
        `The provider could not resolve ${unresolved.length} Card Name Directory entries (${unresolved.slice(0, 10).join(", ")}); local data was preserved.`,
      );
    return [...directory.values()];
  }
  async fetchSet(
    setCode: string,
  ): Promise<{ cards: SourceCard[]; names: NameEntry[] }> {
    if (!/^[a-z0-9]{2,10}$/.test(setCode))
      throw new Error("Use a set code containing 2–10 letters or digits.");
    const names = await this.fetchNames();
    const cards: SourceCard[] = [];
    let url: string | undefined =
      `${this.origin}/cards/search?${new URLSearchParams({ q: `set:${setCode} lang:en`, unique: "prints", include_extras: "true", include_variations: "true" })}`;
    const seen = new Set<string>();
    while (url) {
      if (seen.has(url)) throw new Error("Repeated catalog page");
      seen.add(url);
      await new Promise((resolve) => setTimeout(resolve, 100));
      const page = z
        .object({
          data: z.array(sourceCardSchema),
          has_more: z.boolean(),
          next_page: z.string().url().optional(),
        })
        .parse(await this.read(url));
      cards.push(...page.data);
      if (page.has_more && !page.next_page)
        throw new Error("Missing catalog page");
      url = page.has_more ? page.next_page : undefined;
    }
    if (
      !cards.length ||
      cards.some((card) => card.set.toLowerCase() !== setCode)
    )
      throw new Error("The provider returned an empty or inconsistent set.");
    return { cards, names };
  }
}
