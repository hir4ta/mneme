---
name: plan
description: |
  Unit-informed design and implementation planning with past session/unit lookup.
  Use when: (1) starting a new feature or task, (2) designing architecture,
  (3) needing approved project guidance before implementation.
argument-hint: "[topic]"
---

# /mneme:plan

Unit-informed planning that combines Claude Code's native plan mode UI and mneme's approved units.

## Required constraints

<required>
- Use only approved units (`status: "approved"`).
- If approved units are zero, stop planning.
- Do not use `.mneme/rules/*.json` / `.mneme/patterns/*.json` directly as planning authority.
</required>

## Invocation

```
/mneme:plan
/mneme:plan "feature"
```

## Workflow

```
Phase 0: Enter Plan Mode
Phase 1: Memory Search (sessions + approved units)
Phase 2: Explore Codebase (read-only)
Phase 3: Clarify (one question at a time)
Phase 4: Design (section-by-section validation)
Phase 5: Exit Plan Mode
```

## Phase 0: Enter Plan Mode

Call EnterPlanMode unless already active.

## Phase 1: Memory Search (Required)

1. Use `mcp__mneme-search__mneme_search`:
   - Query: keywords from request
   - Types: `["session", "unit"]`
   - Optionally page with `offset` when `page.hasMore` is true.
2. Approved unit gate:
   - Read `.mneme/units/units.json`
   - Count `status: "approved"`
   - If count is 0, stop and report:
     - `No approved units found. Generate and approve units before /mneme:plan.`
3. Timeline/context deepening (required when a concrete prior session is referenced):
   - `mcp__mneme-db__mneme_session_timeline`
4. Do not read `.mneme/rules/*.json` or `.mneme/patterns/*.json` directly for planning decisions.

### Presentation format

```markdown
## Past Context

**Relevant sessions:**
- [session id] title ...

**Relevant approved units:**
- [unit id] title ... (source: sourceType:sourceId)
- Guidance: summary
```

## Phase 2: Explore Codebase

Read-only investigation:
- `Read`
- `Glob`
- `Grep`
- `Task` (`subagent_type: Explore`)

## Phase 3: Clarify

- Ask one question per message.
- Prefer multiple-choice.
- Max 3-5 questions.
- Reference approved units where relevant.

## Phase 4: Design

Present in short sections and confirm each before continuing:
1. Overview
2. Architecture
3. Data flow
4. API/interface
5. Error handling
6. Testing strategy

Write final doc to `docs/plans/YYYY-MM-DD-[topic]-design.md`.

## Phase 5: Exit Plan Mode

Call ExitPlanMode for approval.

## Guardrails

- Plan decisions must be justified by:
  - codebase facts, and/or
  - approved units.
- If conflict exists between old docs and approved units, prefer approved units and flag mismatch.
- After implementation, run `/mneme:save`, then refresh units and approve new ones.

## Failure conditions

- Missing approved units.
- No evidence from either codebase facts or approved units.
- Ambiguous requirements after 5 clarifying questions.
