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
} from "../../shared/model.js";
import {
  manaTypes,
  type ManaPool,
  type ManaType,
  type ObjectFilter,
  type PendingProcedure,
  type RulesAbility,
  rulesAbilitySchema,
} from "../../shared/rules.js";
import { gameObject, moveObject } from "./game-objects.js";
import { manaCost, spendMana } from "./mana.js";
import { Library } from "./zones.js";

export const emptyMana = (): ManaPool => ({
  W: 0,
  U: 0,
  B: 0,
  R: 0,
  G: 0,
  C: 0,
});

export class RulesEngine {
  readonly rules;
  constructor(
    readonly match: MatchState,
    readonly catalog: Catalog,
  ) {
    if (!match.rules) throw new Error("Rules Match state is missing.");
    this.rules = match.rules;
  }
  zone(kind: ZoneKind, playerId?: string) {
    const zone = this.match.zones.find(
      (z) => z.kind === kind && (!playerId || z.ownerId === playerId),
    );
    if (!zone) throw new Error("Zone not found.");
    return zone;
  }
  apply(participant: Participant, action: MatchAction): undefined {
    const player = this.match.players.find(
      (p) => p.participantId === participant.id,
    );
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
        pending.kind !== "cleanup"
      )
        delete this.rules.pending;
      else
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
      else if (action.type === "position") {
        const object = this.object(action.objectId);
        if (
          object.zoneId !== this.zone("battlefield").id ||
          object.controllerId !== player.id
        )
          throw new Error("Choose your Battlefield object.");
        this.match.layout.positions[object.id] = action.position;
      } else throw new Error("Use a legal rules action.");
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
      for (const id of [...hand.objectIds]) moveObject(this.match, id, library);
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
      for (const id of action.bottomIds) moveObject(this.match, id, library);
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
    this.match.priority = { playerId, passedPlayerIds: [] };
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
      this.priority();
      return;
    }
    this.advanceStep();
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
      const ownHand = object.zoneId === this.zone("hand", playerId).id;
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
        } else if (
          object.characteristics.types?.includes("Instant") ||
          this.mainTiming(playerId)
        ) {
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
        if (!this.canActivateFromZone(object, playerId, ability)) continue;
        if (
          rules.costs.some((cost) => cost.kind === "tap-source") &&
          !this.canPayTapSymbol(object, playerId)
        )
          continue;
        const effect = rules.effects.find(
          (effect) => effect.kind === "add-mana",
        );
        if (effect?.kind === "add-mana") {
          const colors =
            effect.colors === "commander-colors"
              ? (this.rules.commanders[playerId].colorIdentity as ManaType[])
              : effect.colors;
          for (const color of colors)
            actions.push({
              label: `${object.characteristics.name}: add ${effect.quantity} ${color}`,
              action: {
                type: "activate-ability",
                objectId: object.id,
                abilityId: ability.id,
                color,
              },
            });
        } else
          actions.push({
            label: `${object.characteristics.name}: ${ability.id}`,
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
  selectionOptions(
    pending: PendingProcedure,
  ): Record<string, { count: number; objectIds: string[] }> {
    if (pending.kind === "cleanup")
      return {
        discard: {
          count: this.zone("hand", pending.playerId).objectIds.length - 7,
          objectIds: [...this.zone("hand", pending.playerId).objectIds],
        },
      };
    const options: Record<string, { count: number; objectIds: string[] }> = {};
    for (const [index, cost] of (pending.ability?.costs ?? []).entries())
      if ("filter" in cost)
        options[String(index)] = {
          count: cost.count,
          objectIds: this.legalTargets(pending.playerId, cost.filter).filter(
            (id) => {
              const object = this.object(id);
              return (
                object.controllerId === pending.playerId &&
                (cost.kind !== "tap" || !object.status.tapped)
              );
            },
          ),
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
    this.enter(object);
    this.rules.landsPlayed[playerId] = 1;
    this.priority(playerId);
  }
  enter(object: GameObject) {
    const tapped = this.definition(object)?.abilities.some((ability) =>
      ability.rules?.effects.some((effect) => effect.kind === "enter-tapped"),
    );
    const fresh = moveObject(this.match, object.id, this.zone("battlefield"));
    fresh.status.tapped = !!tapped;
    return fresh;
  }
  matches(object: GameObject, filter: ObjectFilter, playerId: string) {
    const zone = this.match.zones.find((z) => z.id === object.zoneId)!;
    const types = object.characteristics.types ?? [];
    return (
      zone.kind === filter.zone &&
      (zone.visibility !== "private" || zone.ownerId === playerId) &&
      (!filter.controller || object.controllerId === playerId) &&
      (!filter.kind ||
        (filter.kind === "spell"
          ? object.kind === "card" && zone.kind === "stack"
          : filter.kind === "permanent"
            ? zone.kind === "battlefield"
            : object.kind === "card")) &&
      (!filter.types || filter.types.some((type) => types.includes(type))) &&
      (!filter.excludeTypes ||
        filter.excludeTypes.every((type) => !types.includes(type))) &&
      (!filter.untapped || !object.status.tapped)
    );
  }
  legalTargets(playerId: string, filter: ObjectFilter) {
    return Object.values(this.match.objects)
      .filter((object) => this.matches(object, filter, playerId))
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
            origin: "rules",
            applicableZone: "battlefield",
            rules: {
              costs: [{ kind: "tap-source" }],
              effects: [
                { kind: "add-mana", quantity: 1, colors: [colors[subtype]] },
              ],
              manaAbility: true,
            },
          });
    }
    return abilities;
  }
  cast(playerId: string, id: string) {
    const source = this.object(id);
    if (
      source.zoneId !== this.zone("hand", playerId).id ||
      source.characteristics.types?.includes("Land")
    )
      throw new Error("Choose a spell from your Hand.");
    if (
      !source.characteristics.types?.includes("Instant") &&
      !this.mainTiming(playerId)
    )
      throw new Error(
        "This spell requires your main phase and an empty Stack.",
      );
    const spellAbilities =
      this.definition(source)?.abilities.filter(
        (ability) => ability.kind === "spell",
      ) ?? [];
    if (spellAbilities.length > 1)
      throw new Error("This spell composition is not yet supported.");
    const ability = spellAbilities[0]?.rules ?? { costs: [], effects: [] };
    const symbols = source.characteristics.manaCost?.match(/\{[^{}]+\}/g) ?? [];
    if (!source.characteristics.manaCost && !symbols.length)
      throw new Error("A spell without a mana cost cannot be cast normally.");
    this.rules.pending = {
      id: randomUUID(),
      playerId,
      kind: "cast",
      stage: ability.target ? "targets" : "payment",
      sourceId: id,
      ability: structuredClone(ability),
      targetIds: [],
      selections: {},
      totalCost: manaCost(symbols),
    };
    if (ability.target && !this.legalTargets(playerId, ability.target).length)
      throw new Error("No legal targets are available.");
    if (!ability.target) this.tryComplete(playerId);
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
      (!source.characteristics.types?.includes("Creature") ||
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
    if (duringPayment && !ability.manaAbility)
      throw new Error("Only mana abilities may be used in the payment window.");
    const procedure: PendingProcedure = {
      id: randomUUID(),
      playerId,
      kind: "activate",
      stage: ability.target ? "targets" : "payment",
      sourceId: source.id,
      abilityId: authored.id,
      ability,
      targetIds: [],
      selections: {},
      color: action.color,
      totalCost: manaCost(
        ability.costs.flatMap((cost) =>
          cost.kind === "mana" ? cost.symbols : [],
        ),
      ),
    };
    if (ability.manaAbility) {
      // Mana activations are atomic even when an enclosing cast is waiting.
      if (!this.pay(procedure))
        throw new Error("The mana ability's complete costs cannot be paid.");
      this.effects(playerId, ability, [], action.color);
      if (!duringPayment) this.priority(playerId);
    } else {
      this.rules.pending = procedure;
      if (!ability.target) this.tryComplete(playerId);
    }
  }
  input(
    playerId: string,
    action: Extract<MatchAction, { type: "rules-input" }>,
  ) {
    const pending = this.rules.pending!;
    if (pending.kind === "cleanup") {
      const hand = this.zone("hand", playerId);
      const ids = action.selections?.discard ?? [];
      if (
        ids.length !== hand.objectIds.length - 7 ||
        new Set(ids).size !== ids.length ||
        ids.some((id) => !hand.objectIds.includes(id))
      )
        throw new Error("Choose the required cards to discard for cleanup.");
      for (const id of ids)
        moveObject(this.match, id, this.zone("graveyard", playerId));
      delete this.rules.pending;
      this.nextTurn();
      return;
    }
    if (action.color) pending.color = action.color;
    if (action.selections) pending.selections = action.selections;
    if (pending.stage === "targets") {
      const targets = action.targetIds ?? [];
      if (
        targets.length !== 1 ||
        !this.legalTargets(playerId, pending.ability!.target!).includes(
          targets[0],
        )
      )
        throw new Error("Choose one legal target.");
      pending.targetIds = targets;
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
    if (!this.pay(pending)) return false;
    const source = pending.sourceId!;
    if (pending.kind === "cast") {
      const object = this.object(source);
      const sourceZoneId = object.zoneId;
      const spell = moveObject(this.match, source, this.zone("stack"));
      spell.resolution = {
        ability: pending.ability!,
        targetIds: pending.targetIds,
      };
      spell.casting = {
        sourceZoneId,
        modes: [],
        components: [0],
        additionalCosts: [],
        manaSpent: this.lastManaSpent,
      };
    } else {
      const object = gameObject("ability", this.zone("stack").id, playerId, {
        name: `${this.lastSourceName}: ${pending.abilityId}`,
        colors: [],
        typeLine: "Ability",
        rulesText: "",
      });
      object.sourceObjectId = source;
      object.sourceAbilityId = pending.abilityId;
      object.resolution = {
        ability: pending.ability!,
        targetIds: pending.targetIds,
        color: pending.color,
      };
      this.match.objects[object.id] = object;
      this.zone("stack").objectIds.push(object.id);
    }
    delete this.rules.pending;
    this.priority(playerId);
    return true;
  }
  lastManaSpent: ManaType[] = [];
  lastSourceName = "";
  pay(pending: PendingProcedure) {
    const playerId = pending.playerId,
      source = this.object(pending.sourceId!);
    const player = this.match.players.find((p) => p.id === playerId)!;
    const ability = pending.ability!;
    const colors = this.rules.commanders[playerId].colorIdentity as ManaType[];
    for (const effect of ability.effects) {
      if (effect.kind === "add-mana") {
        const allowed =
          effect.colors === "commander-colors" ? colors : effect.colors;
        if (
          !allowed.includes(
            pending.color ?? (allowed.length === 1 ? allowed[0] : undefined)!,
          )
        )
          throw new Error("Choose a permitted mana color.");
      }
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
      } else if (["tap", "sacrifice", "discard"].includes(cost.kind)) {
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
            (cost.kind === "sacrifice" &&
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
    const payment = spendMana(available, pending.totalCost);
    if (!payment) return false;
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
    player.life = (BigInt(player.life) - BigInt(life)).toString();
    for (const [index, cost] of costs.entries()) {
      if (cost.kind === "tap-source") source.status.tapped = true;
      else if (
        cost.kind === "sacrifice-source" ||
        cost.kind === "discard-source"
      )
        moveObject(this.match, source.id, this.zone("graveyard", playerId));
      else if (
        cost.kind === "tap" ||
        cost.kind === "sacrifice" ||
        cost.kind === "discard"
      )
        for (const id of pending.selections[String(index)] ?? []) {
          if (cost.kind === "tap") this.object(id).status.tapped = true;
          else moveObject(this.match, id, this.zone("graveyard", playerId));
        }
    }
    return true;
  }
  effects(
    playerId: string,
    ability: RulesAbility,
    targets: string[],
    color?: ManaType,
  ) {
    for (const effect of ability.effects) {
      if (effect.kind === "draw") this.draw(playerId, effect.count);
      else if (effect.kind === "add-mana") {
        const colors =
          effect.colors === "commander-colors"
            ? (this.rules.commanders[playerId].colorIdentity as ManaType[])
            : effect.colors;
        const type = color ?? colors[0];
        this.rules.mana[playerId][type] += effect.quantity;
        if (effect.restriction) {
          this.rules.restrictedMana ??= {};
          this.rules.restrictedMana[playerId] ??= [];
          this.rules.restrictedMana[playerId].push({
            type,
            amount: effect.quantity,
            restriction: structuredClone(effect.restriction),
          });
        }
      } else if (effect.kind === "counter-target") {
        const target = this.match.objects[targets[0]];
        if (target && !target.cannotBeCountered) this.toGraveyard(target);
      }
    }
  }
  toGraveyard(object: GameObject) {
    const ownerId =
      this.match.instances[object.cardInstanceIds[0]]?.ownerId ??
      object.controllerId;
    if (object.kind === "ability") {
      this.zone("stack").objectIds.splice(
        this.zone("stack").objectIds.indexOf(object.id),
        1,
      );
      delete this.match.objects[object.id];
    } else moveObject(this.match, object.id, this.zone("graveyard", ownerId));
  }
  resolve() {
    const stack = this.zone("stack"),
      object = this.object(stack.objectIds.at(-1)!);
    const resolution = object.resolution;
    const valid =
      !resolution?.ability.target ||
      resolution.targetIds.some(
        (id) =>
          this.match.objects[id] &&
          this.matches(
            this.match.objects[id],
            resolution.ability.target!,
            object.controllerId,
          ),
      );
    if (valid && resolution)
      this.effects(
        object.controllerId,
        resolution.ability,
        resolution.targetIds,
        resolution.color,
      );
    if (
      object.kind === "card" &&
      valid &&
      !object.characteristics.types?.some(
        (type) => type === "Instant" || type === "Sorcery",
      )
    )
      this.enter(object);
    else this.toGraveyard(object);
  }
  draw(playerId: string, count: number) {
    const library = this.zone("library", playerId),
      hand = this.zone("hand", playerId);
    for (let i = 0; i < count; i++) {
      if (!library.objectIds.length) {
        this.rules.failedDrawPlayerIds ??= [];
        if (!this.rules.failedDrawPlayerIds.includes(playerId))
          this.rules.failedDrawPlayerIds.push(playerId);
        break;
      }
      moveObject(this.match, library.objectIds[0], hand);
    }
  }
  beginTurn() {
    this.match.turn.stepIndex = 0;
    this.rules.turnStarted[this.match.turn.activePlayerId] =
      this.match.turn.number;
    this.rules.landsPlayed = {};
    for (const object of Object.values(this.match.objects))
      if (
        object.zoneId === this.zone("battlefield").id &&
        object.controllerId === this.match.turn.activePlayerId
      )
        object.status.tapped = false;
    this.advanceStep();
  }
  advanceStep() {
    for (const player of this.match.players)
      this.rules.mana[player.id] = emptyMana();
    this.rules.restrictedMana = {};
    this.match.turn.stepIndex++;
    // There are no declared attackers in these rules slices. Empty combat skips
    // declare-blockers and combat-damage steps (CR 508.8).
    if (this.match.turn.stepIndex === 6) this.match.turn.stepIndex = 8;
    if (this.match.turn.stepIndex === 11) {
      const playerId = this.match.turn.activePlayerId;
      const hand = this.zone("hand", playerId);
      if (hand.objectIds.length > 7) {
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
      this.nextTurn();
      return;
    }
    if (this.match.turn.stepIndex === 2 && this.match.turn.number !== 1)
      this.draw(this.match.turn.activePlayerId, 1);
    this.priority();
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
    for (const player of this.match.players)
      if (
        BigInt(player.life) <= 0n ||
        this.rules.failedDrawPlayerIds?.includes(player.id)
      )
        player.outcome = "lost";
    this.rules.failedDrawPlayerIds = [];
    const alive = this.match.players.filter((p) => p.outcome === "playing");
    if (alive.length < 2) {
      if (alive.length) {
        alive[0].outcome = "won";
        this.match.outcome = "complete";
      } else this.match.outcome = "draw";
    }
  }
}
