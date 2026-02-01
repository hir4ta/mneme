import { z } from "zod";
import { SessionTypeSchema } from "./session.js";

// Session index item schema
export const SessionIndexItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  goal: z.string().optional(),
  createdAt: z.string(),
  tags: z.array(z.string()),
  sessionType: SessionTypeSchema.nullable().optional(),
  branch: z.string().nullable().optional(),
  user: z.string().optional(),
  interactionCount: z.number(),
  filePath: z.string(),
  hasSummary: z.boolean().optional(), // true if session has been saved with /mneme:save
});

export type SessionIndexItem = z.infer<typeof SessionIndexItemSchema>;

// Session index file schema
export const SessionIndexSchema = z.object({
  version: z.number(),
  updatedAt: z.string(),
  items: z.array(SessionIndexItemSchema),
});

export type SessionIndex = z.infer<typeof SessionIndexSchema>;

// Decision index item schema
export const DecisionIndexItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
  tags: z.array(z.string()),
  status: z.enum(["draft", "active", "superseded", "deprecated"]),
  user: z.string().optional(),
  filePath: z.string(),
});

export type DecisionIndexItem = z.infer<typeof DecisionIndexItemSchema>;

// Decision index file schema
export const DecisionIndexSchema = z.object({
  version: z.number(),
  updatedAt: z.string(),
  items: z.array(DecisionIndexItemSchema),
});

export type DecisionIndex = z.infer<typeof DecisionIndexSchema>;
