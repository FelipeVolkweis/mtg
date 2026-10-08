import type {
  Predicate,
  PredicateFields,
  Selector,
} from "../../shared/card-dsl.js";

// Structural reads over Core AST nodes. Nodes are compared by structure, not
// by serialized text: key order doesn't matter, and a key holding undefined
// is absent, as it is once the node is stored as JSON.

const present = (node: object) =>
  Object.entries(node).filter(([, value]) => value !== undefined);

/** Whether two AST nodes have the same structure and values. */
export function astEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a))
    return (
      a.length === (b as unknown[]).length &&
      a.every((item, i) => astEqual(item, (b as unknown[])[i]))
    );
  const left = present(a);
  const right = new Map(present(b));
  return (
    left.length === right.size &&
    left.every(
      ([key, value]) => right.has(key) && astEqual(value, right.get(key)),
    )
  );
}

/** `{ is: "source" }`: the ability's own object. */
export const isSourcePredicate = (node: unknown) =>
  astEqual(node, { is: "source" });

/** The source as a selector (`"source"`) or as a predicate (`{ is: "source" }`). */
export const isSourceSelector = (node: Selector | Predicate | undefined) =>
  node === "source" || isSourcePredicate(node);

/** `{ attachedTo: "source" }`: what the source is attached to. */
export const isAttachedToSource = (node: unknown) =>
  astEqual(node, { attachedTo: "source" });

/** `{ event: name }`: a reference to the triggering event's `name`. */
export const isEventReference = (node: unknown, name: string) =>
  astEqual(node, { event: name });

/** Whether the variable `name` (as `{ variable: name }`) appears anywhere in `node`. */
export function mentionsVariable(node: unknown, name: string): boolean {
  if (typeof node !== "object" || !node) return false;
  if (astEqual(node, { variable: name })) return true;
  return (Array.isArray(node) ? node : Object.values(node)).some((child) =>
    mentionsVariable(child, name),
  );
}

/** The field sets of a predicate's top-level conjuncts. */
export function conjuncts(predicate: Predicate): PredicateFields[] {
  if ("and" in predicate) return predicate.and.flatMap(conjuncts);
  if ("or" in predicate || "not" in predicate) return [];
  return [predicate];
}
