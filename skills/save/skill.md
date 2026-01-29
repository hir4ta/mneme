---
name: save
description: Extract all data from session - summary, decisions, patterns, rules.
---

# /memoria:save

Extract and save all meaningful data from the current session.

## When to Use

**Run at the end of meaningful sessions** to extract:

- Summary (title, goal, outcome)
- Technical decisions → `.memoria/decisions/`
- Error patterns → `.memoria/patterns/`
- Development rules → `.memoria/rules/`

## Usage

```
/memoria:save
```

## What Gets Saved

| Data | Source | Destination |
|------|--------|-------------|
| Summary | Conversation | sessions/{id}.json |
| Discussions | Conversation | sessions/{id}.json + **decisions/{id}.json** |
| Errors | Conversation | sessions/{id}.json + **patterns/{user}.json** |
| Dev rules | User instructions | rules/dev-rules.json |
| Review guidelines | User instructions | rules/review-guidelines.json |

## Execution Steps

### Phase 0: Save Conversation History (interactions)

**IMPORTANT: Do this FIRST before any other extraction.**

1. Get session path from additionalContext (e.g., `.memoria/sessions/2026/01/abc12345.json`)
2. Read current session file
3. **Check for existing data**:
   - Read `.interactions` (may have data from previous SessionEnd)
   - Read `.preCompactBackups` (may have data from auto-compact)

4. **Determine the most complete source**:
   - If `preCompactBackups` exists, use the **LAST entry** (most complete, includes all previous)
   - Compare with existing `.interactions` - use whichever has more entries or later timestamps
   - The most complete source becomes the "base"

5. **Extract NEW interactions** from current conversation:
   - Scan conversation for messages NOT already in the base
   - Use `timestamp` or `user` message content for matching
   - Typically: everything after the last interaction in base

6. **Merge with deduplication**:
   ```
   base_interactions = most complete source (preCompactBackups[-1] or existing .interactions)
   new_interactions = conversations after the last base interaction

   Final = base_interactions + new_interactions (deduplicated by timestamp)
   ```
   - **Exact match by timestamp** - skip if already exists
   - **Fallback: match by user message content** (first 100 chars) if timestamps differ
   - Preserve `isCompactSummary` flag on summary entries

6. **Format each interaction**:
```json
{
  "id": "int-001",
  "timestamp": "2026-01-29T10:00:00Z",
  "user": "User's message text",
  "thinking": "Claude's thinking/reasoning (if visible)",
  "assistant": "Claude's response text",
  "isCompactSummary": false
}
```

7. **Extract file changes** from tool usage (Edit/Write tools):
```json
{
  "files": [
    {"path": "src/index.ts", "action": "edit"},
    {"path": "src/new-file.ts", "action": "create"}
  ]
}
```

8. **Calculate metrics** (from ALL interactions including backups):
```json
{
  "metrics": {
    "userMessages": 10,
    "assistantResponses": 10,
    "thinkingBlocks": 8,
    "toolUsage": [
      {"name": "Edit", "count": 5},
      {"name": "Read", "count": 12}
    ]
  }
}
```

9. **Update session JSON** with merged interactions, files, metrics using Edit tool
10. Set `updatedAt` to current timestamp

**Note:** This ensures ALL conversation history is saved, including pre-auto-compact conversations.

### Phase 1: Extract Session Data

1. Get session path from additionalContext
2. Read current session file (already updated with interactions in Phase 0)
3. **Scan entire conversation** (including long sessions) to extract:

#### Summary
```json
{
  "title": "Brief descriptive title",
  "goal": "What was trying to be achieved",
  "outcome": "success | partial | failed | ongoing",
  "description": "What was accomplished",
  "sessionType": "decision | implementation | research | exploration | discussion | debug | review"
}
```

**sessionType selection criteria:**
| Type | When to use |
|------|-------------|
| `decision` | Made design choices or technology selections |
| `implementation` | Made code changes |
| `research` | Researched, learned, or investigated topics |
| `exploration` | Explored and understood the codebase |
| `discussion` | Discussion only (no code changes) |
| `debug` | Debugged or investigated bugs |
| `review` | Performed code review |

#### Discussions (→ also saved to decisions/)
```json
{
  "topic": "What was discussed",
  "decision": "What was decided",
  "reasoning": "Why this decision",
  "alternatives": ["Other options considered"]
}
```

#### Errors (→ also saved to patterns/)
```json
{
  "error": "Error message (first line)",
  "context": "What was being done",
  "cause": "Root cause identified",
  "solution": "How it was fixed",
  "files": ["Related files"]
}
```

#### Other Fields
- **plan**: tasks[], remaining[]
- **handoff**: stoppedReason, notes, nextSteps
- **references**: URLs and files referenced

### Phase 2: Save to decisions/

**For each discussion with a clear decision:**

1. Generate ID from topic: `slugify(topic)-001`
2. Check for duplicates in `.memoria/decisions/`
3. Save to `.memoria/decisions/YYYY/MM/{id}.json`:

```json
{
  "id": "jwt-auth-001",
  "title": "Authentication method selection",
  "decision": "Use JWT with RS256",
  "reasoning": "Stateless, scalable, secure for microservices",
  "alternatives": [
    {"name": "Session Cookie", "reason": "Requires server-side state"}
  ],
  "tags": ["auth", "architecture"],
  "createdAt": "2026-01-27T10:00:00Z",
  "user": {"name": "git user.name"},
  "context": {
    "branch": "feature/auth",
    "projectDir": "/path/to/project"
  },
  "relatedSessions": ["abc12345"],
  "source": "save",
  "status": "active"
}
```

**Skip saving if:**
- No clear decision was made (just discussion)
- Similar decision already exists (check by title/topic)

### Phase 3: Save to patterns/

**For each error that was solved:**

1. Read or create `.memoria/patterns/{git-user-name}.json`
2. Check if similar pattern exists (by errorPattern)
3. Add or update pattern:

```json
{
  "id": "pattern-user-001",
  "user": {"name": "git user.name"},
  "patterns": [
    {
      "type": "error-solution",
      "errorPattern": "secretOrPrivateKey must be asymmetric",
      "errorRegex": "secretOrPrivateKey.*asymmetric",
      "solution": "Generate RS256 key pair instead of using symmetric secret",
      "reasoning": "RS256 requires asymmetric keys",
      "relatedFiles": ["src/auth/jwt.ts"],
      "tags": ["jwt", "auth"],
      "detectedAt": "2026-01-27T10:00:00Z",
      "source": "save",
      "sourceId": "abc12345",
      "occurrences": 1,
      "lastSeenAt": "2026-01-27T10:00:00Z"
    }
  ],
  "updatedAt": "2026-01-27T10:00:00Z"
}
```

**If pattern already exists:**
- Increment `occurrences`
- Update `lastSeenAt`
- Optionally improve `solution` if better

**Skip saving if:**
- Error was trivial (typo, syntax error)
- No root cause was identified
- Error was environment-specific

### Phase 4: Extract Rules

Scan conversation for user instructions:

#### Dev Rules
Look for:
- "Use X"
- "Don't use X"
- "Write with X pattern"
- "Always do X"

Categories: `code-style`, `architecture`, `error-handling`, `performance`, `security`, `testing`, `other`

#### Review Guidelines
Look for:
- "Check X in reviews"
- "Point out X"

Categories: `must-check`, `warning`, `suggestion`, `other`

#### Duplicate Check
Before adding:
1. Read existing items
2. Compare semantically
3. Skip if similar exists

### File Operations

```bash
# Session JSON
Read + Edit: .memoria/sessions/YYYY/MM/{id}.json

# Decisions (create if new)
Read: .memoria/decisions/YYYY/MM/*.json (for duplicate check)
Write: .memoria/decisions/YYYY/MM/{decision-id}.json

# Patterns (merge into user file)
Read + Edit: .memoria/patterns/{git-user-name}.json

# Rules (append)
Read + Edit: .memoria/rules/dev-rules.json
Read + Edit: .memoria/rules/review-guidelines.json
```

## Handling Long Sessions

**For sessions with many interactions:**

1. **Scan chronologically** - Process from start to end
2. **Group related items** - Combine related discussions/errors
3. **Prioritize significant items**:
   - Decisions that changed direction
   - Errors that took time to solve
   - Rules explicitly stated by user
4. **Don't truncate** - Extract all meaningful data

## Output Format

```
Session saved.

Session ID: abc12345
Path: .memoria/sessions/2026/01/abc12345.json

Interactions: 15 saved
Files changed: 8

Summary:
  Title: JWT authentication implementation
  Goal: Implement JWT-based auth
  Outcome: success
  Type: implementation

Decisions saved (2):
  + [jwt-auth-001] Authentication method selection → decisions/2026/01/jwt-auth-001.json
  + [token-expiry-001] Token expiry strategy → decisions/2026/01/token-expiry-001.json

Patterns saved (1):
  + [error-solution] secretOrPrivateKey must be asymmetric → patterns/user.json

Rules updated:
  dev-rules.json:
    + [code-style] Use early return pattern
    ~ [architecture] Avoid circular dependencies (skipped: similar exists)

  review-guidelines.json:
    (no changes)
```

## Notes

- Session path is shown in additionalContext at session start
- **Interactions are saved in Phase 0** - no need to `/exit` first
- Interactions are also auto-saved by SessionEnd hook (backup)
- Decisions and patterns are also kept in session JSON for context
- Duplicate checking prevents bloat in decisions/ and patterns/
