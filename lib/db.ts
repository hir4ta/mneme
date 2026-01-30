/**
 * memoria SQLite Database Utilities
 *
 * Global database for private interactions across all projects.
 * Location: ~/.claude/memoria/global.db (or MEMORIA_DATA_DIR env var)
 *
 * Uses Node.js built-in sqlite module (node:sqlite) for platform independence.
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Suppress Node.js SQLite experimental warning
const originalEmit = process.emit;
// @ts-expect-error - process.emit override for warning suppression
process.emit = (name, data, ...args) => {
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
  project_path: string;
  repository?: string | null;
  repository_url?: string | null;
  repository_root?: string | null;
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
  project_path: string;
  owner: string;
  interactions: string; // JSON string
  created_at?: string;
}

export interface RepositoryInfo {
  repository: string | null; // owner/repo
  repository_url: string | null; // normalized remote URL
  repository_root: string | null; // absolute path to repo root
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
 * Get global database directory path
 * Uses MEMORIA_DATA_DIR env var or defaults to ~/.claude/memoria/
 */
export function getGlobalDbDir(): string {
  const envDir = process.env.MEMORIA_DATA_DIR;
  if (envDir) {
    return envDir;
  }
  return join(homedir(), ".claude", "memoria");
}

/**
 * Get global database path
 */
export function getGlobalDbPath(): string {
  return join(getGlobalDbDir(), "global.db");
}

/**
 * @deprecated Use getGlobalDbPath() instead. Kept for migration compatibility.
 */
export function getDbPath(memoriaDir: string): string {
  return join(memoriaDir, "local.db");
}

/**
 * Configure database pragmas for optimal performance
 */
function configurePragmas(db: DatabaseSync): void {
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA synchronous = NORMAL");
}

/**
 * Initialize global database with schema
 */
export function initGlobalDatabase(): DatabaseSync {
  const dbDir = getGlobalDbDir();
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  const dbPath = getGlobalDbPath();
  const db = new DatabaseSync(dbPath);

  // Configure pragmas
  configurePragmas(db);

  // Read and execute schema
  const schemaPath = join(__dirname, "schema.sql");
  if (existsSync(schemaPath)) {
    const schema = readFileSync(schemaPath, "utf-8");
    db.exec(schema);
  }

  return db;
}

/**
 * @deprecated Use initGlobalDatabase() instead.
 */
export function initDatabase(memoriaDir: string): DatabaseSync {
  const dbPath = getDbPath(memoriaDir);
  const db = new DatabaseSync(dbPath);
  configurePragmas(db);

  const schemaPath = join(__dirname, "schema.sql");
  if (existsSync(schemaPath)) {
    const schema = readFileSync(schemaPath, "utf-8");
    db.exec(schema);
  }

  return db;
}

/**
 * Open global database
 */
export function openGlobalDatabase(): DatabaseSync | null {
  const dbPath = getGlobalDbPath();
  if (!existsSync(dbPath)) {
    return null;
  }
  const db = new DatabaseSync(dbPath);
  configurePragmas(db);
  return db;
}

/**
 * @deprecated Use openGlobalDatabase() instead.
 */
export function openDatabase(memoriaDir: string): DatabaseSync | null {
  const dbPath = getDbPath(memoriaDir);
  if (!existsSync(dbPath)) {
    return null;
  }
  const db = new DatabaseSync(dbPath);
  configurePragmas(db);
  return db;
}

/**
 * Get repository info from a project directory
 */
export function getRepositoryInfo(projectPath: string): RepositoryInfo {
  const result: RepositoryInfo = {
    repository: null,
    repository_url: null,
    repository_root: null,
  };

  try {
    // Check if it's a git repository
    execSync("git rev-parse --git-dir", {
      cwd: projectPath,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Get repository root
    result.repository_root = execSync("git rev-parse --show-toplevel", {
      cwd: projectPath,
      encoding: "utf-8",
    }).trim();

    // Get remote URL
    try {
      result.repository_url = execSync("git remote get-url origin", {
        cwd: projectPath,
        encoding: "utf-8",
      }).trim();

      // Extract owner/repo from URL
      // git@github.com:owner/repo.git → owner/repo
      // https://github.com/owner/repo.git → owner/repo
      const match = result.repository_url.match(/[:/]([^/]+\/[^/]+?)(\.git)?$/);
      if (match) {
        result.repository = match[1].replace(/\.git$/, "");
      }
    } catch {
      // No remote origin, that's OK
    }
  } catch {
    // Not a git repository
  }

  return result;
}

/**
 * Insert interactions into database
 */
export function insertInteractions(
  db: DatabaseSync,
  interactions: Interaction[],
): void {
  const insert = db.prepare(`
    INSERT INTO interactions (session_id, project_path, repository, repository_url, repository_root, owner, role, content, thinking, tool_calls, timestamp, is_compact_summary)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Manual transaction management (node:sqlite doesn't have db.transaction())
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

/**
 * Get interactions by project path
 */
export function getInteractionsByProject(
  db: DatabaseSync,
  projectPath: string,
): Interaction[] {
  const stmt = db.prepare(`
    SELECT * FROM interactions
    WHERE project_path = ?
    ORDER BY timestamp ASC
  `);
  return stmt.all(projectPath) as Interaction[];
}

/**
 * Get interactions by repository
 */
export function getInteractionsByRepository(
  db: DatabaseSync,
  repository: string,
): Interaction[] {
  const stmt = db.prepare(`
    SELECT * FROM interactions
    WHERE repository = ?
    ORDER BY timestamp ASC
  `);
  return stmt.all(repository) as Interaction[];
}

/**
 * Get unique projects from database
 */
export function getUniqueProjects(db: DatabaseSync): string[] {
  const stmt = db.prepare(`
    SELECT DISTINCT project_path FROM interactions
    ORDER BY project_path
  `);
  const rows = stmt.all() as Array<{ project_path: string }>;
  return rows.map((r) => r.project_path);
}

/**
 * Get unique repositories from database
 */
export function getUniqueRepositories(db: DatabaseSync): string[] {
  const stmt = db.prepare(`
    SELECT DISTINCT repository FROM interactions
    WHERE repository IS NOT NULL
    ORDER BY repository
  `);
  const rows = stmt.all() as Array<{ repository: string }>;
  return rows.map((r) => r.repository);
}

/**
 * Delete interactions by project path
 */
export function deleteInteractionsByProject(
  db: DatabaseSync,
  projectPath: string,
): number {
  const stmt = db.prepare("DELETE FROM interactions WHERE project_path = ?");
  const result = stmt.run(projectPath);
  return result.changes;
}

/**
 * Delete interactions before a specific date
 */
export function deleteInteractionsBefore(
  db: DatabaseSync,
  beforeDate: string,
): number {
  const stmt = db.prepare("DELETE FROM interactions WHERE timestamp < ?");
  const result = stmt.run(beforeDate);
  return result.changes;
}

/**
 * Delete backups by project path
 */
export function deleteBackupsByProject(
  db: DatabaseSync,
  projectPath: string,
): number {
  const stmt = db.prepare(
    "DELETE FROM pre_compact_backups WHERE project_path = ?",
  );
  const result = stmt.run(projectPath);
  return result.changes;
}

/**
 * Count interactions matching filter criteria
 */
export function countInteractions(
  db: DatabaseSync,
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
