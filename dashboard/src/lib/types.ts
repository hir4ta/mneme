// Session types
export interface User {
  name: string;
  email?: string;
}

export interface SessionContext {
  branch: string | null;
  projectDir: string;
}

export interface ToolUse {
  tool: string;
  input: unknown;
  output?: string;
}

export interface Message {
  type: "user" | "assistant";
  timestamp: string;
  content: string;
  thinking?: string;
  toolUses?: ToolUse[];
}

export interface FileModified {
  path: string;
  action: "created" | "modified" | "deleted";
  summary?: string;
}

export interface Session {
  id: string;
  sessionId: string;
  createdAt: string;
  endedAt?: string;
  user: User;
  context: SessionContext;
  tags: string[];
  status: "completed" | "in_progress";
  summary: string;
  messages: Message[];
  filesModified: FileModified[];
  keyDecisions?: string[];
}

// Decision types
export interface Alternative {
  option: string;
  rejected: string;
}

export interface Decision {
  id: string;
  createdAt: string;
  updatedAt?: string;
  user: User;
  title: string;
  decision: string;
  reasoning: string;
  alternatives: Alternative[];
  relatedSessions: string[];
  tags: string[];
  source?: "auto" | "manual";
  status: "draft" | "active" | "superseded" | "deprecated";
}

