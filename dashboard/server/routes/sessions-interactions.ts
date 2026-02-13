import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import {
  getInteractionsByClaudeSessionIds,
  getInteractionsBySessionIds,
  openLocalDatabase,
} from "../../../lib/db/index.js";
import {
  findJsonFileById,
  getMnemeDir,
  getProjectRoot,
  listDatedJsonFiles,
  safeParseJsonFile,
  sanitizeId,
  toShortId,
} from "../lib/helpers.js";

type ToolDetail = {
  name: string;
  detail: string | { type: string; prompt: string } | null;
};

type ToolResultMeta = {
  toolUseId: string;
  success: boolean;
  contentLength?: number;
  lineCount?: number;
  filePath?: string;
};

type ProgressEvent = {
  type: string;
  timestamp: string;
  hookEvent?: string;
  hookName?: string;
  toolName?: string;
  prompt?: string;
  agentId?: string;
};

type GroupedInteraction = {
  id: string;
  timestamp: string;
  user: string;
  assistant: string;
  thinking: string | null;
  isCompactSummary: boolean;
  isContinuation?: boolean;
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
};

const sessionsInteractions = new Hono();

sessionsInteractions.get("/:id/interactions", async (c) => {
  const rawId = sanitizeId(c.req.param("id"));
  const shortId = toShortId(rawId);
  const mnemeDir = getMnemeDir();
  const sessionLinksDir = path.join(mnemeDir, "session-links");
  const sessionsDir = path.join(mnemeDir, "sessions");

  try {
    const sessionFilePath = findJsonFileById(sessionsDir, shortId);
    let projectDir = getProjectRoot();
    let primaryClaudeSessionId: string | null = null;

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

    const { sessionIds, claudeSessionIds } = collectLinkedSessionIds({
      shortId,
      primaryClaudeSessionId,
      sessionLinksDir,
      sessionsDir,
    });

    // Use both session_id and claude_session_id queries for complete history
    // (pre-compact interactions may have a different claude_session_id)
    const byClaudeId =
      claudeSessionIds.length > 0
        ? getInteractionsByClaudeSessionIds(db, claudeSessionIds)
        : [];
    const bySessionId = getInteractionsBySessionIds(db, sessionIds);
    db.close();

    // Merge and deduplicate by row id
    const seen = new Set<number>();
    const interactions = [];
    for (const row of [...byClaudeId, ...bySessionId]) {
      if (row.id != null && seen.has(row.id)) continue;
      if (row.id != null) seen.add(row.id);
      interactions.push(row);
    }
    interactions.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    const groupedInteractions = buildGroupedInteractions(interactions);

    return c.json({
      interactions: groupedInteractions,
      count: groupedInteractions.length,
    });
  } catch (error) {
    console.error("Failed to get session interactions:", error);
    return c.json({ error: "Failed to get session interactions" }, 500);
  }
});

function collectLinkedSessionIds(params: {
  shortId: string;
  primaryClaudeSessionId: string | null;
  sessionLinksDir: string;
  sessionsDir: string;
}): { sessionIds: string[]; claudeSessionIds: string[] } {
  const { shortId, primaryClaudeSessionId, sessionLinksDir, sessionsDir } =
    params;

  let masterId = shortId;
  // Try full UUID link file first, then short ID (link files use full UUIDs)
  const fullLinkFile = primaryClaudeSessionId
    ? path.join(sessionLinksDir, `${primaryClaudeSessionId}.json`)
    : null;
  const shortLinkFile = path.join(sessionLinksDir, `${shortId}.json`);
  const myLinkFile =
    fullLinkFile && fs.existsSync(fullLinkFile)
      ? fullLinkFile
      : fs.existsSync(shortLinkFile)
        ? shortLinkFile
        : null;
  if (myLinkFile) {
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
      if (sessionData.resumedFrom === masterId && sessionData.id !== masterId) {
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

  return { sessionIds, claudeSessionIds };
}

function buildGroupedInteractions(
  interactions: Array<{
    role: string;
    content: string;
    thinking?: string | null;
    tool_calls?: string | null;
    timestamp: string;
    is_compact_summary?: number | null;
    agent_id?: string | null;
    agent_type?: string | null;
  }>,
): GroupedInteraction[] {
  const grouped: GroupedInteraction[] = [];
  let current: GroupedInteraction | null = null;

  for (const interaction of interactions) {
    if (interaction.role === "user") {
      if (current) {
        grouped.push(current);
      }

      const meta = parseInteractionMetadata(interaction.tool_calls);

      current = {
        id: `int-${String(grouped.length + 1).padStart(3, "0")}`,
        timestamp: interaction.timestamp,
        user: interaction.content,
        assistant: "",
        thinking: null,
        isCompactSummary: !!interaction.is_compact_summary,
        ...meta,
        ...(interaction.agent_id && { agentId: interaction.agent_id }),
        ...(interaction.agent_type && { agentType: interaction.agent_type }),
      };
    } else if (interaction.role === "assistant") {
      if (current) {
        current.assistant = interaction.content;
        current.thinking = interaction.thinking || null;
      } else {
        // Orphaned assistant row (isContinuation: user row was skipped)
        const meta = parseInteractionMetadata(interaction.tool_calls);
        current = {
          id: `int-${String(grouped.length + 1).padStart(3, "0")}`,
          timestamp: interaction.timestamp,
          user: "",
          assistant: interaction.content,
          thinking: interaction.thinking || null,
          isCompactSummary: !!interaction.is_compact_summary,
          isContinuation: true,
          ...meta,
          ...(interaction.agent_id && { agentId: interaction.agent_id }),
          ...(interaction.agent_type && { agentType: interaction.agent_type }),
        };
      }
    }
  }

  if (current) {
    grouped.push(current);
  }

  return grouped;
}

function parseInteractionMetadata(
  toolCalls: string | null | undefined,
): Partial<GroupedInteraction> {
  if (!toolCalls) return {};

  try {
    const metadata = JSON.parse(toolCalls);
    const result: Partial<GroupedInteraction> = {};

    if (metadata.hasPlanMode) {
      result.hasPlanMode = true;
      if (metadata.planTools?.length > 0) result.planTools = metadata.planTools;
    }
    if (metadata.inPlanMode) result.inPlanMode = true;
    if (metadata.toolsUsed?.length > 0) result.toolsUsed = metadata.toolsUsed;
    if (metadata.toolDetails?.length > 0)
      result.toolDetails = metadata.toolDetails;
    if (metadata.isContinuation) result.isContinuation = true;
    if (metadata.slashCommand) result.slashCommand = metadata.slashCommand;
    if (metadata.toolResults?.length > 0)
      result.toolResults = metadata.toolResults;
    if (metadata.progressEvents?.length > 0)
      result.progressEvents = metadata.progressEvents;

    return result;
  } catch {
    return {};
  }
}

export default sessionsInteractions;
