import * as fs from "node:fs";
import * as path from "node:path";
import type { DecisionIndex, SessionIndex } from "../schemas/index.js";
import { ensureDir, safeReadJson } from "../utils.js";
import {
  buildAllDecisionIndexes,
  buildAllSessionIndexes,
  buildDecisionIndexForMonth,
  buildSessionIndexForMonth,
  getDecisionYearMonths,
  getSessionYearMonths,
} from "./builder.js";

const INDEXES_DIR = ".indexes";

/**
 * Get index directory path
 */
function getIndexDir(mnemeDir: string): string {
  return path.join(mnemeDir, INDEXES_DIR);
}

/**
 * Get session index file path for a specific month
 */
function getSessionIndexPath(
  mnemeDir: string,
  year: string,
  month: string,
): string {
  return path.join(getIndexDir(mnemeDir), "sessions", year, `${month}.json`);
}

/**
 * Get decision index file path for a specific month
 */
function getDecisionIndexPath(
  mnemeDir: string,
  year: string,
  month: string,
): string {
  return path.join(getIndexDir(mnemeDir), "decisions", year, `${month}.json`);
}

/**
 * Read session index for a specific month
 */
export function readSessionIndexForMonth(
  mnemeDir: string,
  year: string,
  month: string,
): SessionIndex | null {
  const indexPath = getSessionIndexPath(mnemeDir, year, month);
  if (!fs.existsSync(indexPath)) {
    return null;
  }
  return safeReadJson<SessionIndex>(indexPath, {
    version: 1,
    updatedAt: "",
    items: [],
  });
}

/**
 * Read decision index for a specific month
 */
export function readDecisionIndexForMonth(
  mnemeDir: string,
  year: string,
  month: string,
): DecisionIndex | null {
  const indexPath = getDecisionIndexPath(mnemeDir, year, month);
  if (!fs.existsSync(indexPath)) {
    return null;
  }
  return safeReadJson<DecisionIndex>(indexPath, {
    version: 1,
    updatedAt: "",
    items: [],
  });
}

/**
 * Write session index for a specific month
 */
export function writeSessionIndexForMonth(
  mnemeDir: string,
  year: string,
  month: string,
  index: SessionIndex,
): void {
  const indexPath = getSessionIndexPath(mnemeDir, year, month);
  ensureDir(path.dirname(indexPath));
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
}

/**
 * Write decision index for a specific month
 */
export function writeDecisionIndexForMonth(
  mnemeDir: string,
  year: string,
  month: string,
  index: DecisionIndex,
): void {
  const indexPath = getDecisionIndexPath(mnemeDir, year, month);
  ensureDir(path.dirname(indexPath));
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
}

/**
 * Rebuild session index for a specific month
 */
export function rebuildSessionIndexForMonth(
  mnemeDir: string,
  year: string,
  month: string,
): SessionIndex {
  const index = buildSessionIndexForMonth(mnemeDir, year, month);
  const indexPath = path.join(
    mnemeDir,
    INDEXES_DIR,
    "sessions",
    year,
    `${month}.json`,
  );

  if (index.items.length > 0) {
    writeSessionIndexForMonth(mnemeDir, year, month, index);
  } else if (fs.existsSync(indexPath)) {
    // Delete empty index file to prevent stale data
    fs.unlinkSync(indexPath);
  }
  return index;
}

/**
 * Rebuild decision index for a specific month
 */
export function rebuildDecisionIndexForMonth(
  mnemeDir: string,
  year: string,
  month: string,
): DecisionIndex {
  const index = buildDecisionIndexForMonth(mnemeDir, year, month);
  const indexPath = path.join(
    mnemeDir,
    INDEXES_DIR,
    "decisions",
    year,
    `${month}.json`,
  );

  if (index.items.length > 0) {
    writeDecisionIndexForMonth(mnemeDir, year, month, index);
  } else if (fs.existsSync(indexPath)) {
    fs.unlinkSync(indexPath);
  }
  return index;
}

/**
 * Rebuild all session indexes
 */
export function rebuildAllSessionIndexes(
  mnemeDir: string,
): Map<string, SessionIndex> {
  const allIndexes = buildAllSessionIndexes(mnemeDir);

  for (const [key, index] of allIndexes) {
    const [year, month] = key.split("/");
    writeSessionIndexForMonth(mnemeDir, year, month, index);
  }

  return allIndexes;
}

/**
 * Rebuild all decision indexes
 */
export function rebuildAllDecisionIndexes(
  mnemeDir: string,
): Map<string, DecisionIndex> {
  const allIndexes = buildAllDecisionIndexes(mnemeDir);

  for (const [key, index] of allIndexes) {
    const [year, month] = key.split("/");
    writeDecisionIndexForMonth(mnemeDir, year, month, index);
  }

  return allIndexes;
}

/**
 * Read recent session indexes (last N months)
 */
export function readRecentSessionIndexes(
  mnemeDir: string,
  monthCount = 6,
): SessionIndex {
  const yearMonths = getSessionYearMonths(mnemeDir);
  const recentMonths = yearMonths.slice(0, monthCount);

  const allItems: SessionIndex["items"] = [];
  let latestUpdate = "";

  for (const { year, month } of recentMonths) {
    let index = readSessionIndexForMonth(mnemeDir, year, month);

    // Rebuild if not found or stale
    if (!index || isIndexStale(index)) {
      index = rebuildSessionIndexForMonth(mnemeDir, year, month);
    }

    if (index.items.length > 0) {
      allItems.push(...index.items);
      if (index.updatedAt > latestUpdate) {
        latestUpdate = index.updatedAt;
      }
    }
  }

  // Sort by createdAt descending
  allItems.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return {
    version: 1,
    updatedAt: latestUpdate || new Date().toISOString(),
    items: allItems,
  };
}

/**
 * Read recent decision indexes (last N months)
 */
export function readRecentDecisionIndexes(
  mnemeDir: string,
  monthCount = 6,
): DecisionIndex {
  const yearMonths = getDecisionYearMonths(mnemeDir);
  const recentMonths = yearMonths.slice(0, monthCount);

  const allItems: DecisionIndex["items"] = [];
  let latestUpdate = "";

  for (const { year, month } of recentMonths) {
    let index = readDecisionIndexForMonth(mnemeDir, year, month);

    // Rebuild if not found or stale
    if (!index || isIndexStale(index)) {
      index = rebuildDecisionIndexForMonth(mnemeDir, year, month);
    }

    if (index.items.length > 0) {
      allItems.push(...index.items);
      if (index.updatedAt > latestUpdate) {
        latestUpdate = index.updatedAt;
      }
    }
  }

  // Sort by createdAt descending
  allItems.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return {
    version: 1,
    updatedAt: latestUpdate || new Date().toISOString(),
    items: allItems,
  };
}

/**
 * Read all session indexes (all months)
 */
export function readAllSessionIndexes(mnemeDir: string): SessionIndex {
  const yearMonths = getSessionYearMonths(mnemeDir);

  const allItems: SessionIndex["items"] = [];
  let latestUpdate = "";

  for (const { year, month } of yearMonths) {
    let index = readSessionIndexForMonth(mnemeDir, year, month);

    // Rebuild if not found or stale
    if (!index || isIndexStale(index)) {
      index = rebuildSessionIndexForMonth(mnemeDir, year, month);
    }

    if (index.items.length > 0) {
      allItems.push(...index.items);
      if (index.updatedAt > latestUpdate) {
        latestUpdate = index.updatedAt;
      }
    }
  }

  // Sort by createdAt descending
  allItems.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return {
    version: 1,
    updatedAt: latestUpdate || new Date().toISOString(),
    items: allItems,
  };
}

/**
 * Read all decision indexes (all months)
 */
export function readAllDecisionIndexes(mnemeDir: string): DecisionIndex {
  const yearMonths = getDecisionYearMonths(mnemeDir);

  const allItems: DecisionIndex["items"] = [];
  let latestUpdate = "";

  for (const { year, month } of yearMonths) {
    let index = readDecisionIndexForMonth(mnemeDir, year, month);

    // Rebuild if not found or stale
    if (!index || isIndexStale(index)) {
      index = rebuildDecisionIndexForMonth(mnemeDir, year, month);
    }

    if (index.items.length > 0) {
      allItems.push(...index.items);
      if (index.updatedAt > latestUpdate) {
        latestUpdate = index.updatedAt;
      }
    }
  }

  // Sort by createdAt descending
  allItems.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return {
    version: 1,
    updatedAt: latestUpdate || new Date().toISOString(),
    items: allItems,
  };
}

/**
 * Check if index needs rebuild based on staleness
 * @param maxAgeMs Maximum age in milliseconds (default: 5 minutes)
 */
export function isIndexStale(
  index: SessionIndex | DecisionIndex | null,
  maxAgeMs = 5 * 60 * 1000,
): boolean {
  if (!index || !index.updatedAt) {
    return true;
  }
  const updatedAt = new Date(index.updatedAt).getTime();
  const now = Date.now();
  return now - updatedAt > maxAgeMs;
}

// ============================================
// Legacy functions for backwards compatibility
// ============================================

/**
 * @deprecated Use readRecentSessionIndexes or readAllSessionIndexes instead
 */
export function readSessionIndex(mnemeDir: string): SessionIndex | null {
  return readRecentSessionIndexes(mnemeDir);
}

/**
 * @deprecated Use readRecentDecisionIndexes or readAllDecisionIndexes instead
 */
export function readDecisionIndex(mnemeDir: string): DecisionIndex | null {
  return readRecentDecisionIndexes(mnemeDir);
}

/**
 * @deprecated Use writeSessionIndexForMonth instead
 */
export function writeSessionIndex(mnemeDir: string, index: SessionIndex): void {
  // Write to current month
  const now = new Date();
  const year = now.getFullYear().toString();
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  writeSessionIndexForMonth(mnemeDir, year, month, index);
}

/**
 * @deprecated Use writeDecisionIndexForMonth instead
 */
export function writeDecisionIndex(
  mnemeDir: string,
  index: DecisionIndex,
): void {
  // Write to current month
  const now = new Date();
  const year = now.getFullYear().toString();
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  writeDecisionIndexForMonth(mnemeDir, year, month, index);
}

/**
 * @deprecated Use rebuildSessionIndexForMonth instead
 */
export function rebuildSessionIndex(mnemeDir: string): SessionIndex {
  rebuildAllSessionIndexes(mnemeDir);
  return readAllSessionIndexes(mnemeDir);
}

/**
 * @deprecated Use rebuildDecisionIndexForMonth instead
 */
export function rebuildDecisionIndex(mnemeDir: string): DecisionIndex {
  rebuildAllDecisionIndexes(mnemeDir);
  return readAllDecisionIndexes(mnemeDir);
}

/**
 * @deprecated Use rebuildAllSessionIndexes and rebuildAllDecisionIndexes instead
 */
export function rebuildAllIndexes(mnemeDir: string): {
  sessions: SessionIndex;
  decisions: DecisionIndex;
} {
  rebuildAllSessionIndexes(mnemeDir);
  rebuildAllDecisionIndexes(mnemeDir);
  return {
    sessions: readAllSessionIndexes(mnemeDir),
    decisions: readAllDecisionIndexes(mnemeDir),
  };
}

/**
 * @deprecated Use readRecentSessionIndexes instead
 */
export function getOrCreateSessionIndex(mnemeDir: string): SessionIndex {
  return readRecentSessionIndexes(mnemeDir);
}

/**
 * @deprecated Use readRecentDecisionIndexes instead
 */
export function getOrCreateDecisionIndex(mnemeDir: string): DecisionIndex {
  return readRecentDecisionIndexes(mnemeDir);
}
