// lib/suppress-sqlite-warning.ts
var originalEmit = process.emit;
process.emit = (event, ...args) => {
  if (event === "warning" && typeof args[0] === "object" && args[0] !== null && "name" in args[0] && args[0].name === "ExperimentalWarning" && "message" in args[0] && typeof args[0].message === "string" && args[0].message.includes("SQLite")) {
    return false;
  }
  return originalEmit.apply(process, [event, ...args]);
};

// lib/db-init.ts
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
var { DatabaseSync } = await import("node:sqlite");
var __filename = fileURLToPath(import.meta.url);
var __dirname = dirname(__filename);
function getLocalDbPath(projectPath) {
  return join(projectPath, ".mneme", "local.db");
}
function configurePragmas(db) {
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA synchronous = NORMAL");
}
function initLocalDatabase(projectPath) {
  const mnemeDir = join(projectPath, ".mneme");
  if (!existsSync(mnemeDir)) {
    mkdirSync(mnemeDir, { recursive: true });
  }
  const dbPath = getLocalDbPath(projectPath);
  const db = new DatabaseSync(dbPath);
  configurePragmas(db);
  const schemaPath = join(__dirname, "schema.sql");
  if (existsSync(schemaPath)) {
    const schema = readFileSync(schemaPath, "utf-8");
    db.exec(schema);
  }
  return db;
}
function openLocalDatabase(projectPath) {
  const dbPath = getLocalDbPath(projectPath);
  if (!existsSync(dbPath)) {
    return null;
  }
  const db = new DatabaseSync(dbPath);
  configurePragmas(db);
  return db;
}
export {
  getLocalDbPath,
  initLocalDatabase,
  openLocalDatabase
};
