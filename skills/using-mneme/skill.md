---
name: using-mneme
description: |
  Guide for using mneme plugin. Auto-loaded at session start to provide context.
user-invocable: false
---

# Using mneme

mneme is a long-term memory plugin for Claude Code.

## Core model

mneme is centered on two objects:
1. **Sessions**: chronological execution history and context.
2. **Units**: approved guidance objects derived from decisions/patterns/rules.

### Source concept definitions

- **Decision**: what option was chosen and why.
- **Pattern**: what repeatedly works or fails.
- **Rule**: what should be enforced in future work.

## Setup

```bash
/init-mneme
# or
npx @hir4ta/mneme --init
```

## Core commands

| Command | Description |
|---------|-------------|
| `/init-mneme` | Initialize mneme in current project |
| `/mneme:save` | Save interactions + extract decisions/patterns/rules source data |
| `/mneme:plan [topic]` | Unit-informed planning (requires approved units) |
| `/mneme:search <query>` | Search sessions + approved units |
| `/mneme:review [...]` | Unit-based code review |
| `/mneme:resume [id]` | Resume session |
| `/mneme:harvest <PR URL>` | Extract source knowledge from PR comments |

## Session flow

- SessionEnd hook saves interactions to `.mneme/local.db`.
- `/mneme:save` writes structured session metadata.

## Unit flow

- Units are stored in `.mneme/units/units.json`.
- Use approved units (`status: approved`) for plan/review/search context.
- `pending/rejected` units are excluded from plan/review input.

## Auto memory search (UserPromptSubmit)

On each prompt, mneme searches:
- sessions
- approved units

## Recommended workflow

```
plan (unit-based) -> implement -> save -> validate:sources -> generate/approve units -> review (unit-based)
```

## Data location

```text
.mneme/
├── local.db                      # interactions (gitignored)
├── sessions/                     # session metadata
├── units/units.json       # units (pending/approved/rejected)
├── decisions/                    # source artifacts for unit generation
├── patterns/                     # source artifacts for unit generation
├── rules/                        # source artifacts for unit generation
├── reviews/                      # review results
└── audit/                        # audit logs (including unit operations)
```
