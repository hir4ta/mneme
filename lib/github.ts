import type { PRSource } from "./schemas/index.js";

/**
 * GitHub PR comment from API
 */
export interface PRComment {
  id: number;
  body: string;
  path: string;
  line: number | null;
  user: {
    login: string;
  };
  createdAt: string;
  url: string;
}

/**
 * Parse GitHub PR URL to extract owner, repo, and PR number
 * Supports formats:
 * - https://github.com/owner/repo/pull/123
 * - https://github.com/owner/repo/pull/123/files
 * - https://github.com/owner/repo/pull/123#discussion_r123456
 */
export function parsePRUrl(url: string): PRSource | null {
  const patterns = [
    // Standard PR URL: https://github.com/owner/repo/pull/123
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      const [, owner, repo, prNumber] = match;
      return {
        owner,
        repo,
        prNumber: Number.parseInt(prNumber, 10),
        url: `https://github.com/${owner}/${repo}/pull/${prNumber}`,
      };
    }
  }

  return null;
}

/**
 * Fetch PR diff using gh CLI
 * Returns the diff content as a string
 */
export async function fetchPRDiff(prSource: PRSource): Promise<string> {
  const { owner, repo, prNumber } = prSource;
  const { execSync } = await import("node:child_process");

  try {
    const diff = execSync(`gh pr diff ${prNumber} --repo ${owner}/${repo}`, {
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
    });
    return diff;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to fetch PR diff: ${message}`);
  }
}

/**
 * Fetch PR review comments using gh CLI
 * Returns array of comments with metadata
 */
export async function fetchPRComments(
  prSource: PRSource,
): Promise<PRComment[]> {
  const { owner, repo, prNumber } = prSource;
  const { execSync } = await import("node:child_process");

  try {
    // Fetch review comments (comments on specific lines of code)
    const reviewCommentsJson = execSync(
      `gh api repos/${owner}/${repo}/pulls/${prNumber}/comments --paginate`,
      { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 },
    );

    const reviewComments = JSON.parse(reviewCommentsJson);

    // Map to our PRComment interface
    return reviewComments.map(
      (comment: {
        id: number;
        body: string;
        path: string;
        line: number | null;
        original_line: number | null;
        user: { login: string };
        created_at: string;
        html_url: string;
      }) => ({
        id: comment.id,
        body: comment.body,
        path: comment.path,
        line: comment.line ?? comment.original_line,
        user: { login: comment.user.login },
        createdAt: comment.created_at,
        url: comment.html_url,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to fetch PR comments: ${message}`);
  }
}

/**
 * Fetch PR issue comments (general PR comments, not on code lines)
 */
export async function fetchPRIssueComments(
  prSource: PRSource,
): Promise<PRComment[]> {
  const { owner, repo, prNumber } = prSource;
  const { execSync } = await import("node:child_process");

  try {
    const issueCommentsJson = execSync(
      `gh api repos/${owner}/${repo}/issues/${prNumber}/comments --paginate`,
      { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 },
    );

    const issueComments = JSON.parse(issueCommentsJson);

    return issueComments.map(
      (comment: {
        id: number;
        body: string;
        user: { login: string };
        created_at: string;
        html_url: string;
      }) => ({
        id: comment.id,
        body: comment.body,
        path: "",
        line: null,
        user: { login: comment.user.login },
        createdAt: comment.created_at,
        url: comment.html_url,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to fetch PR issue comments: ${message}`);
  }
}

/**
 * Fetch all PR comments (both review and issue comments)
 */
export async function fetchAllPRComments(
  prSource: PRSource,
): Promise<PRComment[]> {
  const [reviewComments, issueComments] = await Promise.all([
    fetchPRComments(prSource),
    fetchPRIssueComments(prSource),
  ]);

  return [...reviewComments, ...issueComments];
}

/**
 * Get PR metadata
 */
export async function fetchPRMetadata(prSource: PRSource): Promise<{
  title: string;
  body: string;
  state: string;
  author: string;
  createdAt: string;
  mergedAt: string | null;
}> {
  const { owner, repo, prNumber } = prSource;
  const { execSync } = await import("node:child_process");

  try {
    const prJson = execSync(
      `gh pr view ${prNumber} --repo ${owner}/${repo} --json title,body,state,author,createdAt,mergedAt`,
      { encoding: "utf-8" },
    );

    const pr = JSON.parse(prJson);
    return {
      title: pr.title,
      body: pr.body || "",
      state: pr.state,
      author: pr.author.login,
      createdAt: pr.createdAt,
      mergedAt: pr.mergedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to fetch PR metadata: ${message}`);
  }
}
