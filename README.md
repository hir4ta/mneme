# mneme

![Version](https://img.shields.io/badge/version-0.23.0-blue)
![Node.js](https://img.shields.io/badge/node-%3E%3D22.5.0-brightgreen)
[![NPM Version](https://img.shields.io/npm/v/%40hir4ta%2Fmneme)](https://www.npmjs.com/package/@hir4ta/mneme)
[![MIT License](https://img.shields.io/npm/l/%40hir4ta%2Fmneme)](https://github.com/hir4ta/mneme/blob/main/LICENSE)

Long-term memory plugin for Claude Code

Provides automatic session saving, intelligent memory search, and web dashboard management.

## Features

- **Incremental save**: Save only new interactions on each turn completion (Node.js, fast)
- **Auto memory search**: Related past sessions/decisions automatically injected on each prompt
- **PreCompact support**: Catch up unsaved interactions before Auto-Compact (context 95% full)
- **Full data extraction**: Save summary, decisions, patterns, and rules with `/mneme:save`
- **Session Resume**: Resume past sessions with `/mneme:resume` (with chain tracking)
- **Session Suggestion**: Recent 3 sessions shown at session start
- **Knowledge Harvesting**: Extract decision/pattern/rule sources from PR comments with `/mneme:harvest`
- **Web Dashboard**: View sessions, source artifacts, and development rules
- **Development Rules + Approval**: Generate rules from decisions/patterns/rules and approve/reject inline
- **Knowledge Graph Layer**: Visualize sessions and approved development rules as one graph

## Problems Solved

Claude Code sessions lose context on exit or Auto-Compact, making past decisions untraceable and knowledge hard to reuse.

**Common Issues**: Context loss across sessions, repeated mistakes, opaque design decisions

**What mneme Enables**: Auto-save with resume, automatic memory search on every prompt, searchable decision/pattern history

**Team Benefits**: `.mneme/` JSON files are Git-managed, enabling team sharing of decisions and session history.

## Installation

### Prerequisites

> **⚠️ IMPORTANT: Node.js >= 22.5.0 Required**
>
> mneme uses the built-in `node:sqlite` module, which was introduced in **Node.js 22.5.0**.
> The dashboard will NOT work on Node.js 20 or earlier versions.
>
> Check your version: `node --version`
>
> Node.js 20 LTS ends April 2026. Please upgrade to Node.js 22 or later.

- **jq**: Used for JSON processing in hooks

```bash
# macOS
brew install jq

# Ubuntu/Debian
sudo apt-get install jq

# Windows (Chocolatey)
choco install jq

# Windows (Scoop)
scoop install jq

# Windows (winget)
winget install jqlang.jq
```

### Plugin Installation

Run the following in Claude Code:

```bash
/plugin marketplace add hir4ta/mneme-marketplace
/plugin install mneme@mneme-marketplace
```

Then initialize mneme in your project:

```bash
# In Claude Code
/init-mneme

# Or from terminal
npx @hir4ta/mneme --init
```

Restart Claude Code to complete installation.

## Update

Run the following in Claude Code:

```bash
/plugin marketplace update mneme-marketplace
```

Restart Claude Code.

### Enable Auto-Update (Recommended)

1. Run `/plugin`
2. Select Marketplaces tab
3. Select `mneme-marketplace`
4. Enable "Enable auto-update"

This will auto-update on Claude Code startup.

## Usage

### Commands

| Command                  | Description                                           |
| ------------------------ | ----------------------------------------------------- |
| `/init-mneme`            | Initialize mneme in current project                   |
| `/mneme:save`            | Extract all data: summary, decisions, patterns, rules |
| `/mneme:resume [id]`     | Resume session (show list if ID omitted)              |
| `/mneme:search "query"`  | Search sessions and approved development rules        |
| `/mneme:harvest <PR URL>`| Extract knowledge from PR review comments             |

### Recommended Workflow

```
implement → save → approve rules
```

1. **implement**: Write code
2. **save**: Extract source knowledge and generate development rule candidates
3. **validate**: Run `npm run validate:sources` to enforce required fields/priority/tags
4. **approve rules**: Review and approve/reject generated development rules inline

Detailed runtime flow (hooks, uncommitted policy, auto-compact path):
- `docs/mneme-runtime-flow.md`

### Dashboard

Run in your project directory

```bash
npx @hir4ta/mneme --dashboard
```

Open <http://localhost:7777> in your browser.

Change port:

```bash
npx @hir4ta/mneme --dashboard --port 8080
```

#### Screens

- **Sessions**: List and view sessions
- **Development Rules**: Review and approve rules generated from decisions/patterns/rules
- **Statistics**: View activity charts and session statistics
- **Graph**: Visualize session connections by shared tags

#### Language Switching

The dashboard supports English and Japanese. Click the language toggle (EN/JA) in the header to switch. The preference is saved to localStorage.

### Development Rules

mneme extracts three types of knowledge from your sessions

| Type | Definition | Example |
|------|-----------|---------|
| **Decision** | A one-time choice with context-specific reasoning | "Chose RS256 over HS256 for JWT signing" |
| **Pattern** | A repeatable practice observed across contexts | "Parallel testing with real data catches regressions" |
| **Rule** | An enforceable standard promoted from decisions/patterns | "Always verify with real data tests after refactoring" |

Decision and Pattern are **mutually exclusive** — the same insight goes to exactly one. Rules are promoted from either with a source reference.

#### How it works

1. `/mneme:save` extracts decisions, patterns, and rules from your session
2. Candidates are saved as **draft** status
3. Review and approve/reject in the dashboard (**Development Rules** page)
4. **Approved rules are automatically injected** into your prompts via memory search

#### Priority levels

| Priority | Risk level | Application |
|----------|-----------|-------------|
| **p0** | Security / data loss / outage | Always enforced |
| **p1** | Correctness / reliability | Applied by default |
| **p2** | Maintainability / quality | Applied when relevant |

### CLAUDE.md Integration

Add to your project's `CLAUDE.md` to get the most out of mneme

```markdown
# mneme
- Run `/mneme:save` before ending long sessions to preserve decisions and patterns
- Use `/mneme:resume <id>` to continue previous work with full context
- Approved development rules are automatically injected — follow p0 rules strictly
```

For teams, you can create `.claude/rules/mneme.md` with path-scoped rules:

```markdown
# mneme workflow
- After implementing a feature, run `/mneme:save` to extract reusable knowledge
- Check the dashboard for pending development rules that need approval
- When approved rules appear in <mneme-rules>, apply them according to priority (p0 > p1 > p2)
```

> **Tip**: Keep CLAUDE.md concise. For each line, ask: "Would removing this cause Claude to make mistakes?" If not, cut it. ([Best Practices - Claude Code Docs](https://code.claude.com/docs/en/best-practices))

### Knowledge Report

Generate an AI-powered knowledge report. Claude Code analyzes session data and produces a rich HTML report with narrative summaries, session timelines, knowledge highlights, and usage insights.

```
/mneme:report
```

Features:
- Choose period: 1 week (default), 2 weeks, or 1 month
- AI-generated development activity summary
- Expandable session timeline with goals, outcomes, discussions, and errors
- Knowledge highlights (decisions, patterns, rules) displayed directly
- Tag heatmap aggregated from all sources
- Claude Code usage analysis with tool breakdown
- Bilingual output (EN/JA) with language toggle

Output: `.mneme/exports/knowledge-report-YYYY-MM-DD.html`

## Data Storage

mneme uses a **hybrid storage** approach: JSON files are Git-managed for team sharing, while SQLite keeps conversations private (gitignored).

| Storage    | Location          | Purpose                               | Sharing                   |
| ---------- | ----------------- | ------------------------------------- | ------------------------- |
| **JSON**   | `.mneme/`         | Summaries, decisions, patterns, rules | Git-managed (team shared) |
| **SQLite** | `.mneme/local.db` | Interactions, backups                 | Local only (gitignored)   |

Conversations are auto-saved on each turn. No configuration needed.

Auto memory search runs on every prompt: keywords are extracted, past sessions/development rules are searched, and relevant context is injected automatically.

At session start, the 3 most recent sessions are shown so you can quickly resume with `/mneme:resume <id>`.

## Security and Privacy

mneme operates **entirely locally** with no data sent to external servers.

| Item                       | Description                                                         |
| -------------------------- | ------------------------------------------------------------------- |
| **External Communication** | None - no curl/fetch/HTTP requests are made                         |
| **Data Storage**           | All data stored in project's `.mneme/` directory                    |
| **Conversation History**   | Stored in `local.db`, automatically gitignored (not shared via Git) |
| **Tools Used**             | bash, Node.js, jq, sqlite3 (no external dependencies)               |
| **Code**                   | Open source - all code is auditable                                 |

## License

MIT
