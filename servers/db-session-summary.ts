/**
 * Session summary update logic and tool registration for mneme MCP Database Server
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { markSessionCommitted } from "./db-save.js";
import { getTranscriptPath, parseTranscript } from "./db-transcript.js";
import { fail, ok } from "./db-types.js";
import { getProjectPath, readJsonFile } from "./db-utils.js";

interface SessionSummaryParams {
  claudeSessionId: string;
  title: string;
  summary: { goal: string; outcome: string; description?: string };
  tags?: string[];
  sessionType?: string;
  plan?: { goals?: string[]; tasks?: string[]; remaining?: string[] };
  discussions?: Array<{
    topic: string;
    decision: string;
    reasoning?: string;
    alternatives?: string[];
  }>;
  errors?: Array<{
    error: string;
    context?: string;
    solution?: string;
    files?: string[];
  }>;
  handoff?: { stoppedReason?: string; notes?: string[]; nextSteps?: string[] };
  references?: Array<{
    type?: string;
    url?: string;
    path?: string;
    title?: string;
    description?: string;
  }>;
}

async function updateSessionSummary(
  params: SessionSummaryParams,
): Promise<{ success: boolean; sessionFile: string; shortId: string }> {
  const {
    claudeSessionId,
    title,
    summary,
    tags,
    sessionType,
    plan,
    discussions,
    errors,
    handoff,
    references,
  } = params;

  const projectPath = getProjectPath();
  const sessionsDir = path.join(projectPath, ".mneme", "sessions");
  const shortId = claudeSessionId.slice(0, 8);

  let sessionFile: string | null = null;
  const searchDir = (dir: string): string | null => {
    if (!fs.existsSync(dir)) return null;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const result = searchDir(fullPath);
        if (result) return result;
      } else if (entry.name === `${shortId}.json`) {
        return fullPath;
      }
    }
    return null;
  };
  sessionFile = searchDir(sessionsDir);

  if (sessionFile) {
    const existingData = readJsonFile<{ sessionId?: string }>(sessionFile);
    if (existingData?.sessionId && existingData.sessionId !== claudeSessionId) {
      sessionFile = null;
    }
  }

  if (!sessionFile) {
    const now = new Date();
    const yearMonth = path.join(
      sessionsDir,
      String(now.getFullYear()),
      String(now.getMonth() + 1).padStart(2, "0"),
    );
    if (!fs.existsSync(yearMonth)) fs.mkdirSync(yearMonth, { recursive: true });
    sessionFile = path.join(yearMonth, `${shortId}.json`);
    const initial = {
      id: shortId,
      sessionId: claudeSessionId,
      createdAt: now.toISOString(),
      title: "",
      tags: [],
      context: {
        projectDir: projectPath,
        projectName: path.basename(projectPath),
      },
      metrics: {
        userMessages: 0,
        assistantResponses: 0,
        thinkingBlocks: 0,
        toolUsage: [],
      },
      files: [],
      status: null,
    };
    fs.writeFileSync(sessionFile, JSON.stringify(initial, null, 2));
  }

  const data = readJsonFile<Record<string, unknown>>(sessionFile) ?? {};
  data.title = title;
  data.summary = summary;
  data.updatedAt = new Date().toISOString();
  if (tags) data.tags = tags;
  if (sessionType) data.sessionType = sessionType;
  if (plan) data.plan = plan;
  if (discussions && discussions.length > 0) data.discussions = discussions;
  if (errors && errors.length > 0) data.errors = errors;
  if (handoff) data.handoff = handoff;
  if (references && references.length > 0) data.references = references;

  const transcriptPath = getTranscriptPath(claudeSessionId);
  if (transcriptPath) {
    try {
      const parsed = await parseTranscript(transcriptPath);
      data.metrics = {
        userMessages: parsed.metrics.userMessages,
        assistantResponses: parsed.metrics.assistantResponses,
        thinkingBlocks: parsed.metrics.thinkingBlocks,
        toolUsage: parsed.toolUsage,
      };
      if (parsed.files.length > 0) data.files = parsed.files;
    } catch {
      // Transcript parse failed
    }
  }

  const ctx = data.context as Record<string, unknown> | undefined;
  if (ctx && !ctx.repository) {
    try {
      const { execSync } = await import("node:child_process");
      const cwd = (ctx.projectDir as string) || projectPath;
      const git = (cmd: string) =>
        execSync(cmd, { encoding: "utf8", cwd }).trim();
      const branch = git("git rev-parse --abbrev-ref HEAD");
      if (branch) ctx.branch = branch;
      const remoteUrl = git("git remote get-url origin");
      const repoMatch = remoteUrl.match(/[:/]([^/]+\/[^/]+?)(\.git)?$/);
      if (repoMatch) ctx.repository = repoMatch[1].replace(/\.git$/, "");
      const userName = git("git config user.name");
      const userEmail = git("git config user.email");
      if (userName)
        ctx.user = {
          name: userName,
          ...(userEmail ? { email: userEmail } : {}),
        };
    } catch {
      // Not a git repo
    }
  }

  fs.writeFileSync(sessionFile, JSON.stringify(data, null, 2));
  markSessionCommitted(claudeSessionId);

  return {
    success: true,
    sessionFile: sessionFile.replace(projectPath, "."),
    shortId,
  };
}

export function registerSessionSummaryTool(server: McpServer) {
  server.registerTool(
    "mneme_update_session_summary",
    {
      description:
        "Update session JSON file with summary data. " +
        "MUST be called during /mneme:save Phase 3 to persist session metadata. " +
        "Creates the session file if it does not exist (e.g. when SessionStart hook was skipped).",
      inputSchema: {
        claudeSessionId: z
          .string()
          .min(8)
          .describe("Full Claude Code session UUID (36 chars)"),
        title: z.string().describe("Session title"),
        summary: z
          .object({
            goal: z.string().describe("What the session aimed to accomplish"),
            outcome: z.string().describe("What was actually accomplished"),
            description: z
              .string()
              .optional()
              .describe("Detailed description of the session"),
          })
          .describe("Session summary object"),
        tags: z
          .array(z.string())
          .optional()
          .describe("Semantic tags for the session"),
        sessionType: z
          .string()
          .optional()
          .describe(
            "Session type (e.g. implementation, research, bugfix, refactor)",
          ),
        plan: z
          .object({
            goals: z.array(z.string()).optional().describe("Session goals"),
            tasks: z
              .array(z.string())
              .optional()
              .describe('Task list (prefix with "[x] " for completed)'),
            remaining: z
              .array(z.string())
              .optional()
              .describe("Remaining tasks"),
          })
          .optional()
          .describe("Session plan with tasks and progress"),
        discussions: z
          .array(
            z.object({
              topic: z.string().describe("Discussion topic"),
              decision: z.string().describe("Final decision"),
              reasoning: z.string().optional().describe("Reasoning"),
              alternatives: z
                .array(z.string())
                .optional()
                .describe("Considered alternatives"),
            }),
          )
          .optional()
          .describe("Design discussions and decisions made during session"),
        errors: z
          .array(
            z.object({
              error: z.string().describe("Error message or description"),
              context: z.string().optional().describe("Where/when it occurred"),
              solution: z.string().optional().describe("How it was resolved"),
              files: z
                .array(z.string())
                .optional()
                .describe("Related file paths"),
            }),
          )
          .optional()
          .describe("Errors encountered and their solutions"),
        handoff: z
          .object({
            stoppedReason: z
              .string()
              .optional()
              .describe("Why the session stopped"),
            notes: z
              .array(z.string())
              .optional()
              .describe("Important notes for next session"),
            nextSteps: z
              .array(z.string())
              .optional()
              .describe("What to do next"),
          })
          .optional()
          .describe("Handoff context for session continuity"),
        references: z
          .array(
            z.object({
              type: z
                .string()
                .optional()
                .describe('Reference type: "doc", "file", "url"'),
              url: z.string().optional().describe("URL if external"),
              path: z.string().optional().describe("File path if local"),
              title: z.string().optional().describe("Title or label"),
              description: z.string().optional().describe("Brief description"),
            }),
          )
          .optional()
          .describe("Documents and resources referenced during session"),
      },
    },
    async (params) => {
      if (!params.claudeSessionId.trim())
        return fail("claudeSessionId must not be empty.");
      const result = await updateSessionSummary(params);
      return ok(JSON.stringify(result, null, 2));
    },
  );
}
