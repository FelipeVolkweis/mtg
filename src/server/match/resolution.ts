import { randomInt, randomUUID } from "node:crypto";
import type { MatchAction } from "../../shared/model.js";
import type {
  DiscardEffect,
  RulesValue,
  SelectionOption,
} from "../../shared/rules.js";
import { manaCost, spendMana } from "./mana.js";
import { Combat } from "./combat.js";
import { ObjectEffects } from "./object-effects.js";
import type { RulesEngine } from "./rules-engine.js";

// The queue and bindings are Match data: each completed instruction is removed
// before exposing a choice, so reconnecting resumes the next instruction.
export class Resolution {
  constructor(readonly engine: RulesEngine) {}
  get progress() {
    return this.engine.rules.resolving!;
  }
  value(value: RulesValue) {
    return this.engine.value(
      value,
      this.progress.playerId,
      this.engine.object(this.progress.sourceId).sourceObjectId ??
        this.progress.sourceId,
      this.progress.bindings,
    );
  }
  option(effect: DiscardEffect, label: string): SelectionOption {
    const hand = this.engine.zone("hand", this.progress.playerId);
    const objectIds = hand.objectIds.filter(
      (id) =>
        !effect.types ||
        effect.types.some((type) =>
          this.engine.object(id).characteristics.types?.includes(type),
        ),
    );
    const requestedCount = this.value(effect.count);
    return {
      count: Math.min(requestedCount, objectIds.length),
      requestedCount,
      objectIds,
      label,
      types: effect.types,
    };
  }
  prompt(options: Record<string, SelectionOption>, context: string) {
    this.engine.rules.pending = {
      id: randomUUID(),
      playerId: this.progress.playerId,
      kind: "resolve",
      stage: "selection",
      sourceId: this.progress.sourceId,
      targetIds: [],
      selections: {},
      totalCost: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, generic: 0 },
      options,
      context,
    };
  }
  resume() {
    const progress = this.progress;
    const source = this.engine.object(progress.sourceId);
    while (progress.remaining.length) {
      const effect = progress.remaining.shift()!;
      if (effect.kind === "sequence")
        progress.remaining.unshift(...effect.effects);
      else if (effect.kind === "if")
        progress.remaining.unshift(
          ...(this.value({ binding: effect.condition.binding }) >=
          effect.condition.atLeast
            ? effect.then
            : effect.otherwise),
        );
      else if (
        effect.kind === "tap-choice" ||
        effect.kind === "pay-mana" ||
        effect.kind === "redirect-attack"
      ) {
        progress.actionChoice = effect;
        if (effect.kind === "tap-choice") {
          const ids = Object.values(this.engine.match.objects)
            .filter((o) =>
              this.engine.matches(
                o,
                effect.filter,
                progress.playerId,
                source.sourceObjectId,
              ),
            )
            .map((o) => o.id);
          this.prompt(
            {
              select: {
                count: ids.length,
                minCount: 0,
                objectIds: ids,
                label: "Tap any number of eligible objects (optional)",
              },
            },
            "Choose an optional tap payment.",
          );
        } else if (effect.kind === "pay-mana") {
          this.prompt(
            {},
            "You may pay mana to draw a card. Choose Pay or Decline.",
          );
          this.engine.rules.pending!.stage = "payment";
          this.engine.rules.pending!.totalCost = manaCost(effect.symbols);
        } else {
          const attacker = this.engine.rules.combat?.attackers.find(
            (a) => a.objectId === source.resolution?.targetIds[0],
          );
          if (!attacker) {
            delete progress.actionChoice;
            continue;
          }
          const defenders = new Combat(this.engine).redirectDestinations(
            attacker.objectId,
          );
          this.prompt(
            {
              select: {
                count: 1,
                minCount: 0,
                objectIds: defenders.map((d) => d.id),
                labels: Object.fromEntries(
                  defenders.map((d) => [d.id, d.name]),
                ),
                label: "Choose a new attack destination (optional)",
              },
            },
            "Reselect the attack destination.",
          );
        }
        return;
      } else if (effect.kind === "lose-life") {
        const players = this.engine.match.players.filter((p) =>
          effect.player === "opponents"
            ? p.id !== progress.playerId
            : p.id ===
              (effect.player === "event-player"
                ? source.resolution?.event?.playerId
                : progress.playerId),
        );
        for (const player of players)
          player.life = String(
            BigInt(player.life) - BigInt(this.value(effect.amount)),
          );
      } else if (effect.kind === "draw") {
        const before = this.engine.zone("hand", progress.playerId).objectIds
          .length;
        for (const playerId of effect.player === "each"
          ? this.engine.match.turn.order
          : [progress.playerId])
          this.engine.draw(playerId, this.value(effect.count));
        if (effect.bind)
          progress.bindings[effect.bind] =
            this.engine.zone("hand", progress.playerId).objectIds.length -
            before;
      } else if (effect.kind === "inspect") {
        const ids = this.engine
          .zone("library", progress.playerId)
          .objectIds.slice(0, effect.count);
        if (!ids.length) continue;
        progress.inspectedIds = ids;
        progress.choiceEffect = effect;
        this.prompt(
          effect.select
            ? {
                select: {
                  count: 1,
                  minCount: 0,
                  objectIds: ids.filter((id) =>
                    this.engine.matches(
                      this.engine.object(id),
                      effect.select!,
                      progress.playerId,
                    ),
                  ),
                  label: "Select a card (optional)",
                },
              }
            : {
                bottom: {
                  count: ids.length,
                  minCount: 0,
                  ordered: true,
                  objectIds: ids,
                  label: "Put cards on the bottom (selected order)",
                },
              },
          "Inspect your Library privately.",
        );
        return;
      } else if (
        ["move", "destroy", "exile", "sacrifice"].includes(effect.kind)
      ) {
        if (!("subject" in effect)) continue;
        const operations = new ObjectEffects(this.engine);
        const ids = operations.candidates(effect);
        if (effect.eachPlayer && ids.length) {
          progress.choiceEffect = effect;
          progress.selectionPlayers = this.engine.match.turn.order.filter(
            (playerId) =>
              ids.some(
                (id) => this.engine.object(id).controllerId === playerId,
              ),
          );
          progress.simultaneousIds = [];
          this.promptSacrifice();
          return;
        }
        if ((effect.optional || effect.subject === "choice") && ids.length) {
          progress.choiceEffect = effect;
          this.prompt(
            {
              select: {
                count: effect.subject === "choice" ? 1 : ids.length,
                minCount: effect.optional ? 0 : undefined,
                objectIds: ids,
                label: `${effect.kind} selected object(s)`,
              },
            },
            "Choose objects for the resolving effect.",
          );
          return;
        }
        operations.move(effect, effect.subject === "choice" ? [] : ids);
      } else if (effect.kind === "gain-life") {
        const player = this.engine.match.players.find(
          (p) => p.id === progress.playerId,
        )!;
        player.life = String(BigInt(player.life) + BigInt(effect.amount));
      } else if (effect.kind === "attach") {
        new ObjectEffects(this.engine).attach(
          effect.to === "created"
            ? (progress.createdIds?.at(-1) ?? "")
            : source.resolution!.targetIds[0],
        );
      } else if (effect.kind === "discard" || effect.kind === "alternative") {
        const candidates =
          effect.kind === "discard"
            ? [
                {
                  id: "discard",
                  label: "Discard",
                  effect,
                  requireComplete: false,
                },
              ]
            : effect.options;
        const options = candidates.map((candidate) => ({
          ...candidate,
          option: this.option(candidate.effect, candidate.label),
        }));
        // A fully possible alternative must be taken if one exists. If none
        // can be completed, perform as much of a permitted partial effect as possible.
        const complete = options.filter(
          (o) => o.option.count === o.option.requestedCount,
        );
        const legal = complete.length
          ? complete
          : options.filter((o) => !o.requireComplete);
        const selectable = legal.filter((o) => o.option.count > 0);
        if (!selectable.length) {
          if (effect.kind === "discard" && effect.bind)
            progress.bindings[effect.bind] = 0;
          continue;
        }
        progress.choices = Object.fromEntries(
          selectable.map((o) => [o.id, o.effect]),
        );
        this.prompt(
          Object.fromEntries(selectable.map((o) => [o.id, o.option])),
          `${source.characteristics.name}: choose a discard option from your current Hand.`,
        );
        return;
      } else
        this.engine.effects(
          progress.playerId,
          { costs: [], effects: [effect] },
          source.resolution!.targetIds,
          source.resolution!.color,
        );
    }
    delete this.engine.rules.resolving;
    delete this.engine.rules.pending;
    this.engine.finishResolution(source, true);
    this.engine.priority();
  }
  promptSacrifice() {
    const progress = this.progress;
    const playerId = progress.selectionPlayers![0];
    const ids = new ObjectEffects(this.engine)
      .candidates(
        progress.choiceEffect as import("../../shared/rules.js").MovementEffect,
      )
      .filter((id) => this.engine.object(id).controllerId === playerId);
    this.prompt(
      {
        select: {
          count: ids.length,
          objectIds: ids,
          label: "Sacrifice all your eligible permanents",
        },
      },
      "Select your colored permanents. All players' selections leave together.",
    );
    this.engine.rules.pending!.playerId = playerId;
  }
  answerObjectChoice(action: Extract<MatchAction, { type: "rules-input" }>) {
    const progress = this.progress;
    const effect = progress.choiceEffect!;
    const pending = this.engine.rules.pending!;
    const entries = Object.entries(action.selections ?? {});
    if (entries.some(([key]) => !pending.options?.[key]) || entries.length > 1)
      throw new Error("Choose a legal option.");
    const key = Object.keys(pending.options!)[0];
    const ids = action.selections?.[key] ?? [];
    const option = pending.options![key];
    if (
      ids.length < (option.minCount ?? option.count) ||
      ids.length > option.count ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !option.objectIds.includes(id))
    )
      throw new Error(
        "Choose eligible, distinct objects in the permitted quantity.",
      );
    if (effect.kind !== "inspect" && effect.eachPlayer) {
      progress.simultaneousIds!.push(...ids);
      progress.selectionPlayers!.shift();
      if (progress.selectionPlayers!.length) {
        this.promptSacrifice();
        return;
      }
      new ObjectEffects(this.engine).move(effect, progress.simultaneousIds);
      delete progress.selectionPlayers;
      delete progress.simultaneousIds;
    } else if (effect.kind === "inspect") {
      const library = this.engine.zone("library", progress.playerId);
      if (key === "top") {
        library.objectIds = [
          ...ids,
          ...library.objectIds.filter((id) => !ids.includes(id)),
        ];
      } else if (effect.select) {
        for (const id of ids) {
          const fresh = this.engine.move(
            id,
            this.engine.zone("hand", progress.playerId),
          );
          if (effect.revealSelected) {
            this.engine.rules.revealedHandIds ??= [];
            this.engine.rules.revealedHandIds.push(fresh.id);
          }
        }
        const remaining = progress.inspectedIds!.filter(
          (id) => !ids.includes(id),
        );
        if (effect.randomBottom) {
          for (let i = remaining.length - 1; i > 0; i--) {
            const j = randomInt(i + 1);
            [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
          }
        }
        for (const id of remaining) {
          library.objectIds.splice(library.objectIds.indexOf(id), 1);
          library.objectIds.push(id);
        }
      } else {
        for (const id of ids) {
          library.objectIds.splice(library.objectIds.indexOf(id), 1);
          library.objectIds.push(id);
        }
        const top = progress.inspectedIds!.filter((id) => !ids.includes(id));
        if (top.length > 1) {
          progress.inspectedIds = top;
          this.prompt(
            {
              top: {
                count: top.length,
                ordered: true,
                objectIds: top,
                label: "Order remaining cards on top",
              },
            },
            "Choose top-to-bottom order.",
          );
          // The second answer orders the remaining top cards instead of bottoming them.
          return;
        }
      }
      delete progress.inspectedIds;
    } else new ObjectEffects(this.engine).move(effect, ids);
    delete progress.choiceEffect;
    delete this.engine.rules.pending;
    this.resume();
  }
  answer(action: Extract<MatchAction, { type: "rules-input" }>) {
    if (this.progress.actionChoice) {
      const effect = this.progress.actionChoice;
      if (effect.kind === "pay-mana") {
        if (action.selections || action.variables || action.targetIds)
          throw new Error("Choose Pay or Decline.");
        let paid = 0;
        if (action.confirm !== false) {
          const pool = { ...this.engine.rules.mana[this.progress.playerId] };
          for (const lot of this.engine.rules.restrictedMana?.[
            this.progress.playerId
          ] ?? [])
            pool[lot.type] -= lot.amount;
          const payment = spendMana(pool, manaCost(effect.symbols));
          if (!payment)
            throw new Error("The effect's mana payment cannot be paid yet.");
          for (const type of payment.spent)
            this.engine.rules.mana[this.progress.playerId][type]--;
          paid = 1;
        }
        this.progress.bindings[effect.bind] = paid;
      } else {
        const option = this.engine.rules.pending!.options!.select;
        const ids = action.selections?.select ?? [];
        if (
          Object.keys(action.selections ?? {}).some((k) => k !== "select") ||
          ids.length > option.count ||
          new Set(ids).size !== ids.length ||
          ids.some((id) => !option.objectIds.includes(id))
        )
          throw new Error(
            "Choose eligible, distinct objects in the permitted quantity.",
          );
        if (effect.kind === "tap-choice") {
          if (
            ids.some(
              (id) =>
                !this.engine.matches(
                  this.engine.object(id),
                  effect.filter,
                  this.progress.playerId,
                ),
            )
          )
            throw new Error("Choose untapped eligible objects.");
          for (const id of ids) this.engine.object(id).status.tapped = true;
          this.progress.bindings[effect.bind] = ids.length;
        } else if (ids.length) {
          const stack = this.engine.object(this.progress.sourceId);
          const attacker = this.engine.rules.combat?.attackers.find(
            (a) => a.objectId === stack.resolution?.targetIds[0],
          );
          const defender =
            attacker &&
            new Combat(this.engine)
              .redirectDestinations(attacker.objectId)
              .find((d) => d.id === ids[0]);
          if (
            !attacker ||
            !defender ||
            this.engine.match.objects[defender.id]?.controllerId ===
              this.engine.object(attacker.objectId).controllerId
          )
            throw new Error("Choose a legal attack destination.");
          attacker.defenderId = defender.id;
          attacker.defendingPlayerId = defender.playerId;
        }
      }
      delete this.progress.actionChoice;
      delete this.engine.rules.pending;
      this.resume();
      return;
    }
    if (this.progress.choiceEffect) {
      this.answerObjectChoice(action);
      return;
    }
    const entries = Object.entries(action.selections ?? {});
    const nonempty = entries.filter(([, ids]) => ids.length);
    if (
      nonempty.length !== 1 ||
      entries.some(([key]) => !this.progress.choices?.[key])
    )
      throw new Error("Choose exactly one legal discard option.");
    const [key, ids] = nonempty[0];
    const effect = this.progress.choices![key];
    const option = this.option(effect, key);
    if (
      ids.length !== option.count ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !option.objectIds.includes(id))
    )
      throw new Error(
        "Choose the required number of eligible, distinct cards.",
      );
    for (const id of ids)
      this.engine.move(
        id,
        this.engine.zone("graveyard", this.progress.playerId),
      );
    if (effect.bind) this.progress.bindings[effect.bind] = ids.length;
    delete this.progress.choices;
    delete this.engine.rules.pending;
    this.resume();
  }
}
