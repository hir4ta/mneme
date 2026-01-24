import { getSessionsDir, getSessionPath } from "./paths.js";
import { readJson, writeJson, deleteJson, listJsonFiles } from "./json-file.js";
import { generateSessionId } from "./id.js";
import {
  SessionSchema,
  CreateSessionInputSchema,
  type Session,
  type CreateSessionInput,
} from "../schemas/index.js";

export async function createSession(
  data: CreateSessionInput
): Promise<Session> {
  const validated = CreateSessionInputSchema.parse(data);

  const id = generateSessionId();
  const now = new Date().toISOString();

  const session: Session = {
    ...validated,
    id,
    createdAt: now,
    keyDecisions: validated.keyDecisions ?? [],
  };

  // Validate full session
  SessionSchema.parse(session);

  await writeJson(getSessionPath(id), session);
  return session;
}

export async function getSession(id: string): Promise<Session | null> {
  const data = await readJson<Session>(getSessionPath(id));
  if (!data) return null;

  return SessionSchema.parse(data);
}

export async function updateSession(
  id: string,
  data: Partial<Session>
): Promise<Session | null> {
  const existing = await getSession(id);
  if (!existing) return null;

  const updated: Session = {
    ...existing,
    ...data,
    id: existing.id, // Prevent ID change
    createdAt: existing.createdAt, // Prevent createdAt change
  };

  SessionSchema.parse(updated);
  await writeJson(getSessionPath(id), updated);
  return updated;
}

export async function deleteSession(id: string): Promise<void> {
  await deleteJson(getSessionPath(id));
}

export interface ListSessionsOptions {
  limit?: number;
  branch?: string;
  status?: "completed" | "in_progress";
  user?: string;
}

export async function listSessions(
  options: ListSessionsOptions = {}
): Promise<Session[]> {
  const files = await listJsonFiles(getSessionsDir());
  const sessions: Session[] = [];

  for (const file of files) {
    const data = await readJson<Session>(file);
    if (!data) continue;

    try {
      const session = SessionSchema.parse(data);

      // Apply filters
      if (options.branch && session.context.branch !== options.branch) {
        continue;
      }
      if (options.status && session.status !== options.status) {
        continue;
      }
      if (options.user && session.user.name !== options.user) {
        continue;
      }

      sessions.push(session);
    } catch {
      // Skip invalid sessions
      console.error(`Skipping invalid session file: ${file}`);
    }
  }

  // Sort by createdAt descending (newest first)
  sessions.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  // Apply limit
  if (options.limit && options.limit > 0) {
    return sessions.slice(0, options.limit);
  }

  return sessions;
}

export interface SearchResult {
  session: Session;
  score: number;
  matches: string[];
}

export async function searchSessions(query: string): Promise<SearchResult[]> {
  const sessions = await listSessions();
  const results: SearchResult[] = [];
  const queryLower = query.toLowerCase();

  for (const session of sessions) {
    let score = 0;
    const matches: string[] = [];

    // Check summary
    if (session.summary.toLowerCase().includes(queryLower)) {
      score += 3;
      matches.push("summary");
    }

    // Check tags
    for (const tag of session.tags) {
      if (tag.toLowerCase().includes(queryLower)) {
        score += 2;
        matches.push(`tag:${tag}`);
      }
    }

    // Check messages content
    for (const message of session.messages) {
      if (message.content.toLowerCase().includes(queryLower)) {
        score += 1;
        if (!matches.includes("messages")) {
          matches.push("messages");
        }
      }
    }

    if (score > 0) {
      results.push({ session, score, matches });
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  return results;
}
