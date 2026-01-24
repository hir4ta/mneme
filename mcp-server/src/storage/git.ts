import { execSync } from "node:child_process";

function execGitCommand(command: string): string | null {
  try {
    return execSync(command, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

export function getCurrentBranch(): string | null {
  return execGitCommand("git rev-parse --abbrev-ref HEAD");
}

export function getGitUserName(): string | null {
  return execGitCommand("git config user.name");
}

export function getGitUserEmail(): string | null {
  return execGitCommand("git config user.email");
}

export interface GitUser {
  name: string;
  email: string;
}

export function getGitUser(): GitUser | null {
  const name = getGitUserName();
  const email = getGitUserEmail();

  if (!name || !email) {
    return null;
  }

  return { name, email };
}
