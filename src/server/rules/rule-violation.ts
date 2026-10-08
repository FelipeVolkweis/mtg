/**
 * An action the rules don't allow, explained to the player who tried it. Its
 * message is shown on screen, so it must read as advice to that player.
 *
 * Any other error thrown while the rules run is a bug: the server logs it and
 * the player sees only a generic message (`MatchService.execute`).
 */
export class RuleViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuleViolation";
  }
}

/** What a player sees when an action fails on a bug rather than a rule. */
export const internalErrorMessage =
  "Something went wrong while applying this action. It was not applied.";
