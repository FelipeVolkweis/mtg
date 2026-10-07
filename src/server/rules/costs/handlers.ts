import type {
  GameObject,
  SelectionOption,
} from "../../../shared/rules-state.js";
import type { Cost, Predicate } from "../../../shared/card-dsl.js";
import type {
  ComponentPlan,
  CostContext,
  CostHandler,
  CostMutation,
} from "./types.js";
import { RuleViolation } from "../rule-violation.js";

// Cost Handlers (rules-engine-refactor.md §36): one per Core cost kind. Each
// validates its own component and returns data; the Cost Runtime checks the
// components against each other and commits them together.

type Of<K extends Cost["kind"]> = Extract<Cost, { kind: K }>;
type Selected = Of<"tap" | "sacrifice" | "discard" | "return" | "exile">;

const planned = (...mutations: CostMutation[]): ComponentPlan => ({
  kind: "planned",
  mutations,
});
const incomplete: ComponentPlan = { kind: "incomplete" };

const onBattlefield = (ctx: CostContext, object: GameObject) =>
  object.zoneId === ctx.engine.zone("battlefield").id;

function requireSourceIn(
  ctx: CostContext,
  zone: "battlefield" | "hand",
  message: string,
) {
  const expected =
    zone === "hand"
      ? ctx.engine.zone("hand", ctx.playerId)
      : ctx.engine.zone("battlefield");
  if (ctx.source.zoneId !== expected.id) throw new RuleViolation(message);
}

/** The player's distinct chosen objects for a component, if complete. */
function chosen(ctx: CostContext, key: string, count?: number) {
  const ids = ctx.selections[key] ?? [];
  if (count === undefined ? !ids.length : ids.length !== count)
    return undefined;
  if (new Set(ids).size !== ids.length)
    throw new RuleViolation("Choose distinct objects for each cost.");
  return ids.map((id) => ctx.engine.object(id));
}

/** Objects the player controls that a selected cost's filter accepts. */
function candidates(
  ctx: CostContext,
  cost: { filter: Predicate },
  untapped: boolean,
) {
  return Object.values(ctx.engine.match.objects)
    .filter((object) => ctx.engine.matches(object, cost.filter, ctx.playerId))
    .filter(
      (object) =>
        object.controllerId === ctx.playerId &&
        (!untapped || !object.status.tapped),
    )
    .map((object) => object.id);
}

const selectedZone: Record<Selected["kind"], "battlefield" | "hand" | null> = {
  tap: "battlefield",
  sacrifice: "battlefield",
  return: "battlefield",
  discard: "hand",
  // The filter names the Zone a card is exiled from.
  exile: null,
};
const selectedMove = {
  sacrifice: "graveyard",
  discard: "graveyard",
  return: "hand",
  exile: "exile",
} as const;

const selected: CostHandler<Selected> = {
  plan(cost, key, ctx) {
    const objects = chosen(ctx, key, cost.count);
    if (!objects) return incomplete;
    const zone = selectedZone[cost.kind];
    for (const object of objects) {
      const zoneId =
        zone === "hand"
          ? ctx.engine.zone("hand", ctx.playerId).id
          : zone === "battlefield"
            ? ctx.engine.zone("battlefield").id
            : object.zoneId;
      if (
        object.controllerId !== ctx.playerId ||
        object.zoneId !== zoneId ||
        !ctx.engine.matches(object, cost.filter, ctx.playerId) ||
        (cost.kind === "tap" && object.status.tapped)
      )
        throw new RuleViolation("Choose legal, distinct objects for the cost.");
    }
    return planned(
      ...objects.map((object): CostMutation =>
        cost.kind === "tap"
          ? { kind: "tap", objectId: object.id }
          : { kind: "move", objectId: object.id, to: selectedMove[cost.kind] },
      ),
    );
  },
  options(cost, ctx): SelectionOption {
    return {
      count: cost.count,
      objectIds: candidates(ctx, cost, cost.kind === "tap"),
    };
  },
};

const handlers: { [K in Cost["kind"]]: CostHandler<Of<K>> } = {
  // Mana is the locked total cost, paid by the Cost Runtime's mana step.
  mana: { plan: () => planned() },
  "tap-source": {
    plan(_cost, _key, ctx) {
      if (!ctx.engine.canPayTapSymbol(ctx.source, ctx.playerId))
        throw new RuleViolation("The source cannot pay its tap-symbol cost.");
      return planned({ kind: "tap", objectId: ctx.source.id });
    },
  },
  "untap-source": {
    plan(_cost, _key, ctx) {
      if (!onBattlefield(ctx, ctx.source) || !ctx.source.status.tapped)
        throw new RuleViolation("The source cannot pay its untap-symbol cost.");
      return planned({ kind: "untap", objectId: ctx.source.id });
    },
  },
  "sacrifice-source": {
    plan(_cost, _key, ctx) {
      requireSourceIn(ctx, "battlefield", "The source cannot be sacrificed.");
      return planned({
        kind: "move",
        objectId: ctx.source.id,
        to: "graveyard",
      });
    },
  },
  "discard-source": {
    plan(_cost, _key, ctx) {
      requireSourceIn(ctx, "hand", "The source cannot be discarded.");
      return planned({
        kind: "move",
        objectId: ctx.source.id,
        to: "graveyard",
      });
    },
  },
  "exile-source": {
    plan(_cost, _key, ctx) {
      requireSourceIn(ctx, "battlefield", "The source cannot be exiled.");
      return planned({ kind: "move", objectId: ctx.source.id, to: "exile" });
    },
  },
  life: {
    plan(cost, _key, ctx) {
      const amount = ctx.engine.value(cost.amount, ctx.playerId, ctx.source.id);
      return planned({ kind: "pay-life", amount });
    },
  },
  "counter-source": {
    plan(cost, _key, ctx) {
      requireSourceIn(
        ctx,
        "battlefield",
        "Counter costs require a present permanent.",
      );
      if (cost.operation === "remove") {
        const counter = ctx.source.counters.find(
          (c) => c.kind === cost.counter,
        );
        if (!counter || BigInt(counter.quantity) < BigInt(cost.count))
          throw new RuleViolation(`Remove ${cost.count} ${cost.counter} counters.`);
      }
      return planned({
        kind: "counters",
        objectId: ctx.source.id,
        counter: cost.counter,
        delta: cost.operation === "remove" ? -cost.count : cost.count,
      });
    },
  },
  tap: selected,
  sacrifice: selected,
  discard: selected,
  return: selected,
  exile: selected,
  "tap-total-power": {
    plan(cost, key, ctx) {
      const creatures = chosen(ctx, key);
      if (!creatures) return incomplete;
      let power = 0;
      for (const creature of creatures) {
        if (
          creature.controllerId !== ctx.playerId ||
          creature.status.tapped ||
          !ctx.engine.matches(creature, cost.filter, ctx.playerId)
        )
          throw new RuleViolation("Choose untapped creatures you control to crew.");
        power += Number(ctx.engine.effective(creature).power) || 0;
      }
      if (power < cost.power)
        throw new RuleViolation("Insufficient total power to crew.");
      return planned(
        ...creatures.map((creature): CostMutation => ({
          kind: "tap",
          objectId: creature.id,
        })),
      );
    },
    options(cost, ctx) {
      return {
        count: ctx.engine.battlefieldSources().length,
        minCount: 1,
        label: `Crew: at least ${cost.power} total power`,
        objectIds: candidates(ctx, cost, true),
      };
    },
  },
};

export function costHandler<C extends Cost>(cost: C): CostHandler<C> {
  return handlers[cost.kind] as unknown as CostHandler<C>;
}
