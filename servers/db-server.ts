#!/usr/bin/env node
/**
 * mneme MCP Database Server
 *
 * Provides direct database access for:
 * - Cross-project queries
 * - Session/interaction retrieval
 * - Statistics and analytics
 */

import "../lib/suppress-sqlite-warning.js";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  crossProjectSearch,
  getInteractions,
  getStats,
  listProjects,
  listSessions,
} from "./db/queries.js";
import { saveInteractions } from "./db/save.js";
import { registerSessionSummaryTool } from "./db/session-summary.js";
import { registerExtendedTools } from "./db/tools.js";
import {
  fail,
  INTERACTION_OFFSET_MIN,
  LIST_LIMIT_MAX,
  LIST_LIMIT_MIN,
  ok,
  QUERY_MAX_LENGTH,
} from "./db/types.js";
import { getDb } from "./db/utils.js";
import { registerValidateSourcesTool } from "./db/validate-sources.js";

const server = new McpServer({
  name: "mneme-db",
  version: "0.1.0",
});

server.registerTool(
  "mneme_list_projects",
  {
    description: "List all projects with session counts and last activity",
    inputSchema: {},
  },
  async () => {
    if (!getDb()) return fail("Database not available.");
    return ok(JSON.stringify(listProjects(), null, 2));
  },
);

server.registerTool(
  "mneme_list_sessions",
  {
    description: "List sessions, optionally filtered by project or repository",
    inputSchema: {
      projectPath: z.string().optional().describe("Filter by project path"),
      repository: z
        .string()
        .optional()
        .describe("Filter by repository (owner/repo)"),
      limit: z
        .number()
        .int()
        .min(LIST_LIMIT_MIN)
        .max(LIST_LIMIT_MAX)
        .optional()
        .describe(
          `Maximum results (${LIST_LIMIT_MIN}-${LIST_LIMIT_MAX}, default: 20)`,
        ),
    },
  },
  async ({ projectPath, repository, limit }) => {
    if (!getDb()) return fail("Database not available.");
    return ok(
      JSON.stringify(listSessions({ projectPath, repository, limit }), null, 2),
    );
  },
);

server.registerTool(
  "mneme_get_interactions",
  {
    description: "Get conversation interactions for a specific session",
    inputSchema: {
      sessionId: z.string().describe("Session ID (full UUID or short form)"),
      limit: z
        .number()
        .int()
        .min(LIST_LIMIT_MIN)
        .max(LIST_LIMIT_MAX)
        .optional()
        .describe(
          `Maximum messages (${LIST_LIMIT_MIN}-${LIST_LIMIT_MAX}, default: 50)`,
        ),
      offset: z
        .number()
        .int()
        .min(INTERACTION_OFFSET_MIN)
        .optional()
        .describe("Offset for pagination (default: 0)"),
    },
  },
  async ({ sessionId, limit, offset }) => {
    if (!sessionId.trim()) return fail("sessionId must not be empty.");
    if (!getDb()) return fail("Database not available.");
    const interactions = getInteractions(sessionId, { limit, offset });
    if (interactions.length === 0)
      return fail(`No interactions found for session: ${sessionId}`);
    return ok(JSON.stringify(interactions, null, 2));
  },
);

server.registerTool(
  "mneme_stats",
  {
    description:
      "Get statistics: total counts, per-project breakdown, recent activity",
    inputSchema: {},
  },
  async () => {
    const stats = getStats();
    if (!stats) return fail("Database not available.");
    return ok(JSON.stringify(stats, null, 2));
  },
);

server.registerTool(
  "mneme_cross_project_search",
  {
    description: "Search interactions across all projects via FTS5.",
    inputSchema: {
      query: z.string().max(QUERY_MAX_LENGTH).describe("Search query"),
      limit: z
        .number()
        .int()
        .min(LIST_LIMIT_MIN)
        .max(LIST_LIMIT_MAX)
        .optional()
        .describe(
          `Maximum results (${LIST_LIMIT_MIN}-${LIST_LIMIT_MAX}, default: 10)`,
        ),
    },
  },
  async ({ query, limit }) => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return fail("query must not be empty.");
    if (!getDb()) return fail("Database not available.");
    return ok(
      JSON.stringify(crossProjectSearch(trimmedQuery, { limit }), null, 2),
    );
  },
);

server.registerTool(
  "mneme_save_interactions",
  {
    description: "Save transcript interactions to SQLite for /mneme:save.",
    inputSchema: {
      claudeSessionId: z
        .string()
        .min(8)
        .describe("Full Claude Code session UUID (36 chars)"),
      mnemeSessionId: z
        .string()
        .optional()
        .describe(
          "Mneme session ID (8 chars). If not provided, uses first 8 chars of claudeSessionId",
        ),
    },
  },
  async ({ claudeSessionId, mnemeSessionId }) => {
    if (!claudeSessionId.trim())
      return fail("claudeSessionId must not be empty.");
    const result = await saveInteractions(claudeSessionId, mnemeSessionId);
    return {
      ...ok(JSON.stringify(result, null, 2)),
      isError: !result.success,
    };
  },
);

// Register extended tools
registerSessionSummaryTool(server);
registerExtendedTools(server);
registerValidateSourcesTool(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mneme-db MCP server running");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
