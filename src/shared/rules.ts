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
export const rulesEffectSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("draw"),
      count: z.number().int().min(1).max(1000),
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
export const rulesAbilitySchema = z
  .object({
    costs: z.array(rulesCostSchema).max(100).default([]),
    effects: z.array(rulesEffectSchema).max(100).default([]),
    target: objectFilterSchema.optional(),
    manaAbility: z.boolean().optional(),
  })
  .strict()
  .superRefine((ability, ctx) => {
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
  kind: "cast" | "activate" | "cleanup";
  stage: "targets" | "payment" | "selection";
  sourceId?: string;
  ability?: RulesAbility;
  abilityId?: string;
  targetIds: string[];
  selections: Record<string, string[]>;
  color?: ManaType;
  totalCost: ManaPool & { generic: number };
}
export interface RulesState {
  format: "commander";
  setup: { keptPlayerIds: string[]; startingPlayerId: string };
  pending?: PendingProcedure;
  mana: Record<string, ManaPool>;
  restrictedMana?: Record<string, RestrictedMana[]>;
  failedDrawPlayerIds?: string[];
  landsPlayed: Record<string, number>;
  controlledSinceTurn: Record<string, number>;
  turnStarted: Record<string, number>;
  commanders: Record<string, { instanceId: string; colorIdentity: string[] }>;
}
