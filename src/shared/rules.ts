import { z } from "zod";

export const manaTypes = ["W", "U", "B", "R", "G", "C"] as const;
export type ManaType = (typeof manaTypes)[number];
export type ManaPool = Record<ManaType, number>;
export const manaRestrictionSchema = z
  .object({
    use: z.enum(["cast", "activate"]).optional(),
    spellTypes: z.array(z.string().min(1)).min(1).optional(),
  })
  .strict();
export interface RestrictedMana {
  type: ManaType;
  amount: number;
  restriction: z.infer<typeof manaRestrictionSchema>;
}
export const objectFilterSchema = z
  .object({
    zone: z.enum([
      "battlefield",
      "hand",
      "stack",
      "graveyard",
      "exile",
      "library",
    ]),
    kind: z.enum(["card", "spell", "permanent"]).optional(),
    subtypes: z.array(z.string().min(1)).optional(),
    allTypes: z.array(z.string().min(1)).optional(),
    self: z.enum(["only", "exclude"]).optional(),
    controller: z.enum(["you", "opponent"]).optional(),
    owner: z.enum(["you", "opponent"]).optional(),
    nontoken: z.boolean().optional(),
    colored: z.boolean().optional(),
    attached: z.boolean().optional(),
    types: z.array(z.string().min(1)).optional(),
    excludeTypes: z.array(z.string().min(1)).optional(),
    untapped: z.boolean().optional(),
    attacking: z.boolean().optional(),
    manaValue: z.lazy(() => valueSchema).optional(),
    damagedBySource: z.boolean().optional(),
  })
  .strict();
export type ObjectFilter = z.infer<typeof objectFilterSchema>;
const quantitySchema = z.union([
  z.number().int().nonnegative().max(1000),
  z.literal("commander-colors"),
]);
export const rulesCostSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("crew"),
      power: z.number().int().positive(),
      filter: objectFilterSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("mana"),
      symbols: z.array(z.string().regex(/^\{(?:[WUBRGCX]|\d+)\}$/)).max(100),
    })
    .strict(),
  z.object({ kind: z.literal("tap-source") }).strict(),
  z.object({ kind: z.literal("sacrifice-source") }).strict(),
  z.object({ kind: z.literal("discard-source") }).strict(),
  z.object({ kind: z.literal("life"), amount: quantitySchema }).strict(),
  z
    .object({
      kind: z.literal("counter-source"),
      counter: z.string().min(1),
      count: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      kind: z.enum(["tap", "sacrifice", "discard", "return"]),
      count: z.number().int().min(1).max(100),
      filter: objectFilterSchema,
    })
    .strict(),
]);
export type RulesValue =
  | number
  | { binding: string }
  | { count: ObjectFilter }
  | { sum: RulesValue[] }
  | { handSize: "you" }
  | { greatestManaValue: ObjectFilter };
export const valueSchema: z.ZodType<RulesValue> = z.lazy(() =>
  z.union([
    z.number().int().nonnegative().max(1000),
    z.object({ binding: z.string().min(1) }).strict(),
    z.object({ handSize: z.literal("you") }).strict(),
    z.object({ greatestManaValue: objectFilterSchema }).strict(),
    z.object({ count: objectFilterSchema }).strict(),
    z.object({ sum: z.array(valueSchema).min(1).max(20) }).strict(),
  ]),
);
export const supportedKeywordSchema = z.enum([
  "Flying",
  "Reach",
  "Flash",
  "Hexproof",
  "Indestructible",
  "Haste",
  "Vigilance",
  "Unblockable",
  "Must attack",
  "Cannot be blocked by Walls",
  "Defender",
]);
export const continuousChangeSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("add-types"),
      types: z.array(z.string()).optional(),
      subtypes: z.array(z.string()).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("set-stats"),
      power: valueSchema,
      toughness: valueSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("grant-keyword"),
      keyword: supportedKeywordSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("linked-characteristics"),
      link: z.string().min(1),
      retainSubtypes: z.array(z.string()),
    })
    .strict(),
  z
    .object({
      kind: z.literal("define-stats"),
      power: valueSchema,
      toughness: valueSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("add-stats"),
      power: valueSchema,
      toughness: valueSchema,
    })
    .strict(),
]);
export type ContinuousChange = z.infer<typeof continuousChangeSchema>;
export interface ActiveContinuousEffect {
  sourceId: string;
  abilityId: string;
  playerId: string;
  filter: ObjectFilter;
  changes: ContinuousChange[];
  applicability:
    "source-on-battlefield" | "characteristic-defining" | "until-end-of-turn";
}
const discardSchema = z
  .object({
    kind: z.literal("discard"),
    count: valueSchema,
    types: z.array(z.string().min(1)).min(1).optional(),
    bind: z.string().min(1).optional(),
  })
  .strict();
const movementSchema = z
  .object({
    kind: z.enum(["move", "destroy", "exile", "sacrifice"]),
    subject: z.enum(["source", "target", "set", "choice"]),
    filter: objectFilterSchema.optional(),
    destination: z
      .enum(["hand", "battlefield", "graveyard", "exile"])
      .optional(),
    optional: z.boolean().optional(),
    eachPlayer: z.boolean().optional(),
    link: z.string().min(1).optional(),
    bind: z.string().min(1).optional(),
  })
  .strict();
export type MovementEffect = z.infer<typeof movementSchema>;
const inspectSchema = z
  .object({
    kind: z.literal("inspect"),
    count: z.number().int().positive().max(100),
    select: objectFilterSchema.optional(),
    randomBottom: z.boolean().optional(),
    revealSelected: z.boolean().optional(),
  })
  .strict();
export type InspectEffect = z.infer<typeof inspectSchema>;
const primitiveEffectSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("damage"),
      amount: valueSchema,
      recipient: z.literal("defender").optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("tap-choice"),
      filter: objectFilterSchema,
      bind: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("pay-mana"),
      symbols: z.array(z.string().regex(/^\{(?:[WUBRGC]|\d+)\}$/)),
      bind: z.string().min(1),
    })
    .strict(),
  z.object({ kind: z.literal("redirect-attack") }).strict(),
  z
    .object({
      kind: z.literal("lose-life"),
      amount: valueSchema,
      player: z.enum(["you", "opponents", "event-player"]),
    })
    .strict(),
  z
    .object({
      kind: z.literal("animate-source"),
      changes: z.array(continuousChangeSchema).min(1).max(20),
    })
    .strict(),
  movementSchema,
  inspectSchema,
  z
    .object({
      kind: z.literal("gain-life"),
      amount: z.number().int().positive(),
    })
    .strict(),
  z
    .object({ kind: z.literal("attach"), to: z.enum(["target", "created"]) })
    .strict(),
  discardSchema,
  z
    .object({
      kind: z.literal("add-counters"),
      filter: objectFilterSchema,
      counter: z.enum(["+1/+1", "-1/-1"]),
      count: z.number().int().min(1).max(100),
    })
    .strict(),
  z
    .object({
      kind: z.literal("create-token"),
      token: z.enum(["thopter", "myr", "germ"]),
      count: z.number().int().min(1).max(100),
    })
    .strict(),
  z
    .object({
      kind: z.literal("draw"),
      count: valueSchema,
      bind: z.string().min(1).optional(),
      player: z.enum(["you", "each"]).optional(),
    })
    .strict(),
  z.object({ kind: z.literal("counter-target") }).strict(),
  z
    .object({
      kind: z.literal("add-mana"),
      quantity: z.number().int().min(1).max(1000),
      colors: z.union([
        z.array(z.enum(manaTypes)).min(1).max(6),
        z.literal("commander-colors"),
      ]),
      restriction: manaRestrictionSchema.optional(),
    })
    .strict(),
  z.object({ kind: z.literal("enter-tapped") }).strict(),
]);
export type DiscardEffect = z.infer<typeof discardSchema>;
export type RulesEffect =
  | z.infer<typeof primitiveEffectSchema>
  | { kind: "sequence"; effects: RulesEffect[] }
  | {
      kind: "if";
      condition: { binding: string; atLeast: number };
      then: RulesEffect[];
      otherwise: RulesEffect[];
    }
  | {
      kind: "alternative";
      options: {
        id: string;
        label: string;
        requireComplete?: boolean;
        effect: DiscardEffect;
      }[];
    };
export const rulesEffectSchema: z.ZodType<RulesEffect> = z.lazy(() =>
  z.union([
    primitiveEffectSchema,
    z
      .object({
        kind: z.literal("sequence"),
        effects: z.array(rulesEffectSchema).max(100),
      })
      .strict(),
    z
      .object({
        kind: z.literal("if"),
        condition: z
          .object({
            binding: z.string().min(1),
            atLeast: z.number().int().nonnegative().max(1000),
          })
          .strict(),
        then: z.array(rulesEffectSchema).max(100),
        otherwise: z.array(rulesEffectSchema).max(100),
      })
      .strict(),
    z
      .object({
        kind: z.literal("alternative"),
        options: z
          .array(
            z
              .object({
                id: z.string().min(1),
                label: z.string().min(1),
                requireComplete: z.boolean().optional(),
                effect: discardSchema,
              })
              .strict(),
          )
          .min(2)
          .max(10),
      })
      .strict(),
  ]),
);

export const conditionSchema = z
  .object({
    value: valueSchema,
    atLeast: valueSchema,
    requireObjects: objectFilterSchema.optional(),
  })
  .strict();

export const rulesAbilitySchema = z
  .object({
    attackCost: z
      .object({
        symbols: z.array(z.string().regex(/^\{(?:[WUBRGC]|\d+)\}$/)).min(1),
      })
      .strict()
      .optional(),
    keyword: supportedKeywordSchema.optional(),
    maximumHandSize: z.literal("unlimited").optional(),
    oncePerTurn: z.boolean().optional(),
    intervening: conditionSchema.optional(),
    castingPermission: objectFilterSchema.optional(),
    timing: z.literal("sorcery").optional(),
    chosenVariables: z.array(z.literal("X")).max(1).optional(),
    costs: z.array(rulesCostSchema).max(100).default([]),
    effects: z.array(rulesEffectSchema).max(100).default([]),
    costModifiers: z
      .array(
        z
          .object({
            use: z.enum(["cast", "activate"]),
            scope: z.enum(["source", "controller"]),
            component: z.literal("generic"),
            filter: objectFilterSchema.optional(),
            amount: valueSchema,
          })
          .strict(),
      )
      .max(20)
      .optional(),
    continuous: z
      .object({
        filter: objectFilterSchema,
        changes: z.array(continuousChangeSchema).min(1).max(20),
        characteristicDefining: z.boolean().optional(),
        condition: z
          .object({
            value: valueSchema,
            atLeast: z.number().int().nonnegative(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    target: objectFilterSchema.optional(),
    trigger: z
      .object({
        event: z.enum([
          "enter",
          "cast",
          "dies",
          "state",
          "damage",
          "attack",
          "draw",
          "upkeep",
        ]),
        filter: objectFilterSchema.optional(),
        player: z.enum(["you", "opponent"]).optional(),
        ordinal: z.number().int().positive().optional(),
        grouped: z.boolean().optional(),
        step: z.number().int().nonnegative().optional(),
        combat: z.boolean().optional(),
        recipientKind: z.enum(["player", "object"]).optional(),
        counter: z.string().min(1).optional(),
        atLeast: z.number().int().positive().optional(),
      })
      .strict()
      .optional(),
    manaAbility: z.boolean().optional(),
  })
  .strict()
  .superRefine((ability, ctx) => {
    const invalid = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    const checkValue = (value: RulesValue, available: Set<string>) => {
      if (typeof value === "number") return;
      if ("binding" in value && !available.has(value.binding))
        invalid("Unknown quantity binding.");
      if ("sum" in value)
        for (const term of value.sum) checkValue(term, available);
    };
    const checkFilter = (
      filter: ObjectFilter | undefined,
      available: Set<string>,
    ) => {
      if (filter?.manaValue !== undefined)
        checkValue(filter.manaValue, available);
    };
    const check = (effects: RulesEffect[], available: Set<string>) => {
      for (const effect of effects) {
        if ("filter" in effect) checkFilter(effect.filter, available);
        if (effect.kind === "lose-life") checkValue(effect.amount, available);
        if (effect.kind === "redirect-attack" && !ability.target?.attacking)
          invalid("Redirection requires an attacking target.");
        if (effect.kind === "sequence") check(effect.effects, available);
        else if (effect.kind === "if") {
          if (!available.has(effect.condition.binding))
            invalid("Unknown condition binding.");
          check(effect.then, new Set(available));
          check(effect.otherwise, new Set(available));
        } else if (effect.kind === "alternative") {
          if (
            new Set(effect.options.map((o) => o.id)).size !==
            effect.options.length
          )
            invalid("Alternative identifiers must be unique.");
          for (const option of effect.options)
            check([option.effect], new Set(available));
        } else if (effect.kind === "draw" || effect.kind === "discard") {
          checkValue(effect.count, available);
          if (effect.bind) {
            if (available.has(effect.bind))
              invalid("Result bindings must be unique.");
            available.add(effect.bind);
          }
        } else if (effect.kind === "animate-source") {
          for (const change of effect.changes)
            if (
              change.kind === "add-stats" ||
              change.kind === "set-stats" ||
              change.kind === "define-stats"
            ) {
              checkValue(change.power, available);
              checkValue(change.toughness, available);
            }
        } else if ("bind" in effect && effect.bind) {
          if (available.has(effect.bind))
            invalid("Result bindings must be unique.");
          available.add(effect.bind);
        } else if (effect.kind === "damage") {
          checkValue(effect.amount, available);
          if (!ability.target && effect.recipient !== "defender")
            invalid("Damage effects require a target declaration.");
        } else if (effect.kind === "counter-target" && !ability.target)
          invalid("Counter effects require a target declaration.");
      }
    };
    if (
      ability.trigger?.event === "state" &&
      (!ability.trigger.counter ||
        !ability.trigger.atLeast ||
        ability.trigger.filter?.self !== "only")
    )
      invalid("State triggers require a source counter threshold.");
    const validateMovements = (effects: RulesEffect[]) => {
      for (const effect of effects) {
        if (effect.kind === "sequence") validateMovements(effect.effects);
        else if (effect.kind === "if") {
          validateMovements(effect.then);
          validateMovements(effect.otherwise);
        } else if ("subject" in effect) {
          if (effect.kind === "move" && !effect.destination)
            invalid("Movement requires a destination.");
          if (
            (effect.subject === "set" || effect.subject === "choice") &&
            !effect.filter
          )
            invalid("Object selection requires a filter.");
          if (effect.subject === "target" && !ability.target)
            invalid("Targeted movement requires a target declaration.");
          if (
            effect.eachPlayer &&
            (effect.kind !== "sacrifice" || effect.subject !== "set")
          )
            invalid("Each-player selections require a sacrifice set.");
          if (effect.link && effect.kind !== "exile")
            invalid("Exile links require an exile operation.");
        }
      }
    };
    validateMovements(ability.effects);
    if (
      ability.costs.some(
        (c) => c.kind === "mana" && c.symbols.includes("{X}"),
      ) &&
      !ability.chosenVariables?.includes("X")
    )
      invalid("Variable mana costs require a chosen X.");
    if (
      ability.trigger &&
      !ability.trigger.filter &&
      !["draw", "upkeep"].includes(ability.trigger.event)
    )
      invalid("Object events require an object filter.");
    if (ability.trigger?.grouped && ability.trigger.event !== "damage")
      invalid("Grouped triggers require damage events.");
    const available = new Set(ability.chosenVariables ?? []);
    checkFilter(ability.target, available);
    checkFilter(ability.trigger?.filter, available);
    if (ability.intervening) {
      checkValue(ability.intervening.value, available);
      checkValue(ability.intervening.atLeast, available);
    }
    check(ability.effects, new Set(available));
    for (const modifier of ability.costModifiers ?? [])
      checkValue(modifier.amount, available);
    for (const change of ability.continuous?.changes ?? []) {
      if (
        change.kind === "define-stats" ||
        change.kind === "set-stats" ||
        change.kind === "add-stats"
      ) {
        checkValue(change.power, available);
        checkValue(change.toughness, available);
      }
    }
    if (
      ability.continuous?.characteristicDefining &&
      (ability.continuous.filter.self !== "only" ||
        ability.continuous.changes.some((c) => c.kind !== "define-stats"))
    )
      invalid("Characteristic definitions must define only their own stats.");

    if (
      ability.manaAbility &&
      (ability.target ||
        ability.effects.some((effect) => effect.kind !== "add-mana"))
    )
      ctx.addIssue({
        code: "custom",
        message: "Mana abilities must only produce mana and cannot target.",
      });
    if (
      ability.effects.some((effect) => effect.kind === "counter-target") &&
      !ability.target
    )
      ctx.addIssue({
        code: "custom",
        message: "Counter effects require a target declaration.",
      });
  });
export type RulesAbility = z.infer<typeof rulesAbilitySchema>;
export type RulesCost = z.infer<typeof rulesCostSchema>;
export interface PendingProcedure {
  id: string;
  playerId: string;
  kind:
    | "declare-attackers"
    | "declare-blockers"
    | "attack-payment"
    | "combat-damage"
    | "cast"
    | "activate"
    | "cleanup"
    | "resolve"
    | "trigger-order"
    | "trigger-target";
  stage: "variable" | "targets" | "payment" | "selection";
  damageChoices?: DamageChoice[];
  variables?: Record<string, number>;
  context?: string;
  options?: Record<string, SelectionOption>;
  sourceId?: string;
  ability?: RulesAbility;
  abilityId?: string;
  targetIds: string[];
  selections: Record<string, string[]>;
  color?: ManaType;
  totalCost: ManaPool & { generic: number };
}
export interface SelectionOption {
  count: number;
  minCount?: number;
  ordered?: boolean;
  requestedCount?: number;
  objectIds: string[];
  label?: string;
  types?: string[];
  labels?: Record<string, string>;
}
export interface ResolutionProgress {
  sourceId: string;
  playerId: string;
  remaining: RulesEffect[];
  bindings: Record<string, number>;
  choices?: Record<string, DiscardEffect>;
  choiceEffect?: MovementEffect | InspectEffect;
  actionChoice?: Extract<
    RulesEffect,
    { kind: "tap-choice" | "pay-mana" | "redirect-attack" }
  >;
  inspectedIds?: string[];
  createdIds?: string[];
  selectionPlayers?: string[];
  simultaneousIds?: string[];
}
export interface CombatAttacker {
  objectId: string;
  defenderId: string;
  defendingPlayerId: string;
  blockerIds: string[];
  blocked: boolean;
}
export interface CombatState {
  attackers: CombatAttacker[];
  remainingDefenderIds: string[];
}
export interface DamageAssignment {
  sourceId: string;
  recipientId: string;
  amount: number;
}
export interface DamageEvent extends DamageAssignment {
  sourceCharacteristics: import("./model.js").Characteristics;
  combat: boolean;
  controllerId: string;
  recipientKind: "player" | "object";
  turn: number;
}
export interface DamageChoice {
  sourceId: string;
  amount: number;
  recipientIds: string[];
}
export interface RulesState {
  markedDamage?: Record<string, number>;
  damageEvents?: DamageEvent[];
  drawsThisTurn?: Record<string, number>;
  activationUsage?: Record<string, number>;
  revealedHandIds?: string[];
  temporaryEffects?: ActiveContinuousEffect[];
  combat?: CombatState;
  orderedTriggerPlayerIds?: string[];
  continuousEffects?: ActiveContinuousEffect[];
  waitingTriggers?: WaitingTrigger[];
  priorityAfterTriggers?: string;
  format: "commander";
  setup: { keptPlayerIds: string[]; startingPlayerId: string };
  pending?: PendingProcedure;
  resolving?: ResolutionProgress;
  mana: Record<string, ManaPool>;
  restrictedMana?: Record<string, RestrictedMana[]>;
  failedDrawPlayerIds?: string[];
  landsPlayed: Record<string, number>;
  controlledSinceTurn: Record<string, number>;
  turnStarted: Record<string, number>;
  commanders: Record<string, { instanceId: string; colorIdentity: string[] }>;
}

export interface SemanticEvent {
  kind:
    | "enter"
    | "cast"
    | "zone-change"
    | "state"
    | "damage"
    | "attack"
    | "draw"
    | "upkeep";
  playerId?: string;
  ordinal?: number;
  damage?: DamageAssignment & {
    combat: boolean;
    recipientKind: "player" | "object";
  };
  sourceId: string;
  affectedId: string;
  controllerId: string;
  ownerId: string;
  from?: import("./model.js").ZoneKind;
  to?: import("./model.js").ZoneKind;
  before?: import("./model.js").Characteristics;
  after: import("./model.js").Characteristics;
}
export interface WaitingTrigger {
  sourceSnapshot?: {
    characteristics: import("./model.js").Characteristics;
    ownerId: string;
  };
  id: string;
  playerId: string;
  sourceId: string;
  abilityId: string;
  sourceName: string;
  ability: RulesAbility;
  event: SemanticEvent;
}
