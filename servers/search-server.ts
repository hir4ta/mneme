#!/usr/bin/env node

import "../lib/suppress-sqlite-warning.js";

import * as fs from "node:fs";
import * as path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  type QueryableDb,
  type SearchType,
  searchKnowledge,
} from "../lib/search/core.js";

const { DatabaseSync } = await import("node:sqlite");
type DatabaseSyncType = InstanceType<typeof DatabaseSync>;

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

const SEARCH_LIMIT_MIN = 1;
const SEARCH_LIMIT_MAX = 100;
const SEARCH_OFFSET_MIN = 0;
const QUERY_MAX_LENGTH = 500;

function ok(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function fail(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true as const,
  };
}

function getProjectPath(): string {
  return process.env.MNEME_PROJECT_PATH || process.cwd();
}

function getMnemeDir(): string {
  return path.join(getProjectPath(), ".mneme");
}

function getLocalDbPath(): string {
  return path.join(getMnemeDir(), "local.db");
}

let db: DatabaseSyncType | null = null;

function getDb(): DatabaseSyncType | null {
  if (db) return db;
  const dbPath = getLocalDbPath();
  if (!fs.existsSync(dbPath)) return null;
  try {
    db = new DatabaseSync(dbPath);
    db.exec("PRAGMA journal_mode = WAL");
    return db;
  } catch {
    return null;
  }
}

function search(
  query: string,
  options: { types?: SearchType[]; limit?: number; offset?: number } = {},
) {
  return searchKnowledge({
    query,
    mnemeDir: getMnemeDir(),
    projectPath: getProjectPath(),
    database: getDb() as QueryableDb | null,
    types: options.types,
    limit: options.limit,
    offset: options.offset,
  });
}

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
          const session = JSON.parse(
            fs.readFileSync(fullPath, "utf-8"),
          ) as SessionFile;
          if (session.id === sessionId) return session;
        } catch {
          // Skip invalid JSON.
        }
      }
    }
    return null;
  }

  return findSession(sessionsDir);
}

const server = new McpServer({
  name: "mneme-search",
  version: "0.1.0",
});

server.registerTool(
  "mneme_search",
  {
    description: "Search mneme's knowledge base for sessions and interactions.",
    inputSchema: {
      query: z
        .string()
        .max(QUERY_MAX_LENGTH)
        .describe("Search query (keywords)"),
      types: z
        .array(z.enum(["session", "interaction"]))
        .optional()
        .describe("Types to search (default: session/interaction)."),
      limit: z
        .number()
        .int()
        .min(SEARCH_LIMIT_MIN)
        .max(SEARCH_LIMIT_MAX)
        .optional()
        .describe(
          `Maximum results per page (${SEARCH_LIMIT_MIN}-${SEARCH_LIMIT_MAX}, default: 10)`,
        ),
      offset: z
        .number()
        .int()
        .min(SEARCH_OFFSET_MIN)
        .optional()
        .describe(
          "Pagination offset (default: 0). For 50-unit paging: 0, 50, 100, ...",
        ),
    },
  },
  async ({ query, types, limit, offset }) => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return fail("Query must not be empty.");
    }
    try {
      const pageLimit = limit ?? 10;
      const pageOffset = offset ?? 0;
      const results = search(trimmedQuery, {
        types,
        limit: pageLimit + 1,
        offset: pageOffset,
      });
      const hasMore = results.length > pageLimit;
      const pageResults = hasMore ? results.slice(0, pageLimit) : results;
      const payload = {
        items: pageResults,
        page: {
          limit: pageLimit,
          offset: pageOffset,
          returned: pageResults.length,
          hasMore,
          nextOffset: hasMore ? pageOffset + pageLimit : null,
        },
      };
      return ok(JSON.stringify(payload, null, 2));
    } catch (error) {
      return fail(`Search failed: ${String(error)}`);
    }
  },
);

server.registerTool(
  "mneme_get_session",
  {
    description: "Get full details of a specific session by ID",
    inputSchema: {
      sessionId: z.string().describe("Session ID"),
    },
  },
  async ({ sessionId }) => {
    if (!sessionId.trim()) {
      return fail("sessionId must not be empty.");
    }
    const session = getSession(sessionId);
    if (!session) {
      return fail(`Session not found: ${sessionId}`);
    }
    return ok(JSON.stringify(session, null, 2));
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mneme-search MCP server running");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
