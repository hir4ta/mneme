/**
 * Utility functions for mneme MCP Database Server
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { DatabaseSync, type DatabaseSyncType, type RuleDoc } from "./types.js";

export function getProjectPath(): string {
  return process.env.MNEME_PROJECT_PATH || process.cwd();
}

export function getLocalDbPath(): string {
  return path.join(getProjectPath(), ".mneme", "local.db");
}

export function getMnemeDir(): string {
  return path.join(getProjectPath(), ".mneme");
}

export function readJsonFile<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

export function listJsonFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return listJsonFiles(fullPath);
    }
    return entry.isFile() && entry.name.endsWith(".json") ? [fullPath] : [];
  });
}

export function readRuleItems(
  ruleType: "dev-rules" | "review-guidelines",
): Array<Record<string, unknown>> {
  const filePath = path.join(getMnemeDir(), "rules", `${ruleType}.json`);
  const parsed = readJsonFile<RuleDoc>(filePath);
  const items = parsed?.items ?? parsed?.rules;
  return Array.isArray(items) ? items : [];
}

export function readSessionsById(): Map<string, Record<string, unknown>> {
  const sessionsDir = path.join(getMnemeDir(), "sessions");
  const map = new Map<string, Record<string, unknown>>();
  for (const filePath of listJsonFiles(sessionsDir)) {
    const parsed = readJsonFile<Record<string, unknown>>(filePath);
    const id = typeof parsed?.id === "string" ? parsed.id : "";
    if (!id) continue;
    map.set(id, parsed);
  }
  return map;
}

// Database connection (lazy initialization)
let db: DatabaseSyncType | null = null;

export function getDb(): DatabaseSyncType | null {
  if (db) return db;

  const dbPath = getLocalDbPath();
  if (!fs.existsSync(dbPath)) {
    return null;
  }

  try {
    db = new DatabaseSync(dbPath);
    db.exec("PRAGMA journal_mode = WAL");
    return db;
  } catch {
    return null;
  }
}
