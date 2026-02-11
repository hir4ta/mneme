import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import {
  readAllDecisionIndexes,
  readAllSessionIndexes,
} from "../../../lib/index/manager.js";
import {
  getMnemeDir,
  listDatedJsonFiles,
  listJsonFiles,
} from "../lib/helpers.js";
import analyticsGraph from "./analytics-graph.js";

const analytics = new Hono();

// Mount sub-router
analytics.route("/", analyticsGraph);

// Timeline API
analytics.get("/timeline", async (c) => {
  const sessionsDir = path.join(getMnemeDir(), "sessions");
  try {
    const files = listDatedJsonFiles(sessionsDir);
    if (files.length === 0) {
      return c.json({ timeline: {} });
    }
    const sessions = files.map((filePath) => {
      const content = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(content);
    });

    const grouped: Record<string, typeof sessions> = {};
    for (const session of sessions) {
      const date = session.createdAt?.split("T")[0] || "unknown";
      if (!grouped[date]) grouped[date] = [];
      grouped[date].push({
        id: session.id,
        title: session.title || "Untitled",
        sessionType: session.sessionType,
        branch: session.context?.branch,
        tags: session.tags || [],
        createdAt: session.createdAt,
      });
    }

    const sortedTimeline: Record<string, typeof sessions> = {};
    for (const date of Object.keys(grouped).sort().reverse()) {
      sortedTimeline[date] = grouped[date].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    }

    return c.json({ timeline: sortedTimeline });
  } catch (error) {
    console.error("Failed to build timeline:", error);
    return c.json({ error: "Failed to build timeline" }, 500);
  }
});

// Tag Network API
analytics.get("/tag-network", async (c) => {
  const sessionsDir = path.join(getMnemeDir(), "sessions");
  try {
    const files = listDatedJsonFiles(sessionsDir);
    const tagCounts: Map<string, number> = new Map();
    const coOccurrences: Map<string, number> = new Map();

    for (const filePath of files) {
      const content = fs.readFileSync(filePath, "utf-8");
      const session = JSON.parse(content);
      const tags: string[] = session.tags || [];

      for (const tag of tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }

      for (let i = 0; i < tags.length; i++) {
        for (let j = i + 1; j < tags.length; j++) {
          const key = [tags[i], tags[j]].sort().join("|");
          coOccurrences.set(key, (coOccurrences.get(key) || 0) + 1);
        }
      }
    }

    const nodes = Array.from(tagCounts.entries()).map(([id, count]) => ({
      id,
      count,
    }));

    const edges = Array.from(coOccurrences.entries()).map(([key, weight]) => {
      const [source, target] = key.split("|");
      return { source, target, weight };
    });

    return c.json({ nodes, edges });
  } catch (error) {
    console.error("Failed to build tag network:", error);
    return c.json({ error: "Failed to build tag network" }, 500);
  }
});

// Stats Overview
analytics.get("/stats/overview", async (c) => {
  const mnemeDir = getMnemeDir();
  try {
    const sessionsIndex = readAllSessionIndexes(mnemeDir);
    const decisionsIndex = readAllDecisionIndexes(mnemeDir);

    const validSessions = sessionsIndex.items.filter(
      (session) => session.interactionCount > 0 || session.hasSummary === true,
    );

    const sessionTypeCount: Record<string, number> = {};
    for (const session of validSessions) {
      const type = session.sessionType || "unknown";
      sessionTypeCount[type] = (sessionTypeCount[type] || 0) + 1;
    }

    let totalPatterns = 0;
    const patternsByType: Record<string, number> = {};
    const patternsPath = path.join(mnemeDir, "patterns");
    if (fs.existsSync(patternsPath)) {
      const patternFiles = listJsonFiles(patternsPath);
      for (const filePath of patternFiles) {
        try {
          const content = fs.readFileSync(filePath, "utf-8");
          const data = JSON.parse(content);
          const patterns = data.items || data.patterns || [];
          for (const pattern of patterns) {
            totalPatterns++;
            const type = pattern.type || "unknown";
            patternsByType[type] = (patternsByType[type] || 0) + 1;
          }
        } catch {
          // Skip invalid files
        }
      }
    }

    let totalRules = 0;
    const rulesByType: Record<string, number> = {};
    const rulesPath = path.join(mnemeDir, "rules");
    if (fs.existsSync(rulesPath)) {
      for (const ruleType of ["dev-rules", "review-guidelines"]) {
        const rulePath = path.join(rulesPath, `${ruleType}.json`);
        if (fs.existsSync(rulePath)) {
          try {
            const content = fs.readFileSync(rulePath, "utf-8");
            const data = JSON.parse(content);
            const items = data.items || [];
            rulesByType[ruleType] = items.length;
            totalRules += items.length;
          } catch {
            // Skip invalid files
          }
        }
      }
    }

    return c.json({
      sessions: {
        total: validSessions.length,
        byType: sessionTypeCount,
      },
      decisions: {
        total: decisionsIndex.items.length,
      },
      patterns: {
        total: totalPatterns,
        byType: patternsByType,
      },
      rules: {
        total: totalRules,
        byType: rulesByType,
      },
    });
  } catch (error) {
    console.error("Failed to get stats overview:", error);
    return c.json({ error: "Failed to get stats overview" }, 500);
  }
});

// Activity stats
analytics.get("/stats/activity", async (c) => {
  const mnemeDir = getMnemeDir();
  const daysParam = Number.parseInt(c.req.query("days") || "30", 10);

  const MAX_DAYS = 365;
  const safeDays = Math.min(Math.max(1, daysParam), MAX_DAYS);

  try {
    const sessionsIndex = readAllSessionIndexes(mnemeDir);
    const decisionsIndex = readAllDecisionIndexes(mnemeDir);

    const now = new Date();
    const startDate = new Date(
      now.getTime() - (safeDays - 1) * 24 * 60 * 60 * 1000,
    );

    const activityByDate: Record<
      string,
      { sessions: number; decisions: number }
    > = {};

    for (let i = 0; i < safeDays; i++) {
      const d = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
      const dateKey = d.toISOString().split("T")[0];
      activityByDate[dateKey] = { sessions: 0, decisions: 0 };
    }

    for (const session of sessionsIndex.items) {
      const dateKey = session.createdAt.split("T")[0];
      if (activityByDate[dateKey]) {
        activityByDate[dateKey].sessions += 1;
      }
    }

    for (const decision of decisionsIndex.items) {
      const dateKey = decision.createdAt.split("T")[0];
      if (activityByDate[dateKey]) {
        activityByDate[dateKey].decisions += 1;
      }
    }

    const activity = Object.entries(activityByDate)
      .map(([date, counts]) => ({ date, ...counts }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return c.json({ activity, days: safeDays });
  } catch (error) {
    console.error("Failed to get activity stats:", error);
    return c.json({ error: "Failed to get activity stats" }, 500);
  }
});

// Tag stats
analytics.get("/stats/tags", async (c) => {
  const mnemeDir = getMnemeDir();
  try {
    const sessionsIndex = readAllSessionIndexes(mnemeDir);

    const tagCount: Record<string, number> = {};
    for (const session of sessionsIndex.items) {
      for (const tag of session.tags || []) {
        tagCount[tag] = (tagCount[tag] || 0) + 1;
      }
    }

    const tags = Object.entries(tagCount)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    return c.json({ tags });
  } catch (error) {
    console.error("Failed to get tag stats:", error);
    return c.json({ error: "Failed to get tag stats" }, 500);
  }
});

export default analytics;
