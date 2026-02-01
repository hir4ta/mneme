import * as fs from "node:fs";
import * as path from "node:path";
import type { Tag } from "./schemas/index.js";
import { findJsonFiles, safeReadJson } from "./utils.js";

export interface SearchResult {
  type: "session" | "decision" | "pattern";
  id: string;
  score: number;
  title: string;
  highlights: { field: string; snippet: string }[];
}

/**
 * Levenshtein距離を計算
 */
export function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost, // substitution
      );
    }
  }

  return matrix[a.length][b.length];
}

/**
 * クエリをタグエイリアスで展開
 */
export function expandAliases(query: string, tags: Tag[]): string[] {
  const results = new Set<string>([query]);
  const lowerQuery = query.toLowerCase();

  for (const tag of tags) {
    // タグID、ラベル、エイリアスのいずれかがクエリと一致するか確認
    const allTerms = [tag.id, tag.label, ...tag.aliases].map((t) =>
      t.toLowerCase(),
    );

    if (allTerms.includes(lowerQuery)) {
      // 一致した場合、そのタグの全エイリアスを展開
      results.add(tag.id);
      results.add(tag.label);
      for (const alias of tag.aliases) {
        results.add(alias);
      }
    }
  }

  return Array.from(results);
}

/**
 * 類似度スコアを計算
 */
export function calculateSimilarity(text: string, query: string): number {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();

  // 完全一致: 最高スコア
  if (lowerText === lowerQuery) return 10;

  // 部分一致: テキストにクエリが含まれる
  if (lowerText.includes(lowerQuery)) return 5;

  // 部分一致: クエリにテキストが含まれる
  if (lowerQuery.includes(lowerText)) return 3;

  // Levenshtein距離で類似度を判定
  const distance = levenshtein(lowerText, lowerQuery);
  if (distance <= 2) return 2;
  if (distance <= 3) return 1;

  return 0;
}

export interface SearchOptions {
  query: string;
  mnemeDir: string;
  targets?: ("sessions" | "decisions" | "patterns")[];
  limit?: number;
  timeout?: number;
}

/**
 * ファジー検索を実行
 */
export async function search(options: SearchOptions): Promise<SearchResult[]> {
  const {
    query,
    mnemeDir,
    targets = ["sessions", "decisions"],
    limit = 20,
    timeout = 10000,
  } = options;

  const startTime = Date.now();
  const results: SearchResult[] = [];

  // タグ展開
  const tagsPath = path.join(mnemeDir, "tags.json");
  const tagsData = safeReadJson<{ tags: Tag[] }>(tagsPath, { tags: [] });
  const expandedQueries = expandAliases(query, tagsData.tags);

  // セッション検索
  if (targets.includes("sessions")) {
    const sessionsDir = path.join(mnemeDir, "sessions");
    if (fs.existsSync(sessionsDir)) {
      const files = findJsonFiles(sessionsDir);
      for (const file of files) {
        // タイムアウトチェック
        if (Date.now() - startTime > timeout) break;

        const session = safeReadJson<Record<string, unknown>>(file, {});
        const score = scoreDocument(session, expandedQueries, [
          "title",
          "goal",
          "tags",
        ]);
        if (score > 0) {
          results.push({
            type: "session",
            id: (session.id as string) || path.basename(file, ".json"),
            score,
            title: (session.title as string) || "Untitled",
            highlights: [],
          });
        }
      }
    }
  }

  // 決定検索
  if (targets.includes("decisions")) {
    const decisionsDir = path.join(mnemeDir, "decisions");
    if (fs.existsSync(decisionsDir)) {
      const files = findJsonFiles(decisionsDir);
      for (const file of files) {
        // タイムアウトチェック
        if (Date.now() - startTime > timeout) break;

        const decision = safeReadJson<Record<string, unknown>>(file, {});
        const score = scoreDocument(decision, expandedQueries, [
          "title",
          "decision",
          "tags",
        ]);
        if (score > 0) {
          results.push({
            type: "decision",
            id: (decision.id as string) || path.basename(file, ".json"),
            score,
            title: (decision.title as string) || "Untitled",
            highlights: [],
          });
        }
      }
    }
  }

  // パターン検索
  if (targets.includes("patterns")) {
    const patternsDir = path.join(mnemeDir, "patterns");
    if (fs.existsSync(patternsDir)) {
      const files = findJsonFiles(patternsDir);
      for (const file of files) {
        // タイムアウトチェック
        if (Date.now() - startTime > timeout) break;

        const pattern = safeReadJson<Record<string, unknown>>(file, {});
        const patterns = (pattern.patterns as Record<string, unknown>[]) || [];
        for (const p of patterns) {
          const score = scoreDocument(p, expandedQueries, [
            "description",
            "errorPattern",
            "tags",
          ]);
          if (score > 0) {
            results.push({
              type: "pattern",
              id: `${path.basename(file, ".json")}-${(p.type as string) || "unknown"}`,
              score,
              title: (p.description as string) || "Untitled pattern",
              highlights: [],
            });
          }
        }
      }
    }
  }

  // スコア順でソートして上位N件を返す
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * ドキュメントのスコアを計算
 */
function scoreDocument(
  doc: Record<string, unknown>,
  queries: string[],
  fields: string[],
): number {
  let totalScore = 0;

  for (const field of fields) {
    const value = doc[field];
    if (typeof value === "string") {
      for (const q of queries) {
        totalScore += calculateSimilarity(value, q);
      }
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string") {
          for (const q of queries) {
            totalScore += calculateSimilarity(item, q);
          }
        }
      }
    }
  }

  return totalScore;
}

// CLI エントリポイント
const isMain =
  process.argv[1]?.endsWith("fuzzy-search.js") ||
  process.argv[1]?.endsWith("fuzzy-search.ts");

if (isMain && process.argv.length > 2) {
  const args = process.argv.slice(2);
  const queryIndex = args.indexOf("--query");
  const query = queryIndex !== -1 ? args[queryIndex + 1] : "";
  const mnemeDir = `${process.cwd()}/.mneme`;

  if (!query) {
    console.error(JSON.stringify({ success: false, error: "Missing --query" }));
    process.exit(0);
  }

  search({ query, mnemeDir })
    .then((results) => {
      console.log(JSON.stringify({ success: true, results }));
    })
    .catch((error) => {
      console.error(JSON.stringify({ success: false, error: String(error) }));
    });
}
