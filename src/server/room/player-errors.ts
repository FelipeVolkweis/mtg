import { RuleViolation } from "../rules/rule-violation.js";

/** A Room request the Room doesn't allow; its message is shown to the player. */
export class TabletopError extends Error {}

/**
 * The text a client may see for `error`: only a TabletopError or a
 * RuleViolation is written for players. Anything else is a bug, and its text
 * (a SQL error, a TypeError) stays on the server: undefined here.
 */
export function playerMessage(error: unknown): string | undefined {
  return error instanceof TabletopError || error instanceof RuleViolation
    ? error.message
    : undefined;
}
