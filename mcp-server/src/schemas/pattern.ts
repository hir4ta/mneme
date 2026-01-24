import { z } from "zod";
import { UserSchema } from "./session.js";

// Pattern type
export const PatternTypeSchema = z.enum(["good", "bad"]);

export type PatternType = z.infer<typeof PatternTypeSchema>;

// Pattern source
export const PatternSourceSchema = z.enum(["session", "review", "manual"]);

export type PatternSource = z.infer<typeof PatternSourceSchema>;

// Pattern item schema
export const PatternItemSchema = z.object({
  id: z.string().optional(),
  type: PatternTypeSchema,
  description: z.string(),
  example: z.string().optional(),
  suggestion: z.string().optional(),
  detectedAt: z.string().datetime(),
  source: PatternSourceSchema,
  sourceId: z.string(),
});

export type PatternItem = z.infer<typeof PatternItemSchema>;

// Pattern schema (per user)
export const PatternSchema = z.object({
  id: z.string(),
  user: UserSchema,
  patterns: z.array(PatternItemSchema),
  updatedAt: z.string().datetime(),
});

export type Pattern = z.infer<typeof PatternSchema>;

// Input for adding a pattern
export const AddPatternInputSchema = PatternItemSchema.omit({
  id: true,
  detectedAt: true,
});

export type AddPatternInput = z.infer<typeof AddPatternInputSchema>;
