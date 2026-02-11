// servers/db-utils.ts
import * as fs from "node:fs";
import * as path from "node:path";

// servers/db-types.ts
var { DatabaseSync } = await import("node:sqlite");

// servers/db-utils.ts
function getProjectPath() {
  return process.env.MNEME_PROJECT_PATH || process.cwd();
}
function getLocalDbPath() {
  return path.join(getProjectPath(), ".mneme", "local.db");
}
var db = null;
function getDb() {
  if (db) return db;
  const dbPath = getLocalDbPath();
  if (!fs.existsSync(dbPath)) {
    return null;
  }
  try {
    db = new DatabaseSync(dbPath);
    db.exec("PRAGMA journal_mode = WAL");
    return db;
  } catch {
    return null;
  }
}

// servers/db-queries.ts
function listProjects() {
  const database = getDb();
  if (!database) return [];
  try {
    const stmt = database.prepare(`
      SELECT
        project_path,
        repository,
        COUNT(DISTINCT session_id) as session_count,
        COUNT(*) as interaction_count,
        MAX(timestamp) as last_activity
      FROM interactions
      GROUP BY project_path
      ORDER BY last_activity DESC
    `);
    const rows = stmt.all();
    return rows.map((row) => ({
      projectPath: row.project_path,
      repository: row.repository,
      sessionCount: row.session_count,
      interactionCount: row.interaction_count,
      lastActivity: row.last_activity
    }));
  } catch {
    return [];
  }
}
function listSessions(options) {
  const database = getDb();
  if (!database) return [];
  const { projectPath, repository, limit = 20 } = options;
  try {
    let sql = `
      SELECT
        session_id,
        project_path,
        repository,
        owner,
        COUNT(*) as message_count,
        MIN(timestamp) as started_at,
        MAX(timestamp) as last_message_at
      FROM interactions
      WHERE 1=1
    `;
    const params = [];
    if (projectPath) {
      sql += " AND project_path = ?";
      params.push(projectPath);
    }
    if (repository) {
      sql += " AND repository = ?";
      params.push(repository);
    }
    sql += `
      GROUP BY session_id
      ORDER BY last_message_at DESC
      LIMIT ?
    `;
    params.push(limit);
    const stmt = database.prepare(sql);
    const rows = stmt.all(...params);
    return rows.map((row) => ({
      sessionId: row.session_id,
      projectPath: row.project_path,
      repository: row.repository,
      owner: row.owner,
      messageCount: row.message_count,
      startedAt: row.started_at,
      lastMessageAt: row.last_message_at
    }));
  } catch {
    return [];
  }
}
function getInteractions(sessionId, options = {}) {
  const database = getDb();
  if (!database) return [];
  const { limit = 50, offset = 0 } = options;
  try {
    const stmt = database.prepare(`
      SELECT
        id,
        session_id,
        claude_session_id,
        project_path,
        owner,
        role,
        content,
        thinking,
        tool_calls,
        timestamp
      FROM interactions
      WHERE session_id = ?
      ORDER BY timestamp ASC
      LIMIT ? OFFSET ?
    `);
    const rows = stmt.all(sessionId, limit, offset);
    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      claudeSessionId: row.claude_session_id,
      projectPath: row.project_path,
      owner: row.owner,
      role: row.role,
      content: row.content,
      thinking: row.thinking,
      toolCalls: row.tool_calls,
      timestamp: row.timestamp
    }));
  } catch {
    return [];
  }
}
function getStats() {
  const database = getDb();
  if (!database) return null;
  try {
    const overallStmt = database.prepare(`
      SELECT
        COUNT(DISTINCT project_path) as total_projects,
        COUNT(DISTINCT session_id) as total_sessions,
        COUNT(*) as total_interactions,
        COUNT(thinking) as total_thinking
      FROM interactions
    `);
    const overall = overallStmt.get();
    const projectStmt = database.prepare(`
      SELECT
        project_path,
        repository,
        COUNT(DISTINCT session_id) as sessions,
        COUNT(*) as interactions
      FROM interactions
      GROUP BY project_path
      ORDER BY interactions DESC
      LIMIT 10
    `);
    const projectRows = projectStmt.all();
    const activityStmt = database.prepare(`
      SELECT
        DATE(timestamp) as date,
        COUNT(DISTINCT session_id) as sessions,
        COUNT(*) as interactions
      FROM interactions
      WHERE timestamp >= datetime('now', '-7 days')
      GROUP BY DATE(timestamp)
      ORDER BY date DESC
    `);
    const activityRows = activityStmt.all();
    return {
      totalProjects: overall.total_projects,
      totalSessions: overall.total_sessions,
      totalInteractions: overall.total_interactions,
      totalThinkingBlocks: overall.total_thinking,
      projectStats: projectRows.map((row) => ({
        projectPath: row.project_path,
        repository: row.repository,
        sessions: row.sessions,
        interactions: row.interactions
      })),
      recentActivity: activityRows
    };
  } catch {
    return null;
  }
}
function crossProjectSearch(query, options = {}) {
  const database = getDb();
  if (!database) return [];
  const { limit = 10 } = options;
  try {
    const ftsStmt = database.prepare(`
      SELECT
        i.session_id,
        i.project_path,
        i.repository,
        snippet(interactions_fts, 0, '[', ']', '...', 32) as snippet,
        i.timestamp
      FROM interactions_fts
      JOIN interactions i ON interactions_fts.rowid = i.id
      WHERE interactions_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `);
    const rows = ftsStmt.all(query, limit);
    return rows.map((row) => ({
      sessionId: row.session_id,
      projectPath: row.project_path,
      repository: row.repository,
      snippet: row.snippet,
      timestamp: row.timestamp
    }));
  } catch {
    try {
      const likeStmt = database.prepare(`
        SELECT DISTINCT
          session_id,
          project_path,
          repository,
          substr(content, 1, 100) as snippet,
          timestamp
        FROM interactions
        WHERE content LIKE ? OR thinking LIKE ?
        ORDER BY timestamp DESC
        LIMIT ?
      `);
      const pattern = `%${query}%`;
      const rows = likeStmt.all(pattern, pattern, limit);
      return rows.map((row) => ({
        sessionId: row.session_id,
        projectPath: row.project_path,
        repository: row.repository,
        snippet: row.snippet,
        timestamp: row.timestamp
      }));
    } catch {
      return [];
    }
  }
}
export {
  crossProjectSearch,
  getInteractions,
  getStats,
  listProjects,
  listSessions
};
