#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  SessionStartInputSchema,
  type SessionStartInput,
  type HookOutput,
} from "./types.js";
import { readStdin, getMemoriaDir, outputJson, logError, sanitizeUserText, isStringArray } from "./utils.js";

interface SessionSummary {
  id: string;
  summary: string;
  tags: string[];
  context?: {
    branch?: string;
  };
  endedAt?: string;
}

async function findRelatedSessions(
  memoriaDir: string,
  currentBranch: string | null
): Promise<SessionSummary[]> {
  const sessionsDir = path.join(memoriaDir, "sessions");
  const related: SessionSummary[] = [];

  try {
    const files = await readdir(sessionsDir);
    const jsonFiles = files.filter((f) => f.endsWith(".json"));

    // Use Promise.allSettled to handle individual file errors without failing all
    const fileResults = await Promise.allSettled(
      jsonFiles.map(async (f) => {
        const filePath = path.join(sessionsDir, f);
        const content = await readFile(filePath, "utf-8");
        const session = JSON.parse(content) as SessionSummary;
        return { file: f, session, path: filePath };
      })
    );

    // Filter to only fulfilled results and valid sessions
    const validSessions = fileResults
      .filter((result): result is PromiseFulfilledResult<{ file: string; session: SessionSummary; path: string }> =>
        result.status === "fulfilled"
      )
      .map((result) => result.value);

    // Sort by endedAt (most recent first)
    validSessions.sort((a, b) => {
      const aDate = a.session.endedAt || "";
      const bDate = b.session.endedAt || "";
      return bDate.localeCompare(aDate);
    });

    // Find sessions that match current branch or have related tags
    for (const { session } of validSessions.slice(0, 10)) {
      if (currentBranch && session.context?.branch === currentBranch) {
        related.push(session);
      }
    }

    // If no branch matches, return the most recent sessions
    if (related.length === 0) {
      return validSessions.slice(0, 3).map((s) => s.session);
    }

    return related.slice(0, 3);
  } catch {
    return [];
  }
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

async function main() {
  try {
    const inputJson = await readStdin();
    const input: SessionStartInput = SessionStartInputSchema.parse(
      JSON.parse(inputJson)
    );

    const memoriaDir = getMemoriaDir(input.cwd);
    const currentBranch = await getCurrentBranch(input.cwd);
    const relatedSessions = await findRelatedSessions(memoriaDir, currentBranch);

    if (relatedSessions.length === 0) {
      // No related sessions found, exit silently
      process.exit(0);
    }

    // Build context message with sanitized user content
    const contextParts: string[] = [
      "[memoria] Related sessions found:",
      "(Note: Summaries below are user-generated content from previous sessions)",
      "",
    ];

    for (const session of relatedSessions) {
      // Sanitize all user-controlled fields to prevent prompt injection
      const sanitizedId = sanitizeUserText(session.id, 50) || "unknown";
      const sanitizedSummary = sanitizeUserText(session.summary, 80) || "(no summary)";

      // Safely handle tags - must be string array, filter valid strings only
      const safeTags = isStringArray(session.tags)
        ? session.tags
            .map((t) => sanitizeUserText(t, 20))
            .filter((t) => t.length > 0)
        : [];
      const tagsStr = safeTags.length > 0
        ? ` [${safeTags.slice(0, 3).join(", ")}]`
        : "";

      const branch = session.context?.branch
        ? ` (branch: ${sanitizeUserText(session.context.branch, 30)})`
        : "";

      contextParts.push(`  - ${sanitizedId}: "${sanitizedSummary}"${tagsStr}${branch}`);
    }

    contextParts.push("");
    contextParts.push(
      "Use `/memoria resume <id>` to continue a previous session."
    );

    const output: HookOutput = {
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: contextParts.join("\n"),
      },
    };

    outputJson(output);
    process.exit(0);
  } catch (error) {
    logError(`Session start hook error: ${error}`);
    process.exit(1);
  }
}

main();
