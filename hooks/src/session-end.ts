#!/usr/bin/env node
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import {
  SessionEndInputSchema,
  type SessionEndInput,
  type TranscriptMessage,
} from "./types.js";
import {
  readStdin,
  parseTranscript,
  getMemoriaDir,
  logError,
  logInfo,
} from "./utils.js";

interface Session {
  id: string;
  sessionId: string;
  createdAt: string;
  endedAt: string;
  user: {
    name: string;
    email?: string;
  };
  context: {
    branch: string | null;
    projectDir: string;
  };
  tags: string[];
  status: "completed";
  summary: string;
  messages: Array<{
    type: "user" | "assistant";
    timestamp: string;
    content: string;
    thinking?: string;
    toolUses?: Array<{
      tool: string;
      input: unknown;
    }>;
  }>;
  filesModified: Array<{
    path: string;
    action: "created" | "modified" | "deleted";
  }>;
  endReason: string;
}

async function getCurrentBranch(cwd: string): Promise<string | null> {
  try {
    const { execSync } = await import("node:child_process");
    const result = execSync("git rev-parse --abbrev-ref HEAD", {
      cwd,
      encoding: "utf-8",
    });
    return result.trim();
  } catch {
    return null;
  }
}

async function getGitUser(cwd: string): Promise<{ name: string; email?: string }> {
  try {
    const { execSync } = await import("node:child_process");
    const name = execSync("git config user.name", {
      cwd,
      encoding: "utf-8",
    }).trim();
    const email = execSync("git config user.email", {
      cwd,
      encoding: "utf-8",
    }).trim();
    return { name: name || "unknown", email: email || undefined };
  } catch {
    return { name: "unknown" };
  }
}

function extractMessages(
  transcript: TranscriptMessage[]
): Session["messages"] {
  const messages: Session["messages"] = [];

  for (const entry of transcript) {
    if (entry.type !== "message" || !entry.message) continue;

    const { role, content } = entry.message;
    const timestamp = entry.timestamp || new Date().toISOString();

    if (role === "user" && typeof content === "string") {
      messages.push({
        type: "user",
        timestamp,
        content,
      });
    } else if (role === "assistant") {
      let textContent = "";
      let thinking = "";
      const toolUses: Session["messages"][0]["toolUses"] = [];

      if (typeof content === "string") {
        textContent = content;
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === "text" && block.text) {
            textContent += block.text;
          } else if (block.type === "thinking" && block.text) {
            thinking = block.text;
          } else if (block.type === "tool_use") {
            toolUses.push({
              tool: (block as { name?: string }).name || "unknown",
              input: (block as { input?: unknown }).input,
            });
          }
        }
      }

      if (textContent || thinking || toolUses.length > 0) {
        messages.push({
          type: "assistant",
          timestamp,
          content: textContent,
          ...(thinking ? { thinking } : {}),
          ...(toolUses.length > 0 ? { toolUses } : {}),
        });
      }
    }
  }

  return messages;
}

function extractFilesModified(
  transcript: TranscriptMessage[]
): Session["filesModified"] {
  const filesModified: Session["filesModified"] = [];
  const fileActions = new Map<string, "created" | "modified" | "deleted">();

  for (const entry of transcript) {
    if (entry.type !== "tool_result") continue;

    const toolEntry = entry as {
      tool?: string;
      input?: { file_path?: string };
      result?: { action?: string; success?: boolean };
    };

    const filePath = toolEntry.input?.file_path;
    if (!filePath) continue;

    // Determine action based on tool type and result
    let action: "created" | "modified" | "deleted" | null = null;

    // Check result.action first (most reliable if present)
    const resultAction = toolEntry.result?.action;
    if (resultAction === "deleted" || resultAction === "removed") {
      action = "deleted";
    } else if (resultAction === "created") {
      action = "created";
    } else if (resultAction === "modified") {
      action = "modified";
    } else {
      // Fall back to tool-based inference
      if (toolEntry.tool === "Write") {
        action = "created";
      } else if (toolEntry.tool === "Edit" || toolEntry.tool === "NotebookEdit") {
        action = "modified";
      } else if (toolEntry.tool === "Delete" || toolEntry.tool === "Remove") {
        action = "deleted";
      }
    }

    if (action) {
      // Track the latest action for each file
      fileActions.set(filePath, action);
    }
  }

  // Convert map to array
  for (const [filePath, action] of fileActions) {
    filesModified.push({ path: filePath, action });
  }

  return filesModified;
}

function extractTags(messages: Session["messages"]): string[] {
  const tagCounts = new Map<string, number>();
  const commonTags = [
    "auth",
    "api",
    "ui",
    "test",
    "bug",
    "feature",
    "refactor",
    "docs",
    "config",
    "db",
    "security",
  ];

  for (const msg of messages) {
    const text = (msg.content + " " + (msg.thinking || "")).toLowerCase();
    for (const tag of commonTags) {
      if (text.includes(tag)) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    }
  }

  // Return top 3 tags
  return Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag]) => tag);
}

function generateSummary(messages: Session["messages"]): string {
  // Find the first substantial user message
  const userMessages = messages.filter((m) => m.type === "user");
  if (userMessages.length === 0) {
    return "Empty session";
  }

  const firstMessage = userMessages[0].content;
  const lastMessage = userMessages[userMessages.length - 1].content;

  // Simple summary: combine first and last user messages
  if (userMessages.length === 1) {
    return firstMessage.length > 150
      ? firstMessage.substring(0, 150) + "..."
      : firstMessage;
  }

  const firstPart =
    firstMessage.length > 75
      ? firstMessage.substring(0, 75) + "..."
      : firstMessage;
  const lastPart =
    lastMessage.length > 75
      ? lastMessage.substring(0, 75) + "..."
      : lastMessage;

  return `${firstPart} -> ${lastPart}`;
}

async function main() {
  try {
    const inputJson = await readStdin();
    const input: SessionEndInput = SessionEndInputSchema.parse(
      JSON.parse(inputJson)
    );

    // Parse transcript
    const result = await parseTranscript(input.transcript_path);

    if (result.error) {
      logError(`Failed to parse transcript ${input.transcript_path}: ${result.error}`);
      process.exit(1);
    }

    if (result.invalidLines > 0) {
      logError(`Skipped ${result.invalidLines} invalid JSON lines in ${input.transcript_path}`);
    }

    const messages = extractMessages(result.messages);

    if (messages.length === 0) {
      // No messages to save
      logInfo("Session end: No messages to save");
      process.exit(0);
    }

    const resolvedCwd = path.resolve(input.cwd);
    const memoriaDir = getMemoriaDir(resolvedCwd);
    const sessionsDir = path.join(memoriaDir, "sessions");

    // Ensure directory exists
    await mkdir(sessionsDir, { recursive: true });

    const now = new Date().toISOString();
    const branch = await getCurrentBranch(resolvedCwd);
    const user = await getGitUser(resolvedCwd);
    const filesModified = extractFilesModified(result.messages);
    const tags = extractTags(messages);

    // Find earliest message timestamp for createdAt
    const firstTimestamp = messages[0]?.timestamp || now;

    const session: Session = {
      id: `${now.split("T")[0]}_${input.session_id.substring(0, 8)}`,
      sessionId: input.session_id,
      createdAt: firstTimestamp,
      endedAt: now,
      user,
      context: {
        branch,
        projectDir: resolvedCwd,
      },
      tags,
      status: "completed",
      summary: generateSummary(messages),
      messages,
      filesModified,
      endReason: input.reason,
    };

    const sessionPath = path.join(sessionsDir, `${session.id}.json`);
    await writeFile(sessionPath, JSON.stringify(session, null, 2));

    logInfo(`Session end: Saved session to ${sessionPath}`);
    process.exit(0);
  } catch (error) {
    logError(`Session end hook error: ${error}`);
    process.exit(1);
  }
}

main();
