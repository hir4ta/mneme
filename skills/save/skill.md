---
name: save
description: Force flush current session state to JSON.
---

# /memoria:save

Force flush current session state to JSON.

## Usage

```
/memoria:save
```

## When to Use

Claude Code auto-updates session JSON on meaningful changes. Use manual save when:

- Auto-update doesn't seem to be working
- Want to explicitly save current state
- Reached an important milestone

## Execution Steps

1. Get session path from additionalContext (injected at session start)
2. Extract from current conversation:
   - title: Session purpose
   - goal: What we're trying to achieve
   - tags: Related keywords (reference tags.json)
   - interactions: Decision cycle history
3. Update session JSON

### File Operations

```bash
# Session path from additionalContext
# Path format: .memoria/sessions/YYYY/MM/{id}.json

# Normalize tags
Read: .memoria/tags.json

# Update session JSON
Write: .memoria/sessions/YYYY/MM/{id}.json
```

## Tag Selection

1. Read `.memoria/tags.json`
2. Find matching tag from aliases
3. Use id if found (e.g., "フロント" → "frontend")
4. Add new tag to tags.json if not found

## Notes

- Session path is provided via additionalContext at session start
- Multiple saves overwrite with latest state
- SessionEnd hook has fallback, so manual save is optional

## Output Format

```
Session saved.

Session ID: 2026-01-24_abc123
Title: JWT authentication implementation
Goal: Implement JWT-based auth
Tags: [auth] [jwt] [backend]
Interactions: 3
```
