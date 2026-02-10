#!/usr/bin/env node
/**
 * mneme Session Initialization Module
 *
 * Handles session-start heavy processing in Node.js:
 * - Git info retrieval
 * - Recent sessions search
 * - Session JSON creation
 * - Master session workPeriods update
 * - additionalContext building
 * - Tags/rules/database initialization
 *
 * Usage:
 *   node session-init.js init --session-id <id> --cwd <path>
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { getRepositoryInfo } from "./db.ts";
import {
  ensureDir,
  findJsonFiles,
  nowISO,
  safeReadJson,
  safeWriteJson,
} from "./utils.ts";

// ─── Types ───────────────────────────────────────────────────────────

interface SessionJson {
  id: string;
  sessionId: string;
  createdAt: string;
  title: string;
  tags: string[];
  context: Record<string, unknown>;
  metrics: {
    userMessages: number;
    assistantResponses: number;
    thinkingBlocks: number;
    toolUsage: string[];
  };
  files: string[];
  status: null;
  resumedAt?: string;
  summary?: unknown;
  workPeriods?: WorkPeriod[];
  updatedAt?: string;
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

interface InitResult {
  additionalContext: string;
}

// ─── Git Helpers ─────────────────────────────────────────────────────

function getGitInfo(cwd: string): {
  branch: string;
  userName: string;
  userEmail: string;
} {
  const result = { branch: "", userName: "unknown", userEmail: "" };
  try {
    execSync("git rev-parse --git-dir", {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    try {
      result.branch = execSync("git rev-parse --abbrev-ref HEAD", {
        cwd,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();
    } catch {}
    try {
      result.userName =
        execSync("git config user.name", {
          cwd,
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
        }).trim() || "unknown";
    } catch {}
    try {
      result.userEmail = execSync("git config user.email", {
        cwd,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();
    } catch {}
  } catch {
    // Not a git repository
  }
  return result;
}

// ─── Recent Sessions ─────────────────────────────────────────────────

function getRecentSessions(
  sessionsDir: string,
  currentId: string,
  limit: number,
): { id: string; createdAt: string; title: string; branch: string }[] {
  if (!fs.existsSync(sessionsDir)) return [];

  const files = findJsonFiles(sessionsDir);
  const sessions: {
    id: string;
    createdAt: string;
    title: string;
    branch: string;
  }[] = [];

  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(file, "utf-8"));
      if (data.id && data.id !== currentId && data.createdAt) {
        sessions.push({
          id: data.id,
          createdAt: data.createdAt,
          title: data.title || "",
          branch: data.context?.branch || "",
        });
      }
    } catch {
      // Skip invalid files
    }
  }

  sessions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return sessions.slice(0, limit);
}

// ─── Rules Initialization ────────────────────────────────────────────

function initRulesFile(filePath: string): void {
  if (fs.existsSync(filePath)) return;
  const now = nowISO();
  safeWriteJson(filePath, {
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
    items: [],
  });
}

// ─── Database Initialization ─────────────────────────────────────────

function initDatabase(mnemeDir: string, pluginRoot: string): void {
  const dbPath = path.join(mnemeDir, "local.db");
  const schemaPath = path.join(pluginRoot, "lib", "schema.sql");

  if (!fs.existsSync(dbPath) && fs.existsSync(schemaPath)) {
    try {
      execSync(`sqlite3 "${dbPath}" < "${schemaPath}"`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      console.error(`[mneme] Local database initialized: ${dbPath}`);
    } catch (e) {
      console.error(`[mneme] Database init failed: ${e}`);
    }
  }

  // Configure pragmas
  try {
    execSync(
      `sqlite3 "${dbPath}" "PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;"`,
      {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
  } catch {
    // Non-critical
  }
}

// ─── Tags Initialization ─────────────────────────────────────────────

function initTags(mnemeDir: string, pluginRoot: string): void {
  const tagsPath = path.join(mnemeDir, "tags.json");
  const defaultTagsPath = path.join(pluginRoot, "hooks", "default-tags.json");

  if (!fs.existsSync(tagsPath) && fs.existsSync(defaultTagsPath)) {
    fs.copyFileSync(defaultTagsPath, tagsPath);
    console.error(`[mneme] Tags master file created: ${tagsPath}`);
  }
}

// ─── Main Init Logic ─────────────────────────────────────────────────

function sessionInit(sessionId: string, cwd: string): InitResult {
  const pluginRoot = path.resolve(__dirname, "..");
  const mnemeDir = path.join(cwd, ".mneme");
  const sessionsDir = path.join(mnemeDir, "sessions");
  const rulesDir = path.join(mnemeDir, "rules");
  const sessionLinksDir = path.join(mnemeDir, "session-links");

  // Check if mneme is initialized
  if (!fs.existsSync(mnemeDir)) {
    console.error(
      "[mneme] Not initialized in this project. Run: npx @hir4ta/mneme --init",
    );
    return { additionalContext: "" };
  }

  const now = nowISO();
  const sessionShortId = sessionId ? sessionId.substring(0, 8) : "";
  const fileId = sessionShortId;

  // Git info
  const git = getGitInfo(cwd);
  const repoInfo = getRepositoryInfo(cwd);
  const projectName = path.basename(cwd);

  // Check session-links for master session
  let masterSessionId = "";
  let masterSessionPath = "";
  const sessionLinkFile = path.join(sessionLinksDir, `${fileId}.json`);

  if (fs.existsSync(sessionLinkFile)) {
    const link = safeReadJson<SessionLink>(sessionLinkFile, {
      masterSessionId: "",
      claudeSessionId: "",
      linkedAt: "",
    });
    if (link.masterSessionId) {
      masterSessionId = link.masterSessionId;
      const allFiles = findJsonFiles(sessionsDir);
      masterSessionPath =
        allFiles.find((f) => path.basename(f) === `${masterSessionId}.json`) ||
        "";
      if (masterSessionPath) {
        console.error(`[mneme] Session linked to master: ${masterSessionId}`);
      }
    }
  }

  // Find existing session file or create new one
  let sessionPath = "";
  let isResumed = false;

  if (fs.existsSync(sessionsDir)) {
    const allFiles = findJsonFiles(sessionsDir);
    const existing = allFiles.find(
      (f) => path.basename(f) === `${fileId}.json`,
    );
    if (existing) {
      sessionPath = existing;
      isResumed = true;
    }
  }

  if (!sessionPath) {
    const dateParts = now.split("T")[0].split("-");
    const yearMonth = path.join(sessionsDir, dateParts[0], dateParts[1]);
    ensureDir(yearMonth);
    sessionPath = path.join(yearMonth, `${fileId}.json`);
  }

  // Recent sessions (for new sessions only)
  let recentSessions: ReturnType<typeof getRecentSessions> = [];
  if (!isResumed) {
    recentSessions = getRecentSessions(sessionsDir, fileId, 3);
  }

  // Initialize or update session JSON
  if (isResumed) {
    const data = safeReadJson<SessionJson>(sessionPath, {} as SessionJson);
    data.status = null;
    data.resumedAt = now;
    safeWriteJson(sessionPath, data);
    console.error(`[mneme] Session resumed (status reset): ${sessionPath}`);
  } else {
    const context: Record<string, unknown> = {
      projectDir: cwd,
      projectName,
    };
    if (git.branch) context.branch = git.branch;
    if (repoInfo.repository) context.repository = repoInfo.repository;
    const user: Record<string, string> = { name: git.userName };
    if (git.userEmail) user.email = git.userEmail;
    context.user = user;

    const sessionJson: SessionJson = {
      id: fileId,
      sessionId: sessionId || sessionShortId,
      createdAt: now,
      title: "",
      tags: [],
      context,
      metrics: {
        userMessages: 0,
        assistantResponses: 0,
        thinkingBlocks: 0,
        toolUsage: [],
      },
      files: [],
      status: null,
    };
    safeWriteJson(sessionPath, sessionJson);
    console.error(`[mneme] Session initialized: ${sessionPath}`);
  }

  // Update master session workPeriods (if linked)
  if (
    masterSessionId &&
    masterSessionPath &&
    fs.existsSync(masterSessionPath)
  ) {
    const claudeSessionId = sessionId || sessionShortId;
    const master = safeReadJson<SessionJson>(
      masterSessionPath,
      {} as SessionJson,
    );
    const workPeriods: WorkPeriod[] = master.workPeriods || [];
    const existingPeriod = workPeriods.some(
      (wp) => wp.claudeSessionId === claudeSessionId && wp.endedAt === null,
    );

    if (!existingPeriod) {
      workPeriods.push({
        claudeSessionId,
        startedAt: now,
        endedAt: null,
      });
      master.workPeriods = workPeriods;
      master.updatedAt = now;
      safeWriteJson(masterSessionPath, master);
      console.error(
        `[mneme] Master session workPeriods updated: ${masterSessionPath}`,
      );
    } else {
      console.error(
        "[mneme] Master session workPeriod already exists for this Claude session",
      );
    }
  }

  // Initialize tags, rules, database
  initTags(mnemeDir, pluginRoot);
  initRulesFile(path.join(rulesDir, "review-guidelines.json"));
  initRulesFile(path.join(rulesDir, "dev-rules.json"));
  initDatabase(mnemeDir, pluginRoot);

  // Build additionalContext
  const sessionRelativePath = sessionPath.startsWith(cwd)
    ? sessionPath.substring(cwd.length + 1)
    : sessionPath;

  // Read using-mneme SKILL.md
  const usingMnemePath = path.join(
    pluginRoot,
    "skills",
    "using-mneme",
    "SKILL.md",
  );
  const usingMnemeContent = fs.existsSync(usingMnemePath)
    ? fs.readFileSync(usingMnemePath, "utf-8")
    : "";

  let resumeNote = "";
  let needsSummary = false;
  if (isResumed) {
    resumeNote = " (Resumed)";
    const data = safeReadJson<SessionJson>(sessionPath, {} as SessionJson);
    if (!data.title) {
      needsSummary = true;
    }
  }

  let sessionInfo = `**Session:** ${fileId}${resumeNote}
**Path:** ${sessionRelativePath}

Sessions are saved:
- **Automatically** before Auto-Compact (context 95% full)
- **Manually** via \`/mneme:save\` or asking "save the session"`;

  if (!isResumed && recentSessions.length > 0) {
    const lines = recentSessions.map((s, i) => {
      const datePart = s.createdAt.split("T")[0] || "";
      const title = s.title || "no title";
      const branch = s.branch || "no branch";
      return `  ${i + 1}. [${s.id}] ${title} (${datePart}, ${branch})`;
    });
    sessionInfo += `\n\n---\n**Recent sessions:**\n${lines.join("\n")}\nContinue from a previous session? Use \`/mneme:resume <id>\` or \`/mneme:resume\` to see more.`;
  }

  if (needsSummary) {
    sessionInfo += `\n\n---\n**Note:** This session was resumed but has no summary yet.
When you have enough context, consider creating a summary with \`/mneme:save\` to capture:
- What was accomplished in the previous session
- Key source knowledge (decision/pattern/rule)
- Unit regeneration needs (what should become approved units)
- Any ongoing work or next steps`;
  }

  const additionalContext = `${sessionInfo}\n\n${usingMnemeContent}`;

  return { additionalContext };
}

// ─── CLI Entry Point ─────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const getArg = (name: string): string | undefined => {
    const index = args.indexOf(`--${name}`);
    return index !== -1 ? args[index + 1] : undefined;
  };

  const command = args[0];

  if (command === "init") {
    const sessionId = getArg("session-id") || "";
    const cwd = getArg("cwd") || process.cwd();

    const result = sessionInit(sessionId, cwd);
    console.log(JSON.stringify(result));
    process.exit(0);
  } else {
    console.error("Usage: session-init.js init --session-id <id> --cwd <path>");
    process.exit(1);
  }
}

// Run if executed directly
const scriptPath = process.argv[1];
if (
  scriptPath &&
  (import.meta.url === `file://${scriptPath}` ||
    scriptPath.endsWith("session-init.js") ||
    scriptPath.endsWith("session-init.ts"))
) {
  main();
}
