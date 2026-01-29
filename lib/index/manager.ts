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
function getIndexDir(memoriaDir: string): string {
  return path.join(memoriaDir, INDEXES_DIR);
}

/**
 * Get session index file path for a specific month
 */
function getSessionIndexPath(
  memoriaDir: string,
  year: string,
  month: string,
): string {
  return path.join(getIndexDir(memoriaDir), "sessions", year, `${month}.json`);
}

/**
 * Get decision index file path for a specific month
 */
function getDecisionIndexPath(
  memoriaDir: string,
  year: string,
  month: string,
): string {
  return path.join(getIndexDir(memoriaDir), "decisions", year, `${month}.json`);
}

/**
 * Read session index for a specific month
 */
export function readSessionIndexForMonth(
  memoriaDir: string,
  year: string,
  month: string,
): SessionIndex | null {
  const indexPath = getSessionIndexPath(memoriaDir, year, month);
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
  memoriaDir: string,
  year: string,
  month: string,
): DecisionIndex | null {
  const indexPath = getDecisionIndexPath(memoriaDir, year, month);
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
  memoriaDir: string,
  year: string,
  month: string,
  index: SessionIndex,
): void {
  const indexPath = getSessionIndexPath(memoriaDir, year, month);
  ensureDir(path.dirname(indexPath));
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
}

/**
 * Write decision index for a specific month
 */
export function writeDecisionIndexForMonth(
  memoriaDir: string,
  year: string,
  month: string,
  index: DecisionIndex,
): void {
  const indexPath = getDecisionIndexPath(memoriaDir, year, month);
  ensureDir(path.dirname(indexPath));
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
}

/**
 * Rebuild session index for a specific month
 */
export function rebuildSessionIndexForMonth(
  memoriaDir: string,
  year: string,
  month: string,
): SessionIndex {
  const index = buildSessionIndexForMonth(memoriaDir, year, month);
  if (index.items.length > 0) {
    writeSessionIndexForMonth(memoriaDir, year, month, index);
  }
  return index;
}

/**
 * Rebuild decision index for a specific month
 */
export function rebuildDecisionIndexForMonth(
  memoriaDir: string,
  year: string,
  month: string,
): DecisionIndex {
  const index = buildDecisionIndexForMonth(memoriaDir, year, month);
  if (index.items.length > 0) {
    writeDecisionIndexForMonth(memoriaDir, year, month, index);
  }
  return index;
}

/**
 * Rebuild all session indexes
 */
export function rebuildAllSessionIndexes(
  memoriaDir: string,
): Map<string, SessionIndex> {
  const allIndexes = buildAllSessionIndexes(memoriaDir);

  for (const [key, index] of allIndexes) {
    const [year, month] = key.split("/");
    writeSessionIndexForMonth(memoriaDir, year, month, index);
  }

  return allIndexes;
}

/**
 * Rebuild all decision indexes
 */
export function rebuildAllDecisionIndexes(
  memoriaDir: string,
): Map<string, DecisionIndex> {
  const allIndexes = buildAllDecisionIndexes(memoriaDir);

  for (const [key, index] of allIndexes) {
    const [year, month] = key.split("/");
    writeDecisionIndexForMonth(memoriaDir, year, month, index);
  }

  return allIndexes;
}

/**
 * Read recent session indexes (last N months)
 */
export function readRecentSessionIndexes(
  memoriaDir: string,
  monthCount = 6,
): SessionIndex {
  const yearMonths = getSessionYearMonths(memoriaDir);
  const recentMonths = yearMonths.slice(0, monthCount);

  const allItems: SessionIndex["items"] = [];
  let latestUpdate = "";

  for (const { year, month } of recentMonths) {
    let index = readSessionIndexForMonth(memoriaDir, year, month);

    // Rebuild if not found or stale
    if (!index || isIndexStale(index)) {
      index = rebuildSessionIndexForMonth(memoriaDir, year, month);
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
  memoriaDir: string,
  monthCount = 6,
): DecisionIndex {
  const yearMonths = getDecisionYearMonths(memoriaDir);
  const recentMonths = yearMonths.slice(0, monthCount);

  const allItems: DecisionIndex["items"] = [];
  let latestUpdate = "";

  for (const { year, month } of recentMonths) {
    let index = readDecisionIndexForMonth(memoriaDir, year, month);

    // Rebuild if not found or stale
    if (!index || isIndexStale(index)) {
      index = rebuildDecisionIndexForMonth(memoriaDir, year, month);
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
export function readAllSessionIndexes(memoriaDir: string): SessionIndex {
  const yearMonths = getSessionYearMonths(memoriaDir);

  const allItems: SessionIndex["items"] = [];
  let latestUpdate = "";

  for (const { year, month } of yearMonths) {
    let index = readSessionIndexForMonth(memoriaDir, year, month);

    // Rebuild if not found or stale
    if (!index || isIndexStale(index)) {
      index = rebuildSessionIndexForMonth(memoriaDir, year, month);
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
export function readAllDecisionIndexes(memoriaDir: string): DecisionIndex {
  const yearMonths = getDecisionYearMonths(memoriaDir);

  const allItems: DecisionIndex["items"] = [];
  let latestUpdate = "";

  for (const { year, month } of yearMonths) {
    let index = readDecisionIndexForMonth(memoriaDir, year, month);

    // Rebuild if not found or stale
    if (!index || isIndexStale(index)) {
      index = rebuildDecisionIndexForMonth(memoriaDir, year, month);
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
export function readSessionIndex(memoriaDir: string): SessionIndex | null {
  return readRecentSessionIndexes(memoriaDir);
}

/**
 * @deprecated Use readRecentDecisionIndexes or readAllDecisionIndexes instead
 */
export function readDecisionIndex(memoriaDir: string): DecisionIndex | null {
  return readRecentDecisionIndexes(memoriaDir);
}

/**
 * @deprecated Use writeSessionIndexForMonth instead
 */
export function writeSessionIndex(
  memoriaDir: string,
  index: SessionIndex,
): void {
  // Write to current month
  const now = new Date();
  const year = now.getFullYear().toString();
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  writeSessionIndexForMonth(memoriaDir, year, month, index);
}

/**
 * @deprecated Use writeDecisionIndexForMonth instead
 */
export function writeDecisionIndex(
  memoriaDir: string,
  index: DecisionIndex,
): void {
  // Write to current month
  const now = new Date();
  const year = now.getFullYear().toString();
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  writeDecisionIndexForMonth(memoriaDir, year, month, index);
}

/**
 * @deprecated Use rebuildSessionIndexForMonth instead
 */
export function rebuildSessionIndex(memoriaDir: string): SessionIndex {
  rebuildAllSessionIndexes(memoriaDir);
  return readAllSessionIndexes(memoriaDir);
}

/**
 * @deprecated Use rebuildDecisionIndexForMonth instead
 */
export function rebuildDecisionIndex(memoriaDir: string): DecisionIndex {
  rebuildAllDecisionIndexes(memoriaDir);
  return readAllDecisionIndexes(memoriaDir);
}

/**
 * @deprecated Use rebuildAllSessionIndexes and rebuildAllDecisionIndexes instead
 */
export function rebuildAllIndexes(memoriaDir: string): {
  sessions: SessionIndex;
  decisions: DecisionIndex;
} {
  rebuildAllSessionIndexes(memoriaDir);
  rebuildAllDecisionIndexes(memoriaDir);
  return {
    sessions: readAllSessionIndexes(memoriaDir),
    decisions: readAllDecisionIndexes(memoriaDir),
  };
}

/**
 * @deprecated Use readRecentSessionIndexes instead
 */
export function getOrCreateSessionIndex(memoriaDir: string): SessionIndex {
  return readRecentSessionIndexes(memoriaDir);
}

/**
 * @deprecated Use readRecentDecisionIndexes instead
 */
export function getOrCreateDecisionIndex(memoriaDir: string): DecisionIndex {
  return readRecentDecisionIndexes(memoriaDir);
}
