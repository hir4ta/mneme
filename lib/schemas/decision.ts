import { z } from "zod";
import { PRSourceSchema, UserSchema } from "./common.js";

// Alternative schema
export const AlternativeSchema = z.object({
  name: z.string(),
  reason: z.string(),
});

export type Alternative = z.infer<typeof AlternativeSchema>;

// Decision status
export const DecisionStatusSchema = z.enum([
  "draft",
  "active",
  "superseded",
  "deprecated",
]);

export type DecisionStatus = z.infer<typeof DecisionStatusSchema>;

// Decision context schema
export const DecisionContextSchema = z.object({
  branch: z.string().optional(),
  projectDir: z.string().optional(),
});

export type DecisionContext = z.infer<typeof DecisionContextSchema>;

// Decision schema
export const DecisionSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
  user: UserSchema,
  title: z.string(),
  decision: z.string(),
  reasoning: z.string(),
  alternatives: z.array(AlternativeSchema),
  relatedSessions: z.array(z.string()),
  tags: z.array(z.string()),
  context: DecisionContextSchema.optional(),
  source: z.enum(["auto", "manual"]).optional(),
  status: DecisionStatusSchema,
  // PR source tracking
  prSource: PRSourceSchema.optional(),
});

export type Decision = z.infer<typeof DecisionSchema>;
