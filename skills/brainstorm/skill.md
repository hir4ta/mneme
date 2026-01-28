---
name: brainstorm
description: |
  You MUST use this before any creative work - creating features,
  building components, adding functionality, or modifying behavior.
  Combines Socratic questioning with past session/decision lookup.
---

# /memoria:brainstorm

Design-first workflow combining Socratic questioning with memoria's long-term memory.

## Invocation

```
/memoria:brainstorm              # Start brainstorming for current task
/memoria:brainstorm "feature"   # Start with specific feature in mind
```

## Workflow Overview

```
Phase 1: Memory Search     → Find relevant past sessions/decisions/patterns
Phase 2: Socratic Questions → Clarify requirements (1 question per message)
Phase 3: Approach Options   → Present 2-3 approaches with tradeoffs
Phase 4: Design Sections    → 200-300 words per section, get approval
Phase 5: Record & Output    → Save to interactions + docs/plans/
```

---

## Phase 1: Memory Search

**Before asking any questions, search memoria for relevant context.**

### Search Procedure

1. **Search sessions** for similar implementations:
   ```
   Glob: .memoria/sessions/**/*.json   # Search title, tags, summary, discussions, errors
   Grep: keywords from user request (feature name, component type, etc.)
   ```

2. **Search decisions** for related architectural choices:
   ```
   Glob: .memoria/decisions/**/*.json
   Read: files and check tags, title, decision fields
   ```

3. **Search patterns** for relevant good/bad/error-solution patterns:
   ```
   Glob: .memoria/patterns/**/*.json
   Read: check type and description fields
   ```

4. **Read tags.json** for tag matching:
   ```
   Read: .memoria/tags.json
   Match: user's request keywords against tag aliases
   ```

### Presentation Format

If relevant memories found, present them FIRST:

```markdown
## Past Context Found

**Similar implementation (2026-01-15):**
> Previously implemented [feature X] using [approach Y].
> Key decisions: [list decisions]
> Outcome: [success/issues encountered]

**Related decisions:**
- [Decision title]: [summary] (status: active)

**Relevant patterns:**
- Good: [pattern description]
- Error-solution: [error] → [solution]
```

If no relevant memories found:
```
No directly relevant past sessions found. Starting fresh design.
```

---

## Phase 2: Socratic Questioning

**CRITICAL: Ask ONE question per message. Wait for user response before next question.**

### Core Questions (ask in order, adapt as needed)

1. **Use case clarification**
   ```
   What specific scenario or use case should this feature support?

   Options (select or describe):
   a) [Specific scenario A]
   b) [Specific scenario B]
   c) [Specific scenario C]
   d) Other: [describe]
   ```

2. **Target user identification**
   ```
   Who will use this feature and what's their context?

   Options:
   a) End users (external)
   b) Developers (internal)
   c) Automated systems (CI/CD, scripts)
   d) Multiple audiences: [specify]
   ```

3. **Success criteria**
   ```
   How will we know this implementation is successful?

   Consider:
   - Functional requirements (what must work)
   - Performance requirements (speed, memory)
   - Quality requirements (test coverage, documentation)
   ```

4. **Constraints identification**
   ```
   What constraints should we consider?

   Possible constraints:
   a) Time: [deadline]
   b) Technology: [must use X, cannot use Y]
   c) Compatibility: [must work with Z]
   d) Other: [specify]
   ```

5. **Integration points**
   ```
   How does this integrate with existing code?

   Areas to consider:
   - Which existing files/modules need modification?
   - What APIs or interfaces need to be maintained?
   - Are there dependencies that might be affected?
   ```

6. **Error scenarios**
   ```
   What error cases should we handle?

   Common categories:
   a) Invalid input
   b) Network/external service failures
   c) Resource constraints
   d) Concurrent access issues
   ```

### Question Rules

- **ONE question per message** - never batch questions
- **Prefer multiple choice** - easier to answer, faster iteration
- **Include "Other" option** - allow custom responses
- **Adapt to context** - skip questions if already answered or obvious
- **Reference memories** - "Based on the previous auth implementation, do you want similar error handling?"

### Completion Criteria

Move to Phase 3 when:
- Core requirements are clear
- Major constraints are identified
- Integration points are understood
- Error handling approach is agreed

---

## Phase 3: Approach Presentation

**Present 2-3 implementation approaches with clear tradeoffs.**

### Presentation Format

```markdown
## Implementation Approaches

### Approach A: [Name] (Recommended)

**Summary**: [1-2 sentence description]

**Pros**:
- [Advantage 1]
- [Advantage 2]

**Cons**:
- [Disadvantage 1]
- [Disadvantage 2]

**Consistency check**: [How this aligns with past decisions]

---

### Approach B: [Name]

**Summary**: [1-2 sentence description]

**Pros**:
- [Advantage 1]
- [Advantage 2]

**Cons**:
- [Disadvantage 1]
- [Disadvantage 2]

---

Which approach do you prefer? (A/B/C/modify)
```

### Approach Rules

- **Recommend one** - put recommended approach first with "(Recommended)"
- **Explain tradeoffs** - be honest about cons
- **Check consistency** - verify alignment with `.memoria/decisions/`
- **Keep it simple** - prefer simpler approaches (YAGNI principle)
- **Allow modification** - user can combine or modify approaches

---

## Phase 4: Design Presentation

**Present design in 200-300 word sections. Get approval after each section.**

### Section Order

1. **Architecture Overview**
   - High-level structure
   - Component relationships
   - Data flow diagram (ASCII or description)

2. **Component Design**
   - Main components/modules
   - Responsibilities of each
   - Interfaces between them

3. **Data Flow**
   - Input → Processing → Output
   - State management
   - Storage (if applicable)

4. **Error Handling**
   - Error types
   - Recovery strategies
   - User feedback

5. **Testing Strategy**
   - Unit test scope
   - Integration test scope
   - Edge cases to cover

### Section Template

```markdown
## [Section Name]

[200-300 words of design content]

---

**Questions about this section?**
- Ready to continue? (yes/modify)
- Need clarification? (ask)
- Want to revise? (describe changes)
```

### Section Rules

- **200-300 words max** per section
- **Wait for approval** before next section
- **Allow revisions** - iterate on each section
- **Apply YAGNI** - remove unnecessary complexity
- **Reference past patterns** - use good patterns, avoid bad patterns from memoria

---

## Phase 5: Record and Output

**Save the design process to memoria and output design document.**

### Record to Session

**Note:** Session interactions are auto-saved by SessionEnd hook. Design discussions should be saved to JSON via `/memoria:save`.

When design is complete, prompt user to run `/memoria:save` to capture:

**JSON discussions field:**
```json
"discussions": [
  {
    "topic": "[Feature name] design",
    "timestamp": "[ISO8601]",
    "options": [
      "[Approach A]: [Summary]",
      "[Approach B]: [Summary]"
    ],
    "decision": "[Selected approach]",
    "reasoning": "[Why this approach was chosen]"
  }
]
```

**JSON plan field (if design document created):**
```json
"plan": {
  "goals": ["[Feature name] design complete"],
  "tasks": [
    "[x] Architecture section approved",
    "[x] Component design approved",
    "[ ] Implementation plan (next: /memoria:plan)"
  ]
}
```

### Record Important Decisions

If architectural decisions were made, create decision records:

```
File: .memoria/decisions/YYYY-MM-DD-[topic]-[id].json

{
  "id": "[topic]-[id]",
  "title": "[Decision title]",
  "decision": "[What was decided]",
  "reasoning": "[Why]",
  "alternatives": ["[Other options considered]"],
  "tags": ["[relevant tags]"],
  "createdAt": "[ISO8601]",
  "source": "brainstorm",
  "status": "active"
}
```

### Output Design Document

Create design document:

```
File: docs/plans/YYYY-MM-DD-[topic]-design.md

# [Feature Name] Design

## Overview
[Goal and scope]

## Architecture
[From Phase 4 Architecture section]

## Components
[From Phase 4 Component section]

## Data Flow
[From Phase 4 Data Flow section]

## Error Handling
[From Phase 4 Error Handling section]

## Testing Strategy
[From Phase 4 Testing section]

## Decisions Made
[List of decisions with reasoning]

## Next Steps
- [ ] Create implementation plan (/memoria:plan)
- [ ] Start TDD implementation (/memoria:tdd)
```

### Commit Design

After design approval:

```bash
git add docs/plans/YYYY-MM-DD-[topic]-design.md
git commit -m "docs: add [topic] design document

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Completion

After brainstorm completion, suggest next steps:

```markdown
## Design Complete

Design document saved to: `docs/plans/YYYY-MM-DD-[topic]-design.md`

**Next steps:**
1. `/memoria:plan` - Create detailed implementation plan with 2-5 minute tasks
2. `/memoria:tdd` - Start test-driven implementation

Ready to proceed with planning?
```
