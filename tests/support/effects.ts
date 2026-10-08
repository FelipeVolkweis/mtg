import { gameObject } from "../../src/server/match/game-objects";
import type { GameObject, SemanticEvent } from "../../src/shared/rules-state";
import type { Effect, ZoneKind } from "../../src/shared/card-dsl";
import { force } from "./force";
import { triggerGame } from "./rules-game";

// Effect Handler tests (rules-test-plan.md §19) run a Core AST primitive
// directly: an ability Game Object with the effects waits on the Stack and
// resolves through Match commands, so every instruction dispatches through
// the effect handler registry, with no card definition involved.

export interface ResolveOptions {
  /** The ability's controller. */
  seat?: number;
  /** The ability's source ("source" in its effects). */
  source?: GameObject;
  targetIds?: string[];
  event?: SemanticEvent;
  /** The chosen X. */
  x?: number;
}

export async function effectGame() {
  const game = await triggerGame();
  const { match } = game;
  const player = (seat: number) => match.players[seat].id;
  const zone = (kind: ZoneKind, seat?: number) =>
    match.zones.find(
      (z) =>
        z.kind === kind && (seat === undefined || z.ownerId === player(seat)),
    )!;
  /** Ids in a Zone, for assertions. */
  const ids = (kind: ZoneKind, seat?: number) => [
    ...zone(kind, seat).objectIds,
  ];
  const life = (seat: number) =>
    match.players.find((p) => p.id === player(seat))!.life;

  /** Puts the ability on the Stack and has both players pass. */
  function resolve(effects: Effect[], options: ResolveOptions = {}) {
    const seat = options.seat ?? 0;
    const ability = gameObject(
      "ability",
      zone("stack").id,
      player(seat),
      player(seat),
      { name: "Test ability", colors: [], typeLine: "Ability", rulesText: "" },
    );
    if (options.source) ability.sourceObjectId = options.source.id;
    if (options.x !== undefined)
      ability.proposal = {
        variables: { X: options.x },
        modes: [],
        optionalCosts: [],
        manaSpent: [],
      };
    ability.resolution = {
      ability: {
        id: "test",
        kind: "activated",
        costs: [],
        effects: structuredClone(effects),
      },
      targetIds: options.targetIds ?? [],
      ...(options.event ? { event: options.event } : {}),
    };
    force.addObject(match, ability);
    force.priority(match, player(seat));
    game.command(seat, { type: "pass-priority" });
    return game.command(1 - seat, { type: "pass-priority" });
  }

  /** The pending resolution prompt as the given seat sees it. */
  const prompt = (seat = 0) => game.view(seat).rules.prompt!;

  return { ...game, player, zone, ids, life, resolve, prompt };
}
