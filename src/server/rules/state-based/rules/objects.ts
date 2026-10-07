import { changes, type StateBasedRule } from "../types.js";
import { battlefield } from "./support.js";

/** CR 704.5d: a token outside the Battlefield ceases to exist. */
export const tokenCeasesToExist: StateBasedRule = {
  id: "token-ceases-to-exist",
  evaluate: (query) =>
    changes(
      Object.values(query.match.objects)
        .filter(
          (object) =>
            object.kind === "token" &&
            object.zoneId !== query.zone("battlefield").id,
        )
        .map((object) => ({ kind: "cease", objectId: object.id })),
    ),
};

/** CR 704.5q: +1/+1 and -1/-1 counters on a permanent cancel out. */
export const counterCancellation: StateBasedRule = {
  id: "counter-cancellation",
  evaluate: (query) =>
    changes(
      battlefield(query).flatMap((object) => {
        const plus = object.counters.find((c) => c.kind === "+1/+1");
        const minus = object.counters.find((c) => c.kind === "-1/-1");
        if (!plus || !minus) return [];
        const common =
          BigInt(plus.quantity) < BigInt(minus.quantity)
            ? plus.quantity
            : minus.quantity;
        return [
          { kind: "cancel-counters", objectId: object.id, amount: common },
        ];
      }),
    ),
};
