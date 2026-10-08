import type {
  Condition,
  Cost,
  Predicate,
  Selector,
  Value,
} from "../../shared/card-dsl.js";

// What a runtime construct's support declaration may ask of the support
// check (support.ts). Each effect, trigger, cost, static grant, replacement
// and keyword declares, next to the code that runs it, which of its forms the
// runtime supports; the check walks an ability and asks them.

export interface SupportCheck {
  /** Rejects the ability: `what` names the construct, as a noun phrase. */
  unsupported(what: string): never;
  /** Runs `run` with `field` appended to the reported path. */
  at<T>(field: string, run: () => T): T;
  /** An object filter the evaluator supports; a Zone is required unless `requireZone` is false. */
  filter(predicate: Predicate, requireZone?: boolean): void;
  /** A condition the evaluator decides. */
  condition(condition: Condition): void;
  /** A value the evaluator supports. */
  value(value: Value): void;
  /** The objects a static ability applies to. */
  objects(selector: Selector): void;
  /** A rule keyword the runtime has. */
  keyword(keyword: string): void;
  /** Costs, each by its own declaration. */
  costs(costs: Cost[]): void;
}

/**
 * A registry by Core kind, as the support coverage test reads it: each entry
 * holds the runtime code for its kind and its `support` declaration.
 */
export type Registry = Readonly<Record<string, object | undefined>>;

/** An entry the engine applies through a reader over abilities (abilities.ts). */
export interface RegistryEntry {
  reader: (...args: never[]) => unknown;
}

/** The declaration of a construct the runtime supports in every form. */
export const supported = (): void => undefined;
