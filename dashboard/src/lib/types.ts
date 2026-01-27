// User type
export interface User {
  name: string;
  email?: string;
}

// Session context
export interface SessionContext {
  branch?: string | null;
  projectDir: string;
  user?: User;
}

// Interaction types (new schema)
export interface Proposal {
  option: string;
  description: string;
}

export interface Action {
  type: "create" | "edit" | "delete";
  path: string;
  summary: string;
}

export interface Interaction {
  id: string;
  topic: string;
  timestamp: string;
  request?: string;
  problem?: string;
  thinking?: string;
  webLinks?: string[];
  proposals?: Proposal[];
  choice?: string;
  reasoning?: string;
  actions?: Action[];
  filesModified?: string[];
}

// Session type values
export type SessionType =
  | "decision"
  | "implementation"
  | "research"
  | "exploration"
  | "discussion"
  | "debug"
  | "review";

// Session type (new interactions-based schema)
export interface Session {
  id: string;
  sessionId: string;
  createdAt: string;
  context: SessionContext;
  title: string;
  goal?: string;
  tags: string[];
  sessionType?: SessionType | null;
  relatedSessions?: string[];
  interactions: Interaction[];
}

// Tag type
export interface Tag {
  id: string;
  label: string;
  aliases: string[];
  category: string;
  color: string;
}

export interface TagsFile {
  version: number;
  tags: Tag[];
}

// Decision types
export interface Alternative {
  name: string;
  reason: string;
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
  context?: {
    branch?: string;
    projectDir?: string;
  };
  source?: "auto" | "manual";
  status: "draft" | "active" | "superseded" | "deprecated";
}
