import { readFile, readdir, writeFile, unlink, mkdir } from "node:fs/promises";
import path from "node:path";
import { getSessionsDir, getSafeFilePath } from "./paths";
import type { Session } from "./types";

export async function getSessions(): Promise<Session[]> {
  const sessionsDir = getSessionsDir();

  try {
    const files = await readdir(sessionsDir);
    const jsonFiles = files.filter((f) => f.endsWith(".json"));

    const sessions: Session[] = [];

    for (const file of jsonFiles) {
      try {
        const filePath = path.join(sessionsDir, file);
        const content = await readFile(filePath, "utf-8");
        const session = JSON.parse(content) as Session;
        sessions.push(session);
      } catch {
        // Skip invalid files
      }
    }

    // Sort by endedAt or createdAt (most recent first)
    sessions.sort((a, b) => {
      const aDate = a.endedAt || a.createdAt;
      const bDate = b.endedAt || b.createdAt;
      return bDate.localeCompare(aDate);
    });

    return sessions;
  } catch {
    return [];
  }
}

export async function getSession(id: string): Promise<Session | null> {
  // Validate ID to prevent path traversal
  const filePath = getSafeFilePath(getSessionsDir(), id, ".json");
  if (!filePath) {
    return null;
  }

  try {
    const content = await readFile(filePath, "utf-8");
    return JSON.parse(content) as Session;
  } catch {
    return null;
  }
}

export async function updateSession(
  id: string,
  data: Partial<Session>
): Promise<Session | null> {
  // Validate ID to prevent path traversal
  const filePath = getSafeFilePath(getSessionsDir(), id, ".json");
  if (!filePath) {
    return null;
  }

  const existing = await getSession(id);
  if (!existing) return null;

  const updated = { ...existing, ...data };
  await writeFile(filePath, JSON.stringify(updated, null, 2));
  return updated;
}

export async function deleteSession(id: string): Promise<boolean> {
  // Validate ID to prevent path traversal
  const filePath = getSafeFilePath(getSessionsDir(), id, ".json");
  if (!filePath) {
    return false;
  }

  try {
    await unlink(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function ensureSessionsDir(): Promise<void> {
  await mkdir(getSessionsDir(), { recursive: true });
}
