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

function getIndexDir(mnemeDir: string): string {
  return path.join(mnemeDir, INDEXES_DIR);
}

function getSessionIndexPath(
  mnemeDir: string,
  year: string,
  month: string,
): string {
  return path.join(getIndexDir(mnemeDir), "sessions", year, `${month}.json`);
}

function getDecisionIndexPath(
  mnemeDir: string,
  year: string,
  month: string,
): string {
  return path.join(getIndexDir(mnemeDir), "decisions", year, `${month}.json`);
}

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

export function rebuildSessionIndexForMonth(
  mnemeDir: string,
  year: string,
  month: string,
): SessionIndex {
  const index = buildSessionIndexForMonth(mnemeDir, year, month);
  if (index.items.length > 0) {
    writeSessionIndexForMonth(mnemeDir, year, month, index);
  } else {
    const indexPath = getSessionIndexPath(mnemeDir, year, month);
    if (fs.existsSync(indexPath)) fs.unlinkSync(indexPath);
  }
  return index;
}

export function rebuildDecisionIndexForMonth(
  mnemeDir: string,
  year: string,
  month: string,
): DecisionIndex {
  const index = buildDecisionIndexForMonth(mnemeDir, year, month);
  if (index.items.length > 0) {
    writeDecisionIndexForMonth(mnemeDir, year, month, index);
  } else {
    const indexPath = getDecisionIndexPath(mnemeDir, year, month);
    if (fs.existsSync(indexPath)) fs.unlinkSync(indexPath);
  }
  return index;
}

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

  allItems.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return {
    version: 1,
    updatedAt: latestUpdate || new Date().toISOString(),
    items: allItems,
  };
}

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

  allItems.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return {
    version: 1,
    updatedAt: latestUpdate || new Date().toISOString(),
    items: allItems,
  };
}

export function readAllSessionIndexes(mnemeDir: string): SessionIndex {
  return readRecentSessionIndexes(mnemeDir, Number.MAX_SAFE_INTEGER);
}

export function readAllDecisionIndexes(mnemeDir: string): DecisionIndex {
  return readRecentDecisionIndexes(mnemeDir, Number.MAX_SAFE_INTEGER);
}

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

export {
  getOrCreateDecisionIndex,
  getOrCreateSessionIndex,
  readDecisionIndex,
  readSessionIndex,
  rebuildAllIndexes,
  rebuildDecisionIndex,
  rebuildSessionIndex,
  writeDecisionIndex,
  writeSessionIndex,
} from "./manager-legacy.js";
