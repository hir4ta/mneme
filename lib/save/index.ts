#!/usr/bin/env node
import "../suppress-sqlite-warning.js";

import * as fs from "node:fs";
import * as path from "node:path";

const { DatabaseSync } = await import("node:sqlite");

import {
  cleanupStaleUncommittedSessions,
  cleanupUncommittedSession,
} from "./cleanup.js";
import {
  getSaveState,
  initDatabase,
  updateSaveState,
  updateSaveStateMnemeSessionId,
} from "./db.js";
import {
  findSessionFileById,
  getGitInfo,
  resolveMnemeSessionId,
} from "./git.js";

export {
  cleanupStaleUncommittedSessions,
  cleanupUncommittedSession,
} from "./cleanup.js";

import { parseTranscriptIncremental } from "./parser.js";
import type { ParsedInteraction, SaveResult } from "./types.js";

export type { SaveResult } from "./types.js";

function normalizeFilePath(
  absPath: string,
  projectPath: string,
): string | null {
  if (!absPath.startsWith(projectPath)) return null;
  return absPath.slice(projectPath.length).replace(/^\//, "");
}

const IGNORED_PREFIXES = [
  "node_modules/",
  "dist/",
  ".git/",
  ".mneme/",
  ".claude/",
];
const IGNORED_FILES = ["package-lock.json", "pnpm-lock.yaml", "yarn.lock"];

/**
 * Process pending-compact breadcrumb to create session-link before resolution.
 * This handles the race condition where the Stop hook fires before SessionStart.
 * SessionStart's handlePendingCompact will also run (idempotent) to handle
 * workPeriods and cleanup.
 */
function ensureCompactSessionLink(
  projectPath: string,
  currentClaudeSessionId: string,
): void {
  const mnemeDir = path.join(projectPath, ".mneme");
  const pendingFile = path.join(mnemeDir, ".pending-compact.json");
  if (!fs.existsSync(pendingFile)) return;

  const sessionLinksDir = path.join(mnemeDir, "session-links");
  const linkFile = path.join(sessionLinksDir, `${currentClaudeSessionId}.json`);

  // Skip if link already exists (SessionStart already processed it)
  if (fs.existsSync(linkFile)) return;

  try {
    const pending = JSON.parse(fs.readFileSync(pendingFile, "utf8"));
    const oldClaudeSessionId: string = pending.claudeSessionId || "";
    const timestamp: string = pending.timestamp || "";

    // Check staleness (5 minutes)
    if (timestamp) {
      const age = Date.now() - new Date(timestamp).getTime();
      if (age > 5 * 60 * 1000) return;
    }

    if (!oldClaudeSessionId || oldClaudeSessionId === currentClaudeSessionId) {
      return;
    }

    // Resolve master session ID (follows session-link chain)
    const masterSessionId = resolveMnemeSessionId(
      projectPath,
      oldClaudeSessionId,
    );

    // Create session-link
    if (!fs.existsSync(sessionLinksDir)) {
      fs.mkdirSync(sessionLinksDir, { recursive: true });
    }

    fs.writeFileSync(
      linkFile,
      JSON.stringify(
        {
          masterSessionId,
          claudeSessionId: currentClaudeSessionId,
          linkedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );

    console.error(
      `[mneme] Save: compact continuation linked: ${currentClaudeSessionId} → ${masterSessionId}`,
    );
    // Don't delete breadcrumb — SessionStart handles cleanup + workPeriods
  } catch (e) {
    console.error(`[mneme] Error in ensureCompactSessionLink: ${e}`);
  }
}

/**
 * Detect if this session is a compact continuation (plan mode → new session).
 * Returns the master mneme session ID if detected, null otherwise.
 */
function detectCompactContinuation(
  interactions: ParsedInteraction[],
  projectPath: string,
): string | null {
  const compactInteraction = interactions.find((i) => i.isCompactSummary);
  if (!compactInteraction?.user) return null;

  // Extract old transcript UUID from "read the full transcript at: .../UUID.jsonl"
  const match = compactInteraction.user.match(
    /read the full transcript at:.*?\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl/,
  );
  if (!match) return null;

  const oldClaudeSessionId = match[1];
  return resolveMnemeSessionId(projectPath, oldClaudeSessionId);
}

/**
 * Create a session link and update the master session's workPeriods.
 */
function linkToMasterSession(
  projectPath: string,
  claudeSessionId: string,
  masterMnemeSessionId: string,
): void {
  // Create session-links directory
  const sessionLinksDir = path.join(projectPath, ".mneme", "session-links");
  if (!fs.existsSync(sessionLinksDir)) {
    fs.mkdirSync(sessionLinksDir, { recursive: true });
  }

  // Write session link file
  const linkFile = path.join(sessionLinksDir, `${claudeSessionId}.json`);
  if (!fs.existsSync(linkFile)) {
    fs.writeFileSync(
      linkFile,
      JSON.stringify(
        {
          masterSessionId: masterMnemeSessionId,
          claudeSessionId,
          linkedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
    console.error(
      `[mneme] Compact continuation linked: ${claudeSessionId} → ${masterMnemeSessionId}`,
    );
  }

  // Update master session's workPeriods
  const masterFile = findSessionFileById(projectPath, masterMnemeSessionId);
  if (masterFile && fs.existsSync(masterFile)) {
    try {
      const master = JSON.parse(fs.readFileSync(masterFile, "utf8"));
      const workPeriods: Array<{
        claudeSessionId: string;
        startedAt: string;
        endedAt: string | null;
      }> = master.workPeriods || [];
      const alreadyLinked = workPeriods.some(
        (wp) => wp.claudeSessionId === claudeSessionId,
      );
      if (!alreadyLinked) {
        workPeriods.push({
          claudeSessionId,
          startedAt: new Date().toISOString(),
          endedAt: null,
        });
        master.workPeriods = workPeriods;
        master.updatedAt = new Date().toISOString();
        fs.writeFileSync(masterFile, JSON.stringify(master, null, 2));
      }
    } catch {
      // Non-critical
    }
  }
}

function isIgnoredPath(relativePath: string): boolean {
  return (
    IGNORED_PREFIXES.some((p) => relativePath.startsWith(p)) ||
    IGNORED_FILES.includes(relativePath)
  );
}

function indexFilePaths(
  fileIndexStmt: { run: (...args: unknown[]) => void },
  interaction: ParsedInteraction,
  mnemeSessionId: string,
  projectPath: string,
): void {
  const seen = new Set<string>();
  const add = (absPath: string, toolName: string) => {
    const normalized = normalizeFilePath(absPath, projectPath);
    if (!normalized || isIgnoredPath(normalized) || seen.has(normalized))
      return;
    seen.add(normalized);
    try {
      fileIndexStmt.run(
        mnemeSessionId,
        projectPath,
        normalized,
        toolName,
        interaction.timestamp,
      );
    } catch {
      // Ignore duplicate or constraint errors
    }
  };

  for (const td of interaction.toolDetails) {
    if (typeof td.detail === "string" && td.detail.startsWith("/")) {
      add(td.detail, td.name);
    }
  }
  if (interaction.toolResults) {
    for (const tr of interaction.toolResults) {
      if (tr.filePath?.startsWith("/")) {
        add(tr.filePath, tr.toolName || "");
      }
    }
  }
}

export async function incrementalSave(
  claudeSessionId: string,
  transcriptPath: string,
  projectPath: string,
): Promise<SaveResult> {
  if (!claudeSessionId || !transcriptPath || !projectPath) {
    return {
      success: false,
      savedCount: 0,
      totalCount: 0,
      message: "Missing required parameters",
    };
  }

  if (!fs.existsSync(transcriptPath)) {
    return {
      success: false,
      savedCount: 0,
      totalCount: 0,
      message: `Transcript not found: ${transcriptPath}`,
    };
  }

  // Ensure session-link exists before resolution (handles Stop-before-SessionStart race)
  ensureCompactSessionLink(projectPath, claudeSessionId);

  const dbPath = path.join(projectPath, ".mneme", "local.db");
  const db = initDatabase(dbPath);
  let mnemeSessionId = resolveMnemeSessionId(projectPath, claudeSessionId);
  const saveState = getSaveState(
    db,
    claudeSessionId,
    mnemeSessionId,
    projectPath,
  );
  const { interactions, totalLines } = await parseTranscriptIncremental(
    transcriptPath,
    saveState.lastSavedLine,
  );

  // Detect compact continuation: link new Claude session → old mneme session
  if (saveState.lastSavedLine === 0 && interactions.length > 0) {
    const masterSessionId = detectCompactContinuation(
      interactions,
      projectPath,
    );
    if (masterSessionId && masterSessionId !== mnemeSessionId) {
      linkToMasterSession(projectPath, claudeSessionId, masterSessionId);
      mnemeSessionId = masterSessionId;
      updateSaveStateMnemeSessionId(db, claudeSessionId, masterSessionId);
    }
  }

  if (interactions.length === 0) {
    updateSaveState(
      db,
      claudeSessionId,
      saveState.lastSavedTimestamp || "",
      totalLines,
    );
    db.close();
    return {
      success: true,
      savedCount: 0,
      totalCount: totalLines,
      message: "No new interactions to save",
    };
  }

  const { owner, repository, repositoryUrl, repositoryRoot } =
    await getGitInfo(projectPath);

  const insertStmt = db.prepare(`
    INSERT INTO interactions (
      session_id, claude_session_id, project_path, repository, repository_url, repository_root,
      owner, role, content, thinking, tool_calls, timestamp, is_compact_summary
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const fileIndexStmt = db.prepare(`
    INSERT INTO file_index (session_id, project_path, file_path, tool_name, timestamp)
    VALUES (?, ?, ?, ?, ?)
  `);

  let insertedCount = 0;
  let lastTimestamp = saveState.lastSavedTimestamp || "";

  for (const interaction of interactions) {
    try {
      const metadata = JSON.stringify({
        toolsUsed: interaction.toolsUsed,
        toolDetails: interaction.toolDetails,
        ...(interaction.inPlanMode && { inPlanMode: true }),
        ...(interaction.isContinuation && { isContinuation: true }),
        ...(interaction.slashCommand && {
          slashCommand: interaction.slashCommand,
        }),
        ...(interaction.toolResults?.length && {
          toolResults: interaction.toolResults,
        }),
        ...(interaction.progressEvents?.length && {
          progressEvents: interaction.progressEvents,
        }),
      });

      // Skip user row for continuation interactions (orphaned assistant messages)
      if (!interaction.isContinuation) {
        insertStmt.run(
          mnemeSessionId,
          claudeSessionId,
          projectPath,
          repository,
          repositoryUrl,
          repositoryRoot,
          owner,
          "user",
          interaction.user,
          null,
          metadata,
          interaction.timestamp,
          interaction.isCompactSummary ? 1 : 0,
        );
        insertedCount++;
      }

      if (interaction.assistant || interaction.thinking) {
        const assistantMetadata = JSON.stringify({
          toolsUsed: interaction.toolsUsed,
          toolDetails: interaction.toolDetails,
          ...(interaction.inPlanMode && { inPlanMode: true }),
          ...(interaction.isContinuation && { isContinuation: true }),
          ...(interaction.toolResults?.length && {
            toolResults: interaction.toolResults,
          }),
          ...(interaction.progressEvents?.length && {
            progressEvents: interaction.progressEvents,
          }),
        });

        insertStmt.run(
          mnemeSessionId,
          claudeSessionId,
          projectPath,
          repository,
          repositoryUrl,
          repositoryRoot,
          owner,
          "assistant",
          interaction.assistant || "",
          interaction.thinking || null,
          assistantMetadata,
          interaction.timestamp,
          0,
        );
        insertedCount++;
      }

      // Index file paths for session recommendation
      indexFilePaths(fileIndexStmt, interaction, mnemeSessionId, projectPath);

      lastTimestamp = interaction.timestamp;
    } catch (error) {
      console.error(`[mneme] Error inserting interaction: ${error}`);
    }
  }

  updateSaveState(db, claudeSessionId, lastTimestamp, totalLines);
  db.close();

  return {
    success: true,
    savedCount: insertedCount,
    totalCount: totalLines,
    message: `Saved ${insertedCount} messages (${interactions.length} turns)`,
  };
}

export function markSessionCommitted(
  claudeSessionId: string,
  projectPath: string,
): boolean {
  const dbPath = path.join(projectPath, ".mneme", "local.db");
  if (!fs.existsSync(dbPath)) return false;

  const db = new DatabaseSync(dbPath);
  try {
    const stmt = db.prepare(`
      UPDATE session_save_state
      SET is_committed = 1, updated_at = datetime('now')
      WHERE claude_session_id = ?
    `);
    stmt.run(claudeSessionId);
    return true;
  } catch {
    return false;
  } finally {
    db.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const getArg = (name: string): string | undefined => {
    const index = args.indexOf(`--${name}`);
    return index !== -1 ? args[index + 1] : undefined;
  };

  const command = args[0];

  if (command === "save") {
    const sessionId = getArg("session");
    const transcriptPath = getArg("transcript");
    const projectPath = getArg("project");
    if (!sessionId || !transcriptPath || !projectPath) {
      console.error(
        "Usage: incremental-save.js save --session <id> --transcript <path> --project <path>",
      );
      process.exit(1);
    }
    const result = await incrementalSave(
      sessionId,
      transcriptPath,
      projectPath,
    );
    console.log(JSON.stringify(result));
    process.exit(result.success ? 0 : 1);
  } else if (command === "commit") {
    const sessionId = getArg("session");
    const projectPath = getArg("project");
    if (!sessionId || !projectPath) {
      console.error(
        "Usage: incremental-save.js commit --session <id> --project <path>",
      );
      process.exit(1);
    }
    const success = markSessionCommitted(sessionId, projectPath);
    console.log(JSON.stringify({ success }));
    process.exit(success ? 0 : 1);
  } else if (command === "cleanup") {
    const sessionId = getArg("session");
    const projectPath = getArg("project");
    if (!sessionId || !projectPath) {
      console.error(
        "Usage: incremental-save.js cleanup --session <id> --project <path>",
      );
      process.exit(1);
    }
    const result = cleanupUncommittedSession(sessionId, projectPath);
    console.log(JSON.stringify(result));
    process.exit(0);
  } else if (command === "cleanup-stale") {
    const projectPath = getArg("project");
    const graceDays = Number.parseInt(getArg("grace-days") || "7", 10);
    if (!projectPath) {
      console.error(
        "Usage: incremental-save.js cleanup-stale --project <path> [--grace-days <n>]",
      );
      process.exit(1);
    }
    const result = cleanupStaleUncommittedSessions(projectPath, graceDays);
    console.log(JSON.stringify(result));
    process.exit(0);
  } else {
    console.error("Commands: save, commit, cleanup");
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
