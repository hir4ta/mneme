import type { Decision, Session } from "./types";

const API_BASE = "/api";

// Sessions
export async function getSessions(): Promise<Session[]> {
  const res = await fetch(`${API_BASE}/sessions`);
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

// Decisions
export async function getDecisions(): Promise<Decision[]> {
  const res = await fetch(`${API_BASE}/decisions`);
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
