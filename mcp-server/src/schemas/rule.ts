import { z } from "zod";

// Rule item schema
export const RuleItemSchema = z.object({
  category: z.string(),
  rule: z.string(),
  example: z.string(),
  addedBy: z.string(),
});

export type RuleItem = z.infer<typeof RuleItemSchema>;

// Rules schema
export const RulesSchema = z.object({
  id: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  rules: z.array(RuleItemSchema),
});

export type Rules = z.infer<typeof RulesSchema>;

// Input for adding a rule
export const AddRuleInputSchema = RuleItemSchema;

export type AddRuleInput = z.infer<typeof AddRuleInputSchema>;
