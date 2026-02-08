---
name: save
description: |
  Extract and persist session outputs, then refresh unit sources (decision/pattern/rule).
  Use when: (1) finishing meaningful implementation work, (2) capturing reusable guidance,
  (3) before ending a long session.
---

# /mneme:save

Save session outputs and refresh source artifacts for unit generation.

## Core intent

`/mneme:save` is a source-writing command. It updates:
- `sessions/`
- `decisions/`
- `patterns/`
- `rules/`

Then units should be regenerated and reviewed.

## Required emphasis format (Claude Code safe)

Claude Code docs do not provide a built-in "required badge" syntax for skills.
Use explicit section markers and XML-style tags for hard constraints:

```markdown
<required>
- field A
- field B
</required>
```

Always render missing required fields as blocking errors before write.

## Execution phases

1. **Master session merge**
- Merge linked/resumed child sessions into the master session.

2. **Interactions commit**
- Save transcript interactions to `.mneme/local.db`.
- Mark the Claude session committed.

3. **Session summary extraction**
- Update master session JSON (`title/goal/outcome/description/tags/sessionType`).

4. **Decision extraction (source)**
- Persist concrete choices and rationale to `decisions/YYYY/MM/*.json`.

5. **Pattern extraction (source)**
- Persist repeatable success/failure patterns to `patterns/{user}.json`.

6. **Rule extraction (source)**
- Persist enforceable standards to:
  - `rules/dev-rules.json`
  - `rules/review-guidelines.json`

<required>
- Active rule must include: `id`, `key`, `text`, `category`, `tags`, `priority`, `rationale`
- `priority` must be one of: `p0`, `p1`, `p2`
</required>

7. **Unit refresh trigger (required)**
- Regenerate units from updated sources.
- Present pending units for approval.
- Note: planning/review should use only approved units.

8. **Auto quality checks (required MCP)**
- Run `mcp__mneme-db__mneme_rule_linter` (`ruleType: "all"`).
- Run `mcp__mneme-db__mneme_search_eval` (`mode: "run"`).
- Run `mcp__mneme-db__mneme_unit_queue_list_pending` to surface pending approvals.

## Source definitions (must follow)

- **Decision**: what option was chosen and why.
- **Pattern**: what repeatedly works or fails.
- **Rule**: what should be enforced in future work.

## Priority rubric (must use)

- `p0`: security/data-loss/outage/compliance break risk
- `p1`: correctness/reliability risk with user impact
- `p2`: maintainability/readability/process quality

When confidence is low, default to `p1` and include rationale.

## Mandatory tags

Each extracted item must include at least one semantic tag.

<required>
- Decision: `tags` required
- Pattern: `tags` required
- Rule: `tags` required
</required>

Recommended controlled tags:
- `security`, `api`, `database`, `testing`, `performance`, `reliability`, `workflow`, `ui`

## Validation gate (must pass)

After writing sources and before unit generation, run:

```bash
npm run validate:sources
```

If validation fails, fix artifacts first, then continue.

## Output to user

Report at minimum:
- interactions saved count
- created/updated counts for decisions/patterns/rules
- validation result (`validate:sources`)
- rule linter result (`mneme_rule_linter`)
- search benchmark result (`mneme_search_eval`)
- units regenerated count
- pending units count
