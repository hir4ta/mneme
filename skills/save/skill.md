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

<phases>
Execute all phases in order. Each phase builds on the previous.

- Phase 0: Interactions - Merge preCompactBackups with current conversation
- Phase 1: Summary - Extract session metadata
- Phase 2: Decisions - Save to decisions/
- Phase 3: Patterns - Save to patterns/
- Phase 4: Rules - Extract development standards
</phases>

### Phase 0: Save Conversation History (interactions)

Execute this phase first. Interactions are stored in SQLite (`local.db`) for privacy.
If auto-compact occurred, `pre_compact_backups` table contains earlier conversations.

**Storage Location:**
- **Interactions**: SQLite (`local.db`) - private to each developer
- **Metadata**: JSON (`sessions/*.json`) - shared via Git

**Example scenario:**
```
Session start → 16 interactions → auto-compact → 8 more interactions → /memoria:save

Without merge: Only 8 interactions saved (data loss)
With merge: All 24 interactions saved in SQLite
```

1. Get session path from additionalContext (e.g., `.memoria/sessions/2026/01/abc12345.json`)
2. Get session ID from the path (e.g., `abc12345`)

3. **Check for existing data in SQLite**:
   ```bash
   # Check for pre_compact_backups (most complete source)
   sqlite3 .memoria/local.db "SELECT interactions FROM pre_compact_backups WHERE session_id = 'abc12345' ORDER BY created_at DESC LIMIT 1;"

   # Check existing interactions count
   sqlite3 .memoria/local.db "SELECT COUNT(*) FROM interactions WHERE session_id = 'abc12345';"
   ```

4. **Determine the most complete source**:
   - If `pre_compact_backups` exists, use the **LAST entry** (most complete)
   - Compare with existing `interactions` table - use whichever has more entries
   - The most complete source becomes the "base"

5. **Extract NEW interactions** from current conversation:
   - Scan conversation for messages NOT already in the base
   - Use `timestamp` or `user` message content for matching
   - Typically: everything after the last interaction in base

6. **Merge with deduplication**:
   ```
   base_interactions = most complete source (pre_compact_backups or existing interactions table)
   new_interactions = conversations after the last base interaction

   Final = base_interactions + new_interactions (deduplicated by timestamp)
   ```
   - **Exact match by timestamp** - skip if already exists
   - Preserve `isCompactSummary` flag on summary entries

7. **Insert merged interactions into SQLite**:
   ```bash
   # Clear existing interactions for this session
   sqlite3 .memoria/local.db "DELETE FROM interactions WHERE session_id = 'abc12345';"

   # Insert each interaction
   sqlite3 .memoria/local.db "INSERT INTO interactions (session_id, owner, role, content, thinking, timestamp, is_compact_summary) VALUES (...);"
   ```

8. **Clear pre_compact_backups** (merged into interactions):
   ```bash
   sqlite3 .memoria/local.db "DELETE FROM pre_compact_backups WHERE session_id = 'abc12345';"
   ```

9. **Update session JSON** with files and metrics only (interactions are in SQLite)
10. Set `updatedAt` to current timestamp

**Note:** Interactions are stored in SQLite for privacy. JSON contains only metadata.

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

Scan conversation for development standards. These include both explicit user
instructions and implicit standards from technical discussions.

**Example extraction:**
```
Conversation: "Codex pointed out that all pgvector queries need tenantId for security"

Extracted rule:
{
  "category": "security",
  "rule": "All pgvector queries must include tenantId condition",
  "reasoning": "Multi-tenant data isolation",
  "source": "session:abc12345"
}
```

Scan for user instructions AND technical standards:

#### Dev Rules

<rule-sources>
1. Explicit user instructions: "Use X", "Don't use X", "Always do X", "Never do X"
2. Technical discussions: Security requirements, architectural decisions, best practices from code review
</rule-sources>

**Example - Explicit instruction:**
```
User: "Always validate embedding dimensions before saving"

Rule: {
  "id": "rule-001",
  "key": "validate-embedding-dimensions",
  "text": "Validate embedding dimensions (3072) before saving",
  "category": "architecture",
  "status": "active",
  "createdAt": "2026-01-30T12:00:00Z",
  "updatedAt": "2026-01-30T12:00:00Z"
}
```

**Example - Implicit from discussion:**
```
Codex review: "This query lacks tenantId - multi-tenant security risk"
Discussion concluded: Add tenantId to all pgvector queries

Rule: {
  "id": "rule-002",
  "key": "pgvector-tenantid-required",
  "text": "All pgvector queries must include tenantId condition",
  "category": "security",
  "rationale": "Multi-tenant data isolation",
  "status": "active",
  "createdAt": "2026-01-30T12:00:00Z",
  "updatedAt": "2026-01-30T12:00:00Z"
}
```

**Required fields:** `id`, `key`, `text`, `category`, `status`, `createdAt`, `updatedAt`
**Optional fields:** `rationale`, `priority`

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
# SQLite (interactions - private)
Read + Write: .memoria/local.db
  - interactions table
  - pre_compact_backups table

# Session JSON (metadata - shared)
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

Report each phase result:

```
---
**Session saved.**

**Session ID:** abc12345
**Path:** .memoria/sessions/2026/01/abc12345.json

**Phase 0 - Interactions:** 15 saved to SQLite (8 from pre_compact_backups + 7 new)
**Phase 1 - Summary:**
| Field | Value |
|-------|-------|
| Title | JWT authentication implementation |
| Goal | Implement JWT-based auth |
| Outcome | success |
| Type | implementation |

**Phase 2 - Decisions (2):**
- `[jwt-auth-001]` Authentication method selection → decisions/2026/01/
- `[token-expiry-001]` Token expiry strategy → decisions/2026/01/

**Phase 3 - Patterns (1):**
- `[error-solution]` secretOrPrivateKey must be asymmetric → patterns/user.json

**Phase 4 - Rules:**
  dev-rules.json:
    + [code-style] Use early return pattern
    ~ [architecture] Avoid circular dependencies (skipped: similar exists)

  review-guidelines.json:
    (no changes)
```

If no rules are found, report what was scanned:
```
**Phase 4 - Rules:**
  Scanned for: user instructions, technical standards from Codex review, security requirements
  Result: No new rules identified
```

## Notes

- Session path is shown in additionalContext at session start
- **Interactions are saved to SQLite in Phase 0** - no need to `/exit` first
- Interactions are also auto-saved by SessionEnd hook to SQLite
- **Privacy**: Interactions in SQLite are local to each developer (not in Git)
- **JSON lightness**: Session JSON contains only metadata (no interactions)
- Decisions and patterns are also kept in session JSON for context
- Duplicate checking prevents bloat in decisions/ and patterns/
