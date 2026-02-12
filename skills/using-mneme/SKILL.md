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

## When to proactively search mneme

Search mneme (`/mneme:search`) when you encounter these situations during implementation:

- **Recurring error**: search with the error message to find past solutions
- **Design decision**: search with the technical topic to find prior decisions and reasoning
- **Unfamiliar area**: search with module/file names to find sessions that worked on the same code
- **Before refactoring**: search to understand historical context and past approaches

The `<mneme-context>` block injected on each prompt provides automatic matches, but deeper search with specific technical terms often reveals more relevant context.

## Recommended workflow

```
implement -> save -> approve rules
```
