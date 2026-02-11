import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import {
  readAllSessionIndexes,
  readRecentSessionIndexes,
} from "../../../lib/index/manager.js";
import {
  findJsonFileById,
  getMnemeDir,
  listDatedJsonFiles,
  safeParseJsonFile,
  sanitizeId,
} from "../lib/helpers.js";
import { paginateArray, parsePaginationParams } from "../lib/pagination.js";
import sessionsDelete from "./sessions-delete.js";
import sessionsInteractions from "./sessions-interactions.js";

const sessions = new Hono();

// Mount sub-routers
sessions.route("/", sessionsDelete);
sessions.route("/", sessionsInteractions);

// List sessions
sessions.get("/", async (c) => {
  const useIndex = c.req.query("useIndex") !== "false";
  const usePagination = c.req.query("paginate") !== "false";
  const mnemeDir = getMnemeDir();
  const params = parsePaginationParams(c);

  try {
    let items: Record<string, unknown>[];

    // Use index for listing (faster)
    if (useIndex) {
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

// Session Graph API - must be before /:id
sessions.get("/graph", async (c) => {
  const mnemeDir = getMnemeDir();
  const showUntitled = c.req.query("showUntitled") === "true";
  try {
    const sessionsIndex = readAllSessionIndexes(mnemeDir);
    const filteredItems = showUntitled
      ? sessionsIndex.items
      : sessionsIndex.items.filter((s) => s.hasSummary === true);

    const nodes = filteredItems.map((session) => ({
      id: session.id,
      title: session.title,
      type: session.sessionType || "unknown",
      tags: session.tags || [],
      createdAt: session.createdAt,
    }));

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

// Get single session
sessions.get("/:id", async (c) => {
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

// Legacy: Get session markdown file
sessions.get("/:id/markdown", async (c) => {
  const id = sanitizeId(c.req.param("id"));
  const sessionsDir = path.join(getMnemeDir(), "sessions");
  try {
    const jsonPath = findJsonFileById(sessionsDir, id);
    if (!jsonPath) {
      return c.json({ error: "Session not found" }, 404);
    }
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

export default sessions;
