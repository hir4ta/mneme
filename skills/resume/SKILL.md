---
name: resume
description: |
  Resume a previous session with full context restoration.
  Use when: (1) continuing work from a previous session, (2) reviewing past session details,
  (3) picking up where you left off after a break.
argument-hint: "[session-id]"
disable-model-invocation: true
---

# /mneme:resume

Resume a previous session.

## Required constraints

<required>
- Do not mutate historical session content except resume metadata fields.
- Ensure `session-links/{current}.json` points to the selected master session.
- Preserve backward compatibility fields (`resumedFrom`) when present.
</required>

## Usage

```
/mneme:resume              # Show recent sessions
/mneme:resume <id>         # Resume specific session
/mneme:resume --type=implementation  # Filter by session type
/mneme:resume --tag=auth   # Filter by tag
/mneme:resume --days=7     # Filter by last N days
/mneme:resume --branch=feature/auth  # Filter by branch
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
/mneme:resume --type=implementation --days=14
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

1. Parse `$ARGUMENTS` to extract session ID or filter flags (e.g. `--type=implementation --days=7`).
2. Read all JSON files under `.mneme/sessions/` (including year/month folders).
3. Apply filters if specified:
   - `--type`: Match `summary.sessionType` or `sessionType` field
   - `--tag`: Match any tag in `tags` array
   - `--days`: Compare `createdAt` with current date
   - `--branch`: Match `context.branch` field
4. Sort by `createdAt` descending (most recent first)
5. Display filtered session list
6. If session ID specified, read the JSON file and get details
7. **Create session-link file** (new master session support)
8. **Update master session JSON with `workPeriods` entry**
9. **Update current session JSON with `resumedFrom` field** (legacy, for backwards compatibility)
10. Load session context to resume work

### File Operations

```bash
# Get session list
Glob: .mneme/sessions/**/*.json

# Read each session file (metadata)
Read: .mneme/sessions/{year}/{month}/{filename}.json

# Get interactions from local SQLite (private, project-local)
# Local DB location: .mneme/local.db
sqlite3 ".mneme/local.db" "SELECT * FROM interactions WHERE session_id = '{id}' ORDER BY timestamp;"

# Create session-link file (NEW - master session support)
# This links current Claude session to the master mneme session
Write: .mneme/session-links/{current_session_short_id}.json
  → {"masterSessionId": "{resumed_session_id}", "claudeSessionId": "{current_full_session_id}", "linkedAt": "{now}"}

# Update MASTER session with workPeriods entry (NEW)
Edit: .mneme/sessions/{master_year}/{master_month}/{master_id}.json
  → Add entry to workPeriods array: {"claudeSessionId": "{current_full_session_id}", "startedAt": "{now}", "endedAt": null}

# Update CURRENT session with resumedFrom (legacy, for backwards compatibility)
Edit: .mneme/sessions/{current_year}/{current_month}/{current_id}.json
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

## Failure conditions

- Target session not found.
- Session-link write failed.

## Context Injection

When resuming, inject context from JSON (metadata) and SQLite (interactions):

### Structured Data (from JSON, set by /mneme:save):
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

**Privacy Note**: Interactions are stored in project-local SQLite (`.mneme/local.db`) and are private to each developer.
If you're resuming a session created by another team member, interactions won't be available.

**Important**:
- JSON contains metadata (shared via Git)
- SQLite contains interactions (local, private)
- Always update the CURRENT session's JSON with `resumedFrom` to track session chains.

## Session Chain Tracking (Master Session Support)

When resuming session `abc123` (master) in a new Claude session `xyz789`:

### Step 1: Create session-link file

```bash
# Create .mneme/session-links/ directory if not exists
mkdir -p .mneme/session-links/

# Write session-link file
Write: .mneme/session-links/xyz78901.json
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
Edit: .mneme/sessions/{year}/{month}/abc12345.json
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
Edit: .mneme/sessions/{year}/{month}/xyz78901.json
```

```json
{
  "id": "xyz78901",
  "resumedFrom": "abc12345",
  ...
}
```

### Result

- **session-link file**: Links Claude session → mneme master session
- **workPeriods**: Tracks all work periods in the master session
- **resumedFrom**: Legacy chain tracking (backwards compatible)

This design allows:
1. Multiple Claude sessions to contribute to one logical mneme session
2. `/mneme:save` to merge all data into the master session
3. Dashboard to show unified conversation history
