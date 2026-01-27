---
name: using-memoria
description: How to use memoria - auto-loaded at session start
---

# Using memoria

memoria is a long-term memory plugin for Claude Code.

## Features

1. **Auto-save**: Sessions saved automatically on every Claude response
2. **Session resume**: `/memoria:resume` to restore past sessions
3. **Knowledge search**: `/memoria:search` to find saved information
4. **Rule-based review**: `/memoria:review` for code review based on rules
5. **Weekly reports**: `/memoria:report` to generate review summary
6. **Web dashboard**: Visual management of sessions and decisions
7. **Brainstorming**: `/memoria:brainstorm` for design-first workflow
8. **Planning**: `/memoria:plan` for detailed implementation plans
9. **TDD**: `/memoria:tdd` for strict RED-GREEN-REFACTOR enforcement
10. **Debugging**: `/memoria:debug` for systematic root cause analysis

## Recommended Workflow

```
brainstorm → plan → tdd → review
```

1. **brainstorm**: Design with Socratic questions + past memory lookup
2. **plan**: Break into 2-5 minute TDD tasks
3. **tdd**: Implement with RED → GREEN → REFACTOR
4. **review**: Verify against plan (--full) and code quality

## Session Auto-Save

Sessions are saved **automatically on every Claude response** via Stop hook.

### How It Works

```
[Claude responds] → [Stop hook] → [Claude updates session JSON] → [Done]
```

On each response, Claude automatically:
1. Adds conversation to `interactions` array
2. Updates `summary` with current state
3. Updates `metrics` (files, decisions, errors)

### What Gets Saved

| Field | Description |
|-------|-------------|
| summary | title, goal, outcome, description |
| interactions | Chat-style conversation log |
| metrics | File counts, decision counts, error counts |
| files | File changes with action and summary |
| decisions | Technical decisions with reasoning |
| errors | Errors encountered and solutions |
| tags | Related keywords |

### Manual Save

Use `/memoria:save` to:
- Extract development rules to `dev-rules.json`
- Extract review guidelines to `review-guidelines.json`
- Force update if auto-save missed something

## Commands

| Command | Description |
|---------|-------------|
| `/memoria:resume [id]` | Resume session (omit ID for list) |
| `/memoria:save` | Extract rules + manual update |
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

`.memoria/` directory stores JSON files:

```
.memoria/
├── tags.json         # Tag master file
├── sessions/         # Session history (auto-saved)
├── decisions/        # Technical decisions
├── rules/            # Dev rules / review guidelines
├── reviews/          # Review results
└── reports/          # Weekly reports
```

## Session JSON Schema

```json
{
  "id": "abc12345",
  "sessionId": "full-uuid",
  "createdAt": "2026-01-26T10:00:00Z",
  "context": {
    "branch": "feature/auth",
    "projectDir": "/path/to/project",
    "user": { "name": "user" }
  },
  "summary": {
    "title": "JWT authentication implementation",
    "goal": "Implement JWT-based auth",
    "outcome": "success",
    "description": "Implemented JWT auth with RS256 signing"
  },
  "interactions": [
    {
      "timestamp": "2026-01-26T10:15:00Z",
      "user": "Implement authentication",
      "assistant": "Implemented JWT auth with RS256 signing",
      "toolsUsed": ["Read", "Edit", "Write"]
    }
  ],
  "metrics": {
    "filesCreated": 2,
    "filesModified": 1,
    "decisionsCount": 1,
    "errorsEncountered": 1,
    "errorsResolved": 1
  },
  "files": [...],
  "decisions": [...],
  "errors": [...],
  "tags": ["auth", "jwt"],
  "sessionType": "implementation",
  "status": "complete"
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

## Decision JSON Schema

```json
{
  "id": "jwt-auth-001",
  "title": "Auth method selection",
  "decision": "Adopt JWT",
  "reasoning": "Easy auth sharing between microservices",
  "alternatives": ["Session Cookie", "OAuth2"],
  "tags": ["auth", "architecture"],
  "createdAt": "2026-01-26T10:00:00Z",
  "status": "active"
}
```

### status Values

| Value | Description |
|-------|-------------|
| `draft` | Auto-detected (needs review) |
| `active` | Confirmed |
| `superseded` | Replaced by later decision |
| `deprecated` | No longer recommended |
