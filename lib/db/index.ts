import { execSync } from "node:child_process";

export interface Interaction {
  id?: number;
  session_id: string;
  project_path: string;
  repository?: string | null;
  repository_url?: string | null;
  repository_root?: string | null;
  owner: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string | null;
  tool_calls?: string | null;
  timestamp: string;
  is_compact_summary?: number;
  agent_id?: string | null;
  agent_type?: string | null;
  created_at?: string;
}

export interface PreCompactBackup {
  id?: number;
  session_id: string;
  project_path: string;
  owner: string;
  interactions: string;
  created_at?: string;
}

export interface RepositoryInfo {
  repository: string | null;
  repository_url: string | null;
  repository_root: string | null;
}

export function getCurrentUser(): string {
  try {
    return execSync("git config user.name", { encoding: "utf-8" }).trim();
  } catch {
    try {
      return execSync("whoami", { encoding: "utf-8" }).trim();
    } catch {
      return "unknown";
    }
  }
}

export function getRepositoryInfo(projectPath: string): RepositoryInfo {
  const result: RepositoryInfo = {
    repository: null,
    repository_url: null,
    repository_root: null,
  };

  try {
    execSync("git rev-parse --git-dir", {
      cwd: projectPath,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    result.repository_root = execSync("git rev-parse --show-toplevel", {
      cwd: projectPath,
      encoding: "utf-8",
    }).trim();

    try {
      result.repository_url = execSync("git remote get-url origin", {
        cwd: projectPath,
        encoding: "utf-8",
      }).trim();

      const match = result.repository_url.match(/[:/]([^/]+\/[^/]+?)(\.git)?$/);
      if (match) {
        result.repository = match[1].replace(/\.git$/, "");
      }
    } catch {
      // No remote origin
    }
  } catch {
    // Not a git repository
  }

  return result;
}

// Re-export from split modules
export {
  getLocalDbPath,
  initLocalDatabase,
  openLocalDatabase,
} from "./init.js";
export {
  deleteBackups,
  deleteBackupsByProject,
  deleteInteractions,
  deleteInteractionsBefore,
  deleteInteractionsByProject,
  insertInteractions,
  insertPreCompactBackup,
} from "./mutations.js";
export {
  countInteractions,
  getAllBackups,
  getDbStats,
  getInteractions,
  getInteractionsByClaudeSessionIds,
  getInteractionsByOwner,
  getInteractionsByProject,
  getInteractionsByRepository,
  getInteractionsBySessionIds,
  getInteractionsBySessionIdsAndOwner,
  getLatestBackup,
  getUniqueProjects,
  getUniqueRepositories,
  hasInteractions,
  hasInteractionsForSessionIds,
  searchInteractions,
} from "./queries.js";
