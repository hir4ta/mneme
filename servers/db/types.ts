/**
 * Types, constants, and response helpers for mneme MCP Database Server
 */

const { DatabaseSync } = await import("node:sqlite");
export type DatabaseSyncType = InstanceType<typeof DatabaseSync>;
export { DatabaseSync };

export interface ProjectInfo {
  projectPath: string;
  repository: string | null;
  sessionCount: number;
  interactionCount: number;
  lastActivity: string;
}

export interface SessionInfo {
  sessionId: string;
  projectPath: string;
  repository: string | null;
  owner: string;
  messageCount: number;
  startedAt: string;
  lastMessageAt: string;
}

export interface Interaction {
  id: number;
  sessionId: string;
  claudeSessionId: string | null;
  projectPath: string;
  owner: string;
  role: string;
  content: string;
  thinking: string | null;
  toolCalls: string | null;
  timestamp: string;
}

export interface Stats {
  totalProjects: number;
  totalSessions: number;
  totalInteractions: number;
  totalThinkingBlocks: number;
  projectStats: Array<{
    projectPath: string;
    repository: string | null;
    sessions: number;
    interactions: number;
  }>;
  recentActivity: Array<{
    date: string;
    sessions: number;
    interactions: number;
  }>;
}

export interface RuleDoc {
  items?: Array<Record<string, unknown>>;
  rules?: Array<Record<string, unknown>>;
}

export interface BenchmarkQuery {
  query: string;
  expectedTerms: string[];
}

export interface ParsedInteraction {
  id: string;
  timestamp: string;
  user: string;
  thinking: string;
  assistant: string;
  isCompactSummary: boolean;
}

export interface ParsedTranscript {
  interactions: ParsedInteraction[];
  toolUsage: Array<{ name: string; count: number }>;
  files: Array<{ path: string; action: string }>;
  metrics: {
    userMessages: number;
    assistantResponses: number;
    thinkingBlocks: number;
  };
  totalLines: number;
}

export const LIST_LIMIT_MIN = 1;
export const LIST_LIMIT_MAX = 200;
export const INTERACTION_OFFSET_MIN = 0;
export const QUERY_MAX_LENGTH = 500;
export const SEARCH_EVAL_DEFAULT_LIMIT = 5;

export function ok(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

export function fail(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true as const,
  };
}
