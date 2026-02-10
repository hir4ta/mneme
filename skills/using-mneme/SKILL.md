---
name: using-mneme
description: |
  Guide for using mneme plugin. Auto-loaded at session start to provide context.
user-invocable: false
---

# Using mneme

mneme is a long-term memory plugin for Claude Code.

## Core model

- **Sessions**: chronological execution history and context.
- **Development rules**: approved guidance derived from decisions (what was chosen and why), patterns (what works or fails), and rules (what to enforce).

## Core commands

| Command | Description |
|---------|-------------|
| `/init-mneme` | Initialize mneme in current project |
| `/mneme:save` | Save interactions + extract decisions/patterns/rules |
| `/mneme:search <query>` | Search sessions + approved development rules |
| `/mneme:resume [id]` | Resume session |
| `/mneme:harvest <PR URL>` | Extract knowledge from PR comments |

## Session flow

1. **SessionStart**: initializes session, injects recent context.
2. **Stop**: incrementally saves interactions to `.mneme/local.db`.
3. **`/mneme:save`**: writes structured metadata (decisions, patterns, rules).
4. **SessionEnd**: finalizes session status.

## Recommended workflow

```
implement -> save -> approve rules
```
