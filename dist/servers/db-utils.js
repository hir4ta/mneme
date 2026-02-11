// servers/db-utils.ts
import * as fs from "node:fs";
import * as path from "node:path";

// servers/db-types.ts
var { DatabaseSync } = await import("node:sqlite");

// servers/db-utils.ts
function getProjectPath() {
  return process.env.MNEME_PROJECT_PATH || process.cwd();
}
function getLocalDbPath() {
  return path.join(getProjectPath(), ".mneme", "local.db");
}
function getMnemeDir() {
  return path.join(getProjectPath(), ".mneme");
}
function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}
function listJsonFiles(dir) {
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
function readRuleItems(ruleType) {
  const filePath = path.join(getMnemeDir(), "rules", `${ruleType}.json`);
  const parsed = readJsonFile(filePath);
  const items = parsed?.items ?? parsed?.rules;
  return Array.isArray(items) ? items : [];
}
function readSessionsById() {
  const sessionsDir = path.join(getMnemeDir(), "sessions");
  const map = /* @__PURE__ */ new Map();
  for (const filePath of listJsonFiles(sessionsDir)) {
    const parsed = readJsonFile(filePath);
    const id = typeof parsed?.id === "string" ? parsed.id : "";
    if (!id) continue;
    map.set(id, parsed);
  }
  return map;
}
var db = null;
function getDb() {
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
export {
  getDb,
  getLocalDbPath,
  getMnemeDir,
  getProjectPath,
  listJsonFiles,
  readJsonFile,
  readRuleItems,
  readSessionsById
};
