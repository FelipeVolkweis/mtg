import { randomUUID } from "node:crypto";
import { type Effect, nextTurnStep } from "../../shared/card-dsl.js";
import type { GameObject } from "../../shared/rules-state.js";
import { restrictsUntap } from "../rules/abilities.js";
import type { RulesMutator, RulesQuery } from "../rules/context.js";
import type { PriorityGrant } from "../rules/priority/priority-checkpoint.js";
import type { EventTriggerObserver } from "../rules/triggers/trigger-runtime.js";
import type { Combat } from "./combat.js";
import { emptyMana } from "./rules-engine.js";

/**
 * What the turn structure needs beyond proposing events: Priority grants,
 * draws, and the turn-based actions other subsystems own (combat
 * declarations, trigger observation, the monarch's draw).
 */
export interface TurnContext extends RulesMutator {
  /** A player would receive Priority. */
  checkpoint(grant?: PriorityGrant): void;
  draw(playerId: string, count: number): void;
  battlefieldSources(): GameObject[];
  maximumHandSize(playerId: string): number;
  monarchTrigger(playerId: string, effects: Effect[], abilityId: string): void;
  readonly combat: Pick<
    Combat,
    "beginAttackers" | "beginBlockers" | "beginDamage"
  >;
  readonly triggers: Pick<EventTriggerObserver, "collect">;
}

/** A player may act at sorcery speed: their main phase with an empty Stack. */
export function mainTiming(query: RulesQuery, playerId: string) {
  const turn = query.match.turn;
  return (
    turn.activePlayerId === playerId &&
    (turn.step === "precombat-main" || turn.step === "postcombat-main") &&
    !query.zone("stack").objectIds.length
  );
}

/**
 * The turn structure (CR 500): beginning a turn, moving to the next step with
 * its turn-based actions, the cleanup step and passing the turn.
 */
export class TurnStructure {
  constructor(readonly ctx: TurnContext) {}

  private get match() {
    return this.ctx.query.match;
  }
  /** The rules state; a rolled-back proposal replaces it, so it's read live. */
  private get rules() {
    return this.match.rules;
  }

  /** The untap step (CR 502), then the upkeep step. */
  begin() {
    const { match, rules } = this;
    rules.drawsThisTurn = {};
    rules.activationUsage = {};
    rules.damageEvents = [];
    match.turn.step = "untap";
    rules.turnStarted[match.turn.activePlayerId] = match.turn.number;
    rules.landsPlayed = {};
    const battlefield = this.ctx.query.zone("battlefield").id;
    for (const object of Object.values(match.objects))
      if (
        object.zoneId === battlefield &&
        object.controllerId === match.turn.activePlayerId
      ) {
        const restricted = this.ctx
          .battlefieldSources()
          .some(
            (a) =>
              a.attachmentTo === object.id &&
              restrictsUntap(this.ctx.query.definition(a)?.abilities ?? []),
          );
        if (!restricted || this.rules.monarchId === object.controllerId)
          object.status.tapped = false;
      }
    this.advance();
  }

  /** Mana empties (CR 500.4) and the next step's turn-based actions start. */
  advance() {
    const { match, ctx } = this;
    const turn = match.turn;
    for (const player of match.players)
      this.rules.mana[player.id] = emptyMana();
    this.rules.restrictedMana = {};
    const next = nextTurnStep(turn.step);
    if (!next) throw new Error("The cleanup step has no next step.");
    turn.step = next;
    if (turn.step === "upkeep")
      for (const source of ctx.battlefieldSources())
        ctx.triggers.collect(
          {
            kind: "upkeep",
            playerId: turn.activePlayerId,
            sourceId: source.id,
            affectedId: source.id,
            controllerId: source.controllerId,
            ownerId: ctx.query.owner(source),
            after: ctx.query.effective(source),
          },
          source,
          [source],
        );
    if (turn.step === "declare-attackers") {
      ctx.combat.beginAttackers();
      return;
    }
    if (turn.step === "declare-blockers") {
      // Without attackers, the blockers and damage steps are skipped (CR 508.8).
      if (!this.rules.combat?.attackers.length) turn.step = "end-combat";
      else {
        ctx.combat.beginBlockers();
        return;
      }
    }
    if (turn.step === "combat-damage") {
      ctx.combat.beginDamage();
      return;
    }
    if (turn.step === "postcombat-main") delete this.rules.combat;
    if (turn.step === "end" && this.rules.monarchId === turn.activePlayerId)
      ctx.monarchTrigger(
        this.rules.monarchId,
        [{ kind: "draw", count: 1 }],
        "monarch-draw",
      );
    if (turn.step === "cleanup") {
      this.cleanup();
      return;
    }
    if (turn.step === "draw" && turn.number !== 1)
      ctx.draw(turn.activePlayerId, 1);
    ctx.checkpoint();
  }

  /** The cleanup step (CR 514): discard to hand size, then end-of-turn changes. */
  cleanup() {
    const { match, ctx } = this;
    const playerId = match.turn.activePlayerId;
    if (
      ctx.query.zone("hand", playerId).objectIds.length >
      ctx.maximumHandSize(playerId)
    ) {
      this.rules.pending = {
        id: randomUUID(),
        playerId,
        kind: "cleanup",
        stage: "selection",
        targetIds: [],
        selections: {},
        totalCost: { ...emptyMana(), generic: 0 },
      };
      delete match.priority;
      return;
    }
    // CR 514: after discarding, damage and end-of-turn changes end together.
    this.rules.markedDamage = {};
    this.rules.temporaryEffects = [];
    ctx.checkpoint({ cleanup: true });
  }

  /** The next player in turn order begins a turn. */
  next() {
    const turn = this.match.turn;
    turn.number++;
    turn.activePlayerId =
      turn.order[
        (turn.order.indexOf(turn.activePlayerId) + 1) % turn.order.length
      ];
    this.begin();
  }
}
