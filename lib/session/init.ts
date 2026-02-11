#!/usr/bin/env node

import * as fs from "node:fs";
import * as path from "node:path";

import { getRepositoryInfo } from "../db/index.ts";
import {
  ensureDir,
  findJsonFiles,
  nowISO,
  safeReadJson,
  safeWriteJson,
} from "../utils.ts";
import {
  getGitInfo,
  getRecentSessions,
  initDatabase,
  initRulesFile,
  initTags,
} from "./helpers.ts";

export {
  getGitInfo,
  getRecentSessions,
  initDatabase,
  initRulesFile,
  initTags,
} from "./helpers.ts";

interface SessionJson {
  id: string;
  sessionId: string;
  createdAt: string;
  title: string;
  tags: string[];
  context: Record<string, unknown>;
  metrics: {
    userMessages: number;
    assistantResponses: number;
    thinkingBlocks: number;
    toolUsage: string[];
  };
  files: string[];
  status: null;
  resumedAt?: string;
  summary?: unknown;
  workPeriods?: WorkPeriod[];
  updatedAt?: string;
}

interface WorkPeriod {
  claudeSessionId: string;
  startedAt: string;
  endedAt: string | null;
}

interface SessionLink {
  masterSessionId: string;
  claudeSessionId: string;
  linkedAt: string;
}

interface InitResult {
  additionalContext: string;
}

function sessionInit(sessionId: string, cwd: string): InitResult {
  const pluginRoot = path.resolve(__dirname, "..", "..");
  const mnemeDir = path.join(cwd, ".mneme");
  const sessionsDir = path.join(mnemeDir, "sessions");
  const rulesDir = path.join(mnemeDir, "rules");
  const sessionLinksDir = path.join(mnemeDir, "session-links");

  if (!fs.existsSync(mnemeDir)) {
    console.error(
      "[mneme] Not initialized in this project. Run: npx @hir4ta/mneme --init",
    );
    return { additionalContext: "" };
  }

  const now = nowISO();
  const sessionShortId = sessionId ? sessionId.substring(0, 8) : "";
  const fileId = sessionShortId;

  const git = getGitInfo(cwd);
  const repoInfo = getRepositoryInfo(cwd);
  const projectName = path.basename(cwd);

  let masterSessionId = "";
  let masterSessionPath = "";
  const sessionLinkFile = path.join(sessionLinksDir, `${fileId}.json`);

  if (fs.existsSync(sessionLinkFile)) {
    const link = safeReadJson<SessionLink>(sessionLinkFile, {
      masterSessionId: "",
      claudeSessionId: "",
      linkedAt: "",
    });
    if (link.masterSessionId) {
      masterSessionId = link.masterSessionId;
      const allFiles = findJsonFiles(sessionsDir);
      masterSessionPath =
        allFiles.find((f) => path.basename(f) === `${masterSessionId}.json`) ||
        "";
      if (masterSessionPath) {
        console.error(`[mneme] Session linked to master: ${masterSessionId}`);
      }
    }
  }

  let sessionPath = "";
  let isResumed = false;

  if (fs.existsSync(sessionsDir)) {
    const allFiles = findJsonFiles(sessionsDir);
    const existing = allFiles.find(
      (f) => path.basename(f) === `${fileId}.json`,
    );
    if (existing) {
      sessionPath = existing;
      isResumed = true;
    }
  }

  if (!sessionPath) {
    const dateParts = now.split("T")[0].split("-");
    const yearMonth = path.join(sessionsDir, dateParts[0], dateParts[1]);
    ensureDir(yearMonth);
    sessionPath = path.join(yearMonth, `${fileId}.json`);
  }

  let recentSessions: ReturnType<typeof getRecentSessions> = [];
  if (!isResumed) {
    recentSessions = getRecentSessions(sessionsDir, fileId, 3);
  }

  if (isResumed) {
    const data = safeReadJson<SessionJson>(sessionPath, {} as SessionJson);
    data.status = null;
    data.resumedAt = now;
    safeWriteJson(sessionPath, data);
    console.error(`[mneme] Session resumed (status reset): ${sessionPath}`);
  } else {
    const context: Record<string, unknown> = {
      projectDir: cwd,
      projectName,
    };
    if (git.branch) context.branch = git.branch;
    if (repoInfo.repository) context.repository = repoInfo.repository;
    const user: Record<string, string> = { name: git.userName };
    if (git.userEmail) user.email = git.userEmail;
    context.user = user;

    const sessionJson: SessionJson = {
      id: fileId,
      sessionId: sessionId || sessionShortId,
      createdAt: now,
      title: "",
      tags: [],
      context,
      metrics: {
        userMessages: 0,
        assistantResponses: 0,
        thinkingBlocks: 0,
        toolUsage: [],
      },
      files: [],
      status: null,
    };
    safeWriteJson(sessionPath, sessionJson);
    console.error(`[mneme] Session initialized: ${sessionPath}`);
  }

  if (
    masterSessionId &&
    masterSessionPath &&
    fs.existsSync(masterSessionPath)
  ) {
    const claudeSessionId = sessionId || sessionShortId;
    const master = safeReadJson<SessionJson>(
      masterSessionPath,
      {} as SessionJson,
    );
    const workPeriods: WorkPeriod[] = master.workPeriods || [];
    const existingPeriod = workPeriods.some(
      (wp) => wp.claudeSessionId === claudeSessionId && wp.endedAt === null,
    );

    if (!existingPeriod) {
      workPeriods.push({
        claudeSessionId,
        startedAt: now,
        endedAt: null,
      });
      master.workPeriods = workPeriods;
      master.updatedAt = now;
      safeWriteJson(masterSessionPath, master);
      console.error(
        `[mneme] Master session workPeriods updated: ${masterSessionPath}`,
      );
    } else {
      console.error(
        "[mneme] Master session workPeriod already exists for this Claude session",
      );
    }
  }

  initTags(mnemeDir, pluginRoot);
  initRulesFile(path.join(rulesDir, "review-guidelines.json"));
  initRulesFile(path.join(rulesDir, "dev-rules.json"));
  initDatabase(mnemeDir, pluginRoot);

  const sessionRelativePath = sessionPath.startsWith(cwd)
    ? sessionPath.substring(cwd.length + 1)
    : sessionPath;

  const usingMnemePath = path.join(
    pluginRoot,
    "skills",
    "using-mneme",
    "SKILL.md",
  );
  const usingMnemeContent = fs.existsSync(usingMnemePath)
    ? fs.readFileSync(usingMnemePath, "utf-8")
    : "";

  const rulesSkillPath = path.join(pluginRoot, "skills", "rules", "SKILL.md");
  const rulesSkillContent = fs.existsSync(rulesSkillPath)
    ? fs.readFileSync(rulesSkillPath, "utf-8")
    : "";

  let resumeNote = "";
  let needsSummary = false;
  if (isResumed) {
    resumeNote = " (Resumed)";
    const data = safeReadJson<SessionJson>(sessionPath, {} as SessionJson);
    if (!data.title) {
      needsSummary = true;
    }
  }

  let sessionInfo = `**Session:** ${fileId}${resumeNote}
**Claude Session ID:** ${sessionId}
**Path:** ${sessionRelativePath}

Sessions are saved:
- **Automatically** before Auto-Compact (context 95% full)
- **Manually** via \`/mneme:save\` or asking "save the session"`;

  if (!isResumed && recentSessions.length > 0) {
    const lines = recentSessions.map((s, i) => {
      const datePart = s.createdAt.split("T")[0] || "";
      const title = s.title || "no title";
      const branch = s.branch || "no branch";
      return `  ${i + 1}. [${s.id}] ${title} (${datePart}, ${branch})`;
    });
    sessionInfo += `\n\n---\n**Recent sessions:**\n${lines.join("\n")}\nContinue from a previous session? Use \`/mneme:resume <id>\` or \`/mneme:resume\` to see more.`;
  }

  if (needsSummary) {
    sessionInfo += `\n\n---\n**Note:** This session was resumed but has no summary yet.
When you have enough context, consider creating a summary with \`/mneme:save\` to capture:
- What was accomplished in the previous session
- Key source knowledge (decision/pattern/rule)
- Unit regeneration needs (what should become approved units)
- Any ongoing work or next steps`;
  }

  const additionalContext = [sessionInfo, usingMnemeContent, rulesSkillContent]
    .filter(Boolean)
    .join("\n\n");

  return { additionalContext };
}

function main() {
  const args = process.argv.slice(2);
  const getArg = (name: string): string | undefined => {
    const index = args.indexOf(`--${name}`);
    return index !== -1 ? args[index + 1] : undefined;
  };

  const command = args[0];

  if (command === "init") {
    const sessionId = getArg("session-id") || "";
    const cwd = getArg("cwd") || process.cwd();

    const result = sessionInit(sessionId, cwd);
    console.log(JSON.stringify(result));
    process.exit(0);
  } else {
    console.error("Usage: session-init.js init --session-id <id> --cwd <path>");
    process.exit(1);
  }
}

const scriptPath = process.argv[1];
if (
  scriptPath &&
  (import.meta.url === `file://${scriptPath}` ||
    scriptPath.endsWith("session/init.js") ||
    scriptPath.endsWith("session/init.ts"))
) {
  main();
}
