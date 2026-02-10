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

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as readline from "node:readline";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { searchKnowledge } from "../lib/search-core.js";

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

const LIST_LIMIT_MIN = 1;
const LIST_LIMIT_MAX = 200;
const INTERACTION_OFFSET_MIN = 0;
const QUERY_MAX_LENGTH = 500;
const UNIT_LIMIT_MAX = 500;
const SEARCH_EVAL_DEFAULT_LIMIT = 5;

type UnitStatus = "pending" | "approved" | "rejected";
type UnitType = "decision" | "pattern" | "rule";
type RuleKind = "policy" | "pitfall" | "playbook";

interface Unit {
  id: string;
  type: UnitType;
  kind: RuleKind;
  title: string;
  summary: string;
  tags: string[];
  sourceId: string;
  sourceType: UnitType;
  sourceRefs: Array<{ type: UnitType; id: string }>;
  status: UnitStatus;
  createdAt: string;
  updatedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

interface UnitsFile {
  schemaVersion: number;
  updatedAt: string;
  items: Unit[];
}

interface AuditEntry {
  timestamp: string;
  actor?: string;
  entity: "session" | "decision" | "pattern" | "rule" | "unit";
  action: "create" | "update" | "delete";
  targetId: string;
  detail?: Record<string, unknown>;
}

interface RuleDoc {
  items?: Array<Record<string, unknown>>;
  rules?: Array<Record<string, unknown>>;
}

interface BenchmarkQuery {
  query: string;
  expectedTerms: string[];
}

function ok(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function fail(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true as const,
  };
}

// Get project path from env or current working directory
function getProjectPath(): string {
  return process.env.MNEME_PROJECT_PATH || process.cwd();
}

function getLocalDbPath(): string {
  return path.join(getProjectPath(), ".mneme", "local.db");
}

function getMnemeDir(): string {
  return path.join(getProjectPath(), ".mneme");
}

function readJsonFile<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

function listJsonFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return listJsonFiles(fullPath);
    }
    return entry.isFile() && entry.name.endsWith(".json") ? [fullPath] : [];
  });
}

function readUnits(): UnitsFile {
  const unitsPath = path.join(getMnemeDir(), "units", "units.json");
  const parsed = readJsonFile<UnitsFile>(unitsPath);
  if (!parsed || !Array.isArray(parsed.items)) {
    return {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      items: [],
    };
  }
  return parsed;
}

function writeUnits(doc: UnitsFile): void {
  const unitsPath = path.join(getMnemeDir(), "units", "units.json");
  fs.mkdirSync(path.dirname(unitsPath), { recursive: true });
  fs.writeFileSync(unitsPath, JSON.stringify(doc, null, 2));
}

function readRuleItems(
  ruleType: "dev-rules" | "review-guidelines",
): Array<Record<string, unknown>> {
  const filePath = path.join(getMnemeDir(), "rules", `${ruleType}.json`);
  const parsed = readJsonFile<RuleDoc>(filePath);
  const items = parsed?.items ?? parsed?.rules;
  return Array.isArray(items) ? items : [];
}

function readAuditEntries(
  options: { from?: string; to?: string; entity?: string } = {},
): AuditEntry[] {
  const auditDir = path.join(getMnemeDir(), "audit");
  if (!fs.existsSync(auditDir)) return [];

  const files = fs
    .readdirSync(auditDir)
    .filter((name) => name.endsWith(".jsonl"))
    .sort();
  const fromTime = options.from ? new Date(options.from).getTime() : null;
  const toTime = options.to ? new Date(options.to).getTime() : null;

  const entries: AuditEntry[] = [];
  for (const name of files) {
    const fullPath = path.join(auditDir, name);
    const lines = fs.readFileSync(fullPath, "utf-8").split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line) as AuditEntry;
        const ts = new Date(parsed.timestamp).getTime();
        if (fromTime !== null && ts < fromTime) continue;
        if (toTime !== null && ts > toTime) continue;
        if (options.entity && parsed.entity !== options.entity) continue;
        entries.push(parsed);
      } catch {
        // skip malformed lines
      }
    }
  }
  return entries.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
}

function readSessionsById(): Map<string, Record<string, unknown>> {
  const sessionsDir = path.join(getMnemeDir(), "sessions");
  const map = new Map<string, Record<string, unknown>>();
  for (const filePath of listJsonFiles(sessionsDir)) {
    const parsed = readJsonFile<Record<string, unknown>>(filePath);
    const id = typeof parsed?.id === "string" ? parsed.id : "";
    if (!id) continue;
    map.set(id, parsed);
  }
  return map;
}

function inferUnitPriority(unit: Unit): "p0" | "p1" | "p2" {
  if (unit.sourceType === "rule") {
    const [ruleFile, ruleId] = unit.sourceId.split(":", 2);
    if (
      (ruleFile === "dev-rules" || ruleFile === "review-guidelines") &&
      ruleId
    ) {
      const rule = readRuleItems(ruleFile).find((item) => item.id === ruleId);
      const priority =
        typeof rule?.priority === "string" ? rule.priority.toLowerCase() : "";
      if (priority === "p0" || priority === "p1" || priority === "p2") {
        return priority;
      }
    }
  }
  const text =
    `${unit.title} ${unit.summary} ${unit.tags.join(" ")}`.toLowerCase();
  if (
    /(security|auth|token|secret|password|injection|xss|csrf|compliance|outage|data[- ]?loss)/.test(
      text,
    )
  ) {
    return "p0";
  }
  if (/(crash|error|correct|reliab|timeout|retry|integrity)/.test(text)) {
    return "p1";
  }
  return "p2";
}

function extractChangedFilesFromDiff(diffText: string): string[] {
  const files = new Set<string>();
  const lines = diffText.split("\n");
  for (const line of lines) {
    if (!line.startsWith("diff --git ")) continue;
    const parts = line.split(" ");
    if (parts.length >= 4) {
      const bPath = parts[3].replace(/^b\//, "");
      if (bPath) files.add(bPath);
    }
  }
  return Array.from(files);
}

function scoreUnitAgainstDiff(
  unit: Unit,
  diffText: string,
  changedFiles: string[],
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  const corpus = `${unit.title} ${unit.summary}`.toLowerCase();
  const diffLower = diffText.toLowerCase();

  for (const tag of unit.tags) {
    if (!tag) continue;
    const tagLower = tag.toLowerCase();
    if (diffLower.includes(tagLower)) {
      score += 3;
      reasons.push(`tag:${tag}`);
    }
  }

  const keywords = corpus
    .split(/[^a-zA-Z0-9_-]+/)
    .filter((token) => token.length >= 5)
    .slice(0, 20);
  for (const token of keywords) {
    if (diffLower.includes(token)) {
      score += 1;
      reasons.push(`keyword:${token}`);
    }
  }

  for (const filePath of changedFiles) {
    const lower = filePath.toLowerCase();
    if (corpus.includes("test") && lower.includes("test")) {
      score += 1;
      reasons.push("path:test");
    }
    if (
      (corpus.includes("api") || unit.tags.includes("api")) &&
      (lower.includes("api") || lower.includes("route"))
    ) {
      score += 1;
      reasons.push("path:api");
    }
    if (
      (corpus.includes("db") || corpus.includes("sql")) &&
      (lower.includes("db") ||
        lower.includes("prisma") ||
        lower.includes("migration"))
    ) {
      score += 1;
      reasons.push("path:db");
    }
  }

  return { score, reasons: Array.from(new Set(reasons)) };
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

function runSearchBenchmark(limit = SEARCH_EVAL_DEFAULT_LIMIT): {
  queryCount: number;
  hits: number;
  recall: number;
  details: Array<{
    query: string;
    matched: boolean;
    topResult: string;
    resultCount: number;
  }>;
} {
  const queryPath = path.join(
    getProjectPath(),
    "scripts",
    "search-benchmark.queries.json",
  );
  const queryDoc = readJsonFile<{ queries?: BenchmarkQuery[] }>(queryPath);
  const queries = Array.isArray(queryDoc?.queries) ? queryDoc.queries : [];
  const details: Array<{
    query: string;
    matched: boolean;
    topResult: string;
    resultCount: number;
  }> = [];
  if (queries.length === 0) {
    return { queryCount: 0, hits: 0, recall: 0, details };
  }

  const mnemeDir = getMnemeDir();
  const database = getDb();
  let hits = 0;

  for (const item of queries) {
    const results = searchKnowledge({
      query: item.query,
      mnemeDir,
      projectPath: getProjectPath(),
      database,
      limit,
    });
    const corpus = results
      .map(
        (result) =>
          `${result.title} ${result.snippet} ${result.matchedFields.join(" ")}`,
      )
      .join(" ")
      .toLowerCase();
    const matched = item.expectedTerms.some((term) =>
      corpus.includes(String(term).toLowerCase()),
    );
    if (matched) hits += 1;
    details.push({
      query: item.query,
      matched,
      topResult: results[0] ? `${results[0].type}:${results[0].id}` : "none",
      resultCount: results.length,
    });
  }

  return {
    queryCount: queries.length,
    hits,
    recall: queries.length > 0 ? hits / queries.length : 0,
    details,
  };
}

function buildUnitGraph(units: Unit[]) {
  const approved = units.filter((unit) => unit.status === "approved");
  const edges: Array<{ source: string; target: string; weight: number }> = [];
  for (let i = 0; i < approved.length; i++) {
    for (let j = i + 1; j < approved.length; j++) {
      const shared = approved[i].tags.filter((tag) =>
        approved[j].tags.includes(tag),
      );
      if (shared.length > 0) {
        edges.push({
          source: approved[i].id,
          target: approved[j].id,
          weight: shared.length,
        });
      }
    }
  }
  return { nodes: approved, edges };
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
    if (!getDb()) {
      return fail("Database not available.");
    }
    const projects = listProjects();
    return ok(JSON.stringify(projects, null, 2));
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
    if (!getDb()) {
      return fail("Database not available.");
    }
    const sessions = listSessions({ projectPath, repository, limit });
    return ok(JSON.stringify(sessions, null, 2));
  },
);

// Tool: mneme_get_interactions
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
    if (!sessionId.trim()) {
      return fail("sessionId must not be empty.");
    }
    if (!getDb()) {
      return fail("Database not available.");
    }
    const interactions = getInteractions(sessionId, { limit, offset });
    if (interactions.length === 0) {
      return fail(`No interactions found for session: ${sessionId}`);
    }
    return ok(JSON.stringify(interactions, null, 2));
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
      return fail("Database not available.");
    }
    return ok(JSON.stringify(stats, null, 2));
  },
);

// Tool: mneme_cross_project_search
server.registerTool(
  "mneme_cross_project_search",
  {
    description:
      "Search interactions across ALL projects (not just current). Uses FTS5 for fast full-text search.",
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
    if (!trimmedQuery) {
      return fail("query must not be empty.");
    }
    if (!getDb()) {
      return fail("Database not available.");
    }
    const results = crossProjectSearch(trimmedQuery, { limit });
    return ok(JSON.stringify(results, null, 2));
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
    if (!claudeSessionId.trim()) {
      return fail("claudeSessionId must not be empty.");
    }
    const result = await saveInteractions(claudeSessionId, mnemeSessionId);
    return {
      ...ok(JSON.stringify(result, null, 2)),
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
        .min(8)
        .describe("Full Claude Code session UUID (36 chars)"),
    },
  },
  async ({ claudeSessionId }) => {
    if (!claudeSessionId.trim()) {
      return fail("claudeSessionId must not be empty.");
    }
    const success = markSessionCommitted(claudeSessionId);
    return {
      ...ok(JSON.stringify({ success, claudeSessionId }, null, 2)),
      isError: !success,
    };
  },
);

// Tool: mneme_unit_queue_list_pending
server.registerTool(
  "mneme_unit_queue_list_pending",
  {
    description:
      "List pending units in the approval queue. Use this in save/review flows to surface actionable approvals.",
    inputSchema: {
      limit: z
        .number()
        .int()
        .min(LIST_LIMIT_MIN)
        .max(UNIT_LIMIT_MAX)
        .optional()
        .describe(
          `Maximum items (${LIST_LIMIT_MIN}-${UNIT_LIMIT_MAX}, default: 100)`,
        ),
    },
  },
  async ({ limit }) => {
    const units = readUnits()
      .items.filter((item) => item.status === "pending")
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )
      .slice(0, limit ?? 100);
    return ok(
      JSON.stringify(
        {
          count: units.length,
          items: units,
        },
        null,
        2,
      ),
    );
  },
);

// Tool: mneme_unit_queue_update_status
server.registerTool(
  "mneme_unit_queue_update_status",
  {
    description:
      "Update unit status (approve/reject/pending) in bulk or single item.",
    inputSchema: {
      unitIds: z.array(z.string().min(1)).min(1).describe("Target unit IDs"),
      status: z
        .enum(["pending", "approved", "rejected"])
        .describe("New status"),
      reviewedBy: z.string().optional().describe("Reviewer name (optional)"),
    },
  },
  async ({ unitIds, status, reviewedBy }) => {
    const doc = readUnits();
    const target = new Set(unitIds);
    const now = new Date().toISOString();
    let updated = 0;
    doc.items = doc.items.map((item) => {
      if (!target.has(item.id)) return item;
      updated += 1;
      return {
        ...item,
        status,
        reviewedAt: now,
        reviewedBy,
        updatedAt: now,
      };
    });
    doc.updatedAt = now;
    writeUnits(doc);
    return ok(
      JSON.stringify(
        { updated, status, requested: unitIds.length, updatedAt: now },
        null,
        2,
      ),
    );
  },
);

// Tool: mneme_unit_apply_suggest_for_diff
server.registerTool(
  "mneme_unit_apply_suggest_for_diff",
  {
    description:
      "Suggest top approved units for a given git diff text. Intended for automatic review integration.",
    inputSchema: {
      diff: z.string().min(1).describe("Unified diff text"),
      limit: z
        .number()
        .int()
        .min(LIST_LIMIT_MIN)
        .max(50)
        .optional()
        .describe("Maximum suggested units (default: 10)"),
    },
  },
  async ({ diff, limit }) => {
    const changedFiles = extractChangedFilesFromDiff(diff);
    const approved = readUnits().items.filter(
      (item) => item.status === "approved",
    );
    const scored = approved
      .map((unit) => {
        const { score, reasons } = scoreUnitAgainstDiff(
          unit,
          diff,
          changedFiles,
        );
        return { unit, score, reasons };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit ?? 10);

    return ok(
      JSON.stringify(
        {
          changedFiles,
          suggestions: scored.map((item) => ({
            id: item.unit.id,
            title: item.unit.title,
            score: item.score,
            reasons: item.reasons,
            source: `${item.unit.sourceType}:${item.unit.sourceId}`,
          })),
        },
        null,
        2,
      ),
    );
  },
);

// Tool: mneme_unit_apply_explain_match
server.registerTool(
  "mneme_unit_apply_explain_match",
  {
    description: "Explain why a specific unit matches a diff.",
    inputSchema: {
      unitId: z.string().min(1).describe("Unit ID"),
      diff: z.string().min(1).describe("Unified diff text"),
    },
  },
  async ({ unitId, diff }) => {
    const unit = readUnits().items.find((item) => item.id === unitId);
    if (!unit) return fail(`Unit not found: ${unitId}`);
    const changedFiles = extractChangedFilesFromDiff(diff);
    const scored = scoreUnitAgainstDiff(unit, diff, changedFiles);
    return ok(
      JSON.stringify(
        {
          unitId,
          title: unit.title,
          score: scored.score,
          reasons: scored.reasons,
          priority: inferUnitPriority(unit),
          changedFiles,
        },
        null,
        2,
      ),
    );
  },
);

// Tool: mneme_session_timeline
server.registerTool(
  "mneme_session_timeline",
  {
    description:
      "Build timeline for one session or a resume-chain using sessions metadata and interactions.",
    inputSchema: {
      sessionId: z.string().min(1).describe("Session ID (short or full)"),
      includeChain: z
        .boolean()
        .optional()
        .describe("Include resumedFrom chain and workPeriods (default: true)"),
    },
  },
  async ({ sessionId, includeChain }) => {
    const sessions = readSessionsById();
    const shortId = sessionId.slice(0, 8);
    const root = sessions.get(shortId);
    if (!root) return fail(`Session not found: ${shortId}`);

    const chain: string[] = [shortId];
    if (includeChain !== false) {
      let current = root;
      let guard = 0;
      while (
        current &&
        typeof current.resumedFrom === "string" &&
        current.resumedFrom &&
        guard < 30
      ) {
        chain.push(current.resumedFrom);
        current = sessions.get(current.resumedFrom);
        guard += 1;
      }
    }

    const dbAvailable = !!getDb();
    const timeline = chain.map((id) => {
      const session = sessions.get(id) || {};
      let interactionCount = 0;
      if (dbAvailable) {
        interactionCount = getInteractions(id, {
          limit: 1_000,
          offset: 0,
        }).length;
      }
      return {
        id,
        title: typeof session.title === "string" ? session.title : null,
        createdAt:
          typeof session.createdAt === "string" ? session.createdAt : null,
        endedAt: typeof session.endedAt === "string" ? session.endedAt : null,
        resumedFrom:
          typeof session.resumedFrom === "string" ? session.resumedFrom : null,
        interactionCount,
      };
    });

    return ok(
      JSON.stringify(
        {
          rootSessionId: shortId,
          dbAvailable,
          chainLength: timeline.length,
          timeline,
        },
        null,
        2,
      ),
    );
  },
);

// Tool: mneme_rule_linter
server.registerTool(
  "mneme_rule_linter",
  {
    description:
      "Lint rules for schema and quality (required fields, priority, clarity, duplicates).",
    inputSchema: {
      ruleType: z
        .enum(["dev-rules", "review-guidelines", "all"])
        .optional()
        .describe("Rule set to lint (default: all)"),
    },
  },
  async ({ ruleType }) => {
    const targets =
      ruleType && ruleType !== "all"
        ? [ruleType]
        : (["dev-rules", "review-guidelines"] as const);
    const issues: Array<{
      ruleType: string;
      id: string;
      level: "error" | "warning";
      message: string;
    }> = [];

    for (const type of targets) {
      const items = readRuleItems(type);
      const seenKeys = new Set<string>();
      for (const raw of items) {
        const id = typeof raw.id === "string" ? raw.id : "(unknown)";
        const text =
          typeof raw.text === "string"
            ? raw.text
            : typeof raw.rule === "string"
              ? raw.rule
              : "";
        const priority =
          typeof raw.priority === "string" ? raw.priority.toLowerCase() : "";
        const tags = Array.isArray(raw.tags) ? raw.tags : [];
        const key = `${type}:${String(raw.key || id)}`;

        if (!raw.id) {
          issues.push({
            ruleType: type,
            id,
            level: "error",
            message: "Missing id",
          });
        }
        if (!raw.key) {
          issues.push({
            ruleType: type,
            id,
            level: "error",
            message: "Missing key",
          });
        }
        if (!text.trim()) {
          issues.push({
            ruleType: type,
            id,
            level: "error",
            message: "Missing text/rule",
          });
        }
        if (!raw.category) {
          issues.push({
            ruleType: type,
            id,
            level: "warning",
            message: "Missing category",
          });
        }
        if (tags.length === 0) {
          issues.push({
            ruleType: type,
            id,
            level: "warning",
            message: "Missing tags",
          });
        }
        if (!["p0", "p1", "p2"].includes(priority)) {
          issues.push({
            ruleType: type,
            id,
            level: "error",
            message: "Invalid priority (p0|p1|p2 required)",
          });
        }
        if (seenKeys.has(key)) {
          issues.push({
            ruleType: type,
            id,
            level: "warning",
            message: "Duplicate key",
          });
        }
        seenKeys.add(key);

        if (text.trim().length > 180) {
          issues.push({
            ruleType: type,
            id,
            level: "warning",
            message: "Rule text too long (consider splitting)",
          });
        }
      }
    }

    return ok(
      JSON.stringify(
        {
          checked: targets,
          totalIssues: issues.length,
          errors: issues.filter((issue) => issue.level === "error").length,
          warnings: issues.filter((issue) => issue.level === "warning").length,
          issues,
        },
        null,
        2,
      ),
    );
  },
);

// Tool: mneme_graph_insights
server.registerTool(
  "mneme_graph_insights",
  {
    description:
      "Compute graph insights from approved units: central units, tag communities, orphan units.",
    inputSchema: {
      limit: z
        .number()
        .int()
        .min(LIST_LIMIT_MIN)
        .max(100)
        .optional()
        .describe("Limit for ranked outputs (default: 10)"),
    },
  },
  async ({ limit }) => {
    const k = limit ?? 10;
    const units = readUnits().items.filter(
      (item) => item.status === "approved",
    );
    const graph = buildUnitGraph(units);
    const degree = new Map<string, number>();
    for (const unit of graph.nodes) degree.set(unit.id, 0);
    for (const edge of graph.edges) {
      degree.set(edge.source, (degree.get(edge.source) || 0) + 1);
      degree.set(edge.target, (degree.get(edge.target) || 0) + 1);
    }

    const topCentral = graph.nodes
      .map((unit) => ({
        id: unit.id,
        title: unit.title,
        degree: degree.get(unit.id) || 0,
      }))
      .sort((a, b) => b.degree - a.degree)
      .slice(0, k);

    const tagCounts = new Map<string, number>();
    for (const unit of graph.nodes) {
      for (const tag of unit.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    }
    const communities = Array.from(tagCounts.entries())
      .map(([tag, count]) => ({
        tag,
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, k);

    const orphans = graph.nodes
      .filter((unit) => (degree.get(unit.id) || 0) === 0)
      .map((unit) => ({
        id: unit.id,
        title: unit.title,
        tags: unit.tags,
      }))
      .slice(0, k);

    return ok(
      JSON.stringify(
        {
          approvedUnits: graph.nodes.length,
          edges: graph.edges.length,
          topCentral,
          tagCommunities: communities,
          orphanUnits: orphans,
        },
        null,
        2,
      ),
    );
  },
);

// Tool: mneme_search_eval
server.registerTool(
  "mneme_search_eval",
  {
    description:
      "Run/compare search benchmark and emit regression summary. Intended for CI and save-time quality checks.",
    inputSchema: {
      mode: z
        .enum(["run", "compare", "regression"])
        .optional()
        .describe(
          "run=single, compare=against baseline, regression=threshold check",
        ),
      baselineRecall: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Baseline recall for compare/regression"),
      thresholdDrop: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Allowed recall drop for regression (default: 0.05)"),
      limit: z
        .number()
        .int()
        .min(LIST_LIMIT_MIN)
        .max(50)
        .optional()
        .describe("Top-k results per query (default: 5)"),
    },
  },
  async ({ mode, baselineRecall, thresholdDrop, limit }) => {
    const run = runSearchBenchmark(limit ?? SEARCH_EVAL_DEFAULT_LIMIT);
    const payload: Record<string, unknown> = {
      mode: mode || "run",
      queryCount: run.queryCount,
      hits: run.hits,
      recall: run.recall,
      details: run.details,
    };

    if (
      (mode === "compare" || mode === "regression") &&
      baselineRecall !== undefined
    ) {
      const delta = run.recall - baselineRecall;
      payload.baselineRecall = baselineRecall;
      payload.delta = delta;
      if (mode === "regression") {
        const allowed = thresholdDrop ?? 0.05;
        payload.thresholdDrop = allowed;
        payload.regression = delta < -allowed;
      }
    }

    return ok(JSON.stringify(payload, null, 2));
  },
);

// Tool: mneme_audit_query
server.registerTool(
  "mneme_audit_query",
  {
    description: "Query unit-related audit logs and summarize change history.",
    inputSchema: {
      from: z.string().optional().describe("Start ISO date/time"),
      to: z.string().optional().describe("End ISO date/time"),
      targetId: z.string().optional().describe("Filter by target unit ID"),
      summaryMode: z
        .enum(["changes", "actors", "target"])
        .optional()
        .describe(
          "changes=list, actors=aggregate by actor, target=single target history",
        ),
    },
  },
  async ({ from, to, targetId, summaryMode }) => {
    const entries = readAuditEntries({ from, to, entity: "unit" }).filter(
      (entry) => (targetId ? entry.targetId === targetId : true),
    );

    if ((summaryMode || "changes") === "actors") {
      const byActor = new Map<string, number>();
      for (const entry of entries) {
        const actor = entry.actor || "unknown";
        byActor.set(actor, (byActor.get(actor) || 0) + 1);
      }
      return ok(
        JSON.stringify(
          {
            total: entries.length,
            actors: Array.from(byActor.entries())
              .map(([actor, count]) => ({ actor, count }))
              .sort((a, b) => b.count - a.count),
          },
          null,
          2,
        ),
      );
    }

    if ((summaryMode || "changes") === "target" && targetId) {
      return ok(
        JSON.stringify(
          {
            targetId,
            history: entries,
          },
          null,
          2,
        ),
      );
    }

    return ok(
      JSON.stringify(
        {
          total: entries.length,
          changes: entries,
        },
        null,
        2,
      ),
    );
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
