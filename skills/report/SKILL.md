---
name: report
description: |
  Generate an AI-powered knowledge report from mneme session data.
  Use when: (1) sharing team progress, (2) reviewing accumulated knowledge,
  (3) generating weekly/monthly summaries for stakeholders.
disable-model-invocation: true
context: fork
allowed-tools: Read, Write, Glob, Grep, AskUserQuestion
---

# /mneme:report

Generate a rich, AI-analyzed knowledge report as a self-contained HTML file.

Unlike static exports, this skill uses Claude Code's intelligence to analyze session data and produce narrative summaries, insights, and recommendations.

## Language

Generate report content in the user's language (detect from conversation).
The HTML template supports bilingual EN/JA display with language toggle.

## Execution Phases

### Phase 1: Period Selection

Use `AskUserQuestion` to let the user choose the report period:

```
Question: "レポートの対象期間を選択してください"
Options:
  - "過去1週間 (Recommended)" → 7 days
  - "過去2週間" → 14 days
  - "過去1ヶ月" → 30 days
```

### Phase 2: Data Collection

Read all data from the project's `.mneme/` directory. Filter by period using `createdAt` / `updatedAt` timestamps.

**Sessions** — Read all `.mneme/sessions/YYYY/MM/*.json`:
```
Key fields:
  - title, sessionType, tags, createdAt
  - context.projectName, context.branch, context.repository
  - summary.goal, summary.outcome, summary.description
  - plan.goals, plan.tasks (completed: "[x] ...", pending: "[ ] ...")
  - discussions[].topic, discussions[].decision, discussions[].reasoning
  - errors[].error, errors[].solution
  - metrics.toolUsage[].name, metrics.toolUsage[].count
  - metrics.userMessages, metrics.assistantResponses
  - files[].path, files[].action
  - handoff.nextSteps
```

**Decisions** — Read all `.mneme/decisions/YYYY/MM/*.json`:
```
Key fields: id, title, decision, reasoning, alternatives[], tags, status
```

**Patterns** — Read `.mneme/patterns/*.json` (each file has `items[]` or `patterns[]` array):
```
Key fields: id, type (good/bad/error-solution), title, pattern, context, tags, status
```

**Rules** — Read `.mneme/rules/dev-rules.json` and `.mneme/rules/review-guidelines.json` (each has `items[]` or `rules[]` array):
```
Key fields: id, key, text, category, priority (p0/p1/p2), rationale, tags, status
```

**Audit** — If `.mneme/audit/*.jsonl` exists, read and count entries per actor.

### Phase 3: Analysis & HTML Generation

Read the HTML template from this skill's directory:
```
skills/report/report-template.html
```

Replace the `<!-- CONTENT -->` marker with the generated content sections described below.

<required>
- Read the template file — do NOT generate CSS from scratch
- Preserve the `<head>`, `<style>`, and `<script>` sections from the template
- Only replace the `<!-- CONTENT -->` inside `<div class="wrap">`
</required>

#### Section 1: Hero

```html
<section class="hero">
  <div class="hero-row">
    <div>
      <div class="hero-sticker">KNOWLEDGE REPORT</div>
      <h1>
        <span data-i18n="titleEn">Knowledge Report</span>
        <span data-i18n="titleJa">ナレッジレポート</span>
      </h1>
      <div class="project-name">{projectName} — {repository}</div>
      <p><!-- AI-generated 1-2 sentence overview of the period --></p>
      <div class="meta">
        <span data-i18n="metaEn">Period: {from} to {to} | Generated: {now}</span>
        <span data-i18n="metaJa">期間: {from} 〜 {to} | 生成日時: {now}</span>
      </div>
    </div>
    <div class="lang-switch">
      <button type="button" data-lang-btn="ja">日本語</button>
      <button type="button" data-lang-btn="en">EN</button>
    </div>
  </div>
</section>
```

Get `projectName` and `repository` from any session's `context` field.

#### Section 2: KPI Grid

```html
<section class="grid kpi-grid">
  <article class="kpi" data-type="session">
    <div class="label">Sessions</div>
    <div class="value">{count}</div>
  </article>
  <!-- decision / pattern / rule counts -->
</section>
```

4 KPIs: Sessions, Decisions, Patterns, Rule Changes.
Use `data-type` attribute for color coding.

#### Section 3: Development Activity Summary (AI-generated)

```html
<section class="section">
  <h2>
    <span data-i18n="activityEn">Development Activity</span>
    <span data-i18n="activityJa">開発活動サマリー</span>
  </h2>
  <div class="ai-summary">
    <!-- AI-generated narrative -->
  </div>
</section>
```

Analyze ALL sessions and generate a 3-5 paragraph narrative summary:
- What development was done (implementation, refactoring, bug fixes, etc.)
- Key outcomes and achievements
- Notable technical challenges and how they were resolved
- Trends (e.g., "refactoring was the main focus" or "multiple bug fixes across modules")

Write in a style that is informative for junior engineers — explain WHY things were done, not just WHAT.
Make the summary bilingual using `data-i18n-item="en"` / `data-i18n-item="ja"` spans.

#### Section 4: Session Timeline (expandable)

```html
<section class="section">
  <h2>Sessions</h2>
  <div class="session-list">
    <details class="session-card">
      <summary>
        <span class="type-badge {sessionType}">{sessionType}</span>
        <span class="session-title">{title}</span>
        <span class="session-meta">{date}</span>
      </summary>
      <div class="session-body"><div>
        <div class="session-field">
          <div class="session-field-label">Goal</div>
          <div class="session-field-value">{goal}</div>
        </div>
        <div class="session-field">
          <div class="session-field-label">Outcome</div>
          <div class="session-field-value">{outcome}</div>
        </div>
        <!-- discussions, errors, tool usage, files changed -->
      </div></div>
    </details>
  </div>
</section>
```

For each session, include inside `<details>`:
- **Goal** and **Outcome** from `summary`
- **Discussions** (if any): topic + decision
- **Errors & Solutions** (if any): error + solution
- **Tool Usage Top 5**: render as `.tool-chip` spans
- **Files Changed**: count of `files[]`
- **Next Steps** from `handoff.nextSteps` (if any)

Sort sessions by `createdAt` descending (newest first).

#### Section 5: Knowledge Highlights

```html
<section class="section">
  <h2>Knowledge Highlights</h2>
  <div class="knowledge-grid">
    <!-- decision/pattern/rule cards -->
  </div>
</section>
```

Display decisions, patterns, and rules directly (NOT from units.json):

**Decision card:**
```html
<article class="knowledge-card" data-type="decision">
  <p class="sub">Decision</p>
  <h3>{title}</h3>
  <p>{decision or reasoning}</p>
  <div class="chips">{tags as .chip spans}</div>
</article>
```

**Pattern card:**
```html
<article class="knowledge-card" data-type="pattern">
  <p class="sub">Pattern — {type}</p>
  <h3>{title}</h3>
  <p>{pattern or description}</p>
  <div class="chips">{tags}</div>
</article>
```

**Rule card:**
```html
<article class="knowledge-card" data-type="rule">
  <p class="sub">Rule <span class="priority-badge {priority}">{priority}</span></p>
  <h3>{key or title}</h3>
  <p>{text}</p>
  <p class="detail-label">Rationale</p>
  <p>{rationale}</p>
  <div class="chips">{tags}</div>
</article>
```

Show ALL knowledge items in the period (not limited to 6).

#### Section 6: Tag Heatmap

```html
<section class="section">
  <h2>Tags</h2>
  <div class="tag-cloud">
    <span class="tag-pill">{tag} <b>{count}</b></span>
  </div>
</section>
```

Aggregate tags from ALL sources: sessions, decisions, patterns, rules.
Sort by frequency (highest first). Show top 20.

#### Section 7: Claude Code Usage Insights

```html
<section class="section">
  <h2>Claude Code Usage</h2>
  <div class="usage-grid">
    <article class="usage-panel">
      <h3>Tool Usage</h3>
      <!-- bar chart of top tools -->
    </article>
    <article class="usage-panel">
      <h3>Insights</h3>
      <!-- AI-generated insights about tool usage -->
    </article>
  </div>
</section>
```

**Left panel — Tool Usage Bar Chart:**
Aggregate `metrics.toolUsage` across ALL sessions. Sum counts per tool name.
Render top 10 tools as horizontal bars:
```html
<div class="usage-bar">
  <span class="usage-bar-label">{toolName}</span>
  <div class="usage-bar-track"><div class="usage-bar-fill" style="width:{percentage}%"></div></div>
  <span class="usage-bar-count">{count}</span>
</div>
```

**Right panel — AI Insights:**
Analyze the aggregated tool usage and generate 3-5 bullet points:
- Total user messages and assistant responses across all sessions
- Most used tools and what that indicates about the work (e.g., heavy Bash usage = testing-focused, heavy Edit = implementation-focused)
- Notable patterns (e.g., Team/SendMessage usage = multi-agent collaboration, EnterPlanMode = structured planning)
- Any interesting observations for the team

Make this section bilingual.

#### Section 8: Suggested Next Actions (AI-generated)

```html
<section class="section panel actions">
  <h2>Next Actions</h2>
  <ol>
    <li><!-- AI-generated action item --></li>
  </ol>
</section>
```

Generate 3-5 actionable next steps based on:
- Pending tasks from session handoffs (`handoff.nextSteps`)
- Errors that were encountered but may recur
- Knowledge gaps (topics with few patterns/rules)
- Approval status of rules/patterns (encourage reviewing drafts)

Make bilingual.

#### Section 9: Footer

```html
<footer>
  <span data-i18n="footerEn">Generated by mneme — AI-powered knowledge report</span>
  <span data-i18n="footerJa">mneme AI ナレッジレポートで生成</span>
</footer>
```

### Phase 4: Write Output

Write the complete HTML file to:
```
.mneme/exports/knowledge-report-YYYY-MM-DD.html
```

Create the `exports/` directory if it doesn't exist.

Report the output path to the user.

## Important Notes

- HTML must be self-contained (all CSS inlined, no external dependencies)
- Escape all user data in HTML output (prevent XSS)
- If no sessions exist in the period, generate a minimal report noting this
- If only some data types exist (e.g., sessions but no decisions), generate sections for available data only
- The `<details>` elements should be collapsed by default (no `open` attribute)
- All text content should be bilingual (EN + JA) using `data-i18n-item` or `data-i18n` spans
