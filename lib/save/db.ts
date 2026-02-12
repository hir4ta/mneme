import "../suppress-sqlite-warning.js";

import * as fs from "node:fs";
import * as path from "node:path";

const { DatabaseSync } = await import("node:sqlite");
type DatabaseSyncType = InstanceType<typeof DatabaseSync>;

import type { SaveState } from "./types.js";

function getSchemaPath(): string | null {
  const scriptDir = path.dirname(new URL(import.meta.url).pathname);
  const candidates = [
    path.join(scriptDir, "..", "schema.sql"),
    path.join(scriptDir, "schema.sql"),
    path.join(scriptDir, "..", "..", "lib", "schema.sql"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

const FALLBACK_SCHEMA = `
CREATE TABLE IF NOT EXISTS interactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    claude_session_id TEXT,
    project_path TEXT NOT NULL,
    repository TEXT,
    repository_url TEXT,
    repository_root TEXT,
    owner TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    thinking TEXT,
    tool_calls TEXT,
    timestamp TEXT NOT NULL,
    is_compact_summary INTEGER DEFAULT 0,
    agent_id TEXT,
    agent_type TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_interactions_session ON interactions(session_id);
CREATE INDEX IF NOT EXISTS idx_interactions_claude_session ON interactions(claude_session_id);
CREATE INDEX IF NOT EXISTS idx_interactions_owner ON interactions(owner);
CREATE INDEX IF NOT EXISTS idx_interactions_timestamp ON interactions(timestamp);
CREATE INDEX IF NOT EXISTS idx_interactions_project ON interactions(project_path);
CREATE INDEX IF NOT EXISTS idx_interactions_repository ON interactions(repository);

CREATE TABLE IF NOT EXISTS session_save_state (
    claude_session_id TEXT PRIMARY KEY,
    mneme_session_id TEXT NOT NULL,
    project_path TEXT NOT NULL,
    last_saved_timestamp TEXT,
    last_saved_line INTEGER DEFAULT 0,
    is_committed INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_save_state_mneme_session ON session_save_state(mneme_session_id);
CREATE INDEX IF NOT EXISTS idx_save_state_project ON session_save_state(project_path);

CREATE TABLE IF NOT EXISTS pre_compact_backups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    project_path TEXT NOT NULL,
    owner TEXT NOT NULL,
    interactions TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE VIRTUAL TABLE IF NOT EXISTS interactions_fts USING fts5(
    content,
    thinking,
    content=interactions,
    content_rowid=id,
    tokenize='unicode61'
);

CREATE TRIGGER IF NOT EXISTS interactions_ai AFTER INSERT ON interactions BEGIN
    INSERT INTO interactions_fts(rowid, content, thinking)
    VALUES (new.id, new.content, new.thinking);
END;

CREATE TRIGGER IF NOT EXISTS interactions_ad AFTER DELETE ON interactions BEGIN
    INSERT INTO interactions_fts(interactions_fts, rowid, content, thinking)
    VALUES ('delete', old.id, old.content, old.thinking);
END;
`;

function migrateDatabase(db: DatabaseSyncType): void {
  try {
    const columns = db
      .prepare("PRAGMA table_info(interactions)")
      .all() as Array<{ name: string }>;
    const hasClaudeSessionId = columns.some(
      (c) => c.name === "claude_session_id",
    );

    if (!hasClaudeSessionId) {
      db.exec("ALTER TABLE interactions ADD COLUMN claude_session_id TEXT");
      db.exec(
        "CREATE INDEX IF NOT EXISTS idx_interactions_claude_session ON interactions(claude_session_id)",
      );
      console.error("[mneme] Migrated: added claude_session_id column");
    }
  } catch {
    // Ignore migration errors
  }

  try {
    db.exec("SELECT 1 FROM session_save_state LIMIT 1");
  } catch {
    db.exec(`
      CREATE TABLE IF NOT EXISTS session_save_state (
        claude_session_id TEXT PRIMARY KEY,
        mneme_session_id TEXT NOT NULL,
        project_path TEXT NOT NULL,
        last_saved_timestamp TEXT,
        last_saved_line INTEGER DEFAULT 0,
        is_committed INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_save_state_mneme_session ON session_save_state(mneme_session_id);
      CREATE INDEX IF NOT EXISTS idx_save_state_project ON session_save_state(project_path);
    `);
    console.error("[mneme] Migrated: created session_save_state table");
  }

  try {
    db.exec("SELECT 1 FROM file_index LIMIT 1");
  } catch {
    db.exec(`
      CREATE TABLE IF NOT EXISTS file_index (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        project_path TEXT NOT NULL,
        file_path TEXT NOT NULL,
        tool_name TEXT,
        timestamp TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_file_index_session ON file_index(session_id);
      CREATE INDEX IF NOT EXISTS idx_file_index_project_file ON file_index(project_path, file_path);
    `);
    console.error("[mneme] Migrated: created file_index table");
  }
}

export function initDatabase(dbPath: string): DatabaseSyncType {
  const mnemeDir = path.dirname(dbPath);
  if (!fs.existsSync(mnemeDir)) {
    fs.mkdirSync(mnemeDir, { recursive: true });
  }

  const db = new DatabaseSync(dbPath);

  try {
    db.exec("SELECT 1 FROM interactions LIMIT 1");
  } catch {
    const schemaPath = getSchemaPath();
    if (schemaPath) {
      const schema = fs.readFileSync(schemaPath, "utf8");
      db.exec(schema);
      console.error(`[mneme] Database initialized from schema: ${dbPath}`);
    } else {
      db.exec(FALLBACK_SCHEMA);
      console.error(
        `[mneme] Database initialized with fallback schema: ${dbPath}`,
      );
    }
  }

  migrateDatabase(db);

  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA synchronous = NORMAL");

  return db;
}

export function getSaveState(
  db: DatabaseSyncType,
  claudeSessionId: string,
  mnemeSessionId: string,
  projectPath: string,
): SaveState {
  const stmt = db.prepare(
    "SELECT * FROM session_save_state WHERE claude_session_id = ?",
  );
  const row = stmt.get(claudeSessionId) as
    | {
        claude_session_id: string;
        mneme_session_id: string;
        project_path: string;
        last_saved_timestamp: string | null;
        last_saved_line: number;
        is_committed: number;
      }
    | undefined;

  if (row) {
    return {
      claudeSessionId: row.claude_session_id,
      mnemeSessionId: row.mneme_session_id,
      projectPath: row.project_path,
      lastSavedTimestamp: row.last_saved_timestamp,
      lastSavedLine: row.last_saved_line,
      isCommitted: row.is_committed,
    };
  }

  const insertStmt = db.prepare(`
    INSERT INTO session_save_state (claude_session_id, mneme_session_id, project_path)
    VALUES (?, ?, ?)
  `);
  insertStmt.run(claudeSessionId, mnemeSessionId, projectPath);

  return {
    claudeSessionId,
    mnemeSessionId,
    projectPath,
    lastSavedTimestamp: null,
    lastSavedLine: 0,
    isCommitted: 0,
  };
}

export function updateSaveState(
  db: DatabaseSyncType,
  claudeSessionId: string,
  lastSavedTimestamp: string,
  lastSavedLine: number,
): void {
  const stmt = db.prepare(`
    UPDATE session_save_state
    SET last_saved_timestamp = ?, last_saved_line = ?, updated_at = datetime('now')
    WHERE claude_session_id = ?
  `);
  stmt.run(lastSavedTimestamp, lastSavedLine, claudeSessionId);
}
