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
   - `--type`: Match `sessionType` field
   - `--tag`: Match any tag in `tags` array
   - `--days`: Compare `createdAt` with current date
   - `--branch`: Match `context.branch` field
3. Sort by `createdAt` descending (most recent first)
4. Display filtered session list
5. If session ID specified, read the file and get details
6. Load session context (title, goal, interactions) to resume work

### File Operations

```bash
# Get session list
Glob: .memoria/sessions/**/*.json

# Read each session file
Read: .memoria/sessions/{year}/{month}/{filename}.json

# Read session MD file if exists (for detailed context)
Read: .memoria/sessions/{year}/{month}/{filename}.md

# Filter logic (pseudo-code)
for each session:
  if --type specified and session.sessionType != type: skip
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

  2. [def456] User management API (2026-01-23, feature/user)
     Type: implementation
     Tags: [user] [api]
     Interactions: 2

Select a session to resume (1-2), or enter ID:
```

### Resume View

```
Resuming session "JWT authentication implementation"

Type: implementation
Goal:
  Implement JWT-based auth with refresh token support

Previous decision cycles:

  [int-001] Auth method selection
    Request: Implement authentication
    Choice: JWT (easy auth sharing between microservices)
    Modified: src/auth/jwt.ts, src/auth/middleware.ts

  [int-002] Refresh token expiry
    Request: What should be the refresh token expiry?
    Choice: 7 days (balance between security and UX)
    Modified: src/auth/config.ts

  [int-003] JWT signing error resolution
    Problem: secretOrPrivateKey must be asymmetric
    Choice: Change to RS256 key format (production security)
    Modified: src/auth/jwt.ts

Ready to continue?
```

## Context Injection

When resuming, inject the following context:

### From JSON file:
1. **Purpose**: title, goal → understand session objective
2. **Type**: sessionType → what kind of session this was
3. **Progress**: interactions → what's been decided
4. **Thinking**: interactions[].thinking → reasoning behind decisions
5. **Problems solved**: interactions[].problem → errors encountered
6. **Files changed**: interactions[].filesModified → what's been modified

### From MD file (if exists):
7. **Plans**: タスクリスト, 残タスク → what was planned and what's left
8. **Discussions**: 議論の経緯 → decisions made and alternatives considered
9. **Code examples**: コード例 → specific changes with before/after
10. **References**: 参照情報 → documents and resources used
11. **Handoff**: 次回への引き継ぎ → why stopped, notes for resuming, next steps
12. **Errors**: エラー・解決策 → problems encountered and solutions

**Important**: If an MD file exists alongside the JSON, READ IT. The MD file contains detailed context that the JSON doesn't capture - plans, discussions, code snippets, and handoff notes that are critical for resuming effectively.
