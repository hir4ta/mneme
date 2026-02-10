---
name: save
description: |
  Extract and persist session outputs, then generate development rule candidates (decision/pattern/rule).
  Use when: (1) finishing meaningful implementation work, (2) capturing reusable guidance,
  (3) before ending a long session.
disable-model-invocation: true
---

# /mneme:save

Save session outputs and generate development rule candidates for approval.

## Core intent

`/mneme:save` is a source-writing command. It updates:
- `sessions/`
- `decisions/`
- `patterns/`
- `rules/`

Then development rule candidates should be generated and reviewed inline.

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
- Save transcript interactions to `.mneme/local.db` via `mneme_save_interactions`.
- Do NOT call `mneme_mark_session_committed` yet (wait until after Phase 3).

3. **Session summary extraction (required MCP)**
- Extract from the conversation: `title`, `goal`, `outcome`, `description`, `tags`, `sessionType`.
- **MUST call `mneme_update_session_summary`** MCP tool with the extracted data.
  This writes the summary to `.mneme/sessions/` JSON file, ensuring the session is preserved on SessionEnd.
- **Then call `mneme_mark_session_committed`** to finalize the commit.

<required>
- Call `mneme_update_session_summary` with: `claudeSessionId`, `title`, `summary` (`goal`, `outcome`), `tags`, `sessionType`
- Call `mneme_mark_session_committed` AFTER `mneme_update_session_summary` succeeds
- Do NOT skip this step even for short/research sessions
</required>

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

7. **開発ルール生成 + インライン承認 (required)**
- Generate development rule candidates from updated sources.
- Display candidates with type badges ([Decision], [Pattern], [Rule]).
- Ask user to approve or reject each candidate inline:
  ```
  Generated development rule candidates:
    1. [Decision] Use JWT with RS256  → Approve? (Y/n)
    2. [Pattern] Wrap DB calls in try/catch  → Approve? (Y/n)
    3. [Rule] p0 security check required  → Approve? (Y/n)
  ```
- Set approved items to `status: "approved"`.
- Set rejected items to `status: "rejected"`.
- Note: approved rules are available to MCP search tools for use by custom agents.

8. **Auto quality checks (required MCP)**
- Run `mneme_rule_linter` (`ruleType: "all"`).
- Run `mneme_search_eval` (`mode: "run"`).
- Run `mneme_unit_queue_list_pending` to surface pending approvals.

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

After writing sources and before rule generation, run:

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
- development rules generated count
- pending rules count
