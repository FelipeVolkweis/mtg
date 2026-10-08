import type {
  MatchAction,
  PendingProcedure,
  SelectionOption,
} from "../../../shared/rules-state.js";
import type { PromptKind, PromptTargets } from "../../../shared/model.js";
import { Combat } from "../../match/combat.js";
import type { RulesEngine } from "../../match/rules-engine.js";
import {
  clauseRange,
  modeRange,
  modesOf,
  targetClauses,
} from "../abilities.js";
import { costOptions } from "../costs/cost-runtime.js";
import { PriorityCheckpoint } from "../priority/priority-checkpoint.js";
import { StackProposalProcedure } from "../proposals/stack-proposal.js";
import { StackResolutionRuntime } from "../stack/stack-resolution.js";
import { RuleViolation } from "../rule-violation.js";

// The Procedure Registry (docs/rules-engine.md): every pending
// procedure kind has one handler, so RulesEngine.apply() and input()
// dispatch without branching on procedure kinds. Each handler's state is
// the serializable pending procedure; answers are revalidated against it.

export type RulesInput = Extract<MatchAction, { type: "rules-input" }>;

export interface ProcedureHandler {
  /** Answers the procedure's current choice. */
  input(engine: RulesEngine, action: RulesInput): void;
  /**
   * UI abort. Absent for procedures that can't be aborted: turn-based
   * procedures, resolution choices, trigger and state-based choices.
   */
  abort?(engine: RulesEngine): void;
  /** Rules rollback of a proposal whose locked cost can't be paid. */
  reverse?(engine: RulesEngine): void;
  /** Mana abilities may be activated while the procedure waits for payment. */
  manaWindow(pending: PendingProcedure): boolean;
  /** The objects and choices offered to the responsible player. */
  options(
    engine: RulesEngine,
    pending: PendingProcedure,
  ): Record<string, SelectionOption>;
  /** What the projected prompt asks (docs/rules-engine.md). */
  prompt(engine: RulesEngine, pending: PendingProcedure): PromptBasics;
  /** Is the UI abort offered right now? */
  canAbort?(pending: PendingProcedure): boolean;
  /** Is reversing the proposal offered right now? */
  canReverse?(pending: PendingProcedure): boolean;
}

export interface PromptBasics {
  promptKind: PromptKind;
  title: string;
  targets?: PromptTargets[];
}

const ask = (promptKind: PromptKind, title: string) => (): PromptBasics => ({
  promptKind,
  title,
});

/** Legal targets for each target clause of the waiting ability, by clause id. */
function clauseTargets(
  engine: RulesEngine,
  pending: PendingProcedure,
): PromptTargets[] {
  if (pending.stage !== "targets") return [];
  return targetClauses(pending.ability).map((clause) => ({
    clauseId: clause.id,
    legalIds: engine.legalTargets(
      pending.playerId,
      clause.filter,
      engine.targetSource(pending),
      pending.proposal?.stackObjectId,
    ),
    ...clauseRange(clause),
  }));
}

/** "Choose target" for the usual one target, "Choose targets" otherwise. */
function targetsTitle(targets: PromptTargets[]) {
  return targets.length === 1 && targets[0].max === 1
    ? "Choose target"
    : "Choose targets";
}

/** The opponents a gift could be promised to, as a choice among player ids. */
function giftOptions(engine: RulesEngine): Record<string, SelectionOption> {
  const recipients = new StackProposalProcedure(engine).giftRecipients();
  return {
    gift: {
      count: 1,
      minCount: 0,
      objectIds: recipients,
      labels: Object.fromEntries(
        recipients.map((id) => [
          id,
          engine.match.players.find((p) => p.id === id)!.name,
        ]),
      ),
      label: "Promise a gift to",
    },
  };
}

/** The modes a waiting ability offers, as a choice among mode ids. */
function modeOptions(
  pending: PendingProcedure,
): Record<string, SelectionOption> {
  const modes = modesOf(pending.ability);
  if (!modes || pending.stage !== "modes") return {};
  const { min, max } = modeRange(modes);
  return {
    modes: {
      count: max,
      minCount: min,
      objectIds: modes.options.map((option) => option.id),
      labels: Object.fromEntries(
        modes.options.map((option) => [option.id, option.label]),
      ),
      label: "Choose modes",
    },
  };
}

const stored = (_: RulesEngine, pending: PendingProcedure) =>
  pending.options ?? {};
const never = () => false;
const paying = (pending: PendingProcedure) => pending.stage === "payment";

/** Casting a spell or activating an ability (CR 601, 602). */
const proposal: ProcedureHandler = {
  input: (engine, action) => new StackProposalProcedure(engine).input(action),
  abort: (engine) => new StackProposalProcedure(engine).cancel(),
  reverse: (engine) => new StackProposalProcedure(engine).reverse(),
  manaWindow: paying,
  options: (engine, pending) =>
    pending.stage === "gift"
      ? giftOptions(engine)
      : pending.stage === "modes"
        ? modeOptions(pending)
        : costOptions(engine, {
            ...engine.costProposal(pending),
            totalCost: pending.totalCost,
          }),
  prompt: (engine, pending) =>
    pending.stage === "gift"
      ? { promptKind: "promise-gift", title: "Promise a gift?" }
      : pending.stage === "modes"
        ? { promptKind: "choose-modes", title: "Choose modes" }
        : pending.stage === "variable"
          ? { promptKind: "choose-x", title: "Choose X" }
          : pending.stage === "targets"
            ? (() => {
                const targets = clauseTargets(engine, pending);
                return {
                  promptKind: "choose-targets" as const,
                  title: targetsTitle(targets),
                  targets,
                };
              })()
            : pending.stage === "division"
              ? { promptKind: "divide-damage", title: "Divide damage" }
              : { promptKind: "pay-costs", title: "Pay costs" },
  canAbort: (pending) => !pending.proposal?.locked,
  canReverse: (pending) => !!pending.proposal?.locked,
};

/** A resolving spell or ability's choice (CR 608.2), including a may-pay payment. */
const resolution: ProcedureHandler = {
  input: (engine, action) => new StackResolutionRuntime(engine).answer(action),
  manaWindow: paying,
  options: stored,
  prompt: (_, pending) => ({
    promptKind: paying(pending) ? "resolution-payment" : "resolution-choice",
    title: "Resolve spell or ability",
  }),
};

const triggerOrder: ProcedureHandler = {
  input: (engine, action) =>
    new PriorityCheckpoint(engine).answerTriggerOrder(action),
  manaWindow: never,
  options: stored,
  prompt: ask("order-triggers", "Order simultaneous triggers"),
};

const triggerTarget: ProcedureHandler = {
  input: (engine, action) =>
    new PriorityCheckpoint(engine).answerTriggerTarget(action),
  manaWindow: never,
  options: (_, pending) =>
    pending.stage === "modes" ? modeOptions(pending) : {},
  prompt: (engine, pending) =>
    pending.stage === "modes"
      ? { promptKind: "choose-modes", title: "Choose modes" }
      : (() => {
          const targets = clauseTargets(engine, pending);
          return {
            promptKind: "trigger-targets" as const,
            title: targetsTitle(targets),
            targets,
          };
        })(),
};

/** A State-Based Rule's choice, such as a commander return (CR 903.9a). */
const stateBasedChoice: ProcedureHandler = {
  input: (engine, action) =>
    new PriorityCheckpoint(engine).answerStateBased(action),
  manaWindow: never,
  options: stored,
  prompt: (_, pending) =>
    pending.stateBasedRule === "commander-return"
      ? { promptKind: "commander-return", title: "Commander return" }
      : { promptKind: "state-based-choice", title: "Required choice" },
};

const declaration: ProcedureHandler = {
  input: (engine, action) => new Combat(engine).answer(action),
  manaWindow: never,
  options: stored,
  prompt: (_, pending) =>
    pending.kind === "declare-attackers"
      ? { promptKind: "declare-attackers", title: "Declare attackers" }
      : { promptKind: "declare-blockers", title: "Declare blockers" },
};

const attackPayment: ProcedureHandler = {
  input: (engine, action) => new Combat(engine).payAttackers(action),
  // Aborting the payment returns to declaring attackers.
  abort(engine) {
    delete engine.rules.pending;
    new Combat(engine).beginAttackers();
  },
  manaWindow: paying,
  options: stored,
  prompt: ask("attack-payment", "Pay attack costs"),
  canAbort: () => true,
};

const combatDamage: ProcedureHandler = {
  input: (engine, action) => new Combat(engine).answerDamage(action),
  manaWindow: never,
  options: stored,
  prompt: ask("combat-damage", "Assign combat damage"),
};

/** CR 514.1: the active player discards down to maximum hand size. */
const cleanupDiscard: ProcedureHandler = {
  input(engine, action) {
    const playerId = engine.rules.pending!.playerId;
    if (action.variables || action.targetIds)
      throw new RuleViolation(
        "Choose the required cards to discard for cleanup.",
      );
    const hand = engine.zone("hand", playerId);
    const ids = action.selections?.discard ?? [];
    if (
      ids.length !== hand.objectIds.length - engine.maximumHandSize(playerId) ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !hand.objectIds.includes(id))
    )
      throw new RuleViolation(
        "Choose the required cards to discard for cleanup.",
      );
    for (const id of ids)
      engine.propose({
        kind: "zone-change",
        objectId: id,
        to: engine.zone("graveyard", playerId),
      });
    delete engine.rules.pending;
    engine.turn.cleanup();
  },
  manaWindow: never,
  options(engine, pending) {
    const hand = engine.zone("hand", pending.playerId);
    return {
      discard: {
        count: hand.objectIds.length - engine.maximumHandSize(pending.playerId),
        objectIds: [...hand.objectIds],
      },
    };
  },
  prompt: ask("cleanup-discard", "Cleanup discard"),
};

/**
 * A commander replacement prompt (CR 903.9b) is answered by MatchService,
 * which replays the interrupted command with the answer.
 */
const commanderReplacement: ProcedureHandler = {
  input() {
    throw new RuleViolation("Complete your current commander return choice.");
  },
  manaWindow: never,
  options: stored,
  prompt: ask("commander-return", "Commander return"),
};

const handlers: Record<PendingProcedure["kind"], ProcedureHandler> = {
  cast: proposal,
  activate: proposal,
  resolve: resolution,
  "trigger-order": triggerOrder,
  "trigger-target": triggerTarget,
  "state-based-choice": stateBasedChoice,
  "declare-attackers": declaration,
  "declare-blockers": declaration,
  "attack-payment": attackPayment,
  "combat-damage": combatDamage,
  cleanup: cleanupDiscard,
  "commander-return": commanderReplacement,
};

/** The handler for a pending procedure; a State-Based Rule's choice first. */
export function procedureHandler(pending: PendingProcedure): ProcedureHandler {
  return pending.stateBasedRule ? stateBasedChoice : handlers[pending.kind];
}
