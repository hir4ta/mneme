// lib/github.ts
function parsePRUrl(url) {
  const patterns = [
    // Standard PR URL: https://github.com/owner/repo/pull/123
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      const [, owner, repo, prNumber] = match;
      return {
        owner,
        repo,
        prNumber: Number.parseInt(prNumber, 10),
        url: `https://github.com/${owner}/${repo}/pull/${prNumber}`
      };
    }
  }
  return null;
}
async function fetchPRDiff(prSource) {
  const { owner, repo, prNumber } = prSource;
  const { execSync } = await import("node:child_process");
  try {
    const diff = execSync(`gh pr diff ${prNumber} --repo ${owner}/${repo}`, {
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024
    });
    return diff;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to fetch PR diff: ${message}`);
  }
}
async function fetchPRComments(prSource) {
  const { owner, repo, prNumber } = prSource;
  const { execSync } = await import("node:child_process");
  try {
    const reviewCommentsJson = execSync(
      `gh api repos/${owner}/${repo}/pulls/${prNumber}/comments --paginate`,
      { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 }
    );
    const reviewComments = JSON.parse(reviewCommentsJson);
    return reviewComments.map(
      (comment) => ({
        id: comment.id,
        body: comment.body,
        path: comment.path,
        line: comment.line ?? comment.original_line,
        user: { login: comment.user.login },
        createdAt: comment.created_at,
        url: comment.html_url
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to fetch PR comments: ${message}`);
  }
}
async function fetchPRIssueComments(prSource) {
  const { owner, repo, prNumber } = prSource;
  const { execSync } = await import("node:child_process");
  try {
    const issueCommentsJson = execSync(
      `gh api repos/${owner}/${repo}/issues/${prNumber}/comments --paginate`,
      { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 }
    );
    const issueComments = JSON.parse(issueCommentsJson);
    return issueComments.map(
      (comment) => ({
        id: comment.id,
        body: comment.body,
        path: "",
        line: null,
        user: { login: comment.user.login },
        createdAt: comment.created_at,
        url: comment.html_url
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to fetch PR issue comments: ${message}`);
  }
}
async function fetchAllPRComments(prSource) {
  const [reviewComments, issueComments] = await Promise.all([
    fetchPRComments(prSource),
    fetchPRIssueComments(prSource)
  ]);
  return [...reviewComments, ...issueComments];
}
async function fetchPRMetadata(prSource) {
  const { owner, repo, prNumber } = prSource;
  const { execSync } = await import("node:child_process");
  try {
    const prJson = execSync(
      `gh pr view ${prNumber} --repo ${owner}/${repo} --json title,body,state,author,createdAt,mergedAt`,
      { encoding: "utf-8" }
    );
    const pr = JSON.parse(prJson);
    return {
      title: pr.title,
      body: pr.body || "",
      state: pr.state,
      author: pr.author.login,
      createdAt: pr.createdAt,
      mergedAt: pr.mergedAt
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to fetch PR metadata: ${message}`);
  }
}
export {
  fetchAllPRComments,
  fetchPRComments,
  fetchPRDiff,
  fetchPRIssueComments,
  fetchPRMetadata,
  parsePRUrl
};
