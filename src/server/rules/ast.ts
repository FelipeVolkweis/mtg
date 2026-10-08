import type {
  Predicate,
  PredicateFields,
  Selector,
  Value,
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

const selectorKeys = [
  "target",
  "all",
  "choose",
  "binding",
  "event",
  "attachedTo",
  "attachedBy",
  "linked",
  "attackedBy",
];

/** Whether a selector-or-predicate node is a selector (no predicate has these keys). */
export const isSelector = (node: Selector | Predicate): node is Selector =>
  typeof node === "string" || selectorKeys.some((key) => key in node);

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

/**
 * Value forms and predicate fields the evaluator does not run yet. The card
 * DSL grows ahead of the runtime (docs/plans/mono-g-port.md): a form listed
 * here compiles, fails the support check naming it and throws if it ever
 * reaches the evaluator. The runtime runs every form today.
 */
export const unrunValueForms = [] as readonly string[];
export const unrunPredicateFields = [] as readonly (keyof PredicateFields)[];

/** The binding that holds an `atCast` value, fixed when the spell is cast. */
export const atCastKey = (value: unknown) => `atCast:${JSON.stringify(value)}`;

/** The values a spell fixes as it is cast (CR 601.2): every `atCast` operand. */
export function atCastValues(node: unknown): Value[] {
  if (typeof node !== "object" || !node) return [];
  if (
    !Array.isArray(node) &&
    Object.keys(node).length === 1 &&
    "atCast" in node
  )
    return [(node as { atCast: Value }).atCast];
  return (Array.isArray(node) ? node : Object.values(node)).flatMap(
    atCastValues,
  );
}

/**
 * The first value form or predicate field in `node` that the evaluator
 * can't run, as a noun phrase with its path, or undefined. An ability's
 * effects hold values and predicates the support walker doesn't visit one by
 * one, so the check scans for these by shape: a predicate has neither `id`
 * nor `kind`, which a keyword ability or a granted-keyword change has.
 */
export function unrunForm(
  node: unknown,
  path = "",
  forms: { values: readonly string[]; fields: readonly string[] } = {
    values: unrunValueForms,
    fields: unrunPredicateFields,
  },
): { what: string; path: string } | undefined {
  if (typeof node !== "object" || !node) return undefined;
  if (!Array.isArray(node)) {
    const keys = Object.keys(node);
    const value = forms.values.find(
      (form) => keys.length === 1 && keys[0] === form,
    );
    if (value) return { what: `The ${value} value`, path };
    if (!("kind" in node) && !("id" in node)) {
      const field = forms.fields.find((f) => f in node);
      if (field) return { what: `The predicate field ${field}`, path };
    }
  }
  for (const [key, child] of Object.entries(node)) {
    const found = unrunForm(
      child,
      Array.isArray(node) ? `${path}[${key}]` : path ? `${path}.${key}` : key,
      forms,
    );
    if (found) return found;
  }
  return undefined;
}

/** The field sets of a predicate's top-level conjuncts. */
export function conjuncts(predicate: Predicate): PredicateFields[] {
  if ("and" in predicate) return predicate.and.flatMap(conjuncts);
  if ("or" in predicate || "not" in predicate) return [];
  return [predicate];
}
