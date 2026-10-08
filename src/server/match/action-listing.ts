import type {
  Ability,
  ManaProduction,
  ManaType,
} from "../../shared/card-dsl.js";
import type { GameObject, MatchAction } from "../../shared/rules-state.js";
import {
  costsOf,
  isManaAbility,
  oncePerTurn,
  production,
  sorceryTiming,
} from "../rules/abilities.js";
import type { RulesQuery } from "../rules/context.js";
import { procedureHandler } from "../rules/procedures/registry.js";
import { mainTiming } from "./turn-structure.js";

export interface LegalAction {
  label: string;
  action: MatchAction;
}

/**
 * The legality checks action listing shares with casting and activation, so a
 * listed action is one the engine accepts.
 */
export interface ActionListingContext {
  readonly query: RulesQuery;
  /** Runs a read pass: characteristics are computed once per object. */
  reading<T>(read: () => T): T;
  canCastTiming(object: GameObject, playerId: string): boolean;
  /** The player has a land play left this turn (CR 305.2). */
  canPlayLand(playerId: string): boolean;
  targetsAvailable(
    playerId: string,
    ability: Ability,
    sourceId?: string,
  ): boolean;
  abilities(object: GameObject): Ability[];
  canActivateFromZone(
    source: GameObject,
    playerId: string,
    ability: Ability,
  ): boolean;
  activationAllowed(
    source: GameObject,
    playerId: string,
    ability: Ability,
  ): boolean;
  canPayTapSymbol(source: GameObject, playerId: string): boolean;
  manaColors(produce: ManaProduction, playerId: string): ManaType[];
}

/**
 * The actions a player may take now: pass, play a land, cast a spell or
 * activate an ability with Priority, or a mana ability in a payment window.
 */
export function legalActions(
  ctx: ActionListingContext,
  playerId: string,
): LegalAction[] {
  return ctx.reading(() => listActions(ctx, playerId));
}

function listActions(
  ctx: ActionListingContext,
  playerId: string,
): LegalAction[] {
  const { match } = ctx.query;
  const rules = match.rules;
  if (
    match.outcome !== "ongoing" ||
    rules.setup.keptPlayerIds.length < match.players.length
  )
    return [];
  const pending = rules.pending;
  if (
    pending &&
    (pending.playerId !== playerId ||
      !procedureHandler(pending).manaWindow(pending))
  )
    return [];
  if (!pending && match.priority?.playerId !== playerId) return [];
  const actions: LegalAction[] = pending
    ? []
    : [{ label: "Pass Priority", action: { type: "pass-priority" } }];
  for (const object of Object.values(match.objects)) {
    if (object.controllerId !== playerId) continue;
    const ownHand =
      object.zoneId === ctx.query.zone("hand", playerId).id ||
      (object.zoneId === ctx.query.zone("command").id &&
        object.cardInstanceIds.some((id) => match.instances[id]?.commander));
    if (!pending && ownHand) {
      if (object.characteristics.types?.includes("Land")) {
        if (mainTiming(ctx.query, playerId) && ctx.canPlayLand(playerId))
          actions.push({
            label: `Play ${object.characteristics.name}`,
            action: { type: "play-land", objectId: object.id },
          });
      } else if (ctx.canCastTiming(object, playerId)) {
        const spell = ctx.query
          .definition(object)
          ?.abilities.find((a) => a.kind === "spell");
        if (!spell || ctx.targetsAvailable(playerId, spell))
          actions.push({
            label: `Cast ${object.characteristics.name}`,
            action: { type: "cast-spell", objectId: object.id },
          });
      }
    }
    for (const ability of ctx.abilities(object)) {
      if (pending && !isManaAbility(ability)) continue;
      if (
        oncePerTurn(ability) &&
        rules.thisTurn.activationUsage[`${object.id}:${ability.id}`]
      )
        continue;
      if (sorceryTiming(ability) && !mainTiming(ctx.query, playerId)) continue;
      if (!ctx.canActivateFromZone(object, playerId, ability)) continue;
      if (!ctx.activationAllowed(object, playerId, ability)) continue;
      if (!ctx.targetsAvailable(playerId, ability, object.id)) continue;
      if (
        costsOf(ability).some((cost) => cost.kind === "tap-source") &&
        !ctx.canPayTapSymbol(object, playerId)
      )
        continue;
      const produce = production(ability);
      if (produce) {
        const colors = ctx.manaColors(produce, playerId);
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
