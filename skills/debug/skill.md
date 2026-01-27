---
name: debug
description: |
  Systematic debugging with automatic past error pattern lookup.
  NO FIXES WITHOUT ROOT CAUSE INVESTIGATION.
  Use when encountering any bug, test failure, or unexpected behavior.
context: fork
---

# /memoria:debug

Systematic debugging with root cause analysis and error pattern memory.

## Invocation

```
/memoria:debug                  # Debug current error
/memoria:debug "error message" # Debug specific error
/memoria:debug --last          # Debug last Bash error
```

## Core Principle

**NO FIXES WITHOUT ROOT CAUSE INVESTIGATION.**

```
WRONG:
1. See error
2. Try random fix
3. Try another fix
4. "It works now!" (no idea why)

CORRECT:
1. See error
2. Search memoria for similar errors
3. Investigate root cause
4. Understand why it happens
5. Fix the cause (not symptom)
6. Record for future reference
```

---

## Phase 1: Memory Search

**Before any investigation, search memoria for similar errors.**

### Search Procedure

1. **Search sessions** for similar errors:
   ```
   Glob: .memoria/sessions/**/*.json
   Grep: error keywords, error codes, module names
   Look for: interaction.problem field
   ```

2. **Search patterns** (type: error-solution):
   ```
   Glob: .memoria/patterns/**/*.json
   Read: check errorPattern and errorRegex fields
   Match: current error against stored patterns
   ```

3. **Check recent sessions** in same area:
   ```
   Glob: .memoria/sessions/**/*.json
   Filter: same tags, same files modified
   ```

### Presentation Format

If past solution found:

```markdown
## Past Error Match Found

**Similar error (2026-01-15):**
```
[Previous error message]
```

**Solution applied:**
> [What was done to fix it]

**Reasoning:**
> [Why that solution worked]

**Related files:** `[file paths]`

---

Do you want to:
a) Apply the same solution
b) Investigate further (error may have different root cause)
c) Skip memory and investigate fresh
```

If no match found:
```
No matching error patterns in memoria. Starting fresh investigation.
```

---

## Phase 2: Root Cause Investigation

**MANDATORY: Do not skip to fixing. Understand the problem first.**

### Investigation Checklist

1. **Read error message completely**
   ```markdown
   ## Error Analysis

   **Full error:**
   ```
   [complete error message]
   ```

   **Key parts:**
   - Error type: [TypeError, ReferenceError, etc.]
   - Error message: [the actual message]
   - Location: [file:line if available]
   ```

2. **Analyze stack trace**
   ```markdown
   ## Stack Trace Analysis

   **Call sequence:**
   1. [function A] called
   2. [function B] called
   3. [function C] - ERROR HERE

   **Root location:** [file:line]
   ```

3. **Identify reproduction conditions**
   ```markdown
   ## Reproduction

   **Triggers when:**
   - [condition 1]
   - [condition 2]

   **Does NOT trigger when:**
   - [condition 3]
   ```

4. **Check recent changes**
   ```bash
   git log --oneline -10
   git diff HEAD~5
   ```

5. **Check environment/config**
   ```markdown
   ## Environment Check

   - Node version: [version]
   - Dependencies: [relevant versions]
   - Config: [relevant settings]
   ```

### Recording

Add interaction:
```json
{
  "id": "int-XXX",
  "topic": "Debug investigation: [error summary]",
  "timestamp": "[ISO8601]",
  "phase": "debug",
  "problem": "[full error message]",
  "debugInvestigation": {
    "errorMessage": "[error message]",
    "stackTrace": "[stack trace if available]",
    "hypotheses": [],
    "rootCause": null,
    "solution": null
  }
}
```

---

## Phase 3: Pattern Analysis

**Compare what works vs what doesn't.**

### Analysis Steps

1. **Find working example**
   ```markdown
   ## Working vs Broken Comparison

   **Working code:**
   ```typescript
   // This works
   [working code snippet]
   ```

   **Broken code:**
   ```typescript
   // This fails
   [broken code snippet]
   ```

   **Difference:**
   - [specific difference 1]
   - [specific difference 2]
   ```

2. **Check environment differences**
   ```markdown
   ## Environment Comparison

   | Aspect | Working | Broken |
   |--------|---------|--------|
   | [aspect 1] | [value] | [value] |
   | [aspect 2] | [value] | [value] |
   ```

3. **Trace data flow**
   ```markdown
   ## Data Flow Trace

   1. Input: [value] ✅
   2. After step A: [value] ✅
   3. After step B: [value] ❌ <- Problem here
   4. Output: [unexpected value]
   ```

---

## Phase 4: Hypothesis Testing

**Form hypotheses and test them systematically.**

### Hypothesis Format

```markdown
## Hypothesis 1: [description]

**Theory:** [what you think is wrong]

**Test:** [how to verify]

**Result:** [CONFIRMED / REJECTED]

**Evidence:** [what you observed]
```

### Testing Rules

- **One hypothesis at a time** - don't change multiple things
- **Minimal changes** - smallest possible change to test
- **Revert if rejected** - don't leave test code in place
- **Record all attempts** - even failed ones are valuable

### Recording Hypotheses

Update interaction:
```json
{
  "debugInvestigation": {
    "hypotheses": [
      {
        "hypothesis": "[what you thought was wrong]",
        "tested": true,
        "result": "rejected|confirmed"
      },
      {
        "hypothesis": "[second hypothesis]",
        "tested": true,
        "result": "confirmed"
      }
    ]
  }
}
```

### Escalation Rule

If **3+ hypotheses rejected**:

```markdown
## Investigation Escalation

Multiple hypotheses rejected. This may indicate:
- Architectural issue
- Fundamental misunderstanding
- Environmental problem

**Recommend:**
1. Step back and review architecture
2. Check assumptions about how system works
3. Consider asking for help / second opinion

Continue investigating or escalate?
```

---

## Phase 5: Fix and Record

**Fix the root cause, not the symptom.**

### Fix Rules

- **Fix the cause** - not just where error appears
- **Minimal fix** - don't refactor unrelated code
- **Add test** - prevent regression
- **Document why** - future reference

### Fix Template

```markdown
## Root Cause

**Problem:** [what was actually wrong]

**Why it happened:** [underlying reason]

**Fix:** [what change fixes it]

## Implementation

**File:** `[file path]`

**Before:**
```typescript
[broken code]
```

**After:**
```typescript
[fixed code]
```

**Test added:** `[test file if applicable]`
```

### Recording

Update interaction:
```json
{
  "debugInvestigation": {
    "rootCause": "[what was actually wrong]",
    "solution": "[how it was fixed]"
  },
  "choice": "[the fix applied]",
  "reasoning": "[why this fix is correct]",
  "actions": [
    { "type": "edit", "path": "[file]", "summary": "[fix description]" }
  ],
  "filesModified": ["[files changed]"]
}
```

### Save to Patterns (REQUIRED)

**Every solved error MUST be saved to patterns for future reference.**

1. **Check if pattern file exists**:
   ```
   Read: .memoria/patterns/{git-user-name}.json
   If not exists: create new file with empty patterns array
   ```

2. **Add error-solution pattern**:
   ```json
   // .memoria/patterns/{git-user-name}.json
   {
     "id": "pattern-{user}-001",
     "user": { "name": "{git user.name}", "email": "{git user.email}" },
     "patterns": [
       {
         "type": "error-solution",
         "errorPattern": "[representative error message - first line]",
         "errorRegex": "[regex to match similar errors]",
         "solution": "[how to fix - concise]",
         "reasoning": "[why this solution works]",
         "relatedFiles": ["[files typically involved]"],
         "tags": ["[relevant tags from tags.json]"],
         "detectedAt": "[ISO8601]",
         "source": "debug",
         "sourceId": "[session id]",
         "occurrences": 1,
         "lastSeenAt": "[ISO8601]"
       }
     ],
     "updatedAt": "[ISO8601]"
   }
   ```

3. **If pattern already exists** (same errorRegex):
   - Increment `occurrences`
   - Update `lastSeenAt`
   - Optionally update `solution` if improved

**Skip saving only if:**
- Error was due to typo or trivial mistake
- Error was environment-specific (local config issue)

### Commit

```bash
git add [fixed files]
git commit -m "fix: [description of what was fixed]

Root cause: [brief explanation]

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Quick Reference

```
┌─────────────────────────────────────────────────────────────┐
│                    DEBUG WORKFLOW                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. SEARCH MEMORIA                                          │
│     └─> Past solution found? → Consider applying            │
│                                                             │
│  2. INVESTIGATE                                             │
│     ├─> Read error completely                               │
│     ├─> Analyze stack trace                                 │
│     ├─> Find reproduction conditions                        │
│     └─> Check recent changes                                │
│                                                             │
│  3. ANALYZE PATTERNS                                        │
│     ├─> Compare working vs broken                           │
│     └─> Trace data flow                                     │
│                                                             │
│  4. TEST HYPOTHESES                                         │
│     ├─> One at a time                                       │
│     ├─> Minimal changes                                     │
│     └─> 3+ failures = escalate                              │
│                                                             │
│  5. FIX AND RECORD                                          │
│     ├─> Fix root cause                                      │
│     ├─> Add test                                            │
│     ├─> Save to patterns                                    │
│     └─> Commit                                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Completion

After debugging complete:

```markdown
## Debug Complete

**Error:** [brief error description]

**Root cause:** [what was wrong]

**Solution:** [what was fixed]

**Pattern saved:** [yes/no - if saved to patterns]

**Next steps:**
1. Run tests to confirm fix
2. Consider if similar issues exist elsewhere
3. Continue with original task
```
