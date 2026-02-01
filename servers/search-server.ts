#!/usr/bin/env node

/**
 * mneme MCP Search Server
 *
 * Provides fast, unified search across mneme's knowledge base:
 * - SQLite FTS5 for interactions
 * - JSON file search for sessions, decisions, patterns
 * - Tag alias resolution
 * - Unified scoring
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Suppress Node.js SQLite experimental warning
const originalEmit = process.emit;
// @ts-expect-error - Suppressing experimental warning
process.emit = (event, ...args) => {
  if (
    event === "warning" &&
    typeof args[0] === "object" &&
    args[0] !== null &&
    "name" in args[0] &&
    (args[0] as { name: string }).name === "ExperimentalWarning" &&
    "message" in args[0] &&
    typeof (args[0] as { message: string }).message === "string" &&
    (args[0] as { message: string }).message.includes("SQLite")
  ) {
    return false;
  }
  return originalEmit.apply(process, [event, ...args] as unknown as Parameters<
    typeof process.emit
  >);
};

// Import after warning suppression is set up
const { DatabaseSync } = await import("node:sqlite");
type DatabaseSyncType = InstanceType<typeof DatabaseSync>;

// Types
interface SearchResult {
  type: "session" | "decision" | "pattern" | "interaction";
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

interface DecisionFile {
  id: string;
  title?: string;
  decision?: string;
  reasoning?: string;
  tags?: string[];
}

interface PatternFile {
  patterns?: Array<{
    errorPattern?: string;
    solution?: string;
    tags?: string[];
  }>;
}

// Get project path from env or current working directory
function getProjectPath(): string {
  return process.env.MNEME_PROJECT_PATH || process.cwd();
}

function getMnemeDir(): string {
  return path.join(getProjectPath(), ".mneme");
}

function getLocalDbPath(): string {
  return path.join(getMnemeDir(), "local.db");
}

// Database connection (lazy initialization)
let db: DatabaseSyncType | null = null;

function getDb(): DatabaseSyncType | null {
  if (db) return db;

  const dbPath = getLocalDbPath();
  if (!fs.existsSync(dbPath)) {
    return null;
  }

  try {
    db = new DatabaseSync(dbPath);
    db.exec("PRAGMA journal_mode = WAL");
    return db;
  } catch {
    return null;
  }
}

// Tag alias resolution
function loadTags(): TagsFile | null {
  const tagsPath = path.join(getMnemeDir(), "tags.json");
  if (!fs.existsSync(tagsPath)) return null;

  try {
    const content = fs.readFileSync(tagsPath, "utf-8");
    return JSON.parse(content) as TagsFile;
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
        tag.aliases?.some((a) => a.toLowerCase() === lowerKeyword);

      if (matches) {
        expanded.add(tag.id.toLowerCase());
        expanded.add(tag.label.toLowerCase());
        for (const alias of tag.aliases || []) {
          expanded.add(alias.toLowerCase());
        }
      }
    }
  }

  return Array.from(expanded);
}

// Search functions
function searchInteractions(
  keywords: string[],
  projectPath: string,
  limit = 5,
): SearchResult[] {
  const database = getDb();
  if (!database) return [];

  const results: SearchResult[] = [];

  try {
    // Try FTS5 first
    const ftsQuery = keywords.join(" OR ");
    const ftsStmt = database.prepare(`
      SELECT
        i.session_id,
        i.content,
        i.thinking,
        i.timestamp,
        highlight(interactions_fts, 0, '[', ']') as content_highlight
      FROM interactions_fts
      JOIN interactions i ON interactions_fts.rowid = i.id
      WHERE interactions_fts MATCH ?
        AND i.project_path = ?
      ORDER BY rank
      LIMIT ?
    `);

    const rows = ftsStmt.all(ftsQuery, projectPath, limit) as Array<{
      session_id: string;
      content: string;
      thinking: string | null;
      timestamp: string;
      content_highlight: string;
    }>;

    for (const row of rows) {
      const snippet = row.content_highlight || row.content.substring(0, 100);
      results.push({
        type: "interaction",
        id: row.session_id,
        title: `Interaction from ${row.timestamp}`,
        snippet: snippet.substring(0, 150),
        score: 5,
        matchedFields: ["content"],
      });
    }
  } catch {
    // FTS5 failed, fallback to LIKE
    try {
      const likePattern = `%${keywords.join("%")}%`;
      const stmt = database.prepare(`
        SELECT DISTINCT session_id, substr(content, 1, 100) as snippet, timestamp
        FROM interactions
        WHERE project_path = ?
          AND (content LIKE ? OR thinking LIKE ?)
        ORDER BY timestamp DESC
        LIMIT ?
      `);

      const rows = stmt.all(
        projectPath,
        likePattern,
        likePattern,
        limit,
      ) as Array<{
        session_id: string;
        snippet: string;
        timestamp: string;
      }>;

      for (const row of rows) {
        results.push({
          type: "interaction",
          id: row.session_id,
          title: `Interaction from ${row.timestamp}`,
          snippet: row.snippet,
          score: 3,
          matchedFields: ["content"],
        });
      }
    } catch {
      // Database error, return empty
    }
  }

  return results;
}

function searchSessions(keywords: string[], limit = 5): SearchResult[] {
  const sessionsDir = path.join(getMnemeDir(), "sessions");
  if (!fs.existsSync(sessionsDir)) return [];

  const results: SearchResult[] = [];
  const pattern = new RegExp(keywords.join("|"), "i");

  function walkDir(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.name.endsWith(".json")) {
        try {
          const content = fs.readFileSync(fullPath, "utf-8");
          const session = JSON.parse(content) as SessionFile;

          let score = 0;
          const matchedFields: string[] = [];

          // Score title matches higher
          const title = session.title || session.summary?.title || "";
          if (title && pattern.test(title)) {
            score += 3;
            matchedFields.push("title");
          }

          // Check tags
          if (session.tags?.some((t) => pattern.test(t))) {
            score += 1;
            matchedFields.push("tags");
          }

          // Check summary
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

          // Check discussions
          if (
            session.discussions?.some(
              (d) =>
                pattern.test(d.topic || "") || pattern.test(d.decision || ""),
            )
          ) {
            score += 2;
            matchedFields.push("discussions");
          }

          // Check errors
          if (
            session.errors?.some(
              (e) =>
                pattern.test(e.error || "") || pattern.test(e.solution || ""),
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
              snippet:
                session.summary?.description || session.summary?.goal || "",
              score,
              matchedFields,
            });
          }
        } catch {
          // Skip invalid files
        }
      }
    }
  }

  walkDir(sessionsDir);

  // Sort by score and limit
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

function searchDecisions(keywords: string[], limit = 5): SearchResult[] {
  const decisionsDir = path.join(getMnemeDir(), "decisions");
  if (!fs.existsSync(decisionsDir)) return [];

  const results: SearchResult[] = [];
  const pattern = new RegExp(keywords.join("|"), "i");

  function walkDir(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.name.endsWith(".json")) {
        try {
          const content = fs.readFileSync(fullPath, "utf-8");
          const decision = JSON.parse(content) as DecisionFile;

          let score = 0;
          const matchedFields: string[] = [];

          if (decision.title && pattern.test(decision.title)) {
            score += 3;
            matchedFields.push("title");
          }

          if (decision.decision && pattern.test(decision.decision)) {
            score += 2;
            matchedFields.push("decision");
          }

          if (decision.reasoning && pattern.test(decision.reasoning)) {
            score += 2;
            matchedFields.push("reasoning");
          }

          if (decision.tags?.some((t) => pattern.test(t))) {
            score += 1;
            matchedFields.push("tags");
          }

          if (score > 0) {
            results.push({
              type: "decision",
              id: decision.id,
              title: decision.title || decision.id,
              snippet: decision.decision || "",
              score,
              matchedFields,
            });
          }
        } catch {
          // Skip invalid files
        }
      }
    }
  }

  walkDir(decisionsDir);

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

function searchPatterns(keywords: string[], limit = 5): SearchResult[] {
  const patternsDir = path.join(getMnemeDir(), "patterns");
  if (!fs.existsSync(patternsDir)) return [];

  const results: SearchResult[] = [];
  const pattern = new RegExp(keywords.join("|"), "i");

  const files = fs.readdirSync(patternsDir).filter((f) => f.endsWith(".json"));

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(patternsDir, file), "utf-8");
      const patternFile = JSON.parse(content) as PatternFile;

      for (const p of patternFile.patterns || []) {
        let score = 0;
        const matchedFields: string[] = [];

        if (p.errorPattern && pattern.test(p.errorPattern)) {
          score += 3;
          matchedFields.push("errorPattern");
        }

        if (p.solution && pattern.test(p.solution)) {
          score += 2;
          matchedFields.push("solution");
        }

        if (p.tags?.some((t) => pattern.test(t))) {
          score += 1;
          matchedFields.push("tags");
        }

        if (score > 0) {
          results.push({
            type: "pattern",
            id: `${file}:${p.errorPattern?.substring(0, 20)}`,
            title: p.errorPattern?.substring(0, 50) || "Pattern",
            snippet: p.solution || "",
            score,
            matchedFields,
          });
        }
      }
    } catch {
      // Skip invalid files
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

// Unified search
function search(
  query: string,
  options: { types?: string[]; limit?: number } = {},
): SearchResult[] {
  const {
    types = ["session", "decision", "pattern", "interaction"],
    limit = 10,
  } = options;

  // Extract keywords
  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);

  if (keywords.length === 0) return [];

  // Expand with tag aliases
  const tags = loadTags();
  const expandedKeywords = expandKeywordsWithAliases(keywords, tags);

  const results: SearchResult[] = [];
  const projectPath = getProjectPath();

  // Search each type
  if (types.includes("session")) {
    results.push(...searchSessions(expandedKeywords, limit));
  }

  if (types.includes("decision")) {
    results.push(...searchDecisions(expandedKeywords, limit));
  }

  if (types.includes("pattern")) {
    results.push(...searchPatterns(expandedKeywords, limit));
  }

  if (types.includes("interaction")) {
    results.push(...searchInteractions(expandedKeywords, projectPath, limit));
  }

  // Sort by score and deduplicate
  const seen = new Set<string>();
  return results
    .sort((a, b) => b.score - a.score)
    .filter((r) => {
      const key = `${r.type}:${r.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

// Get specific items
function getSession(sessionId: string): SessionFile | null {
  const sessionsDir = path.join(getMnemeDir(), "sessions");
  if (!fs.existsSync(sessionsDir)) return null;

  function findSession(dir: string): SessionFile | null {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const result = findSession(fullPath);
        if (result) return result;
      } else if (entry.name.endsWith(".json")) {
        try {
          const content = fs.readFileSync(fullPath, "utf-8");
          const session = JSON.parse(content) as SessionFile;
          if (session.id === sessionId) return session;
        } catch {
          // Skip
        }
      }
    }
    return null;
  }

  return findSession(sessionsDir);
}

function getDecision(decisionId: string): DecisionFile | null {
  const decisionsDir = path.join(getMnemeDir(), "decisions");
  if (!fs.existsSync(decisionsDir)) return null;

  function findDecision(dir: string): DecisionFile | null {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const result = findDecision(fullPath);
        if (result) return result;
      } else if (entry.name.endsWith(".json")) {
        try {
          const content = fs.readFileSync(fullPath, "utf-8");
          const decision = JSON.parse(content) as DecisionFile;
          if (decision.id === decisionId) return decision;
        } catch {
          // Skip
        }
      }
    }
    return null;
  }

  return findDecision(decisionsDir);
}

// MCP Server setup
const server = new McpServer({
  name: "mneme-search",
  version: "0.1.0",
});

// Tool: mneme_search
server.registerTool(
  "mneme_search",
  {
    description:
      "Search mneme's knowledge base for sessions, decisions, patterns, and interactions. Returns scored results with matched fields.",
    inputSchema: {
      query: z.string().describe("Search query (keywords)"),
      types: z
        .array(z.enum(["session", "decision", "pattern", "interaction"]))
        .optional()
        .describe("Types to search (default: all)"),
      limit: z.number().optional().describe("Maximum results (default: 10)"),
    },
  },
  async ({ query, types, limit }) => {
    const results = search(query, { types, limit });
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(results, null, 2),
        },
      ],
    };
  },
);

// Tool: mneme_get_session
server.registerTool(
  "mneme_get_session",
  {
    description: "Get full details of a specific session by ID",
    inputSchema: {
      sessionId: z.string().describe("Session ID"),
    },
  },
  async ({ sessionId }) => {
    const session = getSession(sessionId);
    if (!session) {
      return {
        content: [{ type: "text", text: `Session not found: ${sessionId}` }],
        isError: true,
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(session, null, 2) }],
    };
  },
);

// Tool: mneme_get_decision
server.registerTool(
  "mneme_get_decision",
  {
    description: "Get full details of a specific decision by ID",
    inputSchema: {
      decisionId: z.string().describe("Decision ID"),
    },
  },
  async ({ decisionId }) => {
    const decision = getDecision(decisionId);
    if (!decision) {
      return {
        content: [{ type: "text", text: `Decision not found: ${decisionId}` }],
        isError: true,
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(decision, null, 2) }],
    };
  },
);

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mneme-search MCP server running");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
