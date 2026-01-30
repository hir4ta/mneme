import fs from "node:fs";
import path from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  getCurrentUser,
  getInteractionsBySessionIdsAndOwner,
  hasInteractionsForSessionIds,
  openDatabase,
} from "../../lib/db.js";
import {
  isIndexStale,
  readAllDecisionIndexes,
  readAllSessionIndexes,
  readRecentDecisionIndexes,
  readRecentSessionIndexes,
  rebuildAllDecisionIndexes,
  rebuildAllSessionIndexes,
} from "../../lib/index/manager.js";

// =============================================================================
// Note: Dashboard is read-only. Validation schemas for write operations removed.
// Data modifications should be done via /memoria:* commands.
// =============================================================================

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Sanitize ID parameter to prevent path traversal
 */
function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "");
}

/**
 * Safe JSON file parser with error logging
 */
function safeParseJsonFile<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (error) {
    console.error(`Failed to parse JSON: ${filePath}`, error);
    return null;
  }
}

// Note: safeWriteJsonFile removed - dashboard is read-only

const app = new Hono();

// Get project root from environment variable
const getProjectRoot = () => {
  return process.env.MEMORIA_PROJECT_ROOT || process.cwd();
};

const getMemoriaDir = () => {
  return path.join(getProjectRoot(), ".memoria");
};

const listJsonFiles = (dir: string): string[] => {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return listJsonFiles(fullPath);
    }
    if (entry.isFile() && entry.name.endsWith(".json")) {
      return [fullPath];
    }
    return [];
  });
};

const listDatedJsonFiles = (dir: string): string[] => {
  const files = listJsonFiles(dir);
  return files.filter((filePath) => {
    const rel = path.relative(dir, filePath);
    const parts = rel.split(path.sep);
    if (parts.length < 3) {
      return false;
    }
    return /^\d{4}$/.test(parts[0]) && /^\d{2}$/.test(parts[1]);
  });
};

const findJsonFileById = (dir: string, id: string): string | null => {
  const target = `${id}.json`;
  const queue = [dir];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || !fs.existsSync(current)) {
      continue;
    }
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
      } else if (entry.isFile() && entry.name === target) {
        const rel = path.relative(dir, fullPath);
        const parts = rel.split(path.sep);
        if (
          parts.length >= 3 &&
          /^\d{4}$/.test(parts[0]) &&
          /^\d{2}$/.test(parts[1])
        ) {
          return fullPath;
        }
      }
    }
  }
  return null;
};

const rulesDir = () => path.join(getMemoriaDir(), "rules");

// CORS for development (allow any localhost port)
app.use(
  "/api/*",
  cors({
    origin: (origin) => {
      if (!origin) return undefined;
      if (origin.startsWith("http://localhost:")) return origin;
      return null;
    },
  }),
);

// API Routes

// Pagination helper
interface PaginationParams {
  page: number;
  limit: number;
  tag?: string;
  type?: string;
  project?: string;
  search?: string;
  showUntitled?: boolean;
  allMonths?: boolean;
}

function parsePaginationParams(c: {
  req: { query: (key: string) => string | undefined };
}): PaginationParams {
  return {
    page: Math.max(1, Number.parseInt(c.req.query("page") || "1", 10)),
    limit: Math.min(
      100,
      Math.max(1, Number.parseInt(c.req.query("limit") || "20", 10)),
    ),
    tag: c.req.query("tag"),
    type: c.req.query("type"),
    project: c.req.query("project"),
    search: c.req.query("search"),
    showUntitled: c.req.query("showUntitled") === "true",
    allMonths: c.req.query("allMonths") === "true",
  };
}

function paginateArray<T>(items: T[], page: number, limit: number) {
  const total = items.length;
  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  const data = items.slice(start, start + limit);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

// Sessions
app.get("/api/sessions", async (c) => {
  const useIndex = c.req.query("useIndex") !== "false";
  const usePagination = c.req.query("paginate") !== "false";
  const memoriaDir = getMemoriaDir();
  const params = parsePaginationParams(c);

  try {
    let items: Record<string, unknown>[];

    // Use index for listing (faster)
    if (useIndex) {
      // Use allMonths to decide between recent or all indexes
      const index = params.allMonths
        ? readAllSessionIndexes(memoriaDir)
        : readRecentSessionIndexes(memoriaDir);
      items = index.items as Record<string, unknown>[];
    } else {
      // Fallback: read all files directly
      const sessionsDir = path.join(memoriaDir, "sessions");
      const files = listDatedJsonFiles(sessionsDir);
      if (files.length === 0) {
        return usePagination
          ? c.json({
              data: [],
              pagination: {
                page: 1,
                limit: params.limit,
                total: 0,
                totalPages: 0,
                hasNext: false,
                hasPrev: false,
              },
            })
          : c.json([]);
      }
      items = files.map((filePath) => {
        const content = fs.readFileSync(filePath, "utf-8");
        return JSON.parse(content);
      });
      // Sort by createdAt descending
      items.sort(
        (a, b) =>
          new Date(b.createdAt as string).getTime() -
          new Date(a.createdAt as string).getTime(),
      );
    }

    // Apply filters
    let filtered = items;

    // Filter out Untitled sessions by default (unless showUntitled=true)
    if (!params.showUntitled) {
      filtered = filtered.filter((s) => s.hasSummary === true);
    }

    if (params.tag) {
      filtered = filtered.filter((s) =>
        (s.tags as string[])?.includes(params.tag as string),
      );
    }
    if (params.type) {
      filtered = filtered.filter((s) => s.sessionType === params.type);
    }
    if (params.project) {
      const projectQuery = params.project;
      filtered = filtered.filter((s) => {
        const ctx = s.context as
          | { projectName?: string; repository?: string }
          | undefined;
        const projectName = ctx?.projectName;
        const repository = ctx?.repository;
        // Match by projectName or repository (full or ending with /projectName)
        return (
          projectName === projectQuery ||
          repository === projectQuery ||
          repository?.endsWith(`/${projectQuery}`)
        );
      });
    }
    if (params.search) {
      const query = params.search.toLowerCase();
      filtered = filtered.filter((s) => {
        const title = ((s.title as string) || "").toLowerCase();
        const goal = ((s.goal as string) || "").toLowerCase();
        return title.includes(query) || goal.includes(query);
      });
    }

    // Return paginated or full list
    if (!usePagination) {
      return c.json(filtered);
    }

    return c.json(paginateArray(filtered, params.page, params.limit));
  } catch (error) {
    console.error("Failed to read sessions:", error);
    return c.json({ error: "Failed to read sessions" }, 500);
  }
});

// Session Graph API - must be before /api/sessions/:id
app.get("/api/sessions/graph", async (c) => {
  const memoriaDir = getMemoriaDir();
  const showUntitled = c.req.query("showUntitled") === "true";
  try {
    const sessionsIndex = readAllSessionIndexes(memoriaDir);
    // Filter out Untitled sessions for graph unless explicitly requested
    const filteredItems = showUntitled
      ? sessionsIndex.items
      : sessionsIndex.items.filter((s) => s.hasSummary === true);

    // Build nodes from sessions
    const nodes = filteredItems.map((session) => ({
      id: session.id,
      title: session.title,
      type: session.sessionType || "unknown",
      tags: session.tags || [],
      createdAt: session.createdAt,
    }));

    // Build edges based on shared tags
    const edges: { source: string; target: string; weight: number }[] = [];

    for (let i = 0; i < filteredItems.length; i++) {
      for (let j = i + 1; j < filteredItems.length; j++) {
        const s1 = filteredItems[i];
        const s2 = filteredItems[j];

        // Count shared tags
        const sharedTags = (s1.tags || []).filter((t) =>
          (s2.tags || []).includes(t),
        );

        if (sharedTags.length > 0) {
          edges.push({
            source: s1.id,
            target: s2.id,
            weight: sharedTags.length,
          });
        }
      }
    }

    return c.json({ nodes, edges });
  } catch (error) {
    console.error("Failed to build session graph:", error);
    return c.json({ error: "Failed to build session graph" }, 500);
  }
});

app.get("/api/sessions/:id", async (c) => {
  const id = sanitizeId(c.req.param("id"));
  const sessionsDir = path.join(getMemoriaDir(), "sessions");
  try {
    const filePath = findJsonFileById(sessionsDir, id);
    if (!filePath) {
      return c.json({ error: "Session not found" }, 404);
    }
    const session = safeParseJsonFile(filePath);
    if (!session) {
      return c.json({ error: "Failed to parse session" }, 500);
    }
    return c.json(session);
  } catch (error) {
    console.error("Failed to read session:", error);
    return c.json({ error: "Failed to read session" }, 500);
  }
});

// Legacy: Get session markdown file (for backwards compatibility)
app.get("/api/sessions/:id/markdown", async (c) => {
  const id = sanitizeId(c.req.param("id"));
  const sessionsDir = path.join(getMemoriaDir(), "sessions");
  try {
    const jsonPath = findJsonFileById(sessionsDir, id);
    if (!jsonPath) {
      return c.json({ error: "Session not found" }, 404);
    }
    // MD file is in the same directory as JSON
    const mdPath = jsonPath.replace(/\.json$/, ".md");
    if (!fs.existsSync(mdPath)) {
      return c.json({ exists: false, content: null });
    }
    const content = fs.readFileSync(mdPath, "utf-8");
    return c.json({ exists: true, content });
  } catch (error) {
    console.error("Failed to read session markdown:", error);
    return c.json({ error: "Failed to read session markdown" }, 500);
  }
});

// Note: PUT/DELETE/POST endpoints removed - dashboard is read-only
// Data modifications should be done via /memoria:* commands

// Current User API
app.get("/api/current-user", async (c) => {
  try {
    const user = getCurrentUser();
    return c.json({ user });
  } catch (error) {
    console.error("Failed to get current user:", error);
    return c.json({ error: "Failed to get current user" }, 500);
  }
});

// Session Interactions API (from SQLite, owner-restricted)
// Supports master session: collects interactions from all linked sessions
app.get("/api/sessions/:id/interactions", async (c) => {
  const id = sanitizeId(c.req.param("id"));
  const memoriaDir = getMemoriaDir();
  const sessionLinksDir = path.join(memoriaDir, "session-links");
  const sessionsDir = path.join(memoriaDir, "sessions");

  try {
    // Get current user
    const currentUser = getCurrentUser();

    // Open SQLite database
    const db = openDatabase(memoriaDir);
    if (!db) {
      return c.json({ interactions: [], count: 0, isOwner: false });
    }

    // Determine the master session ID
    // If this is a child session, find the master first
    let masterId = id;
    const myLinkFile = path.join(sessionLinksDir, `${id}.json`);
    if (fs.existsSync(myLinkFile)) {
      try {
        const myLinkData = JSON.parse(fs.readFileSync(myLinkFile, "utf-8"));
        if (myLinkData.masterSessionId) {
          masterId = myLinkData.masterSessionId;
        }
      } catch {
        // Use original id as master
      }
    }

    // Collect all session IDs to query (master + children)
    const sessionIds: string[] = [masterId];
    if (masterId !== id) {
      sessionIds.push(id);
    }

    // Check if this session has linked children (session-links files)
    if (fs.existsSync(sessionLinksDir)) {
      const linkFiles = fs.readdirSync(sessionLinksDir);
      for (const linkFile of linkFiles) {
        if (!linkFile.endsWith(".json")) continue;
        const linkPath = path.join(sessionLinksDir, linkFile);
        try {
          const linkData = JSON.parse(fs.readFileSync(linkPath, "utf-8"));
          if (linkData.masterSessionId === masterId) {
            // This link points to our master - add the child session
            const childId = linkFile.replace(".json", "");
            if (!sessionIds.includes(childId)) {
              sessionIds.push(childId);
            }
          }
        } catch {
          // Skip invalid link files
        }
      }
    }

    // Also check for legacy resumedFrom chains
    const sessionFiles = listDatedJsonFiles(sessionsDir);
    for (const sessionFile of sessionFiles) {
      try {
        const sessionData = JSON.parse(fs.readFileSync(sessionFile, "utf-8"));
        if (
          sessionData.resumedFrom === masterId &&
          sessionData.id !== masterId
        ) {
          if (!sessionIds.includes(sessionData.id)) {
            sessionIds.push(sessionData.id);
          }
        }
      } catch {
        // Skip invalid session files
      }
    }

    // Check if current user owns interactions for any of these sessions
    const isOwner = hasInteractionsForSessionIds(db, sessionIds, currentUser);
    if (!isOwner) {
      db.close();
      return c.json(
        { error: "Forbidden: You are not the owner of this session" },
        403,
      );
    }

    // Get interactions from all related sessions (filtered by owner for security)
    const interactions = getInteractionsBySessionIdsAndOwner(
      db,
      sessionIds,
      currentUser,
    );
    db.close();

    // Group by user/assistant pairs for better display
    const groupedInteractions: Array<{
      id: string;
      timestamp: string;
      user: string;
      assistant: string;
      thinking: string | null;
      isCompactSummary: boolean;
    }> = [];

    let currentInteraction: {
      id: string;
      timestamp: string;
      user: string;
      assistant: string;
      thinking: string | null;
      isCompactSummary: boolean;
    } | null = null;

    for (const interaction of interactions) {
      if (interaction.role === "user") {
        // Save previous interaction if exists
        if (currentInteraction) {
          groupedInteractions.push(currentInteraction);
        }
        // Start new interaction
        currentInteraction = {
          id: `int-${String(groupedInteractions.length + 1).padStart(3, "0")}`,
          timestamp: interaction.timestamp,
          user: interaction.content,
          assistant: "",
          thinking: null,
          isCompactSummary: !!interaction.is_compact_summary,
        };
      } else if (interaction.role === "assistant" && currentInteraction) {
        currentInteraction.assistant = interaction.content;
        currentInteraction.thinking = interaction.thinking || null;
      }
    }

    // Push last interaction
    if (currentInteraction) {
      groupedInteractions.push(currentInteraction);
    }

    return c.json({
      interactions: groupedInteractions,
      count: groupedInteractions.length,
      isOwner: true,
    });
  } catch (error) {
    console.error("Failed to get session interactions:", error);
    return c.json({ error: "Failed to get session interactions" }, 500);
  }
});

// Decisions
app.get("/api/decisions", async (c) => {
  const useIndex = c.req.query("useIndex") !== "false";
  const usePagination = c.req.query("paginate") !== "false";
  const memoriaDir = getMemoriaDir();
  const params = parsePaginationParams(c);

  try {
    let items: Record<string, unknown>[];

    // Use index for listing (faster)
    if (useIndex) {
      const index = params.allMonths
        ? readAllDecisionIndexes(memoriaDir)
        : readRecentDecisionIndexes(memoriaDir);
      items = index.items as Record<string, unknown>[];
    } else {
      // Fallback: read all files directly
      const decisionsDir = path.join(memoriaDir, "decisions");
      const files = listDatedJsonFiles(decisionsDir);
      if (files.length === 0) {
        return usePagination
          ? c.json({
              data: [],
              pagination: {
                page: 1,
                limit: params.limit,
                total: 0,
                totalPages: 0,
                hasNext: false,
                hasPrev: false,
              },
            })
          : c.json([]);
      }
      items = files.map((filePath) => {
        const content = fs.readFileSync(filePath, "utf-8");
        return JSON.parse(content);
      });
      items.sort(
        (a, b) =>
          new Date(b.createdAt as string).getTime() -
          new Date(a.createdAt as string).getTime(),
      );
    }

    // Apply filters
    let filtered = items;
    if (params.tag) {
      filtered = filtered.filter((d) =>
        (d.tags as string[])?.includes(params.tag as string),
      );
    }
    if (params.search) {
      const query = params.search.toLowerCase();
      filtered = filtered.filter((d) => {
        const title = ((d.title as string) || "").toLowerCase();
        const decision = ((d.decision as string) || "").toLowerCase();
        return title.includes(query) || decision.includes(query);
      });
    }

    // Return paginated or full list
    if (!usePagination) {
      return c.json(filtered);
    }

    return c.json(paginateArray(filtered, params.page, params.limit));
  } catch (error) {
    console.error("Failed to read decisions:", error);
    return c.json({ error: "Failed to read decisions" }, 500);
  }
});

app.get("/api/decisions/:id", async (c) => {
  const id = sanitizeId(c.req.param("id"));
  const decisionsDir = path.join(getMemoriaDir(), "decisions");
  try {
    const filePath = findJsonFileById(decisionsDir, id);
    if (!filePath) {
      return c.json({ error: "Decision not found" }, 404);
    }
    const decision = safeParseJsonFile(filePath);
    if (!decision) {
      return c.json({ error: "Failed to parse decision" }, 500);
    }
    return c.json(decision);
  } catch (error) {
    console.error("Failed to read decision:", error);
    return c.json({ error: "Failed to read decision" }, 500);
  }
});

// Note: POST/PUT/DELETE for decisions removed - dashboard is read-only
// Decisions are created via /memoria:save command

// Project info
app.get("/api/info", async (c) => {
  const projectRoot = getProjectRoot();
  const memoriaDir = getMemoriaDir();
  return c.json({
    projectRoot,
    memoriaDir,
    exists: fs.existsSync(memoriaDir),
  });
});

// Rules
app.get("/api/rules/:id", async (c) => {
  const id = c.req.param("id");
  const dir = rulesDir();
  try {
    const filePath = path.join(dir, `${id}.json`);
    if (!fs.existsSync(filePath)) {
      return c.json({ error: "Rules not found" }, 404);
    }
    const rules = safeParseJsonFile(filePath);
    if (!rules) {
      return c.json({ error: "Failed to parse rules" }, 500);
    }
    return c.json(rules);
  } catch (error) {
    console.error("Failed to read rules:", error);
    return c.json({ error: "Failed to read rules" }, 500);
  }
});

// Note: PUT for rules removed - dashboard is read-only
// Rules are managed via /memoria:save command

// Timeline API - セッションを時系列でグループ化
app.get("/api/timeline", async (c) => {
  const sessionsDir = path.join(getMemoriaDir(), "sessions");
  try {
    const files = listDatedJsonFiles(sessionsDir);
    if (files.length === 0) {
      return c.json({ timeline: {} });
    }
    const sessions = files.map((filePath) => {
      const content = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(content);
    });

    // 日付でグループ化
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

    // 日付をソート
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

// Tag Network API - タグの共起ネットワーク
app.get("/api/tag-network", async (c) => {
  const sessionsDir = path.join(getMemoriaDir(), "sessions");
  try {
    const files = listDatedJsonFiles(sessionsDir);
    const tagCounts: Map<string, number> = new Map();
    const coOccurrences: Map<string, number> = new Map();

    for (const filePath of files) {
      const content = fs.readFileSync(filePath, "utf-8");
      const session = JSON.parse(content);
      const tags: string[] = session.tags || [];

      // タグカウント
      for (const tag of tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }

      // 共起カウント
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

// Decision Impact API - 決定の影響範囲
app.get("/api/decisions/:id/impact", async (c) => {
  const decisionId = sanitizeId(c.req.param("id"));
  const sessionsDir = path.join(getMemoriaDir(), "sessions");
  const patternsDir = path.join(getMemoriaDir(), "patterns");

  try {
    const impactedSessions: { id: string; title: string }[] = [];
    const impactedPatterns: { id: string; description: string }[] = [];

    // セッションを検索
    const sessionFiles = listDatedJsonFiles(sessionsDir);
    for (const filePath of sessionFiles) {
      const content = fs.readFileSync(filePath, "utf-8");
      const session = JSON.parse(content);

      // interactions の reasoning や relatedSessions に決定IDが含まれるかチェック
      const hasReference =
        session.relatedSessions?.includes(decisionId) ||
        session.interactions?.some(
          (i: Record<string, unknown>) =>
            (i.reasoning as string)?.includes(decisionId) ||
            (i.choice as string)?.includes(decisionId),
        );

      if (hasReference) {
        impactedSessions.push({
          id: session.id,
          title: session.title || "Untitled",
        });
      }
    }

    // パターンを検索
    const patternFiles = listJsonFiles(patternsDir);
    for (const filePath of patternFiles) {
      const content = fs.readFileSync(filePath, "utf-8");
      const data = JSON.parse(content);
      const patterns = data.patterns || [];

      for (const pattern of patterns) {
        if (
          pattern.sourceId?.includes(decisionId) ||
          pattern.description?.includes(decisionId)
        ) {
          impactedPatterns.push({
            id: `${path.basename(filePath, ".json")}-${pattern.type}`,
            description: pattern.description || "No description",
          });
        }
      }
    }

    return c.json({
      decisionId,
      impactedSessions,
      impactedPatterns,
    });
  } catch (error) {
    console.error("Failed to analyze decision impact:", error);
    return c.json({ error: "Failed to analyze decision impact" }, 500);
  }
});

// Summary API (Optional AI feature - requires OPENAI_API_KEY env var)
const getOpenAIKey = (): string | null => {
  // Get API key from environment variable only
  return process.env.OPENAI_API_KEY || null;
};

app.get("/api/summary/weekly", async (c) => {
  const memoriaDir = getMemoriaDir();
  const apiKey = getOpenAIKey();

  try {
    const sessionsIndex = readRecentSessionIndexes(memoriaDir);
    const decisionsIndex = readRecentDecisionIndexes(memoriaDir);

    // Get last 7 days
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const recentSessions = sessionsIndex.items.filter(
      (s) => new Date(s.createdAt) >= weekAgo,
    );
    const recentDecisions = decisionsIndex.items.filter(
      (d) => new Date(d.createdAt) >= weekAgo,
    );

    // Basic summary without AI
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

    // Generate AI summary if API key is available
    if (apiKey && (recentSessions.length > 0 || recentDecisions.length > 0)) {
      try {
        const prompt = buildSummaryPrompt(recentSessions, recentDecisions);
        summary.aiSummary = await generateAISummary(apiKey, prompt);
      } catch (aiError) {
        console.error("AI summary generation failed:", aiError);
        // AI summary failed, continue without it
      }
    }

    return c.json(summary);
  } catch (error) {
    console.error("Failed to generate weekly summary:", error);
    return c.json({ error: "Failed to generate weekly summary" }, 500);
  }
});

app.post("/api/summary/generate", async (c) => {
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

  const memoriaDir = getMemoriaDir();
  const sessionsDir = path.join(memoriaDir, "sessions");

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

function getTopTags(
  sessions: { tags?: string[] }[],
  limit: number,
): { name: string; count: number }[] {
  const tagCount: Record<string, number> = {};
  for (const session of sessions) {
    for (const tag of session.tags || []) {
      tagCount[tag] = (tagCount[tag] || 0) + 1;
    }
  }
  return Object.entries(tagCount)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function getSessionTypeBreakdown(
  sessions: { sessionType?: string | null }[],
): Record<string, number> {
  const breakdown: Record<string, number> = {};
  for (const session of sessions) {
    const type = session.sessionType || "unknown";
    breakdown[type] = (breakdown[type] || 0) + 1;
  }
  return breakdown;
}

function buildSummaryPrompt(
  sessions: { title: string; sessionType?: string | null; tags?: string[] }[],
  decisions: { title: string; status: string }[],
): string {
  const sessionList = sessions
    .map((s) => `- ${s.title} (${s.sessionType || "unknown"})`)
    .join("\n");
  const decisionList = decisions
    .map((d) => `- ${d.title} (${d.status})`)
    .join("\n");

  return `Provide a brief weekly development summary (2-3 sentences) based on this activity:

Sessions (${sessions.length}):
${sessionList || "None"}

Decisions (${decisions.length}):
${decisionList || "None"}

Focus on key accomplishments and patterns.`;
}

async function generateAISummary(
  apiKey: string,
  prompt: string,
): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 200,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    throw new Error("OpenAI API request failed");
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "Unable to generate summary.";
}

// Stats API
app.get("/api/stats/overview", async (c) => {
  const memoriaDir = getMemoriaDir();
  try {
    const sessionsIndex = readAllSessionIndexes(memoriaDir);
    const decisionsIndex = readAllDecisionIndexes(memoriaDir);

    // Count by session type
    const sessionTypeCount: Record<string, number> = {};
    for (const session of sessionsIndex.items) {
      const type = session.sessionType || "unknown";
      sessionTypeCount[type] = (sessionTypeCount[type] || 0) + 1;
    }

    // Total interactions
    let totalInteractions = 0;
    for (const session of sessionsIndex.items) {
      totalInteractions += session.interactionCount || 0;
    }

    // Count patterns
    let totalPatterns = 0;
    const patternsByType: Record<string, number> = {};
    const patternsPath = path.join(memoriaDir, "patterns");
    if (fs.existsSync(patternsPath)) {
      const patternFiles = listJsonFiles(patternsPath);
      for (const filePath of patternFiles) {
        try {
          const content = fs.readFileSync(filePath, "utf-8");
          const data = JSON.parse(content);
          const patterns = data.patterns || [];
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

    // Count rules
    let totalRules = 0;
    const rulesByType: Record<string, number> = {};
    const rulesPath = path.join(memoriaDir, "rules");
    if (fs.existsSync(rulesPath)) {
      for (const ruleType of ["dev-rules", "review-guidelines"]) {
        const rulePath = path.join(rulesPath, `${ruleType}.json`);
        if (fs.existsSync(rulePath)) {
          try {
            const content = fs.readFileSync(rulePath, "utf-8");
            const data = JSON.parse(content);
            const items = data.items || [];
            const activeItems = items.filter(
              (item: { status?: string }) => item.status === "active",
            );
            rulesByType[ruleType] = activeItems.length;
            totalRules += activeItems.length;
          } catch {
            // Skip invalid files
          }
        }
      }
    }

    return c.json({
      sessions: {
        total: sessionsIndex.items.length,
        byType: sessionTypeCount,
      },
      decisions: {
        total: decisionsIndex.items.length,
      },
      interactions: {
        total: totalInteractions,
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

app.get("/api/stats/activity", async (c) => {
  const memoriaDir = getMemoriaDir();
  const daysParam = Number.parseInt(c.req.query("days") || "30", 10);

  // Prevent infinite loop with bounds checking
  const MAX_DAYS = 365;
  const safeDays = Math.min(Math.max(1, daysParam), MAX_DAYS);

  try {
    const sessionsIndex = readAllSessionIndexes(memoriaDir);
    const decisionsIndex = readAllDecisionIndexes(memoriaDir);

    // Calculate date range (include today)
    const now = new Date();
    // Start from (safeDays - 1) days ago to include today
    const startDate = new Date(
      now.getTime() - (safeDays - 1) * 24 * 60 * 60 * 1000,
    );

    // Group sessions by date
    const activityByDate: Record<
      string,
      { sessions: number; decisions: number }
    > = {};

    // Initialize all dates including today (safe iteration with counter)
    for (let i = 0; i < safeDays; i++) {
      const d = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
      const dateKey = d.toISOString().split("T")[0];
      activityByDate[dateKey] = { sessions: 0, decisions: 0 };
    }

    // Count sessions
    for (const session of sessionsIndex.items) {
      const dateKey = session.createdAt.split("T")[0];
      if (activityByDate[dateKey]) {
        activityByDate[dateKey].sessions += 1;
      }
    }

    // Count decisions
    for (const decision of decisionsIndex.items) {
      const dateKey = decision.createdAt.split("T")[0];
      if (activityByDate[dateKey]) {
        activityByDate[dateKey].decisions += 1;
      }
    }

    // Convert to array
    const activity = Object.entries(activityByDate)
      .map(([date, counts]) => ({ date, ...counts }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return c.json({ activity, days: safeDays });
  } catch (error) {
    console.error("Failed to get activity stats:", error);
    return c.json({ error: "Failed to get activity stats" }, 500);
  }
});

app.get("/api/stats/tags", async (c) => {
  const memoriaDir = getMemoriaDir();
  try {
    const sessionsIndex = readAllSessionIndexes(memoriaDir);

    // Count tag usage
    const tagCount: Record<string, number> = {};
    for (const session of sessionsIndex.items) {
      for (const tag of session.tags || []) {
        tagCount[tag] = (tagCount[tag] || 0) + 1;
      }
    }

    // Convert to sorted array
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

// Patterns API
const patternsDir = () => path.join(getMemoriaDir(), "patterns");

app.get("/api/patterns", async (c) => {
  const dir = patternsDir();
  try {
    if (!fs.existsSync(dir)) {
      return c.json({ patterns: [] });
    }

    const files = listJsonFiles(dir);
    const allPatterns: Record<string, unknown>[] = [];

    for (const filePath of files) {
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        const data = JSON.parse(content);
        // Support both "items" (new format) and "patterns" (legacy format)
        const patterns = data.items || data.patterns || [];
        for (const pattern of patterns) {
          allPatterns.push({
            ...pattern,
            sourceFile: path.basename(filePath, ".json"),
          });
        }
      } catch {
        // Skip invalid files
      }
    }

    // Sort by createdAt descending
    allPatterns.sort(
      (a, b) =>
        new Date(b.createdAt as string).getTime() -
        new Date(a.createdAt as string).getTime(),
    );

    return c.json({ patterns: allPatterns });
  } catch (error) {
    console.error("Failed to read patterns:", error);
    return c.json({ error: "Failed to read patterns" }, 500);
  }
});

app.get("/api/patterns/stats", async (c) => {
  const dir = patternsDir();
  try {
    if (!fs.existsSync(dir)) {
      return c.json({ total: 0, byType: {}, bySource: {} });
    }

    const files = listJsonFiles(dir);
    let total = 0;
    const byType: Record<string, number> = {};
    const bySource: Record<string, number> = {};

    for (const filePath of files) {
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        const data = JSON.parse(content);
        // Support both "items" (new format) and "patterns" (legacy format)
        const patterns = data.items || data.patterns || [];
        const sourceName = path.basename(filePath, ".json");

        for (const pattern of patterns) {
          total++;
          const type = pattern.type || "unknown";
          byType[type] = (byType[type] || 0) + 1;
          bySource[sourceName] = (bySource[sourceName] || 0) + 1;
        }
      } catch {
        // Skip invalid files
      }
    }

    return c.json({ total, byType, bySource });
  } catch (error) {
    console.error("Failed to get pattern stats:", error);
    return c.json({ error: "Failed to get pattern stats" }, 500);
  }
});

// Note: DELETE for patterns removed - dashboard is read-only
// Patterns are managed via /memoria:save command

// Export API
function sessionToMarkdown(session: Record<string, unknown>): string {
  const lines: string[] = [];

  lines.push(`# ${session.title || "Untitled Session"}`);
  lines.push("");
  lines.push(`**ID:** ${session.id}`);
  lines.push(`**Created:** ${session.createdAt}`);
  if (session.sessionType) {
    lines.push(`**Type:** ${session.sessionType}`);
  }
  if (session.context) {
    const ctx = session.context as Record<string, unknown>;
    if (ctx.branch) lines.push(`**Branch:** ${ctx.branch}`);
    if (ctx.user) lines.push(`**User:** ${ctx.user}`);
  }
  lines.push("");

  if (session.goal) {
    lines.push("## Goal");
    lines.push("");
    lines.push(session.goal as string);
    lines.push("");
  }

  const tags = session.tags as string[] | undefined;
  if (tags && tags.length > 0) {
    lines.push("## Tags");
    lines.push("");
    lines.push(tags.map((t) => `\`${t}\``).join(", "));
    lines.push("");
  }

  const interactions = session.interactions as
    | Record<string, unknown>[]
    | undefined;
  if (interactions && interactions.length > 0) {
    lines.push("## Interactions");
    lines.push("");
    for (const interaction of interactions) {
      lines.push(`### ${interaction.choice || "Interaction"}`);
      lines.push("");
      if (interaction.reasoning) {
        lines.push(`**Reasoning:** ${interaction.reasoning}`);
        lines.push("");
      }
      if (interaction.timestamp) {
        lines.push(`*${interaction.timestamp}*`);
        lines.push("");
      }
      lines.push("---");
      lines.push("");
    }
  }

  if (session.outcome) {
    lines.push("## Outcome");
    lines.push("");
    lines.push(session.outcome as string);
    lines.push("");
  }

  const relatedSessions = session.relatedSessions as string[] | undefined;
  if (relatedSessions && relatedSessions.length > 0) {
    lines.push("## Related Sessions");
    lines.push("");
    for (const relId of relatedSessions) {
      lines.push(`- ${relId}`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("*Exported from memoria*");

  return lines.join("\n");
}

function decisionToMarkdown(decision: Record<string, unknown>): string {
  const lines: string[] = [];

  lines.push(`# ${decision.title || "Untitled Decision"}`);
  lines.push("");
  lines.push(`**ID:** ${decision.id}`);
  lines.push(`**Status:** ${decision.status || "unknown"}`);
  lines.push(`**Created:** ${decision.createdAt}`);
  if (decision.updatedAt) {
    lines.push(`**Updated:** ${decision.updatedAt}`);
  }
  lines.push("");

  if (decision.decision) {
    lines.push("## Decision");
    lines.push("");
    lines.push(decision.decision as string);
    lines.push("");
  }

  if (decision.rationale) {
    lines.push("## Rationale");
    lines.push("");
    lines.push(decision.rationale as string);
    lines.push("");
  }

  const tags = decision.tags as string[] | undefined;
  if (tags && tags.length > 0) {
    lines.push("## Tags");
    lines.push("");
    lines.push(tags.map((t) => `\`${t}\``).join(", "));
    lines.push("");
  }

  const alternatives = decision.alternatives as
    | Record<string, unknown>[]
    | undefined;
  if (alternatives && alternatives.length > 0) {
    lines.push("## Alternatives Considered");
    lines.push("");
    for (const alt of alternatives) {
      lines.push(`### ${alt.title || "Alternative"}`);
      if (alt.description) {
        lines.push("");
        lines.push(alt.description as string);
      }
      if (alt.pros) {
        lines.push("");
        lines.push("**Pros:**");
        for (const pro of alt.pros as string[]) {
          lines.push(`- ${pro}`);
        }
      }
      if (alt.cons) {
        lines.push("");
        lines.push("**Cons:**");
        for (const con of alt.cons as string[]) {
          lines.push(`- ${con}`);
        }
      }
      lines.push("");
    }
  }

  const relatedSessions = decision.relatedSessions as string[] | undefined;
  if (relatedSessions && relatedSessions.length > 0) {
    lines.push("## Related Sessions");
    lines.push("");
    for (const relId of relatedSessions) {
      lines.push(`- ${relId}`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("*Exported from memoria*");

  return lines.join("\n");
}

app.get("/api/export/sessions/:id/markdown", async (c) => {
  const id = c.req.param("id");
  const sessionsDir = path.join(getMemoriaDir(), "sessions");

  try {
    const filePath = findJsonFileById(sessionsDir, id);
    if (!filePath) {
      return c.json({ error: "Session not found" }, 404);
    }

    const content = fs.readFileSync(filePath, "utf-8");
    const session = JSON.parse(content);
    const markdown = sessionToMarkdown(session);

    // Return as downloadable file
    const filename = `session-${id}.md`;
    c.header("Content-Type", "text/markdown; charset=utf-8");
    c.header("Content-Disposition", `attachment; filename="${filename}"`);
    return c.text(markdown);
  } catch (error) {
    console.error("Failed to export session:", error);
    return c.json({ error: "Failed to export session" }, 500);
  }
});

app.get("/api/export/decisions/:id/markdown", async (c) => {
  const id = sanitizeId(c.req.param("id"));
  const decisionsDir = path.join(getMemoriaDir(), "decisions");

  try {
    const filePath = findJsonFileById(decisionsDir, id);
    if (!filePath) {
      return c.json({ error: "Decision not found" }, 404);
    }

    const content = fs.readFileSync(filePath, "utf-8");
    const decision = JSON.parse(content);
    const markdown = decisionToMarkdown(decision);

    // Return as downloadable file
    const filename = `decision-${id}.md`;
    c.header("Content-Type", "text/markdown; charset=utf-8");
    c.header("Content-Disposition", `attachment; filename="${filename}"`);
    return c.text(markdown);
  } catch (error) {
    console.error("Failed to export decision:", error);
    return c.json({ error: "Failed to export decision" }, 500);
  }
});

app.post("/api/export/sessions/bulk", async (c) => {
  const body = await c.req.json();
  const { ids } = body as { ids: string[] };

  if (!ids || ids.length === 0) {
    return c.json({ error: "No session IDs provided" }, 400);
  }

  const sessionsDir = path.join(getMemoriaDir(), "sessions");
  const markdowns: string[] = [];

  try {
    for (const id of ids) {
      const filePath = findJsonFileById(sessionsDir, id);
      if (filePath) {
        const content = fs.readFileSync(filePath, "utf-8");
        const session = JSON.parse(content);
        markdowns.push(sessionToMarkdown(session));
      }
    }

    if (markdowns.length === 0) {
      return c.json({ error: "No sessions found" }, 404);
    }

    const combined = markdowns.join("\n\n---\n\n");
    const filename = `sessions-export-${Date.now()}.md`;
    c.header("Content-Type", "text/markdown; charset=utf-8");
    c.header("Content-Disposition", `attachment; filename="${filename}"`);
    return c.text(combined);
  } catch (error) {
    console.error("Failed to export sessions:", error);
    return c.json({ error: "Failed to export sessions" }, 500);
  }
});

// Tags
app.get("/api/tags", async (c) => {
  const tagsPath = path.join(getMemoriaDir(), "tags.json");
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

// Indexes
app.get("/api/indexes/status", async (c) => {
  const memoriaDir = getMemoriaDir();
  try {
    const sessionsIndex = readAllSessionIndexes(memoriaDir);
    const decisionsIndex = readAllDecisionIndexes(memoriaDir);

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

app.post("/api/indexes/rebuild", async (c) => {
  const memoriaDir = getMemoriaDir();
  try {
    // Rebuild all indexes by month
    const sessionIndexes = rebuildAllSessionIndexes(memoriaDir);
    const decisionIndexes = rebuildAllDecisionIndexes(memoriaDir);

    // Count total items
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

// Serve static files in production
// When bundled, server.js is at dist/server.js and static files at dist/public/
const distPath = path.join(import.meta.dirname, "public");
if (fs.existsSync(distPath)) {
  app.use("/*", serveStatic({ root: distPath }));
  // SPA fallback - serve index.html for all non-API routes
  app.get("*", async (c) => {
    const indexPath = path.join(distPath, "index.html");
    if (fs.existsSync(indexPath)) {
      const content = fs.readFileSync(indexPath, "utf-8");
      return c.html(content);
    }
    return c.notFound();
  });
}

const requestedPort = parseInt(process.env.PORT || "7777", 10);
const maxPortAttempts = 10;

// Initialize indexes on startup
const memoriaDir = getMemoriaDir();
if (fs.existsSync(memoriaDir)) {
  try {
    const sessionsIndex = readRecentSessionIndexes(memoriaDir, 1);
    const decisionsIndex = readRecentDecisionIndexes(memoriaDir, 1);

    // Rebuild if indexes are stale or missing
    if (isIndexStale(sessionsIndex) || isIndexStale(decisionsIndex)) {
      console.log("Building indexes...");
      const sessionIndexes = rebuildAllSessionIndexes(memoriaDir);
      const decisionIndexes = rebuildAllDecisionIndexes(memoriaDir);

      let sessionCount = 0;
      for (const index of sessionIndexes.values()) {
        sessionCount += index.items.length;
      }
      let decisionCount = 0;
      for (const index of decisionIndexes.values()) {
        decisionCount += index.items.length;
      }
      console.log(
        `Indexed ${sessionCount} sessions, ${decisionCount} decisions`,
      );
    }
  } catch (error) {
    console.warn("Failed to initialize indexes:", error);
  }
}

// Try to start server with port fallback
async function startServer(port: number, attempt = 1): Promise<void> {
  return new Promise((resolve, reject) => {
    const server = serve({
      fetch: app.fetch,
      port,
    });

    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE" && attempt < maxPortAttempts) {
        console.log(`Port ${port} is in use, trying ${port + 1}...`);
        server.close();
        startServer(port + 1, attempt + 1)
          .then(resolve)
          .catch(reject);
      } else if (err.code === "EADDRINUSE") {
        reject(
          new Error(
            `Could not find an available port after ${maxPortAttempts} attempts`,
          ),
        );
      } else {
        reject(err);
      }
    });

    server.on("listening", () => {
      console.log(`\nmemoria dashboard`);
      console.log(`Project: ${getProjectRoot()}`);
      console.log(`URL: http://localhost:${port}\n`);
      resolve();
    });
  });
}

startServer(requestedPort).catch((err) => {
  console.error("Failed to start server:", err.message);
  process.exit(1);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  process.exit(0);
});
