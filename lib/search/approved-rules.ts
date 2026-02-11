import * as fs from "node:fs";
import * as path from "node:path";
import {
  escapeRegex,
  expandKeywordsWithAliases,
  fieldScore,
  loadTags,
  walkJsonFiles,
} from "./helpers.js";

export type ApprovedSourceType = "decision" | "pattern" | "rule";

export interface ApprovedRuleResult {
  sourceType: ApprovedSourceType;
  id: string;
  title: string;
  text: string;
  priority?: string;
  tags: string[];
  score: number;
  matchedFields: string[];
}

function isApproved(status: unknown): boolean {
  if (typeof status !== "string") return false;
  const s = status.toLowerCase();
  return s === "approved" || s === "active";
}

function priorityBoost(priority: unknown): number {
  if (priority === "p0") return 2;
  if (priority === "p1") return 1;
  return 0;
}

function searchRuleFiles(
  mnemeDir: string,
  pattern: RegExp,
): ApprovedRuleResult[] {
  const results: ApprovedRuleResult[] = [];
  const rulesDir = path.join(mnemeDir, "rules");
  if (!fs.existsSync(rulesDir)) return results;

  for (const fileName of ["dev-rules.json", "review-guidelines.json"]) {
    const filePath = path.join(rulesDir, fileName);
    if (!fs.existsSync(filePath)) continue;
    try {
      const doc = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      const items = doc.items || doc.rules || [];
      for (const item of items) {
        if (!isApproved(item.status)) continue;
        let score = 0;
        const matched: string[] = [];

        const textScore = fieldScore(item.text, pattern, 4);
        if (textScore > 0) {
          score += textScore;
          matched.push("text");
        }
        const keyScore = fieldScore(item.key, pattern, 3);
        if (keyScore > 0) {
          score += keyScore;
          matched.push("key");
        }
        if (item.tags?.some((t: string) => pattern.test(t))) {
          score += 1;
          matched.push("tags");
        }
        score += priorityBoost(item.priority);

        if (score > 0) {
          results.push({
            sourceType: "rule",
            id: item.id || item.key || "",
            title: item.text || item.key || "",
            text: item.text || "",
            priority: item.priority,
            tags: item.tags || [],
            score,
            matchedFields: matched,
          });
        }
      }
    } catch {
      // Skip invalid files
    }
  }
  return results;
}

function searchDecisionFiles(
  mnemeDir: string,
  pattern: RegExp,
): ApprovedRuleResult[] {
  const results: ApprovedRuleResult[] = [];
  const decisionsDir = path.join(mnemeDir, "decisions");

  walkJsonFiles(decisionsDir, (filePath) => {
    try {
      const doc = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      if (!isApproved(doc.status)) return;
      let score = 0;
      const matched: string[] = [];

      const titleScore = fieldScore(doc.title, pattern, 3);
      if (titleScore > 0) {
        score += titleScore;
        matched.push("title");
      }
      const decisionScore = fieldScore(doc.decision, pattern, 4);
      if (decisionScore > 0) {
        score += decisionScore;
        matched.push("decision");
      }
      const reasoningScore = fieldScore(doc.reasoning, pattern, 2);
      if (reasoningScore > 0) {
        score += reasoningScore;
        matched.push("reasoning");
      }
      if (doc.tags?.some((t: string) => pattern.test(t))) {
        score += 1;
        matched.push("tags");
      }

      if (score > 0) {
        results.push({
          sourceType: "decision",
          id: doc.id || "",
          title: doc.title || "",
          text: doc.decision || doc.title || "",
          tags: doc.tags || [],
          score,
          matchedFields: matched,
        });
      }
    } catch {
      // Skip invalid files
    }
  });
  return results;
}

function searchPatternFiles(
  mnemeDir: string,
  pattern: RegExp,
): ApprovedRuleResult[] {
  const results: ApprovedRuleResult[] = [];
  const patternsDir = path.join(mnemeDir, "patterns");

  walkJsonFiles(patternsDir, (filePath) => {
    try {
      const doc = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      const items = doc.items || doc.patterns || [];
      for (const item of items) {
        if (!isApproved(item.status)) continue;
        let score = 0;
        const matched: string[] = [];

        const titleScore = fieldScore(item.title, pattern, 3);
        if (titleScore > 0) {
          score += titleScore;
          matched.push("title");
        }
        const patternScore = fieldScore(item.pattern, pattern, 3);
        if (patternScore > 0) {
          score += patternScore;
          matched.push("pattern");
        }
        if (item.tags?.some((t: string) => pattern.test(t))) {
          score += 1;
          matched.push("tags");
        }

        if (score > 0) {
          results.push({
            sourceType: "pattern",
            id: item.id || "",
            title: item.title || "",
            text: item.pattern || item.title || "",
            tags: item.tags || [],
            score,
            matchedFields: matched,
          });
        }
      }
    } catch {
      // Skip invalid files
    }
  });
  return results;
}

export function searchApprovedRules(options: {
  query: string;
  mnemeDir: string;
  limit?: number;
}): ApprovedRuleResult[] {
  const { query, mnemeDir, limit = 5 } = options;

  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 2);

  if (keywords.length === 0) return [];

  const expanded = expandKeywordsWithAliases(keywords, loadTags(mnemeDir));
  const pattern = new RegExp(expanded.map(escapeRegex).join("|"), "i");

  const results: ApprovedRuleResult[] = [
    ...searchRuleFiles(mnemeDir, pattern),
    ...searchDecisionFiles(mnemeDir, pattern),
    ...searchPatternFiles(mnemeDir, pattern),
  ];

  const seen = new Set<string>();
  return results
    .sort((a, b) => b.score - a.score)
    .filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    })
    .slice(0, limit);
}
