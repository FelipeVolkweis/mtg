import { randomUUID } from "node:crypto";
import type {
  GameObject,
  MatchAction,
  MatchState,
  PendingProcedure,
  ProposalRecord,
} from "../../../shared/rules-state.js";
import type { Ability, ZoneKind } from "../../../shared/card-dsl.js";
import {
  choosesX,
  enchantFilter,
  oncePerTurn,
  targetFilter,
} from "../abilities.js";
import { gameObject } from "../../match/game-objects.js";
import { CommanderRules } from "../../match/commander-rules.js";
import type { RulesEngine } from "../../match/rules-engine.js";
import { baseCost, chosenCost } from "../costs/cost-runtime.js";
import { RuleViolation } from "../rule-violation.js";

// The Stack Proposal Procedure (rules-engine-refactor.md §13–16). Casting a
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
    };
    engine.emit("cast", spell);
  },
};

const abilityProposal: Specialization = {
  finalize(engine, pending, object, sourceSnapshot) {
    if (oncePerTurn(pending.ability)) {
      engine.rules.activationUsage ??= {};
      engine.rules.activationUsage[`${pending.sourceId}:${pending.abilityId}`] =
        1;
    }
    object.resolution = {
      sourceSnapshot,
      ability: pending.ability!,
      targetIds: pending.targetIds,
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

  /** CR 601.2a: the card moves from where it is cast to the Stack. */
  cast(playerId: string, objectId: string) {
    const e = this.engine;
    const source = e.object(objectId);
    if (
      (source.zoneId !== e.zone("hand", playerId).id &&
        !(
          source.zoneId === e.zone("command").id &&
          source.controllerId === playerId &&
          new CommanderRules(e).instance(source)
        )) ||
      source.characteristics.types?.includes("Land")
    )
      throw new RuleViolation("Choose a spell from your Hand.");
    if (!e.canCastTiming(source, playerId))
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
    if (!symbols.length)
      throw new RuleViolation(
        "A spell without a mana cost cannot be cast normally.",
      );
    if (symbols.includes("{X}") && !choosesX(ability))
      throw new RuleViolation(
        "Variable mana costs require an authored chosen value.",
      );
    const base = this.snapshot();
    const sourceZone = e.match.zones.find((z) => z.id === source.zoneId)!.kind;
    const spell = e.propose({
      kind: "zone-change",
      objectId,
      to: e.zone("stack"),
      cause: "cast",
    }).object!;
    spell.proposal = newRecord(sourceZone);
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

  /** CR 601.2b–c: announce X, then choose targets; otherwise lock and pay. */
  private begin(pending: Proposing) {
    const target = targetFilter(pending.ability);
    const chooseX = choosesX(pending.ability);
    pending.stage = chooseX ? "variable" : target ? "targets" : "payment";
    this.engine.rules.pending = pending;
    if (target && !this.legalTargets().length)
      throw new RuleViolation("No legal targets are available.");
    if (!chooseX && !target) {
      this.lock();
      this.complete();
    }
  }

  /** Legal targets for the proposal; a spell or ability can't target itself (CR 115.5). */
  legalTargets() {
    const pending = this.pending;
    const filter = targetFilter(pending.ability);
    if (!filter) return [];
    return this.engine.legalTargets(
      pending.playerId,
      filter,
      this.engine.targetSource(pending),
      pending.proposal.stackObjectId,
    );
  }

  private record() {
    return this.engine.object(this.pending.proposal.stackObjectId).proposal!;
  }

  /** CR 601.2f–g: determine the total cost and lock it. */
  private lock() {
    const pending = this.pending;
    this.engine.lockCost(pending);
    pending.proposal.locked = true;
  }

  input(action: Input) {
    const pending = this.pending;
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
      this.record().variables = { X: value };
      pending.totalCost = chosenCost(this.engine.costProposal(pending));
      const target = targetFilter(pending.ability);
      pending.stage = target ? "targets" : "payment";
      if (!target) this.lock();
      pending.id = randomUUID();
      return;
    }
    if (action.variables)
      throw new RuleViolation("The chosen Variable Values are locked.");
    if (action.color) pending.color = action.color;
    if (action.selections) pending.selections = action.selections;
    if (pending.stage === "targets") {
      const targets = action.targetIds ?? [];
      if (targets.length !== 1 || !this.legalTargets().includes(targets[0]))
        throw new RuleViolation("Choose one legal target.");
      pending.targetIds = targets;
      this.lock();
      pending.stage = "payment";
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
      ownerId: e.owner(source),
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
    e.checkpoint({ playerId: pending.playerId });
    return true;
  }

  /** UI abort (§16): only before the total cost is locked. */
  cancel() {
    if (this.pending.proposal.locked)
      throw new RuleViolation(
        "The total cost is locked: complete the payment, or reverse the action if it can't be paid.",
      );
    this.rollback();
  }

  /**
   * Rules rollback (§16): after the total cost is locked, a proposal its
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
