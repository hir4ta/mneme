---
name: harvest
description: |
  Extract knowledge from GitHub PR review comments and save to memoria's knowledge base.
  Use when: (1) a PR has valuable review feedback, (2) learning from code review discussions,
  (3) capturing team knowledge from merged PRs.
argument-hint: "<PR-URL>"
---

# /memoria:harvest

Extract knowledge from GitHub PR review comments and save to memoria's knowledge base.

## Usage

```
/memoria:harvest https://github.com/owner/repo/pull/123
```

## What Gets Extracted

PR review comments are classified and saved to appropriate locations:

| Comment Type | Destination | Example |
|--------------|-------------|---------|
| Code style/format | `rules/dev-rules.json` | "Use early return pattern" |
| Best practices | `rules/review-guidelines.json` | "Always validate user input" |
| Design discussions | `decisions/` | Architecture choices with reasoning |
| Error/fix patterns | `patterns/` | Problem-solution pairs |

## Execution Steps

### 1. Parse and Validate URL

```
Input: https://github.com/owner/repo/pull/123
Output: { owner, repo, prNumber, url }
```

If URL is invalid, show error and exit.

### 2. Fetch PR Comments

Use gh CLI to fetch all comments:

```bash
# Review comments (on specific code lines)
gh api repos/{owner}/{repo}/pulls/{prNumber}/comments --paginate

# Issue comments (general PR comments)
gh api repos/{owner}/{repo}/issues/{prNumber}/comments --paginate
```

### 3. Classify Comments

For each comment, analyze content to determine type:

**Style/Format → dev-rules.json**
- Keywords: "style", "format", "naming", "convention", "indent", "spacing"
- Pattern: Prescriptive statements about code appearance

**Best Practice → review-guidelines.json**
- Keywords: "should", "always", "never", "avoid", "prefer", "best practice"
- Pattern: General coding guidance

**Design Discussion → decisions/**
- Keywords: "architecture", "design", "approach", "tradeoff", "alternative"
- Pattern: Choices between options with reasoning

**Error/Solution → patterns/**
- Keywords: "bug", "fix", "error", "issue", "problem", "solution"
- Pattern: Problem description followed by fix

**Skip if:**
- Comment is too short (< 20 characters)
- Comment is just acknowledgment ("LGTM", "Thanks", "Done")
- Comment is a question without answer

### 4. Similarity Check

Before adding each item, check for duplicates and conflicts:

**Duplicate Detection (Jaccard similarity >= 0.9)**
```
New: "Use early return pattern to reduce nesting"
Existing: "Prefer early return to reduce code nesting"
→ DUPLICATE: Skip (similarity: 0.92)
```

**Similar Item Warning (0.7 <= similarity < 0.9)**
```
New: "Use async/await instead of callbacks"
Existing: "Prefer promises over callbacks"
→ SIMILAR: Ask user to confirm
```

**Conflict Detection**
```
New: "Always use semicolons in JavaScript"
Existing: "Never use semicolons in JavaScript"
→ CONFLICT: Ask user to resolve
```

### 5. User Confirmation

For each extracted item, present options:

```
[Extracted from PR #123 comment by @user]

Type: dev-rule
Content: "Use early return pattern to reduce nesting"

Similarity check:
- Similar to existing rule "dev-001": "Prefer early return" (0.75)

Options:
1. [Add] Add as new item
2. [Skip] Don't add
3. [Replace] Replace similar item
4. [Merge] Combine with similar item
```

### 6. Save with PR Source

All saved items include `prSource` for traceability:

```json
{
  "id": "dev-2026-01-30-001",
  "rule": "Use early return pattern to reduce nesting",
  "category": "code-style",
  "prSource": {
    "owner": "hir4ta",
    "repo": "memoria",
    "prNumber": 42,
    "url": "https://github.com/hir4ta/memoria/pull/42",
    "commentId": 123456789
  },
  "createdAt": "2026-01-30T10:00:00Z"
}
```

### 7. Output Summary

```markdown
# Harvest Summary: PR #123

**Source:** https://github.com/owner/repo/pull/123
**Comments analyzed:** 15
**Items extracted:** 8

## Added
- [dev-rule] Use early return pattern
- [dev-rule] Prefer const over let
- [pattern] Fix: undefined check before access

## Skipped (duplicate)
- "Use const" (similar to existing dev-003)

## Skipped (user choice)
- Design discussion about API structure

## Conflicts Detected
- None

## PR Source References
All items saved with prSource linking to original comments.
```

## Output Formats

### dev-rules.json Entry

```json
{
  "id": "dev-2026-01-30-001",
  "category": "code-style",
  "rule": "Use early return pattern to reduce nesting",
  "severity": "warning",
  "enabled": true,
  "createdAt": "2026-01-30T10:00:00Z",
  "prSource": {
    "owner": "owner",
    "repo": "repo",
    "prNumber": 123,
    "url": "https://github.com/owner/repo/pull/123",
    "commentId": 123456789
  }
}
```

### decisions/ Entry

```json
{
  "id": "dec-2026-01-30-001",
  "title": "Use Repository Pattern for Data Access",
  "decision": "Implement repository pattern for all database operations",
  "reasoning": "Extracted from PR review discussion about separation of concerns",
  "alternatives": [
    { "name": "Direct DB access", "reason": "Simpler but harder to test" }
  ],
  "tags": ["architecture", "database"],
  "status": "active",
  "prSource": {
    "owner": "owner",
    "repo": "repo",
    "prNumber": 123,
    "url": "https://github.com/owner/repo/pull/123"
  }
}
```

### patterns/ Entry

```json
{
  "id": "pat-2026-01-30-001",
  "type": "error-solution",
  "description": "Null check before property access",
  "errorPattern": "Cannot read property 'x' of undefined",
  "solution": "Add optional chaining or explicit null check",
  "context": "Extracted from PR review fix",
  "tags": ["javascript", "null-safety"],
  "prSource": {
    "owner": "owner",
    "repo": "repo",
    "prNumber": 123,
    "url": "https://github.com/owner/repo/pull/123",
    "commentId": 987654321
  }
}
```

## Classification Guidelines

### Identifying Comment Types

**Code Style/Format**
```
✓ "Please use camelCase for variable names"
✓ "Add a blank line between function definitions"
✓ "Indent with 2 spaces, not tabs"
✗ "This logic seems wrong" (not style)
```

**Best Practice**
```
✓ "Always validate user input before processing"
✓ "Prefer composition over inheritance"
✓ "Use meaningful variable names"
✗ "Fix the typo" (not a general practice)
```

**Design Discussion**
```
✓ "We should use event sourcing because..."
✓ "The tradeoff between X and Y is..."
✓ "I chose this approach over the alternative..."
✗ "LGTM" (not a discussion)
```

**Error/Solution Pattern**
```
✓ "This will cause a null pointer exception, use optional chaining"
✓ "The bug is because X, fix by doing Y"
✓ "This pattern causes memory leaks, use cleanup"
✗ "There's a bug here" (no solution)
```

## Error Handling

**gh CLI not available:**
```
Error: gh CLI not found. Please install GitHub CLI.
https://cli.github.com/
```

**Not authenticated:**
```
Error: Not authenticated to GitHub. Run `gh auth login`.
```

**PR not found:**
```
Error: PR #123 not found in owner/repo.
Check the URL and your access permissions.
```

**No comments:**
```
No review comments found in PR #123.
Nothing to harvest.
```
