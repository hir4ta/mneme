import fs from "node:fs";
import path from "node:path";
import { getCurrentUser } from "../../../lib/db.js";

/**
 * Sanitize ID parameter to prevent path traversal
 */
export function sanitizeId(id: string): string {
  const normalized = decodeURIComponent(id).trim();
  if (!normalized) return "";
  if (
    normalized.includes("..") ||
    normalized.includes("/") ||
    normalized.includes("\\")
  ) {
    return "";
  }
  return /^[a-zA-Z0-9:_-]+$/.test(normalized) ? normalized : "";
}

/**
 * Safe JSON file parser with error logging
 */
export function safeParseJsonFile<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (error) {
    console.error(`Failed to parse JSON: ${filePath}`, error);
    return null;
  }
}

// Get project root from environment variable
export const getProjectRoot = () => {
  return process.env.MNEME_PROJECT_ROOT || process.cwd();
};

export const getMnemeDir = () => {
  return path.join(getProjectRoot(), ".mneme");
};

export const ALLOWED_RULE_FILES = new Set(["dev-rules", "review-guidelines"]);

export const listJsonFiles = (dir: string): string[] => {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return listJsonFiles(fullPath);
    }
    if (entry.isFile() && entry.name.endsWith(".json")) {
      return [fullPath];
    }
    return [];
  });
};

export function writeAuditLog(entry: {
  entity: "session" | "decision" | "pattern" | "rule" | "unit" | "dev-rule";
  action: "create" | "update" | "delete";
  targetId: string;
  detail?: Record<string, unknown>;
}) {
  try {
    const now = new Date();
    const auditDir = path.join(getMnemeDir(), "audit");
    fs.mkdirSync(auditDir, { recursive: true });
    const auditFile = path.join(
      auditDir,
      `${now.toISOString().slice(0, 10)}.jsonl`,
    );
    const payload = {
      timestamp: now.toISOString(),
      actor: getCurrentUser(),
      ...entry,
    };
    fs.appendFileSync(auditFile, `${JSON.stringify(payload)}\n`);
  } catch (error) {
    console.error("Failed to write audit log:", error);
  }
}

// Dev rule item type (replaces former Unit concept)
export type DevRuleStatus = "draft" | "approved" | "rejected";
export type DevRuleType = "decision" | "pattern" | "rule";

export interface DevRuleItem {
  id: string;
  type: DevRuleType;
  title: string;
  summary: string;
  tags: string[];
  status: DevRuleStatus;
  priority?: string;
  sourceFile: string;
  createdAt: string;
  updatedAt?: string;
}

export const listDatedJsonFiles = (dir: string): string[] => {
  const files = listJsonFiles(dir);
  return files.filter((filePath) => {
    const rel = path.relative(dir, filePath);
    const parts = rel.split(path.sep);
    if (parts.length < 3) {
      return false;
    }
    return /^\d{4}$/.test(parts[0]) && /^\d{2}$/.test(parts[1]);
  });
};

/**
 * Extract 8-char short ID from a full UUID or return as-is if already short.
 * e.g. "5282b6be-c3e0-421e-a8f5-269173642a14" → "5282b6be"
 */
export const toShortId = (id: string): string => {
  if (id.length === 36 && id[8] === "-") {
    return id.slice(0, 8);
  }
  return id;
};

export const findJsonFileById = (dir: string, id: string): string | null => {
  const target = `${toShortId(id)}.json`;
  const queue = [dir];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || !fs.existsSync(current)) {
      continue;
    }
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
      } else if (entry.isFile() && entry.name === target) {
        const rel = path.relative(dir, fullPath);
        const parts = rel.split(path.sep);
        if (
          parts.length >= 3 &&
          /^\d{4}$/.test(parts[0]) &&
          /^\d{2}$/.test(parts[1])
        ) {
          return fullPath;
        }
      }
    }
  }
  return null;
};

export const rulesDir = () => path.join(getMnemeDir(), "rules");

export const patternsDir = () => path.join(getMnemeDir(), "patterns");
