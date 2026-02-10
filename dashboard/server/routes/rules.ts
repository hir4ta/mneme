import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import {
  ALLOWED_RULE_FILES,
  rulesDir,
  safeParseJsonFile,
  sanitizeId,
  writeAuditLog,
} from "../lib/helpers.js";

const rules = new Hono();

// Get rules by type
rules.get("/:id", async (c) => {
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
    const rulesData = safeParseJsonFile(filePath);
    if (!rulesData) {
      return c.json({ error: "Failed to parse rules" }, 500);
    }
    return c.json(rulesData);
  } catch (error) {
    console.error("Failed to read rules:", error);
    return c.json({ error: "Failed to read rules" }, 500);
  }
});

// Update rules
rules.put("/:id", async (c) => {
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
    const body = await c.req.json();
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

// Delete single rule item
rules.delete("/:id/:ruleId", async (c) => {
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

export default rules;
