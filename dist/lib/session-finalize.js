#!/usr/bin/env node

// lib/session-finalize.ts
import * as fs3 from "node:fs";
import * as path3 from "node:path";

// lib/suppress-sqlite-warning.ts
var originalEmit = process.emit;
process.emit = (event, ...args) => {
  if (event === "warning" && typeof args[0] === "object" && args[0] !== null && "name" in args[0] && args[0].name === "ExperimentalWarning" && "message" in args[0] && typeof args[0].message === "string" && args[0].message.includes("SQLite")) {
    return false;
  }
  return originalEmit.apply(process, [event, ...args]);
};

// lib/incremental-save.ts
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as readline from "node:readline";
var { DatabaseSync } = await import("node:sqlite");
function getSchemaPath() {
  const scriptDir = path.dirname(new URL(import.meta.url).pathname);
  const candidates = [
    path.join(scriptDir, "schema.sql"),
    path.join(scriptDir, "..", "lib", "schema.sql"),
    path.join(scriptDir, "..", "..", "lib", "schema.sql")
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}
var FALLBACK_SCHEMA = `
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
function initDatabase(dbPath) {
  const mnemeDir = path.dirname(dbPath);
  if (!fs.existsSync(mnemeDir)) {
    fs.mkdirSync(mnemeDir, { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  try {
    db.exec("SELECT 1 FROM interactions LIMIT 1");
  } catch {
    const schemaPath = getSchemaPath();
    if (schemaPath) {
      const schema = fs.readFileSync(schemaPath, "utf8");
      db.exec(schema);
      console.error(`[mneme] Database initialized from schema: ${dbPath}`);
    } else {
      db.exec(FALLBACK_SCHEMA);
      console.error(
        `[mneme] Database initialized with fallback schema: ${dbPath}`
      );
    }
  }
  migrateDatabase(db);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA synchronous = NORMAL");
  return db;
}
function migrateDatabase(db) {
  try {
    const columns = db.prepare("PRAGMA table_info(interactions)").all();
    const hasClaudeSessionId = columns.some(
      (c) => c.name === "claude_session_id"
    );
    if (!hasClaudeSessionId) {
      db.exec("ALTER TABLE interactions ADD COLUMN claude_session_id TEXT");
      db.exec(
        "CREATE INDEX IF NOT EXISTS idx_interactions_claude_session ON interactions(claude_session_id)"
      );
      console.error("[mneme] Migrated: added claude_session_id column");
    }
  } catch {
  }
  try {
    db.exec("SELECT 1 FROM session_save_state LIMIT 1");
  } catch {
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
function getSaveState(db, claudeSessionId, mnemeSessionId, projectPath) {
  const stmt = db.prepare(
    "SELECT * FROM session_save_state WHERE claude_session_id = ?"
  );
  const row = stmt.get(claudeSessionId);
  if (row) {
    return {
      claudeSessionId: row.claude_session_id,
      mnemeSessionId: row.mneme_session_id,
      projectPath: row.project_path,
      lastSavedTimestamp: row.last_saved_timestamp,
      lastSavedLine: row.last_saved_line,
      isCommitted: row.is_committed
    };
  }
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
    isCommitted: 0
  };
}
function updateSaveState(db, claudeSessionId, lastSavedTimestamp, lastSavedLine) {
  const stmt = db.prepare(`
    UPDATE session_save_state
    SET last_saved_timestamp = ?, last_saved_line = ?, updated_at = datetime('now')
    WHERE claude_session_id = ?
  `);
  stmt.run(lastSavedTimestamp, lastSavedLine, claudeSessionId);
}
function extractSlashCommand(content) {
  const match = content.match(/<command-name>([^<]+)<\/command-name>/);
  return match ? match[1] : void 0;
}
function extractToolResultMeta(content, toolUseIdToName, toolUseIdToFilePath) {
  return content.filter((c) => c.type === "tool_result" && c.tool_use_id).map((c) => {
    const contentStr = typeof c.content === "string" ? c.content : c.content ? JSON.stringify(c.content) : "";
    const lineCount = contentStr.split("\n").length;
    const toolUseId = c.tool_use_id || "";
    let filePath = toolUseIdToFilePath.get(toolUseId);
    if (!filePath) {
      const filePathMatch = contentStr.match(
        /(?:^|\s)((?:\/|\.\/)\S+\.\w+)\b/
      );
      filePath = filePathMatch ? filePathMatch[1] : void 0;
    }
    return {
      toolUseId,
      toolName: toolUseIdToName.get(toolUseId),
      success: !c.is_error,
      contentLength: contentStr.length,
      lineCount: lineCount > 1 ? lineCount : void 0,
      filePath
    };
  });
}
async function parseTranscriptIncremental(transcriptPath, lastSavedLine) {
  const fileStream = fs.createReadStream(transcriptPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Number.POSITIVE_INFINITY
  });
  const entries = [];
  let lineNumber = 0;
  for await (const line of rl) {
    lineNumber++;
    if (lineNumber <= lastSavedLine) continue;
    if (line.trim()) {
      try {
        entries.push(JSON.parse(line));
      } catch {
      }
    }
  }
  const planModeEvents = [];
  for (const entry of entries) {
    if (entry.type === "assistant" && Array.isArray(entry.message?.content)) {
      for (const c of entry.message.content) {
        if (c.type === "tool_use") {
          if (c.name === "EnterPlanMode") {
            planModeEvents.push({ timestamp: entry.timestamp, entering: true });
          } else if (c.name === "ExitPlanMode") {
            planModeEvents.push({
              timestamp: entry.timestamp,
              entering: false
            });
          }
        }
      }
    }
  }
  function isInPlanMode(timestamp) {
    let inPlanMode = false;
    for (const event of planModeEvents) {
      if (event.timestamp > timestamp) break;
      inPlanMode = event.entering;
    }
    return inPlanMode;
  }
  const progressEvents = /* @__PURE__ */ new Map();
  for (const entry of entries) {
    if (entry.type === "progress" && entry.data?.type) {
      if (entry.data.type === "hook_progress") continue;
      const event = {
        type: entry.data.type,
        timestamp: entry.timestamp,
        hookEvent: entry.data.hookEvent,
        hookName: entry.data.hookName,
        toolName: entry.data.toolName,
        ...entry.data.type === "agent_progress" && {
          prompt: entry.data.prompt,
          agentId: entry.data.agentId
        }
      };
      const key = entry.timestamp.slice(0, 16);
      if (!progressEvents.has(key)) {
        progressEvents.set(key, []);
      }
      progressEvents.get(key)?.push(event);
    }
  }
  const userMessages = entries.filter((e) => {
    if (e.type !== "user" || e.message?.role !== "user") return false;
    if (e.isMeta === true) return false;
    const content = e.message?.content;
    if (typeof content !== "string") return false;
    if (content.startsWith("<local-command-stdout>")) return false;
    if (content.startsWith("<local-command-caveat>")) return false;
    return true;
  }).map((e) => {
    const content = e.message?.content;
    return {
      timestamp: e.timestamp,
      content,
      isCompactSummary: e.isCompactSummary || false,
      slashCommand: extractSlashCommand(content)
    };
  });
  const toolUseIdToName = /* @__PURE__ */ new Map();
  const toolUseIdToFilePath = /* @__PURE__ */ new Map();
  for (const entry of entries) {
    if (entry.type === "assistant" && Array.isArray(entry.message?.content)) {
      for (const c of entry.message.content) {
        if (c.type === "tool_use" && c.id && c.name) {
          toolUseIdToName.set(c.id, c.name);
          if (c.input?.file_path) {
            toolUseIdToFilePath.set(c.id, c.input.file_path);
          }
        }
      }
    }
  }
  const toolResultsByTimestamp = /* @__PURE__ */ new Map();
  for (const entry of entries) {
    if (entry.type === "user" && Array.isArray(entry.message?.content)) {
      const results = extractToolResultMeta(
        entry.message.content,
        toolUseIdToName,
        toolUseIdToFilePath
      );
      if (results.length > 0) {
        const key = entry.timestamp.slice(0, 16);
        const existing = toolResultsByTimestamp.get(key) || [];
        toolResultsByTimestamp.set(key, [...existing, ...results]);
      }
    }
  }
  const assistantMessages = entries.filter((e) => e.type === "assistant").map((e) => {
    const contentArray = e.message?.content;
    if (!Array.isArray(contentArray)) return null;
    const thinking = contentArray.filter((c) => c.type === "thinking" && c.thinking).map((c) => c.thinking).join("\n");
    const text = contentArray.filter((c) => c.type === "text" && c.text).map((c) => c.text).join("\n");
    const toolDetails = contentArray.filter((c) => c.type === "tool_use" && c.name).map((c) => ({
      name: c.name ?? "",
      detail: c.name === "Bash" ? c.input?.command : c.name === "Read" || c.name === "Edit" || c.name === "Write" ? c.input?.file_path : c.name === "Glob" || c.name === "Grep" ? c.input?.pattern : null
    }));
    if (!thinking && !text && toolDetails.length === 0) return null;
    return {
      timestamp: e.timestamp,
      thinking,
      text,
      toolDetails
    };
  }).filter((m) => m !== null);
  const interactions = [];
  for (let i = 0; i < userMessages.length; i++) {
    const user = userMessages[i];
    const nextUserTs = i + 1 < userMessages.length ? userMessages[i + 1].timestamp : "9999-12-31T23:59:59Z";
    const turnResponses = assistantMessages.filter(
      (a) => a.timestamp >= user.timestamp && a.timestamp < nextUserTs
    );
    if (turnResponses.length > 0) {
      const allToolDetails = turnResponses.flatMap((r) => r.toolDetails);
      const timeKey = user.timestamp.slice(0, 16);
      interactions.push({
        timestamp: user.timestamp,
        user: user.content,
        thinking: turnResponses.filter((r) => r.thinking).map((r) => r.thinking).join("\n"),
        assistant: turnResponses.filter((r) => r.text).map((r) => r.text).join("\n"),
        isCompactSummary: user.isCompactSummary,
        toolsUsed: [...new Set(allToolDetails.map((t) => t.name))],
        toolDetails: allToolDetails,
        // New metadata
        inPlanMode: isInPlanMode(user.timestamp) || void 0,
        slashCommand: user.slashCommand,
        toolResults: toolResultsByTimestamp.get(timeKey),
        progressEvents: progressEvents.get(timeKey)
      });
    }
  }
  return { interactions, totalLines: lineNumber };
}
async function getGitInfo(projectPath) {
  let owner = "unknown";
  let repository = "";
  let repositoryUrl = "";
  let repositoryRoot = "";
  try {
    const { execSync } = await import("node:child_process");
    owner = execSync("git config user.name", {
      encoding: "utf8",
      cwd: projectPath,
      stdio: ["pipe", "pipe", "pipe"]
    }).trim() || owner;
    repositoryRoot = execSync("git rev-parse --show-toplevel", {
      encoding: "utf8",
      cwd: projectPath,
      stdio: ["pipe", "pipe", "pipe"]
    }).trim() || "";
    repositoryUrl = execSync("git remote get-url origin", {
      encoding: "utf8",
      cwd: projectPath,
      stdio: ["pipe", "pipe", "pipe"]
    }).trim() || "";
    const match = repositoryUrl.match(/[:/]([^/]+\/[^/]+?)(\.git)?$/);
    if (match) {
      repository = match[1].replace(/\.git$/, "");
    }
  } catch {
    try {
      owner = os.userInfo().username || owner;
    } catch {
    }
  }
  return { owner, repository, repositoryUrl, repositoryRoot };
}
function resolveMnemeSessionId(projectPath, claudeSessionId) {
  const shortId = claudeSessionId.slice(0, 8);
  const sessionLinkPath = path.join(
    projectPath,
    ".mneme",
    "session-links",
    `${shortId}.json`
  );
  if (fs.existsSync(sessionLinkPath)) {
    try {
      const link = JSON.parse(fs.readFileSync(sessionLinkPath, "utf8"));
      if (link.masterSessionId) {
        return link.masterSessionId;
      }
    } catch {
    }
  }
  return shortId;
}
function findSessionFileById(projectPath, mnemeSessionId) {
  const sessionsDir = path.join(projectPath, ".mneme", "sessions");
  const searchDir = (dir) => {
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
function hasSessionSummary(sessionFile) {
  if (!sessionFile) return false;
  try {
    const session = JSON.parse(fs.readFileSync(sessionFile, "utf8"));
    return !!session.summary;
  } catch {
    return false;
  }
}
async function incrementalSave(claudeSessionId, transcriptPath, projectPath) {
  if (!claudeSessionId || !transcriptPath || !projectPath) {
    return {
      success: false,
      savedCount: 0,
      totalCount: 0,
      message: "Missing required parameters"
    };
  }
  if (!fs.existsSync(transcriptPath)) {
    return {
      success: false,
      savedCount: 0,
      totalCount: 0,
      message: `Transcript not found: ${transcriptPath}`
    };
  }
  const dbPath = path.join(projectPath, ".mneme", "local.db");
  const db = initDatabase(dbPath);
  const mnemeSessionId = resolveMnemeSessionId(projectPath, claudeSessionId);
  const saveState = getSaveState(
    db,
    claudeSessionId,
    mnemeSessionId,
    projectPath
  );
  const { interactions, totalLines } = await parseTranscriptIncremental(
    transcriptPath,
    saveState.lastSavedLine
  );
  if (interactions.length === 0) {
    return {
      success: true,
      savedCount: 0,
      totalCount: totalLines,
      message: "No new interactions to save"
    };
  }
  const { owner, repository, repositoryUrl, repositoryRoot } = await getGitInfo(projectPath);
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
      const metadata = JSON.stringify({
        toolsUsed: interaction.toolsUsed,
        toolDetails: interaction.toolDetails,
        // New metadata fields
        ...interaction.inPlanMode && { inPlanMode: true },
        ...interaction.slashCommand && {
          slashCommand: interaction.slashCommand
        },
        ...interaction.toolResults && interaction.toolResults.length > 0 && {
          toolResults: interaction.toolResults
        },
        ...interaction.progressEvents && interaction.progressEvents.length > 0 && {
          progressEvents: interaction.progressEvents
        }
      });
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
        interaction.isCompactSummary ? 1 : 0
      );
      insertedCount++;
      if (interaction.assistant) {
        const assistantMetadata = JSON.stringify({
          toolsUsed: interaction.toolsUsed,
          toolDetails: interaction.toolDetails,
          ...interaction.inPlanMode && { inPlanMode: true },
          ...interaction.toolResults && interaction.toolResults.length > 0 && {
            toolResults: interaction.toolResults
          },
          ...interaction.progressEvents && interaction.progressEvents.length > 0 && {
            progressEvents: interaction.progressEvents
          }
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
          0
        );
        insertedCount++;
      }
      lastTimestamp = interaction.timestamp;
    } catch (error) {
      console.error(`[mneme] Error inserting interaction: ${error}`);
    }
  }
  updateSaveState(db, claudeSessionId, lastTimestamp, totalLines);
  db.close();
  return {
    success: true,
    savedCount: insertedCount,
    totalCount: totalLines,
    message: `Saved ${insertedCount} messages (${interactions.length} turns)`
  };
}
function markSessionCommitted(claudeSessionId, projectPath) {
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
function cleanupUncommittedSession(claudeSessionId, projectPath) {
  const dbPath = path.join(projectPath, ".mneme", "local.db");
  if (!fs.existsSync(dbPath)) {
    return { deleted: false, count: 0 };
  }
  const db = new DatabaseSync(dbPath);
  try {
    const stateStmt = db.prepare(
      "SELECT is_committed FROM session_save_state WHERE claude_session_id = ?"
    );
    const state = stateStmt.get(claudeSessionId);
    if (state?.is_committed === 1) {
      return { deleted: false, count: 0 };
    }
    const mnemeSessionId = resolveMnemeSessionId(projectPath, claudeSessionId);
    const sessionFile = findSessionFileById(projectPath, mnemeSessionId);
    if (hasSessionSummary(sessionFile)) {
      return { deleted: false, count: 0 };
    }
    const countStmt = db.prepare(
      "SELECT COUNT(*) as count FROM interactions WHERE claude_session_id = ?"
    );
    const countResult = countStmt.get(claudeSessionId);
    const count = countResult?.count || 0;
    if (count > 0) {
      const deleteStmt = db.prepare(
        "DELETE FROM interactions WHERE claude_session_id = ?"
      );
      deleteStmt.run(claudeSessionId);
    }
    const deleteStateStmt = db.prepare(
      "DELETE FROM session_save_state WHERE claude_session_id = ?"
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
function cleanupStaleUncommittedSessions(projectPath, graceDays) {
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
      `
    );
    const staleRows = staleStmt.all(`-${normalizedGraceDays} days`);
    if (staleRows.length === 0) {
      return { deletedSessions: 0, deletedInteractions: 0 };
    }
    const deleteInteractionStmt = db.prepare(
      "DELETE FROM interactions WHERE claude_session_id = ?"
    );
    const countInteractionStmt = db.prepare(
      "SELECT COUNT(*) as count FROM interactions WHERE claude_session_id = ?"
    );
    const deleteStateStmt = db.prepare(
      "DELETE FROM session_save_state WHERE claude_session_id = ?"
    );
    for (const row of staleRows) {
      const sessionFile = findSessionFileById(
        projectPath,
        row.mneme_session_id
      );
      if (hasSessionSummary(sessionFile)) {
        continue;
      }
      const countResult = countInteractionStmt.get(row.claude_session_id);
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
        }
      }
      const linkPath = path.join(
        projectPath,
        ".mneme",
        "session-links",
        `${row.claude_session_id.slice(0, 8)}.json`
      );
      if (fs.existsSync(linkPath)) {
        try {
          fs.unlinkSync(linkPath);
        } catch {
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
async function main() {
  const args = process.argv.slice(2);
  const getArg = (name) => {
    const index = args.indexOf(`--${name}`);
    return index !== -1 ? args[index + 1] : void 0;
  };
  const command = args[0];
  if (command === "save") {
    const sessionId = getArg("session");
    const transcriptPath = getArg("transcript");
    const projectPath = getArg("project");
    if (!sessionId || !transcriptPath || !projectPath) {
      console.error(
        "Usage: incremental-save.js save --session <id> --transcript <path> --project <path>"
      );
      process.exit(1);
    }
    const result = await incrementalSave(
      sessionId,
      transcriptPath,
      projectPath
    );
    console.log(JSON.stringify(result));
    process.exit(result.success ? 0 : 1);
  } else if (command === "commit") {
    const sessionId = getArg("session");
    const projectPath = getArg("project");
    if (!sessionId || !projectPath) {
      console.error(
        "Usage: incremental-save.js commit --session <id> --project <path>"
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
        "Usage: incremental-save.js cleanup --session <id> --project <path>"
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
        "Usage: incremental-save.js cleanup-stale --project <path> [--grace-days <n>]"
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
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

// lib/utils.ts
import * as fs2 from "node:fs";
import * as path2 from "node:path";
function safeReadJson(filePath, fallback) {
  try {
    const content = fs2.readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return fallback;
  }
}
function safeWriteJson(filePath, data) {
  const dir = path2.dirname(filePath);
  if (!fs2.existsSync(dir)) {
    fs2.mkdirSync(dir, { recursive: true });
  }
  fs2.writeFileSync(filePath, JSON.stringify(data, null, 2));
}
function nowISO() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function findJsonFiles(dir) {
  const results = [];
  if (!fs2.existsSync(dir)) return results;
  const items = fs2.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path2.join(dir, item.name);
    if (item.isDirectory()) {
      results.push(...findJsonFiles(fullPath));
    } else if (item.name.endsWith(".json")) {
      results.push(fullPath);
    }
  }
  return results;
}

// lib/session-finalize.ts
function findSessionFile(sessionsDir, shortId) {
  if (!fs3.existsSync(sessionsDir)) return null;
  const files = findJsonFiles(sessionsDir);
  return files.find((f) => path3.basename(f) === `${shortId}.json`) || null;
}
function computeCleanupAfter(graceDays) {
  const d = /* @__PURE__ */ new Date();
  d.setDate(d.getDate() + graceDays);
  return d.toISOString();
}
async function sessionFinalize(sessionId, cwd, transcriptPath, cleanupPolicy, graceDays) {
  const mnemeDir = path3.join(cwd, ".mneme");
  const sessionsDir = path3.join(mnemeDir, "sessions");
  const sessionLinksDir = path3.join(mnemeDir, "session-links");
  if (!fs3.existsSync(mnemeDir)) {
    return { status: "skipped" };
  }
  const sessionShortId = sessionId.substring(0, 8);
  let sessionFile = findSessionFile(sessionsDir, sessionShortId);
  if (!sessionFile) {
    const linkFile = path3.join(sessionLinksDir, `${sessionShortId}.json`);
    if (fs3.existsSync(linkFile)) {
      const link = safeReadJson(linkFile, {
        masterSessionId: "",
        claudeSessionId: "",
        linkedAt: ""
      });
      if (link.masterSessionId) {
        const masterFile = findSessionFile(sessionsDir, link.masterSessionId);
        if (masterFile) {
          sessionFile = masterFile;
        }
      }
    }
  }
  if (transcriptPath && fs3.existsSync(transcriptPath)) {
    try {
      await incrementalSave(sessionId, transcriptPath, cwd);
    } catch {
    }
  }
  const now = nowISO();
  if (sessionFile && fs3.existsSync(sessionFile)) {
    const data = safeReadJson(sessionFile, {});
    const hasSummary = !!data.summary;
    if (!hasSummary) {
      const cleanupAfter = cleanupPolicy !== "immediate" ? computeCleanupAfter(graceDays) : null;
      data.status = "uncommitted";
      data.endedAt = now;
      data.updatedAt = now;
      data.uncommitted = {
        endedAt: now,
        policy: cleanupPolicy,
        cleanupAfter
      };
      delete data.interactions;
      delete data.preCompactBackups;
      safeWriteJson(sessionFile, data);
      if (cleanupPolicy === "immediate") {
        const cleanupResult = cleanupUncommittedSession(sessionId, cwd);
        if (cleanupResult.deleted) {
          console.error(
            `[mneme] Session ended without /mneme:save - cleaned up ${cleanupResult.count} interactions`
          );
          fs3.unlinkSync(sessionFile);
          const linkFile = path3.join(sessionLinksDir, `${sessionShortId}.json`);
          if (fs3.existsSync(linkFile)) {
            fs3.unlinkSync(linkFile);
          }
          console.error(
            "[mneme] Session completed (not saved, cleaned up immediately)"
          );
        } else {
          data.status = "complete";
          data.endedAt = now;
          data.updatedAt = now;
          delete data.uncommitted;
          delete data.interactions;
          delete data.preCompactBackups;
          safeWriteJson(sessionFile, data);
          console.error(
            "[mneme] Session completed (committed in SQLite, kept despite missing summary)"
          );
        }
      } else if (cleanupPolicy === "never") {
        console.error(
          "[mneme] Session completed (not saved, kept as uncommitted)"
        );
      } else {
        console.error(
          "[mneme] Session completed (not saved, marked uncommitted for grace cleanup)"
        );
      }
    } else {
      data.status = "complete";
      data.endedAt = now;
      data.updatedAt = now;
      delete data.uncommitted;
      delete data.interactions;
      delete data.preCompactBackups;
      safeWriteJson(sessionFile, data);
      console.error(`[mneme] Session completed: ${sessionFile}`);
    }
  } else {
    console.error("[mneme] Session completed (no session file found)");
  }
  let graceCleanup;
  if (cleanupPolicy === "grace") {
    const result = cleanupStaleUncommittedSessions(cwd, graceDays);
    if (result.deletedSessions > 0 || result.deletedInteractions > 0) {
      console.error(
        `[mneme] Grace cleanup removed ${result.deletedSessions} sessions and ${result.deletedInteractions} interactions`
      );
      graceCleanup = result;
    }
  }
  const sessionLinkFile = path3.join(sessionLinksDir, `${sessionShortId}.json`);
  if (fs3.existsSync(sessionLinkFile)) {
    const link = safeReadJson(sessionLinkFile, {
      masterSessionId: "",
      claudeSessionId: "",
      linkedAt: ""
    });
    if (link.masterSessionId) {
      const masterFile = findSessionFile(sessionsDir, link.masterSessionId);
      if (masterFile && fs3.existsSync(masterFile)) {
        const master = safeReadJson(masterFile, {});
        if (master.workPeriods) {
          master.workPeriods = master.workPeriods.map((wp) => {
            if (wp.claudeSessionId === sessionId && wp.endedAt === null) {
              return { ...wp, endedAt: now };
            }
            return wp;
          });
          master.updatedAt = now;
          safeWriteJson(masterFile, master);
        }
      }
    }
  }
  return { status: "ok", graceCleanup };
}
async function main2() {
  const args = process.argv.slice(2);
  const getArg = (name) => {
    const index = args.indexOf(`--${name}`);
    return index !== -1 ? args[index + 1] : void 0;
  };
  const command = args[0];
  if (command === "finalize") {
    const sessionId = getArg("session-id") || "";
    const cwd = getArg("cwd") || process.cwd();
    const transcript = getArg("transcript") || "";
    const cleanupPolicy = getArg("cleanup-policy") || "grace";
    const graceDays = Number.parseInt(getArg("grace-days") || "7", 10);
    if (!sessionId) {
      console.error(
        "Usage: session-finalize.js finalize --session-id <id> --cwd <path> --transcript <path>"
      );
      process.exit(1);
    }
    const result = await sessionFinalize(
      sessionId,
      cwd,
      transcript,
      cleanupPolicy,
      graceDays
    );
    console.log(JSON.stringify(result));
    process.exit(0);
  } else {
    console.error(
      "Usage: session-finalize.js finalize --session-id <id> --cwd <path> --transcript <path>"
    );
    process.exit(1);
  }
}
var scriptPath = process.argv[1];
if (scriptPath && (import.meta.url === `file://${scriptPath}` || scriptPath.endsWith("session-finalize.js") || scriptPath.endsWith("session-finalize.ts"))) {
  main2();
}
