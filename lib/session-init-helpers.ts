import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { findJsonFiles, nowISO, safeWriteJson } from "./utils.ts";

export function getGitInfo(cwd: string): {
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

export function getRecentSessions(
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

export function initRulesFile(filePath: string): void {
  if (fs.existsSync(filePath)) return;
  const now = nowISO();
  safeWriteJson(filePath, {
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
    items: [],
  });
}

export function initDatabase(mnemeDir: string, pluginRoot: string): void {
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

export function initTags(mnemeDir: string, pluginRoot: string): void {
  const tagsPath = path.join(mnemeDir, "tags.json");
  const defaultTagsPath = path.join(pluginRoot, "hooks", "default-tags.json");

  if (!fs.existsSync(tagsPath) && fs.existsSync(defaultTagsPath)) {
    fs.copyFileSync(defaultTagsPath, tagsPath);
    console.error(`[mneme] Tags master file created: ${tagsPath}`);
  }
}
