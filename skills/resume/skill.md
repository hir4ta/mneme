---
name: resume
description: Resume a previous session. Show list if ID is omitted.
---

# /memoria:resume

Resume a previous session.

## Usage

```
/memoria:resume              # Show recent sessions
/memoria:resume <id>         # Resume specific session
/memoria:resume --type=implementation  # Filter by session type
/memoria:resume --tag=auth   # Filter by tag
/memoria:resume --days=7     # Filter by last N days
/memoria:resume --branch=feature/auth  # Filter by branch
```

### Filter Options

| Option | Description | Example |
|--------|-------------|---------|
| `--type=<type>` | Filter by sessionType | `--type=implementation` |
| `--tag=<tag>` | Filter by tag | `--tag=auth` |
| `--days=<n>` | Filter by last N days | `--days=7` |
| `--branch=<name>` | Filter by branch | `--branch=main` |

Multiple filters can be combined:
```
/memoria:resume --type=implementation --days=14
```

### Session Types

| Type | Description |
|------|-------------|
| `decision` | Decision cycle present |
| `implementation` | Code changes made |
| `research` | Research, learning |
| `exploration` | Codebase exploration |
| `discussion` | Discussion only |
| `debug` | Debugging |
| `review` | Code review |

## Execution Steps

1. Read all JSON files under `.memoria/sessions/` (including year/month folders)
2. Apply filters if specified:
   - `--type`: Match `summary.sessionType` or `sessionType` field
   - `--tag`: Match any tag in `tags` array
   - `--days`: Compare `createdAt` with current date
   - `--branch`: Match `context.branch` field
3. Sort by `createdAt` descending (most recent first)
4. Display filtered session list
5. If session ID specified, read the JSON file and get details
6. **Create session-link file** (new master session support)
7. **Update master session JSON with `workPeriods` entry**
8. **Update current session JSON with `resumedFrom` field** (legacy, for backwards compatibility)
9. Load session context to resume work

### File Operations

```bash
# Get session list
Glob: .memoria/sessions/**/*.json

# Read each session file (metadata)
Read: .memoria/sessions/{year}/{month}/{filename}.json

# Get interactions from SQLite (private, local only)
sqlite3 .memoria/local.db "SELECT * FROM interactions WHERE session_id = '{id}' ORDER BY timestamp;"

# Create session-link file (NEW - master session support)
# This links current Claude session to the master memoria session
Write: .memoria/session-links/{current_session_short_id}.json
  → {"masterSessionId": "{resumed_session_id}", "claudeSessionId": "{current_full_session_id}", "linkedAt": "{now}"}

# Update MASTER session with workPeriods entry (NEW)
Edit: .memoria/sessions/{master_year}/{master_month}/{master_id}.json
  → Add entry to workPeriods array: {"claudeSessionId": "{current_full_session_id}", "startedAt": "{now}", "endedAt": null}

# Update CURRENT session with resumedFrom (legacy, for backwards compatibility)
Edit: .memoria/sessions/{current_year}/{current_month}/{current_id}.json
  → Add "resumedFrom": "{resumed_session_id}"

# Filter logic (pseudo-code)
for each session:
  if --type specified and session.summary?.sessionType != type: skip
  if --tag specified and tag not in session.tags: skip
  if --days specified and session.createdAt < (now - days): skip
  if --branch specified and session.context.branch != branch: skip
```

## Output Format

### List View

```
Recent sessions (filtered: --type=implementation --days=14):

  1. [abc123] JWT authentication implementation (2026-01-24, feature/auth)
     Type: implementation
     Tags: [auth] [jwt] [backend]
     Interactions: 3
     Has Summary: Yes

  2. [def456] User management API (2026-01-23, feature/user)
     Type: implementation
     Tags: [user] [api]
     Interactions: 2
     Has Summary: No

Select a session to resume (1-2), or enter ID:
```

### Resume View

```
Resuming session "JWT authentication implementation"

Session chain: current ← abc123
(Updated current session with resumedFrom: abc123)

---

## Summary:

  Title: JWT authentication implementation
  Goal: Implement JWT-based auth with refresh token support
  Outcome: success
  Type: implementation

## Plan:

  Tasks:
    - [x] JWT signing method selection
    - [x] Middleware implementation
    - [ ] Add tests
  Remaining:
    - Add tests

## Discussions:

  - Signing algorithm: RS256 (Security considerations for production)

## Handoff:

  Stopped: Test creation postponed to next session
  Notes:
    - vitest configured
    - Mock key pair in test/fixtures/
  Next:
    - Create jwt.test.ts
    - Add E2E tests

## Errors:

  - secretOrPrivateKey must be asymmetric → Generate RS256 key pair

---

## Interactions Log (from SQLite):

[int-001] 2026-01-24T10:00:00Z
  User: Implement authentication
  Thinking: JWT would be better for microservices...
  Assistant: Implemented JWT auth with RS256 signing

[int-002] 2026-01-24T10:30:00Z
  User: What should be the refresh token expiry?
  Thinking: Balance between security and UX...
  Assistant: Set to 7 days

(Note: If this session was created by another user, interactions won't be available - only metadata from JSON)

---

Ready to continue?
```

## Context Injection

When resuming, inject context from JSON (metadata) and SQLite (interactions):

### Structured Data (from JSON, set by /memoria:save):
1. **Summary**: title, goal, outcome, description, sessionType
2. **Plan**: tasks, remaining → what was planned and what's left
3. **Discussions**: decisions with reasoning and alternatives
4. **Code examples**: significant changes with before/after
5. **Errors**: problems encountered and solutions
6. **Handoff**: stoppedReason, notes, nextSteps → critical for continuity
7. **References**: documents and resources used

### Log Data (from JSON, auto-saved by SessionEnd):
8. **Title/Tags**: For quick context
9. **Files**: What files were changed
10. **Metrics**: Message counts, tool usage

### Interactions (from SQLite, auto-saved by SessionEnd):
11. **Interactions**: Full conversation log with thinking (private, local only)

**Privacy Note**: Interactions are stored in SQLite (`local.db`) and are private to each developer.
If you're resuming a session created by another team member, interactions won't be available.

**Important**:
- JSON contains metadata (shared via Git)
- SQLite contains interactions (local, private)
- Always update the CURRENT session's JSON with `resumedFrom` to track session chains.

## Session Chain Tracking (Master Session Support)

When resuming session `abc123` (master) in a new Claude session `xyz789`:

### Step 1: Create session-link file

```bash
# Create .memoria/session-links/ directory if not exists
mkdir -p .memoria/session-links/

# Write session-link file
Write: .memoria/session-links/xyz78901.json
```

```json
{
  "masterSessionId": "abc12345",
  "claudeSessionId": "xyz78901-38e9-464d-9b7c-a9cdca203b5e",
  "linkedAt": "2026-01-27T09:10:00Z"
}
```

### Step 2: Update master session workPeriods

```bash
Edit: .memoria/sessions/{year}/{month}/abc12345.json
```

Add to `workPeriods` array:
```json
{
  "workPeriods": [
    {"claudeSessionId": "abc12345-...", "startedAt": "...", "endedAt": "..."},
    {"claudeSessionId": "xyz78901-...", "startedAt": "2026-01-27T09:10:00Z", "endedAt": null}
  ]
}
```

### Step 3: Update current session (legacy, backwards compatibility)

```bash
Edit: .memoria/sessions/{year}/{month}/xyz78901.json
```

```json
{
  "id": "xyz78901",
  "resumedFrom": "abc12345",
  ...
}
```

### Result

- **session-link file**: Links Claude session → memoria master session
- **workPeriods**: Tracks all work periods in the master session
- **resumedFrom**: Legacy chain tracking (backwards compatible)

This design allows:
1. Multiple Claude sessions to contribute to one logical memoria session
2. `/memoria:save` to merge all data into the master session
3. Dashboard to show unified conversation history
