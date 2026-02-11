/**
 * Additional MCP tool registrations for mneme DB server
 * (commit, timeline, linting, search eval)
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { lintRules, runSearchBenchmark } from "./benchmark.js";
import { getInteractions } from "./queries.js";
import { markSessionCommitted } from "./save.js";
import {
  fail,
  LIST_LIMIT_MIN,
  ok,
  SEARCH_EVAL_DEFAULT_LIMIT,
} from "./types.js";
import { getDb, readSessionsById } from "./utils.js";

export function registerExtendedTools(server: McpServer) {
  server.registerTool(
    "mneme_mark_session_committed",
    {
      description:
        "Mark session as committed to prevent cleanup on SessionEnd.",
      inputSchema: {
        claudeSessionId: z
          .string()
          .min(8)
          .describe("Full Claude Code session UUID (36 chars)"),
      },
    },
    async ({ claudeSessionId }) => {
      if (!claudeSessionId.trim())
        return fail("claudeSessionId must not be empty.");
      const success = markSessionCommitted(claudeSessionId);
      return {
        ...ok(JSON.stringify({ success, claudeSessionId }, null, 2)),
        isError: !success,
      };
    },
  );

  server.registerTool(
    "mneme_session_timeline",
    {
      description: "Build timeline for a session or its resume-chain.",
      inputSchema: {
        sessionId: z.string().min(1).describe("Session ID (short or full)"),
        includeChain: z
          .boolean()
          .optional()
          .describe(
            "Include resumedFrom chain and workPeriods (default: true)",
          ),
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
            typeof session.resumedFrom === "string"
              ? session.resumedFrom
              : null,
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

  server.registerTool(
    "mneme_rule_linter",
    {
      description: "Lint rules for schema and quality.",
      inputSchema: {
        ruleType: z
          .enum(["dev-rules", "review-guidelines", "all"])
          .optional()
          .describe("Rule set to lint (default: all)"),
      },
    },
    async ({ ruleType }) => {
      return ok(JSON.stringify(lintRules(ruleType), null, 2));
    },
  );

  server.registerTool(
    "mneme_search_eval",
    {
      description: "Run/compare search benchmark for quality checks.",
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
}
