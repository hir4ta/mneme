// lib/session-init-helpers.ts
import { execSync } from "node:child_process";
import * as fs2 from "node:fs";
import * as path2 from "node:path";

// lib/utils.ts
import * as fs from "node:fs";
import * as path from "node:path";
function safeWriteJson(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
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
    execSync("git rev-parse --git-dir", {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    });
    try {
      result.branch = execSync("git rev-parse --abbrev-ref HEAD", {
        cwd,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"]
      }).trim();
    } catch {
    }
    try {
      result.userName = execSync("git config user.name", {
        cwd,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"]
      }).trim() || "unknown";
    } catch {
    }
    try {
      result.userEmail = execSync("git config user.email", {
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
      execSync(`sqlite3 "${dbPath}" < "${schemaPath}"`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"]
      });
      console.error(`[mneme] Local database initialized: ${dbPath}`);
    } catch (e) {
      console.error(`[mneme] Database init failed: ${e}`);
    }
  }
  try {
    execSync(
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
export {
  getGitInfo,
  getRecentSessions,
  initDatabase,
  initRulesFile,
  initTags
};
