import { BadRequestException, NotFoundException } from "@nestjs/common";

/** A Decklist request the Deck Catalog doesn't allow; its message is shown to the player. */
export class DeckError extends Error {}

/**
 * What a failed Decklist request answers: a DeckError's own message, or the
 * error itself when it is a bug, so Nest logs it and answers 500 without
 * showing its text (a SQL error, a TypeError) to the player.
 */
export function deckRequestError(error: unknown): unknown {
  if (!(error instanceof DeckError)) return error;
  return error.message === "Decklist not found."
    ? new NotFoundException(error.message)
    : new BadRequestException(error.message);
}
