---
name: plan
description: |
  Creates detailed implementation plan with 2-5 minute tasks.
  References past similar implementations for informed planning.
  Use after brainstorm approval or when starting implementation.
context: fork
---

# /memoria:plan

Creates detailed implementation plans with 2-5 minute tasks, complete code samples, and TDD enforcement.

## Invocation

```
/memoria:plan                    # Create plan for current feature
/memoria:plan "feature"         # Create plan for specific feature
/memoria:plan --from-design     # Create plan from recent design document
```

## Workflow Overview

```
Phase 1: Memory Search     → Find past similar implementations
Phase 2: Task Breakdown    → Split into 2-5 minute tasks (TDD first)
Phase 3: Plan Output       → Save to docs/plans/ + interactions
```

---

## Phase 1: Memory Search

**Search memoria for relevant past implementations to inform planning.**

### Search Procedure

1. **Search sessions** for similar feature implementations:
   ```
   Glob: .memoria/sessions/**/*.json   # Search title, tags, plan, discussions
   Grep: keywords from feature (component type, API type, etc.)
   Focus: JSON files with plan.tasks containing similar features
   ```

2. **Search for related test patterns and errors**:
   ```
   Glob: .memoria/sessions/**/*.json
   Look for: errors section with solutions, discussions about testing
   ```

3. **Check recent design documents**:
   ```
   Glob: docs/plans/*-design.md
   Read: most recent relevant design
   ```

### Presentation Format

If relevant memories found:

```markdown
## Past Implementation Reference

**Similar feature (2026-01-15):**
> Implemented [feature X] with this plan:
> - Task 1: [test file] (5 min)
> - Task 2: [impl file] (3 min)
> - Total tasks: 8, Completion time: ~30 min

**Test patterns used:**
- [Pattern name]: [brief description]

**Issues encountered:**
- [Issue]: [how it was resolved]
```

---

## Phase 2: Task Breakdown

**CRITICAL: Every task must be 2-5 minutes. TDD is mandatory - tests come first.**

### Task Requirements

Each task MUST include:

1. **Task title** - What is being accomplished
2. **Files** - Complete file paths (create/modify/test)
3. **Steps** - Step-by-step instructions
4. **Code** - Complete code samples (copy-paste ready)
5. **Command** - Verification command
6. **Expected** - Expected output
7. **Commit** - Conventional Commits message

### TDD Enforcement

**MANDATORY: Test tasks come before implementation tasks.**

```
Wrong order:
1. Implement feature
2. Write tests

Correct order:
1. Write failing test (RED)
2. Implement minimal code (GREEN)
3. Refactor (REFACTOR)
4. Repeat for next behavior
```

### Task Size Guidelines

| Task Type | Target Duration | Signs of Too Large |
|-----------|-----------------|-------------------|
| Test creation | 2-5 min | Multiple behaviors tested |
| Minimal impl | 2-5 min | Adding extra features |
| Refactor | 2-3 min | Changing external behavior |
| Config/setup | 1-3 min | Multiple files touched |

### Dependency Rules

- Mark dependencies between tasks explicitly
- If Task B depends on Task A, note it
- Group related tasks with clear boundaries

---

## Plan Template

Use this exact structure for the output:

```markdown
# [Feature Name] Implementation Plan

## Goal

[One sentence describing what will be achieved]

## Architecture

[2-3 sentences describing the high-level architecture]

## Tech Stack

- [Technology 1]: [purpose]
- [Technology 2]: [purpose]

## Prerequisites

- [ ] [Any setup required before starting]

## Tasks

### Task 1: Create failing test for [behavior]

**Phase**: RED
**Files**: `tests/path/to/feature.test.ts`
**Duration**: ~3 min

**Steps**:
1. Create test file
2. Write test for [specific behavior]
3. Run test to confirm it fails

**Code**:
```typescript
// tests/path/to/feature.test.ts
import { describe, it, expect } from 'vitest'
import { featureFunction } from '../src/path/to/feature'

describe('featureFunction', () => {
  it('should [expected behavior]', () => {
    const result = featureFunction(input)
    expect(result).toBe(expectedOutput)
  })
})
```

**Command**: `npm test tests/path/to/feature.test.ts`
**Expected**: FAIL - `featureFunction is not defined` or similar

**Commit**: `test: add failing test for [behavior]`

---

### Task 2: Implement minimal [feature]

**Phase**: GREEN
**Files**: `src/path/to/feature.ts`
**Duration**: ~4 min
**Depends on**: Task 1

**Steps**:
1. Create implementation file
2. Write minimal code to pass the test
3. Run test to confirm it passes
4. Run all tests to ensure no regression

**Code**:
```typescript
// src/path/to/feature.ts
export function featureFunction(input: InputType): OutputType {
  // Minimal implementation to pass the test
  return expectedOutput
}
```

**Command**: `npm test tests/path/to/feature.test.ts`
**Expected**: PASS

**Command**: `npm test`
**Expected**: All tests pass

**Commit**: `feat: implement [feature]`

---

### Task 3: Refactor [what to improve]

**Phase**: REFACTOR
**Files**: `src/path/to/feature.ts`
**Duration**: ~2 min
**Depends on**: Task 2

**Steps**:
1. Identify improvement (naming, duplication, etc.)
2. Make change while keeping tests green
3. Run tests to confirm still passing

**Code**:
```typescript
// Improved version
export function featureFunction(input: InputType): OutputType {
  // Refactored implementation
  const intermediateResult = helperFunction(input)
  return transform(intermediateResult)
}

function helperFunction(input: InputType): IntermediateType {
  // Extracted helper
}
```

**Command**: `npm test`
**Expected**: All tests pass

**Commit**: `refactor: extract helper for [purpose]`

---

[Continue with more tasks as needed...]
```

## Summary

| Phase | Tasks | Estimated Duration |
|-------|-------|-------------------|
| RED | X | ~Y min |
| GREEN | X | ~Y min |
| REFACTOR | X | ~Y min |
| **Total** | **X** | **~Y min** |

## Next Steps

After plan approval:
1. Start with Task 1 using `/memoria:tdd`
2. Complete each task in order
3. Commit after each task
4. Review with `/memoria:review --full` when complete
```

---

## Phase 3: Plan Output

### Save to docs/plans/

```
File: docs/plans/YYYY-MM-DD-[topic]-tasks.md
Content: [Full plan from template above]
```

### Record to Session

**Note:** Session interactions are auto-saved by SessionEnd hook. Plan details should be saved to JSON via `/memoria:save`.

When plan is approved, prompt user to run `/memoria:save` to capture:

**JSON plan field:**
```json
"plan": {
  "goals": ["[Feature name] implementation"],
  "tasks": [
    "[ ] Task 1: [description] (RED)",
    "[ ] Task 2: [description] (GREEN)",
    "[ ] Task 3: [description] (REFACTOR)"
  ],
  "remaining": ["All tasks pending"]
}
```

**JSON references field:**
```json
"references": [
  {
    "type": "plan",
    "path": "docs/plans/YYYY-MM-DD-[topic]-tasks.md",
    "description": "Implementation plan document"
  }
]
```

### Commit Plan

```bash
git add docs/plans/YYYY-MM-DD-[topic]-tasks.md
git commit -m "docs: add [topic] implementation plan

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task Tracking

As tasks are completed during implementation:

### Update plan file

In the plan file, update task status:

```markdown
### Task 1: Create failing test for [behavior] ✅

[... task details ...]

**Status**: Complete (2026-01-27 10:15)
```

### Update JSON (via /memoria:save)

When saving session, update plan.tasks to reflect progress:

```json
"plan": {
  "tasks": [
    "[x] Task 1: Create failing test (RED)",
    "[x] Task 2: Implement minimal code (GREEN)",
    "[ ] Task 3: Refactor (REFACTOR)"
  ],
  "remaining": ["Task 3: Refactor"]
}
```

---

## Quality Checklist

Before finalizing plan, verify:

- [ ] Every implementation task has a preceding test task
- [ ] Each task is 2-5 minutes
- [ ] Code samples are complete and copy-paste ready
- [ ] File paths are accurate
- [ ] Commands are correct for the project
- [ ] Dependencies between tasks are clear
- [ ] Commit messages follow Conventional Commits

---

## Completion

After plan approval:

```markdown
## Plan Ready

Implementation plan saved to: `docs/plans/YYYY-MM-DD-[topic]-tasks.md`

**Summary:**
- Total tasks: X
- RED (test) tasks: Y
- GREEN (impl) tasks: Y
- REFACTOR tasks: Z
- Estimated duration: ~N min

**Start implementation:**
1. Run `/memoria:tdd` to begin Task 1
2. Follow RED → GREEN → REFACTOR cycle
3. Commit after each task

Ready to start?
```
