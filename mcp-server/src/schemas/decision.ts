import { z } from "zod";
import { UserSchema } from "./session.js";

// Alternative option schema
export const AlternativeSchema = z.object({
  option: z.string(),
  rejected: z.string(),
});

export type Alternative = z.infer<typeof AlternativeSchema>;

// Decision status
export const DecisionStatusSchema = z.enum(["active", "superseded", "deprecated"]);

export type DecisionStatus = z.infer<typeof DecisionStatusSchema>;

// Decision schema
export const DecisionSchema = z.object({
  id: z.string(),
  createdAt: z.string().datetime(),
  user: UserSchema,
  title: z.string(),
  decision: z.string(),
  reasoning: z.string(),
  alternatives: z.array(AlternativeSchema),
  relatedSessions: z.array(z.string()),
  tags: z.array(z.string()),
  status: DecisionStatusSchema,
});

export type Decision = z.infer<typeof DecisionSchema>;

// Partial decision for creation
export const CreateDecisionInputSchema = DecisionSchema.omit({
  id: true,
  createdAt: true,
  status: true,
}).partial({
  alternatives: true,
  relatedSessions: true,
  tags: true,
});

export type CreateDecisionInput = z.infer<typeof CreateDecisionInputSchema>;
