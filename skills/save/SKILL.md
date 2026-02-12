---
name: save
description: |
  Extract and persist session outputs, then generate development rule candidates (decision/pattern/rule).
  Use when: (1) finishing meaningful implementation work, (2) capturing reusable guidance,
  (3) before ending a long session.
disable-model-invocation: false
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, mcp__mneme-db__mneme_save_interactions, mcp__mneme-db__mneme_update_session_summary, mcp__mneme-db__mneme_mark_session_committed, mcp__mneme-db__mneme_rule_linter, mcp__mneme-db__mneme_search_eval
---

# /mneme:save

Save session outputs and generate development rule candidates for approval.

## Language

All saved data (titles, descriptions, decisions, patterns, rules) MUST be written in the user's language.
Detect the user's language from the conversation and match it consistently.

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

## Session ID resolution

<required>
- Get the full Claude Session ID from the SessionStart context injected at the top of this conversation (look for `**Claude Session ID:**`)
- Do NOT run any Bash commands to discover the session ID
- NEVER run exploratory commands like `printenv`, `find`, `echo $MNEME_SESSION_ID`, or `ls -t ~/.claude/projects/*/`
</required>

## Execution phases

1. **Master session merge**
- Merge linked/resumed child sessions into the master session.

2. **Interactions commit**
- Save transcript interactions to `.mneme/local.db` via `mneme_save_interactions`.
- Do NOT call `mneme_mark_session_committed` yet (wait until after Phase 3).

3. **Session summary extraction (required MCP)**
- Extract from the conversation: `title`, `goal`, `outcome`, `description`, `tags`, `sessionType`.
- Extract **file and technology context** (critical for search and session recommendations):
  - `filesModified`: files changed during session (path + action: create/edit/delete/rename)
  - `technologies`: technologies, frameworks, and libraries used (e.g., "React", "Hono", "SQLite")
- Additionally extract **structured context** (data likely lost during auto-compact):
  - `plan`: session goals, task list (completed tasks use `[x] ` prefix), remaining tasks
  - `discussions`: design discussions (topic, decision, reasoning, alternatives)
  - `errors`: encountered errors and solutions (error, context, solution, files)
  - `handoff`: continuation info (stoppedReason, notes, nextSteps)
  - `references`: referenced document URLs and file paths (type, url, path, title, description)
- **MUST call `mneme_update_session_summary`** MCP tool with all extracted data.
  This writes the summary to `.mneme/sessions/` JSON file, ensuring the session is preserved on SessionEnd.
- **Then call `mneme_mark_session_committed`** to finalize the commit.

<required>
- Call `mneme_update_session_summary` with: `claudeSessionId`, `title`, `summary` (`goal`, `outcome`), `tags`, `sessionType`, `filesModified`, `technologies`
- Call `mneme_mark_session_committed` AFTER `mneme_update_session_summary` succeeds
- Do NOT skip this step even for short/research sessions
</required>

### Structured context extraction guide

Auto-compact triggers at ~80% context window usage, replacing older messages with summaries.
The following data is easily lost in summaries, so save it explicitly as structured data.

**filesModified** — always extract when implementation occurred:
- Extract from tool usage (Read, Edit, Write, Bash) in the conversation
- Use relative paths from project root
- Actions: "create" (new file), "edit" (modified), "delete" (removed), "rename" (moved)
- Exclude: node_modules, dist, .git, lock files

**technologies** — always extract:
- List frameworks, languages, libraries actively used (not just imported)
- Examples: "TypeScript", "React", "Hono", "SQLite", "Zod", "Tailwind CSS"
- Keep concise: 3-10 items typical

**plan** — when applicable:
- `goals`: goals set at session start
- `tasks`: task list. Completed: `[x] task name`, incomplete: `[ ] task name`
- `remaining`: tasks carried over to future sessions

**discussions** — when design discussions occurred:
- Extract "chose A over B" decisions
- Record rejected alternatives in `alternatives`

**errors** — when build errors, test failures, or runtime errors occurred:
- Record error messages, context, and solutions
- Preserve as knowledge to avoid re-encountering the same errors

**handoff** — always at session end:
- `stoppedReason`: why stopping here (completed, time limit, blocker, etc.)
- `notes`: important notes for the next session
- `nextSteps`: specific next actions

**references** — when external resources were referenced:
- Official documentation URLs confirmed via WebFetch/WebSearch
- Important file paths referenced

4. **Decision extraction (source)**
- Persist concrete choices and rationale to `decisions/YYYY/MM/*.json`.
- Apply the classification matrix: only extract items that are **one-time choices with context-specific reasoning**.
- Do NOT extract repeatable practices here (those belong in patterns/).

<required>
Decision content quality:
- `title`: one-line summary of the choice ("Chose Y over X" format)
- `context`: why this decision was needed (background, constraints)
- `decision`: what was concretely done (include code examples or file paths)
- `reasoning`: why this choice is best (trade-off analysis)
- `alternatives`: MUST include rejection reason for each alternative
  - BAD: `["Use HS256"]`
  - GOOD: `["Use HS256 -> rejected: key rotation difficult in production"]`
  If alternatives is a string array, append " -> rejected: reason" to each entry.
</required>

5. **Pattern extraction (source)**
- Persist repeatable success/failure patterns to `patterns/{user}.json`.
- Apply the classification matrix: only extract **repeatable practices observed across contexts**.
- Do NOT extract one-time context-specific choices here (those belong in decisions/).

<required>
Pattern content quality:
- `title`: pattern summary ("Doing X leads to Y" format)
- `context`: when and in what situations this pattern applies
- `pattern`: concrete steps/approach (reproducible level of detail)
  - BAD: "Testing is good"
  - GOOD: "Launch 3 independent agents in parallel, verify all module exports, function calls, and MCP startup with real data. Achieved 160+ tests with 0 regressions"
- **Application conditions**: when to use, with concrete thresholds or triggers
  - BAD: "when impact is limited"
  - GOOD: "when call sites are 5 or fewer and the interface is stable"
- **Expected outcomes**: concrete effects when this pattern is applied
</required>

6. **Rule extraction (source)**
- Persist enforceable standards to:
  - `rules/dev-rules.json` — development rules (applied during implementation)
  - `rules/review-guidelines.json` — review guidelines (applied during code review)
- Rules are promoted from decisions or patterns. Include `sourceRef` linking to the source.
- A rule coexists with its source — do NOT delete the source when promoting.

<required>
Rule content quality:
- `text`: imperative and specific ("Do X", "Never do Y")
  - BAD: "Maintain type safety"
  - GOOD: "Use as assertion at call sites instead of any at type boundaries with external libraries"
- `rationale`: why this rule is needed + risk of violation
  - BAD: "For type safety"
  - GOOD: "any undermines type safety across the entire interface. as assertion limits impact scope and makes type boundaries explicitly reviewable"
- `category`: rule classification (type-safety, testing, security, performance, etc.)
- Active rule must include: `id`, `key`, `text`, `category`, `tags`, `priority`, `rationale`
- `priority` must be one of: `p0`, `p1`, `p2`
</required>

7. **Development rule candidates report**
- Display saved decisions/patterns/rules to the user.
- Do not set status (defaults to draft).
- Only items approved by the engineer in the dashboard become active development rules.
- Do not perform inline approval.

8. **Auto quality checks (required MCP)**
- Run `mneme_rule_linter` (`ruleType: "all"`).
- Run `mneme_search_eval` (`mode: "run"`).

## Source definitions and exclusivity (must follow)

### Classification matrix

| Category | Definition | Primary question | Example |
|----------|-----------|-----------------|---------|
| **Decision** | A one-time choice in a specific context, with alternatives and reasoning | "What was chosen and why?" | "Chose RS256 over HS256 for JWT signing due to production security requirements" |
| **Pattern** | A repeatable practice observed across contexts (good/bad/error-solution) | "What repeatedly works or fails?" | "Parallel agent testing with real data after large-scale refactoring is effective" |
| **Rule** | An enforceable standard promoted from a Decision or Pattern | "What should be enforced going forward?" | "After refactoring, verify with real data tests, not just build and lint" |

### Exclusivity rules

<required>
- **Decision vs Pattern are mutually exclusive**: the same insight goes to exactly one
  - One-time choice in a specific context -> Decision
  - Repeatable practice across contexts -> Pattern
- **Rule is a promotion**: may be promoted from Decision or Pattern. Source data is preserved.
- **No duplication**: the same insight MUST NOT exist in both decisions/ and patterns/
</required>

### Classification decision tree

```text
Is this a one-time choice in a specific context?
  YES -> Decision (decisions/)
    Should this be enforced going forward?
      YES -> Also promote to Rule (rules/) with sourceRef
      NO  -> Decision only
  NO -> Is this a repeatable practice?
    YES -> Pattern (patterns/)
      Should this be enforced going forward?
        YES -> Also promote to Rule (rules/) with sourceRef
        NO  -> Pattern only
    NO -> Do not extract
```

### sourceRef format (when promoting to Rule)

When promoting a Rule from a Decision/Pattern, include a reference to the source:
```json
{
  "sourceRef": { "type": "decision", "id": "dec-xxx" }
}
```

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

After writing sources and before rule generation, call MCP tool:

`mneme_validate_sources`

If validation fails (`valid: false`), fix artifacts first, then continue.

## Output to user

Report at minimum:
- interactions saved count
- created/updated counts for decisions/patterns/rules
- validation result (`mneme_validate_sources`)
- rule linter result (`mneme_rule_linter`)
- search benchmark result (`mneme_search_eval`)
- saved decisions/patterns/rules summary
