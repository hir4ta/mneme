import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import { findJsonFileById, getMnemeDir, sanitizeId } from "../lib/helpers.js";

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

const exportRoutes = new Hono();

// Export session as markdown
exportRoutes.get("/sessions/:id/markdown", async (c) => {
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

    const filename = `session-${id}.md`;
    c.header("Content-Type", "text/markdown; charset=utf-8");
    c.header("Content-Disposition", `attachment; filename="${filename}"`);
    return c.text(markdown);
  } catch (error) {
    console.error("Failed to export session:", error);
    return c.json({ error: "Failed to export session" }, 500);
  }
});

// Export decision as markdown
exportRoutes.get("/decisions/:id/markdown", async (c) => {
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

    const filename = `decision-${id}.md`;
    c.header("Content-Type", "text/markdown; charset=utf-8");
    c.header("Content-Disposition", `attachment; filename="${filename}"`);
    return c.text(markdown);
  } catch (error) {
    console.error("Failed to export decision:", error);
    return c.json({ error: "Failed to export decision" }, 500);
  }
});

// Bulk export sessions
exportRoutes.post("/sessions/bulk", async (c) => {
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

export default exportRoutes;
