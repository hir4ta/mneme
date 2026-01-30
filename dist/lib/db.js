// lib/db.ts
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
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
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
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
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  return db;
}
function insertInteractions(db, interactions) {
  const insert = db.prepare(`
    INSERT INTO interactions (session_id, owner, role, content, thinking, tool_calls, timestamp, is_compact_summary)
    VALUES (@session_id, @owner, @role, @content, @thinking, @tool_calls, @timestamp, @is_compact_summary)
  `);
  const insertMany = db.transaction((items) => {
    for (const item of items) {
      insert.run({
        session_id: item.session_id,
        owner: item.owner,
        role: item.role,
        content: item.content,
        thinking: item.thinking || null,
        tool_calls: item.tool_calls || null,
        timestamp: item.timestamp,
        is_compact_summary: item.is_compact_summary || 0
      });
    }
  });
  insertMany(interactions);
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
    VALUES (@session_id, @owner, @interactions)
  `);
  stmt.run(backup);
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
