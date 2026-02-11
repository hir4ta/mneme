import * as fs from "node:fs";
import * as path from "node:path";
import {
  escapeRegex,
  expandKeywordsWithAliases,
  fieldScore,
  isFuzzyMatch,
  loadTags,
  walkJsonFiles,
} from "./search-helpers.js";

export type SearchType = "session" | "interaction";

type CanonicalSearchType = "session" | "interaction";

export interface SearchResult {
  type: CanonicalSearchType;
  id: string;
  title: string;
  snippet: string;
  score: number;
  matchedFields: string[];
}

interface SessionFile {
  id: string;
  title?: string;
  tags?: string[];
  summary?: {
    title?: string;
    goal?: string;
    description?: string;
  };
  discussions?: Array<{
    topic?: string;
    decision?: string;
    reasoning?: string;
  }>;
  errors?: Array<{
    error?: string;
    cause?: string;
    solution?: string;
  }>;
}

type StatementLike = {
  all: (...args: unknown[]) => unknown[];
};

export type QueryableDb = {
  prepare: (sql: string) => StatementLike;
};

function searchInteractions(
  keywords: string[],
  projectPath: string,
  database: QueryableDb | null,
  limit = 5,
): SearchResult[] {
  if (!database) return [];

  try {
    const stmt = database.prepare(`
      SELECT
        i.session_id,
        i.content,
        i.timestamp,
        highlight(interactions_fts, 0, '[', ']') as content_highlight
      FROM interactions_fts
      JOIN interactions i ON interactions_fts.rowid = i.id
      WHERE interactions_fts MATCH ?
        AND i.project_path = ?
      ORDER BY rank
      LIMIT ?
    `);
    const rows = stmt.all(keywords.join(" OR "), projectPath, limit) as Array<{
      session_id: string;
      content: string;
      timestamp: string;
      content_highlight: string;
    }>;

    return rows.map((row) => ({
      type: "interaction",
      id: row.session_id,
      title: `Interaction from ${row.timestamp}`,
      snippet: (row.content_highlight || row.content).substring(0, 150),
      score: 5,
      matchedFields: ["content"],
    }));
  } catch {
    try {
      const clauses = keywords.map(() => "(content LIKE ? OR thinking LIKE ?)");
      const sql = `
        SELECT DISTINCT session_id, substr(content, 1, 120) as snippet, timestamp
        FROM interactions
        WHERE project_path = ?
          AND (${clauses.join(" OR ")})
        ORDER BY timestamp DESC
        LIMIT ?
      `;
      const args: unknown[] = [projectPath];
      for (const keyword of keywords) {
        const pattern = `%${keyword}%`;
        args.push(pattern, pattern);
      }
      args.push(limit);
      const stmt = database.prepare(sql);
      const rows = stmt.all(...args) as Array<{
        session_id: string;
        snippet: string;
        timestamp: string;
      }>;

      return rows.map((row) => ({
        type: "interaction",
        id: row.session_id,
        title: `Interaction from ${row.timestamp}`,
        snippet: row.snippet,
        score: 3,
        matchedFields: ["content"],
      }));
    } catch {
      return [];
    }
  }
}

function searchSessions(mnemeDir: string, keywords: string[], limit = 5) {
  const sessionsDir = path.join(mnemeDir, "sessions");
  const results: SearchResult[] = [];
  const pattern = new RegExp(keywords.map(escapeRegex).join("|"), "i");

  walkJsonFiles(sessionsDir, (filePath) => {
    try {
      const session = JSON.parse(
        fs.readFileSync(filePath, "utf-8"),
      ) as SessionFile;
      const title = session.title || session.summary?.title || "";
      let score = 0;
      const matchedFields: string[] = [];

      const titleScore = fieldScore(title, pattern, 3);
      if (titleScore > 0) {
        score += titleScore;
        matchedFields.push("title");
      }
      if (session.tags?.some((t) => pattern.test(t))) {
        score += 1;
        matchedFields.push("tags");
      }
      const goalScore = fieldScore(session.summary?.goal, pattern, 2);
      if (goalScore > 0) {
        score += goalScore;
        matchedFields.push("summary.goal");
      }
      const descScore = fieldScore(session.summary?.description, pattern, 2);
      if (descScore > 0) {
        score += descScore;
        matchedFields.push("summary.description");
      }
      if (
        session.discussions?.some(
          (d) => pattern.test(d.topic || "") || pattern.test(d.decision || ""),
        )
      ) {
        score += 2;
        matchedFields.push("discussions");
      }
      if (
        session.errors?.some(
          (e) => pattern.test(e.error || "") || pattern.test(e.solution || ""),
        )
      ) {
        score += 2;
        matchedFields.push("errors");
      }

      if (score === 0 && keywords.length <= 2) {
        const titleWords = (title || "").toLowerCase().split(/\s+/);
        const tagWords = session.tags || [];
        for (const keyword of keywords) {
          if (titleWords.some((w) => isFuzzyMatch(keyword, w))) {
            score += 1;
            matchedFields.push("title~fuzzy");
          }
          if (tagWords.some((t) => isFuzzyMatch(keyword, t))) {
            score += 0.5;
            matchedFields.push("tags~fuzzy");
          }
        }
      }

      if (score > 0) {
        results.push({
          type: "session",
          id: session.id,
          title: title || session.id,
          snippet: session.summary?.description || session.summary?.goal || "",
          score,
          matchedFields,
        });
      }
    } catch {
      // Skip invalid JSON
    }
  });

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function searchKnowledge(options: {
  query: string;
  mnemeDir: string;
  projectPath: string;
  database?: QueryableDb | null;
  types?: SearchType[];
  limit?: number;
  offset?: number;
}): SearchResult[] {
  const {
    query,
    mnemeDir,
    projectPath,
    database = null,
    types = ["session", "interaction"],
    limit = 10,
    offset = 0,
  } = options;

  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2);

  if (keywords.length === 0) return [];

  const expandedKeywords = expandKeywordsWithAliases(
    keywords,
    loadTags(mnemeDir),
  );
  const results: SearchResult[] = [];
  const safeOffset = Math.max(0, offset);
  const fetchLimit = Math.max(limit + safeOffset, limit, 10);

  const normalizedTypes = new Set<CanonicalSearchType>(types);

  if (normalizedTypes.has("session")) {
    results.push(...searchSessions(mnemeDir, expandedKeywords, fetchLimit));
  }
  if (normalizedTypes.has("interaction")) {
    results.push(
      ...searchInteractions(
        expandedKeywords,
        projectPath,
        database,
        fetchLimit,
      ),
    );
  }

  const seen = new Set<string>();
  return results
    .sort((a, b) => b.score - a.score)
    .filter((result) => {
      const key = `${result.type}:${result.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(safeOffset, safeOffset + limit);
}
