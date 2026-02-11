// lib/suppress-sqlite-warning.ts
var originalEmit = process.emit;
process.emit = (event, ...args) => {
  if (event === "warning" && typeof args[0] === "object" && args[0] !== null && "name" in args[0] && args[0].name === "ExperimentalWarning" && "message" in args[0] && typeof args[0].message === "string" && args[0].message.includes("SQLite")) {
    return false;
  }
  return originalEmit.apply(process, [event, ...args]);
};

// lib/db-queries.ts
var { DatabaseSync } = await import("node:sqlite");
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
  if (sessionIds.length === 0) return [];
  const placeholders = sessionIds.map(() => "?").join(", ");
  const stmt = db.prepare(`
    SELECT * FROM interactions
    WHERE session_id IN (${placeholders})
    ORDER BY timestamp ASC, id ASC
  `);
  return stmt.all(...sessionIds);
}
function getInteractionsByClaudeSessionIds(db, claudeSessionIds) {
  if (claudeSessionIds.length === 0) return [];
  const placeholders = claudeSessionIds.map(() => "?").join(", ");
  const stmt = db.prepare(`
    SELECT * FROM interactions
    WHERE claude_session_id IN (${placeholders})
    ORDER BY timestamp ASC, id ASC
  `);
  return stmt.all(...claudeSessionIds);
}
function getInteractionsBySessionIdsAndOwner(db, sessionIds, owner) {
  if (sessionIds.length === 0) return [];
  const placeholders = sessionIds.map(() => "?").join(", ");
  const stmt = db.prepare(`
    SELECT * FROM interactions
    WHERE session_id IN (${placeholders}) AND owner = ?
    ORDER BY timestamp ASC, id ASC
  `);
  return stmt.all(...sessionIds, owner);
}
function hasInteractionsForSessionIds(db, sessionIds, owner) {
  if (sessionIds.length === 0) return false;
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
  getAllBackups,
  getDbStats,
  getInteractions,
  getInteractionsByClaudeSessionIds,
  getInteractionsByOwner,
  getInteractionsByProject,
  getInteractionsByRepository,
  getInteractionsBySessionIds,
  getInteractionsBySessionIdsAndOwner,
  getLatestBackup,
  getUniqueProjects,
  getUniqueRepositories,
  hasInteractions,
  hasInteractionsForSessionIds,
  searchInteractions
};
