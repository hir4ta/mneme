/**
 * Source artifact validation for mneme MCP Database Server.
 * Validates decisions, patterns, and rules in .mneme/ directory.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ok } from "./types.js";
import { getMnemeDir, listJsonFiles } from "./utils.js";

interface ValidationIssue {
  file: string;
  message: string;
}

interface ValidationResult {
  valid: boolean;
  issueCount: number;
  issues: ValidationIssue[];
}

const RULE_PRIORITIES = new Set(["p0", "p1", "p2"]);
const PATTERN_TYPES = new Set(["good", "bad", "error-solution"]);

function readJson(filePath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasNonEmptyTags(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => hasText(item))
  );
}

function validateDecisions(mnemeDir: string, issues: ValidationIssue[]): void {
  const files = listJsonFiles(path.join(mnemeDir, "decisions"));
  for (const file of files) {
    let parsed: Record<string, unknown>;
    try {
      parsed = readJson(file);
    } catch (error) {
      issues.push({ file, message: `Invalid JSON (${String(error)})` });
      continue;
    }

    if (!hasText(parsed.id)) issues.push({ file, message: "Missing id" });
    if (!hasText(parsed.title)) issues.push({ file, message: "Missing title" });
    if (!hasText(parsed.decision))
      issues.push({ file, message: "Missing decision" });
    if (!hasText(parsed.reasoning))
      issues.push({ file, message: "Missing reasoning" });
    if (!hasNonEmptyTags(parsed.tags))
      issues.push({ file, message: "Missing tags (at least one required)" });
  }
}

function validatePatterns(mnemeDir: string, issues: ValidationIssue[]): void {
  const files = listJsonFiles(path.join(mnemeDir, "patterns"));
  for (const file of files) {
    let parsed: Record<string, unknown>;
    try {
      parsed = readJson(file);
    } catch (error) {
      issues.push({ file, message: `Invalid JSON (${String(error)})` });
      continue;
    }

    const items = Array.isArray(parsed.items)
      ? parsed.items
      : Array.isArray(parsed.patterns)
        ? parsed.patterns
        : null;

    if (!items) {
      issues.push({ file, message: "Missing items/patterns array" });
      continue;
    }

    for (const [index, item] of items.entries()) {
      const pointer = `${file}#${index}`;
      if (!hasText(item.id))
        issues.push({ file: pointer, message: "Missing id" });
      if (!hasText(item.type) || !PATTERN_TYPES.has(item.type)) {
        issues.push({
          file: pointer,
          message: "Invalid type (good|bad|error-solution required)",
        });
      }
      if (item.type === "error-solution") {
        if (!hasText(item.errorPattern))
          issues.push({
            file: pointer,
            message: "error-solution pattern missing errorPattern",
          });
        if (!hasText(item.solution))
          issues.push({
            file: pointer,
            message: "error-solution pattern missing solution",
          });
      }
      if (!hasText(item.title) && !hasText(item.description))
        issues.push({ file: pointer, message: "Missing title/description" });
      if (!hasNonEmptyTags(item.tags))
        issues.push({
          file: pointer,
          message: "Missing tags (at least one required)",
        });
    }
  }
}

function validateRuleFile(
  file: string,
  expectedType: string,
  issues: ValidationIssue[],
): void {
  if (!fs.existsSync(file)) return;

  let parsed: Record<string, unknown>;
  try {
    parsed = readJson(file);
  } catch (error) {
    issues.push({ file, message: `Invalid JSON (${String(error)})` });
    return;
  }

  const items = Array.isArray(parsed.items)
    ? parsed.items
    : Array.isArray(parsed.rules)
      ? parsed.rules
      : null;

  if (!items) {
    issues.push({ file, message: "Missing items/rules array" });
    return;
  }

  if (hasText(parsed.ruleType) && parsed.ruleType !== expectedType) {
    issues.push({
      file,
      message: `ruleType mismatch (${parsed.ruleType} != ${expectedType})`,
    });
  }

  for (const [index, item] of items.entries()) {
    const pointer = `${file}#${index}`;
    if (!hasText(item.id))
      issues.push({ file: pointer, message: "Missing id" });
    if (!hasText(item.key))
      issues.push({ file: pointer, message: "Missing key" });
    const text = item.text ?? item.rule ?? item.title;
    if (!hasText(text))
      issues.push({ file: pointer, message: "Missing text/rule/title" });
    if (!hasText(item.category))
      issues.push({ file: pointer, message: "Missing category" });
    if (!hasNonEmptyTags(item.tags))
      issues.push({
        file: pointer,
        message: "Missing tags (at least one required)",
      });

    const status = hasText(item.status) ? item.status : "active";
    if (status === "active") {
      if (!hasText(item.priority) || !RULE_PRIORITIES.has(item.priority))
        issues.push({
          file: pointer,
          message: "Missing/invalid priority for active rule (p0|p1|p2)",
        });
      if (!hasText(item.rationale))
        issues.push({
          file: pointer,
          message: "Missing rationale for active rule",
        });
    }
  }
}

function validateRules(mnemeDir: string, issues: ValidationIssue[]): void {
  validateRuleFile(
    path.join(mnemeDir, "rules", "dev-rules.json"),
    "dev-rules",
    issues,
  );
  validateRuleFile(
    path.join(mnemeDir, "rules", "review-guidelines.json"),
    "review-guidelines",
    issues,
  );
}

function validateIdUniqueness(
  mnemeDir: string,
  issues: ValidationIssue[],
): void {
  const idMap = new Map<string, string[]>();

  const track = (id: string, location: string) => {
    const existing = idMap.get(id) || [];
    existing.push(location);
    idMap.set(id, existing);
  };

  for (const file of listJsonFiles(path.join(mnemeDir, "decisions"))) {
    try {
      const parsed = readJson(file);
      if (hasText(parsed.id)) track(parsed.id, file);
    } catch {
      /* skip */
    }
  }

  for (const file of listJsonFiles(path.join(mnemeDir, "patterns"))) {
    try {
      const parsed = readJson(file);
      const items =
        (parsed.items as unknown[]) || (parsed.patterns as unknown[]) || [];
      for (const item of items as Array<Record<string, unknown>>) {
        if (hasText(item.id)) track(item.id, `${file}#${item.id}`);
      }
    } catch {
      /* skip */
    }
  }

  for (const ruleFile of ["dev-rules", "review-guidelines"]) {
    const file = path.join(mnemeDir, "rules", `${ruleFile}.json`);
    if (!fs.existsSync(file)) continue;
    try {
      const parsed = readJson(file);
      const items =
        (parsed.items as unknown[]) || (parsed.rules as unknown[]) || [];
      for (const item of items as Array<Record<string, unknown>>) {
        if (hasText(item.id)) track(item.id, `${file}#${item.id}`);
      }
    } catch {
      /* skip */
    }
  }

  for (const [id, files] of idMap) {
    if (files.length > 1) {
      issues.push({
        file: files.join(", "),
        message: `Duplicate ID "${id}" found in ${files.length} locations`,
      });
    }
  }
}

function validateTagExistence(
  mnemeDir: string,
  issues: ValidationIssue[],
): void {
  const tagsPath = path.join(mnemeDir, "tags.json");
  if (!fs.existsSync(tagsPath)) return;

  let masterTags: Record<string, unknown>;
  try {
    masterTags = readJson(tagsPath);
  } catch {
    return;
  }

  const tags = masterTags.tags as Array<Record<string, unknown>> | undefined;
  const validTagIds = new Set(
    (tags || []).map((t) => t.id).filter((id) => typeof id === "string"),
  );
  if (validTagIds.size === 0) return;

  const checkTags = (fileTags: unknown[], location: string) => {
    for (const tag of fileTags) {
      if (typeof tag === "string" && !validTagIds.has(tag)) {
        issues.push({
          file: location,
          message: `Unknown tag "${tag}" (not in tags.json)`,
        });
      }
    }
  };

  for (const file of listJsonFiles(path.join(mnemeDir, "decisions"))) {
    try {
      const parsed = readJson(file);
      if (Array.isArray(parsed.tags)) checkTags(parsed.tags, file);
    } catch {
      /* skip */
    }
  }

  for (const file of listJsonFiles(path.join(mnemeDir, "patterns"))) {
    try {
      const parsed = readJson(file);
      const items =
        (parsed.items as unknown[]) || (parsed.patterns as unknown[]) || [];
      for (const item of items as Array<Record<string, unknown>>) {
        if (Array.isArray(item.tags))
          checkTags(item.tags, `${file}#${item.id || "?"}`);
      }
    } catch {
      /* skip */
    }
  }

  for (const ruleFile of ["dev-rules", "review-guidelines"]) {
    const file = path.join(mnemeDir, "rules", `${ruleFile}.json`);
    if (!fs.existsSync(file)) continue;
    try {
      const parsed = readJson(file);
      const items =
        (parsed.items as unknown[]) || (parsed.rules as unknown[]) || [];
      for (const item of items as Array<Record<string, unknown>>) {
        if (Array.isArray(item.tags))
          checkTags(item.tags, `${file}#${item.id || "?"}`);
      }
    } catch {
      /* skip */
    }
  }
}

export function validateSources(mnemeDir: string): ValidationResult {
  if (!fs.existsSync(mnemeDir)) {
    return { valid: true, issueCount: 0, issues: [] };
  }

  const issues: ValidationIssue[] = [];
  validateDecisions(mnemeDir, issues);
  validatePatterns(mnemeDir, issues);
  validateRules(mnemeDir, issues);
  validateIdUniqueness(mnemeDir, issues);
  validateTagExistence(mnemeDir, issues);

  return {
    valid: issues.length === 0,
    issueCount: issues.length,
    issues,
  };
}

export function registerValidateSourcesTool(server: McpServer): void {
  server.registerTool(
    "mneme_validate_sources",
    {
      description:
        "Validate source artifacts (decisions, patterns, rules) for required fields and consistency.",
      inputSchema: {},
    },
    async () => {
      const mnemeDir = getMnemeDir();
      const result = validateSources(mnemeDir);
      return ok(JSON.stringify(result, null, 2));
    },
  );
}
