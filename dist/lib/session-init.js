#!/usr/bin/env node

// lib/session-init.ts
import * as fs3 from "node:fs";
import * as path3 from "node:path";

// lib/db.ts
import { execSync } from "node:child_process";

// lib/suppress-sqlite-warning.ts
var originalEmit = process.emit;
process.emit = (event, ...args) => {
  if (event === "warning" && typeof args[0] === "object" && args[0] !== null && "name" in args[0] && args[0].name === "ExperimentalWarning" && "message" in args[0] && typeof args[0].message === "string" && args[0].message.includes("SQLite")) {
    return false;
  }
  return originalEmit.apply(process, [event, ...args]);
};

// lib/db-init.ts
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
var { DatabaseSync } = await import("node:sqlite");
var __filename = fileURLToPath(import.meta.url);
var __dirname2 = dirname(__filename);

// lib/db-mutations.ts
var { DatabaseSync: DatabaseSync2 } = await import("node:sqlite");

// lib/db-queries.ts
var { DatabaseSync: DatabaseSync3 } = await import("node:sqlite");

// lib/db.ts
function getRepositoryInfo(projectPath) {
  const result = {
    repository: null,
    repository_url: null,
    repository_root: null
  };
  try {
    execSync("git rev-parse --git-dir", {
      cwd: projectPath,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    });
    result.repository_root = execSync("git rev-parse --show-toplevel", {
      cwd: projectPath,
      encoding: "utf-8"
    }).trim();
    try {
      result.repository_url = execSync("git remote get-url origin", {
        cwd: projectPath,
        encoding: "utf-8"
      }).trim();
      const match = result.repository_url.match(/[:/]([^/]+\/[^/]+?)(\.git)?$/);
      if (match) {
        result.repository = match[1].replace(/\.git$/, "");
      }
    } catch {
    }
  } catch {
  }
  return result;
}

// lib/session-init-helpers.ts
import { execSync as execSync2 } from "node:child_process";
import * as fs2 from "node:fs";
import * as path2 from "node:path";

// lib/utils.ts
import * as fs from "node:fs";
import * as path from "node:path";
function safeReadJson(filePath, fallback) {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return fallback;
  }
}
function safeWriteJson(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}
function nowISO() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function findJsonFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      results.push(...findJsonFiles(fullPath));
    } else if (item.name.endsWith(".json")) {
      results.push(fullPath);
    }
  }
  return results;
}

// lib/session-init-helpers.ts
function getGitInfo(cwd) {
  const result = { branch: "", userName: "unknown", userEmail: "" };
  try {
    execSync2("git rev-parse --git-dir", {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    });
    try {
      result.branch = execSync2("git rev-parse --abbrev-ref HEAD", {
        cwd,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"]
      }).trim();
    } catch {
    }
    try {
      result.userName = execSync2("git config user.name", {
        cwd,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"]
      }).trim() || "unknown";
    } catch {
    }
    try {
      result.userEmail = execSync2("git config user.email", {
        cwd,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"]
      }).trim();
    } catch {
    }
  } catch {
  }
  return result;
}
function getRecentSessions(sessionsDir, currentId, limit) {
  if (!fs2.existsSync(sessionsDir)) return [];
  const files = findJsonFiles(sessionsDir);
  const sessions = [];
  for (const file of files) {
    try {
      const data = JSON.parse(fs2.readFileSync(file, "utf-8"));
      if (data.id && data.id !== currentId && data.createdAt) {
        sessions.push({
          id: data.id,
          createdAt: data.createdAt,
          title: data.title || "",
          branch: data.context?.branch || ""
        });
      }
    } catch {
    }
  }
  sessions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return sessions.slice(0, limit);
}
function initRulesFile(filePath) {
  if (fs2.existsSync(filePath)) return;
  const now = nowISO();
  safeWriteJson(filePath, {
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
    items: []
  });
}
function initDatabase(mnemeDir, pluginRoot) {
  const dbPath = path2.join(mnemeDir, "local.db");
  const schemaPath = path2.join(pluginRoot, "lib", "schema.sql");
  if (!fs2.existsSync(dbPath) && fs2.existsSync(schemaPath)) {
    try {
      execSync2(`sqlite3 "${dbPath}" < "${schemaPath}"`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"]
      });
      console.error(`[mneme] Local database initialized: ${dbPath}`);
    } catch (e) {
      console.error(`[mneme] Database init failed: ${e}`);
    }
  }
  try {
    execSync2(
      `sqlite3 "${dbPath}" "PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;"`,
      {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"]
      }
    );
  } catch {
  }
}
function initTags(mnemeDir, pluginRoot) {
  const tagsPath = path2.join(mnemeDir, "tags.json");
  const defaultTagsPath = path2.join(pluginRoot, "hooks", "default-tags.json");
  if (!fs2.existsSync(tagsPath) && fs2.existsSync(defaultTagsPath)) {
    fs2.copyFileSync(defaultTagsPath, tagsPath);
    console.error(`[mneme] Tags master file created: ${tagsPath}`);
  }
}

// lib/session-init.ts
function sessionInit(sessionId, cwd) {
  const pluginRoot = path3.resolve(__dirname, "..");
  const mnemeDir = path3.join(cwd, ".mneme");
  const sessionsDir = path3.join(mnemeDir, "sessions");
  const rulesDir = path3.join(mnemeDir, "rules");
  const sessionLinksDir = path3.join(mnemeDir, "session-links");
  if (!fs3.existsSync(mnemeDir)) {
    console.error(
      "[mneme] Not initialized in this project. Run: npx @hir4ta/mneme --init"
    );
    return { additionalContext: "" };
  }
  const now = nowISO();
  const sessionShortId = sessionId ? sessionId.substring(0, 8) : "";
  const fileId = sessionShortId;
  const git = getGitInfo(cwd);
  const repoInfo = getRepositoryInfo(cwd);
  const projectName = path3.basename(cwd);
  let masterSessionId = "";
  let masterSessionPath = "";
  const sessionLinkFile = path3.join(sessionLinksDir, `${fileId}.json`);
  if (fs3.existsSync(sessionLinkFile)) {
    const link = safeReadJson(sessionLinkFile, {
      masterSessionId: "",
      claudeSessionId: "",
      linkedAt: ""
    });
    if (link.masterSessionId) {
      masterSessionId = link.masterSessionId;
      const allFiles = findJsonFiles(sessionsDir);
      masterSessionPath = allFiles.find((f) => path3.basename(f) === `${masterSessionId}.json`) || "";
      if (masterSessionPath) {
        console.error(`[mneme] Session linked to master: ${masterSessionId}`);
      }
    }
  }
  let sessionPath = "";
  let isResumed = false;
  if (fs3.existsSync(sessionsDir)) {
    const allFiles = findJsonFiles(sessionsDir);
    const existing = allFiles.find(
      (f) => path3.basename(f) === `${fileId}.json`
    );
    if (existing) {
      sessionPath = existing;
      isResumed = true;
    }
  }
  if (!sessionPath) {
    const dateParts = now.split("T")[0].split("-");
    const yearMonth = path3.join(sessionsDir, dateParts[0], dateParts[1]);
    ensureDir(yearMonth);
    sessionPath = path3.join(yearMonth, `${fileId}.json`);
  }
  let recentSessions = [];
  if (!isResumed) {
    recentSessions = getRecentSessions(sessionsDir, fileId, 3);
  }
  if (isResumed) {
    const data = safeReadJson(sessionPath, {});
    data.status = null;
    data.resumedAt = now;
    safeWriteJson(sessionPath, data);
    console.error(`[mneme] Session resumed (status reset): ${sessionPath}`);
  } else {
    const context = {
      projectDir: cwd,
      projectName
    };
    if (git.branch) context.branch = git.branch;
    if (repoInfo.repository) context.repository = repoInfo.repository;
    const user = { name: git.userName };
    if (git.userEmail) user.email = git.userEmail;
    context.user = user;
    const sessionJson = {
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
        toolUsage: []
      },
      files: [],
      status: null
    };
    safeWriteJson(sessionPath, sessionJson);
    console.error(`[mneme] Session initialized: ${sessionPath}`);
  }
  if (masterSessionId && masterSessionPath && fs3.existsSync(masterSessionPath)) {
    const claudeSessionId = sessionId || sessionShortId;
    const master = safeReadJson(
      masterSessionPath,
      {}
    );
    const workPeriods = master.workPeriods || [];
    const existingPeriod = workPeriods.some(
      (wp) => wp.claudeSessionId === claudeSessionId && wp.endedAt === null
    );
    if (!existingPeriod) {
      workPeriods.push({
        claudeSessionId,
        startedAt: now,
        endedAt: null
      });
      master.workPeriods = workPeriods;
      master.updatedAt = now;
      safeWriteJson(masterSessionPath, master);
      console.error(
        `[mneme] Master session workPeriods updated: ${masterSessionPath}`
      );
    } else {
      console.error(
        "[mneme] Master session workPeriod already exists for this Claude session"
      );
    }
  }
  initTags(mnemeDir, pluginRoot);
  initRulesFile(path3.join(rulesDir, "review-guidelines.json"));
  initRulesFile(path3.join(rulesDir, "dev-rules.json"));
  initDatabase(mnemeDir, pluginRoot);
  const sessionRelativePath = sessionPath.startsWith(cwd) ? sessionPath.substring(cwd.length + 1) : sessionPath;
  const usingMnemePath = path3.join(
    pluginRoot,
    "skills",
    "using-mneme",
    "SKILL.md"
  );
  const usingMnemeContent = fs3.existsSync(usingMnemePath) ? fs3.readFileSync(usingMnemePath, "utf-8") : "";
  const rulesSkillPath = path3.join(pluginRoot, "skills", "rules", "SKILL.md");
  const rulesSkillContent = fs3.existsSync(rulesSkillPath) ? fs3.readFileSync(rulesSkillPath, "utf-8") : "";
  let resumeNote = "";
  let needsSummary = false;
  if (isResumed) {
    resumeNote = " (Resumed)";
    const data = safeReadJson(sessionPath, {});
    if (!data.title) {
      needsSummary = true;
    }
  }
  let sessionInfo = `**Session:** ${fileId}${resumeNote}
**Claude Session ID:** ${sessionId}
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
    sessionInfo += `

---
**Recent sessions:**
${lines.join("\n")}
Continue from a previous session? Use \`/mneme:resume <id>\` or \`/mneme:resume\` to see more.`;
  }
  if (needsSummary) {
    sessionInfo += `

---
**Note:** This session was resumed but has no summary yet.
When you have enough context, consider creating a summary with \`/mneme:save\` to capture:
- What was accomplished in the previous session
- Key source knowledge (decision/pattern/rule)
- Unit regeneration needs (what should become approved units)
- Any ongoing work or next steps`;
  }
  const additionalContext = [sessionInfo, usingMnemeContent, rulesSkillContent].filter(Boolean).join("\n\n");
  return { additionalContext };
}
function main() {
  const args = process.argv.slice(2);
  const getArg = (name) => {
    const index = args.indexOf(`--${name}`);
    return index !== -1 ? args[index + 1] : void 0;
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
var scriptPath = process.argv[1];
if (scriptPath && (import.meta.url === `file://${scriptPath}` || scriptPath.endsWith("session-init.js") || scriptPath.endsWith("session-init.ts"))) {
  main();
}
export {
  getGitInfo,
  getRecentSessions,
  initDatabase,
  initRulesFile,
  initTags
};
