---
name: plan
description: |
  Memory-informed design and implementation planning with past knowledge lookup.
  Use when: (1) starting a new feature or task, (2) designing architecture,
  (3) needing to consider past decisions before implementing.
argument-hint: "[topic]"
---

# /memoria:plan

Memory-informed design and implementation planning.

## Invocation

```
/memoria:plan                  # Plan for current task
/memoria:plan "feature"        # Plan for specific feature
```

## Workflow Overview

```
Phase 1: Memory Search      → Find relevant past knowledge
Phase 2: Socratic Questions → Clarify requirements (1 question at a time)
Phase 3: Design Decision    → Present approaches with tradeoffs
Phase 4: Task Breakdown     → Create actionable task list
```

---

## Phase 1: Memory Search

Search memoria for relevant context before design work. This surfaces past decisions
and patterns that inform the current task.

**Example benefit:**
```
Found: Previous JWT implementation used RS256
→ Saves time by not re-discussing algorithm choice
```

### Search Procedure

1. **Search sessions** for similar implementations:
   ```
   Glob: .memoria/sessions/**/*.json
   Look for: title, tags, summary, discussions, errors
   Match: keywords from user request
   ```

2. **Search decisions** for related architectural choices:
   ```
   Glob: .memoria/decisions/**/*.json
   Look for: title, decision, reasoning, tags
   ```

3. **Search patterns** for relevant good/bad/error patterns:
   ```
   Glob: .memoria/patterns/*.json
   Look for: type, errorPattern, solution
   ```

4. **Check rules** for constraints:
   ```
   Read: .memoria/rules/dev-rules.json
   Read: .memoria/rules/review-guidelines.json
   Look for: rules that apply to this feature
   ```

### Presentation Format

**Always present findings before asking questions:**

```markdown
## Past Context Found

**Similar implementation (2026-01-15):**
> Previously implemented [feature X] using [approach Y].
> Key decision: [decision made]
> Outcome: [what happened]

**Related decisions:**
- [decision-id] [title]: [summary] (status: active)

**Relevant patterns:**
- Good: [pattern description]
- Error-solution: [error] → [solution]

**Applicable rules:**
- [rule content]

---

Based on this context, let me ask some questions...
```

**If no relevant memories found:**
```
No directly relevant past sessions found. Starting fresh design.
```

---

## Phase 2: Socratic Questions

Ask one question per message. Wait for response before next question.

**Example flow:**
```
Q1: What scenario should this support? → User answers
Q2: What's the success criteria? → User answers
Q3: Any constraints? → User answers
```

### Core Questions (adapt as needed)

1. **Use case clarification**
   ```
   What specific scenario should this feature support?

   Options:
   a) [Scenario A based on memory]
   b) [Scenario B]
   c) [Scenario C]
   d) Other: [describe]
   ```

2. **Success criteria**
   ```
   How will we know this is successful?

   Consider:
   - Functional requirements (must work)
   - Quality requirements (tests, performance)
   ```

3. **Constraints**
   ```
   Any constraints to consider?

   From past decisions:
   - [relevant constraint from decisions/rules]

   Other possible constraints:
   a) Technology: [must use X]
   b) Compatibility: [must work with Y]
   c) Other: [specify]
   ```

4. **Integration points**
   ```
   How does this integrate with existing code?

   - Which files need modification?
   - What interfaces must be maintained?
   ```

### Question Rules

- **ONE question per message**
- **Offer multiple choice** when possible
- **Reference past decisions** - "Based on the previous JWT decision..."
- **Skip obvious questions** - Don't ask what's already clear
- **3-5 questions max** - Don't over-question

---

## Phase 3: Design Decision

**Present 2-3 approaches with clear tradeoffs.**

```markdown
## Approaches

### Approach A: [Name] (Recommended)

**Summary**: [1-2 sentences]

**Pros**:
- [Advantage]

**Cons**:
- [Disadvantage]

**Consistency**: [How this aligns with past decisions]

---

### Approach B: [Name]

**Summary**: [1-2 sentences]

**Pros/Cons**: [brief]

---

Which approach? (A/B/modify)
```

### Decision Rules

- **Recommend one** - Put recommended first
- **Check consistency** - Align with existing decisions
- **Keep simple** - Prefer simpler approaches (YAGNI)

---

## Phase 4: Task Breakdown

**After approach is selected, create actionable tasks.**

### Task Format

```markdown
# [Feature] Implementation Plan

## Goal

[One sentence]

## Tasks

### Task 1: [What to do]

**Files**: `path/to/file.ts`

**Steps**:
1. [Step 1]
2. [Step 2]

**Verification**: [How to verify it works]

---

### Task 2: [What to do]

**Depends on**: Task 1

[...]
```

### Task Guidelines

- **Keep tasks small** - Each should be completable independently
- **Include verification** - How to know it's done
- **Note dependencies** - If Task B needs Task A first
- **Be specific** - File paths, function names, etc.

---

## Output Locations

| Output | Location |
|--------|----------|
| Plan document | `docs/plans/YYYY-MM-DD-[topic]-plan.md` |
| Session reference | Updated via `/memoria:save` |

---

## Quick Example

```
User: /memoria:plan "add dark mode"

Claude:
## Past Context Found

**Similar implementation (2026-01-10):**
> Added theme system using CSS variables and Tailwind.
> Key decision: CSS variables over Tailwind's dark: prefix
> Outcome: Easy to extend, good performance

**Applicable rules:**
- [code-style] Use Tailwind for all styling

---

Let me ask one question:

How should the theme be persisted?

a) localStorage (simple, client-only)
b) User preferences API (synced across devices)
c) System preference only (no persistence)
```

---

## Completion

After plan approval:

```markdown
## Plan Ready

Saved to: `docs/plans/2026-01-27-dark-mode-plan.md`

**Tasks**: 5
**Key decision**: CSS variables approach

Ready to start implementation?

When done, run `/memoria:save` to capture decisions and patterns.
```
