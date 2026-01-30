/**
 * memoria SQLite Database Utilities
 *
 * Local-only database for private interactions and backups.
 * This file provides CRUD operations for interactions and pre_compact_backups.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

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
export function initDatabase(memoriaDir: string): Database.Database {
  const dbPath = getDbPath(memoriaDir);
  const db = new Database(dbPath);

  // Enable WAL mode for better concurrent access
  db.pragma("journal_mode = WAL");

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
export function openDatabase(memoriaDir: string): Database.Database | null {
  const dbPath = getDbPath(memoriaDir);
  if (!existsSync(dbPath)) {
    return null;
  }
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  return db;
}

/**
 * Insert interactions into database
 */
export function insertInteractions(
  db: Database.Database,
  interactions: Interaction[],
): void {
  const insert = db.prepare(`
    INSERT INTO interactions (session_id, owner, role, content, thinking, tool_calls, timestamp, is_compact_summary)
    VALUES (@session_id, @owner, @role, @content, @thinking, @tool_calls, @timestamp, @is_compact_summary)
  `);

  const insertMany = db.transaction((items: Interaction[]) => {
    for (const item of items) {
      insert.run({
        session_id: item.session_id,
        owner: item.owner,
        role: item.role,
        content: item.content,
        thinking: item.thinking || null,
        tool_calls: item.tool_calls || null,
        timestamp: item.timestamp,
        is_compact_summary: item.is_compact_summary || 0,
      });
    }
  });

  insertMany(interactions);
}

/**
 * Get interactions for a session
 */
export function getInteractions(
  db: Database.Database,
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
  db: Database.Database,
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
 * Check if user owns any interactions for a session
 */
export function hasInteractions(
  db: Database.Database,
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
  db: Database.Database,
  backup: PreCompactBackup,
): void {
  const stmt = db.prepare(`
    INSERT INTO pre_compact_backups (session_id, owner, interactions)
    VALUES (@session_id, @owner, @interactions)
  `);
  stmt.run(backup);
}

/**
 * Get latest pre-compact backup for a session
 */
export function getLatestBackup(
  db: Database.Database,
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
  db: Database.Database,
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
  db: Database.Database,
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
export function deleteInteractions(
  db: Database.Database,
  sessionId: string,
): void {
  const stmt = db.prepare("DELETE FROM interactions WHERE session_id = ?");
  stmt.run(sessionId);
}

/**
 * Delete backups for a session
 */
export function deleteBackups(db: Database.Database, sessionId: string): void {
  const stmt = db.prepare(
    "DELETE FROM pre_compact_backups WHERE session_id = ?",
  );
  stmt.run(sessionId);
}

/**
 * Get database statistics
 */
export function getDbStats(db: Database.Database): {
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
