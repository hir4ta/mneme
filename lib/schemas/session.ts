import { z } from "zod";
import { SessionContextSchema } from "./common.js";

// Proposal schema (legacy, kept for backwards compatibility)
export const ProposalSchema = z.object({
  option: z.string(),
  description: z.string(),
});

export type Proposal = z.infer<typeof ProposalSchema>;

// Action schema (legacy, kept for backwards compatibility)
export const ActionSchema = z.object({
  type: z.enum(["create", "edit", "delete"]),
  path: z.string(),
  summary: z.string(),
});

export type Action = z.infer<typeof ActionSchema>;

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

// Interaction schema (new format: auto-saved from transcript)
export const InteractionSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  user: z.string(), // User message
  thinking: z.string().optional(), // Claude thinking
  assistant: z.string().optional(), // Claude response
  isCompactSummary: z.boolean().optional(), // True if this is an auto-compact summary
});

export type Interaction = z.infer<typeof InteractionSchema>;

// File change schema
export const FileChangeSchema = z.object({
  path: z.string(),
  action: z.enum(["create", "edit", "delete", "rename"]),
});

export type FileChange = z.infer<typeof FileChangeSchema>;

// Tool usage schema
export const ToolUsageSchema = z.object({
  name: z.string(),
  count: z.number(),
});

export type ToolUsage = z.infer<typeof ToolUsageSchema>;

// Metrics schema
export const MetricsSchema = z.object({
  userMessages: z.number().optional(),
  assistantResponses: z.number().optional(),
  thinkingBlocks: z.number().optional(),
  toolUsage: z.array(ToolUsageSchema).optional(),
});

export type Metrics = z.infer<typeof MetricsSchema>;

// PreCompact backup schema
export const PreCompactBackupSchema = z.object({
  timestamp: z.string(),
  interactions: z.array(InteractionSchema),
});

export type PreCompactBackup = z.infer<typeof PreCompactBackupSchema>;

// Structured data schemas (for /mneme:save)
// These were previously in YAML files, now integrated into Session JSON

export const SessionSummarySchema = z.object({
  title: z.string(),
  goal: z.string().optional(),
  outcome: z.enum(["success", "partial", "blocked", "abandoned"]).optional(),
  description: z.string().optional(),
  sessionType: SessionTypeSchema.optional(),
});

export type SessionSummary = z.infer<typeof SessionSummarySchema>;

// Backwards compatibility aliases
export const SessionYamlSummarySchema = SessionSummarySchema;
export type SessionYamlSummary = SessionSummary;

export const SessionPlanSchema = z.object({
  goals: z.array(z.string()).optional(),
  tasks: z.array(z.string()).optional(),
  remaining: z.array(z.string()).optional(),
});

export type SessionPlan = z.infer<typeof SessionPlanSchema>;

// Backwards compatibility aliases
export const SessionYamlPlanSchema = SessionPlanSchema;
export type SessionYamlPlan = SessionPlan;

export const SessionDiscussionSchema = z.object({
  topic: z.string(),
  timestamp: z.string().optional(),
  options: z.array(z.string()).optional(),
  decision: z.string(),
  reasoning: z.string().optional(),
  alternatives: z.array(z.string()).optional(),
});

export type SessionDiscussion = z.infer<typeof SessionDiscussionSchema>;

// Backwards compatibility aliases
export const SessionYamlDiscussionSchema = SessionDiscussionSchema;
export type SessionYamlDiscussion = SessionDiscussion;

export const SessionCodeExampleSchema = z.object({
  file: z.string(),
  description: z.string().optional(),
  before: z.string().optional(),
  after: z.string().optional(),
});

export type SessionCodeExample = z.infer<typeof SessionCodeExampleSchema>;

// Backwards compatibility aliases
export const SessionYamlCodeExampleSchema = SessionCodeExampleSchema;
export type SessionYamlCodeExample = SessionCodeExample;

export const SessionErrorSchema = z.object({
  error: z.string(),
  context: z.string().optional(),
  cause: z.string().optional(),
  solution: z.string().optional(),
  files: z.array(z.string()).optional(),
});

export type SessionError = z.infer<typeof SessionErrorSchema>;

// Backwards compatibility aliases
export const SessionYamlErrorSchema = SessionErrorSchema;
export type SessionYamlError = SessionError;

export const SessionHandoffSchema = z.object({
  stoppedReason: z.string().optional(),
  notes: z.array(z.string()).optional(),
  nextSteps: z.array(z.string()).optional(),
});

export type SessionHandoff = z.infer<typeof SessionHandoffSchema>;

// Backwards compatibility aliases
export const SessionYamlHandoffSchema = SessionHandoffSchema;
export type SessionYamlHandoff = SessionHandoff;

export const SessionReferenceSchema = z.object({
  type: z.string().optional(),
  url: z.string().optional(),
  path: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
});

export type SessionReference = z.infer<typeof SessionReferenceSchema>;

// Backwards compatibility aliases
export const SessionYamlReferenceSchema = SessionReferenceSchema;
export type SessionYamlReference = SessionReference;

// Legacy: SessionYaml type (deprecated, use Session with structured fields instead)
export const SessionYamlSchema = z.object({
  version: z.number(),
  session_id: z.string(),
  summary: SessionSummarySchema.optional(),
  plan: SessionPlanSchema.optional(),
  discussions: z.array(SessionDiscussionSchema).optional(),
  code_examples: z.array(SessionCodeExampleSchema).optional(),
  errors: z.array(SessionErrorSchema).optional(),
  handoff: SessionHandoffSchema.optional(),
  references: z.array(SessionReferenceSchema).optional(),
});

export type SessionYaml = z.infer<typeof SessionYamlSchema>;

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
  "merged", // Session merged into master session
]);

export type SessionStatus = z.infer<typeof SessionStatusSchema>;

// Work period schema (for master session tracking)
export const WorkPeriodSchema = z.object({
  claudeSessionId: z.string(), // Full Claude Code session UUID
  startedAt: z.string(), // ISO8601 timestamp
  endedAt: z.string().nullable().optional(), // null if session is in progress
});

export type WorkPeriod = z.infer<typeof WorkPeriodSchema>;

// Session schema (JSON file structure)
export const SessionSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  createdAt: z.string(),
  endedAt: z.string().optional(),
  updatedAt: z.string().optional(),
  context: SessionContextSchema,
  // Search index fields (set by /mneme:save)
  title: z.string(),
  tags: z.array(z.string()),
  // Auto-saved data (SessionEnd hook)
  interactions: z.array(InteractionSchema),
  files: z.array(FileChangeSchema).optional(),
  metrics: MetricsSchema.optional(),
  // Session chain tracking (legacy, read-only for backwards compatibility)
  resumedFrom: z.string().optional(),
  // Master session tracking (new)
  masterSessionId: z.string().optional(), // ID of master session (if this is a child)
  mergedAt: z.string().optional(), // Timestamp when merged into master
  workPeriods: z.array(WorkPeriodSchema).optional(), // Work periods (master sessions only)
  // PreCompact backups
  preCompactBackups: z.array(PreCompactBackupSchema).optional(),
  // Status
  status: SessionStatusSchema.nullable().optional(),
  // Structured data (set by /mneme:save, previously in YAML file)
  summary: SessionSummarySchema.optional(),
  plan: SessionPlanSchema.optional(),
  discussions: z.array(SessionDiscussionSchema).optional(),
  codeExamples: z.array(SessionCodeExampleSchema).optional(),
  errors: z.array(SessionErrorSchema).optional(),
  handoff: SessionHandoffSchema.optional(),
  references: z.array(SessionReferenceSchema).optional(),
  // Legacy fields (kept for backwards compatibility)
  goal: z.string().optional(),
  sessionType: SessionTypeSchema.nullable().optional(),
  relatedSessions: z.array(z.string()).optional(),
  comments: z.array(CommentSchema).optional(),
});

export type Session = z.infer<typeof SessionSchema>;
