#!/usr/bin/env node
/**
 * mneme Session Finalization Module
 *
 * Handles session-end heavy processing in Node.js:
 * - Final incremental save
 * - Session status update (complete/uncommitted)
 * - Master session workPeriods.endedAt update
 * - Grace period cleanup for stale uncommitted sessions
 *
 * Usage:
 *   node session-finalize.js finalize --session-id <id> --cwd <path> --transcript <path> [--cleanup-policy <policy>] [--grace-days <n>]
 */

import * as fs from "node:fs";
import * as path from "node:path";

import {
  cleanupStaleUncommittedSessions,
  cleanupUncommittedSession,
  incrementalSave,
} from "../save/index.ts";
import {
  findJsonFiles,
  nowISO,
  safeReadJson,
  safeWriteJson,
} from "../utils.ts";

// ─── Types ───────────────────────────────────────────────────────────

interface SessionJson {
  id: string;
  sessionId: string;
  status: string | null;
  summary?: unknown;
  endedAt?: string;
  updatedAt?: string;
  interactions?: unknown;
  preCompactBackups?: unknown;
  uncommitted?: {
    endedAt: string;
    policy: string;
    cleanupAfter: string | null;
  };
  workPeriods?: WorkPeriod[];
}

interface WorkPeriod {
  claudeSessionId: string;
  startedAt: string;
  endedAt: string | null;
}

interface SessionLink {
  masterSessionId: string;
  claudeSessionId: string;
  linkedAt: string;
}

interface FinalizeResult {
  status: string;
  graceCleanup?: {
    deletedSessions: number;
    deletedInteractions: number;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────

function findSessionFile(sessionsDir: string, shortId: string): string | null {
  if (!fs.existsSync(sessionsDir)) return null;
  const files = findJsonFiles(sessionsDir);
  return files.find((f) => path.basename(f) === `${shortId}.json`) || null;
}

function computeCleanupAfter(graceDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + graceDays);
  return d.toISOString();
}

// ─── Main Finalize Logic ─────────────────────────────────────────────

async function sessionFinalize(
  sessionId: string,
  cwd: string,
  transcriptPath: string,
  cleanupPolicy: string,
  graceDays: number,
): Promise<FinalizeResult> {
  const mnemeDir = path.join(cwd, ".mneme");
  const sessionsDir = path.join(mnemeDir, "sessions");
  const sessionLinksDir = path.join(mnemeDir, "session-links");

  if (!fs.existsSync(mnemeDir)) {
    return { status: "skipped" };
  }

  const sessionShortId = sessionId.substring(0, 8);

  // Find session file (direct or via session-link)
  let sessionFile = findSessionFile(sessionsDir, sessionShortId);

  if (!sessionFile) {
    const linkFile = path.join(sessionLinksDir, `${sessionShortId}.json`);
    if (fs.existsSync(linkFile)) {
      const link = safeReadJson<SessionLink>(linkFile, {
        masterSessionId: "",
        claudeSessionId: "",
        linkedAt: "",
      });
      if (link.masterSessionId) {
        const masterFile = findSessionFile(sessionsDir, link.masterSessionId);
        if (masterFile) {
          sessionFile = masterFile;
        }
      }
    }
  }

  // Final incremental save (catch remaining interactions)
  if (transcriptPath && fs.existsSync(transcriptPath)) {
    try {
      await incrementalSave(sessionId, transcriptPath, cwd);
    } catch {
      // Non-critical
    }
  }

  const now = nowISO();

  // Update session JSON status
  if (sessionFile && fs.existsSync(sessionFile)) {
    const data = safeReadJson<SessionJson>(sessionFile, {} as SessionJson);
    const hasSummary = !!data.summary;

    if (!hasSummary) {
      // Uncommitted session
      const cleanupAfter =
        cleanupPolicy !== "immediate" ? computeCleanupAfter(graceDays) : null;

      data.status = "uncommitted";
      data.endedAt = now;
      data.updatedAt = now;
      data.uncommitted = {
        endedAt: now,
        policy: cleanupPolicy,
        cleanupAfter,
      };
      delete data.interactions;
      delete data.preCompactBackups;
      safeWriteJson(sessionFile, data);

      if (cleanupPolicy === "immediate") {
        const cleanupResult = cleanupUncommittedSession(sessionId, cwd);

        if (cleanupResult.deleted) {
          // Truly uncommitted - clean up session file and link
          console.error(
            `[mneme] Session ended without /mneme:save - cleaned up ${cleanupResult.count} interactions`,
          );
          fs.unlinkSync(sessionFile);
          const linkFile = path.join(sessionLinksDir, `${sessionShortId}.json`);
          if (fs.existsSync(linkFile)) {
            fs.unlinkSync(linkFile);
          }
          console.error(
            "[mneme] Session completed (not saved, cleaned up immediately)",
          );
        } else {
          // is_committed=1 in SQLite but summary missing in JSON - keep the file
          data.status = "complete";
          data.endedAt = now;
          data.updatedAt = now;
          delete data.uncommitted;
          delete data.interactions;
          delete data.preCompactBackups;
          safeWriteJson(sessionFile, data);
          console.error(
            "[mneme] Session completed (committed in SQLite, kept despite missing summary)",
          );
        }
      } else if (cleanupPolicy === "never") {
        console.error(
          "[mneme] Session completed (not saved, kept as uncommitted)",
        );
      } else {
        console.error(
          "[mneme] Session completed (not saved, marked uncommitted for grace cleanup)",
        );
      }
    } else {
      // Saved session
      data.status = "complete";
      data.endedAt = now;
      data.updatedAt = now;
      delete data.uncommitted;
      delete data.interactions;
      delete data.preCompactBackups;
      safeWriteJson(sessionFile, data);
      console.error(`[mneme] Session completed: ${sessionFile}`);
    }
  } else {
    console.error("[mneme] Session completed (no session file found)");
  }

  // Grace cleanup for stale uncommitted sessions
  let graceCleanup: FinalizeResult["graceCleanup"];
  if (cleanupPolicy === "grace") {
    const result = cleanupStaleUncommittedSessions(cwd, graceDays);
    if (result.deletedSessions > 0 || result.deletedInteractions > 0) {
      console.error(
        `[mneme] Grace cleanup removed ${result.deletedSessions} sessions and ${result.deletedInteractions} interactions`,
      );
      graceCleanup = result;
    }
  }

  // Update master session workPeriods.endedAt (if linked)
  const sessionLinkFile = path.join(sessionLinksDir, `${sessionShortId}.json`);
  if (fs.existsSync(sessionLinkFile)) {
    const link = safeReadJson<SessionLink>(sessionLinkFile, {
      masterSessionId: "",
      claudeSessionId: "",
      linkedAt: "",
    });
    if (link.masterSessionId) {
      const masterFile = findSessionFile(sessionsDir, link.masterSessionId);
      if (masterFile && fs.existsSync(masterFile)) {
        const master = safeReadJson<SessionJson>(masterFile, {} as SessionJson);
        if (master.workPeriods) {
          master.workPeriods = master.workPeriods.map((wp) => {
            if (wp.claudeSessionId === sessionId && wp.endedAt === null) {
              return { ...wp, endedAt: now };
            }
            return wp;
          });
          master.updatedAt = now;
          safeWriteJson(masterFile, master);
        }
      }
    }
  }

  return { status: "ok", graceCleanup };
}

// ─── CLI Entry Point ─────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const getArg = (name: string): string | undefined => {
    const index = args.indexOf(`--${name}`);
    return index !== -1 ? args[index + 1] : undefined;
  };

  const command = args[0];

  if (command === "finalize") {
    const sessionId = getArg("session-id") || "";
    const cwd = getArg("cwd") || process.cwd();
    const transcript = getArg("transcript") || "";
    const cleanupPolicy = getArg("cleanup-policy") || "grace";
    const graceDays = Number.parseInt(getArg("grace-days") || "7", 10);

    if (!sessionId) {
      console.error(
        "Usage: session-finalize.js finalize --session-id <id> --cwd <path> --transcript <path>",
      );
      process.exit(1);
    }

    const result = await sessionFinalize(
      sessionId,
      cwd,
      transcript,
      cleanupPolicy,
      graceDays,
    );
    console.log(JSON.stringify(result));
    process.exit(0);
  } else {
    console.error(
      "Usage: session-finalize.js finalize --session-id <id> --cwd <path> --transcript <path>",
    );
    process.exit(1);
  }
}

// Run if executed directly
const scriptPath = process.argv[1];
if (
  scriptPath &&
  (import.meta.url === `file://${scriptPath}` ||
    scriptPath.endsWith("session/finalize.js") ||
    scriptPath.endsWith("session/finalize.ts"))
) {
  main();
}
