import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import {
  listJsonFiles,
  patternsDir,
  sanitizeId,
  writeAuditLog,
} from "../lib/helpers.js";

const patterns = new Hono();

// List all patterns
patterns.get("/", async (c) => {
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
        const items = data.items || data.patterns || [];
        for (const pattern of items) {
          allPatterns.push({
            ...pattern,
            sourceFile: path.basename(filePath, ".json"),
          });
        }
      } catch {
        // Skip invalid files
      }
    }

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

// Pattern stats
patterns.get("/stats", async (c) => {
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
        const items = data.items || data.patterns || [];
        const sourceName = path.basename(filePath, ".json");

        for (const pattern of items) {
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

// Delete pattern
patterns.delete("/:id", async (c) => {
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

export default patterns;
