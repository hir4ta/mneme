import { z } from "zod";
import { SessionContextSchema } from "./common.js";

// Proposal schema
export const ProposalSchema = z.object({
  option: z.string(),
  description: z.string(),
});

export type Proposal = z.infer<typeof ProposalSchema>;

// Action schema
export const ActionSchema = z.object({
  type: z.enum(["create", "edit", "delete"]),
  path: z.string(),
  summary: z.string(),
});

export type Action = z.infer<typeof ActionSchema>;

// Interaction schema
export const InteractionSchema = z.object({
  id: z.string(),
  topic: z.string(),
  timestamp: z.string(),
  request: z.string().optional(),
  problem: z.string().optional(),
  thinking: z.string().optional(),
  webLinks: z.array(z.string()).optional(),
  proposals: z.array(ProposalSchema).optional(),
  choice: z.string().optional(),
  reasoning: z.string().optional(),
  actions: z.array(ActionSchema).optional(),
  filesModified: z.array(z.string()).optional(),
});

export type Interaction = z.infer<typeof InteractionSchema>;

// Session type enum
export const SessionTypeSchema = z.enum([
  "decision",
  "implementation",
  "research",
  "exploration",
  "discussion",
  "debug",
  "review",
]);

export type SessionType = z.infer<typeof SessionTypeSchema>;

// Comment schema
export const CommentSchema = z.object({
  id: z.string(),
  content: z.string(),
  user: z.string(),
  createdAt: z.string(),
});

export type Comment = z.infer<typeof CommentSchema>;

// Session status enum
export const SessionStatusSchema = z.enum([
  "in_progress",
  "complete",
  "abandoned",
]);

export type SessionStatus = z.infer<typeof SessionStatusSchema>;

// Session schema
export const SessionSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  createdAt: z.string(),
  context: SessionContextSchema,
  title: z.string(),
  goal: z.string().optional(),
  tags: z.array(z.string()),
  sessionType: SessionTypeSchema.nullable().optional(),
  status: SessionStatusSchema.nullable().optional(),
  relatedSessions: z.array(z.string()).optional(),
  interactions: z.array(InteractionSchema),
  comments: z.array(CommentSchema).optional(),
});

export type Session = z.infer<typeof SessionSchema>;
