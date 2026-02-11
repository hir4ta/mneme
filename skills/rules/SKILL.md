---
name: rules
description: |
  Guide for interpreting and applying approved development rules injected via <mneme-rules>.
  Auto-loaded to provide behavioral context for rule application.
user-invocable: false
---

# Approved Rules Guide

This guide explains how to use approved development rules automatically injected into your context.

## How rules are injected

On every prompt, mneme searches approved rules (decisions, patterns, rules) matching the current prompt keywords. Matching rules appear in a `<mneme-rules>` block:

```
<mneme-rules>
Approved development rules (apply during this response):
[rule:rule-id] (p1) Rule text here
[pattern:pattern-id] (—) Pattern description here
[decision:decision-id] (—) Decision text here
</mneme-rules>
```

## Priority application

| Priority | Meaning | Implementation | Code Review | Planning |
|----------|---------|---------------|-------------|----------|
| **p0** | Security/data-loss/outage risk | MUST apply | MUST apply | MUST apply |
| **p1** | Correctness/reliability risk | SHOULD apply | MUST apply | SHOULD apply |
| **p2** | Maintainability/quality | MAY apply | SHOULD apply | SHOULD apply |

## Source types in context

- **[rule:...]**: Enforceable standard. Apply as documented.
- **[pattern:...]**: Proven practice. Follow unless context demands otherwise.
- **[decision:...]**: Prior judgment. Respect unless revisiting the decision.

## When injected rules are insufficient

If you suspect there are more relevant rules for the current task:

1. Use `mneme_search` MCP tool with relevant keywords
2. Read `rules/dev-rules.json` and `rules/review-guidelines.json` directly
3. Search `decisions/` and `patterns/` for related approved guidance

## Handling rule conflicts

1. Higher priority wins (p0 > p1 > p2)
2. More specific rule wins over general
3. More recent rule wins (check `updatedAt`)
4. If still ambiguous, flag the conflict to the user
