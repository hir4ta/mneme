---
name: save
description: Force flush current session state to JSON.
---

# /memoria:save

Create session summary and extract development rules from conversation.

## When to Use

**Interactions are auto-saved** by SessionEnd hook. Use this command when you want to:

1. **Create summary** - Write title, goal, outcome, description for the session
2. **Extract rules** - Save development rules/guidelines mentioned in conversation
3. **Save structured data** - Add plan, discussions, errors, handoff, references to JSON

## Usage

```
/memoria:save
```

## What Gets Saved

| Target | Content |
|--------|---------|
| Session JSON | All session data including structured fields |
| dev-rules.json | Development rules mentioned in conversation |
| review-guidelines.json | Review guidelines mentioned in conversation |

**Note:** `interactions`, `files`, `metrics` are auto-saved by SessionEnd hook.

## JSON File Structure

All session data is stored in a single JSON file:

```json
{
  "id": "abc12345",
  "sessionId": "abc12345-...",
  "createdAt": "2026-01-27T10:00:00Z",
  "title": "JWT authentication implementation",
  "tags": ["auth", "jwt"],
  "context": { ... },
  "interactions": [...],
  "metrics": { ... },
  "files": [...],
  "preCompactBackups": [...],
  "resumedFrom": "def456",
  "status": "complete",

  "summary": {
    "title": "JWT authentication implementation",
    "goal": "Implement JWT-based auth with refresh token support",
    "outcome": "success",
    "description": "Implemented RS256 JWT auth with middleware",
    "sessionType": "implementation"
  },

  "plan": {
    "tasks": [
      "[x] JWT signing method selection",
      "[x] Middleware implementation",
      "[ ] Add tests"
    ],
    "remaining": ["Add tests"]
  },

  "discussions": [
    {
      "topic": "Signing algorithm",
      "decision": "RS256",
      "reasoning": "Security considerations for production",
      "alternatives": ["HS256 (simpler but requires shared secret)"]
    }
  ],

  "codeExamples": [
    {
      "file": "src/auth/jwt.ts",
      "description": "JWT generation function",
      "after": "export function generateToken(payload: JWTPayload): string {\n  return jwt.sign(payload, privateKey, { algorithm: 'RS256' });\n}"
    }
  ],

  "errors": [
    {
      "error": "secretOrPrivateKey must be asymmetric",
      "cause": "Used HS256 secret key with RS256",
      "solution": "Generate RS256 key pair"
    }
  ],

  "handoff": {
    "stoppedReason": "Test creation postponed to next session",
    "notes": ["vitest configured", "Mock key pair in test/fixtures/"],
    "nextSteps": ["Create jwt.test.ts", "Add E2E tests"]
  },

  "references": [
    { "url": "https://jwt.io/introduction", "title": "JWT Introduction" },
    { "path": "docs/auth-spec.md", "title": "Auth specification" }
  ]
}
```

## Execution Steps

### 1. Update Session JSON

1. Get session path from additionalContext (shown at session start)
2. Read current session file
3. Update all fields:
   - **title**: Brief descriptive title
   - **tags**: Relevant keywords from `.memoria/tags.json`
   - **summary**: title, goal, outcome, description, sessionType
   - **plan**: tasks, remaining
   - **discussions**: decisions with reasoning and alternatives
   - **codeExamples**: significant code changes with before/after
   - **errors**: problems encountered and solutions
   - **handoff**: stoppedReason, notes, nextSteps
   - **references**: URLs and files referenced

**Guidelines**:
- Extract information from the conversation
- Focus on what the next Claude session needs to know
- Include specific code snippets when relevant
- Document decisions and their reasoning
- Be concise but comprehensive
- **Text formatting**: Write each sentence on a single line. Do not break sentences mid-way for line length.

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
  "content": "Use early return pattern",
  "category": "code-style",
  "source": "session:{session_id}",
  "addedAt": "2026-01-27T10:00:00Z"
}
```

Categories for dev-rules: `code-style`, `architecture`, `error-handling`, `performance`, `security`, `testing`, `other`

Categories for review-guidelines: `must-check`, `warning`, `suggestion`, `other`

### File Operations

```bash
# Session JSON (update all fields)
Read + Edit: .memoria/sessions/YYYY/MM/{id}.json

# Rules (read for duplicate check, edit to append)
Read + Edit: .memoria/rules/dev-rules.json
Read + Edit: .memoria/rules/review-guidelines.json
```

## Output Format

```
Session saved.

Session ID: abc12345

Files:
  JSON: .memoria/sessions/2026/01/abc12345.json (updated)

Summary:
  Title: JWT authentication implementation
  Goal: Implement JWT-based auth with refresh token support
  Outcome: success
  Type: implementation

Rules updated:
  dev-rules.json:
    + [code-style] Use early return pattern
    ~ [code-style] Avoid using any (skipped: similar rule exists)

  review-guidelines.json:
    (no changes)
```

## Notes

- Session path is shown in additionalContext at session start
- **Interactions are auto-saved by SessionEnd hook** - no need to manually save them
- All structured data is now stored in JSON (YAML files are no longer generated)
- Rules are appended (not overwritten) - duplicates are skipped
