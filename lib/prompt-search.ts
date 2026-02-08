#!/usr/bin/env node

import * as fs from "node:fs";
import * as path from "node:path";
import { searchKnowledge } from "./search-core.js";

// Suppress Node.js SQLite experimental warning.
const originalEmit = process.emit;
// @ts-expect-error - runtime patch for warning suppression.
process.emit = (event, ...args) => {
  if (
    event === "warning" &&
    typeof args[0] === "object" &&
    args[0] !== null &&
    "name" in args[0] &&
    (args[0] as { name: string }).name === "ExperimentalWarning" &&
    "message" in args[0] &&
    typeof (args[0] as { message: string }).message === "string" &&
    (args[0] as { message: string }).message.includes("SQLite")
  ) {
    return false;
  }
  return originalEmit.apply(process, [event, ...args] as unknown as Parameters<
    typeof process.emit
  >);
};

const { DatabaseSync } = await import("node:sqlite");

function getArg(args: string[], name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
}

function main() {
  const args = process.argv.slice(2);
  const query = getArg(args, "query");
  const projectPath = getArg(args, "project");
  const limit = Number.parseInt(getArg(args, "limit") || "5", 10);

  if (!query || !projectPath) {
    console.log(
      JSON.stringify({ success: false, error: "Missing required args" }),
    );
    process.exit(1);
  }

  const mnemeDir = path.join(projectPath, ".mneme");
  const dbPath = path.join(mnemeDir, "local.db");
  let database: InstanceType<typeof DatabaseSync> | null = null;

  try {
    if (fs.existsSync(dbPath)) {
      database = new DatabaseSync(dbPath);
      database.exec("PRAGMA journal_mode = WAL");
    }

    const results = searchKnowledge({
      query,
      mnemeDir,
      projectPath,
      database,
      limit: Number.isFinite(limit) ? Math.max(1, Math.min(limit, 10)) : 5,
    });

    console.log(JSON.stringify({ success: true, results }));
  } catch (error) {
    console.log(
      JSON.stringify({ success: false, error: (error as Error).message }),
    );
    process.exit(1);
  } finally {
    database?.close();
  }
}

main();
