---
name: save
description: Force flush current session state to JSON.
---

# /memoria:save

Explicitly save session and extract development rules from conversation.

## When to Use

**Session content is auto-saved on every response.** Use this command when you want to:

1. **Extract rules** - Save development rules/guidelines mentioned in conversation
2. **Force update** - Manually update summary if auto-save missed something
3. **Final save** - Ensure everything is captured before ending session

## Usage

```
/memoria:save
```

## What Gets Saved

| Target | Content |
|--------|---------|
| Session JSON | summary, metrics, files, decisions, errors, interactions, tags |
| dev-rules.json | Development rules mentioned in conversation |
| review-guidelines.json | Review guidelines mentioned in conversation |

## Session JSON Structure

```json
{
  "id": "abc12345",
  "summary": {
    "title": "JWT認証の実装",
    "goal": "JWTベースの認証機能を実装",
    "outcome": "success",
    "description": "JWTを使った認証機能を実装。RS256署名エラーを解決"
  },
  "interactions": [
    {
      "timestamp": "2026-01-27T10:00:00Z",
      "user": "JWT認証を実装して",
      "assistant": "JWT認証の実装を開始。RS256署名方式を採用",
      "toolsUsed": ["Read", "Edit", "Write"]
    }
  ],
  "metrics": { ... },
  "files": [...],
  "decisions": [...],
  "errors": [...],
  "tags": [...],
  "status": "complete"
}
```

## Execution Steps

### 1. Update Session JSON

1. Get session path from additionalContext (shown at session start)
2. Read current session file
3. Update/add:
   - **summary**: title, goal, outcome, description
   - **interactions**: Add any missing conversation turns
   - **metrics**: Count files, decisions, errors
   - **files**: All file changes with action and summary
   - **decisions**: Technical decisions with reasoning
   - **errors**: Errors encountered and solutions
   - **tags**: Relevant keywords

### 2. Extract and Save Rules

Scan the conversation for user instructions that should become persistent rules.

#### Identify Dev Rules

Look for user statements like:
- "〜を使って" / "Use X"
- "〜は禁止" / "Don't use X"
- "〜パターンで書いて" / "Write with X pattern"
- "必ず〜して" / "Always do X"

#### Identify Review Guidelines

Look for user statements like:
- "レビューで〜を確認して" / "Check X in reviews"
- "〜は指摘して" / "Point out X"
- "〜があったら警告して" / "Warn if X"

#### Duplicate Check

Before adding a new rule:
1. Read existing items in the target file
2. Compare semantically with each existing item
3. **Skip if similar rule already exists**
4. Only add if genuinely new

#### Rule Format

```json
{
  "id": "rule-{timestamp}",
  "content": "早期リターンを使用する",
  "category": "code-style",
  "source": "session:{session_id}",
  "addedAt": "2026-01-27T10:00:00Z"
}
```

Categories for dev-rules: `code-style`, `architecture`, `error-handling`, `performance`, `security`, `testing`, `other`

Categories for review-guidelines: `must-check`, `warning`, `suggestion`, `other`

### File Operations

```bash
# Session
Read + Edit: .memoria/sessions/YYYY/MM/{id}.json

# Rules (read for duplicate check, edit to append)
Read + Edit: .memoria/rules/dev-rules.json
Read + Edit: .memoria/rules/review-guidelines.json
```

## Output Format

```
Session saved.

Session ID: abc12345
Title: JWT authentication implementation
Outcome: success

Metrics:
  Files: +2 created, ~1 modified
  Decisions: 2
  Errors: 1 encountered, 1 resolved
  Interactions: 5

Rules updated:
  dev-rules.json:
    + [code-style] 早期リターンを使用する
    ~ [code-style] anyを使わない (skipped: similar rule exists)

  review-guidelines.json:
    (no changes)
```

## Notes

- Session path is shown in additionalContext at session start
- Auto-save runs on every response via Stop hook
- This command is for manual updates and rule extraction
- Rules are appended (not overwritten) - duplicates are skipped
