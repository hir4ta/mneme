import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import { getCurrentUser } from "../../../lib/db/index.js";
import {
  isIndexStale,
  readAllDecisionIndexes,
  readAllSessionIndexes,
  readRecentDecisionIndexes,
  readRecentSessionIndexes,
  rebuildAllDecisionIndexes,
  rebuildAllSessionIndexes,
} from "../../../lib/index/manager.js";
import {
  buildSummaryPrompt,
  generateAISummary,
  getOpenAIKey,
  getSessionTypeBreakdown,
  getTopTags,
} from "../lib/ai-summary.js";
import {
  findJsonFileById,
  getMnemeDir,
  getProjectRoot,
  safeParseJsonFile,
} from "../lib/helpers.js";

const misc = new Hono();

// Project Info
misc.get("/project", (c) => {
  const projectRoot = getProjectRoot();
  const projectName = path.basename(projectRoot);

  let repository: string | null = null;
  try {
    const gitConfigPath = path.join(projectRoot, ".git", "config");
    if (fs.existsSync(gitConfigPath)) {
      const gitConfig = fs.readFileSync(gitConfigPath, "utf-8");
      const match = gitConfig.match(
        /url\s*=\s*.*[:/]([^/]+\/[^/]+?)(?:\.git)?$/m,
      );
      if (match) {
        repository = match[1];
      }
    }
  } catch {
    // Ignore git config errors
  }

  const version = "0.23.2";

  return c.json({
    name: projectName,
    path: projectRoot,
    repository,
    version,
  });
});

// Info
misc.get("/info", async (c) => {
  const projectRoot = getProjectRoot();
  const mnemeDir = getMnemeDir();
  return c.json({
    projectRoot,
    mnemeDir,
    exists: fs.existsSync(mnemeDir),
  });
});

// Current User
misc.get("/current-user", async (c) => {
  try {
    const user = getCurrentUser();
    return c.json({ user });
  } catch (error) {
    console.error("Failed to get current user:", error);
    return c.json({ error: "Failed to get current user" }, 500);
  }
});

// Tags
misc.get("/tags", async (c) => {
  const tagsPath = path.join(getMnemeDir(), "tags.json");
  try {
    if (!fs.existsSync(tagsPath)) {
      return c.json({ version: 1, tags: [] });
    }
    const tags = safeParseJsonFile(tagsPath);
    if (!tags) {
      return c.json({ error: "Failed to parse tags" }, 500);
    }
    return c.json(tags);
  } catch (error) {
    console.error("Failed to read tags:", error);
    return c.json({ error: "Failed to read tags" }, 500);
  }
});

// Indexes status
misc.get("/indexes/status", async (c) => {
  const mnemeDir = getMnemeDir();
  try {
    const sessionsIndex = readAllSessionIndexes(mnemeDir);
    const decisionsIndex = readAllDecisionIndexes(mnemeDir);

    return c.json({
      sessions: {
        exists: sessionsIndex.items.length > 0,
        itemCount: sessionsIndex.items.length,
        updatedAt: sessionsIndex.updatedAt,
        isStale: isIndexStale(sessionsIndex),
      },
      decisions: {
        exists: decisionsIndex.items.length > 0,
        itemCount: decisionsIndex.items.length,
        updatedAt: decisionsIndex.updatedAt,
        isStale: isIndexStale(decisionsIndex),
      },
    });
  } catch (error) {
    console.error("Failed to get index status:", error);
    return c.json({ error: "Failed to get index status" }, 500);
  }
});

// Rebuild indexes
misc.post("/indexes/rebuild", async (c) => {
  const mnemeDir = getMnemeDir();
  try {
    const sessionIndexes = rebuildAllSessionIndexes(mnemeDir);
    const decisionIndexes = rebuildAllDecisionIndexes(mnemeDir);

    let sessionCount = 0;
    let sessionUpdatedAt = "";
    for (const index of sessionIndexes.values()) {
      sessionCount += index.items.length;
      if (index.updatedAt > sessionUpdatedAt) {
        sessionUpdatedAt = index.updatedAt;
      }
    }

    let decisionCount = 0;
    let decisionUpdatedAt = "";
    for (const index of decisionIndexes.values()) {
      decisionCount += index.items.length;
      if (index.updatedAt > decisionUpdatedAt) {
        decisionUpdatedAt = index.updatedAt;
      }
    }

    return c.json({
      success: true,
      sessions: {
        itemCount: sessionCount,
        monthCount: sessionIndexes.size,
        updatedAt: sessionUpdatedAt || new Date().toISOString(),
      },
      decisions: {
        itemCount: decisionCount,
        monthCount: decisionIndexes.size,
        updatedAt: decisionUpdatedAt || new Date().toISOString(),
      },
    });
  } catch (error) {
    return c.json(
      { error: "Failed to rebuild indexes", details: String(error) },
      500,
    );
  }
});

// Weekly Summary
misc.get("/summary/weekly", async (c) => {
  const mnemeDir = getMnemeDir();
  const apiKey = getOpenAIKey();

  try {
    const sessionsIndex = readRecentSessionIndexes(mnemeDir);
    const decisionsIndex = readRecentDecisionIndexes(mnemeDir);

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const recentSessions = sessionsIndex.items.filter(
      (s) => new Date(s.createdAt) >= weekAgo,
    );
    const recentDecisions = decisionsIndex.items.filter(
      (d) => new Date(d.createdAt) >= weekAgo,
    );

    const summary = {
      period: { start: weekAgo.toISOString(), end: now.toISOString() },
      stats: {
        sessions: recentSessions.length,
        decisions: recentDecisions.length,
        interactions: recentSessions.reduce(
          (sum, s) => sum + (s.interactionCount || 0),
          0,
        ),
      },
      topTags: getTopTags(recentSessions, 5),
      sessionTypes: getSessionTypeBreakdown(recentSessions),
      aiSummary: null as string | null,
    };

    if (apiKey && (recentSessions.length > 0 || recentDecisions.length > 0)) {
      try {
        const prompt = buildSummaryPrompt(recentSessions, recentDecisions);
        summary.aiSummary = await generateAISummary(apiKey, prompt);
      } catch (aiError) {
        console.error("AI summary generation failed:", aiError);
      }
    }

    return c.json(summary);
  } catch (error) {
    console.error("Failed to generate weekly summary:", error);
    return c.json({ error: "Failed to generate weekly summary" }, 500);
  }
});

// Generate custom summary
misc.post("/summary/generate", async (c) => {
  const apiKey = getOpenAIKey();
  if (!apiKey) {
    return c.json(
      {
        error:
          "AI summary requires OPENAI_API_KEY environment variable (optional feature)",
      },
      400,
    );
  }

  const body = await c.req.json();
  const { sessionIds, prompt: customPrompt } = body;

  const mnemeDir = getMnemeDir();
  const sessionsDir = path.join(mnemeDir, "sessions");

  try {
    const sessions: Record<string, unknown>[] = [];

    for (const id of sessionIds || []) {
      const filePath = findJsonFileById(sessionsDir, id);
      if (filePath) {
        const content = fs.readFileSync(filePath, "utf-8");
        sessions.push(JSON.parse(content));
      }
    }

    if (sessions.length === 0) {
      return c.json({ error: "No sessions found" }, 404);
    }

    const prompt =
      customPrompt ||
      `Summarize the following development sessions concisely:\n\n${sessions
        .map((s) => `- ${s.title}: ${s.goal || "No goal specified"}`)
        .join("\n")}`;

    const summary = await generateAISummary(apiKey, prompt);
    return c.json({ summary });
  } catch (error) {
    console.error("Failed to generate summary:", error);
    return c.json({ error: "Failed to generate summary" }, 500);
  }
});

export default misc;
