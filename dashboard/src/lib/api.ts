import type { Decision, Session, TagsFile } from "./types";

const API_BASE = "/api";

// Project Info
export interface ProjectInfo {
  name: string;
  path: string;
  repository: string | null;
}

export async function getProject(): Promise<ProjectInfo> {
  const res = await fetch(`${API_BASE}/project`);
  if (!res.ok) throw new Error("Failed to fetch project info");
  return res.json();
}

// Pagination types
export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationInfo;
}

export interface SessionsQueryParams {
  page?: number;
  limit?: number;
  tag?: string;
  type?: string;
  project?: string;
  search?: string;
  paginate?: boolean;
}

export interface DecisionsQueryParams {
  page?: number;
  limit?: number;
  tag?: string;
  search?: string;
  paginate?: boolean;
}

// Sessions
export async function getSessions(): Promise<Session[]> {
  const res = await fetch(`${API_BASE}/sessions?paginate=false`);
  if (!res.ok) throw new Error("Failed to fetch sessions");
  return res.json();
}

export async function getSessionsPaginated(
  params: SessionsQueryParams = {},
): Promise<PaginatedResponse<Session>> {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set("page", String(params.page));
  if (params.limit) searchParams.set("limit", String(params.limit));
  if (params.tag) searchParams.set("tag", params.tag);
  if (params.type) searchParams.set("type", params.type);
  if (params.project) searchParams.set("project", params.project);
  if (params.search) searchParams.set("search", params.search);
  searchParams.set("paginate", "true");

  const res = await fetch(`${API_BASE}/sessions?${searchParams}`);
  if (!res.ok) throw new Error("Failed to fetch sessions");
  return res.json();
}

export async function getSession(id: string): Promise<Session> {
  const res = await fetch(`${API_BASE}/sessions/${id}`);
  if (!res.ok) throw new Error("Failed to fetch session");
  return res.json();
}

// Delete session (owner-only)
export interface DeleteSessionResponse {
  deleted: number;
  interactionsDeleted: number;
  dryRun: boolean;
  sessionId: string;
}

export async function deleteSession(
  id: string,
  dryRun = false,
): Promise<DeleteSessionResponse> {
  const url = dryRun
    ? `${API_BASE}/sessions/${id}?dry-run=true`
    : `${API_BASE}/sessions/${id}`;
  const res = await fetch(url, { method: "DELETE" });
  if (res.status === 403) {
    throw new Error("Not authorized to delete this session");
  }
  if (!res.ok) throw new Error("Failed to delete session");
  return res.json();
}

export interface SessionMarkdown {
  exists: boolean;
  content: string | null;
}

export async function getSessionMarkdown(id: string): Promise<SessionMarkdown> {
  const res = await fetch(`${API_BASE}/sessions/${id}/markdown`);
  if (!res.ok) throw new Error("Failed to fetch session markdown");
  return res.json();
}

// Decisions
export async function getDecisions(): Promise<Decision[]> {
  const res = await fetch(`${API_BASE}/decisions?paginate=false`);
  if (!res.ok) throw new Error("Failed to fetch decisions");
  return res.json();
}

export async function getDecisionsPaginated(
  params: DecisionsQueryParams = {},
): Promise<PaginatedResponse<Decision>> {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set("page", String(params.page));
  if (params.limit) searchParams.set("limit", String(params.limit));
  if (params.tag) searchParams.set("tag", params.tag);
  if (params.search) searchParams.set("search", params.search);
  searchParams.set("paginate", "true");

  const res = await fetch(`${API_BASE}/decisions?${searchParams}`);
  if (!res.ok) throw new Error("Failed to fetch decisions");
  return res.json();
}

export async function getDecision(id: string): Promise<Decision> {
  const res = await fetch(`${API_BASE}/decisions/${id}`);
  if (!res.ok) throw new Error("Failed to fetch decision");
  return res.json();
}

// Note: createDecision, updateDecision, deleteDecision removed - dashboard is read-only
// Decisions are created via /mneme:save command

// Project info
export async function getProjectInfo(): Promise<{
  projectRoot: string;
  mnemeDir: string;
  exists: boolean;
}> {
  const res = await fetch(`${API_BASE}/info`);
  if (!res.ok) throw new Error("Failed to fetch project info");
  return res.json();
}

// Tags
export async function getTags(): Promise<TagsFile> {
  const res = await fetch(`${API_BASE}/tags`);
  if (!res.ok) throw new Error("Failed to fetch tags");
  return res.json();
}

// Current User
export async function getCurrentUser(): Promise<{ user: string }> {
  const res = await fetch(`${API_BASE}/current-user`);
  if (!res.ok) throw new Error("Failed to fetch current user");
  return res.json();
}

// Tool detail for tracking what Claude executed
export interface ToolDetail {
  name: string;
  detail: string | { type: string; prompt: string } | null;
}

// Session Interactions (from SQLite, owner-restricted)
export interface InteractionFromSQLite {
  id: string;
  timestamp: string;
  user: string;
  assistant: string;
  thinking: string | null;
  isCompactSummary: boolean;
  hasPlanMode?: boolean;
  planTools?: { name: string; count: number }[];
  toolsUsed?: string[];
  toolDetails?: ToolDetail[];
  agentId?: string | null;
  agentType?: string | null;
}

export interface SessionInteractionsResponse {
  interactions: InteractionFromSQLite[];
  count: number;
}

export async function getSessionInteractions(
  id: string,
): Promise<SessionInteractionsResponse | null> {
  const res = await fetch(`${API_BASE}/sessions/${id}/interactions`);
  if (res.status === 403) {
    // Not owner - return null to indicate no access
    return null;
  }
  if (!res.ok) throw new Error("Failed to fetch session interactions");
  return res.json();
}
