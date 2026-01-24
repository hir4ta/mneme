import { z } from "zod";

// Session Start Hook Input
export const SessionStartInputSchema = z.object({
  session_id: z.string(),
  transcript_path: z.string(),
  cwd: z.string(),
  permission_mode: z.string(),
  hook_event_name: z.literal("SessionStart"),
  source: z.enum(["startup", "resume", "clear", "compact"]),
  model: z.string(),
  agent_type: z.string().optional(),
});

export type SessionStartInput = z.infer<typeof SessionStartInputSchema>;

// Pre-Compact Hook Input
export const PreCompactInputSchema = z.object({
  session_id: z.string(),
  transcript_path: z.string(),
  cwd: z.string().optional(), // May not be provided in all cases
  permission_mode: z.string(),
  hook_event_name: z.literal("PreCompact"),
  trigger: z.enum(["manual", "auto"]),
  custom_instructions: z.string().optional(),
});

export type PreCompactInput = z.infer<typeof PreCompactInputSchema>;

// Session End Hook Input
export const SessionEndInputSchema = z.object({
  session_id: z.string(),
  transcript_path: z.string(),
  cwd: z.string(),
  permission_mode: z.string(),
  hook_event_name: z.literal("SessionEnd"),
  reason: z.enum(["clear", "logout", "prompt_input_exit", "other"]),
});

export type SessionEndInput = z.infer<typeof SessionEndInputSchema>;

// Hook Output
export interface HookOutput {
  continue?: boolean;
  stopReason?: string;
  suppressOutput?: boolean;
  systemMessage?: string;
  hookSpecificOutput?: {
    hookEventName: string;
    additionalContext?: string;
  };
}

// Transcript message types
export interface TranscriptMessage {
  type: string;
  message?: {
    role?: string;
    content?: string | Array<{ type: string; text?: string }>;
  };
  timestamp?: string;
}
