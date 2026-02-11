import type { DecisionIndex, SessionIndex } from "../schemas/index.js";
import {
  readAllDecisionIndexes,
  readAllSessionIndexes,
  readRecentDecisionIndexes,
  readRecentSessionIndexes,
  rebuildAllDecisionIndexes,
  rebuildAllSessionIndexes,
  writeDecisionIndexForMonth,
  writeSessionIndexForMonth,
} from "./manager.js";

/** @deprecated Use readRecentSessionIndexes or readAllSessionIndexes instead */
export function readSessionIndex(mnemeDir: string): SessionIndex | null {
  return readRecentSessionIndexes(mnemeDir);
}

/** @deprecated Use readRecentDecisionIndexes or readAllDecisionIndexes instead */
export function readDecisionIndex(mnemeDir: string): DecisionIndex | null {
  return readRecentDecisionIndexes(mnemeDir);
}

/** @deprecated Use writeSessionIndexForMonth instead */
export function writeSessionIndex(mnemeDir: string, index: SessionIndex): void {
  const now = new Date();
  const year = now.getFullYear().toString();
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  writeSessionIndexForMonth(mnemeDir, year, month, index);
}

/** @deprecated Use writeDecisionIndexForMonth instead */
export function writeDecisionIndex(
  mnemeDir: string,
  index: DecisionIndex,
): void {
  const now = new Date();
  const year = now.getFullYear().toString();
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  writeDecisionIndexForMonth(mnemeDir, year, month, index);
}

/** @deprecated Use rebuildSessionIndexForMonth instead */
export function rebuildSessionIndex(mnemeDir: string): SessionIndex {
  rebuildAllSessionIndexes(mnemeDir);
  return readAllSessionIndexes(mnemeDir);
}

/** @deprecated Use rebuildDecisionIndexForMonth instead */
export function rebuildDecisionIndex(mnemeDir: string): DecisionIndex {
  rebuildAllDecisionIndexes(mnemeDir);
  return readAllDecisionIndexes(mnemeDir);
}

/** @deprecated Use rebuildAllSessionIndexes and rebuildAllDecisionIndexes instead */
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

/** @deprecated Use readRecentSessionIndexes instead */
export function getOrCreateSessionIndex(mnemeDir: string): SessionIndex {
  return readRecentSessionIndexes(mnemeDir);
}

/** @deprecated Use readRecentDecisionIndexes instead */
export function getOrCreateDecisionIndex(mnemeDir: string): DecisionIndex {
  return readRecentDecisionIndexes(mnemeDir);
}
