// lib/suppress-sqlite-warning.ts
var originalEmit = process.emit;
process.emit = (event, ...args) => {
  if (event === "warning" && typeof args[0] === "object" && args[0] !== null && "name" in args[0] && args[0].name === "ExperimentalWarning" && "message" in args[0] && typeof args[0].message === "string" && args[0].message.includes("SQLite")) {
    return false;
  }
  return originalEmit.apply(process, [event, ...args]);
};

// lib/incremental-save-cleanup.ts
import * as fs2 from "node:fs";
import * as path2 from "node:path";

// lib/incremental-save-git.ts
import * as fs from "node:fs";
import * as path from "node:path";
function resolveMnemeSessionId(projectPath, claudeSessionId) {
  const shortId = claudeSessionId.slice(0, 8);
  const sessionLinkPath = path.join(
    projectPath,
    ".mneme",
    "session-links",
    `${shortId}.json`
  );
  if (fs.existsSync(sessionLinkPath)) {
    try {
      const link = JSON.parse(fs.readFileSync(sessionLinkPath, "utf8"));
      if (link.masterSessionId) {
        return link.masterSessionId;
      }
    } catch {
    }
  }
  return shortId;
}
function findSessionFileById(projectPath, mnemeSessionId) {
  const sessionsDir = path.join(projectPath, ".mneme", "sessions");
  const searchDir = (dir) => {
    if (!fs.existsSync(dir)) return null;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const result = searchDir(fullPath);
        if (result) return result;
      } else if (entry.name === `${mnemeSessionId}.json`) {
        return fullPath;
      }
    }
    return null;
  };
  return searchDir(sessionsDir);
}
function hasSessionSummary(sessionFile) {
  if (!sessionFile) return false;
  try {
    const session = JSON.parse(fs.readFileSync(sessionFile, "utf8"));
    return !!session.summary;
  } catch {
    return false;
  }
}

// lib/incremental-save-cleanup.ts
var { DatabaseSync } = await import("node:sqlite");
function cleanupUncommittedSession(claudeSessionId, projectPath) {
  const dbPath = path2.join(projectPath, ".mneme", "local.db");
  if (!fs2.existsSync(dbPath)) return { deleted: false, count: 0 };
  const db = new DatabaseSync(dbPath);
  try {
    const stateStmt = db.prepare(
      "SELECT is_committed FROM session_save_state WHERE claude_session_id = ?"
    );
    const state = stateStmt.get(claudeSessionId);
    if (state?.is_committed === 1) return { deleted: false, count: 0 };
    const mnemeSessionId = resolveMnemeSessionId(projectPath, claudeSessionId);
    const sessionFile = findSessionFileById(projectPath, mnemeSessionId);
    if (hasSessionSummary(sessionFile)) return { deleted: false, count: 0 };
    const countStmt = db.prepare(
      "SELECT COUNT(*) as count FROM interactions WHERE claude_session_id = ?"
    );
    const countResult = countStmt.get(claudeSessionId);
    const count = countResult?.count || 0;
    if (count > 0) {
      db.prepare("DELETE FROM interactions WHERE claude_session_id = ?").run(
        claudeSessionId
      );
    }
    db.prepare(
      "DELETE FROM session_save_state WHERE claude_session_id = ?"
    ).run(claudeSessionId);
    return { deleted: true, count };
  } catch (error) {
    console.error(`[mneme] Error cleaning up session: ${error}`);
    return { deleted: false, count: 0 };
  } finally {
    db.close();
  }
}
function cleanupStaleUncommittedSessions(projectPath, graceDays) {
  const dbPath = path2.join(projectPath, ".mneme", "local.db");
  if (!fs2.existsSync(dbPath))
    return { deletedSessions: 0, deletedInteractions: 0 };
  const db = new DatabaseSync(dbPath);
  let deletedSessions = 0;
  let deletedInteractions = 0;
  const normalizedGraceDays = Math.max(1, Math.floor(graceDays));
  try {
    const staleRows = db.prepare(
      `SELECT claude_session_id, mneme_session_id FROM session_save_state
         WHERE is_committed = 0 AND updated_at <= datetime('now', ?)`
    ).all(`-${normalizedGraceDays} days`);
    if (staleRows.length === 0)
      return { deletedSessions: 0, deletedInteractions: 0 };
    const deleteInteractionStmt = db.prepare(
      "DELETE FROM interactions WHERE claude_session_id = ?"
    );
    const countInteractionStmt = db.prepare(
      "SELECT COUNT(*) as count FROM interactions WHERE claude_session_id = ?"
    );
    const deleteStateStmt = db.prepare(
      "DELETE FROM session_save_state WHERE claude_session_id = ?"
    );
    for (const row of staleRows) {
      const sessionFile = findSessionFileById(
        projectPath,
        row.mneme_session_id
      );
      if (hasSessionSummary(sessionFile)) continue;
      const countResult = countInteractionStmt.get(row.claude_session_id);
      const count = countResult?.count || 0;
      if (count > 0) {
        deleteInteractionStmt.run(row.claude_session_id);
        deletedInteractions += count;
      }
      deleteStateStmt.run(row.claude_session_id);
      if (sessionFile && fs2.existsSync(sessionFile)) {
        try {
          fs2.unlinkSync(sessionFile);
          deletedSessions += 1;
        } catch {
        }
      }
      const linkPath = path2.join(
        projectPath,
        ".mneme",
        "session-links",
        `${row.claude_session_id.slice(0, 8)}.json`
      );
      if (fs2.existsSync(linkPath)) {
        try {
          fs2.unlinkSync(linkPath);
        } catch {
        }
      }
    }
    return { deletedSessions, deletedInteractions };
  } catch (error) {
    console.error(`[mneme] Error cleaning stale sessions: ${error}`);
    return { deletedSessions: 0, deletedInteractions: 0 };
  } finally {
    db.close();
  }
}
export {
  cleanupStaleUncommittedSessions,
  cleanupUncommittedSession
};
