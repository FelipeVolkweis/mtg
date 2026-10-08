import { attackTax, restrictionGrants } from "../rules/abilities.js";
import { lethalDamage } from "../rules/damage.js";
import { Evaluator } from "../rules/vm/evaluate.js";
import { randomUUID } from "node:crypto";
import type {
  DamageAssignment,
  DamageChoice,
  GameObject,
  MatchAction,
  SelectionOption,
} from "../../shared/rules-state.js";
import { manaCost } from "./mana.js";
import { payMana } from "../rules/costs/cost-runtime.js";
import { EventTriggerObserver } from "../rules/triggers/trigger-runtime.js";
import { emptyMana, type RulesEngine } from "./rules-engine.js";
import { RuleViolation } from "../rules/rule-violation.js";

// Declarations are turn-based actions. Their choices finish before Priority is offered.
export class Combat {
  constructor(readonly engine: RulesEngine) {}
  /**
   * The restriction grants of the given kind in force: each battlefield
   * source's grants whose ability condition holds, with an evaluator for the
   * source's controller (CR 508.1c, 509.1b, 509.1c).
   */
  private restrictions<
    K extends
      "cant-attack" | "cant-block" | "max-blockers" | "block-restriction",
  >(kind: K) {
    const e = this.engine;
    return e.battlefieldSources().flatMap((source) => {
      const evaluator = new Evaluator(e.query, {
        playerId: source.controllerId,
        sourceId: source.id,
      });
      return restrictionGrants(e.abilitiesOf(source), kind)
        .filter(({ condition }) => !condition || evaluator.condition(condition))
        .map(({ grant }) => ({ grant, evaluator }));
    });
  }
  eligible(object: GameObject, playerId: string, attacking = false) {
    const e = this.engine;
    return (
      object.controllerId === playerId &&
      object.zoneId === e.zone("battlefield").id &&
      !object.status.tapped &&
      e.effective(object).types?.includes("Creature") &&
      !this.restrictions(attacking ? "cant-attack" : "cant-block").some(
        ({ grant, evaluator }) =>
          evaluator.objects(grant.objects).includes(object.id),
      ) &&
      (!attacking ||
        (!e.hasKeyword(object, "Defender") &&
          e.canPayTapSymbol(object, playerId)))
    );
  }
  defenders(playerId: string) {
    const e = this.engine;
    return [
      ...e.match.players
        .filter((p) => p.id !== playerId && p.outcome === "playing")
        .map((p) => ({ id: p.id, playerId: p.id, name: p.name })),
      ...e.battlefieldSources().flatMap((object) => {
        const types = e.effective(object).types ?? [];
        // Battles are not supported (ADR-0018): no runtime Battle Protector.
        const defending = types.includes("Planeswalker")
          ? object.controllerId
          : undefined;
        return defending && defending !== playerId
          ? [
              {
                id: object.id,
                playerId: defending,
                name: object.characteristics.name,
              },
            ]
          : [];
      }),
    ];
  }
  redirectDestinations(attackerId: string) {
    const attacker = this.engine.object(attackerId);
    return this.defenders(attacker.controllerId).filter(
      (d) =>
        this.engine.match.objects[d.id]?.controllerId !== attacker.controllerId,
    );
  }
  prompt(
    kind: "declare-attackers" | "declare-blockers",
    playerId: string,
    options: Record<string, SelectionOption>,
  ) {
    const e = this.engine;
    e.rules.pending = {
      id: randomUUID(),
      playerId,
      kind,
      stage: "selection",
      targetIds: [],
      selections: {},
      totalCost: { ...emptyMana(), generic: 0 },
      options,
    };
    delete e.match.priority;
  }
  beginAttackers() {
    const e = this.engine,
      playerId = e.match.turn.activePlayerId;
    e.rules.combat = { attackers: [], remainingDefenderIds: [] };
    const defenders = this.defenders(playerId);
    const options = Object.fromEntries(
      e
        .battlefieldSources()
        .filter((o) => this.eligible(o, playerId, true))
        .map((o) => [
          o.id,
          {
            count: 1,
            minCount: 0,
            objectIds: defenders.map((d) => d.id),
            label: `Attack with ${o.characteristics.name}`,
            labels: Object.fromEntries(defenders.map((d) => [d.id, d.name])),
          },
        ]),
    );
    // With no eligible attackers, the empty declaration requires no choice.
    if (!Object.keys(options).length) {
      e.checkpoint();
      return;
    }
    this.prompt("declare-attackers", playerId, options);
  }
  canBlock(blocker: GameObject, attacker: GameObject) {
    const e = this.engine;
    return (
      !e.hasKeyword(attacker, "Unblockable") &&
      (!e.hasKeyword(attacker, "Flying") ||
        e.hasKeyword(blocker, "Flying") ||
        e.hasKeyword(blocker, "Reach")) &&
      (!e.hasKeyword(attacker, "Cannot be blocked by Walls") ||
        !e.effective(blocker).subtypes?.includes("Wall")) &&
      !this.restrictions("block-restriction").some(
        ({ grant, evaluator }) =>
          !!grant.by &&
          evaluator.objects(grant.objects).includes(attacker.id) &&
          evaluator.matches(blocker, grant.by),
      )
    );
  }
  /** CR 509.1b: an attacker that can't be blocked by more than some number of creatures. */
  private tooManyBlockers(attackerId: string, blockers: number) {
    const limits = this.restrictions("max-blockers")
      .filter(({ grant, evaluator }) =>
        evaluator.objects(grant.objects).includes(attackerId),
      )
      .map(({ grant }) => grant.count);
    return limits.length > 0 && blockers > Math.min(...limits);
  }
  beginBlockers() {
    const e = this.engine,
      combat = e.rules.combat!;
    if (!combat.remainingDefenderIds.length)
      combat.remainingDefenderIds = e.match.turn.order.filter((id) =>
        combat.attackers.some((a) => a.defendingPlayerId === id),
      );
    this.nextBlocker();
  }
  nextBlocker() {
    const e = this.engine,
      combat = e.rules.combat!;
    const playerId = combat.remainingDefenderIds[0];
    if (!playerId) {
      e.checkpoint();
      return;
    }
    const options = Object.fromEntries(
      e
        .battlefieldSources()
        .filter((o) => this.eligible(o, playerId))
        .map((o) => [
          o.id,
          {
            count: 1,
            minCount: 0,
            label: `Block with ${o.characteristics.name}`,
            objectIds: combat.attackers
              .filter(
                (a) =>
                  a.defendingPlayerId === playerId &&
                  e.match.objects[a.objectId] &&
                  this.canBlock(o, e.object(a.objectId)),
              )
              .map((a) => a.objectId),
          },
        ]),
    );
    this.prompt("declare-blockers", playerId, options);
  }
  answer(action: Extract<MatchAction, { type: "rules-input" }>) {
    const e = this.engine,
      pending = e.rules.pending!,
      combat = e.rules.combat!;
    const selections = action.selections ?? {};
    for (const [id, ids] of Object.entries(selections)) {
      const option = pending.options?.[id];
      if (
        !option ||
        ids.length > 1 ||
        ids.some((target) => !option.objectIds.includes(target))
      )
        throw new RuleViolation("Choose a legal combat declaration.");
    }
    if (pending.kind === "declare-attackers") {
      this.validateAttackers(selections, pending.playerId);
      pending.selections = selections;
      pending.totalCost = this.attackCost(selections, pending.playerId);
      if (Object.values(pending.totalCost).some((amount) => amount > 0)) {
        pending.kind = "attack-payment";
        pending.stage = "payment";
        // A new choice gets a new identifier, so a stale answer is refused.
        pending.id = randomUUID();
        delete pending.options;
        return;
      }
      this.commitAttackers(selections, pending.playerId);
    } else {
      for (const [id, ids] of Object.entries(selections)) {
        if (!ids.length) continue;
        const blocker = e.object(id),
          attacker = combat.attackers.find((a) => a.objectId === ids[0]);
        if (
          !this.eligible(blocker, pending.playerId) ||
          !attacker ||
          attacker.defendingPlayerId !== pending.playerId ||
          !this.canBlock(blocker, e.object(attacker.objectId))
        )
          throw new RuleViolation("Choose a legal blocker.");
        attacker.blockerIds.push(id);
        attacker.blocked = true;
        new EventTriggerObserver(e).collect(
          {
            kind: "block",
            sourceId: id,
            affectedId: id,
            controllerId: blocker.controllerId,
            ownerId: blocker.ownerId,
            after: e.effective(blocker),
          },
          blocker,
          e.battlefieldSources(),
        );
      }
      for (const attacker of combat.attackers)
        if (this.tooManyBlockers(attacker.objectId, attacker.blockerIds.length))
          throw new RuleViolation(
            "This attacker can't be blocked by that many creatures.",
          );
      combat.remainingDefenderIds.shift();
    }
    delete e.rules.pending;
    if (
      pending.kind === "declare-blockers" &&
      combat.remainingDefenderIds.length
    )
      this.nextBlocker();
    else e.checkpoint();
  }
  attackCost(selections: Record<string, string[]>, playerId: string) {
    const e = this.engine;
    const total = { ...emptyMana(), generic: 0 };
    for (const ids of Object.values(selections)) {
      const defenderId = ids[0];
      if (!defenderId || !e.match.players.some((p) => p.id === defenderId))
        continue;
      for (const source of e.battlefieldSources()) {
        if (
          source.controllerId !== defenderId ||
          source.controllerId === playerId
        )
          continue;
        for (const ability of e.abilitiesOf(source)) {
          const tax = attackTax([ability]);
          if (!tax) continue;
          const cost = manaCost(tax);
          for (const type of Object.keys(total) as (keyof typeof total)[])
            total[type] += cost[type];
        }
      }
    }
    return total;
  }
  validateAttackers(selections: Record<string, string[]>, playerId: string) {
    const e = this.engine,
      defenders = this.defenders(playerId);
    for (const [id, ids] of Object.entries(selections)) {
      if (!ids.length) continue;
      if (
        ids.length !== 1 ||
        !this.eligible(e.object(id), playerId, true) ||
        !defenders.some((d) => d.id === ids[0])
      )
        throw new RuleViolation("Choose an eligible attacker and defender.");
    }
    for (const object of e.battlefieldSources()) {
      if (
        !this.eligible(object, playerId, true) ||
        !e.hasKeyword(object, "Must attack") ||
        selections[object.id]?.length
      )
        continue;
      // CR 508.1d: players need not pay an optional cost to satisfy a requirement.
      if (
        defenders.some((d) =>
          Object.values(
            this.attackCost({ [object.id]: [d.id] }, playerId),
          ).every((amount) => amount === 0),
        )
      )
        throw new RuleViolation(
          "An eligible creature must attack this combat.",
        );
    }
  }
  commitAttackers(selections: Record<string, string[]>, playerId: string) {
    const e = this.engine,
      defenders = this.defenders(playerId);
    for (const [id, ids] of Object.entries(selections)) {
      if (!ids.length) continue;
      const attacker = e.object(id),
        defender = defenders.find((d) => d.id === ids[0])!;
      e.rules.combat!.attackers.push({
        objectId: id,
        defenderId: defender.id,
        defendingPlayerId: defender.playerId,
        blockerIds: [],
        blocked: false,
      });
      if (!e.hasKeyword(attacker, "Vigilance")) attacker.status.tapped = true;
      new EventTriggerObserver(e).collect(
        {
          kind: "attack",
          defenderId: defender.id,
          sourceId: id,
          affectedId: id,
          controllerId: playerId,
          ownerId: attacker.ownerId,
          after: e.effective(attacker),
        },
        attacker,
        e.battlefieldSources(),
      );
    }
  }
  payAttackers(action: Extract<MatchAction, { type: "rules-input" }>) {
    const e = this.engine,
      pending = e.rules.pending!;
    if (action.selections || action.variables || action.damageAssignments)
      throw new RuleViolation("Attack choices are locked during payment.");
    this.validateAttackers(pending.selections, pending.playerId);
    if (!payMana(e.rules, pending.playerId, pending.totalCost))
      throw new RuleViolation("The attack costs cannot be paid yet.");
    this.commitAttackers(pending.selections, pending.playerId);
    delete e.rules.pending;
    e.checkpoint({ playerId: pending.playerId });
  }
  damageChoices(): DamageChoice[] {
    const e = this.engine;
    this.prune();
    return (e.rules.combat?.attackers ?? []).flatMap((a) => {
      const attacker = e.object(a.objectId);
      const power = Math.max(0, Number(e.effective(attacker).power) || 0);
      const defended =
        e.match.players.some((p) => p.id === a.defenderId) ||
        !!e.match.objects[a.defenderId];
      if (!power) return [];
      if (!a.blocked)
        return defended
          ? [
              {
                sourceId: a.objectId,
                amount: power,
                recipientIds: [a.defenderId],
              },
            ]
          : [];
      // CR 702.19b: a blocked creature with trample assigns the damage beyond
      // the blockers' lethal damage to the player or planeswalker it attacks;
      // a trampler whose blockers all left assigns all of it there.
      if (!e.hasKeyword(attacker, "Trample") || !defended)
        return a.blockerIds.length
          ? [
              {
                sourceId: a.objectId,
                amount: power,
                recipientIds: a.blockerIds,
              },
            ]
          : [];
      const deathtouch = e.hasKeyword(attacker, "Deathtouch");
      return [
        {
          sourceId: a.objectId,
          amount: power,
          recipientIds: [...a.blockerIds, a.defenderId],
          trample: {
            defenderId: a.defenderId,
            lethal: Object.fromEntries(
              a.blockerIds.map((id) => [id, this.lethal(id, deathtouch)]),
            ),
          },
        },
      ];
    });
  }
  /** CR 120.6: the damage that is lethal to a creature, given its marked damage. */
  lethal(creatureId: string, deathtouch: boolean) {
    return lethalDamage(this.engine.query, creatureId, deathtouch);
  }
  beginDamage() {
    const e = this.engine,
      choices = this.damageChoices();
    if (choices.some((c) => c.recipientIds.length > 1)) {
      e.rules.pending = {
        id: randomUUID(),
        playerId: e.match.turn.activePlayerId,
        kind: "combat-damage",
        stage: "selection",
        targetIds: [],
        selections: {},
        damageChoices: choices,
        totalCost: { ...emptyMana(), generic: 0 },
      };
      delete e.match.priority;
      return;
    }
    this.applyDamage(
      choices.map((c) => ({
        sourceId: c.sourceId,
        recipientId: c.recipientIds[0],
        amount: c.amount,
      })),
    );
  }
  answerDamage(action: Extract<MatchAction, { type: "rules-input" }>) {
    const choices = this.damageChoices(),
      assignments = action.damageAssignments ?? [];
    const pairs = new Set<string>();
    for (const a of assignments) {
      const choice = choices.find((c) => c.sourceId === a.sourceId);
      const pair = `${a.sourceId}:${a.recipientId}`;
      if (
        !Number.isSafeInteger(a.amount) ||
        a.amount < 0 ||
        !choice?.recipientIds.includes(a.recipientId) ||
        pairs.has(pair)
      )
        throw new RuleViolation(
          "Choose legal combat damage recipients and amounts.",
        );
      pairs.add(pair);
    }
    for (const c of choices) {
      const assigned = (id: string) =>
        assignments
          .filter((a) => a.sourceId === c.sourceId && a.recipientId === id)
          .reduce((sum, a) => sum + a.amount, 0);
      if (
        assignments
          .filter((a) => a.sourceId === c.sourceId)
          .reduce((sum, a) => sum + a.amount, 0) !== c.amount
      )
        throw new RuleViolation("Assign all available combat damage.");
      // CR 702.19b: lethal damage to every blocker before any to the defender.
      if (
        c.trample &&
        assigned(c.trample.defenderId) > 0 &&
        Object.entries(c.trample.lethal).some(
          ([blockerId, lethal]) => assigned(blockerId) < lethal,
        )
      )
        throw new RuleViolation(
          "Assign lethal damage to each blocker before assigning damage to the defender.",
        );
    }
    delete this.engine.rules.pending;
    this.applyDamage(assignments);
  }
  applyDamage(assignments: DamageAssignment[]) {
    const e = this.engine;
    const all = [...assignments];
    for (const a of e.rules.combat?.attackers ?? [])
      for (const id of a.blockerIds) {
        const power = Math.max(0, Number(e.effective(e.object(id)).power) || 0);
        if (power)
          all.push({ sourceId: id, recipientId: a.objectId, amount: power });
      }
    e.propose({ kind: "damage", assignments: all, combat: true });
    e.checkpoint();
  }
  prune() {
    const e = this.engine,
      combat = e.rules.combat;
    if (!combat) return;
    const present = (id: string) => {
      const object = e.match.objects[id];
      return (
        object &&
        object.zoneId === e.zone("battlefield").id &&
        e.effective(object).types?.includes("Creature")
      );
    };
    combat.attackers = combat.attackers.filter((a) => {
      if (
        present(a.objectId) &&
        e.object(a.objectId).controllerId === e.match.turn.activePlayerId
      )
        return true;
      // Captured attack triggers retain the last defender, including redirections,
      // when their source leaves combat before the trigger resolves.
      const events = [
        ...(e.rules.waitingTriggers ?? []).map((t) => t.event),
        ...(e.rules.triggerPlacement ?? []).map((t) => t.event),
        ...e
          .zone("stack")
          .objectIds.map((id) => e.object(id).resolution?.event),
      ];
      for (const event of events)
        if (event?.kind === "attack" && event.sourceId === a.objectId)
          event.defenderId = a.defenderId;
      return false;
    });
    for (const a of combat.attackers)
      a.blockerIds = a.blockerIds.filter(
        (id) =>
          present(id) && e.object(id).controllerId === a.defendingPlayerId,
      );
  }
}
