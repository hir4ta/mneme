import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import {
  type DevRuleItem,
  type DevRuleStatus,
  type DevRuleType,
  findJsonFileById,
  getMnemeDir,
  listDatedJsonFiles,
  listJsonFiles,
  patternsDir,
  rulesDir,
  safeParseJsonFile,
  sanitizeId,
  writeAuditLog,
} from "../lib/helpers.js";

export function collectDevRules(): DevRuleItem[] {
  const items: DevRuleItem[] = [];

  // Decisions (dated JSON files, may be flat object or {schemaVersion, items:[...]})
  const decisionFiles = listDatedJsonFiles(
    path.join(getMnemeDir(), "decisions"),
  );
  for (const filePath of decisionFiles) {
    const sourceName = path.basename(filePath, ".json");
    const raw = safeParseJsonFile<Record<string, unknown>>(filePath);
    if (!raw) continue;

    const entries: Array<Record<string, unknown>> = [];
    if (Array.isArray(raw.items)) {
      entries.push(...(raw.items as Array<Record<string, unknown>>));
    } else if (raw.id) {
      entries.push(raw);
    }

    for (const entry of entries) {
      const id = String(entry.id || "");
      if (!id) continue;
      const alts = Array.isArray(entry.alternatives)
        ? entry.alternatives.map((a) =>
            typeof a === "string" ? a : String(a.option || a.name || a),
          )
        : undefined;
      items.push({
        id,
        type: "decision",
        title: String(entry.title || entry.text || id),
        summary: String(
          entry.text || entry.decision || entry.reasoning || entry.title || "",
        ),
        tags: Array.isArray(entry.tags) ? entry.tags.map((t) => String(t)) : [],
        status: (entry.status as DevRuleStatus) || "draft",
        priority: entry.priority ? String(entry.priority) : undefined,
        sourceFile: sourceName,
        createdAt: String(entry.createdAt || raw.createdAt || ""),
        updatedAt: entry.updatedAt ? String(entry.updatedAt) : undefined,
        context: entry.context ? String(entry.context) : undefined,
        reasoning: entry.reasoning ? String(entry.reasoning) : undefined,
        alternatives: alts,
        relatedSessions: Array.isArray(entry.relatedSessions)
          ? entry.relatedSessions.map((s) => String(s))
          : undefined,
      });
    }
  }

  // Patterns (flat JSON files with items or patterns array)
  const patternFiles = listJsonFiles(patternsDir());
  for (const filePath of patternFiles) {
    const sourceName = path.basename(filePath, ".json");
    const doc = safeParseJsonFile<{
      items?: Array<Record<string, unknown>>;
      patterns?: Array<Record<string, unknown>>;
    }>(filePath);
    const entries = doc?.items || doc?.patterns || [];
    for (const entry of entries) {
      const id = String(entry.id || "");
      if (!id) continue;
      items.push({
        id,
        type: "pattern",
        title: String(
          entry.title || entry.errorPattern || entry.description || id,
        ),
        summary: String(
          entry.solution || entry.description || entry.errorPattern || "",
        ),
        tags: Array.isArray(entry.tags)
          ? entry.tags.map((t) => String(t))
          : [sourceName],
        status: (entry.status as DevRuleStatus) || "draft",
        priority: entry.priority ? String(entry.priority) : undefined,
        sourceFile: sourceName,
        createdAt: String(entry.createdAt || ""),
        updatedAt: entry.updatedAt ? String(entry.updatedAt) : undefined,
        context: entry.context ? String(entry.context) : undefined,
        patternType: entry.type ? String(entry.type) : undefined,
        pattern: entry.pattern ? String(entry.pattern) : undefined,
        sourceId: entry.sourceId ? String(entry.sourceId) : undefined,
      });
    }
  }

  // Rules (dev-rules.json, review-guidelines.json)
  const ruleFileNames = ["dev-rules", "review-guidelines"];
  for (const ruleFile of ruleFileNames) {
    const filePath = path.join(rulesDir(), `${ruleFile}.json`);
    const doc = safeParseJsonFile<{
      createdAt?: string;
      items?: Array<Record<string, unknown>>;
    }>(filePath);
    if (!doc || !Array.isArray(doc.items)) continue;
    for (const entry of doc.items) {
      const id = String(entry.id || "");
      if (!id) continue;
      const sourceRef =
        entry.sourceRef &&
        typeof entry.sourceRef === "object" &&
        !Array.isArray(entry.sourceRef)
          ? {
              type: String(
                (entry.sourceRef as Record<string, unknown>).type || "",
              ),
              id: String((entry.sourceRef as Record<string, unknown>).id || ""),
            }
          : undefined;
      items.push({
        id,
        type: "rule",
        title: String(entry.text || entry.title || entry.rule || id),
        summary: String(entry.rationale || entry.description || ""),
        tags: Array.isArray(entry.tags)
          ? entry.tags.map((t) => String(t))
          : [ruleFile],
        status: (entry.status as DevRuleStatus) || "draft",
        priority: entry.priority ? String(entry.priority) : undefined,
        sourceFile: ruleFile,
        createdAt: String(entry.createdAt || doc.createdAt || ""),
        updatedAt: entry.updatedAt ? String(entry.updatedAt) : undefined,
        rationale: entry.rationale ? String(entry.rationale) : undefined,
        category: entry.category ? String(entry.category) : undefined,
        sourceRef,
        appliedCount:
          typeof entry.appliedCount === "number"
            ? entry.appliedCount
            : undefined,
        acceptedCount:
          typeof entry.acceptedCount === "number"
            ? entry.acceptedCount
            : undefined,
      });
    }
  }

  return items;
}

const devRules = new Hono();

// List dev rules
devRules.get("/", async (c) => {
  try {
    const status = c.req.query("status") as DevRuleStatus | undefined;
    const items = collectDevRules();
    const filtered =
      status && ["draft", "approved", "rejected"].includes(status)
        ? items.filter((item) => item.status === status)
        : items;
    return c.json({
      items: filtered,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to read dev rules:", error);
    return c.json({ error: "Failed to read dev rules" }, 500);
  }
});

// Update dev rule status
devRules.patch("/:type/:sourceFile/:id/status", async (c) => {
  const type = c.req.param("type") as DevRuleType;
  const sourceFile = c.req.param("sourceFile");
  const id = sanitizeId(c.req.param("id"));
  const body = (await c.req.json()) as { status?: DevRuleStatus };

  if (!id || !sourceFile) {
    return c.json({ error: "Invalid parameters" }, 400);
  }
  if (
    !body.status ||
    !["draft", "approved", "rejected"].includes(body.status)
  ) {
    return c.json({ error: "Invalid status" }, 400);
  }

  try {
    let filePath: string;
    if (type === "decision") {
      const found = findJsonFileById(
        path.join(getMnemeDir(), "decisions"),
        sourceFile,
      );
      if (!found) return c.json({ error: "Source file not found" }, 404);
      filePath = found;
    } else if (type === "pattern") {
      filePath = path.join(patternsDir(), `${sourceFile}.json`);
    } else {
      filePath = path.join(rulesDir(), `${sourceFile}.json`);
    }

    if (!fs.existsSync(filePath)) {
      return c.json({ error: "Source file not found" }, 404);
    }

    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const items: Array<Record<string, unknown>> =
      raw.items || raw.patterns || (raw.id ? [raw] : []);
    const target = items.find((item) => String(item.id) === id);
    if (!target) {
      return c.json({ error: "Item not found" }, 404);
    }

    target.status = body.status;
    target.updatedAt = new Date().toISOString();

    // Write back - handle flat object vs container format
    if (!raw.items && !raw.patterns && raw.id) {
      Object.assign(raw, target);
    }
    fs.writeFileSync(filePath, `${JSON.stringify(raw, null, 2)}\n`);

    writeAuditLog({
      entity: "dev-rule",
      action: "update",
      targetId: id,
      detail: { type, sourceFile, status: body.status },
    });

    return c.json({ id, type, sourceFile, status: body.status });
  } catch (error) {
    console.error("Failed to update dev rule status:", error);
    return c.json({ error: "Failed to update status" }, 500);
  }
});

// Delete dev rule
devRules.delete("/:type/:sourceFile/:id", async (c) => {
  const type = c.req.param("type") as DevRuleType;
  const sourceFile = c.req.param("sourceFile");
  const id = sanitizeId(c.req.param("id"));

  if (!id || !sourceFile) {
    return c.json({ error: "Invalid parameters" }, 400);
  }

  try {
    let filePath: string;
    if (type === "decision") {
      const found = findJsonFileById(
        path.join(getMnemeDir(), "decisions"),
        sourceFile,
      );
      if (!found) return c.json({ error: "Source file not found" }, 404);
      filePath = found;
    } else if (type === "pattern") {
      filePath = path.join(patternsDir(), `${sourceFile}.json`);
    } else {
      filePath = path.join(rulesDir(), `${sourceFile}.json`);
    }

    if (!fs.existsSync(filePath)) {
      return c.json({ error: "Source file not found" }, 404);
    }

    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const arrayKey = raw.items ? "items" : raw.patterns ? "patterns" : null;

    if (arrayKey) {
      const before = raw[arrayKey].length;
      raw[arrayKey] = raw[arrayKey].filter(
        (item: Record<string, unknown>) => String(item.id) !== id,
      );
      if (raw[arrayKey].length === before) {
        return c.json({ error: "Item not found" }, 404);
      }
      fs.writeFileSync(filePath, `${JSON.stringify(raw, null, 2)}\n`);
    } else if (raw.id && String(raw.id) === id) {
      fs.unlinkSync(filePath);
    } else {
      return c.json({ error: "Item not found" }, 404);
    }

    writeAuditLog({
      entity: "dev-rule",
      action: "delete",
      targetId: id,
      detail: { type, sourceFile },
    });

    return c.json({ deleted: 1, id });
  } catch (error) {
    console.error("Failed to delete dev rule:", error);
    return c.json({ error: "Failed to delete dev rule" }, 500);
  }
});

export default devRules;
