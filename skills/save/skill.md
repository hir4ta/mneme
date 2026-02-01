---
name: save
description: |
  Extract and persist session knowledge including summary, decisions, patterns, and rules.
  Use when: (1) completing a significant work session, (2) making important technical decisions,
  (3) solving complex errors worth documenting, (4) before ending a long session.
---

# /mneme:save

Extract and save all meaningful data from the current session.

## When to Use

**Run at the end of meaningful sessions** to extract:

- Summary (title, goal, outcome)
- Technical decisions → `.mneme/decisions/`
- Error patterns → `.mneme/patterns/`
- Development rules → `.mneme/rules/`

## Usage

```
/mneme:save
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

- Phase 0: Master Session - Identify master and merge child sessions
- Phase 1: Interactions - Merge preCompactBackups with current conversation
- Phase 2: Summary - Extract session metadata (considering ALL interactions)
- Phase 3: Decisions - Save to decisions/
- Phase 4: Patterns - Save to patterns/
- Phase 5: Rules - Extract development standards
</phases>

### Phase 0: Identify Master Session and Merge Children

**Purpose:** Support multiple Claude sessions contributing to one logical mneme session.

1. Get current session path from additionalContext (e.g., `.mneme/sessions/2026/01/xyz78901.json`)
2. Get session ID from the path (e.g., `xyz78901`)

3. **Check for session-link file:**
   ```bash
   Read: .mneme/session-links/xyz78901.json
   ```
   If exists, extract `masterSessionId`. If not, current session IS the master.

4. **Find master session file:**
   ```bash
   Glob: .mneme/sessions/**/{masterSessionId}.json
   ```

5. **Find all child sessions linked to this master:**
   ```bash
   # Read all session-link files
   Glob: .mneme/session-links/*.json

   # Filter by masterSessionId
   for each link:
     if link.masterSessionId == masterSessionId:
       childSessionIds.push(link file's session ID)
   ```

6. **Also check legacy `resumedFrom` chains:**
   ```bash
   # Find sessions where resumedFrom points to master or any child
   Glob: .mneme/sessions/**/*.json
   for each session:
     if session.resumedFrom == masterSessionId or session.resumedFrom in childSessionIds:
       childSessionIds.push(session.id)
   ```

7. **Merge child session data into master:**
   For each child session JSON:
   - Merge `workPeriods` (add any missing entries)
   - Merge `files` (union, deduplicate by path)
   - Merge `discussions` (append unique items)
   - Merge `errors` (append unique items)
   - Merge `metrics.toolUsage` (combine counts)
   - Update `metrics.userMessages` (will be recalculated from SQLite)

8. **Mark child sessions as merged:**
   ```bash
   Edit: .mneme/sessions/{year}/{month}/{childId}.json
   ```
   ```json
   {
     "status": "merged",
     "mergedAt": "2026-01-27T12:00:00Z",
     "masterSessionId": "abc12345"
   }
   ```

**Important:** After this phase, all subsequent operations work on the MASTER session.

### Phase 1: Save Interactions to SQLite

**REQUIRED:** You MUST save interactions to `.mneme/local.db` in this phase.
Do NOT skip this step or delegate to SessionEnd hook.

1. Use master session ID from Phase 0 (e.g., `abc12345`)
2. Get Claude Code session ID from the system (check session context for the full UUID)

3. **Create session-link file** (for SessionEnd hook to find the correct mneme session):
   ```bash
   mkdir -p .mneme/session-links
   ```
   Write to `.mneme/session-links/{claude-session-short-id}.json`:
   ```json
   {
     "masterSessionId": "abc12345",
     "claudeSessionId": "<full-claude-session-id>",
     "createdAt": "<current ISO timestamp>"
   }
   ```
   The claude-session-short-id is the first 8 characters of the Claude Code session ID.

4. **Save interactions using MCP tool:**

   Call the `mneme_save_interactions` MCP tool with:
   - `claudeSessionId`: The full Claude Code session UUID (36 chars)
   - `mnemeSessionId`: The master session ID from Phase 0 (8 chars)

   Example:
   ```
   mcp__mneme-db__mneme_save_interactions({
     claudeSessionId: "86ea2268-ae4d-4f5c-bb38-424d3716061f",
     mnemeSessionId: "abc12345"
   })
   ```

   The tool will:
   - Read the transcript file directly from `~/.claude/projects/`
   - Extract all user/assistant messages with thinking blocks
   - Merge with any pre_compact_backups
   - Save to `.mneme/local.db`

5. **Verify the result:**
   Check the tool response for:
   - `success`: Should be `true`
   - `savedCount`: Number of interactions saved
   - `mergedFromBackup`: Count from pre-compact backup

   If `success` is `false`, check the `message` for error details.

6. **Update session JSON** with files and metrics
7. Set `updatedAt` to current timestamp

**Verification:** Report the savedCount from the MCP tool response to the user.

### Phase 2: Extract Session Data

**Language Detection (IMPORTANT):**
- Detect the language used in the conversation with the user
- ALL generated content (title, summary, decisions, patterns, rules) MUST be in the same language as the user's messages
- If the user writes in Japanese → generate Japanese content
- If the user writes in English → generate English content
- Do NOT default to English; match the user's language

1. Use master session from Phase 0
2. Read master session file (already updated with merged data from Phase 0-1)
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

### Phase 3: Save to decisions/

**For each discussion with a clear decision:**

1. Generate ID from topic: `slugify(topic)-001`
2. Check for duplicates in `.mneme/decisions/`
3. Save to `.mneme/decisions/YYYY/MM/{id}.json`:

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

### Phase 4: Save to patterns/

**For each error that was solved:**

1. Read or create `.mneme/patterns/{git-user-name}.json`
2. Check if similar pattern exists (by errorPattern)
3. Add or update pattern:

```json
{
  "id": "pattern-user-001",
  "user": {"name": "git user.name"},
  "patterns": [
    {
      "type": "error-solution",
      "title": "JWT RS256 requires asymmetric key",
      "description": "secretOrPrivateKey must be an asymmetric key when using RS256",
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

**Required fields:** `type`, `title`, `errorPattern` (for error-solution), `solution`
**Optional fields:** `description`, `errorRegex`, `reasoning`, `relatedFiles`, `tags`, etc.

**If pattern already exists:**
- Increment `occurrences`
- Update `lastSeenAt`
- Optionally improve `solution` if better

**Skip saving if:**
- Error was trivial (typo, syntax error)
- No root cause was identified
- Error was environment-specific

### Phase 5: Extract Rules

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
# Local SQLite (interactions - project-local)
# Location: .mneme/local.db
Read + Write: .mneme/local.db
  - interactions table
  - pre_compact_backups table

# Session JSON (metadata - shared)
Read + Edit: .mneme/sessions/YYYY/MM/{id}.json

# Decisions (create if new)
Read: .mneme/decisions/YYYY/MM/*.json (for duplicate check)
Write: .mneme/decisions/YYYY/MM/{decision-id}.json

# Patterns (merge into user file)
Read + Edit: .mneme/patterns/{git-user-name}.json

# Rules (append)
Read + Edit: .mneme/rules/dev-rules.json
Read + Edit: .mneme/rules/review-guidelines.json
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

**Master Session ID:** abc12345
**Path:** .mneme/sessions/2026/01/abc12345.json

**Phase 0 - Master Session:**
  Master: abc12345
  Children merged: xyz78901, def45678
  Work periods: 3

**Phase 1 - Interactions:** Saved to local.db
  - Link: .mneme/session-links/{claude-session-id}.json
  - Interactions saved: 15 (user: 8, assistant: 7)

**Phase 2 - Summary:**
| Field | Value |
|-------|-------|
| Title | JWT authentication implementation |
| Goal | Implement JWT-based auth |
| Outcome | success |
| Type | implementation |

**Phase 3 - Decisions (2):**
- `[jwt-auth-001]` Authentication method selection → decisions/2026/01/
- `[token-expiry-001]` Token expiry strategy → decisions/2026/01/

**Phase 4 - Patterns (1):**
- `[error-solution]` secretOrPrivateKey must be asymmetric → patterns/user.json

**Phase 5 - Rules:**
  dev-rules.json:
    + [code-style] Use early return pattern
    ~ [architecture] Avoid circular dependencies (skipped: similar exists)

  review-guidelines.json:
    (no changes)
```

If no rules are found, report what was scanned:
```
**Phase 5 - Rules:**
  Scanned for: user instructions, technical standards from Codex review, security requirements
  Result: No new rules identified
```

## Notes

- Session path is shown in additionalContext at session start
- **Phase 1 MUST save interactions** to `.mneme/local.db` immediately - do NOT skip or defer
- SessionEnd hook is only a backup; `/mneme:save` is the primary way to persist interactions
- **Privacy**: Interactions in SQLite are local (`.mneme/local.db` should be gitignored)
- **Project-local storage**: Each project has its own `.mneme/local.db`
- **JSON lightness**: Session JSON contains only metadata (no interactions)
- Decisions and patterns are also kept in session JSON for context
- Duplicate checking prevents bloat in decisions/ and patterns/
