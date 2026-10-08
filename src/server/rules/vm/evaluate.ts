import type { GameObject, SemanticEvent } from "../../../shared/rules-state.js";
import type {
  Choice,
  Comparison,
  Condition,
  PlayerRef,
  Predicate,
  PredicateFields,
  Selector,
  Value,
} from "../../../shared/card-dsl.js";
import type { RulesQuery } from "../context.js";
import { counterCount } from "../../match/counters.js";
import { lifeValue } from "../../match/life.js";
import { zoneById, zoneOf } from "../../match/zones.js";

// Evaluates Core AST selectors, predicates, values, player references and
// conditions (dsl-redesign.md §4.2-4.4) against the current Match.

/** What an instruction is evaluated relative to. */
export interface Scope {
  /** The controller of the resolving spell or ability: "you". */
  playerId: string;
  /** "source": the ability's source object, or the spell itself. */
  sourceId?: string;
  /** The chosen targets. The runtime supports one target clause. */
  targetIds?: string[];
  /** The triggering event. */
  event?: SemanticEvent;
  bindings?: Record<string, number>;
  objects?: Record<string, string[]>;
  players?: Record<string, string>;
}

const list = <T>(value: T | T[]) => (Array.isArray(value) ? value : [value]);

export class Evaluator {
  constructor(
    readonly query: RulesQuery,
    readonly scope: Scope,
  ) {}

  private get match() {
    return this.query.match;
  }

  /** Player ids a reference names. */
  players(ref: PlayerRef): string[] {
    const { playerId } = this.scope;
    const all = this.match.players.map((p) => p.id);
    if (ref === "you") return [playerId];
    if (ref === "opponents") return all.filter((id) => id !== playerId);
    if (ref === "each-player") return [...this.match.turn.order];
    if (ref === "active-player") return [this.match.turn.activePlayerId];
    if ("target" in ref)
      return (this.scope.targetIds ?? []).filter((id) => all.includes(id));
    if ("event" in ref)
      return this.scope.event?.playerId ? [this.scope.event.playerId] : [];
    if ("binding" in ref) {
      const bound = this.scope.players?.[ref.binding];
      if (!bound) throw new Error(`Unbound player "${ref.binding}".`);
      return [bound];
    }
    const of = "controllerOf" in ref ? ref.controllerOf : ref.ownerOf;
    const ids = this.objects(of);
    const event = this.scope.event;
    return [
      ...new Set(
        ids.flatMap((id) => {
          const object = this.match.objects[id];
          if (object)
            return [
              "controllerOf" in ref ? object.controllerId : object.ownerId,
            ];
          // Last known information for an object that has left (CR 608.2h).
          if (event && (id === event.affectedId || id === event.sourceId))
            return ["controllerOf" in ref ? event.controllerId : event.ownerId];
          return [];
        }),
      ),
    ];
  }

  /**
   * Object ids a selector names. A choice has no fixed answer; its handler
   * prompts among `candidates`.
   */
  objects(selector: Selector): string[] {
    const { scope, match } = this;
    if (selector === "source") return scope.sourceId ? [scope.sourceId] : [];
    if (selector === "target") return [...(scope.targetIds ?? [])];
    if ("target" in selector) return [...(scope.targetIds ?? [])];
    if ("all" in selector)
      return Object.values(match.objects)
        .filter((object) => this.matches(object, selector.all))
        .map((object) => object.id);
    if ("choose" in selector)
      throw new Error("A choice is made by its instruction's handler.");
    if ("binding" in selector) {
      const bound = scope.objects?.[selector.binding];
      if (!bound) throw new Error(`Unbound objects "${selector.binding}".`);
      return [...bound];
    }
    if ("event" in selector) {
      const event = scope.event;
      if (!event || selector.event === "player") return [];
      // The source of a becomes-target event is the targeting spell or ability.
      return [
        selector.event === "object"
          ? event.affectedId
          : (event.stackId ?? event.sourceId),
      ];
    }
    if ("attachedTo" in selector)
      return this.objects(selector.attachedTo).flatMap((id) => {
        const host = match.objects[id]?.attachmentTo;
        return host && match.objects[host] ? [host] : [];
      });
    if ("attachedBy" in selector) {
      const hosts = this.objects(selector.attachedBy);
      return Object.values(match.objects)
        .filter((o) => o.attachmentTo && hosts.includes(o.attachmentTo))
        .map((o) => o.id);
    }
    if ("linked" in selector) {
      const source = match.objects[scope.sourceId ?? ""];
      return (source?.links ?? [])
        .filter((link) => link.label === selector.linked)
        .flatMap((link) => link.objectIds);
    }
    return this.objects(selector.attackedBy).flatMap((id) => this.defender(id));
  }

  /** The player or planeswalker an attacker attacks, if it can still be dealt damage. */
  private defender(attackerId: string): string[] {
    const match = this.match;
    const attacker = match.rules.combat?.attackers.find(
      (a) => a.objectId === attackerId,
    );
    const defenderId = attacker?.defenderId ?? this.scope.event?.defenderId;
    if (!defenderId) return [];
    const recipient = match.objects[defenderId];
    return match.players.some(
      (p) => p.id === defenderId && p.outcome === "playing",
    ) ||
      (recipient?.zoneId === this.query.zone("battlefield").id &&
        this.query.effective(recipient).types?.includes("Planeswalker"))
      ? [defenderId]
      : [];
  }

  /** The objects a choice may pick from. */
  candidates(choice: Choice): string[] {
    return Object.values(this.match.objects)
      .filter((object) => this.matches(object, choice.from))
      .map((object) => object.id);
  }

  matches(object: GameObject, predicate: Predicate): boolean {
    if ("and" in predicate)
      return predicate.and.every((p) => this.matches(object, p));
    if ("or" in predicate)
      return predicate.or.some((p) => this.matches(object, p));
    if ("not" in predicate) return !this.matches(object, predicate.not);
    return this.fields(object, predicate);
  }

  private fields(object: GameObject, p: PredicateFields): boolean {
    const match = this.match;
    const zone = zoneById(match, object.zoneId)!;
    // A private Zone's objects are known only to its owner.
    if (zone.visibility === "private" && zone.ownerId !== this.scope.playerId)
      return false;
    if (p.player !== undefined) return false;
    const c = this.query.effective(object);
    const types = c.types ?? [];
    const anyOf = (wanted: string | string[] | undefined, have?: string[]) =>
      wanted === undefined || list(wanted).some((w) => have?.includes(w));
    if (p.zone && zone.kind !== p.zone) return false;
    if (p.object) {
      const ok =
        p.object === "spell"
          ? object.kind === "card" && zone.kind === "stack"
          : p.object === "permanent"
            ? zone.kind === "battlefield"
            : p.object === "token"
              ? object.kind === "token"
              : p.object === "card" && object.kind === "card";
      if (!ok) return false;
    }
    if (!anyOf(p.type, types)) return false;
    if (!anyOf(p.subtype, c.subtypes)) return false;
    if (!anyOf(p.supertype, c.supertypes)) return false;
    if (p.color !== undefined) {
      const colors = c.colors ?? [];
      const ok =
        p.color === "any"
          ? colors.length > 0
          : p.color === "colorless"
            ? colors.length === 0
            : list(p.color).some((x) => colors.includes(x));
      if (!ok) return false;
    }
    if (
      p.controller &&
      !this.players(p.controller).includes(object.controllerId)
    )
      return false;
    if (p.owner && !this.players(p.owner).includes(object.ownerId))
      return false;
    if (p.status)
      for (const status of list(p.status)) {
        const attackers = match.rules.combat?.attackers ?? [];
        const ok =
          status === "tapped"
            ? object.status.tapped
            : status === "untapped"
              ? !object.status.tapped
              : status === "attacking"
                ? attackers.some((a) => a.objectId === object.id)
                : status === "blocking"
                  ? attackers.some((a) => a.blockerIds.includes(object.id))
                  : object.attachmentTo !== null;
        if (!ok) return false;
      }
    if (p.is && !this.objects(p.is).includes(object.id)) return false;
    if (
      p.manaValue !== undefined &&
      !this.compare(c.manaValue ?? 0, p.manaValue)
    )
      return false;
    for (const stat of ["power", "toughness"] as const) {
      if (p[stat] === undefined) continue;
      if (!/^-?\d+$/.test(c[stat] ?? "")) return false;
      if (!this.compare(Number(c[stat]), p[stat]!)) return false;
    }
    if (p.counters) {
      const count = counterCount(object.counters, p.counters.kind);
      if (!this.compare(count, p.counters.count)) return false;
    }
    if (p.dealtDamageBy) {
      // As the version 1 runtime reads it: the object's controller was dealt
      // combat damage by the source this turn (Steel Hellkite).
      const sources = this.objects(p.dealtDamageBy);
      if (
        !match.rules.thisTurn.damageEvents.some(
          (e) =>
            sources.includes(e.sourceId) &&
            e.combat &&
            e.recipientKind === "player" &&
            e.recipientId === object.controllerId &&
            e.turn === match.turn.number,
        )
      )
        return false;
    }
    return true;
  }

  private compare(actual: number, comparison: Comparison): boolean {
    if (typeof comparison === "number" || !this.isOperator(comparison))
      return actual === this.value(comparison as Value);
    const [[operator, operand]] = Object.entries(comparison) as [
      string,
      Value,
    ][];
    const expected = this.value(operand);
    return operator === "<"
      ? actual < expected
      : operator === "<="
        ? actual <= expected
        : operator === "="
          ? actual === expected
          : operator === ">="
            ? actual >= expected
            : actual > expected;
  }

  private isOperator(comparison: Comparison) {
    return ["<", "<=", "=", ">=", ">"].includes(Object.keys(comparison)[0]);
  }

  value(value: Value): number {
    const { scope, match } = this;
    if (typeof value === "number") return value;
    if ("variable" in value) return this.number("X", scope.bindings?.X);
    if ("binding" in value)
      // A version 1 number binding lifted from a stored Room may now name an
      // object set (snapshot version 3); it counts the set.
      return this.number(
        value.binding,
        scope.bindings?.[value.binding] ??
          scope.objects?.[value.binding]?.length,
      );
    if ("count" in value) return this.objects(value.count).length;
    if ("sum" in value)
      return value.sum.reduce<number>((sum, v) => sum + this.value(v), 0);
    if ("stat" in value || "greatest" in value) {
      const { of, name } = "stat" in value ? value.stat : value.greatest;
      const stats = this.objects(of)
        .map((id) => match.objects[id])
        .filter(Boolean)
        .map((object) => {
          const c = this.query.effective(object);
          return name === "manaValue" ? (c.manaValue ?? 0) : Number(c[name]);
        })
        .filter((n) => Number.isFinite(n));
      return "stat" in value ? (stats[0] ?? 0) : Math.max(0, ...stats);
    }
    if ("cardsIn" in value) {
      const [playerId] = this.players(value.cardsIn.player);
      // The player's own Zone of that kind; a shared Zone counts what they control.
      const zone = playerId
        ? zoneOf(match, value.cardsIn.zone, playerId)
        : match.zones.find(
            (z) => z.kind === value.cardsIn.zone && z.ownerId === playerId,
          );
      if (zone) return zone.objectIds.length;
      return Object.values(match.objects).filter(
        (o) =>
          o.controllerId === playerId &&
          o.zoneId === this.query.zone(value.cardsIn.zone).id,
      ).length;
    }
    if ("lifeTotal" in value) {
      const [playerId] = this.players(value.lifeTotal);
      return lifeValue(match.players.find((p) => p.id === playerId));
    }
    if ("commanderColors" in value) {
      const [playerId] = this.players(value.commanderColors);
      return match.rules.commanders[playerId]?.colorIdentity.length ?? 0;
    }
    if ("eventAmount" in value) return scope.event?.damage?.amount ?? 0;
    return this.condition(value.if)
      ? this.value(value.then)
      : this.value(value.else);
  }

  private number(name: string, result: number | undefined) {
    if (result === undefined || !Number.isSafeInteger(result) || result < 0)
      throw new Error(`Invalid quantity binding "${name}".`);
    return result;
  }

  condition(condition: Condition): boolean {
    if ("and" in condition)
      return condition.and.every((c) => this.condition(c));
    if ("or" in condition) return condition.or.some((c) => this.condition(c));
    if ("not" in condition) return !this.condition(condition.not);
    if ("compare" in condition) {
      const [left, operator, right] = condition.compare;
      return this.compare(this.value(left), {
        [operator]: right,
      } as Comparison);
    }
    if ("exists" in condition) return this.objects(condition.exists).length > 0;
    if ("matches" in condition)
      return this.objects(condition.matches.selector).some((id) => {
        const object = this.match.objects[id];
        return !!object && this.matches(object, condition.matches.predicate);
      });
    if ("monarch" in condition)
      return this.players(condition.monarch).includes(
        this.match.rules.monarchId ?? "",
      );
    if ("didPerform" in condition)
      return !!this.scope.bindings?.[condition.didPerform];
    throw new Error(
      `The ${Object.keys(condition)[0]} condition is not supported by the current runtime.`,
    );
  }
}

/** Conditions the evaluator can't decide yet: turn history and optional costs. */
export function unsupportedCondition(condition: Condition): string | undefined {
  if ("and" in condition || "or" in condition)
    return ("and" in condition ? condition.and : condition.or)
      .map(unsupportedCondition)
      .find(Boolean);
  if ("not" in condition) return unsupportedCondition(condition.not);
  if ("happened" in condition) return "A turn-history condition";
  if ("paid" in condition) return "An optional-cost condition";
  return undefined;
}
