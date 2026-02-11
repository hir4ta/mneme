/**
 * Save interactions and mark session committed for mneme MCP Database Server
 */

import * as os from "node:os";
import { getTranscriptPath, parseTranscript } from "./transcript.js";
import type { ParsedInteraction } from "./types.js";
import { getDb, getProjectPath } from "./utils.js";

interface SaveInteractionsResult {
  success: boolean;
  savedCount: number;
  mergedFromBackup: number;
  message: string;
}

export async function saveInteractions(
  claudeSessionId: string,
  mnemeSessionId?: string,
): Promise<SaveInteractionsResult> {
  const transcriptPath = getTranscriptPath(claudeSessionId);
  if (!transcriptPath) {
    return {
      success: false,
      savedCount: 0,
      mergedFromBackup: 0,
      message: `Transcript not found for session: ${claudeSessionId}`,
    };
  }

  const database = getDb();
  if (!database) {
    return {
      success: false,
      savedCount: 0,
      mergedFromBackup: 0,
      message: "Database not available",
    };
  }

  const projectPath = getProjectPath();
  const sessionId = mnemeSessionId || claudeSessionId.slice(0, 8);

  let owner = "unknown";
  try {
    const { execSync } = await import("node:child_process");
    owner =
      execSync("git config user.name", {
        encoding: "utf8",
        cwd: projectPath,
      }).trim() || owner;
  } catch {
    try {
      owner = os.userInfo().username || owner;
    } catch {
      // keep default
    }
  }

  let repository = "";
  let repositoryUrl = "";
  let repositoryRoot = "";
  try {
    const { execSync } = await import("node:child_process");
    repositoryRoot = execSync("git rev-parse --show-toplevel", {
      encoding: "utf8",
      cwd: projectPath,
    }).trim();
    repositoryUrl = execSync("git remote get-url origin", {
      encoding: "utf8",
      cwd: projectPath,
    }).trim();
    const match = repositoryUrl.match(/[:/]([^/]+\/[^/]+?)(\.git)?$/);
    if (match) {
      repository = match[1].replace(/\.git$/, "");
    }
  } catch {
    // Not a git repo
  }

  const parsed = await parseTranscript(transcriptPath);

  let backupInteractions: ParsedInteraction[] = [];
  try {
    const stmt = database.prepare(`
      SELECT interactions FROM pre_compact_backups
      WHERE session_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `);
    const row = stmt.get(sessionId) as { interactions: string } | undefined;
    if (row?.interactions) {
      backupInteractions = JSON.parse(row.interactions);
    }
  } catch {
    // No backup or parse error
  }

  const lastBackupTs =
    backupInteractions.length > 0
      ? backupInteractions[backupInteractions.length - 1].timestamp
      : "1970-01-01T00:00:00Z";

  const trulyNew = parsed.interactions.filter(
    (i) => i.timestamp > lastBackupTs,
  );
  const merged = [...backupInteractions, ...trulyNew];

  const finalInteractions = merged.map((interaction, idx) => ({
    ...interaction,
    id: `int-${String(idx + 1).padStart(3, "0")}`,
  }));

  // Guard: don't delete existing data when there's nothing to insert
  if (finalInteractions.length === 0) {
    return {
      success: true,
      savedCount: 0,
      mergedFromBackup: backupInteractions.length,
      message:
        "No interactions to save (transcript may have no text user messages). Existing data preserved.",
    };
  }

  try {
    const deleteStmt = database.prepare(
      "DELETE FROM interactions WHERE claude_session_id = ?",
    );
    deleteStmt.run(claudeSessionId);
  } catch {
    // Ignore delete errors
  }

  const insertStmt = database.prepare(`
    INSERT INTO interactions (
      session_id, claude_session_id, project_path, repository, repository_url, repository_root,
      owner, role, content, thinking, timestamp, is_compact_summary
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let insertedCount = 0;
  for (const interaction of finalInteractions) {
    try {
      insertStmt.run(
        sessionId,
        claudeSessionId,
        projectPath,
        repository,
        repositoryUrl,
        repositoryRoot,
        owner,
        "user",
        interaction.user,
        null,
        interaction.timestamp,
        interaction.isCompactSummary ? 1 : 0,
      );
      insertedCount++;

      if (interaction.assistant) {
        insertStmt.run(
          sessionId,
          claudeSessionId,
          projectPath,
          repository,
          repositoryUrl,
          repositoryRoot,
          owner,
          "assistant",
          interaction.assistant,
          interaction.thinking || null,
          interaction.timestamp,
          0,
        );
        insertedCount++;
      }
    } catch {
      // Skip on insert error
    }
  }

  try {
    const clearBackupStmt = database.prepare(
      "DELETE FROM pre_compact_backups WHERE session_id = ?",
    );
    clearBackupStmt.run(sessionId);
  } catch {
    // Ignore
  }

  // Update session_save_state to prevent incremental-save from re-inserting
  try {
    const lastTimestamp =
      finalInteractions.length > 0
        ? finalInteractions[finalInteractions.length - 1].timestamp
        : null;

    const checkStmt = database.prepare(
      "SELECT 1 FROM session_save_state WHERE claude_session_id = ?",
    );
    const exists = checkStmt.get(claudeSessionId);

    if (exists) {
      const updateStmt = database.prepare(`
        UPDATE session_save_state
        SET last_saved_line = ?, last_saved_timestamp = ?, updated_at = datetime('now')
        WHERE claude_session_id = ?
      `);
      updateStmt.run(parsed.totalLines, lastTimestamp, claudeSessionId);
    } else {
      const insertStateStmt = database.prepare(`
        INSERT INTO session_save_state (claude_session_id, mneme_session_id, project_path, last_saved_line, last_saved_timestamp)
        VALUES (?, ?, ?, ?, ?)
      `);
      insertStateStmt.run(
        claudeSessionId,
        sessionId,
        projectPath,
        parsed.totalLines,
        lastTimestamp,
      );
    }
  } catch {
    // Ignore session_save_state errors
  }

  return {
    success: true,
    savedCount: insertedCount,
    mergedFromBackup: backupInteractions.length,
    message: `Saved ${insertedCount} interactions (${finalInteractions.length} turns, ${backupInteractions.length} from backup)`,
  };
}

export function markSessionCommitted(claudeSessionId: string): boolean {
  const database = getDb();
  if (!database) return false;

  try {
    const checkStmt = database.prepare(
      "SELECT 1 FROM session_save_state WHERE claude_session_id = ?",
    );
    const exists = checkStmt.get(claudeSessionId);

    if (exists) {
      const stmt = database.prepare(`
        UPDATE session_save_state
        SET is_committed = 1, updated_at = datetime('now')
        WHERE claude_session_id = ?
      `);
      stmt.run(claudeSessionId);
    } else {
      const projectPath = getProjectPath();
      const sessionId = claudeSessionId.slice(0, 8);
      const insertStmt = database.prepare(`
        INSERT INTO session_save_state (claude_session_id, mneme_session_id, project_path, is_committed)
        VALUES (?, ?, ?, 1)
      `);
      insertStmt.run(claudeSessionId, sessionId, projectPath);
    }
    return true;
  } catch {
    return false;
  }
}
