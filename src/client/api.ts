import { useCallback, useEffect, useState } from "react";
import type { DeckInput, DeckView, User } from "../shared/model";

export async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      (Array.isArray(data.message) ? data.message[0] : data.message) ??
        "The request failed.",
    );
  return data as T;
}

export interface AuthConfig {
  google: boolean;
  dev: boolean;
}
export const signOut = () => request<void>("/api/auth/logout", "POST");
export const signInForDevelopment = (name: string) =>
  request<{ user: User }>("/api/auth/dev", "POST", { name });

/** The signed-in User's Deck Catalog. */
export function useDecks(report: (message: string) => void, signedIn: boolean) {
  const [decks, setDecks] = useState<DeckView[]>([]);
  const reload = useCallback(
    async () =>
      signedIn
        ? request<DeckView[]>("/api/decks")
            .then(setDecks)
            .catch((error: Error) => report(error.message))
        : setDecks([]),
    [report, signedIn],
  );
  useEffect(() => {
    void reload();
  }, [reload]);
  async function save(input: DeckInput, id?: string) {
    try {
      const deck = await request<DeckView>(
        id ? `/api/decks/${id}` : "/api/decks",
        id ? "PUT" : "POST",
        input,
      );
      await reload();
      return deck;
    } catch (error) {
      report(error instanceof Error ? error.message : "Unable to save");
      return undefined;
    }
  }
  async function remove(id: string) {
    try {
      await request<void>(`/api/decks/${id}`, "DELETE");
      await reload();
    } catch (error) {
      report(error instanceof Error ? error.message : "Unable to delete");
    }
  }
  return { decks, reload, save, remove };
}
export type Decks = ReturnType<typeof useDecks>;
