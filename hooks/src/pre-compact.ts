#!/usr/bin/env node
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import {
  PreCompactInputSchema,
  type PreCompactInput,
  type TranscriptMessage,
} from "./types.js";
import {
  readStdin,
  parseTranscript,
  getMemoriaDir,
  logError,
  logInfo,
} from "./utils.js";

interface PartialSession {
  id: string;
  sessionId: string;
  createdAt: string;
  status: "in_progress";
  context: {
    branch: string | null;
    projectDir: string;
  };
  summary: string;
  messages: Array<{
    type: "user" | "assistant";
    timestamp: string;
    content: string;
    thinking?: string;
  }>;
  compactedAt: string;
  compactTrigger: string;
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

function extractMessages(
  transcript: TranscriptMessage[]
): PartialSession["messages"] {
  const messages: PartialSession["messages"] = [];

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

      if (typeof content === "string") {
        textContent = content;
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === "text" && block.text) {
            textContent += block.text;
          } else if (block.type === "thinking" && block.text) {
            thinking = block.text;
          }
        }
      }

      if (textContent || thinking) {
        messages.push({
          type: "assistant",
          timestamp,
          content: textContent,
          ...(thinking ? { thinking } : {}),
        });
      }
    }
  }

  return messages;
}

function generateSummary(messages: PartialSession["messages"]): string {
  // Simple summary: take the first user message as context
  const firstUserMessage = messages.find((m) => m.type === "user");
  if (firstUserMessage) {
    const content = firstUserMessage.content;
    if (content.length > 100) {
      return content.substring(0, 100) + "...";
    }
    return content;
  }
  return "Session in progress";
}

async function main() {
  try {
    const inputJson = await readStdin();
    const input: PreCompactInput = PreCompactInputSchema.parse(
      JSON.parse(inputJson)
    );

    // Parse transcript to extract messages
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
      logInfo("Pre-compact: No messages to save");
      process.exit(0);
    }

    // Use cwd from input if available, otherwise fallback to process.cwd()
    // SECURITY: Never derive paths from transcript_path to avoid path traversal
    const projectDir = input.cwd || process.cwd();
    const resolvedProjectDir = path.resolve(projectDir);

    const memoriaDir = getMemoriaDir(resolvedProjectDir);
    const sessionsDir = path.join(memoriaDir, "sessions");

    // Ensure directory exists
    await mkdir(sessionsDir, { recursive: true });

    const sessionId = input.session_id;
    const now = new Date().toISOString();
    const branch = await getCurrentBranch(resolvedProjectDir);

    const partialSession: PartialSession = {
      id: `${now.split("T")[0]}_${sessionId.substring(0, 8)}`,
      sessionId,
      createdAt: now,
      status: "in_progress",
      context: {
        branch,
        projectDir: resolvedProjectDir,
      },
      summary: generateSummary(messages),
      messages,
      compactedAt: now,
      compactTrigger: input.trigger,
    };

    const sessionPath = path.join(sessionsDir, `${partialSession.id}.json`);
    await writeFile(sessionPath, JSON.stringify(partialSession, null, 2));

    logInfo(`Pre-compact: Saved partial session to ${sessionPath}`);
    process.exit(0);
  } catch (error) {
    logError(`Pre-compact hook error: ${error}`);
    process.exit(1);
  }
}

main();
