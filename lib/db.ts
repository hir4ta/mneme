/**
 * memoria SQLite Database Utilities
 *
 * Local-only database for private interactions and backups.
 * This file provides CRUD operations for interactions and pre_compact_backups.
 *
 * Uses Node.js built-in sqlite module (node:sqlite) for platform independence.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Suppress Node.js SQLite experimental warning
const originalEmit = process.emit;
// @ts-expect-error - process.emit override for warning suppression
process.emit = function (name, data, ...args) {
  if (
    name === "warning" &&
    typeof data === "object" &&
    data?.name === "ExperimentalWarning" &&
    data?.message?.includes("SQLite")
  ) {
    return false;
  }
  return originalEmit.call(process, name, data, ...args);
};

// Import after warning suppression is set up
const { DatabaseSync } = await import("node:sqlite");

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface Interaction {
  id?: number;
  session_id: string;
  owner: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string | null;
  tool_calls?: string | null;
  timestamp: string;
  is_compact_summary?: number;
  created_at?: string;
}

export interface PreCompactBackup {
  id?: number;
  session_id: string;
  owner: string;
  interactions: string; // JSON string
  created_at?: string;
}

/**
 * Get current user from git config or whoami
 */
export function getCurrentUser(): string {
  try {
    return execSync("git config user.name", { encoding: "utf-8" }).trim();
  } catch {
    try {
      return execSync("whoami", { encoding: "utf-8" }).trim();
    } catch {
      return "unknown";
    }
  }
}

/**
 * Get database path for a memoria directory
 */
export function getDbPath(memoriaDir: string): string {
  return join(memoriaDir, "local.db");
}

/**
 * Initialize database with schema
 */
export function initDatabase(memoriaDir: string): DatabaseSync {
  const dbPath = getDbPath(memoriaDir);
  const db = new DatabaseSync(dbPath);

  // Enable WAL mode for better concurrent access
  db.exec("PRAGMA journal_mode = WAL");

  // Read and execute schema
  const schemaPath = join(__dirname, "schema.sql");
  if (existsSync(schemaPath)) {
    const schema = readFileSync(schemaPath, "utf-8");
    db.exec(schema);
  }

  return db;
}

/**
 * Open existing database
 */
export function openDatabase(memoriaDir: string): DatabaseSync | null {
  const dbPath = getDbPath(memoriaDir);
  if (!existsSync(dbPath)) {
    return null;
  }
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  return db;
}

/**
 * Insert interactions into database
 */
export function insertInteractions(
  db: DatabaseSync,
  interactions: Interaction[],
): void {
  const insert = db.prepare(`
    INSERT INTO interactions (session_id, owner, role, content, thinking, tool_calls, timestamp, is_compact_summary)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Manual transaction management (node:sqlite doesn't have db.transaction())
  db.exec("BEGIN TRANSACTION");
  try {
    for (const item of interactions) {
      insert.run(
        item.session_id,
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

/**
 * Get interactions for a session
 */
export function getInteractions(
  db: DatabaseSync,
  sessionId: string,
): Interaction[] {
  const stmt = db.prepare(`
    SELECT * FROM interactions
    WHERE session_id = ?
    ORDER BY timestamp ASC
  `);
  return stmt.all(sessionId) as Interaction[];
}

/**
 * Get interactions for a session owned by specific user
 */
export function getInteractionsByOwner(
  db: DatabaseSync,
  sessionId: string,
  owner: string,
): Interaction[] {
  const stmt = db.prepare(`
    SELECT * FROM interactions
    WHERE session_id = ? AND owner = ?
    ORDER BY timestamp ASC
  `);
  return stmt.all(sessionId, owner) as Interaction[];
}

/**
 * Get interactions for multiple sessions (for master session support)
 * Returns interactions from all specified session IDs, ordered by timestamp.
 * Note: Use getInteractionsBySessionIdsAndOwner for security when exposing to API.
 */
export function getInteractionsBySessionIds(
  db: DatabaseSync,
  sessionIds: string[],
): Interaction[] {
  if (sessionIds.length === 0) {
    return [];
  }

  // Build parameterized query with placeholders
  const placeholders = sessionIds.map(() => "?").join(", ");
  const stmt = db.prepare(`
    SELECT * FROM interactions
    WHERE session_id IN (${placeholders})
    ORDER BY timestamp ASC, session_id ASC, role ASC
  `);
  return stmt.all(...sessionIds) as Interaction[];
}

/**
 * Get interactions for multiple sessions owned by specific user
 * This should be used for API endpoints to ensure security.
 */
export function getInteractionsBySessionIdsAndOwner(
  db: DatabaseSync,
  sessionIds: string[],
  owner: string,
): Interaction[] {
  if (sessionIds.length === 0) {
    return [];
  }

  const placeholders = sessionIds.map(() => "?").join(", ");
  const stmt = db.prepare(`
    SELECT * FROM interactions
    WHERE session_id IN (${placeholders}) AND owner = ?
    ORDER BY timestamp ASC, session_id ASC, role ASC
  `);
  return stmt.all(...sessionIds, owner) as Interaction[];
}

/**
 * Check if user owns any interactions for multiple sessions
 */
export function hasInteractionsForSessionIds(
  db: DatabaseSync,
  sessionIds: string[],
  owner: string,
): boolean {
  if (sessionIds.length === 0) {
    return false;
  }

  const placeholders = sessionIds.map(() => "?").join(", ");
  const stmt = db.prepare(`
    SELECT COUNT(*) as count FROM interactions
    WHERE session_id IN (${placeholders}) AND owner = ?
  `);
  const result = stmt.get(...sessionIds, owner) as { count: number };
  return result.count > 0;
}

/**
 * Check if user owns any interactions for a session
 */
export function hasInteractions(
  db: DatabaseSync,
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

/**
 * Insert pre-compact backup
 */
export function insertPreCompactBackup(
  db: DatabaseSync,
  backup: PreCompactBackup,
): void {
  const stmt = db.prepare(`
    INSERT INTO pre_compact_backups (session_id, owner, interactions)
    VALUES (?, ?, ?)
  `);
  stmt.run(backup.session_id, backup.owner, backup.interactions);
}

/**
 * Get latest pre-compact backup for a session
 */
export function getLatestBackup(
  db: DatabaseSync,
  sessionId: string,
): PreCompactBackup | null {
  const stmt = db.prepare(`
    SELECT * FROM pre_compact_backups
    WHERE session_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `);
  return (stmt.get(sessionId) as PreCompactBackup) || null;
}

/**
 * Get all backups for a session
 */
export function getAllBackups(
  db: DatabaseSync,
  sessionId: string,
): PreCompactBackup[] {
  const stmt = db.prepare(`
    SELECT * FROM pre_compact_backups
    WHERE session_id = ?
    ORDER BY created_at ASC
  `);
  return stmt.all(sessionId) as PreCompactBackup[];
}

/**
 * Search interactions using FTS5
 */
export function searchInteractions(
  db: DatabaseSync,
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

/**
 * Delete interactions for a session
 */
export function deleteInteractions(db: DatabaseSync, sessionId: string): void {
  const stmt = db.prepare("DELETE FROM interactions WHERE session_id = ?");
  stmt.run(sessionId);
}

/**
 * Delete backups for a session
 */
export function deleteBackups(db: DatabaseSync, sessionId: string): void {
  const stmt = db.prepare(
    "DELETE FROM pre_compact_backups WHERE session_id = ?",
  );
  stmt.run(sessionId);
}

/**
 * Get database statistics
 */
export function getDbStats(db: DatabaseSync): {
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
