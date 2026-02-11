import "./suppress-sqlite-warning.js";

const { DatabaseSync } = await import("node:sqlite");
type DatabaseSyncType = InstanceType<typeof DatabaseSync>;

import type { Interaction, PreCompactBackup } from "./db.js";

export function getInteractions(
  db: DatabaseSyncType,
  sessionId: string,
): Interaction[] {
  const stmt = db.prepare(`
    SELECT * FROM interactions
    WHERE session_id = ?
    ORDER BY timestamp ASC
  `);
  return stmt.all(sessionId) as unknown as Interaction[];
}

export function getInteractionsByOwner(
  db: DatabaseSyncType,
  sessionId: string,
  owner: string,
): Interaction[] {
  const stmt = db.prepare(`
    SELECT * FROM interactions
    WHERE session_id = ? AND owner = ?
    ORDER BY timestamp ASC
  `);
  return stmt.all(sessionId, owner) as unknown as Interaction[];
}

export function getInteractionsBySessionIds(
  db: DatabaseSyncType,
  sessionIds: string[],
): Interaction[] {
  if (sessionIds.length === 0) return [];
  const placeholders = sessionIds.map(() => "?").join(", ");
  const stmt = db.prepare(`
    SELECT * FROM interactions
    WHERE session_id IN (${placeholders})
    ORDER BY timestamp ASC, id ASC
  `);
  return stmt.all(...sessionIds) as unknown as Interaction[];
}

export function getInteractionsByClaudeSessionIds(
  db: DatabaseSyncType,
  claudeSessionIds: string[],
): Interaction[] {
  if (claudeSessionIds.length === 0) return [];
  const placeholders = claudeSessionIds.map(() => "?").join(", ");
  const stmt = db.prepare(`
    SELECT * FROM interactions
    WHERE claude_session_id IN (${placeholders})
    ORDER BY timestamp ASC, id ASC
  `);
  return stmt.all(...claudeSessionIds) as unknown as Interaction[];
}

export function getInteractionsBySessionIdsAndOwner(
  db: DatabaseSyncType,
  sessionIds: string[],
  owner: string,
): Interaction[] {
  if (sessionIds.length === 0) return [];
  const placeholders = sessionIds.map(() => "?").join(", ");
  const stmt = db.prepare(`
    SELECT * FROM interactions
    WHERE session_id IN (${placeholders}) AND owner = ?
    ORDER BY timestamp ASC, id ASC
  `);
  return stmt.all(...sessionIds, owner) as unknown as Interaction[];
}

export function hasInteractionsForSessionIds(
  db: DatabaseSyncType,
  sessionIds: string[],
  owner: string,
): boolean {
  if (sessionIds.length === 0) return false;
  const placeholders = sessionIds.map(() => "?").join(", ");
  const stmt = db.prepare(`
    SELECT COUNT(*) as count FROM interactions
    WHERE session_id IN (${placeholders}) AND owner = ?
  `);
  const result = stmt.get(...sessionIds, owner) as { count: number };
  return result.count > 0;
}

export function hasInteractions(
  db: DatabaseSyncType,
  sessionId: string,
  owner: string,
): boolean {
  const stmt = db.prepare(`
    SELECT COUNT(*) as count FROM interactions
    WHERE session_id = ? AND owner = ?
  `);
  const result = stmt.get(sessionId, owner) as { count: number };
  return result.count > 0;
}

export function searchInteractions(
  db: DatabaseSyncType,
  query: string,
  limit = 10,
): Array<{ session_id: string; content: string; thinking: string | null }> {
  const stmt = db.prepare(`
    SELECT i.session_id, i.content, i.thinking
    FROM interactions_fts fts
    JOIN interactions i ON fts.rowid = i.id
    WHERE interactions_fts MATCH ?
    LIMIT ?
  `);
  return stmt.all(query, limit) as Array<{
    session_id: string;
    content: string;
    thinking: string | null;
  }>;
}

export function getDbStats(db: DatabaseSyncType): {
  interactions: number;
  backups: number;
} {
  const interactionsCount = db
    .prepare("SELECT COUNT(*) as count FROM interactions")
    .get() as { count: number };
  const backupsCount = db
    .prepare("SELECT COUNT(*) as count FROM pre_compact_backups")
    .get() as { count: number };
  return {
    interactions: interactionsCount.count,
    backups: backupsCount.count,
  };
}

export function getInteractionsByProject(
  db: DatabaseSyncType,
  projectPath: string,
): Interaction[] {
  const stmt = db.prepare(`
    SELECT * FROM interactions
    WHERE project_path = ?
    ORDER BY timestamp ASC
  `);
  return stmt.all(projectPath) as unknown as Interaction[];
}

export function getInteractionsByRepository(
  db: DatabaseSyncType,
  repository: string,
): Interaction[] {
  const stmt = db.prepare(`
    SELECT * FROM interactions
    WHERE repository = ?
    ORDER BY timestamp ASC
  `);
  return stmt.all(repository) as unknown as Interaction[];
}

export function getUniqueProjects(db: DatabaseSyncType): string[] {
  const stmt = db.prepare(`
    SELECT DISTINCT project_path FROM interactions
    ORDER BY project_path
  `);
  const rows = stmt.all() as Array<{ project_path: string }>;
  return rows.map((r) => r.project_path);
}

export function getUniqueRepositories(db: DatabaseSyncType): string[] {
  const stmt = db.prepare(`
    SELECT DISTINCT repository FROM interactions
    WHERE repository IS NOT NULL
    ORDER BY repository
  `);
  const rows = stmt.all() as Array<{ repository: string }>;
  return rows.map((r) => r.repository);
}

export function getLatestBackup(
  db: DatabaseSyncType,
  sessionId: string,
): PreCompactBackup | null {
  const stmt = db.prepare(`
    SELECT * FROM pre_compact_backups
    WHERE session_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `);
  return (stmt.get(sessionId) as unknown as PreCompactBackup) || null;
}

export function getAllBackups(
  db: DatabaseSyncType,
  sessionId: string,
): PreCompactBackup[] {
  const stmt = db.prepare(`
    SELECT * FROM pre_compact_backups
    WHERE session_id = ?
    ORDER BY created_at ASC
  `);
  return stmt.all(sessionId) as unknown as PreCompactBackup[];
}

export function countInteractions(
  db: DatabaseSyncType,
  filter: {
    sessionId?: string;
    projectPath?: string;
    repository?: string;
    before?: string;
  },
): number {
  const conditions: string[] = [];
  const params: string[] = [];

  if (filter.sessionId) {
    conditions.push("session_id = ?");
    params.push(filter.sessionId);
  }
  if (filter.projectPath) {
    conditions.push("project_path = ?");
    params.push(filter.projectPath);
  }
  if (filter.repository) {
    conditions.push("repository = ?");
    params.push(filter.repository);
  }
  if (filter.before) {
    conditions.push("timestamp < ?");
    params.push(filter.before);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const stmt = db.prepare(
    `SELECT COUNT(*) as count FROM interactions ${whereClause}`,
  );
  const result = stmt.get(...params) as { count: number };
  return result.count;
}
