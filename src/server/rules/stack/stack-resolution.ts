import type { GameObject, MatchAction } from "../../../shared/rules-state.js";
import type { Effect, PlayerRef } from "../../../shared/card-dsl.js";
import { giftOf } from "../abilities.js";
import { waitTrigger } from "../triggers/trigger-runtime.js";
import { Resolution } from "../../match/resolution.js";
import type { RulesEngine } from "../../match/rules-engine.js";
import {
  effectsOf,
  enchantFilter,
  interveningIf,
  isDiesTrigger,
  targetClauses,
} from "../abilities.js";
import type { VMResult } from "../vm/rule-vm.js";

// Stack Resolution Runtime: the CR 608
// envelope around the top object of the Stack. It checks an intervening-if,
// revalidates targets, and sends the object down one of two paths: a
// permanent spell enters the Battlefield (no effect program), and an instant,
// sorcery or ability runs its instructions through the Rule VM. Then the
// Stack is cleaned up and the game proceeds toward Priority.

/**
 * The gift as an instruction (CR 702.174): the chosen player draws a card or
 * gets the token. Delivered by a trigger the chosen player is the event's
 * player of; a resolving spell names them.
 */
function giftInstruction(gift: string, recipientId?: string): Effect {
  const player: PlayerRef = recipientId
    ? { binding: "gift-recipient" }
    : { event: "player" };
  return gift === "card"
    ? { kind: "draw", player, count: 1 }
    : { kind: "create-token", token: gift, controller: player };
}

export type ResolutionPath = "fizzle" | "permanent" | "program";

export class StackResolutionRuntime {
  constructor(readonly engine: RulesEngine) {}

  /** Resolves the top object of the Stack. */
  resolve() {
    const engine = this.engine;
    const object = engine.object(engine.zone("stack").objectIds.at(-1)!);
    const path = this.path(object);
    if (path === "fizzle") {
      engine.toGraveyard(object);
      engine.checkpoint();
      return;
    }
    delete engine.match.priority;
    if (path === "permanent") {
      this.resolvePermanent(object);
      engine.checkpoint();
      return;
    }
    const gift = object.proposal?.gift
      ? giftOf(engine.abilitiesOf(object))
      : undefined;
    // CR 702.174a: an instant or sorcery gives its gift as it resolves, before
    // its own instructions.
    const instructions = [
      ...(gift ? [giftInstruction(gift, object.proposal!.gift)] : []),
      ...effectsOf(object.resolution?.ability),
    ];
    this.after(
      new Resolution(engine).start(
        object,
        instructions,
        this.legalTargets(object),
      ),
    );
  }

  /** A spell cast by the waiting instruction is on the Stack: carry on. */
  resume() {
    this.after(new Resolution(this.engine).resume());
  }

  /** Answers the resolving program's waiting instruction. */
  answer(action: Extract<MatchAction, { type: "rules-input" }>) {
    this.after(new Resolution(this.engine).answer(action));
  }

  /**
   * Which path a Stack object takes: it fails to resolve when its
   * intervening-if is false or every target became illegal (CR 603.4,
   * 608.2b); otherwise a permanent spell enters, and anything else runs its
   * program.
   */
  path(object: GameObject): ResolutionPath {
    if (!this.interveningHolds(object) || !this.someTargetLegal(object))
      return "fizzle";
    return this.isPermanentSpell(object) ? "permanent" : "program";
  }

  /** CR 603.4: a triggered ability's intervening-if is checked again. */
  interveningHolds(object: GameObject) {
    const condition = interveningIf(object.resolution?.ability);
    return (
      !condition ||
      this.engine.conditionSatisfied(
        condition,
        object.controllerId,
        object.sourceObjectId ?? object.id,
      )
    );
  }

  /**
   * The chosen targets still legal, by target clause id (CR 608.2b). An
   * object stored with a flat list has one target clause.
   */
  legalTargets(object: GameObject): Record<string, string[]> {
    const engine = this.engine;
    const resolution = object.resolution;
    const clauses = targetClauses(resolution?.ability);
    if (!resolution || !clauses.length) return {};
    const sourceId = isDiesTrigger(resolution.ability)
      ? resolution.event?.affectedId
      : (object.sourceObjectId ?? object.id);
    return Object.fromEntries(
      clauses.map((clause) => {
        const chosen =
          resolution.targets?.[clause.id] ??
          (clauses.length === 1 ? resolution.targetIds : []);
        return [
          clause.id,
          chosen.filter(
            (id) =>
              engine.match.objects[id] &&
              engine.targetEligible(
                engine.match.objects[id],
                clause.filter,
                object.controllerId,
                sourceId,
              ),
          ),
        ];
      }),
    );
  }

  /**
   * CR 608.2b: an object with targets resolves if any target is still legal;
   * one that chose no targets (up to zero) isn't affected by this rule.
   */
  someTargetLegal(object: GameObject) {
    const resolution = object.resolution;
    if (
      !resolution?.targetIds.length ||
      !targetClauses(resolution.ability).length
    )
      return true;
    return Object.values(this.legalTargets(object)).some((ids) => ids.length);
  }

  isPermanentSpell(object: GameObject) {
    return (
      object.kind === "card" &&
      !object.characteristics.types?.some(
        (type) => type === "Instant" || type === "Sorcery",
      )
    );
  }

  /**
   * CR 702.174b: when a permanent whose gift was promised enters, the chosen
   * player gets the gift. (An instant or sorcery gives it as it resolves:
   * the program's first instruction, `giftInstruction`.)
   */
  private promiseKept(permanent: GameObject) {
    const engine = this.engine;
    const recipient = permanent.proposal?.gift;
    const gift = giftOf(engine.abilitiesOf(permanent));
    if (!recipient || !gift) return;
    waitTrigger(engine, {
      playerId: permanent.controllerId,
      source: { kind: "object", id: permanent.id },
      abilityId: "gift",
      sourceName: permanent.characteristics.name,
      sourceSnapshot: {
        characteristics: engine.effective(permanent),
        ownerId: permanent.ownerId,
      },
      ability: {
        id: "gift",
        kind: "triggered",
        trigger: { event: "enters", object: "source" },
        effects: [giftInstruction(gift)],
      },
      event: {
        kind: "state",
        playerId: recipient,
        sourceId: permanent.id,
        affectedId: permanent.id,
        controllerId: permanent.controllerId,
        ownerId: permanent.ownerId,
        after: engine.effective(permanent),
      },
    });
  }

  /** CR 608.3: a permanent spell becomes a permanent; an Aura attaches. */
  resolvePermanent(object: GameObject) {
    const engine = this.engine;
    const targets = object.resolution?.targetIds ?? [];
    const permanent = engine.propose({
      kind: "zone-change",
      objectId: object.id,
      to: engine.zone("battlefield"),
    }).object!;
    this.promiseKept(permanent);
    if (enchantFilter(engine.definition(permanent)?.abilities ?? []))
      permanent.attachmentTo = targets[0];
  }

  /** CR 608.2n: a resolved instruction program's object leaves the Stack. */
  private after(result: VMResult) {
    if (result.kind === "suspend") return;
    const engine = this.engine;
    const object = engine.object(engine.rules.resolving!.stackObjectId);
    delete engine.rules.resolving;
    delete engine.rules.pending;
    engine.toGraveyard(object);
    engine.checkpoint();
  }
}
