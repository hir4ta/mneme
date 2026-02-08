---
name: review
description: |
  Code review based on approved units in .mneme/units/units.json.
  Use when: (1) reviewing staged changes before commit, (2) reviewing a GitHub PR,
  (3) checking code quality against team standards.
argument-hint: "[--staged|--all|--diff=branch|PR-URL]"
---

# /mneme:review

Code review based on approved units.

## Required constraints

<required>
- Use `.mneme/units/units.json` only with `status: "approved"`.
- If approved units are zero, fail fast.
- Every finding must cite applied unit ID and rationale.
</required>

## Usage

```
/mneme:review
/mneme:review --staged
/mneme:review --all
/mneme:review --diff=main
/mneme:review --full
/mneme:review https://github.com/owner/repo/pull/123
```

## Default behavior

- `--staged` is default.
- If staged diff is empty, suggest `--all` or `--diff=branch`.

## Core flow

1. Get diff target.
2. Load approved units (required):
   - `.mneme/units/units.json`
   - Use only `status: "approved"`.
3. Fail fast if approved units are zero:
   - `No approved units found. Generate and approve units first.`
4. Match units to diff by tags/title/summary and changed paths.
   - Required MCP:
     - `mcp__mneme-db__mneme_unit_apply_suggest_for_diff` (top candidates)
     - `mcp__mneme-db__mneme_unit_apply_explain_match` (for cited units)
5. Generate findings: Blocker / Warning / Suggestion.
6. Save review result to `.mneme/reviews/YYYY/MM/review-YYYY-MM-DD_HHMMSS.json`.

## Two-stage review (`--full`)

### Stage 1: Spec compliance

- Check implementation against `docs/plans/*-design.md` and `*-tasks.md`.
- If mismatch/missing exists, stop before Stage 2.

### Stage 2: Code quality

- Apply approved units only.

## PR URL flow

If target is GitHub PR:
1. Parse URL
2. `gh pr diff {number} --repo {owner}/{repo}`
3. Apply same unit-based review

## Output format

```markdown
# Review: {target}

## Summary
- Blocker: N
- Warning: N
- Suggestion: N
- Matched units: X (of Y approved)

## Findings

### Blocker
1. {title}
   - File: path/to/file.ts:123
   - Evidence: {diff snippet}
   - Unit: {unit.id} / {unit.title}
   - Unit source: {unit.sourceType}:{unit.sourceId}
   - Rationale: {unit.summary}

### Warning
...

### Suggestion
...

## Unit Coverage
- Applied: {unit ids}
- Skipped: {unit ids}
```

## Additional checks (required)

- Document-code consistency (`README*`, `DEVELOPER*`, `docs/`, `ADR*`, etc.)
- Language/framework best practices
- If uncertain, mark as `needs investigation` and cite official source

## Failure conditions

- Diff target missing/empty and no alternative target selected.
- Finding has no concrete file reference.
- Finding cannot be traced to approved unit or objective code fact.
