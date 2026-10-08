import { randomUUID } from "node:crypto";
import type { Catalog, Participant } from "../../shared/model.js";
import type {
  GameObject,
  ManaPool,
  MatchAction,
  MatchPlayer,
  MatchState,
  PendingProcedure,
  SelectionOption,
} from "../../shared/rules-state.js";
import type {
  Ability,
  Condition,
  Effect,
  ManaProduction,
  ManaType,
  Predicate,
  Value,
  ZoneKind,
} from "../../shared/card-dsl.js";
import {
  activatable,
  activationZone,
  castPermissions,
  choosesX,
  costsOf,
  enchantFilter,
  isDiesTrigger,
  isManaAbility,
  manaSymbols,
  oncePerTurn,
  production,
  sorceryTiming,
  targetFilter,
  unlimitedHandSize,
} from "../rules/abilities.js";
import type {
  EventResult,
  ProposedEvent,
  RulesMutator,
  RulesQuery,
} from "../rules/context.js";
import { EventRuntime } from "../rules/events/event-runtime.js";
import { Evaluator } from "../rules/vm/evaluate.js";
import { scopeBindings } from "../rules/vm/rule-vm.js";
import { gameObject } from "./game-objects.js";
import { manaCost } from "./mana.js";
import { Library } from "./zones.js";
import { CharacteristicsCalculator } from "./characteristics.js";
import { Combat } from "./combat.js";
import { mainTiming, TurnStructure } from "./turn-structure.js";
import { actingPlayer } from "./match-players.js";
import { StackResolutionRuntime } from "../rules/stack/stack-resolution.js";
import { StackProposalProcedure } from "../rules/proposals/stack-proposal.js";
import { procedureHandler } from "../rules/procedures/registry.js";
import {
  costOptions,
  determineCost,
  pay,
  type CostProposal,
} from "../rules/costs/cost-runtime.js";
import {
  PriorityCheckpoint,
  type PriorityGrant,
} from "../rules/priority/priority-checkpoint.js";
import {
  EventTriggerObserver,
  waitTrigger,
} from "../rules/triggers/trigger-runtime.js";
import { RuleViolation } from "../rules/rule-violation.js";

export const emptyMana = (): ManaPool => ({
  W: 0,
  U: 0,
  B: 0,
  R: 0,
  G: 0,
  C: 0,
});

export class RulesEngine implements RulesMutator {
  constructor(
    readonly match: MatchState,
    readonly catalog: Catalog,
  ) {}
  /** The rules state; a rolled-back proposal replaces it, so it's read live. */
  get rules() {
    return this.match.rules;
  }
  /** The read-only rules context (rules-engine-refactor.md §6). */
  get query(): RulesQuery {
    return {
      match: this.match,
      catalog: this.catalog,
      object: (id) => this.object(id),
      zone: (kind, playerId) => this.zone(kind, playerId),
      owner: (object) => this.owner(object),
      effective: (object) => this.effective(object),
      definition: (object) => this.definition(object),
      matches: (object, predicate, playerId, sourceId) =>
        new Evaluator(this.query, { playerId, sourceId }).matches(
          object,
          predicate,
        ),
    };
  }
  propose(event: ProposedEvent): EventResult {
    return new EventRuntime(this).propose(event);
  }
  zone(kind: ZoneKind, playerId?: string) {
    const zone = this.match.zones.find(
      (z) => z.kind === kind && (!playerId || z.ownerId === playerId),
    );
    if (!zone) throw new Error("Zone not found.");
    return zone;
  }
  apply(participant: Pick<Participant, "id">, action: MatchAction): void {
    const player = actingPlayer(this.match, participant.id);
    if (!player) throw new RuleViolation("Only a Match Player may act.");
    if (this.match.outcome !== "ongoing")
      throw new RuleViolation("This Match is complete.");
    if (this.rules.setup.keptPlayerIds.length < this.match.players.length) {
      this.opening(player, action);
    } else if (this.rules.pending) {
      const pending = this.rules.pending;
      if (pending.playerId !== player.id)
        throw new RuleViolation(
          "Another player must complete the pending choice.",
        );
      const handler = procedureHandler(pending);
      const current =
        "procedureId" in action && action.procedureId === pending.id;
      if (action.type === "rules-input" && current) handler.input(this, action);
      else if (
        action.type === "activate-ability" &&
        handler.manaWindow(pending)
      )
        this.activate(player.id, action, true);
      else if (action.type === "cancel-procedure" && current && handler.abort)
        handler.abort(this);
      else if (action.type === "reverse-proposal" && current && handler.reverse)
        handler.reverse(this);
      else
        throw new RuleViolation(
          "Complete the current procedure using its latest identifier.",
        );
    } else {
      this.requirePriority(player.id);
      if (action.type === "pass-priority") this.pass(player.id);
      else if (action.type === "play-land")
        this.playLand(player.id, action.objectId);
      else if (action.type === "cast-spell")
        new StackProposalProcedure(this).cast(player.id, action.objectId);
      else if (action.type === "activate-ability")
        this.activate(player.id, action);
      else throw new RuleViolation("Use a legal rules action.");
    }
    this.match.revision++;
  }
  opening(player: MatchPlayer, action: MatchAction) {
    if (this.rules.setup.keptPlayerIds.includes(player.id))
      throw new RuleViolation("Your opening Hand is already kept.");
    const hand = this.zone("hand", player.id),
      library = this.zone("library", player.id);
    if (action.type === "mulligan" && action.playerId === player.id) {
      if (player.mulliganCount >= 7)
        throw new RuleViolation("No further mulligans are available.");
      for (const id of [...hand.objectIds])
        this.propose({
          kind: "zone-change",
          objectId: id,
          to: library,
          cause: "setup",
        });
      new Library(library).shuffle(player.id);
      this.draw(player.id, 7);
      player.mulliganCount++;
    } else if (action.type === "keep-hand") {
      if (
        action.bottomIds.length !== player.mulliganCount ||
        new Set(action.bottomIds).size !== action.bottomIds.length ||
        action.bottomIds.some((id) => !hand.objectIds.includes(id))
      )
        throw new RuleViolation(
          `Choose ${player.mulliganCount} cards from your Hand to put on the bottom.`,
        );
      for (const id of action.bottomIds)
        this.propose({
          kind: "zone-change",
          objectId: id,
          to: library,
          cause: "setup",
        });
      this.rules.setup.keptPlayerIds.push(player.id);
      if (this.rules.setup.keptPlayerIds.length === this.match.players.length)
        this.turn.begin();
    } else
      throw new RuleViolation(
        "Keep or mulligan your opening Hand before play.",
      );
  }
  requirePriority(playerId: string) {
    if (this.match.priority?.playerId !== playerId)
      throw new RuleViolation("You do not have Priority.");
  }
  /**
   * A player would receive Priority: every grant goes through the Priority
   * Checkpoint (rules-engine-refactor.md §11).
   */
  checkpoint(grant: PriorityGrant = {}) {
    new PriorityCheckpoint(this).run(grant);
  }
  pass(playerId: string) {
    const priority = this.match.priority!;
    priority.passedPlayerIds.push(playerId);
    if (priority.passedPlayerIds.length < this.match.players.length) {
      const index = this.match.turn.order.indexOf(playerId);
      this.checkpoint({
        playerId:
          this.match.turn.order[(index + 1) % this.match.turn.order.length],
        passedPlayerIds: priority.passedPlayerIds,
      });
      return;
    }
    if (this.zone("stack").objectIds.length) {
      this.resolve();
      return;
    }
    if (this.match.turn.step === "cleanup") this.turn.cleanup();
    else this.turn.advance();
  }
  /** The choices a pending procedure offers its player. */
  selectionOptions(pending: PendingProcedure): Record<string, SelectionOption> {
    return procedureHandler(pending).options(this, pending);
  }
  /** What the Cost Runtime determines and pays for a cast or activation. */
  costProposal(pending: PendingProcedure): CostProposal {
    const record =
      this.match.objects[pending.proposal?.stackObjectId ?? ""]?.proposal;
    return {
      use: pending.kind === "cast" ? "cast" : "activate",
      playerId: pending.playerId,
      source: this.object(pending.sourceId!),
      ability: pending.ability!,
      variables: record?.variables,
      sourceZone: record?.sourceZone,
    };
  }
  object(id: string) {
    const object = this.match.objects[id];
    if (!object) throw new RuleViolation("This Game Object has already moved.");
    return object;
  }
  definition(object: GameObject) {
    return this.catalog.definitions[
      this.match.instances[object.cardInstanceIds[0]]?.definitionId
    ];
  }
  hasKeyword(object: GameObject, keyword: string) {
    return (
      this.effective(object).keywords?.some(
        (k) => k.toLowerCase() === keyword.toLowerCase(),
      ) ?? false
    );
  }
  canCastTiming(object: GameObject, playerId: string) {
    return (
      mainTiming(this.query, playerId) ||
      this.effective(object).types?.includes("Instant") ||
      this.hasKeyword(object, "Flash") ||
      this.battlefieldSources().some(
        (source) =>
          source.controllerId === playerId &&
          castPermissions(this.definition(source)?.abilities ?? []).some(
            (spells) => this.matches(object, spells, playerId, source.id),
          ),
      )
    );
  }
  targetEligible(
    object: GameObject,
    filter: Predicate,
    playerId: string,
    sourceId?: string,
  ) {
    return (
      this.matches(object, filter, playerId, sourceId) &&
      (object.controllerId === playerId || !this.hasKeyword(object, "Hexproof"))
    );
  }
  playLand(playerId: string, id: string) {
    const object = this.object(id);
    if (
      object.zoneId !== this.zone("hand", playerId).id ||
      !object.characteristics.types?.includes("Land") ||
      !mainTiming(this.query, playerId)
    )
      throw new RuleViolation(
        "Play a land from your Hand during your main phase with an empty Stack.",
      );
    if ((this.rules.thisTurn.landsPlayed[playerId] ?? 0) >= 1)
      throw new RuleViolation("You have already played a land this turn.");
    this.propose({
      kind: "zone-change",
      objectId: object.id,
      to: this.zone("battlefield"),
    });
    this.rules.thisTurn.landsPlayed[playerId] = 1;
    this.checkpoint({ playerId });
  }
  battlefieldSources() {
    return Object.values(this.match.objects).filter(
      (o) => o.zoneId === this.zone("battlefield").id,
    );
  }
  emit(kind: "enter" | "cast", object: GameObject) {
    new EventTriggerObserver(this).collect(
      {
        kind,
        sourceId: object.id,
        affectedId: object.id,
        controllerId: object.controllerId,
        ownerId: object.ownerId,
        after: this.effective(object),
      },
      object,
      this.battlefieldSources(),
    );
  }
  /** A Core predicate match; a resolving program's bindings are in scope. */
  matches(
    object: GameObject,
    filter: Predicate,
    playerId: string,
    sourceId?: string,
  ) {
    return new Evaluator(this.query, {
      playerId,
      sourceId,
      bindings: this.resolvingNumbers(),
    }).matches(object, filter);
  }
  /** The resolving program's number bindings (a filter's mana value reads X). */
  private resolvingNumbers() {
    const execution = this.rules.resolving;
    return execution ? scopeBindings(execution).bindings : undefined;
  }
  effective(object: GameObject) {
    return new CharacteristicsCalculator(this.match, this.catalog).effective(
      object,
    );
  }
  value(
    value: Value,
    playerId: string,
    sourceId?: string,
    bindings?: Record<string, number>,
  ) {
    return new Evaluator(this.query, { playerId, sourceId, bindings }).value(
      value,
    );
  }
  conditionSatisfied(condition: Condition, playerId: string, sourceId: string) {
    return new Evaluator(this.query, { playerId, sourceId }).condition(
      condition,
    );
  }
  monarchTrigger(
    playerId: string,
    effects: Effect[],
    abilityId: string,
    creature?: GameObject,
  ) {
    waitTrigger(this, {
      playerId,
      sourceId: "monarch",
      abilityId,
      sourceName: "Monarch",
      // The monarch's designation triggers (CR 724.2): at your end step, and
      // when a creature deals combat damage to the monarch.
      ability: {
        id: abilityId,
        kind: "triggered",
        trigger: creature
          ? {
              event: "deals-damage",
              source: "source",
              to: "player",
              combat: true,
            }
          : { event: "step", step: "end", player: "you" },
        effects,
      },
      event: {
        kind: "state",
        sourceId: creature?.id ?? "monarch",
        affectedId: creature?.id ?? "monarch",
        controllerId: creature?.controllerId ?? playerId,
        ownerId: playerId,
        after: {
          name: "Monarch",
          colors: [],
          typeLine: "Designation",
          rulesText: "",
        },
      },
    });
  }
  maximumHandSize(playerId: string) {
    return this.battlefieldSources().some(
      (o) =>
        o.controllerId === playerId &&
        unlimitedHandSize(this.definition(o)?.abilities ?? []),
    )
      ? Infinity
      : 7;
  }
  targetSource(pending: PendingProcedure) {
    const object = this.match.objects[pending.sourceId ?? ""];
    return isDiesTrigger(object?.resolution?.ability)
      ? object!.resolution!.event?.affectedId
      : (object?.sourceObjectId ?? pending.sourceId);
  }
  /** Objects a filter can target; `selfId` (the targeting spell or ability) can't target itself. */
  legalTargets(
    playerId: string,
    filter: Predicate,
    sourceId?: string,
    selfId?: string,
  ) {
    return Object.values(this.match.objects)
      .filter(
        (object) =>
          object.id !== selfId &&
          this.targetEligible(object, filter, playerId, sourceId),
      )
      .map((object) => object.id);
  }
  abilities(object: GameObject) {
    const abilities = (this.definition(object)?.abilities ?? []).filter(
      activatable,
    );
    if (object.characteristics.types?.includes("Land")) {
      const colors: Record<string, ManaType> = {
        Plains: "W",
        Island: "U",
        Swamp: "B",
        Mountain: "R",
        Forest: "G",
      };
      for (const subtype of object.characteristics.subtypes ?? [])
        if (colors[subtype])
          abilities.push({
            id: `intrinsic-${subtype}`,
            kind: "mana",
            // CR 305.6: a basic land type's mana ability is intrinsic.
            origin: "printed",
            activation: { costs: [{ kind: "tap-source" }] },
            produce: { quantity: 1, colors: [colors[subtype]] },
          });
    }
    return abilities;
  }
  canActivateFromZone(source: GameObject, playerId: string, ability: Ability) {
    const kind = activationZone(ability);
    const zone = this.zone(kind, kind === "hand" ? playerId : undefined);
    return source.controllerId === playerId && source.zoneId === zone.id;
  }
  canPayTapSymbol(source: GameObject, playerId: string) {
    return (
      source.zoneId === this.zone("battlefield").id &&
      !source.status.tapped &&
      (!this.effective(source).types?.includes("Creature") ||
        this.hasKeyword(source, "Haste") ||
        (this.rules.controlledSinceTurn[source.id] ?? this.match.turn.number) <
          (this.rules.turnStarted[playerId] ?? 0))
    );
  }
  activate(
    playerId: string,
    action: Extract<MatchAction, { type: "activate-ability" }>,
    duringPayment = false,
  ) {
    const source = this.object(action.objectId);
    const authored = this.abilities(source).find(
      (ability) => ability.id === action.abilityId,
    );
    if (!authored) throw new RuleViolation("Ability not found.");
    const ability = structuredClone(authored);
    if (!this.canActivateFromZone(source, playerId, authored))
      throw new RuleViolation(
        "You cannot activate this source from that Zone.",
      );
    if (
      oncePerTurn(ability) &&
      this.rules.thisTurn.activationUsage[`${source.id}:${authored.id}`]
    )
      throw new RuleViolation("Activate this ability only once each turn.");
    if (sorceryTiming(ability) && !mainTiming(this.query, playerId))
      throw new RuleViolation("Activate this ability only as a sorcery.");
    const target = targetFilter(ability);
    if (target && !this.legalTargets(playerId, target, source.id).length)
      throw new RuleViolation("No legal targets are available.");
    if (duringPayment && !isManaAbility(ability))
      throw new RuleViolation(
        "Only mana abilities may be used in the payment window.",
      );
    const produce = production(ability);
    if (!produce) {
      new StackProposalProcedure(this).activate(
        playerId,
        source,
        ability,
        action.color,
      );
      return;
    }
    {
      // A mana ability doesn't use the Stack (CR 605.3).
      const costs = costsOf(ability);
      const procedure: PendingProcedure = {
        id: randomUUID(),
        playerId,
        kind: "activate",
        stage: "payment",
        sourceId: source.id,
        abilityId: authored.id,
        ability,
        targetIds: [],
        selections: {},
        color: action.color,
        totalCost: { ...emptyMana(), generic: 0 },
      };
      this.lockCost(procedure);
      // Mana activations are atomic even when an enclosing cast is waiting.
      if (!this.pay(procedure))
        throw new RuleViolation(
          "The mana ability's complete costs cannot be paid.",
        );
      this.produceMana(playerId, produce, action.color);
      if (
        costs.some((c) => c.kind === "tap-source") &&
        (action.color ??
          (Array.isArray(produce.colors) ? produce.colors[0] : undefined)) ===
          "C"
      )
        new EventTriggerObserver(this).collect(
          {
            kind: "mana",
            playerId,
            sourceId: source.id,
            affectedId: source.id,
            controllerId: playerId,
            ownerId: this.owner(source),
            after: this.effective(source),
          },
          source,
          this.battlefieldSources(),
        );
      if (!duringPayment) this.checkpoint({ playerId });
    }
  }
  targeted(stack: GameObject) {
    for (const id of stack.resolution?.targetIds ?? []) {
      const target = this.match.objects[id];
      if (target?.zoneId !== this.zone("battlefield").id) continue;
      new EventTriggerObserver(this).collect(
        {
          kind: "target",
          playerId: stack.controllerId,
          stackId: stack.id,
          sourceId: target.id,
          affectedId: target.id,
          controllerId: target.controllerId,
          ownerId: this.owner(target),
          after: this.effective(target),
        },
        target,
        [target],
      );
    }
  }
  /** Determines and locks the total cost (CR 601.2f–g). */
  lockCost(pending: PendingProcedure) {
    pending.totalCost = determineCost(this, this.costProposal(pending));
  }
  /**
   * Pays the locked total cost through the Cost Runtime: the mana spent, or
   * undefined, changing nothing, until it can be paid.
   */
  pay(pending: PendingProcedure): ManaType[] | undefined {
    const produce = production(pending.ability);
    if (produce) {
      const allowed = this.manaColors(produce, pending.playerId);
      if (
        !allowed.includes(
          pending.color ?? (allowed.length === 1 ? allowed[0] : undefined)!,
        )
      )
        throw new RuleViolation("Choose a permitted mana color.");
    }
    const proposal = this.costProposal(pending);
    const spent = pay(this, {
      ...proposal,
      totalCost: pending.totalCost,
      selections: pending.selections,
    });
    return spent;
  }
  manaColors(produce: ManaProduction, playerId: string): ManaType[] {
    return Array.isArray(produce.colors)
      ? produce.colors
      : (this.rules.commanders[playerId].colorIdentity as ManaType[]);
  }
  /** A mana ability's production (CR 605): mana abilities don't use the Stack. */
  produceMana(playerId: string, produce: ManaProduction, color?: ManaType) {
    const type = color ?? this.manaColors(produce, playerId)[0];
    this.rules.mana[playerId][type] += produce.quantity;
    if (produce.restriction) {
      this.rules.restrictedMana ??= {};
      this.rules.restrictedMana[playerId] ??= [];
      this.rules.restrictedMana[playerId].push({
        type,
        amount: produce.quantity,
        restriction: structuredClone(produce.restriction),
      });
    }
  }
  owner(object: GameObject) {
    return object.ownerId;
  }
  /** An ability ceases to exist; a card goes to its owner's Graveyard. */
  toGraveyard(object: GameObject) {
    if (object.kind === "ability")
      this.propose({ kind: "cease", objectId: object.id });
    else
      this.propose({
        kind: "zone-change",
        objectId: object.id,
        to: this.zone("graveyard", object.ownerId),
      });
  }
  resolve() {
    new StackResolutionRuntime(this).resolve();
  }
  /** Draws one card at a time (CR 121.2); stops at an empty Library. */
  draw(playerId: string, count: number) {
    for (let i = 0; i < count; i++)
      if (!this.propose({ kind: "draw", playerId }).object) break;
  }
  /** Starts a combat step's turn-based actions. */
  get combat() {
    return new Combat(this);
  }
  /** Event trigger observation. */
  get triggers() {
    return new EventTriggerObserver(this);
  }
  get turn() {
    return new TurnStructure(this);
  }
}
