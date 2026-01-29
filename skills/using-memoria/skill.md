---
name: using-memoria
description: How to use memoria - auto-loaded at session start
---

# Using memoria

memoria is a long-term memory plugin for Claude Code.

## Session Start Greeting (Important)

**When a new session starts**, check the additionalContext for "Recent sessions" section.
If present, proactively inform the user about recent sessions they can resume:

Example greeting:
```
Recent sessions:
1. [abc12345] Title (date, branch)
2. [def67890] Title (date, branch)

To continue from a previous session, use `/memoria:resume <id>`.
```

This helps users quickly resume previous work without having to search.

## Features

1. **Auto-save interactions**: Conversations auto-saved at session end (jq-based, no Claude needed)
2. **Auto memory search**: Related past sessions/decisions automatically injected on each prompt
3. **Manual save**: `/memoria:save` for full data extraction (summary, decisions, patterns, rules)
4. **Smart planning**: `/memoria:plan` for memory-informed design and task breakdown
5. **Session resume**: `/memoria:resume` to restore past sessions with chain tracking
6. **Knowledge search**: `/memoria:search` to find saved information
7. **Rule-based review**: `/memoria:review` for code review based on rules
8. **Weekly reports**: `/memoria:report` to generate review summary
9. **Web dashboard**: Visual management of sessions and decisions

## Core Commands

| Command | Description |
|---------|-------------|
| `/memoria:save` | Extract all data: summary, decisions, patterns, rules |
| `/memoria:plan [topic]` | Memory-informed design + Socratic questions + task breakdown |
| `/memoria:resume [id]` | Resume session (omit ID for list) |
| `/memoria:search <query>` | Search knowledge |
| `/memoria:review [--staged\|--all\|--diff=branch\|--full]` | Rule-based review |
| `/memoria:report [--from YYYY-MM-DD --to YYYY-MM-DD]` | Weekly review report |

## Session Saving

### Auto-Save (at Session End)

**Interactions are auto-saved** by SessionEnd hook using jq:

```
[Session ends] → [SessionEnd hook] → [jq extracts from transcript] → [JSON updated]
```

Automatically saved:
- User messages
- Assistant responses (including thinking blocks)
- Tool usage
- File changes

### Manual Save (`/memoria:save`)

**Run at the end of meaningful sessions** to extract:

| Data | Destination |
|------|-------------|
| Summary (title, goal, outcome) | sessions/*.json |
| Discussions → **Decisions** | decisions/*.json |
| Errors → **Patterns** | patterns/*.json |
| Dev rules | rules/dev-rules.json |
| Review guidelines | rules/review-guidelines.json |

### Auto Memory Search

**On every prompt**, memoria automatically:
1. Extracts keywords from your message
2. Searches sessions/decisions/patterns/rules
3. Injects relevant context to Claude

This means past knowledge is always available without manual lookup.

## Recommended Workflow

```
plan → implement → save → review
```

1. **plan**: Design with memory lookup + Socratic questions + task breakdown
2. **implement**: Follow the plan
3. **save**: Extract decisions, patterns, rules
4. **review**: Verify against plan and code quality

## Dashboard

```bash
npx @hir4ta/memoria --dashboard
```

## Data Location

`.memoria/` directory stores all data:

```
.memoria/
├── tags.json         # Tag master file
├── sessions/         # Session history (auto + manual)
│   └── YYYY/MM/
│       └── {id}.json
├── decisions/        # Technical decisions (from /save)
│   └── YYYY/MM/
│       └── {id}.json
├── patterns/         # Error patterns (from /save)
│   └── {user}.json
├── rules/            # Dev rules / review guidelines
├── reviews/          # Review results
└── reports/          # Weekly reports
```

## What Gets Saved

| Field | Trigger | Source |
|-------|---------|--------|
| interactions | SessionEnd | Auto (jq) |
| files | SessionEnd | Auto (jq) |
| metrics | SessionEnd | Auto (jq) |
| title, tags | /memoria:save | Manual |
| summary | /memoria:save | Manual |
| discussions → decisions/ | /memoria:save | Manual |
| errors → patterns/ | /memoria:save | Manual |
| rules/ | /memoria:save | Manual |
| handoff | /memoria:save | Manual |
| references | /memoria:save | Manual |

## tags.json (Tag Master)

Reference when selecting tags:

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
