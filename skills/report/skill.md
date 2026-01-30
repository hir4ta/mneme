---
name: report
description: |
  Generate weekly report aggregating review results from .memoria/reviews/.
  Use when: (1) preparing weekly status updates, (2) summarizing team review activity,
  (3) tracking code quality trends over time.
argument-hint: "[--from YYYY-MM-DD] [--to YYYY-MM-DD]"
---

# /memoria:report

Generate weekly report from review results (`.memoria/reviews/`).

## Usage

```
/memoria:report
/memoria:report --from 2026-01-01 --to 2026-01-07
```

### Default

- If `--from/--to` not specified: **last 7 days**
- Save location: `.memoria/reports/YYYY-MM/weekly-YYYY-MM-DD.md` (based on `--to` date)

## Execution Steps

1. **Determine target period**
2. **Read `.memoria/reviews/YYYY/MM/*.json`**
3. Aggregate reviews in period:
   - Blocker / Warning / Suggestion counts
   - Top matched rules
   - New rule proposals list
   - Stale rules list
4. **Generate Markdown report**
5. Save to `.memoria/reports/YYYY-MM/weekly-YYYY-MM-DD.md`

## Output Format (Markdown)

```
# Weekly Review Report (2026-01-01 - 2026-01-07)

## Summary
- Reviews: 5
- Blocker: 2
- Warning: 6
- Suggestion: 11

## Highlights
- Most frequent rules: review-... (3), dev-... (2)
- Top affected areas: dashboard, server

## Findings Digest
### Blocker
1. {title} (rule: {rule.id})
2. ...

### Warning
...

### Suggestion
...

## Rule Proposals
- {proposal text}

## Stale Rules
- {rule.id} (lastSeenAt: YYYY-MM-DD)
```

## Notes

- Create `.memoria/reports/YYYY-MM/` if it doesn't exist
- If multiple reports on same day, append sequence number
