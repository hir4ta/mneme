import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export async function getGitInfo(projectPath: string): Promise<{
  owner: string;
  repository: string;
  repositoryUrl: string;
  repositoryRoot: string;
}> {
  let owner = "unknown";
  let repository = "";
  let repositoryUrl = "";
  let repositoryRoot = "";

  try {
    const { execSync } = await import("node:child_process");

    owner =
      execSync("git config user.name", {
        encoding: "utf8",
        cwd: projectPath,
        stdio: ["pipe", "pipe", "pipe"],
      }).trim() || owner;

    repositoryRoot =
      execSync("git rev-parse --show-toplevel", {
        encoding: "utf8",
        cwd: projectPath,
        stdio: ["pipe", "pipe", "pipe"],
      }).trim() || "";

    repositoryUrl =
      execSync("git remote get-url origin", {
        encoding: "utf8",
        cwd: projectPath,
        stdio: ["pipe", "pipe", "pipe"],
      }).trim() || "";

    const match = repositoryUrl.match(/[:/]([^/]+\/[^/]+?)(\.git)?$/);
    if (match) {
      repository = match[1].replace(/\.git$/, "");
    }
  } catch {
    try {
      owner = os.userInfo().username || owner;
    } catch {
      // keep default
    }
  }

  return { owner, repository, repositoryUrl, repositoryRoot };
}

export function resolveMnemeSessionId(
  projectPath: string,
  claudeSessionId: string,
): string {
  const shortId = claudeSessionId.slice(0, 8);
  const sessionLinkPath = path.join(
    projectPath,
    ".mneme",
    "session-links",
    `${shortId}.json`,
  );

  if (fs.existsSync(sessionLinkPath)) {
    try {
      const link = JSON.parse(fs.readFileSync(sessionLinkPath, "utf8"));
      if (link.masterSessionId) {
        return link.masterSessionId;
      }
    } catch {
      // Ignore parse errors
    }
  }

  return shortId;
}

export function findSessionFileById(
  projectPath: string,
  mnemeSessionId: string,
): string | null {
  const sessionsDir = path.join(projectPath, ".mneme", "sessions");
  const searchDir = (dir: string): string | null => {
    if (!fs.existsSync(dir)) return null;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const result = searchDir(fullPath);
        if (result) return result;
      } else if (entry.name === `${mnemeSessionId}.json`) {
        return fullPath;
      }
    }
    return null;
  };
  return searchDir(sessionsDir);
}

export function hasSessionSummary(sessionFile: string | null): boolean {
  if (!sessionFile) return false;
  try {
    const session = JSON.parse(fs.readFileSync(sessionFile, "utf8"));
    return !!session.summary;
  } catch {
    return false;
  }
}
