import { randomUUID } from "node:crypto";
import type {
  GameObject,
  MatchAction,
  MatchState,
  PendingProcedure,
  ProposalRecord,
} from "../../../shared/rules-state.js";
import type { Ability, Selector, ZoneKind } from "../../../shared/card-dsl.js";
import {
  choosesX,
  dividedDamage,
  enchantFilter,
  flattenModes,
  giftOf,
  modeRange,
  modesOf,
  oncePerTurn,
  targetClauses,
} from "../abilities.js";
import { chosenTargets, flatTargets } from "../targets.js";
import { gameObject } from "../../match/game-objects.js";
import { zoneById } from "../../match/zones.js";
import { CommanderRules } from "../../match/commander-rules.js";
import type { RulesEngine } from "../../match/rules-engine.js";
import { baseCost, chosenCost } from "../costs/cost-runtime.js";
import { RuleViolation } from "../rule-violation.js";
import { atCastKey, atCastValues } from "../ast.js";
import { Evaluator } from "../vm/evaluate.js";
import { StackResolutionRuntime } from "../stack/stack-resolution.js";

// The Stack Proposal Procedure (docs/rules-engine.md). Casting a
// spell and activating an ability share one CR 601/602 process: the spell or
// ability is on the Stack from the start, choices are announced, the total
// cost is determined and locked, mana abilities may be activated, and the
// cost is paid. A proposal that is abandoned is rolled back to the Match as
// it was before it began.

type Input = Extract<MatchAction, { type: "rules-input" }>;
type Proposing = PendingProcedure & {
  proposal: NonNullable<PendingProcedure["proposal"]>;
};

const newRecord = (sourceZone?: ZoneKind): ProposalRecord => ({
  ...(sourceZone ? { sourceZone } : {}),
  variables: {},
  modes: [],
  optionalCosts: [],
  manaSpent: [],
});

/** What differs between a spell proposal and an activated ability proposal. */
interface Specialization {
  /** CR 601.2i / 602.2i: the spell becomes cast, or the ability activated. */
  finalize(
    engine: RulesEngine,
    pending: Proposing,
    stacked: GameObject,
    sourceSnapshot: NonNullable<
      NonNullable<GameObject["resolution"]>["sourceSnapshot"]
    >,
  ): void;
}

const spellProposal: Specialization = {
  finalize(engine, pending, spell) {
    if (spell.proposal?.sourceZone === "command") {
      engine.rules.commanderCasts ??= {};
      const instance = new CommanderRules(engine).instance(spell)!;
      engine.rules.commanderCasts[instance] =
        (engine.rules.commanderCasts[instance] ?? 0) + 1;
    }
    spell.resolution = {
      ability: pending.ability!,
      targetIds: pending.targetIds,
      ...(pending.targets ? { targets: pending.targets } : {}),
      ...(pending.division ? { division: pending.division } : {}),
    };
    engine.emit("cast", spell);
  },
};

const abilityProposal: Specialization = {
  finalize(engine, pending, object, sourceSnapshot) {
    if (oncePerTurn(pending.ability)) {
      engine.rules.thisTurn.activationUsage[
        `${pending.sourceId}:${pending.abilityId}`
      ] = 1;
    }
    object.resolution = {
      sourceSnapshot,
      ability: pending.ability!,
      targetIds: pending.targetIds,
      ...(pending.targets ? { targets: pending.targets } : {}),
      ...(pending.division ? { division: pending.division } : {}),
      color: pending.color,
    };
  },
};

const specializations: Record<"cast" | "activate", Specialization> = {
  cast: spellProposal,
  activate: abilityProposal,
};

/** Puts the Match back exactly as `base` recorded it; the revision moves on. */
function restore(match: MatchState, base: MatchState) {
  const revision = match.revision;
  for (const key of Object.keys(match)) Reflect.deleteProperty(match, key);
  Object.assign(match, base);
  match.revision = revision;
}

export class StackProposalProcedure {
  constructor(readonly engine: RulesEngine) {}

  private get pending(): Proposing {
    const pending = this.engine.rules.pending;
    if (!pending?.proposal) throw new Error("No spell or ability is proposed.");
    return pending as Proposing;
  }

  /** The Match before the proposal began, for rollback. */
  private snapshot(): MatchState {
    return structuredClone(this.engine.match);
  }

  /**
   * CR 601.2a: the card moves from where it is cast to the Stack. A card an
   * effect lets you cast without paying its mana cost (CR 118.9) is cast from
   * your Hand or from exile, at any time the effect resolves.
   */
  cast(playerId: string, objectId: string, options: { free?: boolean } = {}) {
    const e = this.engine;
    const source = e.object(objectId);
    const free = !!options.free;
    if (
      (source.zoneId !== e.zone("hand", playerId).id &&
        !(
          source.zoneId === e.zone("command").id &&
          source.controllerId === playerId &&
          new CommanderRules(e).instance(source)
        ) &&
        !(
          free &&
          source.zoneId === e.zone("exile").id &&
          source.ownerId === playerId
        )) ||
      source.characteristics.types?.includes("Land")
    )
      throw new RuleViolation("Choose a spell from your Hand.");
    if (!free && !e.canCastTiming(source, playerId))
      throw new RuleViolation(
        "This spell requires your main phase and an empty Stack.",
      );
    const definition = e.definition(source);
    const spellAbilities =
      definition?.abilities.filter((ability) => ability.kind === "spell") ?? [];
    if (spellAbilities.length > 1)
      throw new RuleViolation("This spell composition is not yet supported.");
    // A permanent spell has no spell ability; an Aura spell targets what it
    // can enchant (CR 303.4a).
    const aura = enchantFilter(definition?.abilities ?? []);
    const ability: Ability = spellAbilities[0] ?? {
      id: "cast",
      kind: "spell",
      ...(aura ? { targets: [{ id: "target-0", filter: aura }] } : {}),
    };
    const symbols: string[] =
      source.characteristics.manaCost?.match(/\{[^{}]+\}/g) ?? [];
    if (!symbols.length && !free)
      throw new RuleViolation(
        "A spell without a mana cost cannot be cast normally.",
      );
    if (symbols.includes("{X}") && !choosesX(ability))
      throw new RuleViolation(
        "Variable mana costs require an authored chosen value.",
      );
    const base = this.snapshot();
    const sourceZone = zoneById(e.match, source.zoneId)!.kind;
    const spell = e.propose({
      kind: "zone-change",
      objectId,
      to: e.zone("stack"),
      cause: "cast",
    }).object!;
    spell.proposal = newRecord(sourceZone);
    if (free) {
      spell.proposal.alternativeCost = "free";
      // CR 107.3b: an X the cost doesn't pay is 0.
      if (choosesX(ability)) spell.proposal.variables.X = 0;
    }
    // CR 601.2: values "as you cast this spell" are fixed now.
    const caster = new Evaluator(e.query, {
      playerId,
      sourceId: spell.id,
    });
    for (const value of atCastValues(ability))
      spell.proposal.variables[atCastKey(value)] = caster.value(value);
    this.begin({
      id: randomUUID(),
      playerId,
      kind: "cast",
      stage: "payment",
      sourceId: spell.id,
      ability: structuredClone(ability),
      targetIds: [],
      selections: {},
      totalCost: baseCost({ use: "cast", source: spell, ability }),
      proposal: { stackObjectId: spell.id, locked: false, base },
    });
  }

  /** CR 602.2a: the ability is created on the Stack as an Ability Game Object. */
  activate(
    playerId: string,
    source: GameObject,
    ability: Ability,
    color?: PendingProcedure["color"],
  ) {
    const e = this.engine;
    const base = this.snapshot();
    const object = gameObject(
      "ability",
      e.zone("stack").id,
      playerId,
      playerId,
      {
        name: `${source.characteristics.name}: ${ability.id}`,
        colors: [],
        typeLine: "Ability",
        rulesText: "",
      },
    );
    object.sourceObjectId = source.id;
    object.sourceAbilityId = ability.id;
    object.proposal = newRecord();
    e.propose({ kind: "create", object, zone: e.zone("stack") });
    this.begin({
      id: randomUUID(),
      playerId,
      kind: "activate",
      stage: "payment",
      sourceId: source.id,
      abilityId: ability.id,
      ability,
      targetIds: [],
      selections: {},
      color,
      totalCost: baseCost({ use: "activate", source, ability }),
      proposal: { stackObjectId: object.id, locked: false, base },
    });
  }

  /**
   * CR 601.2b–c: announce the modes, then X, then choose targets; otherwise
   * lock and pay.
   */
  private begin(pending: Proposing) {
    this.engine.rules.pending = pending;
    if (this.giftRecipients().length) {
      pending.stage = "gift";
      return;
    }
    this.afterGift(pending);
  }

  private afterGift(pending: Proposing) {
    if (modesOf(pending.ability)) {
      pending.stage = "modes";
      return;
    }
    this.afterModes(pending);
  }

  /** The opponents a gift could be promised to, while the spell offers one. */
  giftRecipients() {
    const e = this.engine;
    const pending = this.pending;
    if (pending.kind !== "cast") return [];
    const source = e.object(pending.sourceId!);
    if (!giftOf(e.abilitiesOf(source))) return [];
    return e.match.players
      .filter((p) => p.id !== pending.playerId && p.outcome === "playing")
      .map((p) => p.id);
  }

  /** CR 702.174a: as the spell is cast, its controller may promise an opponent a gift. */
  private promiseGift(action: Input) {
    const pending = this.pending;
    const recipients = this.giftRecipients();
    if (action.confirm !== false) {
      const chosen = action.selections?.gift ?? [];
      const recipient = chosen.length ? chosen[0] : recipients[0];
      if (
        chosen.length > 1 ||
        !recipients.includes(recipient) ||
        (!chosen.length && recipients.length > 1)
      )
        throw new RuleViolation("Choose an opponent to promise the gift to.");
      this.record().optionalCosts.push("gift");
      this.record().gift = recipient;
    }
    pending.id = randomUUID();
    this.afterGift(pending);
  }

  private afterModes(pending: Proposing) {
    const clauses = targetClauses(pending.ability);
    const chooseX =
      choosesX(pending.ability) && this.record().alternativeCost !== "free";
    pending.stage = chooseX
      ? "variable"
      : clauses.length
        ? "targets"
        : "payment";
    if (clauses.length && !this.targetsPossible())
      throw new RuleViolation("No legal targets are available.");
    if (!chooseX && !clauses.length) {
      this.lock();
      this.complete();
    }
  }

  /** Every target clause that takes a target has enough legal ones. */
  private targetsPossible() {
    const pending = this.pending;
    return this.engine.targetsAvailable(
      pending.playerId,
      { ...pending.ability!, modes: undefined } as Ability,
      this.engine.targetSource(pending),
      pending.proposal.stackObjectId,
    );
  }

  private record() {
    return this.engine.object(this.pending.proposal.stackObjectId).proposal!;
  }

  /** CR 700.2: the chosen modes decide the targets and instructions. */
  private chooseModes(action: Input) {
    const pending = this.pending;
    const modes = modesOf(pending.ability)!;
    const ids = action.modes ?? [];
    const { min, max } = modeRange(modes);
    if (
      ids.length < min ||
      ids.length > max ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !modes.options.some((option) => option.id === id))
    )
      throw new RuleViolation(
        `Choose ${min === max ? min : `${min} to ${max}`} distinct modes.`,
      );
    this.record().modes = modes.options
      .filter((option) => ids.includes(option.id))
      .map((option) => option.id);
    pending.ability = flattenModes(pending.ability!, ids);
    pending.id = randomUUID();
    this.afterModes(pending);
  }

  /** CR 601.2d: the damage divided among the targets, once they are chosen. */
  private beginDivision() {
    const e = this.engine;
    const pending = this.pending;
    const effect = dividedDamage(pending.ability);
    if (!effect) return false;
    const stack = e.object(pending.proposal.stackObjectId);
    const evaluator = new Evaluator(e.query, {
      playerId: pending.playerId,
      sourceId: stack.id,
      targets: pending.targets,
      targetIds: pending.targetIds,
      bindings: stack.proposal?.variables,
    });
    const recipientIds = evaluator
      .objects(effect.to as Selector)
      .filter((id) => !!e.match.objects[id]);
    const amount = evaluator.value(effect.amount);
    if (!recipientIds.length) return false;
    if (recipientIds.length > amount)
      throw new RuleViolation(
        "Choose no more targets than there is damage to divide.",
      );
    pending.damageChoices = [{ sourceId: stack.id, amount, recipientIds }];
    pending.division = Object.fromEntries(recipientIds.map((id) => [id, 0]));
    if (recipientIds.length === 1) {
      pending.division = { [recipientIds[0]]: amount };
      return false;
    }
    return true;
  }

  private divide(action: Input) {
    const pending = this.pending;
    const [choice] = pending.damageChoices ?? [];
    const assignments = action.damageAssignments ?? [];
    const division: Record<string, number> = {};
    for (const a of assignments) {
      if (
        a.sourceId !== choice.sourceId ||
        !choice.recipientIds.includes(a.recipientId) ||
        a.recipientId in division
      )
        throw new RuleViolation("Divide the damage among the targets.");
      division[a.recipientId] = a.amount;
    }
    // CR 601.2d: each target is assigned at least 1 and all the damage is divided.
    if (
      choice.recipientIds.some((id) => !(division[id] >= 1)) ||
      Object.values(division).reduce((sum, n) => sum + n, 0) !== choice.amount
    )
      throw new RuleViolation(
        `Divide all ${choice.amount} damage, at least 1 to each target.`,
      );
    pending.division = division;
    delete pending.damageChoices;
    pending.stage = "payment";
    pending.id = randomUUID();
  }

  /** CR 601.2f–g: determine the total cost and lock it. */
  private lock() {
    const pending = this.pending;
    this.engine.lockCost(pending);
    pending.proposal.locked = true;
  }

  input(action: Input) {
    this.answer(action);
    this.resumeResolution();
  }

  /**
   * A spell cast while another resolved (a free play) was the instruction the
   * resolution waited on: once it is cast, the resolution goes on.
   */
  private resumeResolution() {
    const e = this.engine;
    if (!e.rules.pending && e.rules.resolving?.waiting)
      new StackResolutionRuntime(e).resume();
  }

  private answer(action: Input) {
    const pending = this.pending;
    if (pending.stage === "gift") {
      this.promiseGift(action);
      return;
    }
    if (pending.stage === "modes") {
      this.chooseModes(action);
      return;
    }
    if (pending.stage === "division") {
      this.divide(action);
      if (
        action.confirm !== false &&
        !this.complete() &&
        action.confirm === true
      )
        throw new RuleViolation("The complete costs cannot be paid yet.");
      return;
    }
    if (pending.stage === "variable") {
      const value = action.variables?.X;
      if (
        value === undefined ||
        !Number.isSafeInteger(value) ||
        value < 0 ||
        value > 1000 ||
        Object.keys(action.variables ?? {}).some((key) => key !== "X")
      )
        throw new RuleViolation(
          "Choose a nonnegative integer for X, at most 1000.",
        );
      this.record().variables = { ...this.record().variables, X: value };
      pending.totalCost = chosenCost(this.engine.costProposal(pending));
      const targets = targetClauses(pending.ability).length > 0;
      pending.stage = targets ? "targets" : "payment";
      if (!targets) this.lock();
      pending.id = randomUUID();
      return;
    }
    if (action.variables)
      throw new RuleViolation("The chosen Variable Values are locked.");
    if (action.color) pending.color = action.color;
    if (action.selections) pending.selections = action.selections;
    if (pending.stage === "targets") {
      const chosen = chosenTargets(
        this.engine,
        action,
        pending.ability,
        pending.playerId,
        this.engine.targetSource(pending),
        pending.proposal.stackObjectId,
      );
      pending.targets = chosen;
      pending.targetIds = flatTargets(chosen);
      this.lock();
      pending.stage = "payment";
      if (this.beginDivision()) {
        pending.stage = "division";
        pending.id = randomUUID();
        return;
      }
    }
    if (action.confirm !== false && !this.complete() && action.confirm === true)
      throw new RuleViolation("The complete costs cannot be paid yet.");
  }

  /**
   * CR 601.2h–i: pays the locked total cost and finalizes the proposal.
   * Returns false, changing nothing, while the cost can't be paid yet.
   */
  complete(): boolean {
    const e = this.engine;
    const pending = this.pending;
    const source = e.object(pending.sourceId!);
    const sourceSnapshot = {
      characteristics: e.effective(source),
      ownerId: source.ownerId,
    };
    const spent = e.pay(pending);
    if (!spent) return false;
    const stacked = e.object(pending.proposal.stackObjectId);
    stacked.proposal!.manaSpent = spent;
    specializations[pending.kind as "cast" | "activate"].finalize(
      e,
      pending,
      stacked,
      sourceSnapshot,
    );
    e.targeted(stacked);
    delete e.rules.pending;
    // A spell cast during a resolution waits: that resolution ends first, and
    // then the Priority Checkpoint places what triggered.
    if (!e.rules.resolving) e.checkpoint({ playerId: pending.playerId });
    return true;
  }

  /** UI abort: only before the total cost is locked. */
  cancel() {
    if (this.pending.proposal.locked)
      throw new RuleViolation(
        "The total cost is locked: complete the payment, or reverse the action if it can't be paid.",
      );
    this.rollback();
  }

  /**
   * Rules rollback: after the total cost is locked, a proposal its
   * player can't complete is reversed as an illegal action.
   */
  reverse() {
    if (!this.pending.proposal.locked)
      throw new RuleViolation(
        "The total cost isn't locked yet: cancel the action instead.",
      );
    this.rollback();
  }

  /** The Match returns to how it was before the proposal began. */
  private rollback() {
    restore(this.engine.match, this.pending.proposal.base);
  }
}
