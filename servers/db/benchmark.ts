/**
 * Search benchmark for mneme MCP Database Server
 */

import * as path from "node:path";

import { searchKnowledge } from "../../lib/search/core.js";
import type { BenchmarkQuery } from "./types.js";
import {
  getDb,
  getMnemeDir,
  getProjectPath,
  readJsonFile,
  readRuleItems,
} from "./utils.js";

export function runSearchBenchmark(limit: number): {
  queryCount: number;
  hits: number;
  recall: number;
  details: Array<{
    query: string;
    matched: boolean;
    topResult: string;
    resultCount: number;
  }>;
} {
  const queryPath = path.join(
    getProjectPath(),
    "scripts",
    "search-benchmark.queries.json",
  );
  const queryDoc = readJsonFile<{ queries?: BenchmarkQuery[] }>(queryPath);
  const queries = Array.isArray(queryDoc?.queries) ? queryDoc.queries : [];
  const details: Array<{
    query: string;
    matched: boolean;
    topResult: string;
    resultCount: number;
  }> = [];
  if (queries.length === 0) {
    return { queryCount: 0, hits: 0, recall: 0, details };
  }

  const mnemeDir = getMnemeDir();
  const database = getDb();
  let hits = 0;

  for (const item of queries) {
    const results = searchKnowledge({
      query: item.query,
      mnemeDir,
      projectPath: getProjectPath(),
      database,
      limit,
    });
    const corpus = results
      .map(
        (result) =>
          `${result.title} ${result.snippet} ${result.matchedFields.join(" ")}`,
      )
      .join(" ")
      .toLowerCase();
    const matched = item.expectedTerms.some((term) =>
      corpus.includes(String(term).toLowerCase()),
    );
    if (matched) hits += 1;
    details.push({
      query: item.query,
      matched,
      topResult: results[0] ? `${results[0].type}:${results[0].id}` : "none",
      resultCount: results.length,
    });
  }

  return {
    queryCount: queries.length,
    hits,
    recall: queries.length > 0 ? hits / queries.length : 0,
    details,
  };
}

interface LintIssue {
  ruleType: string;
  id: string;
  level: "error" | "warning";
  message: string;
}

export function lintRules(ruleType?: string): {
  checked: string[];
  totalIssues: number;
  errors: number;
  warnings: number;
  issues: LintIssue[];
} {
  const targets =
    ruleType && ruleType !== "all"
      ? [ruleType as "dev-rules" | "review-guidelines"]
      : (["dev-rules", "review-guidelines"] as const);
  const issues: LintIssue[] = [];

  for (const type of targets) {
    const items = readRuleItems(type);
    const seenKeys = new Set<string>();
    for (const raw of items) {
      const id = typeof raw.id === "string" ? raw.id : "(unknown)";
      const text =
        typeof raw.text === "string"
          ? raw.text
          : typeof raw.rule === "string"
            ? raw.rule
            : "";
      const priority =
        typeof raw.priority === "string" ? raw.priority.toLowerCase() : "";
      const tags = Array.isArray(raw.tags) ? raw.tags : [];
      const key = `${type}:${String(raw.key || id)}`;

      if (!raw.id)
        issues.push({
          ruleType: type,
          id,
          level: "error",
          message: "Missing id",
        });
      if (!raw.key)
        issues.push({
          ruleType: type,
          id,
          level: "error",
          message: "Missing key",
        });
      if (!text.trim())
        issues.push({
          ruleType: type,
          id,
          level: "error",
          message: "Missing text/rule",
        });
      if (!raw.category)
        issues.push({
          ruleType: type,
          id,
          level: "warning",
          message: "Missing category",
        });
      if (tags.length === 0)
        issues.push({
          ruleType: type,
          id,
          level: "warning",
          message: "Missing tags",
        });
      if (!["p0", "p1", "p2"].includes(priority))
        issues.push({
          ruleType: type,
          id,
          level: "error",
          message: "Invalid priority (p0|p1|p2 required)",
        });
      if (seenKeys.has(key))
        issues.push({
          ruleType: type,
          id,
          level: "warning",
          message: "Duplicate key",
        });
      seenKeys.add(key);
      if (text.trim().length > 180)
        issues.push({
          ruleType: type,
          id,
          level: "warning",
          message: "Rule text too long (consider splitting)",
        });
    }
  }

  return {
    checked: [...targets],
    totalIssues: issues.length,
    errors: issues.filter((i) => i.level === "error").length,
    warnings: issues.filter((i) => i.level === "warning").length,
    issues,
  };
}
