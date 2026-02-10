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

## Session ID resolution

<required>
- Get the full Claude Session ID from the SessionStart context injected at the top of this conversation (look for `**Claude Session ID:**`)
- Do NOT run any Bash commands to discover the session ID
- NEVER run exploratory commands like `printenv`, `find`, `echo $MNEME_SESSION_ID`, or `ls -t ~/.claude/projects/*/`
</required>

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

# Get interactions via MCP tool (private, project-local)
mneme_get_interactions({ sessionId: "{id}", limit: 50 })

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

Display structured context in this priority order (most critical for continuity first):

```
Resuming session "JWT authentication implementation"

Session chain: current ← abc123
(Updated current session with resumedFrom: abc123)

---

## Handoff (引き継ぎ):

  Stopped: Test creation postponed to next session
  Notes:
    - vitest configured
    - Mock key pair in test/fixtures/
  Next Steps:
    - Create jwt.test.ts
    - Add E2E tests

## Plan (計画と進捗):

  Goals:
    - Implement JWT-based auth with refresh token support
  Tasks:
    - [x] JWT signing method selection
    - [x] Middleware implementation
    - [ ] Add tests
  Remaining:
    - Add tests

## Errors (遭遇したエラー):

  - `secretOrPrivateKey must be asymmetric`
    Context: RS256 signing requires asymmetric key pair
    Solution: Generate RS256 key pair with openssl

## Discussions (設計議論):

  - **Signing algorithm**: RS256 (Security considerations for production)
    Alternatives: HS256 (simpler but requires shared secret)

## Summary:

  Title: JWT authentication implementation
  Goal: Implement JWT-based auth with refresh token support
  Outcome: success
  Type: implementation

## References:

  - [RFC 7519 - JSON Web Token](https://tools.ietf.org/html/rfc7519)
  - File: src/middleware/auth.ts

---

## Recent Interactions (from SQLite):

[int-001] 2026-01-24T10:00:00Z
  User: Implement authentication
  Assistant: Implemented JWT auth with RS256 signing

[int-002] 2026-01-24T10:30:00Z
  User: What should be the refresh token expiry?
  Assistant: Set to 7 days

(Note: If this session was created by another user, interactions won't be available - only metadata from JSON)

---

Ready to continue?
```

**Display rules:**
- Only show sections that have data (skip empty/missing sections)
- **Handoff first**: most critical for immediate context restoration
- **Plan second**: shows what's done and what remains
- **Errors third**: prevents re-encountering solved problems
- **Discussions fourth**: preserves decision rationale
- Interactions are supplementary — the structured data above is the primary context

## Failure conditions

- Target session not found.
- Session-link write failed.

## Context Injection

When resuming, inject context from JSON (metadata) and SQLite (interactions).
**Priority order** (most critical for continuity first):

### 1. Handoff (from JSON — critical for continuity)
- `stoppedReason`: Why the previous session ended
- `notes`: Important context that must be carried over
- `nextSteps`: Concrete actions to take next
- **This is the single most important section for seamless resume.**

### 2. Plan (from JSON — shows progress)
- `goals`: What the session aimed to accomplish
- `tasks`: What was done (marked `[x]`) and what wasn't
- `remaining`: Explicitly listed remaining work

### 3. Errors (from JSON — prevents re-encountering solved problems)
- `error`: What went wrong
- `solution`: How it was resolved
- `files`: Which files were involved

### 4. Discussions (from JSON — preserves decision rationale)
- `topic` + `decision`: What was decided
- `reasoning`: Why that choice was made
- `alternatives`: What was considered but rejected
- **Critical for avoiding re-discussion of settled decisions.**

### 5. Summary (from JSON — high-level context)
- `title`, `goal`, `outcome`, `description`, `sessionType`
- `tags`, `files`, `metrics`

### 6. References (from JSON — external resources)
- URLs of official docs, Stack Overflow answers, etc.
- Local file paths that were important

### 7. Interactions (from SQLite — detailed conversation log)
- Full conversation history with thinking (private, local only)
- Supplementary to structured data above

**Display rules:**
- Only show sections that have data (skip empty/missing fields)
- Structured data (1-6) takes priority over raw interactions (7)
- If structured data is rich, interactions can be summarized or truncated

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
