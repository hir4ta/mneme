---
name: search
description: |
  Search saved sessions, decisions, and patterns in memoria's knowledge base.
  Use when: (1) looking for past solutions to similar problems, (2) finding previous decisions,
  (3) recalling how something was implemented before.
argument-hint: "<query>"
---

# /memoria:search

Search saved sessions, decisions, and patterns.

## Usage

```
/memoria:search <query>
```

### Filter by Type

```
/memoria:search <query> --type session
/memoria:search <query> --type decision
/memoria:search <query> --type pattern
```

## Execution Steps

**Use the `memoria_search` MCP tool for fast, unified search:**

1. Call `memoria_search` with the query
2. Display scored results
3. If user wants details, use `memoria_get_session` or `memoria_get_decision`

### MCP Tools

```typescript
// Search all types
memoria_search({ query: "JWT auth", limit: 10 })

// Filter by type
memoria_search({ query: "JWT auth", types: ["decision", "session"] })

// Get full session details
memoria_get_session({ sessionId: "abc123" })

// Get full decision details
memoria_get_decision({ decisionId: "jwt-auth-001" })
```

**Fallback (if MCP unavailable):** Read JSON files directly using Glob + Read tools.

## Search Algorithm

Text matching on each file's content:

- Title/topic match: +3 points
- thinking/reasoning match: +2 points
- Tag match: +1 point
- Tag alias match: +1 point
- Exact match: 2x score

### Tag Alias Search

If query matches an alias in tags.json, search using the corresponding id:
- Example: "front" → search for "frontend" tag

## Search Target Fields

### Sessions (.memoria/sessions/**/*.json)

**Search index fields:**
- `title` - Session title
- `tags` - Tags

**Auto-saved interaction fields:**
- `interactions[].user` - User's request
- `interactions[].thinking` - Thought process
- `interactions[].assistant` - Assistant response

**Structured data (set by /memoria:save):**
- `summary.title` - Session title
- `summary.goal` - Session goal
- `summary.description` - What was accomplished
- `plan.goals[]` - Planned goals
- `plan.tasks[]` - Task list
- `discussions[].topic` - Discussion topic
- `discussions[].decision` - What was decided
- `discussions[].reasoning` - Why this decision
- `errors[].error` - Error encountered
- `errors[].cause` - Root cause
- `errors[].solution` - How it was resolved
- `handoff.stoppedReason` - Why session ended
- `handoff.nextSteps[]` - Next steps

### Decisions (.memoria/decisions/**/*.json)
- `title` - Title
- `decision` - What was decided
- `reasoning` - Why
- `tags` - Tags

### Patterns (.memoria/patterns/*.json)
- `title` - Title
- `description` - Description
- `example` - Example
- `tags` - Tags

## Output Format

```
Search results for "JWT": 5 items

[decision] jwt-auth-001 (score: 8)
  Adopt JWT for authentication
  Match: title, reasoning

[session] 2026-01-24_abc123 (score: 6)
  JWT authentication implementation
  Match: title, interactions[0].topic

[pattern] pattern-tanaka-001 (score: 3)
  Set short JWT token expiry
  Match: description

Enter number for details (quit: q):
```

## Detail View

### Session Detail

```
[session] 2026-01-24_abc123

Title: JWT authentication implementation
Tags: [auth] [jwt] [backend]

Summary:
  Goal: Implement JWT-based auth
  Outcome: success
  Type: implementation

Discussions:
  - Auth method selection
    Decision: JWT (easy auth sharing between microservices)
  - Refresh token expiry
    Decision: 7 days (balance between security and UX)

Errors resolved:
  - Token validation failed → Fixed by using correct public key

Handoff:
  Next steps:
    - Add refresh token rotation
    - Implement logout endpoint

Created: 2026-01-24
```

### Decision Detail

```
[decision] jwt-auth-001

Title: Auth method selection
Decision: Adopt JWT for session management
Reasoning: Easy auth sharing between microservices. Stateless and scalable.

Alternatives:
  - Session Cookie: Requires server-side state, doesn't scale well

Tags: [auth] [architecture] [jwt]
Created: 2026-01-24
```
