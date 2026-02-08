import * as fs from "node:fs";
import * as path from "node:path";

export type SearchType = "session" | "unit" | "interaction";

type CanonicalSearchType = "session" | "unit" | "interaction";

export interface SearchResult {
  type: CanonicalSearchType;
  id: string;
  title: string;
  snippet: string;
  score: number;
  matchedFields: string[];
}

interface TagDefinition {
  id: string;
  label: string;
  aliases?: string[];
}

interface TagsFile {
  tags: TagDefinition[];
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

interface UnitItem {
  id: string;
  title?: string;
  summary?: string;
  tags?: string[];
  sourceId?: string;
  sourceType?: "decision" | "pattern" | "rule";
  status?: "pending" | "approved" | "rejected";
}

interface UnitFile {
  items?: UnitItem[];
}

type StatementLike = {
  all: (...args: unknown[]) => unknown[];
};

export type QueryableDb = {
  prepare: (sql: string) => StatementLike;
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function loadTags(mnemeDir: string): TagsFile | null {
  const tagsPath = path.join(mnemeDir, "tags.json");
  if (!fs.existsSync(tagsPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(tagsPath, "utf-8")) as TagsFile;
  } catch {
    return null;
  }
}

function expandKeywordsWithAliases(
  keywords: string[],
  tags: TagsFile | null,
): string[] {
  if (!tags) return keywords;

  const expanded = new Set(keywords.map((k) => k.toLowerCase()));
  for (const keyword of keywords) {
    const lowerKeyword = keyword.toLowerCase();
    for (const tag of tags.tags) {
      const matches =
        tag.id.toLowerCase() === lowerKeyword ||
        tag.label.toLowerCase() === lowerKeyword ||
        tag.aliases?.some((alias) => alias.toLowerCase() === lowerKeyword);
      if (!matches) continue;
      expanded.add(tag.id.toLowerCase());
      expanded.add(tag.label.toLowerCase());
      for (const alias of tag.aliases || []) {
        expanded.add(alias.toLowerCase());
      }
    }
  }

  return Array.from(expanded);
}

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

function walkJsonFiles(
  dir: string,
  callback: (filePath: string) => void,
): void {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkJsonFiles(fullPath, callback);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".json")) {
      callback(fullPath);
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

      if (title && pattern.test(title)) {
        score += 3;
        matchedFields.push("title");
      }
      if (session.tags?.some((t) => pattern.test(t))) {
        score += 1;
        matchedFields.push("tags");
      }
      if (session.summary?.goal && pattern.test(session.summary.goal)) {
        score += 2;
        matchedFields.push("summary.goal");
      }
      if (
        session.summary?.description &&
        pattern.test(session.summary.description)
      ) {
        score += 2;
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
      // Skip invalid JSON.
    }
  });

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

function searchUnits(mnemeDir: string, keywords: string[], limit = 5) {
  const unitsPath = path.join(mnemeDir, "units", "units.json");
  const results: SearchResult[] = [];
  const pattern = new RegExp(keywords.map(escapeRegex).join("|"), "i");
  if (!fs.existsSync(unitsPath)) return results;

  try {
    const cards = JSON.parse(fs.readFileSync(unitsPath, "utf-8")) as UnitFile;
    const items = (cards.items || []).filter(
      (item) => item.status === "approved",
    );
    for (const item of items) {
      let score = 0;
      const matchedFields: string[] = [];
      if (item.title && pattern.test(item.title)) {
        score += 3;
        matchedFields.push("title");
      }
      if (item.summary && pattern.test(item.summary)) {
        score += 2;
        matchedFields.push("summary");
      }
      if (item.tags?.some((tag) => pattern.test(tag))) {
        score += 1;
        matchedFields.push("tags");
      }
      if (item.sourceType && pattern.test(item.sourceType)) {
        score += 1;
        matchedFields.push("sourceType");
      }

      if (score > 0) {
        results.push({
          type: "unit",
          id: item.id,
          title: item.title || item.id,
          snippet: item.summary || "",
          score,
          matchedFields,
        });
      }
    }
  } catch {
    // Skip invalid JSON.
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

function normalizeRequestedTypes(
  types: SearchType[],
): Set<CanonicalSearchType> {
  const normalized = new Set<CanonicalSearchType>();
  for (const type of types) {
    normalized.add(type);
  }
  return normalized;
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
    types = ["session", "unit", "interaction"],
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

  const normalizedTypes = normalizeRequestedTypes(types);

  if (normalizedTypes.has("session")) {
    results.push(...searchSessions(mnemeDir, expandedKeywords, fetchLimit));
  }
  if (normalizedTypes.has("unit")) {
    results.push(...searchUnits(mnemeDir, expandedKeywords, fetchLimit));
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
