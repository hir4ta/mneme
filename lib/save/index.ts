#!/usr/bin/env node
import "../suppress-sqlite-warning.js";

import * as fs from "node:fs";
import * as path from "node:path";

const { DatabaseSync } = await import("node:sqlite");

import {
  cleanupStaleUncommittedSessions,
  cleanupUncommittedSession,
} from "./cleanup.js";
import { getSaveState, initDatabase, updateSaveState } from "./db.js";
import { getGitInfo, resolveMnemeSessionId } from "./git.js";

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

  const dbPath = path.join(projectPath, ".mneme", "local.db");
  const db = initDatabase(dbPath);
  const mnemeSessionId = resolveMnemeSessionId(projectPath, claudeSessionId);
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

  if (interactions.length === 0) {
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

      if (interaction.assistant) {
        const assistantMetadata = JSON.stringify({
          toolsUsed: interaction.toolsUsed,
          toolDetails: interaction.toolDetails,
          ...(interaction.inPlanMode && { inPlanMode: true }),
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
          interaction.assistant,
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
