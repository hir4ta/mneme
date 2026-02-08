---
name: harvest
description: |
  Extract source knowledge from GitHub PR comments and convert it into unit-ready artifacts.
  Use when: (1) PR discussion has reusable guidance, (2) team review feedback should be retained,
  (3) merged PRs contain operational lessons.
argument-hint: "<PR-URL>"
---

# /mneme:harvest

Harvest PR comments into source artifacts, then refresh units.

## Required emphasis format (Claude Code safe)

Claude Code docs do not provide a built-in "required badge" syntax for skills.
Use explicit section markers and XML-style tags for hard constraints:

```markdown
<required>
- field A
- field B
</required>
```

## Usage

```
/mneme:harvest https://github.com/owner/repo/pull/123
```

## Classification targets

- **Decision source** -> `decisions/`
- **Pattern source** -> `patterns/`
- **Rule source** -> `rules/dev-rules.json` or `rules/review-guidelines.json`

## Source definitions (must follow)

- **Decision**: what option was chosen and why.
- **Pattern**: what repeatedly works or fails.
- **Rule**: what should be enforced in future work.

## Priority rubric (for rules, must use)

- `p0`: security/data-loss/outage/compliance break risk
- `p1`: correctness/reliability risk with user impact
- `p2`: maintainability/readability/process quality

<required>
- Active rule must include: `id`, `key`, `text`, `category`, `tags`, `priority`, `rationale`
- `priority` must be one of: `p0`, `p1`, `p2`
- Decision/Pattern/Rule must all include non-empty `tags`
</required>

## Flow

1. Parse PR URL.
2. Fetch review + issue comments via `gh`.
3. Classify comments into decision/pattern/rule sources.
4. Deduplicate/conflict-check against existing sources.
5. Save source artifacts with `prSource` metadata.
6. Run source validation gate:
   - `npm run validate:sources`
   - If failed: fix artifacts and rerun.
7. Regenerate units from sources.
8. Show pending units for approval.

## Required output

- analyzed comments count
- extracted source item counts by type
- duplicate/conflict summary
- priority distribution (`p0/p1/p2` for added/updated rules)
- validation result (`validate:sources`)
- regenerated units count
- pending units count
