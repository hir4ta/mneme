// servers/db-transcript.ts
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as readline from "node:readline";

// servers/db-types.ts
var { DatabaseSync } = await import("node:sqlite");

// servers/db-utils.ts
function getProjectPath() {
  return process.env.MNEME_PROJECT_PATH || process.cwd();
}

// servers/db-transcript.ts
function getTranscriptPath(claudeSessionId) {
  const projectPath = getProjectPath();
  const encodedPath = projectPath.replace(/\//g, "-");
  const transcriptPath = path.join(
    os.homedir(),
    ".claude",
    "projects",
    encodedPath,
    `${claudeSessionId}.jsonl`
  );
  return fs.existsSync(transcriptPath) ? transcriptPath : null;
}
async function parseTranscript(transcriptPath) {
  const fileStream = fs.createReadStream(transcriptPath);
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
export {
  getTranscriptPath,
  parseTranscript
};
