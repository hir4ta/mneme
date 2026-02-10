#!/usr/bin/env node
/**
 * mneme Incremental Save Module
 *
 * Efficiently saves conversation interactions from Claude Code transcript to SQLite.
 * Uses streaming to handle large transcripts without loading everything into memory.
 * Tracks last saved position to enable incremental updates.
 *
 * Usage:
 *   node incremental-save.js --session <claude_session_id> --transcript <path> --project <path>
 */

import "./suppress-sqlite-warning.js";

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as readline from "node:readline";

const { DatabaseSync } = await import("node:sqlite");
type DatabaseSyncType = InstanceType<typeof DatabaseSync>;

// Types
interface TranscriptEntry {
  type: string;
  timestamp: string;
  uuid?: string;
  parentUuid?: string;
  isMeta?: boolean; // true for skill expansions
  message?: {
    role?: string;
    content?:
      | string
      | Array<{
          type: string;
          thinking?: string;
          text?: string;
          name?: string;
          id?: string; // tool_use id
          input?: { file_path?: string; command?: string; pattern?: string };
          tool_use_id?: string;
          content?: string;
          is_error?: boolean;
        }>;
  };
  isCompactSummary?: boolean;
  data?: {
    type?: string;
    hookEvent?: string;
    hookName?: string;
    status?: string;
    toolName?: string;
  };
}

interface ToolResultMeta {
  toolUseId: string;
  toolName?: string;
  success: boolean;
  contentLength?: number;
  filePath?: string;
  lineCount?: number;
}

interface ProgressEvent {
  type: string;
  timestamp: string;
  hookEvent?: string;
  hookName?: string;
  toolName?: string;
}

interface ParsedInteraction {
  timestamp: string;
  user: string;
  thinking: string;
  assistant: string;
  isCompactSummary: boolean;
  toolsUsed: string[];
  toolDetails: Array<{ name: string; detail: unknown }>;
  // New metadata
  inPlanMode?: boolean;
  slashCommand?: string;
  toolResults?: ToolResultMeta[];
  progressEvents?: ProgressEvent[];
}

interface SaveState {
  claudeSessionId: string;
  mnemeSessionId: string;
  projectPath: string;
  lastSavedTimestamp: string | null;
  lastSavedLine: number;
  isCommitted: number;
}

interface SaveResult {
  success: boolean;
  savedCount: number;
  totalCount: number;
  message: string;
}

// Get schema path - try multiple locations
function getSchemaPath(): string | null {
  const scriptDir = path.dirname(new URL(import.meta.url).pathname);
  const candidates = [
    path.join(scriptDir, "schema.sql"),
    path.join(scriptDir, "..", "lib", "schema.sql"),
    path.join(scriptDir, "..", "..", "lib", "schema.sql"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

// Fallback schema for when schema.sql is not found
const FALLBACK_SCHEMA = `
CREATE TABLE IF NOT EXISTS interactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    claude_session_id TEXT,
    project_path TEXT NOT NULL,
    repository TEXT,
    repository_url TEXT,
    repository_root TEXT,
    owner TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    thinking TEXT,
    tool_calls TEXT,
    timestamp TEXT NOT NULL,
    is_compact_summary INTEGER DEFAULT 0,
    agent_id TEXT,
    agent_type TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_interactions_session ON interactions(session_id);
CREATE INDEX IF NOT EXISTS idx_interactions_claude_session ON interactions(claude_session_id);
CREATE INDEX IF NOT EXISTS idx_interactions_owner ON interactions(owner);
CREATE INDEX IF NOT EXISTS idx_interactions_timestamp ON interactions(timestamp);
CREATE INDEX IF NOT EXISTS idx_interactions_project ON interactions(project_path);
CREATE INDEX IF NOT EXISTS idx_interactions_repository ON interactions(repository);

CREATE TABLE IF NOT EXISTS session_save_state (
    claude_session_id TEXT PRIMARY KEY,
    mneme_session_id TEXT NOT NULL,
    project_path TEXT NOT NULL,
    last_saved_timestamp TEXT,
    last_saved_line INTEGER DEFAULT 0,
    is_committed INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_save_state_mneme_session ON session_save_state(mneme_session_id);
CREATE INDEX IF NOT EXISTS idx_save_state_project ON session_save_state(project_path);

CREATE TABLE IF NOT EXISTS pre_compact_backups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    project_path TEXT NOT NULL,
    owner TEXT NOT NULL,
    interactions TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE VIRTUAL TABLE IF NOT EXISTS interactions_fts USING fts5(
    content,
    thinking,
    content=interactions,
    content_rowid=id,
    tokenize='unicode61'
);

CREATE TRIGGER IF NOT EXISTS interactions_ai AFTER INSERT ON interactions BEGIN
    INSERT INTO interactions_fts(rowid, content, thinking)
    VALUES (new.id, new.content, new.thinking);
END;

CREATE TRIGGER IF NOT EXISTS interactions_ad AFTER DELETE ON interactions BEGIN
    INSERT INTO interactions_fts(interactions_fts, rowid, content, thinking)
    VALUES ('delete', old.id, old.content, old.thinking);
END;
`;

// Initialize database with schema
function initDatabase(dbPath: string): DatabaseSyncType {
  const mnemeDir = path.dirname(dbPath);
  if (!fs.existsSync(mnemeDir)) {
    fs.mkdirSync(mnemeDir, { recursive: true });
  }

  const db = new DatabaseSync(dbPath);

  // Check if database needs initialization
  try {
    db.exec("SELECT 1 FROM interactions LIMIT 1");
  } catch {
    // Table doesn't exist, initialize schema
    const schemaPath = getSchemaPath();
    if (schemaPath) {
      const schema = fs.readFileSync(schemaPath, "utf8");
      db.exec(schema);
      console.error(`[mneme] Database initialized from schema: ${dbPath}`);
    } else {
      // Use fallback schema
      db.exec(FALLBACK_SCHEMA);
      console.error(
        `[mneme] Database initialized with fallback schema: ${dbPath}`,
      );
    }
  }

  // Run migrations for existing databases
  migrateDatabase(db);

  // Configure pragmas
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA synchronous = NORMAL");

  return db;
}

// Migrate database to add new columns if needed
function migrateDatabase(db: DatabaseSyncType): void {
  // Check for claude_session_id column
  try {
    const columns = db
      .prepare("PRAGMA table_info(interactions)")
      .all() as Array<{ name: string }>;
    const hasClaudeSessionId = columns.some(
      (c) => c.name === "claude_session_id",
    );

    if (!hasClaudeSessionId) {
      db.exec("ALTER TABLE interactions ADD COLUMN claude_session_id TEXT");
      db.exec(
        "CREATE INDEX IF NOT EXISTS idx_interactions_claude_session ON interactions(claude_session_id)",
      );
      console.error("[mneme] Migrated: added claude_session_id column");
    }
  } catch {
    // Ignore migration errors
  }

  // Check for session_save_state table
  try {
    db.exec("SELECT 1 FROM session_save_state LIMIT 1");
  } catch {
    // Create session_save_state table
    db.exec(`
      CREATE TABLE IF NOT EXISTS session_save_state (
        claude_session_id TEXT PRIMARY KEY,
        mneme_session_id TEXT NOT NULL,
        project_path TEXT NOT NULL,
        last_saved_timestamp TEXT,
        last_saved_line INTEGER DEFAULT 0,
        is_committed INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_save_state_mneme_session ON session_save_state(mneme_session_id);
      CREATE INDEX IF NOT EXISTS idx_save_state_project ON session_save_state(project_path);
    `);
    console.error("[mneme] Migrated: created session_save_state table");
  }
}

// Get or create save state
function getSaveState(
  db: DatabaseSyncType,
  claudeSessionId: string,
  mnemeSessionId: string,
  projectPath: string,
): SaveState {
  const stmt = db.prepare(
    "SELECT * FROM session_save_state WHERE claude_session_id = ?",
  );
  const row = stmt.get(claudeSessionId) as
    | {
        claude_session_id: string;
        mneme_session_id: string;
        project_path: string;
        last_saved_timestamp: string | null;
        last_saved_line: number;
        is_committed: number;
      }
    | undefined;

  if (row) {
    return {
      claudeSessionId: row.claude_session_id,
      mnemeSessionId: row.mneme_session_id,
      projectPath: row.project_path,
      lastSavedTimestamp: row.last_saved_timestamp,
      lastSavedLine: row.last_saved_line,
      isCommitted: row.is_committed,
    };
  }

  // Create new save state
  const insertStmt = db.prepare(`
    INSERT INTO session_save_state (claude_session_id, mneme_session_id, project_path)
    VALUES (?, ?, ?)
  `);
  insertStmt.run(claudeSessionId, mnemeSessionId, projectPath);

  return {
    claudeSessionId,
    mnemeSessionId,
    projectPath,
    lastSavedTimestamp: null,
    lastSavedLine: 0,
    isCommitted: 0,
  };
}

// Update save state
function updateSaveState(
  db: DatabaseSyncType,
  claudeSessionId: string,
  lastSavedTimestamp: string,
  lastSavedLine: number,
): void {
  const stmt = db.prepare(`
    UPDATE session_save_state
    SET last_saved_timestamp = ?, last_saved_line = ?, updated_at = datetime('now')
    WHERE claude_session_id = ?
  `);
  stmt.run(lastSavedTimestamp, lastSavedLine, claudeSessionId);
}

// Extract slash command from content (e.g., <command-name>/save</command-name>)
function extractSlashCommand(content: string): string | undefined {
  const match = content.match(/<command-name>([^<]+)<\/command-name>/);
  return match ? match[1] : undefined;
}

// Extract tool result metadata (without full content)
function extractToolResultMeta(
  content: Array<{
    type: string;
    tool_use_id?: string;
    content?: string | unknown;
    is_error?: boolean;
  }>,
  toolUseIdToName: Map<string, string>,
): ToolResultMeta[] {
  return content
    .filter((c) => c.type === "tool_result" && c.tool_use_id)
    .map((c) => {
      // Handle content that may be string, object, or undefined
      const contentStr =
        typeof c.content === "string"
          ? c.content
          : c.content
            ? JSON.stringify(c.content)
            : "";
      const lineCount = contentStr.split("\n").length;
      // Try to extract file path from content
      const filePathMatch = contentStr.match(
        /^(?:\s*\d+[→|]\s*)?([^\n]+\.(ts|js|py|json|md|sql|sh|tsx|jsx))/,
      );
      const toolUseId = c.tool_use_id || "";
      return {
        toolUseId,
        toolName: toolUseIdToName.get(toolUseId),
        success: !c.is_error,
        contentLength: contentStr.length,
        lineCount: lineCount > 1 ? lineCount : undefined,
        filePath: filePathMatch ? filePathMatch[1] : undefined,
      };
    });
}

// Parse transcript and extract new interactions (streaming)
async function parseTranscriptIncremental(
  transcriptPath: string,
  lastSavedLine: number,
): Promise<{ interactions: ParsedInteraction[]; totalLines: number }> {
  const fileStream = fs.createReadStream(transcriptPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Number.POSITIVE_INFINITY,
  });

  const entries: TranscriptEntry[] = [];
  let lineNumber = 0;

  for await (const line of rl) {
    lineNumber++;
    if (lineNumber <= lastSavedLine) continue; // Skip already processed lines

    if (line.trim()) {
      try {
        entries.push(JSON.parse(line));
      } catch {
        // Skip invalid JSON lines
      }
    }
  }

  // Track plan mode state based on EnterPlanMode/ExitPlanMode tool calls
  const planModeEvents: Array<{
    timestamp: string;
    entering: boolean;
  }> = [];

  // First pass: collect plan mode events from assistant messages
  for (const entry of entries) {
    if (entry.type === "assistant" && Array.isArray(entry.message?.content)) {
      for (const c of entry.message.content) {
        if (c.type === "tool_use") {
          if (c.name === "EnterPlanMode") {
            planModeEvents.push({ timestamp: entry.timestamp, entering: true });
          } else if (c.name === "ExitPlanMode") {
            planModeEvents.push({
              timestamp: entry.timestamp,
              entering: false,
            });
          }
        }
      }
    }
  }

  // Helper to check if a timestamp is within plan mode
  function isInPlanMode(timestamp: string): boolean {
    let inPlanMode = false;
    for (const event of planModeEvents) {
      if (event.timestamp > timestamp) break;
      inPlanMode = event.entering;
    }
    return inPlanMode;
  }

  // Extract progress events (hooks, MCP, etc.)
  const progressEvents: Map<string, ProgressEvent[]> = new Map();
  for (const entry of entries) {
    if (entry.type === "progress" && entry.data?.type) {
      const event: ProgressEvent = {
        type: entry.data.type,
        timestamp: entry.timestamp,
        hookEvent: entry.data.hookEvent,
        hookName: entry.data.hookName,
        toolName: entry.data.toolName,
      };
      // Group by parent timestamp (approximate)
      const key = entry.timestamp.slice(0, 16); // Group by minute
      if (!progressEvents.has(key)) {
        progressEvents.set(key, []);
      }
      progressEvents.get(key)?.push(event);
    }
  }

  // Extract user messages (text only, exclude tool results, local command outputs, and skill expansions)
  const userMessages = entries
    .filter((e) => {
      if (e.type !== "user" || e.message?.role !== "user") return false;
      // Skip skill expansions (isMeta: true) to avoid duplicates
      if (e.isMeta === true) return false;
      const content = e.message?.content;
      if (typeof content !== "string") return false;
      if (content.startsWith("<local-command-stdout>")) return false;
      if (content.startsWith("<local-command-caveat>")) return false;
      return true;
    })
    .map((e) => {
      const content = e.message?.content as string;
      return {
        timestamp: e.timestamp,
        content,
        isCompactSummary: e.isCompactSummary || false,
        slashCommand: extractSlashCommand(content),
      };
    });

  // Build toolUseId to tool name mapping from assistant messages
  const toolUseIdToName: Map<string, string> = new Map();
  for (const entry of entries) {
    if (entry.type === "assistant" && Array.isArray(entry.message?.content)) {
      for (const c of entry.message.content) {
        if (c.type === "tool_use" && c.id && c.name) {
          toolUseIdToName.set(c.id, c.name);
        }
      }
    }
  }

  // Extract tool results metadata from user messages (tool_result type)
  const toolResultsByTimestamp: Map<string, ToolResultMeta[]> = new Map();
  for (const entry of entries) {
    if (entry.type === "user" && Array.isArray(entry.message?.content)) {
      const results = extractToolResultMeta(
        entry.message.content as Array<{
          type: string;
          tool_use_id?: string;
          content?: string;
          is_error?: boolean;
        }>,
        toolUseIdToName,
      );
      if (results.length > 0) {
        const key = entry.timestamp.slice(0, 16);
        const existing = toolResultsByTimestamp.get(key) || [];
        toolResultsByTimestamp.set(key, [...existing, ...results]);
      }
    }
  }

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

      // Extract tool usage
      const toolDetails = contentArray
        .filter((c) => c.type === "tool_use" && c.name)
        .map((c) => ({
          name: c.name ?? "",
          detail:
            c.name === "Bash"
              ? c.input?.command
              : c.name === "Read" || c.name === "Edit" || c.name === "Write"
                ? c.input?.file_path
                : c.name === "Glob" || c.name === "Grep"
                  ? c.input?.pattern
                  : null,
        }));

      if (!thinking && !text && toolDetails.length === 0) return null;

      return {
        timestamp: e.timestamp,
        thinking,
        text,
        toolDetails,
      };
    })
    .filter((m) => m !== null);

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
      (a) => a.timestamp >= user.timestamp && a.timestamp < nextUserTs,
    );

    if (turnResponses.length > 0) {
      const allToolDetails = turnResponses.flatMap((r) => r.toolDetails);
      const timeKey = user.timestamp.slice(0, 16);

      interactions.push({
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
        toolsUsed: [...new Set(allToolDetails.map((t) => t.name))],
        toolDetails: allToolDetails,
        // New metadata
        inPlanMode: isInPlanMode(user.timestamp) || undefined,
        slashCommand: user.slashCommand,
        toolResults: toolResultsByTimestamp.get(timeKey),
        progressEvents: progressEvents.get(timeKey),
      });
    }
  }

  return { interactions, totalLines: lineNumber };
}

// Get git info
async function getGitInfo(projectPath: string): Promise<{
  owner: string;
  repository: string;
  repositoryUrl: string;
  repositoryRoot: string;
}> {
  let owner = "unknown";
  let repository = "";
  let repositoryUrl = "";
  let repositoryRoot = "";

  try {
    const { execSync } = await import("node:child_process");

    owner =
      execSync("git config user.name", {
        encoding: "utf8",
        cwd: projectPath,
        stdio: ["pipe", "pipe", "pipe"],
      }).trim() || owner;

    repositoryRoot =
      execSync("git rev-parse --show-toplevel", {
        encoding: "utf8",
        cwd: projectPath,
        stdio: ["pipe", "pipe", "pipe"],
      }).trim() || "";

    repositoryUrl =
      execSync("git remote get-url origin", {
        encoding: "utf8",
        cwd: projectPath,
        stdio: ["pipe", "pipe", "pipe"],
      }).trim() || "";

    // Extract owner/repo from URL
    const match = repositoryUrl.match(/[:/]([^/]+\/[^/]+?)(\.git)?$/);
    if (match) {
      repository = match[1].replace(/\.git$/, "");
    }
  } catch {
    try {
      owner = os.userInfo().username || owner;
    } catch {
      // keep default
    }
  }

  return { owner, repository, repositoryUrl, repositoryRoot };
}

// Resolve mneme session ID from session-links
function resolveMnemeSessionId(
  projectPath: string,
  claudeSessionId: string,
): string {
  const shortId = claudeSessionId.slice(0, 8);
  const sessionLinkPath = path.join(
    projectPath,
    ".mneme",
    "session-links",
    `${shortId}.json`,
  );

  if (fs.existsSync(sessionLinkPath)) {
    try {
      const link = JSON.parse(fs.readFileSync(sessionLinkPath, "utf8"));
      if (link.masterSessionId) {
        return link.masterSessionId;
      }
    } catch {
      // Ignore parse errors
    }
  }

  return shortId;
}

function findSessionFileById(
  projectPath: string,
  mnemeSessionId: string,
): string | null {
  const sessionsDir = path.join(projectPath, ".mneme", "sessions");
  const searchDir = (dir: string): string | null => {
    if (!fs.existsSync(dir)) return null;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const result = searchDir(fullPath);
        if (result) return result;
      } else if (entry.name === `${mnemeSessionId}.json`) {
        return fullPath;
      }
    }
    return null;
  };
  return searchDir(sessionsDir);
}

function hasSessionSummary(sessionFile: string | null): boolean {
  if (!sessionFile) return false;
  try {
    const session = JSON.parse(fs.readFileSync(sessionFile, "utf8"));
    return !!session.summary;
  } catch {
    return false;
  }
}

// Main incremental save function
export async function incrementalSave(
  claudeSessionId: string,
  transcriptPath: string,
  projectPath: string,
): Promise<SaveResult> {
  // Validate inputs
  if (!claudeSessionId || !transcriptPath || !projectPath) {
    return {
      success: false,
      savedCount: 0,
      totalCount: 0,
      message: "Missing required parameters",
    };
  }

  if (!fs.existsSync(transcriptPath)) {
    return {
      success: false,
      savedCount: 0,
      totalCount: 0,
      message: `Transcript not found: ${transcriptPath}`,
    };
  }

  // Initialize database
  const dbPath = path.join(projectPath, ".mneme", "local.db");
  const db = initDatabase(dbPath);

  // Resolve mneme session ID
  const mnemeSessionId = resolveMnemeSessionId(projectPath, claudeSessionId);

  // Get save state
  const saveState = getSaveState(
    db,
    claudeSessionId,
    mnemeSessionId,
    projectPath,
  );

  // Parse transcript incrementally
  const { interactions, totalLines } = await parseTranscriptIncremental(
    transcriptPath,
    saveState.lastSavedLine,
  );

  if (interactions.length === 0) {
    return {
      success: true,
      savedCount: 0,
      totalCount: totalLines,
      message: "No new interactions to save",
    };
  }

  // Get git info
  const { owner, repository, repositoryUrl, repositoryRoot } =
    await getGitInfo(projectPath);

  // Insert interactions
  const insertStmt = db.prepare(`
    INSERT INTO interactions (
      session_id, claude_session_id, project_path, repository, repository_url, repository_root,
      owner, role, content, thinking, tool_calls, timestamp, is_compact_summary
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let insertedCount = 0;
  let lastTimestamp = saveState.lastSavedTimestamp || "";

  for (const interaction of interactions) {
    try {
      // Create metadata JSON with all available info
      const metadata = JSON.stringify({
        toolsUsed: interaction.toolsUsed,
        toolDetails: interaction.toolDetails,
        // New metadata fields
        ...(interaction.inPlanMode && { inPlanMode: true }),
        ...(interaction.slashCommand && {
          slashCommand: interaction.slashCommand,
        }),
        ...(interaction.toolResults &&
          interaction.toolResults.length > 0 && {
            toolResults: interaction.toolResults,
          }),
        ...(interaction.progressEvents &&
          interaction.progressEvents.length > 0 && {
            progressEvents: interaction.progressEvents,
          }),
      });

      // Insert user message
      insertStmt.run(
        mnemeSessionId,
        claudeSessionId,
        projectPath,
        repository,
        repositoryUrl,
        repositoryRoot,
        owner,
        "user",
        interaction.user,
        null,
        metadata,
        interaction.timestamp,
        interaction.isCompactSummary ? 1 : 0,
      );
      insertedCount++;

      // Insert assistant response
      if (interaction.assistant) {
        // Assistant also gets the same metadata for context
        const assistantMetadata = JSON.stringify({
          toolsUsed: interaction.toolsUsed,
          toolDetails: interaction.toolDetails,
          ...(interaction.inPlanMode && { inPlanMode: true }),
          ...(interaction.toolResults &&
            interaction.toolResults.length > 0 && {
              toolResults: interaction.toolResults,
            }),
          ...(interaction.progressEvents &&
            interaction.progressEvents.length > 0 && {
              progressEvents: interaction.progressEvents,
            }),
        });

        insertStmt.run(
          mnemeSessionId,
          claudeSessionId,
          projectPath,
          repository,
          repositoryUrl,
          repositoryRoot,
          owner,
          "assistant",
          interaction.assistant,
          interaction.thinking || null,
          assistantMetadata,
          interaction.timestamp,
          0,
        );
        insertedCount++;
      }

      lastTimestamp = interaction.timestamp;
    } catch (error) {
      console.error(`[mneme] Error inserting interaction: ${error}`);
    }
  }

  // Update save state
  updateSaveState(db, claudeSessionId, lastTimestamp, totalLines);

  db.close();

  return {
    success: true,
    savedCount: insertedCount,
    totalCount: totalLines,
    message: `Saved ${insertedCount} messages (${interactions.length} turns)`,
  };
}

// Mark session as committed (called by /mneme:save)
export function markSessionCommitted(
  claudeSessionId: string,
  projectPath: string,
): boolean {
  const dbPath = path.join(projectPath, ".mneme", "local.db");
  if (!fs.existsSync(dbPath)) {
    return false;
  }

  const db = new DatabaseSync(dbPath);
  try {
    const stmt = db.prepare(`
      UPDATE session_save_state
      SET is_committed = 1, updated_at = datetime('now')
      WHERE claude_session_id = ?
    `);
    stmt.run(claudeSessionId);
    return true;
  } catch {
    return false;
  } finally {
    db.close();
  }
}

// Cleanup uncommitted session (called by SessionEnd)
export function cleanupUncommittedSession(
  claudeSessionId: string,
  projectPath: string,
): { deleted: boolean; count: number } {
  const dbPath = path.join(projectPath, ".mneme", "local.db");
  if (!fs.existsSync(dbPath)) {
    return { deleted: false, count: 0 };
  }

  const db = new DatabaseSync(dbPath);
  try {
    // Check if session is committed
    const stateStmt = db.prepare(
      "SELECT is_committed FROM session_save_state WHERE claude_session_id = ?",
    );
    const state = stateStmt.get(claudeSessionId) as
      | { is_committed: number }
      | undefined;

    if (state?.is_committed === 1) {
      // Session was saved with /mneme:save, keep interactions
      return { deleted: false, count: 0 };
    }

    // Check if session JSON has summary (alternative check)
    const mnemeSessionId = resolveMnemeSessionId(projectPath, claudeSessionId);
    const sessionFile = findSessionFileById(projectPath, mnemeSessionId);
    if (hasSessionSummary(sessionFile)) {
      // Session has summary, keep interactions
      return { deleted: false, count: 0 };
    }

    // Delete interactions for this Claude session
    const countStmt = db.prepare(
      "SELECT COUNT(*) as count FROM interactions WHERE claude_session_id = ?",
    );
    const countResult = countStmt.get(claudeSessionId) as { count: number };
    const count = countResult?.count || 0;

    if (count > 0) {
      const deleteStmt = db.prepare(
        "DELETE FROM interactions WHERE claude_session_id = ?",
      );
      deleteStmt.run(claudeSessionId);
    }

    // Delete save state
    const deleteStateStmt = db.prepare(
      "DELETE FROM session_save_state WHERE claude_session_id = ?",
    );
    deleteStateStmt.run(claudeSessionId);

    return { deleted: true, count };
  } catch (error) {
    console.error(`[mneme] Error cleaning up session: ${error}`);
    return { deleted: false, count: 0 };
  } finally {
    db.close();
  }
}

export function cleanupStaleUncommittedSessions(
  projectPath: string,
  graceDays: number,
): { deletedSessions: number; deletedInteractions: number } {
  const dbPath = path.join(projectPath, ".mneme", "local.db");
  if (!fs.existsSync(dbPath)) {
    return { deletedSessions: 0, deletedInteractions: 0 };
  }

  const db = new DatabaseSync(dbPath);
  let deletedSessions = 0;
  let deletedInteractions = 0;
  const normalizedGraceDays = Math.max(1, Math.floor(graceDays));

  try {
    const staleStmt = db.prepare(
      `
      SELECT claude_session_id, mneme_session_id
      FROM session_save_state
      WHERE is_committed = 0
        AND updated_at <= datetime('now', ?)
      `,
    );
    const staleRows = staleStmt.all(`-${normalizedGraceDays} days`) as Array<{
      claude_session_id: string;
      mneme_session_id: string;
    }>;

    if (staleRows.length === 0) {
      return { deletedSessions: 0, deletedInteractions: 0 };
    }

    const deleteInteractionStmt = db.prepare(
      "DELETE FROM interactions WHERE claude_session_id = ?",
    );
    const countInteractionStmt = db.prepare(
      "SELECT COUNT(*) as count FROM interactions WHERE claude_session_id = ?",
    );
    const deleteStateStmt = db.prepare(
      "DELETE FROM session_save_state WHERE claude_session_id = ?",
    );

    for (const row of staleRows) {
      const sessionFile = findSessionFileById(
        projectPath,
        row.mneme_session_id,
      );
      if (hasSessionSummary(sessionFile)) {
        continue;
      }

      const countResult = countInteractionStmt.get(row.claude_session_id) as
        | { count: number }
        | undefined;
      const count = countResult?.count || 0;
      if (count > 0) {
        deleteInteractionStmt.run(row.claude_session_id);
        deletedInteractions += count;
      }
      deleteStateStmt.run(row.claude_session_id);

      if (sessionFile && fs.existsSync(sessionFile)) {
        try {
          fs.unlinkSync(sessionFile);
          deletedSessions += 1;
        } catch {
          // Ignore file deletion failures.
        }
      }

      const linkPath = path.join(
        projectPath,
        ".mneme",
        "session-links",
        `${row.claude_session_id.slice(0, 8)}.json`,
      );
      if (fs.existsSync(linkPath)) {
        try {
          fs.unlinkSync(linkPath);
        } catch {
          // Ignore link deletion failures.
        }
      }
    }

    return { deletedSessions, deletedInteractions };
  } catch (error) {
    console.error(`[mneme] Error cleaning stale sessions: ${error}`);
    return { deletedSessions: 0, deletedInteractions: 0 };
  } finally {
    db.close();
  }
}

// CLI entry point
async function main() {
  const args = process.argv.slice(2);
  const getArg = (name: string): string | undefined => {
    const index = args.indexOf(`--${name}`);
    return index !== -1 ? args[index + 1] : undefined;
  };

  const command = args[0];

  if (command === "save") {
    const sessionId = getArg("session");
    const transcriptPath = getArg("transcript");
    const projectPath = getArg("project");

    if (!sessionId || !transcriptPath || !projectPath) {
      console.error(
        "Usage: incremental-save.js save --session <id> --transcript <path> --project <path>",
      );
      process.exit(1);
    }

    const result = await incrementalSave(
      sessionId,
      transcriptPath,
      projectPath,
    );
    console.log(JSON.stringify(result));
    process.exit(result.success ? 0 : 1);
  } else if (command === "commit") {
    const sessionId = getArg("session");
    const projectPath = getArg("project");

    if (!sessionId || !projectPath) {
      console.error(
        "Usage: incremental-save.js commit --session <id> --project <path>",
      );
      process.exit(1);
    }

    const success = markSessionCommitted(sessionId, projectPath);
    console.log(JSON.stringify({ success }));
    process.exit(success ? 0 : 1);
  } else if (command === "cleanup") {
    const sessionId = getArg("session");
    const projectPath = getArg("project");

    if (!sessionId || !projectPath) {
      console.error(
        "Usage: incremental-save.js cleanup --session <id> --project <path>",
      );
      process.exit(1);
    }

    const result = cleanupUncommittedSession(sessionId, projectPath);
    console.log(JSON.stringify(result));
    process.exit(0);
  } else if (command === "cleanup-stale") {
    const projectPath = getArg("project");
    const graceDays = Number.parseInt(getArg("grace-days") || "7", 10);

    if (!projectPath) {
      console.error(
        "Usage: incremental-save.js cleanup-stale --project <path> [--grace-days <n>]",
      );
      process.exit(1);
    }

    const result = cleanupStaleUncommittedSessions(projectPath, graceDays);
    console.log(JSON.stringify(result));
    process.exit(0);
  } else {
    console.error("Commands: save, commit, cleanup");
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
