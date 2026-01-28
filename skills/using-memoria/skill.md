---
name: using-memoria
description: How to use memoria - auto-loaded at session start
---

# Using memoria

memoria is a long-term memory plugin for Claude Code.

## Features

1. **Auto-save interactions**: Conversations auto-saved at session end (jq-based, no Claude needed)
2. **Backup on PreCompact**: Interactions backed up before Auto-Compact (context 95% full)
3. **Manual save**: `/memoria:save` for summary creation and structured data
4. **Session resume**: `/memoria:resume` to restore past sessions with chain tracking
5. **Knowledge search**: `/memoria:search` to find saved information
6. **Rule-based review**: `/memoria:review` for code review based on rules
7. **Weekly reports**: `/memoria:report` to generate review summary
8. **Web dashboard**: Visual management of sessions and decisions
9. **Brainstorming**: `/memoria:brainstorm` for design-first workflow
10. **Planning**: `/memoria:plan` for detailed implementation plans
11. **TDD**: `/memoria:tdd` for RED-GREEN-REFACTOR workflow (recommended)
12. **Debugging**: `/memoria:debug` for systematic root cause analysis

## Recommended Workflow

```
brainstorm → plan → tdd → review
```

1. **brainstorm**: Design with Socratic questions + past memory lookup
2. **plan**: Break into 2-5 minute TDD tasks
3. **tdd**: Implement with RED → GREEN → REFACTOR
4. **review**: Verify against plan (--full) and code quality

## Session Saving

### Auto-Save (at Session End)

**Interactions are auto-saved** by SessionEnd hook using jq:

```
[Session ends] → [SessionEnd hook] → [jq extracts from transcript] → [JSON updated]
```

Automatically saved to JSON:
- User messages
- Assistant responses (including thinking blocks)
- Tool usage
- File changes

### PreCompact (Backup Only)

When context reaches 95%, interactions are backed up to `preCompactBackups`:

```
[Context 95%] → [PreCompact hook] → [Backup interactions] → [Continue compaction]
```

**Note:** PreCompact does NOT create summary. Summary creation is manual only.

### Manual Save (`/memoria:save`)

Use for:
- Creating session summary (title, goal, outcome, description)
- Adding structured data (plan, discussions, errors, handoff, references)
- Extracting development rules to `dev-rules.json`
- Extracting review guidelines to `review-guidelines.json`

### What Gets Saved

All data is stored in a single JSON file per session:

| Field | When | Source |
|-------|------|--------|
| interactions | SessionEnd | Auto (jq) |
| files | SessionEnd | Auto (jq) |
| metrics | SessionEnd | Auto (jq) |
| title, tags | /memoria:save | Manual |
| summary | /memoria:save | Manual |
| plan | /memoria:save | Manual |
| discussions | /memoria:save | Manual |
| codeExamples | /memoria:save | Manual |
| errors | /memoria:save | Manual |
| handoff | /memoria:save | Manual |
| references | /memoria:save | Manual |
| preCompactBackups | PreCompact | Auto (jq) |
| resumedFrom | /memoria:resume | Auto |

## Session Resume & Chain Tracking

When resuming a session, memoria tracks the chain:

```
/memoria:resume abc123
  ↓
Current session JSON updated: "resumedFrom": "abc123"
  ↓
Chain: current ← abc123
```

This allows tracking related sessions over time.

## Commands

| Command | Description |
|---------|-------------|
| `/memoria:resume [id]` | Resume session (omit ID for list) |
| `/memoria:save` | Create summary + structured data + extract rules |
| `/memoria:search <query>` | Search knowledge |
| `/memoria:review [--staged\|--all\|--diff=branch\|--full]` | Rule-based review |
| `/memoria:report [--from YYYY-MM-DD --to YYYY-MM-DD]` | Weekly review report |
| `/memoria:brainstorm [topic]` | Design-first Socratic questioning |
| `/memoria:plan [topic]` | Create implementation plan |
| `/memoria:tdd` | Strict RED-GREEN-REFACTOR cycle |
| `/memoria:debug` | Systematic debugging |

## Dashboard

```bash
npx @hir4ta/memoria --dashboard
```

## Data Location

`.memoria/` directory stores session data:

```
.memoria/
├── tags.json         # Tag master file
├── sessions/         # Session history
│   └── YYYY/MM/
│       └── {id}.json # All session data (auto + manual save)
├── decisions/        # Technical decisions
├── rules/            # Dev rules / review guidelines
├── reviews/          # Review results
└── reports/          # Weekly reports
```

## JSON File Schema

All session data is stored in a single JSON file:

```json
{
  "id": "abc12345",
  "sessionId": "full-uuid",
  "createdAt": "2026-01-26T10:00:00Z",
  "endedAt": "2026-01-26T11:00:00Z",
  "title": "JWT authentication implementation",
  "tags": ["auth", "jwt"],
  "context": {
    "branch": "feature/auth",
    "projectDir": "/path/to/project",
    "user": { "name": "user" }
  },
  "interactions": [
    {
      "id": "int-001",
      "timestamp": "2026-01-26T10:15:00Z",
      "user": "Implement authentication",
      "assistant": "Implemented JWT auth with RS256 signing",
      "thinking": "Key insights from thinking process"
    }
  ],
  "metrics": {
    "userMessages": 5,
    "assistantResponses": 5,
    "thinkingBlocks": 5,
    "toolUsage": [{"name": "Edit", "count": 3}]
  },
  "files": [
    {"path": "src/auth.ts", "action": "create"}
  ],
  "preCompactBackups": [],
  "resumedFrom": "def456",
  "status": "complete",

  "summary": {
    "title": "JWT authentication implementation",
    "goal": "Implement JWT-based auth",
    "outcome": "success",
    "description": "Implemented JWT auth with RS256 signing",
    "sessionType": "implementation"
  },

  "plan": {
    "tasks": ["[x] JWT signing selection", "[ ] Add tests"],
    "remaining": ["Add tests"]
  },

  "discussions": [
    {
      "topic": "Signing algorithm",
      "decision": "RS256",
      "reasoning": "Security for production",
      "alternatives": ["HS256"]
    }
  ],

  "errors": [
    {
      "error": "secretOrPrivateKey must be asymmetric",
      "cause": "Used HS256 secret with RS256",
      "solution": "Generate RS256 key pair"
    }
  ],

  "handoff": {
    "stoppedReason": "Test creation postponed",
    "notes": ["vitest configured"],
    "nextSteps": ["Create jwt.test.ts"]
  },

  "references": [
    {"url": "https://jwt.io/introduction", "title": "JWT Introduction"}
  ]
}
```

### sessionType Values

| Value | Description |
|-------|-------------|
| `decision` | Design choices, tech selection |
| `implementation` | Code changes made |
| `research` | Research, learning |
| `exploration` | Codebase exploration |
| `discussion` | Discussion only |
| `debug` | Debugging, investigation |
| `review` | Code review |

## tags.json (Tag Master)

Reference when selecting tags to prevent notation variations:

```json
{
  "version": 1,
  "tags": [
    {
      "id": "frontend",
      "label": "Frontend",
      "aliases": ["front", "フロント", "client"],
      "category": "domain",
      "color": "#3B82F6"
    }
  ]
}
```
