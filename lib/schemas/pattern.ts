import { z } from "zod";
import { PRSourceSchema } from "./common.js";

// Pattern type
export const PatternTypeSchema = z.enum(["good", "bad", "error-solution"]);

export type PatternType = z.infer<typeof PatternTypeSchema>;

// Learned pattern schema
export const LearnedPatternSchema = z.object({
  id: z.string(),
  type: PatternTypeSchema,
  description: z.string(),
  errorPattern: z.string().optional(),
  solution: z.string().optional(),
  context: z.string().optional(),
  tags: z.array(z.string()).optional(),
  sourceId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
  // PR source tracking
  prSource: PRSourceSchema.optional(),
});

export type LearnedPattern = z.infer<typeof LearnedPatternSchema>;

// Patterns file schema
export const PatternsFileSchema = z.object({
  version: z.number().optional(),
  patterns: z.array(LearnedPatternSchema),
});

export type PatternsFile = z.infer<typeof PatternsFileSchema>;
