// lib/db.ts
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
var originalEmit = process.emit;
process.emit = function(name, data, ...args) {
  if (name === "warning" && typeof data === "object" && data?.name === "ExperimentalWarning" && data?.message?.includes("SQLite")) {
    return false;
  }
  return originalEmit.call(process, name, data, ...args);
};
var { DatabaseSync } = await import("node:sqlite");
var __filename = fileURLToPath(import.meta.url);
var __dirname = dirname(__filename);
function getCurrentUser() {
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
function getDbPath(memoriaDir) {
  return join(memoriaDir, "local.db");
}
function initDatabase(memoriaDir) {
  const dbPath = getDbPath(memoriaDir);
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  const schemaPath = join(__dirname, "schema.sql");
  if (existsSync(schemaPath)) {
    const schema = readFileSync(schemaPath, "utf-8");
    db.exec(schema);
  }
  return db;
}
function openDatabase(memoriaDir) {
  const dbPath = getDbPath(memoriaDir);
  if (!existsSync(dbPath)) {
    return null;
  }
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  return db;
}
function insertInteractions(db, interactions) {
  const insert = db.prepare(`
    INSERT INTO interactions (session_id, owner, role, content, thinking, tool_calls, timestamp, is_compact_summary)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
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
        item.is_compact_summary || 0
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
function getInteractions(db, sessionId) {
  const stmt = db.prepare(`
    SELECT * FROM interactions
    WHERE session_id = ?
    ORDER BY timestamp ASC
  `);
  return stmt.all(sessionId);
}
function getInteractionsByOwner(db, sessionId, owner) {
  const stmt = db.prepare(`
    SELECT * FROM interactions
    WHERE session_id = ? AND owner = ?
    ORDER BY timestamp ASC
  `);
  return stmt.all(sessionId, owner);
}
function hasInteractions(db, sessionId, owner) {
  const stmt = db.prepare(`
    SELECT COUNT(*) as count FROM interactions
    WHERE session_id = ? AND owner = ?
  `);
  const result = stmt.get(sessionId, owner);
  return result.count > 0;
}
function insertPreCompactBackup(db, backup) {
  const stmt = db.prepare(`
    INSERT INTO pre_compact_backups (session_id, owner, interactions)
    VALUES (?, ?, ?)
  `);
  stmt.run(backup.session_id, backup.owner, backup.interactions);
}
function getLatestBackup(db, sessionId) {
  const stmt = db.prepare(`
    SELECT * FROM pre_compact_backups
    WHERE session_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `);
  return stmt.get(sessionId) || null;
}
function getAllBackups(db, sessionId) {
  const stmt = db.prepare(`
    SELECT * FROM pre_compact_backups
    WHERE session_id = ?
    ORDER BY created_at ASC
  `);
  return stmt.all(sessionId);
}
function searchInteractions(db, query, limit = 10) {
  const stmt = db.prepare(`
    SELECT i.session_id, i.content, i.thinking
    FROM interactions_fts fts
    JOIN interactions i ON fts.rowid = i.id
    WHERE interactions_fts MATCH ?
    LIMIT ?
  `);
  return stmt.all(query, limit);
}
function deleteInteractions(db, sessionId) {
  const stmt = db.prepare("DELETE FROM interactions WHERE session_id = ?");
  stmt.run(sessionId);
}
function deleteBackups(db, sessionId) {
  const stmt = db.prepare(
    "DELETE FROM pre_compact_backups WHERE session_id = ?"
  );
  stmt.run(sessionId);
}
function getDbStats(db) {
  const interactionsCount = db.prepare("SELECT COUNT(*) as count FROM interactions").get();
  const backupsCount = db.prepare("SELECT COUNT(*) as count FROM pre_compact_backups").get();
  return {
    interactions: interactionsCount.count,
    backups: backupsCount.count
  };
}
export {
  deleteBackups,
  deleteInteractions,
  getAllBackups,
  getCurrentUser,
  getDbPath,
  getDbStats,
  getInteractions,
  getInteractionsByOwner,
  getLatestBackup,
  hasInteractions,
  initDatabase,
  insertInteractions,
  insertPreCompactBackup,
  openDatabase,
  searchInteractions
};
