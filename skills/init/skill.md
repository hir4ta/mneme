---
name: init
description: (Deprecated) Configuration is no longer needed.
---

# /memoria:init

**This command is deprecated.**

Session saving is now automatic - no configuration needed.

## What Changed

Previously, memoria required an OpenAI API key for auto-saving sessions. Now:

- **Auto-save**: Sessions are saved automatically on every Claude response (via Stop hook)
- **No API key needed**: Claude itself updates the session JSON directly
- **No configuration file needed**: `~/.claude/memoria.json` is no longer required

## If You Have an Existing Config

You can safely delete `~/.claude/memoria.json` - it's no longer used.

## Output

```
/memoria:init is deprecated.

Session saving is now automatic - no configuration needed.
You can safely delete ~/.claude/memoria.json if it exists.
```
