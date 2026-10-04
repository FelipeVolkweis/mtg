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
    zone: z.enum(["battlefield", "hand", "stack"]),
    kind: z.enum(["card", "spell", "permanent"]).optional(),
    controller: z.literal("you").optional(),
    types: z.array(z.string().min(1)).optional(),
    excludeTypes: z.array(z.string().min(1)).optional(),
    untapped: z.boolean().optional(),
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
      kind: z.literal("mana"),
      symbols: z.array(z.string().regex(/^\{(?:[WUBRGC]|\d+)\}$/)).max(100),
    })
    .strict(),
  z.object({ kind: z.literal("tap-source") }).strict(),
  z.object({ kind: z.literal("sacrifice-source") }).strict(),
  z.object({ kind: z.literal("discard-source") }).strict(),
  z.object({ kind: z.literal("life"), amount: quantitySchema }).strict(),
  z
    .object({
      kind: z.enum(["tap", "sacrifice", "discard"]),
      count: z.number().int().min(1).max(100),
      filter: objectFilterSchema,
    })
    .strict(),
]);
const valueSchema = z.union([
  z.number().int().nonnegative().max(1000),
  z.object({ binding: z.string().min(1) }).strict(),
]);
export type RulesValue = z.infer<typeof valueSchema>;
const discardSchema = z
  .object({
    kind: z.literal("discard"),
    count: valueSchema,
    types: z.array(z.string().min(1)).min(1).optional(),
    bind: z.string().min(1).optional(),
  })
  .strict();
const primitiveEffectSchema = z.discriminatedUnion("kind", [
  discardSchema,
  z
    .object({
      kind: z.literal("draw"),
      count: valueSchema,
      bind: z.string().min(1).optional(),
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

export const rulesAbilitySchema = z
  .object({
    chosenVariables: z.array(z.literal("X")).max(1).optional(),
    costs: z.array(rulesCostSchema).max(100).default([]),
    effects: z.array(rulesEffectSchema).max(100).default([]),
    target: objectFilterSchema.optional(),
    manaAbility: z.boolean().optional(),
  })
  .strict()
  .superRefine((ability, ctx) => {
    const invalid = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    const check = (effects: RulesEffect[], available: Set<string>) => {
      for (const effect of effects) {
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
          if (
            typeof effect.count !== "number" &&
            !available.has(effect.count.binding)
          )
            invalid("Unknown quantity binding.");
          if (effect.bind) {
            if (available.has(effect.bind))
              invalid("Result bindings must be unique.");
            available.add(effect.bind);
          }
        } else if (effect.kind === "counter-target" && !ability.target)
          invalid("Counter effects require a target declaration.");
      }
    };
    check(ability.effects, new Set(ability.chosenVariables ?? []));

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
  kind: "cast" | "activate" | "cleanup" | "resolve";
  stage: "variable" | "targets" | "payment" | "selection";
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
  requestedCount?: number;
  objectIds: string[];
  label?: string;
  types?: string[];
}
export interface ResolutionProgress {
  sourceId: string;
  playerId: string;
  remaining: RulesEffect[];
  bindings: Record<string, number>;
  choices?: Record<string, DiscardEffect>;
}
export interface RulesState {
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
