---
name: review
description: Code review based on repository-specific rules (`dev-rules.json` / `review-guidelines.json`).
---

# /memoria:review

Code review based on repository-specific rules (`dev-rules.json` / `review-guidelines.json`).

## Usage

```
/memoria:review           # Default: --staged (Stage 2 only)
/memoria:review --staged  # Review staged changes
/memoria:review --all     # Review all changes
/memoria:review --diff=main  # Review diff against branch
/memoria:review --full    # Two-stage review (Stage 1: Spec + Stage 2: Code)
/memoria:review https://github.com/owner/repo/pull/123  # Review GitHub PR
```

### Default Behavior

- **`--staged` is default**
- If staged is empty, suggest `--all` / `--diff=branch`

### PR URL Review

When a GitHub PR URL is provided:
1. Parse URL to extract owner, repo, and PR number
2. Fetch PR diff using `gh pr diff {number} --repo {owner}/{repo}`
3. Apply the same rule-based review as local diffs
4. Save result with `target.type: "pr"` and `target.prSource`

### Two-Stage Review (--full)

When `--full` is specified, perform two-stage review:

**Stage 1: Spec Compliance** (blocks if fails)
- Check implementation against plan/design documents
- Verify all planned tasks were implemented
- Confirm architecture matches design
- Must pass before Stage 2

**Stage 2: Code Quality** (standard review)
- Apply dev-rules.json / review-guidelines.json
- Check language/framework best practices
- Generate findings

## Execution Steps

### PR URL Detection

Before processing flags, check if the argument is a GitHub PR URL:
```
Pattern: https://github.com/{owner}/{repo}/pull/{number}
```

If PR URL detected:
1. Parse URL → `{ owner, repo, prNumber, url }`
2. Fetch diff: `gh pr diff {prNumber} --repo {owner}/{repo}`
3. Skip to step 2 (Load rules)
4. Save result with PR-specific target format

### Standard Review (default)

1. **Get target diff**
   - `--staged`: `git diff --staged`
   - `--all`: `git diff`
   - `--diff=branch`: `git diff <branch>...HEAD`
   - PR URL: `gh pr diff {number} --repo {owner}/{repo}`
2. **Load rules**
   - `.memoria/rules/dev-rules.json`
   - `.memoria/rules/review-guidelines.json`
3. **Filter applicable rules**
   - Only `status: active`
   - Filter by `scope / tags / appliesTo / exceptions`
4. **Generate findings**
   - Extract where rules match the diff
   - Determine severity from `priority`
5. **Output review**
   - Structure: Blocker / Warning / Suggestion
6. **Save review result**
   - `.memoria/reviews/YYYY/MM/review-YYYY-MM-DD_HHMMSS.json`

### Two-Stage Review (--full)

#### Stage 1: Spec Compliance

1. **Find plan/design documents**
   ```
   Search for recent files:
   - docs/plans/*-tasks.md
   - docs/plans/*-design.md
   ```

2. **Extract planned items**
   - Parse task list from tasks.md
   - Extract architecture/components from design.md

3. **Verify implementation**
   - Check each planned task has corresponding code
   - Verify architecture matches design
   - Confirm all components exist

4. **Generate Stage 1 findings**
   ```markdown
   ## Stage 1: Spec Compliance

   **Plan file:** docs/plans/2026-01-27-feature-tasks.md
   **Design file:** docs/plans/2026-01-27-feature-design.md

   ### Status: PASS / FAIL

   ### Findings
   - [MISSING] Task 3 not implemented
   - [MISMATCH] Component X uses different architecture than planned
   ```

5. **Block if Stage 1 fails**
   - If any MISSING or MISMATCH findings, stop review
   - User must fix before Stage 2

#### Stage 2: Code Quality

(Standard review steps 2-6)

## Additional Review Perspectives (Required)

### Document-Code Consistency

- Verify changes match **all documentation**
- If spec documents exist, **always reference**:
  - Files/dirs containing `spec` / `requirements` / `design` / `architecture` / `adr` / `decision` / `workflow` / `contract`
  - Common doc locations: `docs/`, `documentation/`, `design/`, `spec/`, `requirements/`
  - Root docs: `README*`, `DEVELOPER*`, `ARCHITECTURE*`, `CONTRIBUTING*`, `SPEC*`, `ADR*`
  - If not found, **ask user for location** before proceeding

### Language/Framework Best Practices

- Check against language/framework conventions for changed files
- When uncertain, **research official docs** and cite source
  - e.g., React / TypeScript / Hono / Node official docs
  - Mark as **"needs investigation"** if uncertain

## Rule Application Guidelines

### scope Determination (from path)

- `dashboard/` → `dashboard`
- `hooks/` → `hooks`
- `skills/` → `skills`
- `dashboard/server/` → `server`
- `config`/`env`/`tsconfig`/`vite.config` → `config`
- Other → `general`

### tags Assignment (from path or diff content)

- `ui` (dashboard/react/css)
- `api` (server/api)
- `quality` (lint/test/build)
- `security` (auth/secret/token)
- `docs` (README/docs/*.md)
- `release` (version/changelog)

### appliesTo / exceptions Handling

- If `appliesTo` exists, apply only when **scope/tags/path** matches
- If `exceptions` matches, **exclude**

### tokens Handling

- If `tokens` exists, only target those appearing in diff
- If not appearing, **skip to avoid noise**

## Severity Mapping

| priority | severity |
|----------|----------|
| p0 | Blocker |
| p1 | Warning |
| p2 | Suggestion |

## Output Format (Markdown)

```
# Review: {target}

## Summary
- Blocker: N
- Warning: N
- Suggestion: N
- Matched rules: X (of Y)
- New rule proposals: Z

## Findings

### Blocker
1. {short title}
   - File: path/to/file.ts:123
   - Evidence: {diff snippet}
   - Rule: {rule.id} / {rule.text}
   - Rationale: {rule.rationale}

### Warning
...

### Suggestion
...

## Rule Coverage
- Applied: {rule ids}
- Skipped (scope mismatch): {rule ids}

## Rule Proposals
- {proposal} (source: {which finding triggered this})

## Stale Rules
- {rule.id} (lastSeenAt: YYYY-MM-DD)
```

## Review JSON Format

Save to `.memoria/reviews/YYYY/MM/review-YYYY-MM-DD_HHMMSS.json`:

```json
{
  "id": "review-2026-01-25_145500",
  "createdAt": "2026-01-25T14:55:00Z",
  "target": {
    "type": "staged",  // or "pr" for GitHub PRs
    "branch": "main"
  },
  "summary": {
    "blocker": 1,
    "warning": 2,
    "suggestion": 3,
    "matchedRules": 4,
    "totalRules": 10,
    "newRuleProposals": 1
  },
  "findings": [
    {
      "id": "finding-001",
      "severity": "blocker",
      "title": "Hardcoded production secret",
      "ruleId": "review-2026-01-24_abc123-0",
      "ruleText": "Secrets should be in environment variables",
      "rationale": "Avoid leak risk",
      "file": "src/config.ts",
      "line": 42,
      "evidence": "API_KEY = \"xxx\""
    }
  ],
  "coverage": {
    "appliedRuleIds": ["review-2026-01-24_abc123-0"],
    "skippedRuleIds": ["dev-2026-01-20_def456-1"]
  },
  "proposals": [
    {
      "text": "API client must always set timeout",
      "fromFindingIds": ["finding-002"]
    }
  ],
  "staleRules": [
    { "id": "dev-2025-12-01_aaa111-0", "lastSeenAt": "2025-12-05T00:00:00Z" }
  ],
  "context": {
    "projectDir": "/path/to/project",
    "branch": "main"
  }
}
```

### PR Review Target Format

When reviewing a GitHub PR, use this target format:

```json
{
  "target": {
    "type": "pr",
    "prSource": {
      "owner": "owner",
      "repo": "repo",
      "prNumber": 123,
      "url": "https://github.com/owner/repo/pull/123"
    }
  }
}
```

### Updating Rule Effectiveness

When rules are applied during review:
1. Increment `appliedCount` for each matched rule
2. After user feedback (accepted/rejected), update `acceptedCount`
3. Update `lastAppliedAt` timestamp

## Two-Stage Review JSON Format (--full)

Extended format for `--full` reviews:

```json
{
  "id": "review-2026-01-27_103000",
  "createdAt": "2026-01-27T10:30:00Z",
  "mode": "full",
  "target": {
    "type": "staged",
    "branch": "feature/auth"
  },

  "specCompliance": {
    "planFile": "docs/plans/2026-01-27-auth-tasks.md",
    "designFile": "docs/plans/2026-01-27-auth-design.md",
    "status": "pass",
    "findings": [
      {
        "type": "missing",
        "description": "Task 3: Add refresh token endpoint - not implemented",
        "planReference": "### Task 3: Add refresh token endpoint"
      },
      {
        "type": "mismatch",
        "description": "JWT storage uses localStorage instead of httpOnly cookie",
        "planReference": "## Security: Store tokens in httpOnly cookies",
        "actualImplementation": "src/auth/storage.ts:15 - localStorage.setItem('token', ...)"
      }
    ]
  },

  "codeQuality": {
    "summary": {
      "blocker": 0,
      "warning": 1,
      "suggestion": 2
    },
    "findings": [
      {
        "id": "finding-001",
        "severity": "warning",
        "title": "Missing error handling",
        "ruleId": "dev-error-handling-001",
        "file": "src/auth/jwt.ts",
        "line": 42
      }
    ]
  },

  "coverage": {
    "appliedRuleIds": ["dev-error-handling-001"],
    "skippedRuleIds": []
  },
  "proposals": [],
  "staleRules": [],
  "context": {
    "projectDir": "/path/to/project",
    "branch": "feature/auth"
  }
}
```

### specCompliance Fields

| Field | Type | Description |
|-------|------|-------------|
| planFile | string | Path to tasks.md used for verification |
| designFile | string | Path to design.md used for verification |
| status | `"pass"\|"fail"` | Whether spec compliance passed |
| findings | array | List of compliance issues |

### specCompliance Finding Types

| Type | Description |
|------|-------------|
| `missing` | Planned item not implemented |
| `mismatch` | Implementation differs from design |
| `incomplete` | Partially implemented |

## Recording Review in Session

**Note:** Review interactions are auto-saved by SessionEnd hook.

Review results are saved to `.memoria/reviews/` directory (separate from session files).

If significant decisions were made during review (e.g., architectural changes), capture them via `/memoria:save`:

```yaml
discussions:
  - topic: "Code review findings"
    timestamp: "[ISO8601]"
    decision: "[Key decision from review]"
    reasoning: "[Why this change was required]"

references:
  - type: review
    path: ".memoria/reviews/YYYY/MM/review-YYYY-MM-DD_HHMMSS.json"
    description: "Review result"
```
