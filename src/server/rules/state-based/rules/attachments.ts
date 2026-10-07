import type { GameObject } from "../../../../shared/model.js";
import type { RulesQuery } from "../../context.js";
import { changes, type StateBasedRule } from "../types.js";
import { battlefield } from "./support.js";

/** Whether an attached permanent's host is no longer a legal creature. */
function illegallyAttached(query: RulesQuery, object: GameObject) {
  const host = object.attachmentTo
    ? query.match.objects[object.attachmentTo]
    : undefined;
  return (
    !host ||
    host.zoneId !== query.zone("battlefield").id ||
    !query.effective(host).types?.includes("Creature") ||
    !!query.effective(object).types?.includes("Creature")
  );
}

/** CR 704.5m: an Aura attached illegally, or to nothing, goes to the Graveyard. */
export const auraLegality: StateBasedRule = {
  id: "aura-legality",
  evaluate: (query) =>
    changes(
      battlefield(query)
        .filter(
          (object) =>
            query.effective(object).subtypes?.includes("Aura") &&
            illegallyAttached(query, object),
        )
        .map((object) => ({ kind: "graveyard", objectId: object.id })),
    ),
};

/** CR 704.5n: an Equipment attached illegally becomes unattached. */
export const equipmentLegality: StateBasedRule = {
  id: "equipment-legality",
  evaluate: (query) =>
    changes(
      battlefield(query)
        .filter((object) => {
          const subtypes = query.effective(object).subtypes;
          return (
            !subtypes?.includes("Aura") &&
            !!object.attachmentTo &&
            !!subtypes?.includes("Equipment") &&
            illegallyAttached(query, object)
          );
        })
        .map((object) => ({ kind: "unattach", objectId: object.id })),
    ),
};
