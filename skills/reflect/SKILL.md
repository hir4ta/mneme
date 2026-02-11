---
name: reflect
description: |
  Analyze accumulated knowledge to detect patterns, contradictions, and stale items.
  Use when: (1) reviewing knowledge health, (2) finding promotion candidates,
  (3) detecting contradictions between decisions.
disable-model-invocation: true
context: fork
allowed-tools: Read, Glob, Grep, AskUserQuestion
---

# /mneme:reflect

Analyze accumulated mneme knowledge across sessions, decisions, patterns, and rules. Produce a meta-analysis report identifying recurring themes, contradictions, promotion candidates, stale items, and overall knowledge health.

## Language

Generate report content in the user's language (detect from conversation context).

## Execution Phases

### Phase 1: Period Selection

Use `AskUserQuestion` to let the user choose the analysis scope:

```
Question: "分析の対象期間を選択してください"
Options:
  - "全期間 (Recommended)" -> all data
  - "過去90日" -> 90 days
  - "過去30日" -> 30 days
```

### Phase 2: Data Collection

Read all data from the project's `.mneme/` directory. Filter by period using `createdAt` / `updatedAt` timestamps.

**Sessions** -- Read all `.mneme/sessions/YYYY/MM/*.json`:
```
Key fields:
  - id, title, tags, createdAt, updatedAt
  - summary.sessionType
  - discussions[].topic, discussions[].decision
  - errors[].error, errors[].solution
```

**Decisions** -- Read all `.mneme/decisions/YYYY/MM/*.json`:
```
Key fields:
  - id, title, decision, reasoning, alternatives[]
  - tags, status (draft/active/superseded/deprecated)
  - createdAt, updatedAt
  - relatedSessions[]
```

**Patterns** -- Read `.mneme/patterns/*.json` (each file has `items[]` or `patterns[]` array):
```
Key fields:
  - id, type (good/bad/error-solution), title/description
  - tags, status (draft/active/approved)
  - sourceId, createdAt, updatedAt
```

**Rules** -- Read `.mneme/rules/dev-rules.json` and `.mneme/rules/review-guidelines.json`:
```
Key fields:
  - id, key, text/rule, category, priority (p0/p1/p2)
  - tags, status (draft/approved/active/rejected)
  - sourceRef: { type, id }
  - appliedCount, acceptedCount, lastAppliedAt
  - createdAt, updatedAt
```

**Tags** -- Read `.mneme/tags.json` for the full tag definitions.

### Phase 3: Analysis (5 Categories)

Analyze the collected data and produce findings for each category.

#### Category 1: Recurring Themes

Aggregate tags across ALL artifact types (sessions, decisions, patterns, rules).

For tags appearing in 3+ artifacts:
- Count artifacts per tag, grouped by type
- Calculate "knowledge density" = (decisions + patterns + rules) / sessions for each tag
- High density (>0.5) = well-documented topic
- Low density (<0.2) = frequently worked on but under-documented

Output as a table:

```markdown
| Theme (Tags) | Sessions | Decisions | Patterns | Rules | Density |
|---|---|---|---|---|---|
| auth | 5 | 2 | 1 | 1 | 0.80 |
| refactor | 8 | 1 | 1 | 0 | 0.25 |
```

Flag low-density topics as candidates for knowledge extraction.

#### Category 2: Contradiction Detection

Compare active decisions that share the same tags or categories:

1. Group active/approved decisions by their primary tags
2. For each group with 2+ decisions, compare their `decision` and `reasoning` fields
3. Flag potential contradictions where:
   - Decisions reference the same technology/pattern but reach different conclusions
   - One decision recommends X while another recommends avoiding X
   - Decisions with overlapping `alternatives` where one chose what another rejected

<required>
- Use your judgment as an AI to detect semantic contradictions, not just keyword matches.
- A contradiction is when two active decisions give conflicting guidance for the same situation.
- Different decisions for genuinely different contexts are NOT contradictions.
</required>

Output:
```markdown
## 2. Potential Contradictions

### Found N potential contradiction(s)

**[dec-xxx] vs [dec-yyy]**
- dec-xxx: "Chose A because ..."
- dec-yyy: "Chose B because ..."
- Shared tags: [tag1, tag2]
- Assessment: [Genuine contradiction / Different contexts / Superseded]
- Recommendation: [Supersede one / Clarify scope / Keep both with context notes]
```

If no contradictions found, output: "No contradictions detected among active decisions."

#### Category 3: Promotion Candidates

Find approved patterns that could be promoted to rules:

1. Read all patterns with `status === "approved"` or `status === "active"`
2. Read all rules and build a set of `sourceRef.id` values
3. For each approved pattern NOT referenced by any rule's `sourceRef`:
   - Check if it represents a broadly applicable practice (not context-specific)
   - Suggest promotion with a draft rule text

Output:
```markdown
## 3. Promotion Candidates

### Patterns -> Rules

- **[pat-xxx]** "{description}"
  - Type: {good/bad/error-solution}
  - Tags: {tags}
  - Suggested rule: "{imperative rule text}"
  - Suggested priority: {p1/p2}
```

Also check for approved decisions that represent broadly applicable guidance:
- Decisions where the reasoning applies beyond the original context
- Decisions referenced by 2+ sessions

#### Category 4: Staleness Check

Flag potentially outdated knowledge:

**Stale Decisions** (createdAt > 90 days ago AND no updatedAt):
```
- [dec-xxx] "{title}" - created {N} days ago, never updated
```

**Unused Rules** (appliedCount === 0 AND createdAt > 30 days ago):
```
- [rule-xxx] "{text}" - created {N} days ago, never applied
```

**Forgotten Drafts** (status === "draft" AND createdAt > 30 days ago):
```
- [dec-xxx] "{title}" - draft for {N} days, consider approving or deleting
- [pat-xxx] "{description}" - draft for {N} days
```

**Low Effectiveness Rules** (appliedCount > 3 AND acceptedCount/appliedCount < 0.3):
```
- [rule-xxx] "{text}" - applied {N} times, accepted only {M} times ({ratio}%)
  Consider revising or deprecating
```

#### Category 5: Knowledge Health Report

Generate aggregate metrics:

```markdown
## 5. Knowledge Health

### Overview
| Metric | Count |
|---|---|
| Total Sessions | N |
| Total Decisions | N (active: N, draft: N, superseded: N) |
| Total Patterns | N (approved: N, draft: N) |
| Total Rules | N (active: N, draft: N, rejected: N) |

### Priority Distribution (Active Rules)
| Priority | Count | % |
|---|---|---|
| p0 (critical) | N | X% |
| p1 (important) | N | X% |
| p2 (advisory) | N | X% |

### Approval Pipeline
- Draft -> Approved rate: X% (N/M items)
- Average age of drafts: N days
- Oldest unapproved draft: [id] ({N} days)

### Tag Coverage
- Defined tags (in tags.json): N
- Used tags: N
- Unused tags: [list]

### Rule Effectiveness (active rules with appliedCount > 0)
- Average acceptance rate: X%
- Most effective: [rule-xxx] ({ratio}%)
- Least effective: [rule-xxx] ({ratio}%)
```

### Phase 4: Report Output

Output the complete report to the console in Markdown format.

Structure:
```markdown
# mneme Reflection Report

**Project**: {projectName}
**Period**: {period description}
**Generated**: {date}

---

## 1. Recurring Themes
{Category 1 output}

## 2. Potential Contradictions
{Category 2 output}

## 3. Promotion Candidates
{Category 3 output}

## 4. Stale Knowledge
{Category 4 output}

## 5. Knowledge Health
{Category 5 output}

---

## Summary & Recommendations

{AI-generated 3-5 bullet points with actionable recommendations based on ALL findings above}
```

## Important Notes

- This skill is READ-ONLY: do not modify any files
- Do not access `.mneme/local.db` (SQLite) -- privacy constraint; use only shared JSON files
- If the project has very few artifacts (< 3 sessions), note this and provide a minimal report
- Focus on actionable insights, not just raw numbers
- For contradiction detection, use AI judgment -- don't just pattern-match keywords
