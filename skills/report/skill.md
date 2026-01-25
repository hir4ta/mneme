---
name: report
description: 週次のレビュー集計レポートを生成する。
---

# /memoria:report

レビュー結果（`.memoria/reviews/`）から週次レポートを生成するスキルです。

## 使い方

```
/memoria:report
/memoria:report --from 2026-01-01 --to 2026-01-07
```

### デフォルト

- `--from/--to` 未指定の場合は **直近7日**
- 保存先: `.memoria/reports/YYYY-MM/weekly-YYYY-MM-DD.md`（`--to`の日付基準）

## 実行手順

1. **対象期間を決定**
2. **`.memoria/reviews/YYYY/MM/*.json` を読み込む**
3. 期間内のレビューを集計
   - Blocker / Warning / Suggestion 数
   - ルール命中TOP
   - 新ルール提案一覧
   - Stale rule 一覧
4. **Markdownレポートを生成**
5. `.memoria/reports/YYYY-MM/weekly-YYYY-MM-DD.md` に保存

## 出力フォーマット（Markdown）

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

## 保存時の注意

- `.memoria/reports/YYYY-MM/` がなければ作成する
- 同日で複数回作成する場合は末尾に連番を付ける
