// lib/db.ts
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
var originalEmit = process.emit;
process.emit = (event, ...args) => {
  if (event === "warning" && typeof args[0] === "object" && args[0] !== null && "name" in args[0] && args[0].name === "ExperimentalWarning" && "message" in args[0] && typeof args[0].message === "string" && args[0].message.includes("SQLite")) {
    return false;
  }
  return originalEmit.apply(process, [event, ...args]);
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
function getLocalDbPath(projectPath) {
  return join(projectPath, ".mneme", "local.db");
}
function configurePragmas(db) {
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA synchronous = NORMAL");
}
function initLocalDatabase(projectPath) {
  const mnemeDir = join(projectPath, ".mneme");
  if (!existsSync(mnemeDir)) {
    mkdirSync(mnemeDir, { recursive: true });
  }
  const dbPath = getLocalDbPath(projectPath);
  const db = new DatabaseSync(dbPath);
  configurePragmas(db);
  const schemaPath = join(__dirname, "schema.sql");
  if (existsSync(schemaPath)) {
    const schema = readFileSync(schemaPath, "utf-8");
    db.exec(schema);
  }
  return db;
}
function openLocalDatabase(projectPath) {
  const dbPath = getLocalDbPath(projectPath);
  if (!existsSync(dbPath)) {
    return null;
  }
  const db = new DatabaseSync(dbPath);
  configurePragmas(db);
  return db;
}
function getRepositoryInfo(projectPath) {
  const result = {
    repository: null,
    repository_url: null,
    repository_root: null
  };
  try {
    execSync("git rev-parse --git-dir", {
      cwd: projectPath,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    });
    result.repository_root = execSync("git rev-parse --show-toplevel", {
      cwd: projectPath,
      encoding: "utf-8"
    }).trim();
    try {
      result.repository_url = execSync("git remote get-url origin", {
        cwd: projectPath,
        encoding: "utf-8"
      }).trim();
      const match = result.repository_url.match(/[:/]([^/]+\/[^/]+?)(\.git)?$/);
      if (match) {
        result.repository = match[1].replace(/\.git$/, "");
      }
    } catch {
    }
  } catch {
  }
  return result;
}
function insertInteractions(db, interactions) {
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
function getInteractionsBySessionIds(db, sessionIds) {
  if (sessionIds.length === 0) {
    return [];
  }
  const placeholders = sessionIds.map(() => "?").join(", ");
  const stmt = db.prepare(`
    SELECT * FROM interactions
    WHERE session_id IN (${placeholders})
    ORDER BY timestamp ASC, id ASC
  `);
  return stmt.all(...sessionIds);
}
function getInteractionsBySessionIdsAndOwner(db, sessionIds, owner) {
  if (sessionIds.length === 0) {
    return [];
  }
  const placeholders = sessionIds.map(() => "?").join(", ");
  const stmt = db.prepare(`
    SELECT * FROM interactions
    WHERE session_id IN (${placeholders}) AND owner = ?
    ORDER BY timestamp ASC, id ASC
  `);
  return stmt.all(...sessionIds, owner);
}
function hasInteractionsForSessionIds(db, sessionIds, owner) {
  if (sessionIds.length === 0) {
    return false;
  }
  const placeholders = sessionIds.map(() => "?").join(", ");
  const stmt = db.prepare(`
    SELECT COUNT(*) as count FROM interactions
    WHERE session_id IN (${placeholders}) AND owner = ?
  `);
  const result = stmt.get(...sessionIds, owner);
  return result.count > 0;
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
    INSERT INTO pre_compact_backups (session_id, project_path, owner, interactions)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(
    backup.session_id,
    backup.project_path,
    backup.owner,
    backup.interactions
  );
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
function getInteractionsByProject(db, projectPath) {
  const stmt = db.prepare(`
    SELECT * FROM interactions
    WHERE project_path = ?
    ORDER BY timestamp ASC
  `);
  return stmt.all(projectPath);
}
function getInteractionsByRepository(db, repository) {
  const stmt = db.prepare(`
    SELECT * FROM interactions
    WHERE repository = ?
    ORDER BY timestamp ASC
  `);
  return stmt.all(repository);
}
function getUniqueProjects(db) {
  const stmt = db.prepare(`
    SELECT DISTINCT project_path FROM interactions
    ORDER BY project_path
  `);
  const rows = stmt.all();
  return rows.map((r) => r.project_path);
}
function getUniqueRepositories(db) {
  const stmt = db.prepare(`
    SELECT DISTINCT repository FROM interactions
    WHERE repository IS NOT NULL
    ORDER BY repository
  `);
  const rows = stmt.all();
  return rows.map((r) => r.repository);
}
function deleteInteractionsByProject(db, projectPath) {
  const stmt = db.prepare("DELETE FROM interactions WHERE project_path = ?");
  const result = stmt.run(projectPath);
  return Number(result.changes);
}
function deleteInteractionsBefore(db, beforeDate) {
  const stmt = db.prepare("DELETE FROM interactions WHERE timestamp < ?");
  const result = stmt.run(beforeDate);
  return Number(result.changes);
}
function deleteBackupsByProject(db, projectPath) {
  const stmt = db.prepare(
    "DELETE FROM pre_compact_backups WHERE project_path = ?"
  );
  const result = stmt.run(projectPath);
  return Number(result.changes);
}
function countInteractions(db, filter) {
  const conditions = [];
  const params = [];
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
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const stmt = db.prepare(
    `SELECT COUNT(*) as count FROM interactions ${whereClause}`
  );
  const result = stmt.get(...params);
  return result.count;
}
export {
  countInteractions,
  deleteBackups,
  deleteBackupsByProject,
  deleteInteractions,
  deleteInteractionsBefore,
  deleteInteractionsByProject,
  getAllBackups,
  getCurrentUser,
  getDbStats,
  getInteractions,
  getInteractionsByOwner,
  getInteractionsByProject,
  getInteractionsByRepository,
  getInteractionsBySessionIds,
  getInteractionsBySessionIdsAndOwner,
  getLatestBackup,
  getLocalDbPath,
  getRepositoryInfo,
  getUniqueProjects,
  getUniqueRepositories,
  hasInteractions,
  hasInteractionsForSessionIds,
  initLocalDatabase,
  insertInteractions,
  insertPreCompactBackup,
  openLocalDatabase,
  searchInteractions
};
