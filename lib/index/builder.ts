import * as fs from "node:fs";
import * as path from "node:path";
import type {
  DecisionIndex,
  DecisionIndexItem,
  SessionIndex,
  SessionIndexItem,
} from "../schemas/index.js";
import { safeReadJson } from "../utils.js";

/**
 * List JSON files in a specific month directory
 */
function listMonthJsonFiles(monthDir: string): string[] {
  if (!fs.existsSync(monthDir)) {
    return [];
  }

  const files: string[] = [];
  const entries = fs.readdirSync(monthDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(path.join(monthDir, entry.name));
    }
  }

  return files;
}

/**
 * List all year/month combinations in a directory
 */
function listYearMonths(dir: string): { year: string; month: string }[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const results: { year: string; month: string }[] = [];
  const years = fs.readdirSync(dir, { withFileTypes: true });

  for (const year of years) {
    if (!year.isDirectory() || !/^\d{4}$/.test(year.name)) continue;

    const yearPath = path.join(dir, year.name);
    const months = fs.readdirSync(yearPath, { withFileTypes: true });

    for (const month of months) {
      if (!month.isDirectory() || !/^\d{2}$/.test(month.name)) continue;
      results.push({ year: year.name, month: month.name });
    }
  }

  // Sort by year/month descending (most recent first)
  results.sort((a, b) => {
    const aKey = `${a.year}${a.month}`;
    const bKey = `${b.year}${b.month}`;
    return bKey.localeCompare(aKey);
  });

  return results;
}

/**
 * Build session index for a specific month
 */
export function buildSessionIndexForMonth(
  mnemeDir: string,
  year: string,
  month: string,
): SessionIndex {
  const sessionsDir = path.join(mnemeDir, "sessions");
  const monthDir = path.join(sessionsDir, year, month);
  const files = listMonthJsonFiles(monthDir);

  const items: SessionIndexItem[] = [];

  for (const filePath of files) {
    try {
      const session = safeReadJson<Record<string, unknown>>(filePath, {});

      if (!session.id || !session.createdAt) continue;

      const relativePath = path.relative(sessionsDir, filePath);
      const interactions = (session.interactions as unknown[]) || [];
      const context = (session.context as Record<string, unknown>) || {};
      const user = context.user as { name?: string } | undefined;
      const summary = (session.summary as Record<string, unknown>) || {};
      const title =
        (summary.title as string) || (session.title as string) || "";

      // sessionType can be at root level or in summary
      const sessionType =
        (session.sessionType as SessionIndexItem["sessionType"]) ||
        (summary.sessionType as SessionIndexItem["sessionType"]) ||
        null;

      items.push({
        id: session.id as string,
        title: title || "Untitled",
        goal: (summary.goal as string) || (session.goal as string) || undefined,
        createdAt: session.createdAt as string,
        tags: (session.tags as string[]) || [],
        sessionType,
        branch: (context.branch as string) || null,
        user: user?.name,
        interactionCount: interactions.length,
        filePath: relativePath,
        hasSummary: !!title && title !== "Untitled",
      });
    } catch {
      // Skip invalid files
    }
  }

  // Sort by createdAt descending
  items.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    items,
  };
}

/**
 * Build all session indexes (one per month)
 */
export function buildAllSessionIndexes(
  mnemeDir: string,
): Map<string, SessionIndex> {
  const sessionsDir = path.join(mnemeDir, "sessions");
  const yearMonths = listYearMonths(sessionsDir);
  const indexes = new Map<string, SessionIndex>();

  for (const { year, month } of yearMonths) {
    const key = `${year}/${month}`;
    const index = buildSessionIndexForMonth(mnemeDir, year, month);
    if (index.items.length > 0) {
      indexes.set(key, index);
    }
  }

  return indexes;
}

/**
 * Build decision index for a specific month
 */
export function buildDecisionIndexForMonth(
  mnemeDir: string,
  year: string,
  month: string,
): DecisionIndex {
  const decisionsDir = path.join(mnemeDir, "decisions");
  const monthDir = path.join(decisionsDir, year, month);
  const files = listMonthJsonFiles(monthDir);

  const items: DecisionIndexItem[] = [];

  for (const filePath of files) {
    try {
      const decision = safeReadJson<Record<string, unknown>>(filePath, {});

      if (!decision.id || !decision.createdAt) continue;

      const relativePath = path.relative(decisionsDir, filePath);
      const user = decision.user as { name?: string } | undefined;

      items.push({
        id: decision.id as string,
        title: (decision.title as string) || "Untitled",
        createdAt: decision.createdAt as string,
        updatedAt: decision.updatedAt as string | undefined,
        tags: (decision.tags as string[]) || [],
        status: (decision.status as DecisionIndexItem["status"]) || "active",
        user: user?.name,
        filePath: relativePath,
      });
    } catch {
      // Skip invalid files
    }
  }

  // Sort by createdAt descending
  items.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    items,
  };
}

/**
 * Build all decision indexes (one per month)
 */
export function buildAllDecisionIndexes(
  mnemeDir: string,
): Map<string, DecisionIndex> {
  const decisionsDir = path.join(mnemeDir, "decisions");
  const yearMonths = listYearMonths(decisionsDir);
  const indexes = new Map<string, DecisionIndex>();

  for (const { year, month } of yearMonths) {
    const key = `${year}/${month}`;
    const index = buildDecisionIndexForMonth(mnemeDir, year, month);
    if (index.items.length > 0) {
      indexes.set(key, index);
    }
  }

  return indexes;
}

/**
 * Get list of available year/months for sessions
 */
export function getSessionYearMonths(
  mnemeDir: string,
): { year: string; month: string }[] {
  const sessionsDir = path.join(mnemeDir, "sessions");
  return listYearMonths(sessionsDir);
}

/**
 * Get list of available year/months for decisions
 */
export function getDecisionYearMonths(
  mnemeDir: string,
): { year: string; month: string }[] {
  const decisionsDir = path.join(mnemeDir, "decisions");
  return listYearMonths(decisionsDir);
}

// Legacy functions for backwards compatibility
/**
 * @deprecated Use buildAllSessionIndexes instead
 */
export function buildSessionIndex(mnemeDir: string): SessionIndex {
  const allIndexes = buildAllSessionIndexes(mnemeDir);
  const items: SessionIndexItem[] = [];

  for (const index of allIndexes.values()) {
    items.push(...index.items);
  }

  // Sort by createdAt descending
  items.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    items,
  };
}

/**
 * @deprecated Use buildAllDecisionIndexes instead
 */
export function buildDecisionIndex(mnemeDir: string): DecisionIndex {
  const allIndexes = buildAllDecisionIndexes(mnemeDir);
  const items: DecisionIndexItem[] = [];

  for (const index of allIndexes.values()) {
    items.push(...index.items);
  }

  // Sort by createdAt descending
  items.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    items,
  };
}

/**
 * @deprecated Use buildAllSessionIndexes and buildAllDecisionIndexes instead
 */
export function buildAllIndexes(mnemeDir: string): {
  sessions: SessionIndex;
  decisions: DecisionIndex;
} {
  return {
    sessions: buildSessionIndex(mnemeDir),
    decisions: buildDecisionIndex(mnemeDir),
  };
}
