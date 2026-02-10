import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import {
  readAllDecisionIndexes,
  readRecentDecisionIndexes,
  rebuildAllDecisionIndexes,
} from "../../../lib/index/manager.js";
import {
  findJsonFileById,
  getMnemeDir,
  listDatedJsonFiles,
  listJsonFiles,
  safeParseJsonFile,
  sanitizeId,
  writeAuditLog,
} from "../lib/helpers.js";
import { paginateArray, parsePaginationParams } from "../lib/pagination.js";

const decisions = new Hono();

// List decisions
decisions.get("/", async (c) => {
  const useIndex = c.req.query("useIndex") !== "false";
  const usePagination = c.req.query("paginate") !== "false";
  const mnemeDir = getMnemeDir();
  const params = parsePaginationParams(c);

  try {
    let items: Record<string, unknown>[];

    if (useIndex) {
      const index = params.allMonths
        ? readAllDecisionIndexes(mnemeDir)
        : readRecentDecisionIndexes(mnemeDir);
      items = index.items as Record<string, unknown>[];
    } else {
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

    if (!usePagination) {
      return c.json(filtered);
    }

    return c.json(paginateArray(filtered, params.page, params.limit));
  } catch (error) {
    console.error("Failed to read decisions:", error);
    return c.json({ error: "Failed to read decisions" }, 500);
  }
});

// Get single decision
decisions.get("/:id", async (c) => {
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

// Decision Impact API
decisions.get("/:id/impact", async (c) => {
  const decisionId = sanitizeId(c.req.param("id"));
  const sessionsDir = path.join(getMnemeDir(), "sessions");
  const patternsPath = path.join(getMnemeDir(), "patterns");

  try {
    const impactedSessions: { id: string; title: string }[] = [];
    const impactedPatterns: { id: string; description: string }[] = [];

    const sessionFiles = listDatedJsonFiles(sessionsDir);
    for (const filePath of sessionFiles) {
      const content = fs.readFileSync(filePath, "utf-8");
      const session = JSON.parse(content);

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

    const patternFiles = listJsonFiles(patternsPath);
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

// Delete decision
decisions.delete("/:id", async (c) => {
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

export default decisions;
