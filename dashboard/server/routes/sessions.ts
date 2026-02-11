import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import {
  countInteractions,
  deleteBackups,
  deleteInteractions,
  getInteractionsByClaudeSessionIds,
  getInteractionsBySessionIds,
  openLocalDatabase,
} from "../../../lib/db.js";
import {
  readAllSessionIndexes,
  readRecentSessionIndexes,
  rebuildSessionIndexForMonth,
} from "../../../lib/index/manager.js";
import {
  findJsonFileById,
  getMnemeDir,
  getProjectRoot,
  listDatedJsonFiles,
  safeParseJsonFile,
  sanitizeId,
  toShortId,
  writeAuditLog,
} from "../lib/helpers.js";
import { paginateArray, parsePaginationParams } from "../lib/pagination.js";

const sessions = new Hono();

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

// Delete a single session
sessions.delete("/:id", async (c) => {
  const id = toShortId(sanitizeId(c.req.param("id")));
  const dryRun = c.req.query("dry-run") === "true";
  const mnemeDir = getMnemeDir();
  const sessionsDir = path.join(mnemeDir, "sessions");

  try {
    const filePath = findJsonFileById(sessionsDir, id);
    if (!filePath) {
      return c.json({ error: "Session not found" }, 404);
    }

    const sessionData = safeParseJsonFile<{
      context?: { projectDir?: string };
      createdAt?: string;
    }>(filePath);

    const db = openLocalDatabase(getProjectRoot());
    let interactionCount = 0;
    if (db) {
      interactionCount = countInteractions(db, { sessionId: id });
      if (!dryRun) {
        deleteInteractions(db, id);
        deleteBackups(db, id);
      }
      db.close();
    }

    if (!dryRun) {
      fs.unlinkSync(filePath);

      const mdPath = filePath.replace(/\.json$/, ".md");
      if (fs.existsSync(mdPath)) {
        fs.unlinkSync(mdPath);
      }

      const sessionLinksDir = path.join(mnemeDir, "session-links");
      const linkPath = path.join(sessionLinksDir, `${id}.json`);
      if (fs.existsSync(linkPath)) {
        fs.unlinkSync(linkPath);
      }

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

// Bulk delete sessions
sessions.delete("/", async (c) => {
  const dryRun = c.req.query("dry-run") === "true";
  const projectFilter = c.req.query("project");
  const repositoryFilter = c.req.query("repository");
  const beforeFilter = c.req.query("before");

  const mnemeDir = getMnemeDir();
  const sessionsDir = path.join(mnemeDir, "sessions");

  try {
    const files = listDatedJsonFiles(sessionsDir);
    const sessionsToDelete: { id: string; path: string }[] = [];

    for (const filePath of files) {
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        const session = JSON.parse(content);

        let shouldDelete = true;

        if (projectFilter) {
          const sessionProject = session.context?.projectDir;
          if (sessionProject !== projectFilter) {
            shouldDelete = false;
          }
        }

        if (repositoryFilter && shouldDelete) {
          const sessionRepo = session.context?.repository;
          if (sessionRepo !== repositoryFilter) {
            shouldDelete = false;
          }
        }

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

    let totalInteractions = 0;
    const db = openLocalDatabase(getProjectRoot());
    if (db) {
      for (const session of sessionsToDelete) {
        totalInteractions += countInteractions(db, { sessionId: session.id });
      }

      if (!dryRun) {
        for (const session of sessionsToDelete) {
          deleteInteractions(db, session.id);
          deleteBackups(db, session.id);
        }
      }
      db.close();
    }

    if (!dryRun) {
      for (const session of sessionsToDelete) {
        fs.unlinkSync(session.path);

        const mdPath = session.path.replace(/\.json$/, ".md");
        if (fs.existsSync(mdPath)) {
          fs.unlinkSync(mdPath);
        }

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

// Session Interactions API (from local SQLite)
sessions.get("/:id/interactions", async (c) => {
  const rawId = sanitizeId(c.req.param("id"));
  const shortId = toShortId(rawId);
  const mnemeDir = getMnemeDir();
  const sessionLinksDir = path.join(mnemeDir, "session-links");
  const sessionsDir = path.join(mnemeDir, "sessions");

  try {
    const sessionFilePath = findJsonFileById(sessionsDir, shortId);
    let projectDir = getProjectRoot();
    let primaryClaudeSessionId: string | null = null;

    // If a full UUID was passed in the URL, use it directly
    if (rawId.length === 36 && rawId[8] === "-") {
      primaryClaudeSessionId = rawId;
    }

    if (sessionFilePath) {
      const sessionData = safeParseJsonFile<{
        sessionId?: string;
        context?: { projectDir?: string };
      }>(sessionFilePath);
      if (sessionData?.context?.projectDir) {
        projectDir = sessionData.context.projectDir;
      }
      if (sessionData?.sessionId && !primaryClaudeSessionId) {
        primaryClaudeSessionId = sessionData.sessionId;
      }
    }

    const db = openLocalDatabase(projectDir);
    if (!db) {
      return c.json({ interactions: [], count: 0 });
    }

    let masterId = shortId;
    const myLinkFile = path.join(sessionLinksDir, `${shortId}.json`);
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

    const sessionIds: string[] = [masterId];
    // Collect full UUIDs for precise matching
    const claudeSessionIds: string[] = [];
    if (primaryClaudeSessionId) {
      claudeSessionIds.push(primaryClaudeSessionId);
    }

    if (masterId !== shortId) {
      sessionIds.push(shortId);
    }

    if (fs.existsSync(sessionLinksDir)) {
      const linkFiles = fs.readdirSync(sessionLinksDir);
      for (const linkFile of linkFiles) {
        if (!linkFile.endsWith(".json")) continue;
        const linkPath = path.join(sessionLinksDir, linkFile);
        try {
          const linkData = JSON.parse(fs.readFileSync(linkPath, "utf-8"));
          if (linkData.masterSessionId === masterId) {
            const childId = linkFile.replace(".json", "");
            if (!sessionIds.includes(childId)) {
              sessionIds.push(childId);
            }
            // Collect child's full UUID from its session file
            const childSessionFile = findJsonFileById(sessionsDir, childId);
            if (childSessionFile) {
              const childData = safeParseJsonFile<{ sessionId?: string }>(
                childSessionFile,
              );
              if (childData?.sessionId) {
                claudeSessionIds.push(childData.sessionId);
              }
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
          if (sessionData.sessionId) {
            claudeSessionIds.push(sessionData.sessionId);
          }
        }
      } catch {
        // Skip invalid session files
      }
    }

    // Prefer claude_session_id (full UUID) matching for precision.
    // Falls back to session_id (8-char) only when no UUIDs available.
    const interactions =
      claudeSessionIds.length > 0
        ? getInteractionsByClaudeSessionIds(db, claudeSessionIds)
        : getInteractionsBySessionIds(db, sessionIds);
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
      prompt?: string;
      agentId?: string;
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
      inPlanMode?: boolean;
      slashCommand?: string;
      toolResults?: ToolResultMeta[];
      progressEvents?: ProgressEvent[];
    }> = [];

    let currentInteraction: (typeof groupedInteractions)[number] | null = null;

    for (const interaction of interactions) {
      if (interaction.role === "user") {
        if (currentInteraction) {
          groupedInteractions.push(currentInteraction);
        }

        // Parse metadata from tool_calls column
        let hasPlanMode: boolean | undefined;
        let planTools: Array<{ name: string; count: number }> | undefined;
        let toolsUsed: string[] | undefined;
        let toolDetails: ToolDetail[] | undefined;
        let inPlanMode: boolean | undefined;
        let slashCommand: string | undefined;
        let toolResults: ToolResultMeta[] | undefined;
        let progressEvents: ProgressEvent[] | undefined;

        if (interaction.tool_calls) {
          try {
            const metadata = JSON.parse(interaction.tool_calls);
            if (metadata.hasPlanMode) {
              hasPlanMode = true;
              planTools = metadata.planTools || [];
            }
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

export default sessions;
