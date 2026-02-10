---
name: search
description: |
  Search saved sessions and approved units in mneme's knowledge base.
  Use when: (1) looking for past solutions, (2) recalling approved guidance,
  (3) finding related implementation context.
argument-hint: "<query>"
---

# /mneme:search

Search sessions + approved units.

## Required constraints

<required>
- Prioritize approved units over raw sources.
- Return matched fields and score for each result.
- If query is ambiguous, suggest a refined query.
</required>

## Usage

```
/mneme:search <query>
/mneme:search <query> --type session
/mneme:search <query> --type unit
```

## Execution

1. Call `mneme_search` with `$ARGUMENTS` as the query (or prompt user if empty).
2. Show scored results.
3. If response includes `page.nextOffset`, allow paging:
   - next call: `mneme_search({ ..., offset: page.nextOffset })`
4. If details are needed:
   - `mneme_get_session({ sessionId })`
   - `mneme_get_unit({ unitId })`

### MCP examples

```typescript
mneme_search({ query: "JWT auth", limit: 10 })
mneme_search({ query: "JWT auth", types: ["session", "unit"] })
mneme_search({ query: "JWT auth", limit: 50, offset: 0 })
mneme_search({ query: "JWT auth", limit: 50, offset: 50 })
mneme_get_session({ sessionId: "abc123" })
mneme_get_unit({ unitId: "mc-decision-jwt-auth-001" })
```

## Search targets

### Sessions (`.mneme/sessions/**/*.json`)
- `title`
- `tags`
- `summary.goal`
- `summary.description`
- `discussions[].topic`
- `discussions[].decision`
- `errors[].error`
- `errors[].solution`

### Units (`.mneme/units/units.json`, approved only)
- `title`
- `summary`
- `tags`
- `sourceType`

## Notes

- If no approved units exist, search will effectively return sessions/interactions only.

## Failure conditions

- Empty query.
- Query too broad to produce actionable results (must suggest refinement).
