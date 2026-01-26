---
name: decision
description: Record a technical decision (ADR: Architecture Decision Record).
---

# /memoria:decision

Record a technical decision (ADR: Architecture Decision Record).

## Auto vs Manual

| Method | Timing | Status |
|--------|--------|--------|
| **Auto** | Session end | `draft` (needs review) |
| **Manual** | `/memoria:decision` | `active` (confirmed) |

Auto-detected decisions can be reviewed/edited in the dashboard.

## Usage

```
/memoria:decision "title"
```

Records a technical decision interactively.

## Execution Steps

1. Receive title (from argument or interactive input)
2. Extract from conversation context (or collect interactively):
   - decision: What was decided
   - reasoning: Why this decision
   - alternatives: Other options considered (optional)
   - tags: Related tags (reference tags.json)
3. Save to `.memoria/decisions/YYYY/MM/{id}.json`

### File Operations

```bash
# Create decision directory
mkdir -p .memoria/decisions/2026/01

# Save decision JSON
Write: .memoria/decisions/2026/01/jwt-auth-001.json
```

## Decision JSON Schema

```json
{
  "id": "jwt-auth-001",
  "title": "Auth method selection",
  "decision": "Adopt JWT for session management",
  "reasoning": "Easy auth sharing between microservices. Stateless and scalable.",
  "alternatives": [
    {
      "name": "Session Cookie",
      "reason": "Requires server-side state, doesn't scale well"
    }
  ],
  "tags": ["auth", "architecture", "jwt"],
  "createdAt": "2026-01-24T10:00:00Z",
  "user": { "name": "user-name" },
  "context": {
    "branch": "feature/auth",
    "projectDir": "/path/to/project"
  },
  "relatedSessions": ["2026-01-24_abc123"],
  "source": "manual",
  "status": "active"
}
```

### status Field

| Value | Description |
|-------|-------------|
| `draft` | Auto-detected (needs review) |
| `active` | Confirmed |
| `superseded` | Replaced by later decision |
| `deprecated` | No longer recommended |

### source Field

| Value | Description |
|-------|-------------|
| `auto` | Auto-detected at session end |
| `manual` | Recorded via `/memoria:decision` |

## ID Generation

Generate slug from title:
- Alphanumeric and hyphens only
- Lowercase
- Append sequence number (001, 002, ...)

Example: "Auth method selection" → `auth-method-selection-001`

## Input Format

### Interactive

```
> /memoria:decision "Auth method selection"

Recording a technical decision.

Enter the decision:
> Adopt JWT for session management

Enter the reasoning:
> Easy auth sharing between microservices. Stateless and scalable.

Enter alternatives considered (skip: Enter):
> Session Cookie - Requires server-side state, doesn't scale well

Enter tags (comma separated):
> auth, architecture, jwt
```

### Auto-extraction from Context

If the decision was already discussed in conversation, Claude auto-extracts:

```
> /memoria:decision "Auth method selection"

Extracted from conversation:

- Decision: Adopt JWT for session management
- Reasoning: Easy auth sharing between microservices
- Alternative: Session Cookie (rejected: doesn't scale well)

Save with this content? (Enter to modify)
```

## Session Integration

Recording via `/memoria:decision` saves to two places:

1. **decisions/{id}.json** - Standalone decision record
2. **sessions/{id}.json interactions** - As a decision cycle in the session

This allows tracing "in what context was this decision made".

## Tag Selection

1. Read `.memoria/tags.json`
2. Find matching tag from aliases
3. Use id if found (e.g., "認証" → "auth")
4. Add new tag to tags.json if not found
5. **Limit: 3-5 tags max for decisions, ordered by relevance (most relevant first)**

## Output Format

```
Technical decision saved.

ID: jwt-auth-001
Title: Auth method selection
Decision: Adopt JWT for session management
Tags: [auth] [architecture] [jwt]

Search with /memoria:search
```
