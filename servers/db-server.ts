#!/usr/bin/env node
/**
 * memoria MCP Database Server
 *
 * Provides direct database access for:
 * - Cross-project queries
 * - Session/interaction retrieval
 * - Statistics and analytics
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
interface ProjectInfo {
  projectPath: string;
  repository: string | null;
  sessionCount: number;
  interactionCount: number;
  lastActivity: string;
}

interface SessionInfo {
  sessionId: string;
  projectPath: string;
  repository: string | null;
  owner: string;
  messageCount: number;
  startedAt: string;
  lastMessageAt: string;
}

interface Interaction {
  id: number;
  sessionId: string;
  projectPath: string;
  owner: string;
  role: string;
  content: string;
  thinking: string | null;
  toolCalls: string | null;
  timestamp: string;
}

interface Stats {
  totalProjects: number;
  totalSessions: number;
  totalInteractions: number;
  totalThinkingBlocks: number;
  projectStats: Array<{
    projectPath: string;
    repository: string | null;
    sessions: number;
    interactions: number;
  }>;
  recentActivity: Array<{
    date: string;
    sessions: number;
    interactions: number;
  }>;
}

// Environment
const MEMORIA_DATA_DIR =
  process.env.MEMORIA_DATA_DIR ||
  path.join(process.env.HOME || "", ".claude/memoria");
const GLOBAL_DB_PATH = path.join(MEMORIA_DATA_DIR, "global.db");

// Database connection (lazy initialization)
let db: DatabaseSyncType | null = null;

function getDb(): DatabaseSyncType | null {
  if (db) return db;

  if (!fs.existsSync(GLOBAL_DB_PATH)) {
    return null;
  }

  try {
    db = new DatabaseSync(GLOBAL_DB_PATH);
    db.exec("PRAGMA journal_mode = WAL");
    return db;
  } catch {
    return null;
  }
}

// Database functions
function listProjects(): ProjectInfo[] {
  const database = getDb();
  if (!database) return [];

  try {
    const stmt = database.prepare(`
      SELECT
        project_path,
        repository,
        COUNT(DISTINCT session_id) as session_count,
        COUNT(*) as interaction_count,
        MAX(timestamp) as last_activity
      FROM interactions
      GROUP BY project_path
      ORDER BY last_activity DESC
    `);

    const rows = stmt.all() as Array<{
      project_path: string;
      repository: string | null;
      session_count: number;
      interaction_count: number;
      last_activity: string;
    }>;

    return rows.map((row) => ({
      projectPath: row.project_path,
      repository: row.repository,
      sessionCount: row.session_count,
      interactionCount: row.interaction_count,
      lastActivity: row.last_activity,
    }));
  } catch {
    return [];
  }
}

function listSessions(options: {
  projectPath?: string;
  repository?: string;
  limit?: number;
}): SessionInfo[] {
  const database = getDb();
  if (!database) return [];

  const { projectPath, repository, limit = 20 } = options;

  try {
    let sql = `
      SELECT
        session_id,
        project_path,
        repository,
        owner,
        COUNT(*) as message_count,
        MIN(timestamp) as started_at,
        MAX(timestamp) as last_message_at
      FROM interactions
      WHERE 1=1
    `;
    const params: (string | number)[] = [];

    if (projectPath) {
      sql += " AND project_path = ?";
      params.push(projectPath);
    }

    if (repository) {
      sql += " AND repository = ?";
      params.push(repository);
    }

    sql += `
      GROUP BY session_id
      ORDER BY last_message_at DESC
      LIMIT ?
    `;
    params.push(limit);

    const stmt = database.prepare(sql);
    const rows = stmt.all(...params) as Array<{
      session_id: string;
      project_path: string;
      repository: string | null;
      owner: string;
      message_count: number;
      started_at: string;
      last_message_at: string;
    }>;

    return rows.map((row) => ({
      sessionId: row.session_id,
      projectPath: row.project_path,
      repository: row.repository,
      owner: row.owner,
      messageCount: row.message_count,
      startedAt: row.started_at,
      lastMessageAt: row.last_message_at,
    }));
  } catch {
    return [];
  }
}

function getInteractions(
  sessionId: string,
  options: { limit?: number; offset?: number } = {},
): Interaction[] {
  const database = getDb();
  if (!database) return [];

  const { limit = 50, offset = 0 } = options;

  try {
    const stmt = database.prepare(`
      SELECT
        id,
        session_id,
        project_path,
        owner,
        role,
        content,
        thinking,
        tool_calls,
        timestamp
      FROM interactions
      WHERE session_id = ?
      ORDER BY timestamp ASC
      LIMIT ? OFFSET ?
    `);

    const rows = stmt.all(sessionId, limit, offset) as Array<{
      id: number;
      session_id: string;
      project_path: string;
      owner: string;
      role: string;
      content: string;
      thinking: string | null;
      tool_calls: string | null;
      timestamp: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      projectPath: row.project_path,
      owner: row.owner,
      role: row.role,
      content: row.content,
      thinking: row.thinking,
      toolCalls: row.tool_calls,
      timestamp: row.timestamp,
    }));
  } catch {
    return [];
  }
}

function getStats(): Stats | null {
  const database = getDb();
  if (!database) return null;

  try {
    // Overall stats
    const overallStmt = database.prepare(`
      SELECT
        COUNT(DISTINCT project_path) as total_projects,
        COUNT(DISTINCT session_id) as total_sessions,
        COUNT(*) as total_interactions,
        COUNT(thinking) as total_thinking
      FROM interactions
    `);
    const overall = overallStmt.get() as {
      total_projects: number;
      total_sessions: number;
      total_interactions: number;
      total_thinking: number;
    };

    // Per-project stats
    const projectStmt = database.prepare(`
      SELECT
        project_path,
        repository,
        COUNT(DISTINCT session_id) as sessions,
        COUNT(*) as interactions
      FROM interactions
      GROUP BY project_path
      ORDER BY interactions DESC
      LIMIT 10
    `);
    const projectRows = projectStmt.all() as Array<{
      project_path: string;
      repository: string | null;
      sessions: number;
      interactions: number;
    }>;

    // Recent activity (last 7 days)
    const activityStmt = database.prepare(`
      SELECT
        DATE(timestamp) as date,
        COUNT(DISTINCT session_id) as sessions,
        COUNT(*) as interactions
      FROM interactions
      WHERE timestamp >= datetime('now', '-7 days')
      GROUP BY DATE(timestamp)
      ORDER BY date DESC
    `);
    const activityRows = activityStmt.all() as Array<{
      date: string;
      sessions: number;
      interactions: number;
    }>;

    return {
      totalProjects: overall.total_projects,
      totalSessions: overall.total_sessions,
      totalInteractions: overall.total_interactions,
      totalThinkingBlocks: overall.total_thinking,
      projectStats: projectRows.map((row) => ({
        projectPath: row.project_path,
        repository: row.repository,
        sessions: row.sessions,
        interactions: row.interactions,
      })),
      recentActivity: activityRows,
    };
  } catch {
    return null;
  }
}

function crossProjectSearch(
  query: string,
  options: { limit?: number } = {},
): Array<{
  sessionId: string;
  projectPath: string;
  repository: string | null;
  snippet: string;
  timestamp: string;
}> {
  const database = getDb();
  if (!database) return [];

  const { limit = 10 } = options;

  try {
    // Try FTS5 first
    const ftsStmt = database.prepare(`
      SELECT
        i.session_id,
        i.project_path,
        i.repository,
        snippet(interactions_fts, 0, '[', ']', '...', 32) as snippet,
        i.timestamp
      FROM interactions_fts
      JOIN interactions i ON interactions_fts.rowid = i.id
      WHERE interactions_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `);

    const rows = ftsStmt.all(query, limit) as Array<{
      session_id: string;
      project_path: string;
      repository: string | null;
      snippet: string;
      timestamp: string;
    }>;

    return rows.map((row) => ({
      sessionId: row.session_id,
      projectPath: row.project_path,
      repository: row.repository,
      snippet: row.snippet,
      timestamp: row.timestamp,
    }));
  } catch {
    // FTS5 failed, fallback to LIKE
    try {
      const likeStmt = database.prepare(`
        SELECT DISTINCT
          session_id,
          project_path,
          repository,
          substr(content, 1, 100) as snippet,
          timestamp
        FROM interactions
        WHERE content LIKE ? OR thinking LIKE ?
        ORDER BY timestamp DESC
        LIMIT ?
      `);

      const pattern = `%${query}%`;
      const rows = likeStmt.all(pattern, pattern, limit) as Array<{
        session_id: string;
        project_path: string;
        repository: string | null;
        snippet: string;
        timestamp: string;
      }>;

      return rows.map((row) => ({
        sessionId: row.session_id,
        projectPath: row.project_path,
        repository: row.repository,
        snippet: row.snippet,
        timestamp: row.timestamp,
      }));
    } catch {
      return [];
    }
  }
}

// MCP Server setup
const server = new McpServer({
  name: "memoria-db",
  version: "0.1.0",
});

// Tool: memoria_list_projects
server.registerTool(
  "memoria_list_projects",
  {
    description:
      "List all projects tracked in memoria's global database with session counts and last activity",
    inputSchema: {},
  },
  async () => {
    const projects = listProjects();
    return {
      content: [{ type: "text", text: JSON.stringify(projects, null, 2) }],
    };
  },
);

// Tool: memoria_list_sessions
server.registerTool(
  "memoria_list_sessions",
  {
    description: "List sessions, optionally filtered by project or repository",
    inputSchema: {
      projectPath: z.string().optional().describe("Filter by project path"),
      repository: z
        .string()
        .optional()
        .describe("Filter by repository (owner/repo)"),
      limit: z.number().optional().describe("Maximum results (default: 20)"),
    },
  },
  async ({ projectPath, repository, limit }) => {
    const sessions = listSessions({ projectPath, repository, limit });
    return {
      content: [{ type: "text", text: JSON.stringify(sessions, null, 2) }],
    };
  },
);

// Tool: memoria_get_interactions
server.registerTool(
  "memoria_get_interactions",
  {
    description: "Get conversation interactions for a specific session",
    inputSchema: {
      sessionId: z.string().describe("Session ID (full UUID or short form)"),
      limit: z.number().optional().describe("Maximum messages (default: 50)"),
      offset: z
        .number()
        .optional()
        .describe("Offset for pagination (default: 0)"),
    },
  },
  async ({ sessionId, limit, offset }) => {
    const interactions = getInteractions(sessionId, { limit, offset });
    if (interactions.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No interactions found for session: ${sessionId}`,
          },
        ],
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(interactions, null, 2) }],
    };
  },
);

// Tool: memoria_stats
server.registerTool(
  "memoria_stats",
  {
    description:
      "Get statistics across all projects: total counts, per-project breakdown, recent activity",
    inputSchema: {},
  },
  async () => {
    const stats = getStats();
    if (!stats) {
      return {
        content: [{ type: "text", text: "Database not available" }],
        isError: true,
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(stats, null, 2) }],
    };
  },
);

// Tool: memoria_cross_project_search
server.registerTool(
  "memoria_cross_project_search",
  {
    description:
      "Search interactions across ALL projects (not just current). Uses FTS5 for fast full-text search.",
    inputSchema: {
      query: z.string().describe("Search query"),
      limit: z.number().optional().describe("Maximum results (default: 10)"),
    },
  },
  async ({ query, limit }) => {
    const results = crossProjectSearch(query, { limit });
    return {
      content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
    };
  },
);

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("memoria-db MCP server running");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
