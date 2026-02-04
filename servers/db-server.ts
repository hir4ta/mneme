#!/usr/bin/env node
/**
 * mneme MCP Database Server
 *
 * Provides direct database access for:
 * - Cross-project queries
 * - Session/interaction retrieval
 * - Statistics and analytics
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as readline from "node:readline";
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
  claudeSessionId: string | null;
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

// Get project path from env or current working directory
function getProjectPath(): string {
  return process.env.MNEME_PROJECT_PATH || process.cwd();
}

function getLocalDbPath(): string {
  return path.join(getProjectPath(), ".mneme", "local.db");
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
        claude_session_id,
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
      claude_session_id: string | null;
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
      claudeSessionId: row.claude_session_id,
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

// Helper: Get transcript path from Claude session ID
function getTranscriptPath(claudeSessionId: string): string | null {
  const projectPath = getProjectPath();
  // Encode project path: replace / with -
  // Claude Code keeps the leading dash (e.g., -Users-user-Projects-mneme)
  const encodedPath = projectPath.replace(/\//g, "-");

  const transcriptPath = path.join(
    os.homedir(),
    ".claude",
    "projects",
    encodedPath,
    `${claudeSessionId}.jsonl`,
  );

  return fs.existsSync(transcriptPath) ? transcriptPath : null;
}

// Helper: Parse JSONL transcript and extract interactions
interface ParsedInteraction {
  id: string;
  timestamp: string;
  user: string;
  thinking: string;
  assistant: string;
  isCompactSummary: boolean;
}

interface ParsedTranscript {
  interactions: ParsedInteraction[];
  toolUsage: Array<{ name: string; count: number }>;
  files: Array<{ path: string; action: string }>;
  metrics: {
    userMessages: number;
    assistantResponses: number;
    thinkingBlocks: number;
  };
  totalLines: number;
}

async function parseTranscript(
  transcriptPath: string,
): Promise<ParsedTranscript> {
  const fileStream = fs.createReadStream(transcriptPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Number.POSITIVE_INFINITY,
  });

  interface TranscriptEntry {
    type: string;
    timestamp: string;
    message?: {
      role?: string;
      content?:
        | string
        | Array<{
            type: string;
            thinking?: string;
            text?: string;
            name?: string;
            input?: { file_path?: string };
          }>;
    };
    isCompactSummary?: boolean;
  }

  const entries: TranscriptEntry[] = [];
  let totalLines = 0;

  for await (const line of rl) {
    totalLines++;
    if (line.trim()) {
      try {
        entries.push(JSON.parse(line));
      } catch {
        // Skip invalid JSON lines
      }
    }
  }

  // Extract user messages (text only, exclude tool results, local command outputs, and skill expansions)
  const userMessages = entries
    .filter((e) => {
      if (e.type !== "user" || e.message?.role !== "user") return false;
      // Skip skill expansions (isMeta: true) to avoid duplicates
      if ((e as { isMeta?: boolean }).isMeta === true) return false;
      const content = e.message?.content;
      if (typeof content !== "string") return false;
      if (content.startsWith("<local-command-stdout>")) return false;
      if (content.startsWith("<local-command-caveat>")) return false;
      return true;
    })
    .map((e) => ({
      timestamp: e.timestamp,
      content: e.message?.content as string,
      isCompactSummary: e.isCompactSummary || false,
    }));

  // Extract assistant messages with thinking and text
  const assistantMessages = entries
    .filter((e) => e.type === "assistant")
    .map((e) => {
      const contentArray = e.message?.content;
      if (!Array.isArray(contentArray)) return null;

      const thinking = contentArray
        .filter((c) => c.type === "thinking" && c.thinking)
        .map((c) => c.thinking)
        .join("\n");

      const text = contentArray
        .filter((c) => c.type === "text" && c.text)
        .map((c) => c.text)
        .join("\n");

      if (!thinking && !text) return null;

      return {
        timestamp: e.timestamp,
        thinking,
        text,
      };
    })
    .filter((m) => m !== null);

  // Tool usage summary
  const toolUsageMap = new Map<string, number>();
  for (const entry of entries) {
    if (entry.type === "assistant" && Array.isArray(entry.message?.content)) {
      for (const c of entry.message.content) {
        if (c.type === "tool_use" && c.name) {
          toolUsageMap.set(c.name, (toolUsageMap.get(c.name) || 0) + 1);
        }
      }
    }
  }
  const toolUsage = Array.from(toolUsageMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  // File changes
  const filesMap = new Map<string, string>();
  for (const entry of entries) {
    if (entry.type === "assistant" && Array.isArray(entry.message?.content)) {
      for (const c of entry.message.content) {
        if (
          c.type === "tool_use" &&
          (c.name === "Edit" || c.name === "Write")
        ) {
          const filePath = c.input?.file_path;
          if (filePath) {
            filesMap.set(filePath, c.name === "Write" ? "create" : "edit");
          }
        }
      }
    }
  }
  const files = Array.from(filesMap.entries()).map(([p, action]) => ({
    path: p,
    action,
  }));

  // Build interactions by pairing user messages with assistant responses
  const interactions: ParsedInteraction[] = [];
  for (let i = 0; i < userMessages.length; i++) {
    const user = userMessages[i];
    const nextUserTs =
      i + 1 < userMessages.length
        ? userMessages[i + 1].timestamp
        : "9999-12-31T23:59:59Z";

    // Collect all assistant responses between this user message and next
    const turnResponses = assistantMessages.filter(
      (a) => a.timestamp > user.timestamp && a.timestamp < nextUserTs,
    );

    if (turnResponses.length > 0) {
      interactions.push({
        id: `int-${String(i + 1).padStart(3, "0")}`,
        timestamp: user.timestamp,
        user: user.content,
        thinking: turnResponses
          .filter((r) => r.thinking)
          .map((r) => r.thinking)
          .join("\n"),
        assistant: turnResponses
          .filter((r) => r.text)
          .map((r) => r.text)
          .join("\n"),
        isCompactSummary: user.isCompactSummary,
      });
    }
  }

  return {
    interactions,
    toolUsage,
    files,
    metrics: {
      userMessages: userMessages.length,
      assistantResponses: assistantMessages.length,
      thinkingBlocks: assistantMessages.filter((a) => a.thinking).length,
    },
    totalLines,
  };
}

// Save interactions to SQLite
interface SaveInteractionsResult {
  success: boolean;
  savedCount: number;
  mergedFromBackup: number;
  message: string;
}

async function saveInteractions(
  claudeSessionId: string,
  mnemeSessionId?: string,
): Promise<SaveInteractionsResult> {
  const transcriptPath = getTranscriptPath(claudeSessionId);
  if (!transcriptPath) {
    return {
      success: false,
      savedCount: 0,
      mergedFromBackup: 0,
      message: `Transcript not found for session: ${claudeSessionId}`,
    };
  }

  const database = getDb();
  if (!database) {
    return {
      success: false,
      savedCount: 0,
      mergedFromBackup: 0,
      message: "Database not available",
    };
  }

  const projectPath = getProjectPath();
  const sessionId = mnemeSessionId || claudeSessionId.slice(0, 8);

  // Get owner from git or fallback
  let owner = "unknown";
  try {
    const { execSync } = await import("node:child_process");
    owner =
      execSync("git config user.name", {
        encoding: "utf8",
        cwd: projectPath,
      }).trim() || owner;
  } catch {
    try {
      owner = os.userInfo().username || owner;
    } catch {
      // keep default
    }
  }

  // Get repository info
  let repository = "";
  let repositoryUrl = "";
  let repositoryRoot = "";
  try {
    const { execSync } = await import("node:child_process");
    repositoryRoot = execSync("git rev-parse --show-toplevel", {
      encoding: "utf8",
      cwd: projectPath,
    }).trim();
    repositoryUrl = execSync("git remote get-url origin", {
      encoding: "utf8",
      cwd: projectPath,
    }).trim();
    // Extract owner/repo from URL
    const match = repositoryUrl.match(/[:/]([^/]+\/[^/]+?)(\.git)?$/);
    if (match) {
      repository = match[1].replace(/\.git$/, "");
    }
  } catch {
    // Not a git repo
  }

  // Parse transcript
  const parsed = await parseTranscript(transcriptPath);

  // Get backup from pre_compact_backups
  let backupInteractions: ParsedInteraction[] = [];
  try {
    const stmt = database.prepare(`
      SELECT interactions FROM pre_compact_backups
      WHERE session_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `);
    const row = stmt.get(sessionId) as { interactions: string } | undefined;
    if (row?.interactions) {
      backupInteractions = JSON.parse(row.interactions);
    }
  } catch {
    // No backup or parse error
  }

  // Merge backup with new interactions
  const lastBackupTs =
    backupInteractions.length > 0
      ? backupInteractions[backupInteractions.length - 1].timestamp
      : "1970-01-01T00:00:00Z";

  const trulyNew = parsed.interactions.filter(
    (i) => i.timestamp > lastBackupTs,
  );
  const merged = [...backupInteractions, ...trulyNew];

  // Re-number IDs
  const finalInteractions = merged.map((interaction, idx) => ({
    ...interaction,
    id: `int-${String(idx + 1).padStart(3, "0")}`,
  }));

  // Delete existing interactions for this session
  try {
    const deleteStmt = database.prepare(
      "DELETE FROM interactions WHERE session_id = ?",
    );
    deleteStmt.run(sessionId);
  } catch {
    // Ignore delete errors
  }

  // Insert interactions
  const insertStmt = database.prepare(`
    INSERT INTO interactions (
      session_id, claude_session_id, project_path, repository, repository_url, repository_root,
      owner, role, content, thinking, timestamp, is_compact_summary
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let insertedCount = 0;
  for (const interaction of finalInteractions) {
    try {
      // Insert user message
      insertStmt.run(
        sessionId,
        claudeSessionId,
        projectPath,
        repository,
        repositoryUrl,
        repositoryRoot,
        owner,
        "user",
        interaction.user,
        null,
        interaction.timestamp,
        interaction.isCompactSummary ? 1 : 0,
      );
      insertedCount++;

      // Insert assistant response
      if (interaction.assistant) {
        insertStmt.run(
          sessionId,
          claudeSessionId,
          projectPath,
          repository,
          repositoryUrl,
          repositoryRoot,
          owner,
          "assistant",
          interaction.assistant,
          interaction.thinking || null,
          interaction.timestamp,
          0,
        );
        insertedCount++;
      }
    } catch {
      // Skip on insert error
    }
  }

  // Clear pre_compact_backups for this session
  try {
    const clearBackupStmt = database.prepare(
      "DELETE FROM pre_compact_backups WHERE session_id = ?",
    );
    clearBackupStmt.run(sessionId);
  } catch {
    // Ignore
  }

  // Update session_save_state to prevent incremental-save from re-inserting
  // This is critical to avoid duplicate interactions
  try {
    const lastTimestamp =
      finalInteractions.length > 0
        ? finalInteractions[finalInteractions.length - 1].timestamp
        : null;

    const checkStmt = database.prepare(
      "SELECT 1 FROM session_save_state WHERE claude_session_id = ?",
    );
    const exists = checkStmt.get(claudeSessionId);

    if (exists) {
      const updateStmt = database.prepare(`
        UPDATE session_save_state
        SET last_saved_line = ?, last_saved_timestamp = ?, updated_at = datetime('now')
        WHERE claude_session_id = ?
      `);
      updateStmt.run(parsed.totalLines, lastTimestamp, claudeSessionId);
    } else {
      const insertStmt = database.prepare(`
        INSERT INTO session_save_state (claude_session_id, mneme_session_id, project_path, last_saved_line, last_saved_timestamp)
        VALUES (?, ?, ?, ?, ?)
      `);
      insertStmt.run(
        claudeSessionId,
        sessionId,
        projectPath,
        parsed.totalLines,
        lastTimestamp,
      );
    }
  } catch {
    // Ignore session_save_state errors
  }

  return {
    success: true,
    savedCount: insertedCount,
    mergedFromBackup: backupInteractions.length,
    message: `Saved ${insertedCount} interactions (${finalInteractions.length} turns, ${backupInteractions.length} from backup)`,
  };
}

// Mark session as committed (called by /mneme:save)
function markSessionCommitted(claudeSessionId: string): boolean {
  const database = getDb();
  if (!database) return false;

  try {
    // Check if session_save_state table exists and has the session
    const checkStmt = database.prepare(
      "SELECT 1 FROM session_save_state WHERE claude_session_id = ?",
    );
    const exists = checkStmt.get(claudeSessionId);

    if (exists) {
      const stmt = database.prepare(`
        UPDATE session_save_state
        SET is_committed = 1, updated_at = datetime('now')
        WHERE claude_session_id = ?
      `);
      stmt.run(claudeSessionId);
    } else {
      // Create entry if it doesn't exist (legacy support)
      const projectPath = getProjectPath();
      const sessionId = claudeSessionId.slice(0, 8);
      const insertStmt = database.prepare(`
        INSERT INTO session_save_state (claude_session_id, mneme_session_id, project_path, is_committed)
        VALUES (?, ?, ?, 1)
      `);
      insertStmt.run(claudeSessionId, sessionId, projectPath);
    }
    return true;
  } catch {
    return false;
  }
}

// MCP Server setup
const server = new McpServer({
  name: "mneme-db",
  version: "0.1.0",
});

// Tool: mneme_list_projects
server.registerTool(
  "mneme_list_projects",
  {
    description:
      "List all projects tracked in mneme's local database with session counts and last activity",
    inputSchema: {},
  },
  async () => {
    const projects = listProjects();
    return {
      content: [{ type: "text", text: JSON.stringify(projects, null, 2) }],
    };
  },
);

// Tool: mneme_list_sessions
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

// Tool: mneme_get_interactions
server.registerTool(
  "mneme_get_interactions",
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

// Tool: mneme_stats
server.registerTool(
  "mneme_stats",
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

// Tool: mneme_cross_project_search
server.registerTool(
  "mneme_cross_project_search",
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

// Tool: mneme_save_interactions
server.registerTool(
  "mneme_save_interactions",
  {
    description:
      "Save conversation interactions from Claude Code transcript to SQLite. " +
      "Use this during /mneme:save to persist the conversation history. " +
      "Reads the transcript file directly and extracts user/assistant messages.",
    inputSchema: {
      claudeSessionId: z
        .string()
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
    const result = await saveInteractions(claudeSessionId, mnemeSessionId);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
      isError: !result.success,
    };
  },
);

// Tool: mneme_mark_session_committed
server.registerTool(
  "mneme_mark_session_committed",
  {
    description:
      "Mark a session as committed (saved with /mneme:save). " +
      "This prevents the session's interactions from being deleted on SessionEnd. " +
      "Call this after successfully saving session data.",
    inputSchema: {
      claudeSessionId: z
        .string()
        .describe("Full Claude Code session UUID (36 chars)"),
    },
  },
  async ({ claudeSessionId }) => {
    const success = markSessionCommitted(claudeSessionId);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ success, claudeSessionId }, null, 2),
        },
      ],
      isError: !success,
    };
  },
);

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mneme-db MCP server running");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
