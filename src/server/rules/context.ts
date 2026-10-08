import type { CardDefinition, Catalog } from "../../shared/model.js";
import type {
  Characteristics,
  Predicate,
  ZoneKind,
} from "../../shared/card-dsl.js";
import type {
  DamageAssignment,
  GameObject,
  LastKnownInformation,
  MatchState,
  ZoneState,
} from "../../shared/rules-state.js";

// The rules context (rules-engine-refactor.md §6): a read-only query view and
// a mutator. A subsystem that only reads takes a RulesQuery; one that changes
// game state proposes events through a RulesMutator.

export interface RulesQuery {
  readonly match: MatchState;
  readonly catalog: Catalog;
  object(id: string): GameObject;
  zone(kind: ZoneKind, playerId?: string): ZoneState;
  effective(object: GameObject): Characteristics;
  definition(object: GameObject): CardDefinition | undefined;
  /** Core AST predicate match, evaluated for `playerId` ("you"). */
  matches(
    object: GameObject,
    predicate: Predicate,
    playerId: string,
    sourceId?: string,
  ): boolean;
}

/**
 * Objects whose zone changes happen at the same time share one snapshot of
 * trigger sources and of their own characteristics before the change (CR
 * 603.10a: leave-the-battlefield abilities look back in time).
 */
export interface SimultaneousSnapshot {
  sources: GameObject[];
  before?: Characteristics;
}

/**
 * A game change before replacement and prevention apply (§41). Zone changes,
 * draws, damage, life changes and object creation all start here.
 */
export type ProposedEvent =
  | {
      kind: "zone-change";
      objectId: string;
      to: ZoneState;
      /** Library position; otherwise the object goes on top of the Zone. */
      position?: "top" | "bottom";
      /**
       * `cast` puts a spell on the Stack (its cast event is separate);
       * `setup` is a Match setup or mulligan move. Neither is observed by
       * triggers or commander replacement.
       */
      cause?: "cast" | "setup";
      simultaneous?: SimultaneousSnapshot;
    }
  | { kind: "draw"; playerId: string }
  | { kind: "damage"; assignments: DamageAssignment[]; combat: boolean }
  | { kind: "life-change"; playerId: string; amount: number }
  /** A token or an ability object comes into existence in a Zone. */
  | { kind: "create"; object: GameObject; zone: ZoneState }
  /** An ability or a token outside the Battlefield ceases to exist. */
  | { kind: "cease"; objectId: string };

export interface EventResult {
  /** The object after a zone change, creation or draw. */
  object?: GameObject;
  /** The moved object as it last existed. */
  lastKnown?: LastKnownInformation;
}

export interface RulesMutator {
  readonly query: RulesQuery;
  /**
   * Applies a proposed event and reports it to trigger observation. Until the
   * replacement runtime exists it applies the event unchanged (§6), except for
   * the commander's Hand and Library replacement (CR 903.9b).
   */
  propose(event: ProposedEvent): EventResult;
}
