import fs from "node:fs";
import path from "node:path";

const RULE_PRIORITIES = new Set(["p0", "p1", "p2"]);
const PATTERN_TYPES = new Set(["good", "bad", "error-solution"]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function listJsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listJsonFiles(fullPath);
    return entry.isFile() && entry.name.endsWith(".json") ? [fullPath] : [];
  });
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasNonEmptyTags(value) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => hasText(item))
  );
}

function validateDecisions(mnemeDir, issues) {
  const decisionDir = path.join(mnemeDir, "decisions");
  const files = listJsonFiles(decisionDir);
  for (const file of files) {
    let parsed;
    try {
      parsed = readJson(file);
    } catch (error) {
      issues.push({ file, message: `Invalid JSON (${String(error)})` });
      continue;
    }

    if (!hasText(parsed.id)) issues.push({ file, message: "Missing id" });
    if (!hasText(parsed.title)) issues.push({ file, message: "Missing title" });
    if (!hasText(parsed.decision)) {
      issues.push({ file, message: "Missing decision" });
    }
    if (!hasText(parsed.reasoning)) {
      issues.push({ file, message: "Missing reasoning" });
    }
    if (!hasNonEmptyTags(parsed.tags)) {
      issues.push({ file, message: "Missing tags (at least one required)" });
    }
  }
}

function validatePatterns(mnemeDir, issues) {
  const patternDir = path.join(mnemeDir, "patterns");
  const files = listJsonFiles(patternDir);
  for (const file of files) {
    let parsed;
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
      if (!hasText(item.id)) {
        issues.push({ file: pointer, message: "Missing id" });
      }
      if (!hasText(item.type) || !PATTERN_TYPES.has(item.type)) {
        issues.push({
          file: pointer,
          message: "Invalid type (good|bad|error-solution required)",
        });
      }
      if (!hasText(item.title) && !hasText(item.description)) {
        issues.push({
          file: pointer,
          message: "Missing title/description",
        });
      }
      if (!hasNonEmptyTags(item.tags)) {
        issues.push({
          file: pointer,
          message: "Missing tags (at least one required)",
        });
      }
    }
  }
}

function validateRuleFile(file, expectedType, issues) {
  if (!fs.existsSync(file)) {
    issues.push({ file, message: "File not found" });
    return;
  }

  let parsed;
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
    if (!hasText(item.id)) {
      issues.push({ file: pointer, message: "Missing id" });
    }
    if (!hasText(item.key)) {
      issues.push({ file: pointer, message: "Missing key" });
    }
    const text = item.text ?? item.rule ?? item.title;
    if (!hasText(text)) {
      issues.push({ file: pointer, message: "Missing text/rule/title" });
    }
    if (!hasText(item.category)) {
      issues.push({ file: pointer, message: "Missing category" });
    }
    if (!hasNonEmptyTags(item.tags)) {
      issues.push({
        file: pointer,
        message: "Missing tags (at least one required)",
      });
    }

    const status = hasText(item.status) ? item.status : "active";
    if (status === "active") {
      if (!hasText(item.priority) || !RULE_PRIORITIES.has(item.priority)) {
        issues.push({
          file: pointer,
          message: "Missing/invalid priority for active rule (p0|p1|p2)",
        });
      }
      if (!hasText(item.rationale)) {
        issues.push({
          file: pointer,
          message: "Missing rationale for active rule",
        });
      }
    }
  }
}

function validateRules(mnemeDir, issues) {
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

function main() {
  const projectRoot = process.env.MNEME_PROJECT_ROOT || process.cwd();
  const mnemeDir = path.join(projectRoot, ".mneme");
  const issues = [];

  validateDecisions(mnemeDir, issues);
  validatePatterns(mnemeDir, issues);
  validateRules(mnemeDir, issues);

  if (issues.length === 0) {
    console.log("OK: source artifacts are valid");
    process.exit(0);
  }

  console.error("NG: source artifact validation failed");
  for (const issue of issues) {
    console.error(`- ${issue.file}: ${issue.message}`);
  }
  process.exit(1);
}

main();
