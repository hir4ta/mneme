---
name: plan
description: |
  Memory-informed design and implementation planning with past knowledge lookup.
  Use when: (1) starting a new feature or task, (2) designing architecture,
  (3) needing to consider past decisions before implementing.
argument-hint: "[topic]"
---

# /mneme:plan

Memory-informed design and implementation planning that combines Claude Code's native plan mode UI, Socratic questioning, and mneme's knowledge base.

## Invocation

```
/mneme:plan                  # Plan for current task
/mneme:plan "feature"        # Plan for specific feature
```

## Workflow Overview

```
Phase 0: Enter Plan Mode    → Activate Claude Code native UI
Phase 1: Memory Search      → Find relevant past knowledge
Phase 2: Explore Codebase   → Read-only investigation
Phase 3: Clarify            → Socratic questions (1 at a time)
Phase 4: Design             → Present in sections, validate each
Phase 5: Exit Plan Mode     → Approve and prepare execution
```

---

## Phase 0: Enter Plan Mode

**Use Claude Code's native plan mode for proper UI integration.**

```
Action: Call EnterPlanMode tool
Result: Terminal shows "⏸ plan mode on" indicator
```

This enables:
- Read-only exploration (no accidental changes)
- Clear visual indication of planning state
- Native approval workflow via ExitPlanMode

**Skip this phase if already in plan mode.**

---

## Phase 1: Memory Search

Search mneme for relevant context before design work. This surfaces past decisions
and patterns that inform the current task.

**Why this matters:**
```
Found: Previous JWT implementation used RS256
→ Saves time by not re-discussing algorithm choice
```

### Search Procedure

Use MCP tools or file search:

1. **Search sessions** for similar implementations:
   ```
   Tool: mcp__mneme-search__mneme_search
   Query: keywords from user request
   Types: ["session", "decision", "pattern"]
   ```

2. **Check rules** for constraints:
   ```
   Read: .mneme/rules/dev-rules.json
   Read: .mneme/rules/review-guidelines.json
   Look for: rules that apply to this feature
   ```

### Presentation Format

**Always present findings before asking questions:**

```markdown
## 📚 Past Context Found

**Similar implementation (2026-01-15):**
> Previously implemented [feature X] using [approach Y].
> Key decision: [decision made]
> Outcome: [what happened]

**Related decisions:**
- `dec-abc123` [title]: [summary] (status: active)

**Relevant patterns:**
- ✅ Good: [pattern description]
- ⚠️ Error-solution: [error] → [solution]

**Applicable rules:**
- [rule content]
```

**If no relevant memories found:**
```
No directly relevant past sessions found. Starting fresh design.
```

---

## Phase 2: Explore Codebase

**Investigate the current state before asking questions.**

In plan mode, use read-only tools:
- `Read` - View file contents
- `Glob` - Find files by pattern
- `Grep` - Search code content
- `Task` with `subagent_type: Explore` - Deep exploration

### What to Explore

1. **Existing implementation** - Related code that already exists
2. **Patterns in use** - How similar features are built
3. **Dependencies** - What libraries/modules are available
4. **Tests** - How similar features are tested

### Present Findings

```markdown
## 🔍 Codebase Context

**Related files:**
- `src/components/Auth.tsx` - Current auth UI
- `src/lib/api.ts` - API client

**Patterns observed:**
- React Query for data fetching
- Zod for validation

**Available utilities:**
- `useAuth` hook exists
- `api.post()` method available
```

---

## Phase 3: Clarify (Socratic Questions)

**Ask one question per message. Wait for response before next question.**

### Question Rules

- **ONE question per message** - Never ask multiple questions
- **Multiple choice preferred** - Easier to answer
- **Reference past decisions** - "Based on the previous JWT decision..."
- **Skip obvious questions** - Don't ask what's already clear
- **3-5 questions max** - Don't over-question
- **YAGNI ruthlessly** - Remove unnecessary features from consideration

### Question Format

Use the `AskUserQuestion` tool for structured questions:

```typescript
AskUserQuestion({
  questions: [{
    question: "How should authentication be handled?",
    header: "Auth method",
    options: [
      { label: "JWT tokens (Recommended)", description: "Consistent with existing API" },
      { label: "Session cookies", description: "Simpler but requires server state" },
      { label: "OAuth only", description: "Delegate to third party" }
    ],
    multiSelect: false
  }]
})
```

### Core Questions (adapt as needed)

1. **Use case clarification**
   - What specific scenario should this feature support?
   - Options based on memory search results

2. **Success criteria**
   - How will we know this is successful?
   - Functional vs quality requirements

3. **Constraints**
   - Technology constraints from past decisions
   - Compatibility requirements

4. **Scope boundaries**
   - What's explicitly OUT of scope?
   - YAGNI: What features can we defer?

---

## Phase 4: Design

**Present the design in sections of 200-300 words. Validate each section before continuing.**

### Section Order

1. **Overview** - What we're building (1-2 sentences)
2. **Architecture** - How components fit together
3. **Data flow** - How data moves through the system
4. **API/Interface** - Public contract
5. **Error handling** - Edge cases and failures
6. **Testing strategy** - How to verify it works

### Present Each Section

```markdown
## 📐 Design: [Feature Name]

### Overview

[200-300 words describing this section]

---

Does this section look right? Any adjustments needed?
```

**Wait for confirmation before presenting the next section.**

### After All Sections Approved

Write the complete design to file:

```markdown
## Design Document

Saved to: `docs/plans/YYYY-MM-DD-[topic]-design.md`

The document includes:
- Overview and goals
- Architecture decisions
- Implementation approach
- Testing strategy
```

### Document Format

```markdown
# [Feature] Design

**Date**: YYYY-MM-DD
**Status**: Approved

## Overview

[What we're building and why]

## Architecture

[How it fits together]

## Key Decisions

| Decision | Choice | Reasoning |
|----------|--------|-----------|
| [Topic] | [Choice] | [Why] |

## Implementation Tasks

### Task 1: [Title]
- **Files**: `path/to/file.ts`
- **Steps**: [What to do]
- **Verification**: [How to test]

### Task 2: [Title]
- **Depends on**: Task 1
- [...]

## Testing Strategy

[How to verify the implementation]

## Out of Scope

[What we're explicitly NOT doing (YAGNI)]
```

---

## Phase 5: Exit Plan Mode

**Use ExitPlanMode to request user approval and prepare for execution.**

```
Action: Call ExitPlanMode tool
Result: User reviews plan and approves/rejects
```

### Before Exiting

Ensure the plan document:
1. Is saved to `docs/plans/`
2. Contains all approved design sections
3. Has clear implementation tasks
4. Includes verification steps

### Exit Message

```markdown
## 📋 Plan Ready for Approval

**Document**: `docs/plans/2026-02-01-feature-design.md`
**Tasks**: 5 implementation steps
**Key decisions**: [summary]

The plan is ready for your review. You can:
- Press `Ctrl+G` to open in your editor
- Approve to begin implementation
- Request changes

After implementation, run `/mneme:save` to capture decisions and patterns.
```

---

## Quick Reference

### Tools Used

| Phase | Tools |
|-------|-------|
| 0 | `EnterPlanMode` |
| 1 | `mcp__mneme-search__mneme_search`, `Read` |
| 2 | `Read`, `Glob`, `Grep`, `Task` (Explore) |
| 3 | `AskUserQuestion` |
| 4 | `Write` (design doc) |
| 5 | `ExitPlanMode` |

### Key Principles

- **Memory first** - Always check past knowledge before designing
- **One question at a time** - Never overwhelm with multiple questions
- **Incremental validation** - Present design in sections, validate each
- **YAGNI ruthlessly** - Remove unnecessary features from all designs
- **Native UI** - Use Claude Code's plan mode for proper integration

### Output Location

| Output | Location |
|--------|----------|
| Design document | `docs/plans/YYYY-MM-DD-[topic]-design.md` |

---

## Example Session

```
User: /mneme:plan "add user preferences"

Claude: [Enters plan mode]

## 📚 Past Context Found

**Related decision (2026-01-20):**
> User data stored in PostgreSQL with Prisma ORM.
> Key decision: All user-related data in `users` table with JSONB for flexible fields.

**Applicable rules:**
- [data-privacy] User preferences must be exportable

---

Let me explore the codebase first...

## 🔍 Codebase Context

**Related files:**
- `src/lib/prisma.ts` - Database client
- `src/types/user.ts` - User type definitions
- `prisma/schema.prisma` - Database schema

**Pattern observed:**
- JSONB field `metadata` already exists on User model

---

Claude: [Uses AskUserQuestion]

Question: What preferences should users be able to set?

a) Theme only (dark/light)
b) Theme + language
c) Theme + language + notifications (Recommended)
d) Other

User: c

Claude: [Presents design section by section, validates each]

## 📐 Design: User Preferences

### Overview

Add a preferences system allowing users to customize theme, language,
and notification settings. Preferences stored in existing JSONB `metadata`
field for flexibility...

Does this section look right?

User: Yes

[Continues with Architecture, Data flow, etc.]

Claude: [Writes design document, calls ExitPlanMode]

## 📋 Plan Ready for Approval

**Document**: `docs/plans/2026-02-01-user-preferences-design.md`
**Tasks**: 4 implementation steps
**Key decisions**: Use existing JSONB field, add type-safe accessor

Ready to begin implementation?
```
