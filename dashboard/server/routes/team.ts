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
  patternsDir,
  rulesDir,
  safeParseJsonFile,
} from "../lib/helpers.js";

const team = new Hono();

interface MemberStats {
  name: string;
  sessions: number;
  decisions: number;
  patterns: number;
  rules: number;
  lastActive: string;
}

function collectTeamData(mnemeDir: string) {
  const sessionsIndex = readAllSessionIndexes(mnemeDir);
  const decisionsIndex = readAllDecisionIndexes(mnemeDir);

  // Collect per-member stats
  const memberMap = new Map<
    string,
    {
      sessions: number;
      decisions: number;
      patterns: number;
      rules: number;
      lastActive: string;
    }
  >();

  function ensureMember(name: string) {
    if (!memberMap.has(name)) {
      memberMap.set(name, {
        sessions: 0,
        decisions: 0,
        patterns: 0,
        rules: 0,
        lastActive: "",
      });
    }
    // biome-ignore lint/style/noNonNullAssertion: guaranteed by has() check above
    return memberMap.get(name)!;
  }

  function updateLastActive(
    member: ReturnType<typeof ensureMember>,
    date: string,
  ) {
    if (date && date > member.lastActive) {
      member.lastActive = date;
    }
  }

  // Sessions by user (skip entries without a real user name)
  for (const item of sessionsIndex.items) {
    if (!item.user) continue;
    const member = ensureMember(item.user);
    member.sessions++;
    updateLastActive(member, item.createdAt);
  }

  // Decisions by user (skip entries without a real user name)
  for (const item of decisionsIndex.items) {
    if (!item.user) continue;
    const member = ensureMember(item.user);
    member.decisions++;
    updateLastActive(member, item.createdAt);
  }

  // Patterns — count globally per known member
  // Pattern filenames are not user names, so distribute evenly across known members
  const patDir = patternsDir();
  let totalPatterns = 0;
  if (fs.existsSync(patDir)) {
    const patternFiles = listJsonFiles(patDir);
    for (const filePath of patternFiles) {
      const doc = safeParseJsonFile<{
        items?: unknown[];
        patterns?: unknown[];
      }>(filePath);
      const entries = doc?.items || doc?.patterns || [];
      totalPatterns += entries.length;
    }
  }

  // Rules — count from rules dir
  const rDir = rulesDir();
  let totalRulesCount = 0;
  if (fs.existsSync(rDir)) {
    for (const ruleFile of ["dev-rules", "review-guidelines"]) {
      const filePath = path.join(rDir, `${ruleFile}.json`);
      const doc = safeParseJsonFile<{ items?: unknown[] }>(filePath);
      if (doc?.items) totalRulesCount += doc.items.length;
    }
  }

  // Distribute pattern + rule counts to the primary member (most sessions)
  if (memberMap.size > 0 && (totalPatterns > 0 || totalRulesCount > 0)) {
    let primaryMember = memberMap.values().next().value;
    for (const stats of memberMap.values()) {
      if (stats.sessions > (primaryMember?.sessions ?? 0)) {
        primaryMember = stats;
      }
    }
    if (primaryMember) {
      primaryMember.patterns = totalPatterns;
      primaryMember.rules = totalRulesCount;
    }
  }

  return { memberMap, sessionsIndex, decisionsIndex };
}

// Team Overview
team.get("/overview", async (c) => {
  try {
    const mnemeDir = getMnemeDir();
    const { memberMap } = collectTeamData(mnemeDir);

    const members: MemberStats[] = Array.from(memberMap.entries())
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => b.sessions - a.sessions);

    return c.json({ members });
  } catch (error) {
    console.error("Failed to get team overview:", error);
    return c.json({ error: "Failed to get team overview" }, 500);
  }
});

// Team Activity (daily breakdown by member)
team.get("/activity", async (c) => {
  try {
    const mnemeDir = getMnemeDir();
    const daysParam = Number.parseInt(c.req.query("days") || "30", 10);
    const safeDays = Math.min(Math.max(1, daysParam), 365);

    const { sessionsIndex, decisionsIndex } = collectTeamData(mnemeDir);

    const now = new Date();
    const startDate = new Date(
      now.getTime() - (safeDays - 1) * 24 * 60 * 60 * 1000,
    );

    // Build daily activity per member
    const activityByDate: Record<
      string,
      Record<string, { sessions: number; decisions: number }>
    > = {};

    for (let i = 0; i < safeDays; i++) {
      const d = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
      const dateKey = d.toISOString().split("T")[0];
      activityByDate[dateKey] = {};
    }

    for (const session of sessionsIndex.items) {
      if (!session.user) continue;
      const dateKey = session.createdAt.split("T")[0];
      if (activityByDate[dateKey]) {
        if (!activityByDate[dateKey][session.user]) {
          activityByDate[dateKey][session.user] = {
            sessions: 0,
            decisions: 0,
          };
        }
        activityByDate[dateKey][session.user].sessions++;
      }
    }

    for (const decision of decisionsIndex.items) {
      if (!decision.user) continue;
      const dateKey = decision.createdAt.split("T")[0];
      if (activityByDate[dateKey]) {
        if (!activityByDate[dateKey][decision.user]) {
          activityByDate[dateKey][decision.user] = {
            sessions: 0,
            decisions: 0,
          };
        }
        activityByDate[dateKey][decision.user].decisions++;
      }
    }

    const activity = Object.entries(activityByDate)
      .map(([date, members]) => ({ date, members }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return c.json({ activity, days: safeDays });
  } catch (error) {
    console.error("Failed to get team activity:", error);
    return c.json({ error: "Failed to get team activity" }, 500);
  }
});

// Team Quality metrics
team.get("/quality", async (c) => {
  try {
    const rDir = rulesDir();

    let totalRules = 0;
    let approvedRules = 0;
    const topRules: {
      id: string;
      text: string;
      appliedCount: number;
      acceptedCount: number;
    }[] = [];

    if (fs.existsSync(rDir)) {
      for (const ruleFile of ["dev-rules", "review-guidelines"]) {
        const filePath = path.join(rDir, `${ruleFile}.json`);
        const doc = safeParseJsonFile<{
          items?: Array<Record<string, unknown>>;
        }>(filePath);
        if (!doc?.items) continue;

        for (const item of doc.items) {
          totalRules++;
          if (item.status === "approved") approvedRules++;

          const applied =
            typeof item.appliedCount === "number" ? item.appliedCount : 0;
          const accepted =
            typeof item.acceptedCount === "number" ? item.acceptedCount : 0;

          if (applied > 0) {
            topRules.push({
              id: String(item.id || ""),
              text: String(item.text || item.title || item.rule || ""),
              appliedCount: applied,
              acceptedCount: accepted,
            });
          }
        }
      }
    }

    // Patterns
    const patDir = patternsDir();
    if (fs.existsSync(patDir)) {
      for (const filePath of listJsonFiles(patDir)) {
        const doc = safeParseJsonFile<{
          items?: Array<Record<string, unknown>>;
          patterns?: Array<Record<string, unknown>>;
        }>(filePath);
        const entries = doc?.items || doc?.patterns || [];
        for (const item of entries) {
          totalRules++;
          if (item.status === "approved") approvedRules++;
        }
      }
    }

    // Decisions
    const decDir = path.join(getMnemeDir(), "decisions");
    if (fs.existsSync(decDir)) {
      for (const filePath of listDatedJsonFiles(decDir)) {
        const doc = safeParseJsonFile<{
          items?: Array<Record<string, unknown>>;
        }>(filePath);
        if (!doc) continue;
        const raw = doc as Record<string, unknown>;
        const entries: Array<Record<string, unknown>> = Array.isArray(raw.items)
          ? (raw.items as Array<Record<string, unknown>>)
          : raw.id
            ? [raw]
            : [];
        for (const item of entries) {
          totalRules++;
          if (item.status === "approved") approvedRules++;
        }
      }
    }

    // Sort by acceptance rate desc
    topRules.sort((a, b) => {
      const rateA = a.appliedCount > 0 ? a.acceptedCount / a.appliedCount : 0;
      const rateB = b.appliedCount > 0 ? b.acceptedCount / b.appliedCount : 0;
      return rateB - rateA;
    });

    // Least effective: lowest acceptance rate among those with applied > 0
    const withApplied = topRules.filter((r) => r.appliedCount > 0);
    const least = [...withApplied]
      .sort((a, b) => {
        const rateA = a.acceptedCount / a.appliedCount;
        const rateB = b.acceptedCount / b.appliedCount;
        return rateA - rateB;
      })
      .slice(0, 5);

    return c.json({
      approvalRate:
        totalRules > 0 ? Math.round((approvedRules / totalRules) * 100) : 0,
      totalRules,
      approvedRules,
      topRules: topRules.slice(0, 5),
      leastEffective: least,
    });
  } catch (error) {
    console.error("Failed to get team quality:", error);
    return c.json({ error: "Failed to get team quality" }, 500);
  }
});

export default team;
