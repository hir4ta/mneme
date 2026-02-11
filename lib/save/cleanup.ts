import "../suppress-sqlite-warning.js";

import * as fs from "node:fs";
import * as path from "node:path";

const { DatabaseSync } = await import("node:sqlite");

import {
  findSessionFileById,
  hasSessionSummary,
  resolveMnemeSessionId,
} from "./git.js";

export function cleanupUncommittedSession(
  claudeSessionId: string,
  projectPath: string,
): { deleted: boolean; count: number } {
  const dbPath = path.join(projectPath, ".mneme", "local.db");
  if (!fs.existsSync(dbPath)) return { deleted: false, count: 0 };

  const db = new DatabaseSync(dbPath);
  try {
    const stateStmt = db.prepare(
      "SELECT is_committed FROM session_save_state WHERE claude_session_id = ?",
    );
    const state = stateStmt.get(claudeSessionId) as
      | { is_committed: number }
      | undefined;
    if (state?.is_committed === 1) return { deleted: false, count: 0 };

    const mnemeSessionId = resolveMnemeSessionId(projectPath, claudeSessionId);
    const sessionFile = findSessionFileById(projectPath, mnemeSessionId);
    if (hasSessionSummary(sessionFile)) return { deleted: false, count: 0 };

    const countStmt = db.prepare(
      "SELECT COUNT(*) as count FROM interactions WHERE claude_session_id = ?",
    );
    const countResult = countStmt.get(claudeSessionId) as { count: number };
    const count = countResult?.count || 0;

    if (count > 0) {
      db.prepare("DELETE FROM interactions WHERE claude_session_id = ?").run(
        claudeSessionId,
      );
    }
    db.prepare(
      "DELETE FROM session_save_state WHERE claude_session_id = ?",
    ).run(claudeSessionId);

    return { deleted: true, count };
  } catch (error) {
    console.error(`[mneme] Error cleaning up session: ${error}`);
    return { deleted: false, count: 0 };
  } finally {
    db.close();
  }
}

export function cleanupStaleUncommittedSessions(
  projectPath: string,
  graceDays: number,
): { deletedSessions: number; deletedInteractions: number } {
  const dbPath = path.join(projectPath, ".mneme", "local.db");
  if (!fs.existsSync(dbPath))
    return { deletedSessions: 0, deletedInteractions: 0 };

  const db = new DatabaseSync(dbPath);
  let deletedSessions = 0;
  let deletedInteractions = 0;
  const normalizedGraceDays = Math.max(1, Math.floor(graceDays));

  try {
    const staleRows = db
      .prepare(
        `SELECT claude_session_id, mneme_session_id FROM session_save_state
         WHERE is_committed = 0 AND updated_at <= datetime('now', ?)`,
      )
      .all(`-${normalizedGraceDays} days`) as Array<{
      claude_session_id: string;
      mneme_session_id: string;
    }>;

    if (staleRows.length === 0)
      return { deletedSessions: 0, deletedInteractions: 0 };

    const deleteInteractionStmt = db.prepare(
      "DELETE FROM interactions WHERE claude_session_id = ?",
    );
    const countInteractionStmt = db.prepare(
      "SELECT COUNT(*) as count FROM interactions WHERE claude_session_id = ?",
    );
    const deleteStateStmt = db.prepare(
      "DELETE FROM session_save_state WHERE claude_session_id = ?",
    );

    for (const row of staleRows) {
      const sessionFile = findSessionFileById(
        projectPath,
        row.mneme_session_id,
      );
      if (hasSessionSummary(sessionFile)) continue;

      const countResult = countInteractionStmt.get(row.claude_session_id) as
        | { count: number }
        | undefined;
      const count = countResult?.count || 0;
      if (count > 0) {
        deleteInteractionStmt.run(row.claude_session_id);
        deletedInteractions += count;
      }
      deleteStateStmt.run(row.claude_session_id);

      if (sessionFile && fs.existsSync(sessionFile)) {
        try {
          fs.unlinkSync(sessionFile);
          deletedSessions += 1;
        } catch {
          /* ignore */
        }
      }

      const linkPath = path.join(
        projectPath,
        ".mneme",
        "session-links",
        `${row.claude_session_id.slice(0, 8)}.json`,
      );
      if (fs.existsSync(linkPath)) {
        try {
          fs.unlinkSync(linkPath);
        } catch {
          /* ignore */
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
