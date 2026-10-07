import { randomUUID } from "node:crypto";
import type {
  Catalog,
  CardAbility,
  GameObject,
  MatchAction,
  MatchPlayer,
  MatchState,
  Participant,
  ZoneKind,
  ZoneState,
} from "../../shared/model.js";
import {
  type ManaPool,
  type ManaType,
  type ObjectFilter,
  type PendingProcedure,
  type RulesAbility,
  type SelectionOption,
  rulesAbilitySchema,
} from "../../shared/rules.js";
import type { Effect } from "../../shared/rules-v2.js";
import type {
  EventResult,
  ProposedEvent,
  RulesMutator,
  RulesQuery,
} from "../rules/context.js";
import { EventRuntime } from "../rules/events/event-runtime.js";
import { Evaluator } from "../rules/vm/evaluate.js";
import { gameObject } from "./game-objects.js";
import { manaCost, spendMana } from "./mana.js";
import { Library } from "./zones.js";
import { CharacteristicsCalculator, matchesFilter } from "./characteristics.js";
import { Triggers } from "./triggers.js";
import { Combat } from "./combat.js";
import { actingPlayer } from "./match-players.js";
import { CommanderRules } from "./commander-rules.js";
import { Resolution } from "./resolution.js";

export const emptyMana = (): ManaPool => ({
  W: 0,
  U: 0,
  B: 0,
  R: 0,
  G: 0,
  C: 0,
});

export class RulesEngine implements RulesMutator {
  readonly rules;
  constructor(
    readonly match: MatchState,
    readonly catalog: Catalog,
  ) {
    if (!match.rules) throw new Error("Rules Match state is missing.");
    this.rules = match.rules;
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
  apply(participant: Pick<Participant, "id">, action: MatchAction): undefined {
    const player = actingPlayer(this.match, participant.id);
    if (!player) throw new Error("Only a Match Player may act.");
    if (this.match.outcome !== "ongoing")
      throw new Error("This Match is complete.");
    if (this.rules.setup.keptPlayerIds.length < this.match.players.length) {
      this.opening(player, action);
    } else if (this.rules.pending) {
      const pending = this.rules.pending;
      if (pending.playerId !== player.id)
        throw new Error("Another player must complete the pending choice.");
      if (action.type === "rules-input" && action.procedureId === pending.id)
        this.input(player.id, action);
      else if (
        action.type === "activate-ability" &&
        pending.stage === "payment"
      )
        this.activate(player.id, action, true);
      else if (
        action.type === "cancel-procedure" &&
        action.procedureId === pending.id &&
        pending.kind !== "commander-return" &&
        pending.kind !== "cleanup" &&
        pending.kind !== "resolve" &&
        pending.kind !== "trigger-order" &&
        pending.kind !== "trigger-target" &&
        pending.kind !== "declare-attackers" &&
        pending.kind !== "declare-blockers" &&
        pending.kind !== "combat-damage"
      ) {
        delete this.rules.pending;
        if (pending.kind === "attack-payment")
          new Combat(this).beginAttackers();
        else this.priority(player.id);
      } else
        throw new Error(
          "Complete the current procedure using its latest identifier.",
        );
    } else {
      this.requirePriority(player.id);
      if (action.type === "pass-priority") this.pass(player.id);
      else if (action.type === "play-land")
        this.playLand(player.id, action.objectId);
      else if (action.type === "cast-spell")
        this.cast(player.id, action.objectId);
      else if (action.type === "activate-ability")
        this.activate(player.id, action);
      else throw new Error("Use a legal rules action.");
    }
    this.match.revision++;
    return undefined;
  }
  opening(player: MatchPlayer, action: MatchAction) {
    if (this.rules.setup.keptPlayerIds.includes(player.id))
      throw new Error("Your opening Hand is already kept.");
    const hand = this.zone("hand", player.id),
      library = this.zone("library", player.id);
    if (action.type === "mulligan" && action.playerId === player.id) {
      if (player.mulliganCount >= 7)
        throw new Error("No further mulligans are available.");
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
        throw new Error(
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
        this.beginTurn();
    } else throw new Error("Keep or mulligan your opening Hand before play.");
  }
  requirePriority(playerId: string) {
    if (this.match.priority?.playerId !== playerId)
      throw new Error("You do not have Priority.");
  }
  priority(playerId = this.match.turn.activePlayerId) {
    this.checkpoint();
    if (this.match.outcome !== "ongoing") return;
    if (new CommanderRules(this).checkpoint()) {
      this.rules.priorityAfterTriggers = playerId;
      return;
    }
    new Triggers(this).collectStates();
    this.rules.priorityAfterTriggers = playerId;
    new Triggers(this).flush();
  }
  pass(playerId: string) {
    const priority = this.match.priority!;
    priority.passedPlayerIds.push(playerId);
    if (priority.passedPlayerIds.length < this.match.players.length) {
      const index = this.match.turn.order.indexOf(playerId);
      priority.playerId =
        this.match.turn.order[(index + 1) % this.match.turn.order.length];
      return;
    }
    if (this.zone("stack").objectIds.length) {
      this.resolve();
      return;
    }
    if (this.match.turn.stepIndex === 11) this.cleanup();
    else this.advanceStep();
  }
  actions(playerId: string): { label: string; action: MatchAction }[] {
    if (
      this.match.outcome !== "ongoing" ||
      this.rules.setup.keptPlayerIds.length < this.match.players.length
    )
      return [];
    const pending = this.rules.pending;
    if (
      pending &&
      (pending.playerId !== playerId || pending.stage !== "payment")
    )
      return [];
    if (!pending && this.match.priority?.playerId !== playerId) return [];
    const actions: { label: string; action: MatchAction }[] = pending
      ? []
      : [{ label: "Pass Priority", action: { type: "pass-priority" } }];
    for (const object of Object.values(this.match.objects)) {
      if (object.controllerId !== playerId) continue;
      const ownHand =
        object.zoneId === this.zone("hand", playerId).id ||
        (object.zoneId === this.zone("command").id &&
          !!new CommanderRules(this).instance(object));
      if (!pending && ownHand) {
        if (object.characteristics.types?.includes("Land")) {
          if (
            this.mainTiming(playerId) &&
            !(this.rules.landsPlayed[playerId] ?? 0)
          )
            actions.push({
              label: `Play ${object.characteristics.name}`,
              action: { type: "play-land", objectId: object.id },
            });
        } else if (this.canCastTiming(object, playerId)) {
          const target = this.definition(object)?.abilities.find(
            (a) => a.kind === "spell",
          )?.rules?.target;
          if (!target || this.legalTargets(playerId, target).length)
            actions.push({
              label: `Cast ${object.characteristics.name}`,
              action: { type: "cast-spell", objectId: object.id },
            });
        }
      }
      for (const ability of this.abilities(object)) {
        const rules = ability.rules!;
        if (pending && !rules.manaAbility) continue;
        if (
          rules.oncePerTurn &&
          this.rules.activationUsage?.[`${object.id}:${ability.id}`]
        )
          continue;
        if (rules.timing === "sorcery" && !this.mainTiming(playerId)) continue;
        if (!this.canActivateFromZone(object, playerId, ability)) continue;
        if (
          rules.target &&
          !this.legalTargets(playerId, rules.target, object.id).length
        )
          continue;
        if (
          rules.costs.some((cost) => cost.kind === "tap-source") &&
          !this.canPayTapSymbol(object, playerId)
        )
          continue;
        const produce = rules.produce;
        if (produce) {
          const colors = this.manaColors(produce, playerId);
          for (const color of colors)
            actions.push({
              label: ability.description
                ? `${ability.description}${colors.length > 1 ? ` Choose {${color}}.` : ""}`
                : `${object.characteristics.name}: add ${produce.quantity} ${color}`,
              action: {
                type: "activate-ability",
                objectId: object.id,
                abilityId: ability.id,
                color,
              },
            });
        } else
          actions.push({
            label:
              ability.description ??
              `${object.characteristics.name}: ${ability.id}`,
            action: {
              type: "activate-ability",
              objectId: object.id,
              abilityId: ability.id,
            },
          });
      }
    }
    return actions;
  }
  selectionOptions(pending: PendingProcedure): Record<string, SelectionOption> {
    if (pending.options) return pending.options ?? {};
    if (pending.kind === "cleanup")
      return {
        discard: {
          count:
            this.zone("hand", pending.playerId).objectIds.length -
            this.maximumHandSize(pending.playerId),
          objectIds: [...this.zone("hand", pending.playerId).objectIds],
        },
      };
    const options: Record<string, SelectionOption> = {};
    if (
      pending.kind === "cast" &&
      this.definition(this.object(pending.sourceId!))?.abilities.some(
        (a) => a.rules?.improvise,
      )
    )
      options.improvise = {
        count: pending.totalCost.generic,
        minCount: 0,
        label: "Improvise: tap artifacts for generic mana",
        objectIds: this.battlefieldSources()
          .filter(
            (o) =>
              o.controllerId === pending.playerId &&
              !o.status.tapped &&
              this.effective(o).types?.includes("Artifact"),
          )
          .map((o) => o.id),
      };
    for (const [index, cost] of (pending.ability?.costs ?? []).entries())
      if ("filter" in cost)
        options[String(index)] = {
          count:
            cost.kind === "crew"
              ? this.battlefieldSources().length
              : cost.count,
          minCount: cost.kind === "crew" ? 1 : undefined,
          label:
            cost.kind === "crew"
              ? `Crew: at least ${cost.power} total power`
              : undefined,
          objectIds: Object.values(this.match.objects)
            .filter((object) =>
              this.matches(object, cost.filter, pending.playerId),
            )
            .map((object) => object.id)
            .filter((id) => {
              const object = this.object(id);
              return (
                object.controllerId === pending.playerId &&
                (!["tap", "crew"].includes(cost.kind) || !object.status.tapped)
              );
            }),
        };
    return options;
  }
  object(id: string) {
    const object = this.match.objects[id];
    if (!object) throw new Error("This Game Object has already moved.");
    return object;
  }
  definition(object: GameObject) {
    return this.catalog.definitions[
      this.match.instances[object.cardInstanceIds[0]]?.definitionId
    ];
  }
  mainTiming(playerId: string) {
    return (
      this.match.turn.activePlayerId === playerId &&
      [3, 9].includes(this.match.turn.stepIndex) &&
      !this.zone("stack").objectIds.length
    );
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
      this.mainTiming(playerId) ||
      this.effective(object).types?.includes("Instant") ||
      this.hasKeyword(object, "Flash") ||
      this.battlefieldSources().some(
        (source) =>
          source.controllerId === playerId &&
          this.definition(source)?.abilities.some(
            (ability) =>
              ability.kind === "static" &&
              ability.rules?.castingPermission &&
              this.matches(
                object,
                ability.rules.castingPermission,
                playerId,
                source.id,
              ),
          ),
      )
    );
  }
  targetEligible(
    object: GameObject,
    filter: ObjectFilter,
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
      !this.mainTiming(playerId)
    )
      throw new Error(
        "Play a land from your Hand during your main phase with an empty Stack.",
      );
    if ((this.rules.landsPlayed[playerId] ?? 0) >= 1)
      throw new Error("You have already played a land this turn.");
    this.propose({
      kind: "zone-change",
      objectId: object.id,
      to: this.zone("battlefield"),
    });
    this.rules.landsPlayed[playerId] = 1;
    this.priority(playerId);
  }
  battlefieldSources() {
    return Object.values(this.match.objects).filter(
      (o) => o.zoneId === this.zone("battlefield").id,
    );
  }
  emit(kind: "enter" | "cast", object: GameObject) {
    new Triggers(this).collect(
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
  matches(
    object: GameObject,
    filter: ObjectFilter,
    playerId: string,
    sourceId?: string,
  ) {
    if (
      filter.manaValue !== undefined &&
      this.effective(object).manaValue !==
        this.value(
          filter.manaValue,
          playerId,
          sourceId,
          this.rules.resolving?.bindings,
        )
    )
      return false;
    if (
      filter.damagedBySource &&
      !this.rules.damageEvents?.some(
        (e) =>
          e.sourceId === sourceId &&
          e.combat &&
          e.recipientKind === "player" &&
          e.recipientId === object.controllerId &&
          e.turn === this.match.turn.number,
      )
    )
      return false;
    return matchesFilter(
      this.match,
      { ...object, characteristics: this.effective(object) },
      filter,
      playerId,
      sourceId,
    );
  }
  effective(object: GameObject) {
    return new CharacteristicsCalculator(this.match, this.catalog).effective(
      object,
    );
  }
  value(
    value: import("../../shared/rules.js").RulesValue,
    playerId: string,
    sourceId?: string,
    bindings?: Record<string, number>,
  ) {
    return new CharacteristicsCalculator(this.match, this.catalog).value(
      value,
      playerId,
      sourceId,
      bindings,
    );
  }
  conditionSatisfied(
    condition: NonNullable<RulesAbility["intervening"]>,
    playerId: string,
    sourceId: string,
  ) {
    return (
      (!condition.requireObjects ||
        Object.values(this.match.objects).some((o) =>
          this.matches(o, condition.requireObjects!, playerId, sourceId),
        )) &&
      this.value(condition.value, playerId, sourceId) >=
        this.value(condition.atLeast, playerId, sourceId)
    );
  }
  monarchTrigger(
    playerId: string,
    effects: Effect[],
    abilityId: string,
    creature?: GameObject,
  ) {
    this.rules.waitingTriggers ??= [];
    this.rules.waitingTriggers.push({
      id: randomUUID(),
      playerId,
      sourceId: "monarch",
      abilityId,
      sourceName: "Monarch",
      ability: { costs: [], effects },
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
        this.definition(o)?.abilities.some(
          (a) => a.rules?.maximumHandSize === "unlimited",
        ),
    )
      ? Infinity
      : 7;
  }
  targetSource(pending: PendingProcedure) {
    const object = this.match.objects[pending.sourceId ?? ""];
    return object?.resolution?.ability.trigger?.event === "dies"
      ? object.resolution.event?.affectedId
      : (object?.sourceObjectId ?? pending.sourceId);
  }
  legalTargets(playerId: string, filter: ObjectFilter, sourceId?: string) {
    return Object.values(this.match.objects)
      .filter((object) =>
        this.targetEligible(object, filter, playerId, sourceId),
      )
      .map((object) => object.id);
  }
  abilities(object: GameObject) {
    const abilities = (this.definition(object)?.abilities ?? []).filter(
      (ability) => ability.kind === "activated" && ability.rules,
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
            kind: "activated",
            // CR 305.6: a basic land type's mana ability is intrinsic.
            origin: "printed",
            applicableZone: "battlefield",
            rules: {
              costs: [{ kind: "tap-source" }],
              effects: [],
              produce: { quantity: 1, colors: [colors[subtype]] },
              manaAbility: true,
            },
          });
    }
    return abilities;
  }
  cast(playerId: string, id: string) {
    const source = this.object(id);
    if (
      (source.zoneId !== this.zone("hand", playerId).id &&
        !(
          source.zoneId === this.zone("command").id &&
          source.controllerId === playerId &&
          new CommanderRules(this).instance(source)
        )) ||
      source.characteristics.types?.includes("Land")
    )
      throw new Error("Choose a spell from your Hand.");
    if (!this.canCastTiming(source, playerId))
      throw new Error(
        "This spell requires your main phase and an empty Stack.",
      );
    const spellAbilities =
      this.definition(source)?.abilities.filter(
        (ability) => ability.kind === "spell",
      ) ?? [];
    if (spellAbilities.length > 1)
      throw new Error("This spell composition is not yet supported.");
    const ability = rulesAbilitySchema.parse(
      spellAbilities[0]?.rules ??
        (() => {
          const aura = this.definition(source)?.abilities.find(
            (a) => a.rules?.aura,
          )?.rules?.aura;
          return { costs: [], effects: [], ...(aura ? { target: aura } : {}) };
        })(),
    );
    const symbols: string[] =
      source.characteristics.manaCost?.match(/\{[^{}]+\}/g) ?? [];
    if (!source.characteristics.manaCost && !symbols.length)
      throw new Error("A spell without a mana cost cannot be cast normally.");
    this.rules.pending = {
      id: randomUUID(),
      playerId,
      kind: "cast",
      stage: ability.chosenVariables?.length
        ? "variable"
        : ability.target
          ? "targets"
          : "payment",
      sourceId: id,
      ability: structuredClone(ability),
      targetIds: [],
      selections: {},
      totalCost: manaCost(symbols.filter((symbol) => symbol !== "{X}")),
    };
    if (ability.target && !this.legalTargets(playerId, ability.target).length)
      throw new Error("No legal targets are available.");
    if (symbols.includes("{X}") && !ability.chosenVariables?.includes("X"))
      throw new Error("Variable mana costs require an authored chosen value.");
    if (!ability.chosenVariables?.length && !ability.target)
      this.lockCost(this.rules.pending);
    if (!ability.target && !ability.chosenVariables?.length)
      this.tryComplete(playerId);
  }
  canActivateFromZone(
    source: GameObject,
    playerId: string,
    ability: CardAbility,
  ) {
    const zone = this.zone(
      ability.applicableZone ?? "battlefield",
      ability.applicableZone === "hand" ? playerId : undefined,
    );
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
    if (!authored?.rules) throw new Error("Ability not found.");
    const ability = rulesAbilitySchema.parse(authored.rules);
    if (!this.canActivateFromZone(source, playerId, authored))
      throw new Error("You cannot activate this source from that Zone.");
    if (
      ability.oncePerTurn &&
      this.rules.activationUsage?.[`${source.id}:${authored.id}`]
    )
      throw new Error("Activate this ability only once each turn.");
    if (ability.timing === "sorcery" && !this.mainTiming(playerId))
      throw new Error("Activate this ability only as a sorcery.");
    if (
      ability.target &&
      !this.legalTargets(playerId, ability.target, source.id).length
    )
      throw new Error("No legal targets are available.");
    if (duringPayment && !ability.manaAbility)
      throw new Error("Only mana abilities may be used in the payment window.");
    const procedure: PendingProcedure = {
      id: randomUUID(),
      playerId,
      kind: "activate",
      stage: ability.chosenVariables?.length
        ? "variable"
        : ability.target
          ? "targets"
          : "payment",
      sourceId: source.id,
      abilityId: authored.id,
      ability,
      targetIds: [],
      selections: {},
      color: action.color,
      totalCost: manaCost(
        ability.costs.flatMap((cost) =>
          cost.kind === "mana" ? cost.symbols.filter((s) => s !== "{X}") : [],
        ),
      ),
    };
    if (!ability.target && !ability.chosenVariables?.length)
      this.lockCost(procedure);
    if (ability.manaAbility) {
      // Mana activations are atomic even when an enclosing cast is waiting.
      if (!this.pay(procedure))
        throw new Error("The mana ability's complete costs cannot be paid.");
      this.produceMana(playerId, ability, action.color);
      const produce = ability.produce;
      if (
        ability.costs.some((c) => c.kind === "tap-source") &&
        produce &&
        (action.color ??
          (Array.isArray(produce.colors) ? produce.colors[0] : undefined)) ===
          "C"
      )
        new Triggers(this).collect(
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
      if (!duringPayment) this.priority(playerId);
    } else {
      this.rules.pending = procedure;
      if (!ability.target && !ability.chosenVariables?.length)
        this.tryComplete(playerId);
    }
  }
  input(
    playerId: string,
    action: Extract<MatchAction, { type: "rules-input" }>,
  ) {
    const pending = this.rules.pending!;
    if (pending.kind === "commander-return") {
      new CommanderRules(this).answer(action);
      return;
    }
    if (pending.kind === "attack-payment") {
      new Combat(this).payAttackers(action);
      return;
    }
    if (pending.kind === "combat-damage") {
      new Combat(this).answerDamage(action);
      return;
    }
    if (
      pending.kind === "declare-attackers" ||
      pending.kind === "declare-blockers"
    ) {
      new Combat(this).answer(action);
      return;
    }
    if (pending.kind === "trigger-target") {
      new Triggers(this).answerTarget(action);
      return;
    }
    if (pending.kind === "trigger-order") {
      new Triggers(this).answer(action);
      return;
    }
    if (pending.kind === "resolve") {
      new Resolution(this).answer(action);
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
        throw new Error("Choose a nonnegative integer for X, at most 1000.");
      pending.variables = { X: value };
      const symbols =
        pending.kind === "activate"
          ? pending.ability!.costs.flatMap((c) =>
              c.kind === "mana" ? c.symbols : [],
            )
          : (this.object(pending.sourceId!).characteristics.manaCost?.match(
              /\{[^{}]+\}/g,
            ) ?? []);
      pending.totalCost.generic +=
        symbols.filter((symbol) => symbol === "{X}").length * value;
      if (!pending.ability?.target) this.lockCost(pending);
      pending.stage = pending.ability?.target ? "targets" : "payment";
      pending.id = randomUUID();
      return;
    }
    if (action.variables)
      throw new Error("The chosen Variable Values are locked.");
    if (pending.kind === "cleanup") {
      const hand = this.zone("hand", playerId);
      const ids = action.selections?.discard ?? [];
      if (
        ids.length !== hand.objectIds.length - this.maximumHandSize(playerId) ||
        new Set(ids).size !== ids.length ||
        ids.some((id) => !hand.objectIds.includes(id))
      )
        throw new Error("Choose the required cards to discard for cleanup.");
      for (const id of ids)
        this.propose({
          kind: "zone-change",
          objectId: id,
          to: this.zone("graveyard", playerId),
        });
      delete this.rules.pending;
      this.cleanup();
      return;
    }
    if (action.color) pending.color = action.color;
    if (action.selections) pending.selections = action.selections;
    if (pending.stage === "targets") {
      const targets = action.targetIds ?? [];
      if (
        targets.length !== 1 ||
        !this.legalTargets(
          playerId,
          pending.ability!.target!,
          this.targetSource(pending),
        ).includes(targets[0])
      )
        throw new Error("Choose one legal target.");
      pending.targetIds = targets;
      this.lockCost(pending);
      pending.stage = "payment";
    }
    if (
      action.confirm !== false &&
      !this.tryComplete(playerId) &&
      action.confirm === true
    )
      throw new Error("The complete costs cannot be paid yet.");
  }
  tryComplete(playerId: string) {
    const pending = this.rules.pending!;
    const beforePayment = this.object(pending.sourceId!);
    const sourceSnapshot = {
      characteristics: this.effective(beforePayment),
      ownerId: this.owner(beforePayment),
    };
    if (!this.pay(pending)) return false;
    const source = pending.sourceId!;
    if (pending.kind === "cast") {
      const object = this.object(source);
      const sourceZoneId = object.zoneId;
      if (sourceZoneId === this.zone("command").id) {
        this.rules.commanderCasts ??= {};
        const instance = new CommanderRules(this).instance(object)!;
        this.rules.commanderCasts[instance] =
          (this.rules.commanderCasts[instance] ?? 0) + 1;
      }
      const spell = this.propose({
        kind: "zone-change",
        objectId: source,
        to: this.zone("stack"),
        cause: "cast",
      }).object!;
      spell.resolution = {
        ability: pending.ability!,
        targetIds: pending.targetIds,
      };
      spell.variables = Object.entries(pending.variables ?? {}).map(
        ([name, value]) => ({ name, value: String(value) }),
      );
      spell.casting = {
        ...(pending.variables?.X !== undefined
          ? { chosenX: String(pending.variables.X) }
          : {}),
        sourceZoneId,
        modes: [],
        components: [0],
        additionalCosts: [],
        manaSpent: this.lastManaSpent,
      };
      this.emit("cast", spell);
    } else {
      if (pending.ability?.oncePerTurn) {
        this.rules.activationUsage ??= {};
        this.rules.activationUsage[`${source}:${pending.abilityId}`] = 1;
      }
      const object = gameObject(
        "ability",
        this.zone("stack").id,
        playerId,
        playerId,
        {
          name: `${this.lastSourceName}: ${pending.abilityId}`,
          colors: [],
          typeLine: "Ability",
          rulesText: "",
        },
      );
      object.variables = Object.entries(pending.variables ?? {}).map(
        ([name, value]) => ({ name, value: String(value) }),
      );
      object.sourceObjectId = source;
      object.sourceAbilityId = pending.abilityId;
      object.resolution = {
        sourceSnapshot,
        ability: pending.ability!,
        targetIds: pending.targetIds,
        color: pending.color,
      };
      this.propose({ kind: "create", object, zone: this.zone("stack") });
    }
    const stacked = this.object(this.zone("stack").objectIds.at(-1)!);
    this.targeted(stacked);
    delete this.rules.pending;
    this.priority(playerId);
    return true;
  }
  targeted(stack: GameObject) {
    for (const id of stack.resolution?.targetIds ?? []) {
      const target = this.match.objects[id];
      if (target?.zoneId !== this.zone("battlefield").id) continue;
      new Triggers(this).collect(
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
  lockCost(pending: PendingProcedure) {
    const target = this.object(pending.sourceId!);
    if (pending.kind === "cast" && target.zoneId === this.zone("command").id)
      pending.totalCost.generic +=
        2 *
        (this.rules.commanderCasts?.[
          new CommanderRules(this).instance(target)!
        ] ?? 0);
    let reduction = 0;
    for (const source of Object.values(this.match.objects)) {
      if (source.controllerId !== pending.playerId) continue;
      for (const ability of this.definition(source)?.abilities ?? []) {
        for (const modifier of ability.rules?.costModifiers ?? []) {
          if (modifier.use !== pending.kind) continue;
          if (
            modifier.scope === "source"
              ? source.id !== target.id
              : source.zoneId !== this.zone("battlefield").id
          )
            continue;
          if (
            modifier.filter &&
            !this.matches(
              pending.kind === "cast"
                ? { ...target, zoneId: this.zone("stack").id }
                : target,
              modifier.filter,
              pending.playerId,
              source.id,
            )
          )
            continue;
          reduction += this.value(
            modifier.amount,
            pending.playerId,
            source.id,
            pending.variables,
          );
        }
      }
    }
    pending.totalCost.generic = Math.max(
      0,
      pending.totalCost.generic - reduction,
    );
  }
  lastManaSpent: ManaType[] = [];
  lastSourceName = "";
  pay(pending: PendingProcedure) {
    const playerId = pending.playerId,
      source = this.object(pending.sourceId!);
    const player = this.match.players.find((p) => p.id === playerId)!;
    const ability = pending.ability!;
    const colors = this.rules.commanders[playerId].colorIdentity as ManaType[];
    if (ability.produce) {
      const allowed = this.manaColors(ability.produce, playerId);
      if (
        !allowed.includes(
          pending.color ?? (allowed.length === 1 ? allowed[0] : undefined)!,
        )
      )
        throw new Error("Choose a permitted mana color.");
    }
    const costs = pending.kind === "cast" ? [] : ability.costs;
    const tapped = new Set<string>();
    const removed = new Set<string>();
    let life = 0;
    for (const [index, cost] of costs.entries()) {
      if (cost.kind === "tap-source") {
        if (
          removed.has(source.id) ||
          tapped.has(source.id) ||
          !this.canPayTapSymbol(source, playerId)
        )
          throw new Error("The source cannot pay its tap-symbol cost.");
        tapped.add(source.id);
      } else if (cost.kind === "counter-source") {
        if (
          removed.has(source.id) ||
          source.zoneId !== this.zone("battlefield").id
        )
          throw new Error("Counter costs require a present permanent.");
      } else if (cost.kind === "life")
        life +=
          cost.amount === "commander-colors" ? colors.length : cost.amount;
      else if (
        cost.kind === "sacrifice-source" ||
        cost.kind === "discard-source"
      ) {
        const zone =
          cost.kind === "sacrifice-source"
            ? this.zone("battlefield")
            : this.zone("hand", playerId);
        if (removed.has(source.id) || source.zoneId !== zone.id)
          throw new Error("The source cannot pay this removal cost.");
        removed.add(source.id);
      } else if (cost.kind === "crew") {
        const ids = pending.selections[String(index)] ?? [];
        if (!ids.length) return false;
        if (new Set(ids).size !== ids.length)
          throw new Error("Choose distinct creatures to crew.");
        let power = 0;
        for (const id of ids) {
          const creature = this.object(id);
          if (
            removed.has(id) ||
            tapped.has(id) ||
            creature.controllerId !== playerId ||
            creature.status.tapped ||
            !this.matches(creature, cost.filter, playerId)
          )
            throw new Error("Choose untapped creatures you control to crew.");
          power += Number(this.effective(creature).power) || 0;
          tapped.add(id);
        }
        if (power < cost.power)
          throw new Error("Insufficient total power to crew.");
      } else if (
        ["tap", "sacrifice", "discard", "return"].includes(cost.kind)
      ) {
        if (!("filter" in cost)) continue;
        const ids = pending.selections[String(index)] ?? [];
        if (ids.length !== cost.count) return false;
        if (new Set(ids).size !== ids.length)
          throw new Error("Choose distinct objects for each cost.");
        for (const id of ids) {
          const object = this.object(id);
          if (
            removed.has(id) ||
            object.controllerId !== playerId ||
            !this.matches(object, cost.filter, playerId) ||
            (cost.kind === "tap" &&
              (tapped.has(id) ||
                object.status.tapped ||
                object.zoneId !== this.zone("battlefield").id)) ||
            (["sacrifice", "return"].includes(cost.kind) &&
              object.zoneId !== this.zone("battlefield").id) ||
            (cost.kind === "discard" &&
              object.zoneId !== this.zone("hand", playerId).id)
          )
            throw new Error("Choose legal, distinct objects for the cost.");
          if (cost.kind === "tap") tapped.add(id);
          else removed.add(id);
        }
      }
    }
    if (BigInt(player.life) < BigInt(life))
      throw new Error("You cannot pay that much life.");
    const lots = this.rules.restrictedMana?.[playerId] ?? [];
    const eligible = (lot: (typeof lots)[number]) =>
      (!lot.restriction.use || lot.restriction.use === pending.kind) &&
      (!lot.restriction.spellTypes ||
        (pending.kind === "cast" &&
          lot.restriction.spellTypes.some((type) =>
            source.characteristics.types?.includes(type),
          )));
    const available = { ...this.rules.mana[playerId] };
    for (const lot of lots)
      if (!eligible(lot)) available[lot.type] -= lot.amount;
    const improvise = pending.selections.improvise ?? [];
    if (improvise.length) {
      const option = this.selectionOptions(pending).improvise;
      if (
        !option ||
        new Set(improvise).size !== improvise.length ||
        improvise.length > pending.totalCost.generic ||
        improvise.some((id) => !option.objectIds.includes(id))
      )
        throw new Error("Choose untapped artifacts you control for improvise.");
    }
    const payment = spendMana(available, {
      ...pending.totalCost,
      generic: pending.totalCost.generic - improvise.length,
    });
    if (!payment) return false;
    for (const id of improvise) this.object(id).status.tapped = true;
    this.lastSourceName = source.characteristics.name;
    this.lastManaSpent = payment.spent;
    for (const type of payment.spent) {
      this.rules.mana[playerId][type]--;
      const lot = lots.find(
        (lot) => lot.type === type && lot.amount > 0 && eligible(lot),
      );
      if (lot) lot.amount--;
    }
    if (this.rules.restrictedMana)
      this.rules.restrictedMana[playerId] = lots.filter(
        (lot) => lot.amount > 0,
      );
    if (life) this.propose({ kind: "life-change", playerId, amount: -life });
    for (const [index, cost] of costs.entries()) {
      if (cost.kind === "tap-source") source.status.tapped = true;
      else if (cost.kind === "counter-source") {
        const counter = source.counters.find((c) => c.kind === cost.counter);
        if (counter)
          counter.quantity = String(
            BigInt(counter.quantity) + BigInt(cost.count),
          );
        else
          source.counters.push({
            kind: cost.counter,
            quantity: String(cost.count),
          });
      } else if (
        cost.kind === "sacrifice-source" ||
        cost.kind === "discard-source"
      )
        this.propose({
          kind: "zone-change",
          objectId: source.id,
          to: this.zone("graveyard", this.owner(source)),
        });
      else if (
        cost.kind === "tap" ||
        cost.kind === "crew" ||
        cost.kind === "sacrifice" ||
        cost.kind === "discard" ||
        cost.kind === "return"
      )
        for (const id of pending.selections[String(index)] ?? []) {
          if (cost.kind === "tap" || cost.kind === "crew")
            this.object(id).status.tapped = true;
          else
            this.propose({
              kind: "zone-change",
              objectId: id,
              to: this.zone(
                cost.kind === "return" ? "hand" : "graveyard",
                this.owner(this.object(id)),
              ),
            });
        }
    }
    return true;
  }
  manaColors(
    produce: NonNullable<RulesAbility["produce"]>,
    playerId: string,
  ): ManaType[] {
    return produce.colors === "commander-colors"
      ? (this.rules.commanders[playerId].colorIdentity as ManaType[])
      : produce.colors;
  }
  /** A mana ability's production (CR 605): mana abilities don't use the Stack. */
  produceMana(playerId: string, ability: RulesAbility, color?: ManaType) {
    const produce = ability.produce;
    if (!produce) return;
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
    const stack = this.zone("stack"),
      object = this.object(stack.objectIds.at(-1)!);
    const resolution = object.resolution;
    const valid =
      (!resolution?.ability.intervening ||
        this.conditionSatisfied(
          resolution.ability.intervening,
          object.controllerId,
          object.sourceObjectId ?? object.id,
        )) &&
      (!resolution?.ability.target ||
        resolution.targetIds.some(
          (id) =>
            this.match.objects[id] &&
            this.targetEligible(
              this.match.objects[id],
              resolution.ability.target!,
              object.controllerId,
              resolution.ability.trigger?.event === "dies"
                ? resolution.event?.affectedId
                : (object.sourceObjectId ?? object.id),
            ),
        ));
    if (valid && resolution) {
      delete this.match.priority;
      new Resolution(this).start(object);
      return;
    }
    this.finishResolution(object, valid);
    this.priority();
  }
  finishResolution(object: GameObject, valid: boolean) {
    if (
      object.kind === "card" &&
      valid &&
      !object.characteristics.types?.some(
        (type) => type === "Instant" || type === "Sorcery",
      )
    ) {
      const targets = object.resolution?.targetIds ?? [];
      const fresh = this.propose({
        kind: "zone-change",
        objectId: object.id,
        to: this.zone("battlefield"),
      }).object!;
      if (this.definition(fresh)?.abilities.some((a) => a.rules?.aura))
        fresh.attachmentTo = targets[0];
    } else this.toGraveyard(object);
  }
  /** Draws one card at a time (CR 121.2); stops at an empty Library. */
  draw(playerId: string, count: number) {
    for (let i = 0; i < count; i++)
      if (!this.propose({ kind: "draw", playerId }).object) break;
  }
  beginTurn() {
    this.rules.drawsThisTurn = {};
    this.rules.activationUsage = {};
    this.rules.damageEvents = [];
    this.match.turn.stepIndex = 0;
    this.rules.turnStarted[this.match.turn.activePlayerId] =
      this.match.turn.number;
    this.rules.landsPlayed = {};
    for (const object of Object.values(this.match.objects))
      if (
        object.zoneId === this.zone("battlefield").id &&
        object.controllerId === this.match.turn.activePlayerId
      ) {
        const restricted = this.battlefieldSources().some(
          (a) =>
            a.attachmentTo === object.id &&
            this.definition(a)?.abilities.some((b) => b.rules?.monarchUntap),
        );
        if (!restricted || this.rules.monarchId === object.controllerId)
          object.status.tapped = false;
      }
    this.advanceStep();
  }
  advanceStep() {
    for (const player of this.match.players)
      this.rules.mana[player.id] = emptyMana();
    this.rules.restrictedMana = {};
    this.match.turn.stepIndex++;
    if (this.match.turn.stepIndex === 1) {
      for (const source of this.battlefieldSources())
        new Triggers(this).collect(
          {
            kind: "upkeep",
            playerId: this.match.turn.activePlayerId,
            sourceId: source.id,
            affectedId: source.id,
            controllerId: source.controllerId,
            ownerId: this.owner(source),
            after: this.effective(source),
          },
          source,
          [source],
        );
    }
    if (this.match.turn.stepIndex === 5) {
      new Combat(this).beginAttackers();
      return;
    }
    if (this.match.turn.stepIndex === 6) {
      if (!this.rules.combat?.attackers.length) this.match.turn.stepIndex = 8;
      else {
        new Combat(this).beginBlockers();
        return;
      }
    }
    if (this.match.turn.stepIndex === 7) {
      new Combat(this).beginDamage();
      return;
    }
    if (this.match.turn.stepIndex === 9) delete this.rules.combat;
    if (
      this.match.turn.stepIndex === 10 &&
      this.rules.monarchId === this.match.turn.activePlayerId
    )
      this.monarchTrigger(
        this.rules.monarchId,
        [{ kind: "draw", count: 1 }],
        "monarch-draw",
      );
    if (this.match.turn.stepIndex === 11) {
      this.cleanup();
      return;
    }
    if (this.match.turn.stepIndex === 2 && this.match.turn.number !== 1)
      this.draw(this.match.turn.activePlayerId, 1);
    this.priority();
  }
  cleanup() {
    const playerId = this.match.turn.activePlayerId;
    if (
      this.zone("hand", playerId).objectIds.length >
      this.maximumHandSize(playerId)
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
      delete this.match.priority;
      return;
    }
    // CR 514: after discarding, damage and end-of-turn changes end together.
    this.rules.markedDamage = {};
    this.rules.temporaryEffects = [];
    const changed = this.checkpoint();
    if (this.match.outcome !== "ongoing") return;
    // Persist cleanup progress through commander choices; declining a return
    // alone does not create an exceptional cleanup Priority opportunity.
    this.rules.cleanupNeedsPriority ||= changed;
    if (new CommanderRules(this).checkpoint()) return;
    new Triggers(this).collectStates();
    const needsPriority =
      this.rules.cleanupNeedsPriority || this.rules.waitingTriggers?.length;
    delete this.rules.cleanupNeedsPriority;
    if (needsPriority) this.priority();
    else this.nextTurn();
  }
  nextTurn() {
    const turn = this.match.turn;
    turn.number++;
    turn.activePlayerId =
      turn.order[
        (turn.order.indexOf(turn.activePlayerId) + 1) % turn.order.length
      ];
    this.beginTurn();
  }
  checkpoint() {
    let performed = false;
    let changed: boolean;
    do {
      changed = false;
      for (const equipment of this.battlefieldSources()) {
        const aura = this.effective(equipment).subtypes?.includes("Aura");
        if (
          !aura &&
          (!equipment.attachmentTo ||
            !this.effective(equipment).subtypes?.includes("Equipment"))
        )
          continue;
        const recipient = equipment.attachmentTo
          ? this.match.objects[equipment.attachmentTo]
          : undefined;
        if (
          !recipient ||
          recipient.zoneId !== this.zone("battlefield").id ||
          !this.effective(recipient).types?.includes("Creature") ||
          this.effective(equipment).types?.includes("Creature")
        ) {
          if (aura) this.toGraveyard(equipment);
          else equipment.attachmentTo = null;
          changed = true;
          performed = true;
        }
      }
      const dying = this.battlefieldSources().filter((object) => {
        const effective = this.effective(object);
        return (
          effective.types?.includes("Creature") &&
          /^-?\d+$/.test(effective.toughness ?? "") &&
          (BigInt(effective.toughness!) <= 0n ||
            (!this.hasKeyword(object, "Indestructible") &&
              BigInt(this.rules.markedDamage?.[object.id] ?? 0) >=
                BigInt(effective.toughness!)))
        );
      });
      // Determine the whole set before moving anything: these deaths are simultaneous.
      const sources = structuredClone(this.battlefieldSources());
      const before = new Map(
        dying.map((object) => [object.id, this.effective(object)]),
      );
      for (const object of dying) {
        this.propose({
          kind: "zone-change",
          objectId: object.id,
          to: this.zone("graveyard", object.ownerId),
          simultaneous: { sources, before: before.get(object.id) },
        });
        changed = true;
        performed = true;
      }
      for (const token of Object.values(this.match.objects).filter(
        (o) => o.kind === "token" && o.zoneId !== this.zone("battlefield").id,
      ))
        // CR 704.5d: a token outside the Battlefield ceases to exist.
        this.propose({ kind: "cease", objectId: token.id });
    } while (changed);
    new Combat(this).prune();
    this.rules.continuousEffects = new CharacteristicsCalculator(
      this.match,
      this.catalog,
    ).active();
    for (const object of this.battlefieldSources()) {
      const plus = object.counters.find((c) => c.kind === "+1/+1");
      const minus = object.counters.find((c) => c.kind === "-1/-1");
      if (plus && minus) {
        performed = true;
        const common =
          BigInt(plus.quantity) < BigInt(minus.quantity)
            ? BigInt(plus.quantity)
            : BigInt(minus.quantity);
        plus.quantity = (BigInt(plus.quantity) - common).toString();
        minus.quantity = (BigInt(minus.quantity) - common).toString();
        object.counters = object.counters.filter((c) => c.quantity !== "0");
      }
    }
    for (const player of this.match.players)
      if (
        BigInt(player.life) <= 0n ||
        this.rules.failedDrawPlayerIds?.includes(player.id) ||
        Object.values(this.rules.commanderDamage?.[player.id] ?? {}).some(
          (amount) => amount >= 21,
        )
      )
        player.outcome = "lost";
    this.rules.failedDrawPlayerIds = [];
    const alive = this.match.players.filter((p) => p.outcome === "playing");
    if (alive.length < 2) {
      delete this.match.priority;
      delete this.rules.pending;
      delete this.rules.resolving;
      delete this.rules.waitingTriggers;
      delete this.rules.triggerPlacement;
      delete this.rules.cleanupNeedsPriority;
      if (alive.length) {
        alive[0].outcome = "won";
        this.match.outcome = "complete";
      } else this.match.outcome = "draw";
    }
    return performed;
  }
}
