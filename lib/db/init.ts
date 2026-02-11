import "../suppress-sqlite-warning.js";

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const { DatabaseSync } = await import("node:sqlite");
type DatabaseSyncType = InstanceType<typeof DatabaseSync>;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function getLocalDbPath(projectPath: string): string {
  return join(projectPath, ".mneme", "local.db");
}

function configurePragmas(db: DatabaseSyncType): void {
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA synchronous = NORMAL");
}

export function initLocalDatabase(projectPath: string): DatabaseSyncType {
  const mnemeDir = join(projectPath, ".mneme");
  if (!existsSync(mnemeDir)) {
    mkdirSync(mnemeDir, { recursive: true });
  }

  const dbPath = getLocalDbPath(projectPath);
  const db = new DatabaseSync(dbPath);

  configurePragmas(db);

  const schemaPath = join(__dirname, "..", "schema.sql");
  if (existsSync(schemaPath)) {
    const schema = readFileSync(schemaPath, "utf-8");
    db.exec(schema);
  }

  return db;
}

export function openLocalDatabase(
  projectPath: string,
): DatabaseSyncType | null {
  const dbPath = getLocalDbPath(projectPath);
  if (!existsSync(dbPath)) {
    return null;
  }
  const db = new DatabaseSync(dbPath);
  configurePragmas(db);
  return db;
}
