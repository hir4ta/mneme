---
name: harvest
description: |
  Extract source knowledge from GitHub PR comments and convert it into unit-ready artifacts.
  Use when: (1) PR discussion has reusable guidance, (2) team review feedback should be retained,
  (3) merged PRs contain operational lessons.
argument-hint: "<PR-URL>"
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# /mneme:harvest

Harvest PR comments into source artifacts, then refresh units.

## Language

All saved data (titles, descriptions, decisions, patterns, rules) MUST be written in the user's language.
Detect the user's language from the conversation and match it consistently.

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

## Source definitions and exclusivity (must follow)

| Category | Definition | Primary question |
|----------|-----------|-----------------|
| **Decision** | A one-time choice in a specific context, with alternatives and reasoning | "What was chosen and why?" |
| **Pattern** | A repeatable practice observed across contexts (good/bad/error-solution) | "What repeatedly works or fails?" |
| **Rule** | An enforceable standard promoted from a Decision or Pattern | "What should be enforced going forward?" |

<required>
- Decision vs Pattern are mutually exclusive. The same insight goes to exactly one.
- Rule may be promoted from Decision/Pattern (with sourceRef). Source data is preserved.
</required>

## Content quality requirements

<required>
- Decisions: `alternatives` MUST include rejection reason for each option
- Patterns: MUST include application conditions (concrete thresholds) and expected outcomes
- Rules: `text` MUST be imperative and specific; `rationale` MUST explain risk of violation
</required>

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

1. Parse PR URL from `$ARGUMENTS`.
2. Fetch review + issue comments via `gh`.
3. Classify comments into decision/pattern/rule sources.
4. Deduplicate/conflict-check against existing sources.
5. Save source artifacts with `prSource` metadata.
6. Run source validation gate:
   - Call MCP tool `mneme_validate_sources`
   - If failed (`valid: false`): fix artifacts and rerun.
7. Regenerate units from sources.
8. Show pending units for approval.

## Required output

- analyzed comments count
- extracted source item counts by type
- duplicate/conflict summary
- priority distribution (`p0/p1/p2` for added/updated rules)
- validation result (`mneme_validate_sources`)
- regenerated units count
- pending units count
