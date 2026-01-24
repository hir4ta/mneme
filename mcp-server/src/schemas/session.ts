import { z } from "zod";

// User schema (shared)
export const UserSchema = z.object({
  name: z.string(),
  email: z.string().email(),
});

export type User = z.infer<typeof UserSchema>;

// Context schema
export const ContextSchema = z.object({
  branch: z.string(),
  projectDir: z.string(),
});

export type Context = z.infer<typeof ContextSchema>;

// Tool use schema
export const ToolUseSchema = z.object({
  tool: z.string(),
  input: z.record(z.unknown()),
  output: z.string(),
});

export type ToolUse = z.infer<typeof ToolUseSchema>;

// Message schemas
export const UserMessageSchema = z.object({
  type: z.literal("user"),
  timestamp: z.string().datetime(),
  content: z.string(),
});

export const AssistantMessageSchema = z.object({
  type: z.literal("assistant"),
  timestamp: z.string().datetime(),
  thinking: z.string().optional(),
  content: z.string(),
  toolUses: z.array(ToolUseSchema).optional(),
});

export const MessageSchema = z.discriminatedUnion("type", [
  UserMessageSchema,
  AssistantMessageSchema,
]);

export type Message = z.infer<typeof MessageSchema>;

// File modified schema
export const FileModifiedSchema = z.object({
  path: z.string(),
  action: z.enum(["created", "modified", "deleted"]),
  summary: z.string(),
});

export type FileModified = z.infer<typeof FileModifiedSchema>;

// Session status
export const SessionStatusSchema = z.enum(["completed", "in_progress"]);

export type SessionStatus = z.infer<typeof SessionStatusSchema>;

// Session schema
export const SessionSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  createdAt: z.string().datetime(),
  endedAt: z.string().datetime().optional(),
  user: UserSchema,
  context: ContextSchema,
  tags: z.array(z.string()),
  status: SessionStatusSchema,
  summary: z.string(),
  messages: z.array(MessageSchema),
  filesModified: z.array(FileModifiedSchema),
  keyDecisions: z.array(z.string()),
});

export type Session = z.infer<typeof SessionSchema>;

// Partial session for creation (without auto-generated fields)
export const CreateSessionInputSchema = SessionSchema.omit({
  id: true,
  createdAt: true,
}).partial({
  endedAt: true,
  keyDecisions: true,
});

export type CreateSessionInput = z.infer<typeof CreateSessionInputSchema>;
