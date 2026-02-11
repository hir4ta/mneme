import * as fs from "node:fs";
import * as readline from "node:readline";
import type {
  ParsedInteraction,
  ProgressEvent,
  ToolResultMeta,
  TranscriptEntry,
} from "./types.js";

function extractSlashCommand(content: string): string | undefined {
  const match = content.match(/<command-name>([^<]+)<\/command-name>/);
  return match ? match[1] : undefined;
}

function extractToolResultMeta(
  content: Array<{
    type: string;
    tool_use_id?: string;
    content?: string | unknown;
    is_error?: boolean;
  }>,
  toolUseIdToName: Map<string, string>,
  toolUseIdToFilePath: Map<string, string>,
): ToolResultMeta[] {
  return content
    .filter((c) => c.type === "tool_result" && c.tool_use_id)
    .map((c) => {
      const contentStr =
        typeof c.content === "string"
          ? c.content
          : c.content
            ? JSON.stringify(c.content)
            : "";
      const lineCount = contentStr.split("\n").length;
      const toolUseId = c.tool_use_id || "";

      let filePath = toolUseIdToFilePath.get(toolUseId);
      if (!filePath) {
        const filePathMatch = contentStr.match(
          /(?:^|\s)((?:\/|\.\/)\S+\.\w+)\b/,
        );
        filePath = filePathMatch ? filePathMatch[1] : undefined;
      }

      return {
        toolUseId,
        toolName: toolUseIdToName.get(toolUseId),
        success: !c.is_error,
        contentLength: contentStr.length,
        lineCount: lineCount > 1 ? lineCount : undefined,
        filePath,
      };
    });
}

export async function parseTranscriptIncremental(
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
    if (lineNumber <= lastSavedLine) continue;
    if (line.trim()) {
      try {
        entries.push(JSON.parse(line));
      } catch {
        // Skip invalid JSON lines
      }
    }
  }

  const planModeEvents: Array<{ timestamp: string; entering: boolean }> = [];
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

  function isInPlanMode(timestamp: string): boolean {
    let inPlanMode = false;
    for (const event of planModeEvents) {
      if (event.timestamp > timestamp) break;
      inPlanMode = event.entering;
    }
    return inPlanMode;
  }

  const progressEvents: Map<string, ProgressEvent[]> = new Map();
  for (const entry of entries) {
    if (entry.type === "progress" && entry.data?.type) {
      if (entry.data.type === "hook_progress") continue;
      const event: ProgressEvent = {
        type: entry.data.type,
        timestamp: entry.timestamp,
        hookEvent: entry.data.hookEvent,
        hookName: entry.data.hookName,
        toolName: entry.data.toolName,
        ...(entry.data.type === "agent_progress" && {
          prompt: entry.data.prompt,
          agentId: entry.data.agentId,
        }),
      };
      const key = entry.timestamp.slice(0, 16);
      if (!progressEvents.has(key)) progressEvents.set(key, []);
      progressEvents.get(key)?.push(event);
    }
  }

  const userMessages = entries
    .filter((e) => {
      if (e.type !== "user" || e.message?.role !== "user") return false;
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

  const toolUseIdToName: Map<string, string> = new Map();
  const toolUseIdToFilePath: Map<string, string> = new Map();
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
        toolUseIdToFilePath,
      );
      if (results.length > 0) {
        const key = entry.timestamp.slice(0, 16);
        const existing = toolResultsByTimestamp.get(key) || [];
        toolResultsByTimestamp.set(key, [...existing, ...results]);
      }
    }
  }

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

      return { timestamp: e.timestamp, thinking, text, toolDetails };
    })
    .filter((m) => m !== null);

  const interactions: ParsedInteraction[] = [];
  for (let i = 0; i < userMessages.length; i++) {
    const user = userMessages[i];
    const nextUserTs =
      i + 1 < userMessages.length
        ? userMessages[i + 1].timestamp
        : "9999-12-31T23:59:59Z";

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
        inPlanMode: isInPlanMode(user.timestamp) || undefined,
        slashCommand: user.slashCommand,
        toolResults: toolResultsByTimestamp.get(timeKey),
        progressEvents: progressEvents.get(timeKey),
      });
    }
  }

  return { interactions, totalLines: lineNumber };
}
