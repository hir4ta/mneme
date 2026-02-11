import fs from "node:fs";
import path from "node:path";
import { type QueryableDb, searchKnowledge } from "../lib/search-core.js";

// Suppress Node.js SQLite experimental warning.
const originalEmit = process.emit;
// @ts-expect-error runtime patch
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

interface BenchmarkQuery {
  query: string;
  expectedTerms: string[];
}

interface QuerySet {
  queries: BenchmarkQuery[];
}

function normalize(value: string): string {
  return value.toLowerCase();
}

function main() {
  const projectRoot = process.cwd();
  const mnemeDir = path.join(projectRoot, ".mneme");
  const queryPath = path.join(
    projectRoot,
    "scripts",
    "search-benchmark.queries.json",
  );

  if (!fs.existsSync(queryPath)) {
    throw new Error(`Query file not found: ${queryPath}`);
  }
  if (!fs.existsSync(mnemeDir)) {
    throw new Error(`.mneme directory not found: ${mnemeDir}`);
  }

  const querySet = JSON.parse(fs.readFileSync(queryPath, "utf-8")) as QuerySet;
  const dbPath = path.join(mnemeDir, "local.db");
  const db = fs.existsSync(dbPath) ? new DatabaseSync(dbPath) : null;

  try {
    if (db) {
      db.exec("PRAGMA journal_mode = WAL");
    }

    let hitCount = 0;
    const lines: string[] = [];

    for (const item of querySet.queries) {
      const results = searchKnowledge({
        query: item.query,
        mnemeDir,
        projectPath: projectRoot,
        database: db as QueryableDb | null,
        limit: 5,
      });

      const corpus = results
        .map(
          (result) =>
            `${result.title} ${result.snippet} ${result.matchedFields.join(" ")}`,
        )
        .join(" ");
      const corpusLower = normalize(corpus);
      const matched = item.expectedTerms.some((term) =>
        corpusLower.includes(normalize(term)),
      );

      if (matched) {
        hitCount += 1;
      }

      lines.push(
        [
          matched ? "PASS" : "MISS",
          item.query,
          `results=${results.length}`,
          `top=${results[0]?.type ?? "none"}:${results[0]?.id ?? "-"}`,
        ].join(" | "),
      );
    }

    const recall = querySet.queries.length
      ? hitCount / querySet.queries.length
      : 0;

    console.log("Search benchmark");
    console.log(`queries: ${querySet.queries.length}`);
    console.log(`hits: ${hitCount}`);
    console.log(`estimated_recall: ${(recall * 100).toFixed(1)}%`);
    console.log("");
    for (const line of lines) {
      console.log(line);
    }
  } finally {
    db?.close();
  }
}

main();
