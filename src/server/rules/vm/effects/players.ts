import type { ManaType } from "../../../../shared/card-dsl.js";
import { done, type EffectHandler } from "./types.js";

// Player instructions: draw (CR 121), life (CR 119) and the monarch (CR 724).

export const draw: EffectHandler<"draw"> = {
  execute(effect, ctx) {
    const players = effect.player
      ? ctx.eval.players(effect.player)
      : [ctx.playerId];
    const count = ctx.eval.value(effect.count);
    const hand = ctx.query.zone("hand", ctx.playerId);
    const before = hand.objectIds.length;
    for (const playerId of players)
      for (let i = 0; i < count; i++)
        if (!ctx.propose({ kind: "draw", playerId }).object) break;
    if (effect.bind) ctx.bind(effect.bind, hand.objectIds.length - before);
    return done;
  },
};

export const gainLife: EffectHandler<"gain-life"> = {
  execute(effect, ctx) {
    const amount = ctx.eval.value(effect.amount);
    const players = effect.player
      ? ctx.eval.players(effect.player)
      : [ctx.playerId];
    for (const playerId of players)
      ctx.propose({ kind: "life-change", playerId, amount });
    if (effect.bind) ctx.bind(effect.bind, amount * players.length);
    return done;
  },
};

export const loseLife: EffectHandler<"lose-life"> = {
  execute(effect, ctx) {
    const amount = ctx.eval.value(effect.amount);
    const players = ctx.eval.players(effect.player);
    for (const playerId of players)
      ctx.propose({ kind: "life-change", playerId, amount: -amount });
    if (effect.bind) ctx.bind(effect.bind, amount * players.length);
    return done;
  },
};

export const becomeMonarch: EffectHandler<"become-monarch"> = {
  execute(effect, ctx) {
    const [playerId] = ctx.eval.players(effect.player);
    if (playerId) ctx.rules.monarchId = playerId;
    return done;
  },
};

/** Mana an effect adds to a mana pool (CR 106.4); it empties as the step ends. */
export const addMana: EffectHandler<"add-mana"> = {
  unsupported: (effect) =>
    Array.isArray(effect.mana.colors) && effect.mana.colors.length === 1
      ? undefined
      : "Mana of a color chosen as it is added",
  execute(effect, ctx) {
    const [type] = effect.mana.colors as ManaType[];
    const players = effect.player
      ? ctx.eval.players(effect.player)
      : [ctx.playerId];
    for (const playerId of players) ctx.addMana(playerId, effect.mana, type);
    return done;
  },
};
