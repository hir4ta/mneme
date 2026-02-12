---
name: search
description: |
  Search saved sessions and approved units in mneme's knowledge base.
  Use when: (1) looking for past solutions, (2) recalling approved guidance,
  (3) finding related implementation context.
argument-hint: "<query>"
allowed-tools: mcp__mneme-search__mneme_search, mcp__mneme-search__mneme_get_session
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

## Execution — Progressive Disclosure (3-Layer)

Use a 3-layer progressive disclosure pattern to minimize token usage:

### Layer 1: Compact Index (default)

Call `mneme_search` with `detail: "compact"` (default) to get a lightweight index:
- Returns: `id`, `title`, `score`, `matchedFields`, `tags`, `createdAt`
- No snippet — ~50 tokens per result
- Use this to identify relevant results quickly

### Layer 2: Summary

If more context is needed, call `mneme_search` with `detail: "summary"`:
- Returns: all Layer 1 fields + `snippet`, `goal`
- ~150 tokens per result

### Layer 3: Full Details

For specific items that need deep investigation:
- `mneme_get_session({ sessionId })` — full session JSON
- Use only for 1-2 items that are most relevant

### Recommended Flow

1. Call `mneme_search` with `$ARGUMENTS` as the query (or prompt user if empty).
2. Show compact results (Layer 1).
3. If user wants more detail on specific items, call Layer 2 or 3.
4. If response includes `page.nextOffset`, allow paging:
   - next call: `mneme_search({ ..., offset: page.nextOffset })`

### MCP examples

```typescript
// Layer 1: Compact (default)
mneme_search({ query: "JWT auth", limit: 10 })
mneme_search({ query: "JWT auth", detail: "compact" })

// Layer 2: Summary
mneme_search({ query: "JWT auth", detail: "summary", limit: 10 })

// Layer 3: Full details for a specific session
mneme_get_session({ sessionId: "abc123" })

// Pagination
mneme_search({ query: "JWT auth", limit: 50, offset: 0 })
mneme_search({ query: "JWT auth", limit: 50, offset: 50 })
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

## Query construction tips

Effective queries use specific technical terms rather than natural language:

| Instead of | Use |
|-----------|-----|
| "how did we handle auth" | "JWT authentication middleware" |
| "that error we fixed" | "CORS preflight 403" |
| "the refactoring we did" | "refactor session-parser" |
| "what was decided about DB" | "SQLite WAL migration" |

Best practices:
- Use **specific technical terms**: library names, error messages, API names
- Use **file paths**: component or module names that were modified
- Use **error text**: paste the exact error message or key portion
- **Combine terms**: "FTS5 tokenizer unicode61" is better than "search"
- When the first query returns no results, try **synonyms or related terms**

## Notes

- If no approved units exist, search will effectively return sessions/interactions only.
- Stopwords (common English/Japanese words) are automatically removed from queries.

## Failure conditions

- Empty query.
- Query too broad to produce actionable results (must suggest refinement).
