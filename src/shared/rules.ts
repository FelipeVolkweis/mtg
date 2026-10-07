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
    colorless: z.boolean().optional(),
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
      player: z.literal("event-player").optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("become-monarch"),
      player: z.literal("event-controller").optional(),
    })
    .strict(),
  z.object({ kind: z.literal("tap-attached") }).strict(),
  z.object({ kind: z.literal("counter-event") }).strict(),
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
      recipient: z.literal("target").optional(),
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

/**
 * The runtime ability the engine executes, as the down-compiler emits it
 * (dsl-redesign.md §9 step 3). The Rules Compiler validates authored
 * abilities; this schema only checks the shape and fills defaults.
 */
export const rulesAbilitySchema = z
  .object({
    improvise: z.boolean().optional(),
    aura: objectFilterSchema.optional(),
    monarchUntap: z.boolean().optional(),
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
          "target",
          "mana",
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
  .strict();
export type RulesAbility = z.infer<typeof rulesAbilitySchema>;
export type RulesCost = z.infer<typeof rulesCostSchema>;
export interface PendingProcedure {
  id: string;
  playerId: string;
  kind:
    | "commander-return"
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
  practice?: { playerId: string; controllerParticipantId: string };
  monarchId?: string;
  commanderCasts?: Record<string, number>;
  commanderDamage?: Record<string, Record<string, number>>;
  commanderReturns?: string[];
  cleanupNeedsPriority?: boolean;
  commanderReplay?: {
    action: import("./model.js").MatchAction;
    participantId: string;
    previousPriority?: { playerId: string; passedPlayerIds: string[] };
    previousPending?: PendingProcedure;
    key: string;
    answers: Record<string, boolean>;
  };
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
  triggerPlacement?: WaitingTrigger[];
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
    | "upkeep"
    | "target"
    | "mana";
  playerId?: string;
  stackId?: string;
  defenderId?: string;
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
