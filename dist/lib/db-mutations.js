// lib/suppress-sqlite-warning.ts
var originalEmit = process.emit;
process.emit = (event, ...args) => {
  if (event === "warning" && typeof args[0] === "object" && args[0] !== null && "name" in args[0] && args[0].name === "ExperimentalWarning" && "message" in args[0] && typeof args[0].message === "string" && args[0].message.includes("SQLite")) {
    return false;
  }
  return originalEmit.apply(process, [event, ...args]);
};

// lib/db-mutations.ts
var { DatabaseSync } = await import("node:sqlite");
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
export {
  deleteBackups,
  deleteBackupsByProject,
  deleteInteractions,
  deleteInteractionsBefore,
  deleteInteractionsByProject,
  insertInteractions,
  insertPreCompactBackup
};
