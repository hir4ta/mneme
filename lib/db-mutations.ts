import "./suppress-sqlite-warning.js";

const { DatabaseSync } = await import("node:sqlite");
type DatabaseSyncType = InstanceType<typeof DatabaseSync>;

import type { Interaction, PreCompactBackup } from "./db.js";

export function insertInteractions(
  db: DatabaseSyncType,
  interactions: Interaction[],
): void {
  const insert = db.prepare(`
    INSERT INTO interactions (session_id, project_path, repository, repository_url, repository_root, owner, role, content, thinking, tool_calls, timestamp, is_compact_summary)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.exec("BEGIN TRANSACTION");
  try {
    for (const item of interactions) {
      insert.run(
        item.session_id,
        item.project_path,
        item.repository || null,
        item.repository_url || null,
        item.repository_root || null,
        item.owner,
        item.role,
        item.content,
        item.thinking || null,
        item.tool_calls || null,
        item.timestamp,
        item.is_compact_summary || 0,
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function insertPreCompactBackup(
  db: DatabaseSyncType,
  backup: PreCompactBackup,
): void {
  const stmt = db.prepare(`
    INSERT INTO pre_compact_backups (session_id, project_path, owner, interactions)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(
    backup.session_id,
    backup.project_path,
    backup.owner,
    backup.interactions,
  );
}

export function deleteInteractions(
  db: DatabaseSyncType,
  sessionId: string,
): void {
  const stmt = db.prepare("DELETE FROM interactions WHERE session_id = ?");
  stmt.run(sessionId);
}

export function deleteBackups(db: DatabaseSyncType, sessionId: string): void {
  const stmt = db.prepare(
    "DELETE FROM pre_compact_backups WHERE session_id = ?",
  );
  stmt.run(sessionId);
}

export function deleteInteractionsByProject(
  db: DatabaseSyncType,
  projectPath: string,
): number {
  const stmt = db.prepare("DELETE FROM interactions WHERE project_path = ?");
  const result = stmt.run(projectPath);
  return Number(result.changes);
}

export function deleteInteractionsBefore(
  db: DatabaseSyncType,
  beforeDate: string,
): number {
  const stmt = db.prepare("DELETE FROM interactions WHERE timestamp < ?");
  const result = stmt.run(beforeDate);
  return Number(result.changes);
}

export function deleteBackupsByProject(
  db: DatabaseSyncType,
  projectPath: string,
): number {
  const stmt = db.prepare(
    "DELETE FROM pre_compact_backups WHERE project_path = ?",
  );
  const result = stmt.run(projectPath);
  return Number(result.changes);
}
