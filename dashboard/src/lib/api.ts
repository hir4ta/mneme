import type { Decision, Session, TagsFile } from "./types";

const API_BASE = "/api";

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

export async function updateSession(
  id: string,
  data: Partial<Session>,
): Promise<Session> {
  const res = await fetch(`${API_BASE}/sessions/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update session");
  return res.json();
}

export async function deleteSession(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/sessions/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete session");
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

export async function createDecision(
  data: Omit<Decision, "id" | "createdAt">,
): Promise<Decision> {
  const res = await fetch(`${API_BASE}/decisions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create decision");
  return res.json();
}

export async function updateDecision(
  id: string,
  data: Partial<Decision>,
): Promise<Decision> {
  const res = await fetch(`${API_BASE}/decisions/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update decision");
  return res.json();
}

export async function deleteDecision(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/decisions/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete decision");
}

// Project info
export async function getProjectInfo(): Promise<{
  projectRoot: string;
  memoriaDir: string;
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
