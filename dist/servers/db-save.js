// servers/db-save.ts
import * as os2 from "node:os";

// servers/db-transcript.ts
import * as fs2 from "node:fs";
import * as os from "node:os";
import * as path2 from "node:path";
import * as readline from "node:readline";

// servers/db-utils.ts
import * as fs from "node:fs";
import * as path from "node:path";

// servers/db-types.ts
var { DatabaseSync } = await import("node:sqlite");

// servers/db-utils.ts
function getProjectPath() {
  return process.env.MNEME_PROJECT_PATH || process.cwd();
}
function getLocalDbPath() {
  return path.join(getProjectPath(), ".mneme", "local.db");
}
var db = null;
function getDb() {
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

// servers/db-transcript.ts
function getTranscriptPath(claudeSessionId) {
  const projectPath = getProjectPath();
  const encodedPath = projectPath.replace(/\//g, "-");
  const transcriptPath = path2.join(
    os.homedir(),
    ".claude",
    "projects",
    encodedPath,
    `${claudeSessionId}.jsonl`
  );
  return fs2.existsSync(transcriptPath) ? transcriptPath : null;
}
async function parseTranscript(transcriptPath) {
  const fileStream = fs2.createReadStream(transcriptPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Number.POSITIVE_INFINITY
  });
  const entries = [];
  let totalLines = 0;
  for await (const line of rl) {
    totalLines++;
    if (line.trim()) {
      try {
        entries.push(JSON.parse(line));
      } catch {
      }
    }
  }
  const userMessages = extractUserMessages(entries);
  const assistantMessages = extractAssistantMessages(entries);
  const toolUsage = extractToolUsage(entries);
  const files = extractFileChanges(entries);
  const interactions = buildInteractions(userMessages, assistantMessages);
  return {
    interactions,
    toolUsage,
    files,
    metrics: {
      userMessages: userMessages.length,
      assistantResponses: assistantMessages.length,
      thinkingBlocks: assistantMessages.filter((a) => a.thinking).length
    },
    totalLines
  };
}
function extractUserMessages(entries) {
  return entries.filter((e) => {
    if (e.type !== "user" || e.message?.role !== "user") return false;
    if (e.isMeta === true) return false;
    const content = e.message?.content;
    if (typeof content !== "string") return false;
    if (content.startsWith("<local-command-stdout>")) return false;
    if (content.startsWith("<local-command-caveat>")) return false;
    return true;
  }).map((e) => ({
    timestamp: e.timestamp,
    content: e.message?.content,
    isCompactSummary: e.isCompactSummary || false
  }));
}
function extractAssistantMessages(entries) {
  return entries.filter((e) => e.type === "assistant").map((e) => {
    const contentArray = e.message?.content;
    if (!Array.isArray(contentArray)) return null;
    const thinking = contentArray.filter((c) => c.type === "thinking" && c.thinking).map((c) => c.thinking).join("\n");
    const text = contentArray.filter((c) => c.type === "text" && c.text).map((c) => c.text).join("\n");
    if (!thinking && !text) return null;
    return { timestamp: e.timestamp, thinking, text };
  }).filter((m) => m !== null);
}
function extractToolUsage(entries) {
  const toolUsageMap = /* @__PURE__ */ new Map();
  for (const entry of entries) {
    if (entry.type === "assistant" && Array.isArray(entry.message?.content)) {
      for (const c of entry.message.content) {
        if (c.type === "tool_use" && c.name) {
          toolUsageMap.set(c.name, (toolUsageMap.get(c.name) || 0) + 1);
        }
      }
    }
  }
  return Array.from(toolUsageMap.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}
function extractFileChanges(entries) {
  const filesMap = /* @__PURE__ */ new Map();
  for (const entry of entries) {
    if (entry.type === "assistant" && Array.isArray(entry.message?.content)) {
      for (const c of entry.message.content) {
        if (c.type === "tool_use" && (c.name === "Edit" || c.name === "Write")) {
          const filePath = c.input?.file_path;
          if (filePath) {
            filesMap.set(filePath, c.name === "Write" ? "create" : "edit");
          }
        }
      }
    }
  }
  return Array.from(filesMap.entries()).map(([p, action]) => ({
    path: p,
    action
  }));
}
function buildInteractions(userMessages, assistantMessages) {
  const interactions = [];
  for (let i = 0; i < userMessages.length; i++) {
    const user = userMessages[i];
    const nextUserTs = i + 1 < userMessages.length ? userMessages[i + 1].timestamp : "9999-12-31T23:59:59Z";
    const turnResponses = assistantMessages.filter(
      (a) => a.timestamp > user.timestamp && a.timestamp < nextUserTs
    );
    if (turnResponses.length > 0) {
      interactions.push({
        id: `int-${String(i + 1).padStart(3, "0")}`,
        timestamp: user.timestamp,
        user: user.content,
        thinking: turnResponses.filter((r) => r.thinking).map((r) => r.thinking).join("\n"),
        assistant: turnResponses.filter((r) => r.text).map((r) => r.text).join("\n"),
        isCompactSummary: user.isCompactSummary
      });
    }
  }
  return interactions;
}

// servers/db-save.ts
async function saveInteractions(claudeSessionId, mnemeSessionId) {
  const transcriptPath = getTranscriptPath(claudeSessionId);
  if (!transcriptPath) {
    return {
      success: false,
      savedCount: 0,
      mergedFromBackup: 0,
      message: `Transcript not found for session: ${claudeSessionId}`
    };
  }
  const database = getDb();
  if (!database) {
    return {
      success: false,
      savedCount: 0,
      mergedFromBackup: 0,
      message: "Database not available"
    };
  }
  const projectPath = getProjectPath();
  const sessionId = mnemeSessionId || claudeSessionId.slice(0, 8);
  let owner = "unknown";
  try {
    const { execSync } = await import("node:child_process");
    owner = execSync("git config user.name", {
      encoding: "utf8",
      cwd: projectPath
    }).trim() || owner;
  } catch {
    try {
      owner = os2.userInfo().username || owner;
    } catch {
    }
  }
  let repository = "";
  let repositoryUrl = "";
  let repositoryRoot = "";
  try {
    const { execSync } = await import("node:child_process");
    repositoryRoot = execSync("git rev-parse --show-toplevel", {
      encoding: "utf8",
      cwd: projectPath
    }).trim();
    repositoryUrl = execSync("git remote get-url origin", {
      encoding: "utf8",
      cwd: projectPath
    }).trim();
    const match = repositoryUrl.match(/[:/]([^/]+\/[^/]+?)(\.git)?$/);
    if (match) {
      repository = match[1].replace(/\.git$/, "");
    }
  } catch {
  }
  const parsed = await parseTranscript(transcriptPath);
  let backupInteractions = [];
  try {
    const stmt = database.prepare(`
      SELECT interactions FROM pre_compact_backups
      WHERE session_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `);
    const row = stmt.get(sessionId);
    if (row?.interactions) {
      backupInteractions = JSON.parse(row.interactions);
    }
  } catch {
  }
  const lastBackupTs = backupInteractions.length > 0 ? backupInteractions[backupInteractions.length - 1].timestamp : "1970-01-01T00:00:00Z";
  const trulyNew = parsed.interactions.filter(
    (i) => i.timestamp > lastBackupTs
  );
  const merged = [...backupInteractions, ...trulyNew];
  const finalInteractions = merged.map((interaction, idx) => ({
    ...interaction,
    id: `int-${String(idx + 1).padStart(3, "0")}`
  }));
  if (finalInteractions.length === 0) {
    return {
      success: true,
      savedCount: 0,
      mergedFromBackup: backupInteractions.length,
      message: "No interactions to save (transcript may have no text user messages). Existing data preserved."
    };
  }
  try {
    const deleteStmt = database.prepare(
      "DELETE FROM interactions WHERE claude_session_id = ?"
    );
    deleteStmt.run(claudeSessionId);
  } catch {
  }
  const insertStmt = database.prepare(`
    INSERT INTO interactions (
      session_id, claude_session_id, project_path, repository, repository_url, repository_root,
      owner, role, content, thinking, timestamp, is_compact_summary
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let insertedCount = 0;
  for (const interaction of finalInteractions) {
    try {
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
        interaction.isCompactSummary ? 1 : 0
      );
      insertedCount++;
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
          0
        );
        insertedCount++;
      }
    } catch {
    }
  }
  try {
    const clearBackupStmt = database.prepare(
      "DELETE FROM pre_compact_backups WHERE session_id = ?"
    );
    clearBackupStmt.run(sessionId);
  } catch {
  }
  try {
    const lastTimestamp = finalInteractions.length > 0 ? finalInteractions[finalInteractions.length - 1].timestamp : null;
    const checkStmt = database.prepare(
      "SELECT 1 FROM session_save_state WHERE claude_session_id = ?"
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
      const insertStateStmt = database.prepare(`
        INSERT INTO session_save_state (claude_session_id, mneme_session_id, project_path, last_saved_line, last_saved_timestamp)
        VALUES (?, ?, ?, ?, ?)
      `);
      insertStateStmt.run(
        claudeSessionId,
        sessionId,
        projectPath,
        parsed.totalLines,
        lastTimestamp
      );
    }
  } catch {
  }
  return {
    success: true,
    savedCount: insertedCount,
    mergedFromBackup: backupInteractions.length,
    message: `Saved ${insertedCount} interactions (${finalInteractions.length} turns, ${backupInteractions.length} from backup)`
  };
}
function markSessionCommitted(claudeSessionId) {
  const database = getDb();
  if (!database) return false;
  try {
    const checkStmt = database.prepare(
      "SELECT 1 FROM session_save_state WHERE claude_session_id = ?"
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
export {
  markSessionCommitted,
  saveInteractions
};
