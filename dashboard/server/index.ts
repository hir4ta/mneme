import fs from "node:fs";
import path from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  countInteractions,
  deleteBackups,
  deleteInteractions,
  getCurrentUser,
  getInteractionsBySessionIds,
  openLocalDatabase,
} from "../../lib/db.js";
import {
  isIndexStale,
  readAllDecisionIndexes,
  readAllSessionIndexes,
  readRecentDecisionIndexes,
  readRecentSessionIndexes,
  rebuildAllDecisionIndexes,
  rebuildAllSessionIndexes,
  rebuildSessionIndexForMonth,
} from "../../lib/index/manager.js";

// =============================================================================
// Note: Dashboard supports read and selected maintenance operations
// (session/decision/pattern/rule deletions and rule updates).
// Primary data creation remains via /mneme:* commands.
// =============================================================================

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Sanitize ID parameter to prevent path traversal
 */
function sanitizeId(id: string): string {
  const normalized = decodeURIComponent(id).trim();
  if (!normalized) return "";
  if (
    normalized.includes("..") ||
    normalized.includes("/") ||
    normalized.includes("\\")
  ) {
    return "";
  }
  return /^[a-zA-Z0-9:_-]+$/.test(normalized) ? normalized : "";
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
  return process.env.MNEME_PROJECT_ROOT || process.cwd();
};

const getMnemeDir = () => {
  return path.join(getProjectRoot(), ".mneme");
};

const ALLOWED_RULE_FILES = new Set(["dev-rules", "review-guidelines"]);

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

function writeAuditLog(entry: {
  entity: "session" | "decision" | "pattern" | "rule" | "unit";
  action: "create" | "update" | "delete";
  targetId: string;
  detail?: Record<string, unknown>;
}) {
  try {
    const now = new Date();
    const auditDir = path.join(getMnemeDir(), "audit");
    fs.mkdirSync(auditDir, { recursive: true });
    const auditFile = path.join(
      auditDir,
      `${now.toISOString().slice(0, 10)}.jsonl`,
    );
    const payload = {
      timestamp: now.toISOString(),
      actor: getCurrentUser(),
      ...entry,
    };
    fs.appendFileSync(auditFile, `${JSON.stringify(payload)}\n`);
  } catch (error) {
    console.error("Failed to write audit log:", error);
  }
}

type UnitStatus = "pending" | "approved" | "rejected";
type UnitType = "decision" | "pattern" | "rule";
type RuleKind = "policy" | "pitfall" | "playbook";

interface RuleSourceRef {
  type: UnitType;
  id: string;
}

interface Unit {
  id: string;
  type: UnitType;
  kind: RuleKind;
  title: string;
  summary: string;
  tags: string[];
  sourceId: string;
  sourceType: UnitType;
  sourceRefs: RuleSourceRef[];
  status: UnitStatus;
  createdAt: string;
  updatedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

interface UnitsFile {
  schemaVersion: number;
  updatedAt: string;
  items: Unit[];
}

const getUnitsPath = () => path.join(getMnemeDir(), "units", "units.json");

function readUnits(): UnitsFile {
  const filePath = getUnitsPath();
  if (!fs.existsSync(filePath)) {
    return {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      items: [],
    };
  }

  const parsed = safeParseJsonFile<UnitsFile>(filePath);
  if (!parsed || !Array.isArray(parsed.items)) {
    return {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      items: [],
    };
  }
  return parsed;
}

function writeUnits(doc: UnitsFile) {
  const filePath = getUnitsPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(doc, null, 2));
}

function makeUnitId(sourceType: UnitType, sourceId: string): string {
  const safe = sourceId.replace(/[^a-zA-Z0-9_-]/g, "-");
  return `mc-${sourceType}-${safe}`;
}

function getPatternKind(type: string | undefined): RuleKind {
  if (type === "error-solution" || type === "bad") {
    return "pitfall";
  }
  return "playbook";
}

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

const rulesDir = () => path.join(getMnemeDir(), "rules");

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

// Project Info
app.get("/api/project", (c) => {
  const projectRoot = getProjectRoot();
  const projectName = path.basename(projectRoot);

  // Try to get repository from git config
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

  return c.json({
    name: projectName,
    path: projectRoot,
    repository,
  });
});

// Sessions
app.get("/api/sessions", async (c) => {
  const useIndex = c.req.query("useIndex") !== "false";
  const usePagination = c.req.query("paginate") !== "false";
  const mnemeDir = getMnemeDir();
  const params = parsePaginationParams(c);

  try {
    let items: Record<string, unknown>[];

    // Use index for listing (faster)
    if (useIndex) {
      // Use allMonths to decide between recent or all indexes
      const index = params.allMonths
        ? readAllSessionIndexes(mnemeDir)
        : readRecentSessionIndexes(mnemeDir);
      items = index.items as Record<string, unknown>[];
    } else {
      // Fallback: read all files directly
      const sessionsDir = path.join(mnemeDir, "sessions");
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
  const mnemeDir = getMnemeDir();
  const showUntitled = c.req.query("showUntitled") === "true";
  try {
    const sessionsIndex = readAllSessionIndexes(mnemeDir);
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

    // Build inverted tag index for efficient edge computation
    const tagToNodes = new Map<string, string[]>();
    for (const item of filteredItems) {
      for (const tag of item.tags || []) {
        const list = tagToNodes.get(tag) || [];
        list.push(item.id);
        tagToNodes.set(tag, list);
      }
    }

    const edgeMap = new Map<
      string,
      { source: string; target: string; weight: number }
    >();
    for (const [, nodeIds] of tagToNodes) {
      for (let i = 0; i < nodeIds.length; i++) {
        for (let j = i + 1; j < nodeIds.length; j++) {
          const key =
            nodeIds[i] < nodeIds[j]
              ? `${nodeIds[i]}|${nodeIds[j]}`
              : `${nodeIds[j]}|${nodeIds[i]}`;
          const existing = edgeMap.get(key);
          if (existing) {
            existing.weight++;
          } else {
            const [source, target] = key.split("|");
            edgeMap.set(key, { source, target, weight: 1 });
          }
        }
      }
    }

    const edges = Array.from(edgeMap.values());

    return c.json({ nodes, edges });
  } catch (error) {
    console.error("Failed to build session graph:", error);
    return c.json({ error: "Failed to build session graph" }, 500);
  }
});

app.get("/api/sessions/:id", async (c) => {
  const id = sanitizeId(c.req.param("id"));
  const sessionsDir = path.join(getMnemeDir(), "sessions");
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
  const sessionsDir = path.join(getMnemeDir(), "sessions");
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

// =============================================================================
// Delete APIs (added for data management)
// =============================================================================

// Delete a single session (JSON + SQLite interactions)
app.delete("/api/sessions/:id", async (c) => {
  const id = sanitizeId(c.req.param("id"));
  const dryRun = c.req.query("dry-run") === "true";
  const mnemeDir = getMnemeDir();
  const sessionsDir = path.join(mnemeDir, "sessions");

  try {
    // Find JSON file
    const filePath = findJsonFileById(sessionsDir, id);
    if (!filePath) {
      return c.json({ error: "Session not found" }, 404);
    }

    // Read session to get createdAt for index update
    const sessionData = safeParseJsonFile<{
      context?: { projectDir?: string };
      createdAt?: string;
    }>(filePath);

    // Count interactions in local DB
    const db = openLocalDatabase(getProjectRoot());
    let interactionCount = 0;
    if (db) {
      interactionCount = countInteractions(db, { sessionId: id });
      if (!dryRun) {
        // Delete from SQLite
        deleteInteractions(db, id);
        deleteBackups(db, id);
      }
      db.close();
    }

    if (!dryRun) {
      // Delete JSON file
      fs.unlinkSync(filePath);

      // Also delete associated markdown if exists
      const mdPath = filePath.replace(/\.json$/, ".md");
      if (fs.existsSync(mdPath)) {
        fs.unlinkSync(mdPath);
      }

      // Delete session-link if exists
      const sessionLinksDir = path.join(mnemeDir, "session-links");
      const linkPath = path.join(sessionLinksDir, `${id}.json`);
      if (fs.existsSync(linkPath)) {
        fs.unlinkSync(linkPath);
      }

      // Rebuild index for the month of the deleted session
      if (sessionData?.createdAt) {
        const date = new Date(sessionData.createdAt);
        const year = date.getFullYear().toString();
        const month = (date.getMonth() + 1).toString().padStart(2, "0");
        rebuildSessionIndexForMonth(mnemeDir, year, month);
      }
      writeAuditLog({
        entity: "session",
        action: "delete",
        targetId: id,
      });
    }

    return c.json({
      deleted: dryRun ? 0 : 1,
      interactionsDeleted: dryRun ? 0 : interactionCount,
      dryRun,
      sessionId: id,
    });
  } catch (error) {
    console.error("Failed to delete session:", error);
    return c.json({ error: "Failed to delete session" }, 500);
  }
});

// Delete sessions in bulk (with filters)
app.delete("/api/sessions", async (c) => {
  const dryRun = c.req.query("dry-run") === "true";
  const projectFilter = c.req.query("project");
  const repositoryFilter = c.req.query("repository");
  const beforeFilter = c.req.query("before");

  const mnemeDir = getMnemeDir();
  const sessionsDir = path.join(mnemeDir, "sessions");

  try {
    // Get all session files
    const files = listDatedJsonFiles(sessionsDir);
    const sessionsToDelete: { id: string; path: string }[] = [];

    for (const filePath of files) {
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        const session = JSON.parse(content);

        let shouldDelete = true;

        // Apply project filter
        if (projectFilter) {
          const sessionProject = session.context?.projectDir;
          if (sessionProject !== projectFilter) {
            shouldDelete = false;
          }
        }

        // Apply repository filter
        if (repositoryFilter && shouldDelete) {
          const sessionRepo = session.context?.repository;
          if (sessionRepo !== repositoryFilter) {
            shouldDelete = false;
          }
        }

        // Apply before date filter
        if (beforeFilter && shouldDelete) {
          const sessionDate = session.createdAt?.split("T")[0];
          if (!sessionDate || sessionDate >= beforeFilter) {
            shouldDelete = false;
          }
        }

        if (shouldDelete) {
          sessionsToDelete.push({ id: session.id, path: filePath });
        }
      } catch {
        // Skip invalid files
      }
    }

    // Count interactions
    let totalInteractions = 0;
    const db = openLocalDatabase(getProjectRoot());
    if (db) {
      for (const session of sessionsToDelete) {
        totalInteractions += countInteractions(db, { sessionId: session.id });
      }

      if (!dryRun) {
        // Delete interactions from SQLite
        for (const session of sessionsToDelete) {
          deleteInteractions(db, session.id);
          deleteBackups(db, session.id);
        }
      }
      db.close();
    }

    if (!dryRun) {
      // Delete JSON files
      for (const session of sessionsToDelete) {
        fs.unlinkSync(session.path);

        // Delete associated markdown
        const mdPath = session.path.replace(/\.json$/, ".md");
        if (fs.existsSync(mdPath)) {
          fs.unlinkSync(mdPath);
        }

        // Delete session-link
        const sessionLinksDir = path.join(mnemeDir, "session-links");
        const linkPath = path.join(sessionLinksDir, `${session.id}.json`);
        if (fs.existsSync(linkPath)) {
          fs.unlinkSync(linkPath);
        }
        writeAuditLog({
          entity: "session",
          action: "delete",
          targetId: session.id,
        });
      }
    }

    return c.json({
      deleted: dryRun ? 0 : sessionsToDelete.length,
      interactionsDeleted: dryRun ? 0 : totalInteractions,
      wouldDelete: sessionsToDelete.length,
      dryRun,
      filters: {
        project: projectFilter || null,
        repository: repositoryFilter || null,
        before: beforeFilter || null,
      },
    });
  } catch (error) {
    console.error("Failed to delete sessions:", error);
    return c.json({ error: "Failed to delete sessions" }, 500);
  }
});

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

// Session Interactions API (from local SQLite)
// Supports master session: collects interactions from all linked sessions
app.get("/api/sessions/:id/interactions", async (c) => {
  const id = sanitizeId(c.req.param("id"));
  const mnemeDir = getMnemeDir();
  const sessionLinksDir = path.join(mnemeDir, "session-links");
  const sessionsDir = path.join(mnemeDir, "sessions");

  try {
    // Find session file and get projectDir
    const sessionFilePath = findJsonFileById(sessionsDir, id);
    let projectDir = getProjectRoot();

    if (sessionFilePath) {
      const sessionData = safeParseJsonFile<{
        context?: { projectDir?: string };
      }>(sessionFilePath);
      if (sessionData?.context?.projectDir) {
        projectDir = sessionData.context.projectDir;
      }
    }

    // Open local SQLite database for the session's project
    const db = openLocalDatabase(projectDir);
    if (!db) {
      return c.json({ interactions: [], count: 0 });
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

    // Get interactions from all related sessions
    const interactions = getInteractionsBySessionIds(db, sessionIds);
    db.close();

    // Tool detail type
    type ToolDetail = {
      name: string;
      detail: string | { type: string; prompt: string } | null;
    };

    // Tool result metadata type
    type ToolResultMeta = {
      toolUseId: string;
      success: boolean;
      contentLength?: number;
      lineCount?: number;
      filePath?: string;
    };

    // Progress event type
    type ProgressEvent = {
      type: string;
      timestamp: string;
      hookEvent?: string;
      hookName?: string;
      toolName?: string;
    };

    // Group by user/assistant pairs for better display
    const groupedInteractions: Array<{
      id: string;
      timestamp: string;
      user: string;
      assistant: string;
      thinking: string | null;
      isCompactSummary: boolean;
      hasPlanMode?: boolean;
      planTools?: Array<{ name: string; count: number }>;
      toolsUsed?: string[];
      toolDetails?: ToolDetail[];
      agentId?: string | null;
      agentType?: string | null;
      // New metadata fields
      inPlanMode?: boolean;
      slashCommand?: string;
      toolResults?: ToolResultMeta[];
      progressEvents?: ProgressEvent[];
    }> = [];

    let currentInteraction: {
      id: string;
      timestamp: string;
      user: string;
      assistant: string;
      thinking: string | null;
      isCompactSummary: boolean;
      hasPlanMode?: boolean;
      planTools?: Array<{ name: string; count: number }>;
      toolsUsed?: string[];
      toolDetails?: ToolDetail[];
      agentId?: string | null;
      agentType?: string | null;
      // New metadata fields
      inPlanMode?: boolean;
      slashCommand?: string;
      toolResults?: ToolResultMeta[];
      progressEvents?: ProgressEvent[];
    } | null = null;

    for (const interaction of interactions) {
      if (interaction.role === "user") {
        // Save previous interaction if exists
        if (currentInteraction) {
          groupedInteractions.push(currentInteraction);
        }

        // Parse metadata from tool_calls column
        let hasPlanMode: boolean | undefined;
        let planTools: Array<{ name: string; count: number }> | undefined;
        let toolsUsed: string[] | undefined;
        let toolDetails: ToolDetail[] | undefined;
        // New metadata fields
        let inPlanMode: boolean | undefined;
        let slashCommand: string | undefined;
        let toolResults: ToolResultMeta[] | undefined;
        let progressEvents: ProgressEvent[] | undefined;

        if (interaction.tool_calls) {
          try {
            const metadata = JSON.parse(interaction.tool_calls);
            // Legacy plan mode support
            if (metadata.hasPlanMode) {
              hasPlanMode = true;
              planTools = metadata.planTools || [];
            }
            // New plan mode flag
            if (metadata.inPlanMode) {
              inPlanMode = true;
            }
            if (
              metadata.toolsUsed &&
              Array.isArray(metadata.toolsUsed) &&
              metadata.toolsUsed.length > 0
            ) {
              toolsUsed = metadata.toolsUsed;
            }
            if (
              metadata.toolDetails &&
              Array.isArray(metadata.toolDetails) &&
              metadata.toolDetails.length > 0
            ) {
              toolDetails = metadata.toolDetails;
            }
            // New metadata fields
            if (metadata.slashCommand) {
              slashCommand = metadata.slashCommand;
            }
            if (
              metadata.toolResults &&
              Array.isArray(metadata.toolResults) &&
              metadata.toolResults.length > 0
            ) {
              toolResults = metadata.toolResults;
            }
            if (
              metadata.progressEvents &&
              Array.isArray(metadata.progressEvents) &&
              metadata.progressEvents.length > 0
            ) {
              progressEvents = metadata.progressEvents;
            }
          } catch {
            // Invalid JSON, skip metadata
          }
        }

        // Start new interaction
        currentInteraction = {
          id: `int-${String(groupedInteractions.length + 1).padStart(3, "0")}`,
          timestamp: interaction.timestamp,
          user: interaction.content,
          assistant: "",
          thinking: null,
          isCompactSummary: !!interaction.is_compact_summary,
          ...(hasPlanMode !== undefined && { hasPlanMode }),
          ...(planTools !== undefined && planTools.length > 0 && { planTools }),
          ...(toolsUsed !== undefined && toolsUsed.length > 0 && { toolsUsed }),
          ...(toolDetails !== undefined &&
            toolDetails.length > 0 && { toolDetails }),
          ...(interaction.agent_id && { agentId: interaction.agent_id }),
          ...(interaction.agent_type && { agentType: interaction.agent_type }),
          // New metadata fields
          ...(inPlanMode && { inPlanMode }),
          ...(slashCommand && { slashCommand }),
          ...(toolResults !== undefined &&
            toolResults.length > 0 && { toolResults }),
          ...(progressEvents !== undefined &&
            progressEvents.length > 0 && { progressEvents }),
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
  const mnemeDir = getMnemeDir();
  const params = parsePaginationParams(c);

  try {
    let items: Record<string, unknown>[];

    // Use index for listing (faster)
    if (useIndex) {
      const index = params.allMonths
        ? readAllDecisionIndexes(mnemeDir)
        : readRecentDecisionIndexes(mnemeDir);
      items = index.items as Record<string, unknown>[];
    } else {
      // Fallback: read all files directly
      const decisionsDir = path.join(mnemeDir, "decisions");
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
  const decisionsDir = path.join(getMnemeDir(), "decisions");
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

app.delete("/api/decisions/:id", async (c) => {
  const id = sanitizeId(c.req.param("id"));
  const decisionsDir = path.join(getMnemeDir(), "decisions");
  try {
    const filePath = findJsonFileById(decisionsDir, id);
    if (!filePath) {
      return c.json({ error: "Decision not found" }, 404);
    }

    fs.unlinkSync(filePath);
    rebuildAllDecisionIndexes(getMnemeDir());
    writeAuditLog({
      entity: "decision",
      action: "delete",
      targetId: id,
    });
    return c.json({ deleted: 1, id });
  } catch (error) {
    console.error("Failed to delete decision:", error);
    return c.json({ error: "Failed to delete decision" }, 500);
  }
});

// Project info
app.get("/api/info", async (c) => {
  const projectRoot = getProjectRoot();
  const mnemeDir = getMnemeDir();
  return c.json({
    projectRoot,
    mnemeDir,
    exists: fs.existsSync(mnemeDir),
  });
});

// Rules
app.get("/api/rules/:id", async (c) => {
  const id = c.req.param("id");
  if (!ALLOWED_RULE_FILES.has(id)) {
    return c.json({ error: "Invalid rule type" }, 400);
  }
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

// Update rules
app.put("/api/rules/:id", async (c) => {
  const id = c.req.param("id");
  // Only allow known rule types
  if (!ALLOWED_RULE_FILES.has(id)) {
    return c.json({ error: "Invalid rule type" }, 400);
  }
  const dir = rulesDir();
  try {
    const filePath = path.join(dir, `${id}.json`);
    if (!fs.existsSync(filePath)) {
      return c.json({ error: "Rules not found" }, 404);
    }
    const body = await c.req.json();
    // Basic validation
    if (!body.items || !Array.isArray(body.items)) {
      return c.json({ error: "Invalid rules format" }, 400);
    }
    fs.writeFileSync(filePath, JSON.stringify(body, null, 2));
    writeAuditLog({
      entity: "rule",
      action: "update",
      targetId: id,
      detail: { itemCount: body.items.length },
    });
    return c.json(body);
  } catch (error) {
    console.error("Failed to update rules:", error);
    return c.json({ error: "Failed to update rules" }, 500);
  }
});

app.delete("/api/rules/:id/:ruleId", async (c) => {
  const id = c.req.param("id");
  if (!ALLOWED_RULE_FILES.has(id)) {
    return c.json({ error: "Invalid rule type" }, 400);
  }

  const ruleId = sanitizeId(c.req.param("ruleId"));
  if (!ruleId) {
    return c.json({ error: "Invalid rule id" }, 400);
  }

  const filePath = path.join(rulesDir(), `${id}.json`);
  if (!fs.existsSync(filePath)) {
    return c.json({ error: "Rules not found" }, 404);
  }

  try {
    const doc = safeParseJsonFile<{
      schemaVersion?: number;
      createdAt?: string;
      updatedAt?: string;
      items?: Array<{ id?: string }>;
    }>(filePath);

    if (!doc || !Array.isArray(doc.items)) {
      return c.json({ error: "Invalid rules format" }, 500);
    }

    const nextItems = doc.items.filter((item) => item.id !== ruleId);
    if (nextItems.length === doc.items.length) {
      return c.json({ error: "Rule not found" }, 404);
    }

    const nextDoc = {
      ...doc,
      items: nextItems,
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(filePath, JSON.stringify(nextDoc, null, 2));
    writeAuditLog({
      entity: "rule",
      action: "delete",
      targetId: ruleId,
      detail: { ruleType: id },
    });
    return c.json({ deleted: 1, id: ruleId, ruleType: id });
  } catch (error) {
    console.error("Failed to delete rule:", error);
    return c.json({ error: "Failed to delete rule" }, 500);
  }
});

// Timeline API - セッションを時系列でグループ化
app.get("/api/timeline", async (c) => {
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
  const sessionsDir = path.join(getMnemeDir(), "sessions");
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
  const sessionsDir = path.join(getMnemeDir(), "sessions");
  const patternsDir = path.join(getMnemeDir(), "patterns");

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
  const mnemeDir = getMnemeDir();
  const apiKey = getOpenAIKey();

  try {
    const sessionsIndex = readRecentSessionIndexes(mnemeDir);
    const decisionsIndex = readRecentDecisionIndexes(mnemeDir);

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
  const mnemeDir = getMnemeDir();
  try {
    const sessionsIndex = readAllSessionIndexes(mnemeDir);
    const decisionsIndex = readAllDecisionIndexes(mnemeDir);

    // Filter out empty sessions (no interactions and not saved)
    const validSessions = sessionsIndex.items.filter(
      (session) => session.interactionCount > 0 || session.hasSummary === true,
    );

    // Count by session type (using filtered sessions)
    const sessionTypeCount: Record<string, number> = {};
    for (const session of validSessions) {
      const type = session.sessionType || "unknown";
      sessionTypeCount[type] = (sessionTypeCount[type] || 0) + 1;
    }

    // Count patterns
    let totalPatterns = 0;
    const patternsByType: Record<string, number> = {};
    const patternsPath = path.join(mnemeDir, "patterns");
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
    const rulesPath = path.join(mnemeDir, "rules");
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

app.get("/api/stats/activity", async (c) => {
  const mnemeDir = getMnemeDir();
  const daysParam = Number.parseInt(c.req.query("days") || "30", 10);

  // Prevent infinite loop with bounds checking
  const MAX_DAYS = 365;
  const safeDays = Math.min(Math.max(1, daysParam), MAX_DAYS);

  try {
    const sessionsIndex = readAllSessionIndexes(mnemeDir);
    const decisionsIndex = readAllDecisionIndexes(mnemeDir);

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
  const mnemeDir = getMnemeDir();
  try {
    const sessionsIndex = readAllSessionIndexes(mnemeDir);

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
const patternsDir = () => path.join(getMnemeDir(), "patterns");

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

app.delete("/api/patterns/:id", async (c) => {
  const id = sanitizeId(c.req.param("id"));
  const sourceFile = c.req.query("source");
  if (!id) {
    return c.json({ error: "Invalid pattern id" }, 400);
  }
  if (!sourceFile) {
    return c.json({ error: "Missing source file" }, 400);
  }

  const safeSource = sourceFile.replace(/[^a-zA-Z0-9_-]/g, "");
  const filePath = path.join(patternsDir(), `${safeSource}.json`);
  if (!fs.existsSync(filePath)) {
    return c.json({ error: "Pattern source file not found" }, 404);
  }

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(content) as {
      items?: Array<{ id?: string }>;
      patterns?: Array<{ id?: string }>;
    };

    let deleted = 0;
    if (Array.isArray(data.items)) {
      const nextItems = data.items.filter((item) => item.id !== id);
      deleted = data.items.length - nextItems.length;
      data.items = nextItems;
    } else if (Array.isArray(data.patterns)) {
      const nextPatterns = data.patterns.filter((item) => item.id !== id);
      deleted = data.patterns.length - nextPatterns.length;
      data.patterns = nextPatterns;
    } else {
      return c.json({ error: "Invalid pattern file format" }, 500);
    }

    if (deleted === 0) {
      return c.json({ error: "Pattern not found" }, 404);
    }

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    writeAuditLog({
      entity: "pattern",
      action: "delete",
      targetId: id,
      detail: { sourceFile: safeSource },
    });
    return c.json({ deleted, id, sourceFile: safeSource });
  } catch (error) {
    console.error("Failed to delete pattern:", error);
    return c.json({ error: "Failed to delete pattern" }, 500);
  }
});

app.get("/api/units", async (c) => {
  const status = c.req.query("status") as UnitStatus | undefined;
  const doc = readUnits();
  const items =
    status && ["pending", "approved", "rejected"].includes(status)
      ? doc.items.filter((item) => item.status === status)
      : doc.items;
  return c.json({
    ...doc,
    items: items.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    ),
  });
});

app.get("/api/units/:id", async (c) => {
  const id = sanitizeId(c.req.param("id"));
  if (!id) {
    return c.json({ error: "Invalid unit id" }, 400);
  }
  const doc = readUnits();
  const item = doc.items.find((unit) => unit.id === id);
  if (!item) {
    return c.json({ error: "Unit not found" }, 404);
  }
  return c.json(item);
});

app.get("/api/approval-queue", async (c) => {
  const doc = readUnits();
  const pending = doc.items.filter((item) => item.status === "pending");
  return c.json({
    pending,
    totalPending: pending.length,
    byType: pending.reduce(
      (acc, item) => {
        acc[item.type] = (acc[item.type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    ),
  });
});

app.post("/api/units/generate", async (c) => {
  const now = new Date().toISOString();
  const existing = readUnits();
  const bySourceKey = new Map(
    existing.items.map((item) => [`${item.sourceType}:${item.sourceId}`, item]),
  );
  const generated: Unit[] = [];

  try {
    const decisionFiles = listDatedJsonFiles(
      path.join(getMnemeDir(), "decisions"),
    );
    for (const filePath of decisionFiles) {
      const decision = safeParseJsonFile<Record<string, unknown>>(filePath);
      if (!decision) continue;
      const sourceId = String(decision.id || "");
      if (!sourceId) continue;
      const sourceType: UnitType = "decision";
      const key = `${sourceType}:${sourceId}`;
      const previous = bySourceKey.get(key);
      generated.push({
        id: previous?.id || makeUnitId(sourceType, sourceId),
        type: "decision",
        kind: "policy",
        title: String(decision.title || sourceId),
        summary: String(
          decision.decision || decision.reasoning || decision.title || "",
        ),
        tags: Array.isArray(decision.tags)
          ? decision.tags.map((tag) => String(tag))
          : [],
        sourceId,
        sourceType,
        sourceRefs: [{ type: sourceType, id: sourceId }],
        status: previous?.status || "pending",
        createdAt: previous?.createdAt || now,
        updatedAt: now,
        reviewedAt: previous?.reviewedAt,
        reviewedBy: previous?.reviewedBy,
      });
    }

    const ruleFiles = ["dev-rules", "review-guidelines"];
    for (const ruleFile of ruleFiles) {
      const filePath = path.join(rulesDir(), `${ruleFile}.json`);
      const doc = safeParseJsonFile<{ items?: Array<Record<string, unknown>> }>(
        filePath,
      );
      if (!doc || !Array.isArray(doc.items)) continue;
      for (const rule of doc.items) {
        const ruleId = String(rule.id || "");
        if (!ruleId) continue;
        const sourceType: UnitType = "rule";
        const sourceId = `${ruleFile}:${ruleId}`;
        const key = `${sourceType}:${sourceId}`;
        const previous = bySourceKey.get(key);
        const title =
          String(rule.text || rule.title || rule.rule || ruleId) || ruleId;
        const summary =
          String(rule.rationale || rule.description || "") || title;
        generated.push({
          id: previous?.id || makeUnitId(sourceType, sourceId),
          type: "rule",
          kind: "policy",
          title,
          summary,
          tags: Array.isArray(rule.tags)
            ? rule.tags.map((tag) => String(tag))
            : [ruleFile],
          sourceId,
          sourceType,
          sourceRefs: [{ type: sourceType, id: sourceId }],
          status: previous?.status || "pending",
          createdAt: previous?.createdAt || now,
          updatedAt: now,
          reviewedAt: previous?.reviewedAt,
          reviewedBy: previous?.reviewedBy,
        });
      }
    }

    const patternFiles = listJsonFiles(patternsDir());
    for (const patternFile of patternFiles) {
      const sourceName = path.basename(patternFile, ".json");
      const doc = safeParseJsonFile<{
        items?: Array<Record<string, unknown>>;
        patterns?: Array<Record<string, unknown>>;
      }>(patternFile);
      const items = doc?.items || doc?.patterns || [];
      for (const pattern of items) {
        const patternId = String(pattern.id || "");
        if (!patternId) continue;
        const sourceType: UnitType = "pattern";
        const sourceId = `${sourceName}:${patternId}`;
        const key = `${sourceType}:${sourceId}`;
        const previous = bySourceKey.get(key);
        const title = String(
          pattern.title ||
            pattern.errorPattern ||
            pattern.description ||
            patternId,
        );
        const summary = String(
          pattern.solution || pattern.description || pattern.errorPattern || "",
        );
        generated.push({
          id: previous?.id || makeUnitId(sourceType, sourceId),
          type: "pattern",
          kind: getPatternKind(String(pattern.type || "")),
          title,
          summary,
          tags: Array.isArray(pattern.tags)
            ? pattern.tags.map((tag) => String(tag))
            : [sourceName],
          sourceId,
          sourceType,
          sourceRefs: [{ type: sourceType, id: sourceId }],
          status: previous?.status || "pending",
          createdAt: previous?.createdAt || now,
          updatedAt: now,
          reviewedAt: previous?.reviewedAt,
          reviewedBy: previous?.reviewedBy,
        });
      }
    }

    const next: UnitsFile = {
      schemaVersion: 1,
      updatedAt: now,
      items: generated.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
    };
    writeUnits(next);
    writeAuditLog({
      entity: "unit",
      action: "create",
      targetId: "units",
      detail: { count: generated.length },
    });
    return c.json({
      generated: generated.length,
      pending: generated.filter((item) => item.status === "pending").length,
      updatedAt: now,
    });
  } catch (error) {
    console.error("Failed to generate units:", error);
    return c.json({ error: "Failed to generate units" }, 500);
  }
});

app.patch("/api/units/:id/status", async (c) => {
  const id = sanitizeId(c.req.param("id"));
  const body = (await c.req.json()) as { status?: UnitStatus };
  if (!id) {
    return c.json({ error: "Invalid unit id" }, 400);
  }
  if (
    !body.status ||
    !["pending", "approved", "rejected"].includes(body.status)
  ) {
    return c.json({ error: "Invalid status" }, 400);
  }

  const doc = readUnits();
  const index = doc.items.findIndex((item) => item.id === id);
  if (index === -1) {
    return c.json({ error: "Unit not found" }, 404);
  }

  const now = new Date().toISOString();
  const actor = getCurrentUser();
  const nextItem: Unit = {
    ...doc.items[index],
    status: body.status,
    updatedAt: now,
    reviewedAt: now,
    reviewedBy: actor,
  };
  doc.items[index] = nextItem;
  doc.updatedAt = now;
  writeUnits(doc);
  writeAuditLog({
    entity: "unit",
    action: "update",
    targetId: id,
    detail: { status: body.status },
  });

  return c.json(nextItem);
});

app.delete("/api/units/:id", async (c) => {
  const id = sanitizeId(c.req.param("id"));
  if (!id) {
    return c.json({ error: "Invalid unit id" }, 400);
  }
  const doc = readUnits();
  const nextItems = doc.items.filter((item) => item.id !== id);
  if (nextItems.length === doc.items.length) {
    return c.json({ error: "Unit not found" }, 404);
  }
  doc.items = nextItems;
  doc.updatedAt = new Date().toISOString();
  writeUnits(doc);
  writeAuditLog({
    entity: "unit",
    action: "delete",
    targetId: id,
  });
  return c.json({ deleted: 1, id });
});

app.get("/api/knowledge-graph", async (c) => {
  try {
    const mnemeDir = getMnemeDir();
    const sessionItems = readAllSessionIndexes(mnemeDir).items;
    const units = readUnits().items.filter(
      (item) => item.status === "approved",
    );

    // Read full sessions to get resumedFrom
    const sessionDataMap = new Map<string, { resumedFrom?: string }>();
    for (const item of sessionItems.filter((i) => i.hasSummary)) {
      try {
        const sessionPath = path.join(mnemeDir, item.filePath);
        const raw = fs.readFileSync(sessionPath, "utf-8");
        const session = JSON.parse(raw);
        if (session.resumedFrom) {
          sessionDataMap.set(item.id, {
            resumedFrom: session.resumedFrom,
          });
        }
      } catch {
        // Skip sessions that cannot be read
      }
    }

    const nodes = [
      ...sessionItems
        .filter((item) => item.hasSummary)
        .map((item) => ({
          id: `session:${item.id}`,
          entityType: "session" as const,
          entityId: item.id,
          title: item.title,
          tags: item.tags || [],
          createdAt: item.createdAt,
          branch: item.branch || null,
          resumedFrom: sessionDataMap.get(item.id)?.resumedFrom || null,
          unitSubtype: null,
          sourceId: null,
          appliedCount: null,
          acceptedCount: null,
        })),
      ...units.map((item) => ({
        id: `unit:${item.id}`,
        entityType: "unit" as const,
        entityId: item.id,
        title: item.title,
        tags: item.tags || [],
        createdAt: item.createdAt,
        unitSubtype: (item.type as string) || null,
        sourceId: item.sourceId || null,
        appliedCount: null,
        acceptedCount: null,
        branch: null,
        resumedFrom: null,
      })),
    ];

    // Build inverted tag index for efficient edge computation
    const tagToNodes = new Map<string, string[]>();
    for (const node of nodes) {
      for (const tag of node.tags) {
        const list = tagToNodes.get(tag) || [];
        list.push(node.id);
        tagToNodes.set(tag, list);
      }
    }

    // Build shared tag edges from inverted index
    const edgeMap = new Map<
      string,
      {
        source: string;
        target: string;
        weight: number;
        sharedTags: string[];
        edgeType: "sharedTags" | "resumedFrom" | "derivedFrom";
        directed: boolean;
      }
    >();
    for (const [tag, nodeIds] of tagToNodes) {
      for (let i = 0; i < nodeIds.length; i++) {
        for (let j = i + 1; j < nodeIds.length; j++) {
          const key =
            nodeIds[i] < nodeIds[j]
              ? `${nodeIds[i]}|${nodeIds[j]}`
              : `${nodeIds[j]}|${nodeIds[i]}`;
          const existing = edgeMap.get(key);
          if (existing) {
            existing.weight++;
            existing.sharedTags.push(tag);
          } else {
            const [source, target] = key.split("|");
            edgeMap.set(key, {
              source,
              target,
              weight: 1,
              sharedTags: [tag],
              edgeType: "sharedTags",
              directed: false,
            });
          }
        }
      }
    }

    const tagEdges = Array.from(edgeMap.values());

    // Build resumedFrom edges
    const nodeIdSet = new Set(nodes.map((n) => n.id));
    const resumedEdges: typeof tagEdges = [];
    for (const node of nodes) {
      if (node.entityType === "session" && node.resumedFrom) {
        const targetId = `session:${node.resumedFrom}`;
        if (nodeIdSet.has(targetId)) {
          resumedEdges.push({
            source: targetId,
            target: node.id,
            weight: 1,
            sharedTags: [],
            edgeType: "resumedFrom",
            directed: true,
          });
        }
      }
    }

    const edges = [...tagEdges, ...resumedEdges];

    return c.json({ nodes, edges });
  } catch (error) {
    console.error("Failed to build knowledge graph:", error);
    return c.json({ error: "Failed to build knowledge graph" }, 500);
  }
});

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
  lines.push("*Exported from mneme*");

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
  lines.push("*Exported from mneme*");

  return lines.join("\n");
}

app.get("/api/export/sessions/:id/markdown", async (c) => {
  const id = c.req.param("id");
  const sessionsDir = path.join(getMnemeDir(), "sessions");

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
  const decisionsDir = path.join(getMnemeDir(), "decisions");

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

  const sessionsDir = path.join(getMnemeDir(), "sessions");
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

// Indexes
app.get("/api/indexes/status", async (c) => {
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

app.post("/api/indexes/rebuild", async (c) => {
  const mnemeDir = getMnemeDir();
  try {
    // Rebuild all indexes by month
    const sessionIndexes = rebuildAllSessionIndexes(mnemeDir);
    const decisionIndexes = rebuildAllDecisionIndexes(mnemeDir);

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
const mnemeDir = getMnemeDir();
if (fs.existsSync(mnemeDir)) {
  try {
    const sessionsIndex = readRecentSessionIndexes(mnemeDir, 1);
    const decisionsIndex = readRecentDecisionIndexes(mnemeDir, 1);

    // Rebuild if indexes are stale or missing
    if (isIndexStale(sessionsIndex) || isIndexStale(decisionsIndex)) {
      console.log("Building indexes...");
      const sessionIndexes = rebuildAllSessionIndexes(mnemeDir);
      const decisionIndexes = rebuildAllDecisionIndexes(mnemeDir);

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
      console.log(`\nmneme dashboard`);
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
