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
6. **Update current session JSON with `resumedFrom` field**
7. Load session context to resume work

### File Operations

```bash
# Get session list
Glob: .memoria/sessions/**/*.json

# Read each session file
Read: .memoria/sessions/{year}/{month}/{filename}.json

# Update CURRENT session with resumedFrom
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

## Interactions Log:

[int-001] 2026-01-24T10:00:00Z
  User: Implement authentication
  Thinking: JWT would be better for microservices...
  Assistant: Implemented JWT auth with RS256 signing

[int-002] 2026-01-24T10:30:00Z
  User: What should be the refresh token expiry?
  Thinking: Balance between security and UX...
  Assistant: Set to 7 days

---

Ready to continue?
```

## Context Injection

When resuming, inject the following context from the JSON file:

### Structured Data (set by /memoria:save):
1. **Summary**: title, goal, outcome, description, sessionType
2. **Plan**: tasks, remaining → what was planned and what's left
3. **Discussions**: decisions with reasoning and alternatives
4. **Code examples**: significant changes with before/after
5. **Errors**: problems encountered and solutions
6. **Handoff**: stoppedReason, notes, nextSteps → critical for continuity
7. **References**: documents and resources used

### Log Data (auto-saved by SessionEnd):
8. **Title/Tags**: For quick context
9. **Interactions**: Full conversation log with thinking
10. **Files**: What files were changed
11. **PreCompactBackups**: Interactions from before auto-compact (if any)

**Important**:
- All session data is in the JSON file
- Always update the CURRENT session's JSON with `resumedFrom` to track session chains.

## Session Chain Tracking

When resuming session `abc123` in a new session `xyz789`:

1. Read current session path from additionalContext
2. Update current session JSON:
   ```json
   {
     "id": "xyz789",
     "resumedFrom": "abc123",
     ...
   }
   ```
3. This creates a chain: `xyz789 ← abc123`

The chain allows tracking related sessions over time.
