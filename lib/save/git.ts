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
  const sessionLinksDir = path.join(projectPath, ".mneme", "session-links");

  // Try full UUID first, then fallback to 8-char for old sessions
  const fullPath = path.join(sessionLinksDir, `${claudeSessionId}.json`);
  const shortPath = path.join(
    sessionLinksDir,
    `${claudeSessionId.slice(0, 8)}.json`,
  );

  const sessionLinkPath = fs.existsSync(fullPath) ? fullPath : shortPath;

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

  return claudeSessionId;
}

export function findSessionFileById(
  projectPath: string,
  mnemeSessionId: string,
): string | null {
  const sessionsDir = path.join(projectPath, ".mneme", "sessions");
  const searchDirFor = (dir: string, fileName: string): string | null => {
    if (!fs.existsSync(dir)) return null;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const result = searchDirFor(fullPath, fileName);
        if (result) return result;
      } else if (entry.name === fileName) {
        return fullPath;
      }
    }
    return null;
  };
  // Try full ID first, then fallback to 8-char for old sessions
  const result = searchDirFor(sessionsDir, `${mnemeSessionId}.json`);
  if (result) return result;
  if (mnemeSessionId.length > 8) {
    return searchDirFor(sessionsDir, `${mnemeSessionId.slice(0, 8)}.json`);
  }
  return null;
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
