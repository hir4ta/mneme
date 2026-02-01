---
name: using-mneme
description: |
  Guide for using mneme plugin. Auto-loaded at session start to provide context.
user-invocable: false
---

# Using mneme

mneme is a long-term memory plugin for Claude Code.

## Setup

Initialize mneme in your project:

```bash
# From Claude Code (after /plugin add)
/init-mneme

# Or from terminal
npx @hir4ta/mneme --init
```

This creates the `.mneme/` directory with the required structure. mneme will not track sessions until initialized.

## Features

1. **Auto-save interactions**: Conversations auto-saved at session end (jq-based, no Claude needed)
2. **Auto memory search**: Related past sessions/decisions automatically injected on each prompt
3. **Manual save**: `/mneme:save` for full data extraction (interactions, summary, decisions, patterns, rules)
4. **Smart planning**: `/mneme:plan` uses Claude Code's native plan mode with memory search
5. **Session resume**: `/mneme:resume` to restore past sessions with chain tracking
6. **Knowledge search**: `/mneme:search` to find saved information
7. **Rule-based review**: `/mneme:review` for code review based on rules (supports PR URLs)
8. **Knowledge harvesting**: `/mneme:harvest` to extract rules/patterns from PR comments
9. **Weekly reports**: `/mneme:report` to generate review summary
10. **Web dashboard**: Visual management of sessions and decisions

## Core Commands

| Command | Description |
|---------|-------------|
| `/init-mneme` | Initialize mneme in current project |
| `/mneme:save` | Save all data: interactions, summary, decisions, patterns, rules |
| `/mneme:plan [topic]` | Native plan mode + memory search + Socratic questions + design validation |
| `/mneme:resume [id]` | Resume session (omit ID for list) |
| `/mneme:search <query>` | Search knowledge |
| `/mneme:review [--staged\|--all\|--diff=branch\|--full]` | Rule-based review |
| `/mneme:review <PR URL>` | Review GitHub PR |
| `/mneme:harvest <PR URL>` | Extract knowledge from PR review comments |
| `/mneme:report [--from YYYY-MM-DD --to YYYY-MM-DD]` | Weekly review report |

## Session Saving

### Auto-Save (at Session End)

**Interactions are auto-saved** by SessionEnd hook to `.mneme/local.db`:

```
[Session ends] → [SessionEnd hook] → [jq extracts from transcript] → [SQLite updated]
```

Automatically saved to local.db:
- User messages
- Assistant responses (including thinking blocks)
- Tool usage
- File changes

**Auto-compact handling:** If auto-compact occurred during the session, the SessionEnd hook
automatically merges `preCompactBackups` with newly extracted interactions to preserve
the complete conversation history.

### Manual Save (`/mneme:save`)

**Run anytime** to save all session data (no need to exit first):

| Data | Destination |
|------|-------------|
| **Interactions** (conversation history) | local.db |
| Summary (title, goal, outcome) | sessions/*.json |
| Discussions → **Decisions** | decisions/*.json |
| Errors → **Patterns** | patterns/*.json |
| Dev rules | rules/dev-rules.json |
| Review guidelines | rules/review-guidelines.json |

<phases>
Execute all phases in order:
- Phase 0: Master Session (merge child sessions)
- Phase 1: Interactions (save to local.db)
- Phase 2: Summary
- Phase 3: Decisions
- Phase 4: Patterns
- Phase 5: Rules (scan for explicit instructions and implicit technical standards)
</phases>

### Auto Memory Search

**On every prompt**, mneme automatically:
1. Extracts keywords from your message
2. Searches sessions/decisions/patterns/rules
3. Injects relevant context to Claude

This means past knowledge is always available without manual lookup.

## Recommended Workflow

```
plan → implement → save → review
```

1. **plan**: `/mneme:plan` activates Claude Code's native plan mode
   - Searches past decisions/patterns/rules
   - Explores codebase (read-only)
   - Asks clarifying questions (1 at a time)
   - Presents design in sections for validation
   - Writes design doc to `docs/plans/`
   - Exits plan mode for approval
2. **implement**: Follow the approved plan
3. **save**: Extract decisions, patterns, rules
4. **review**: Verify against plan and code quality

## Dashboard

```bash
npx @hir4ta/mneme --dashboard
```

## Data Location

`.mneme/` directory stores all data:

```
.mneme/
├── local.db          # SQLite database (interactions - gitignored)
├── tags.json         # Tag master file
├── sessions/         # Session metadata (no interactions)
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

**Privacy**: `local.db` is gitignored (private conversations stay local).

## What Gets Saved

| Field | Trigger | Destination |
|-------|---------|-------------|
| interactions | SessionEnd or /mneme:save | local.db |
| files | SessionEnd or /mneme:save | sessions/*.json |
| metrics | SessionEnd or /mneme:save | sessions/*.json |
| title, tags | /mneme:save | sessions/*.json |
| summary | /mneme:save | sessions/*.json |
| discussions → decisions/ | /mneme:save | decisions/*.json |
| errors → patterns/ | /mneme:save | patterns/*.json |
| rules/ | /mneme:save | rules/*.json |
| handoff | /mneme:save | sessions/*.json |
| references | /mneme:save | sessions/*.json |

**Note:** `/mneme:save` saves interactions to local.db immediately - no need to exit first.

## tags.json (Tag Master)

Reference when selecting tags:

```json
{
  "version": 1,
  "tags": [
    {
      "id": "frontend",
      "label": "Frontend",
      "aliases": ["front", "client", "ui"],
      "category": "domain",
      "color": "#3B82F6"
    }
  ]
}
```
