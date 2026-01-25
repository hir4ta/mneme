---
name: review
description: dev-rules と review-guidelines に基づいて差分レビューを行う。
---

# /memoria:review

リポジトリ固有のルール（`dev-rules.json` / `review-guidelines.json`）を使い、
根拠付きでコードレビューを行うスキルです。

## 使い方

```
/memoria:review
/memoria:review --staged
/memoria:review --all
/memoria:review --diff=main
```

### デフォルト

- **`--staged` をデフォルト**とする
- staged が空なら `--all` / `--diff=branch` を提案して選ばせる

## 実行手順

1. **対象差分の取得**
   - `--staged`: `git diff --staged`
   - `--all`: `git diff`
   - `--diff=branch`: `git diff <branch>...HEAD`
2. **ルールの読み込み**
   - `.memoria/rules/dev-rules.json`
   - `.memoria/rules/review-guidelines.json`
3. **適用対象のフィルタ**
   - `status: active` のみ対象
   - `scope / tags / appliesTo / exceptions` で関連ルールのみ残す
4. **指摘作成**
   - 差分に対してルールが命中した箇所を抽出
   - 重大度を `priority` から決定
5. **レビュー出力**
   - Blocker / Warning / Suggestion の3段で構成
6. **レビュー結果を保存**
   - `.memoria/reviews/YYYY/MM/review-YYYY-MM-DD_HHMMSS.json`

## ルール適用の指針

### scope の判定（パスから推定）

- `dashboard/` → `dashboard`
- `hooks/` → `hooks`
- `skills/` → `skills`
- `dashboard/server/` → `server`
- `config`/`env`/`tsconfig`/`vite.config` → `config`
- それ以外 → `general`

### tags の付与（パス or diff文字列から推定）

- `ui` (dashboard/react/css)
- `api` (server/api)
- `quality` (lint/test/build)
- `security` (auth/secret/token)
- `docs` (README/docs/*.md)
- `release` (version/changelog)

### appliesTo / exceptions の扱い

- `appliesTo` がある場合は **scope/tags/path** で一致したときだけ適用
- `exceptions` に一致する場合は **除外**

### tokens の扱い

- `tokens` がある場合は diff 内に出現するものだけを対象にする
- 出現しないなら **ノイズ回避のため基本はスキップ**

## 重大度のマッピング

| priority | severity |
|----------|----------|
| p0 | Blocker |
| p1 | Warning |
| p2 | Suggestion |

## 出力フォーマット（Markdown）

```
# Review: {target}

## Summary
- Blocker: N
- Warning: N
- Suggestion: N
- Matched rules: X (of Y)
- New rule proposals: Z

## Findings

### Blocker
1. {短い指摘タイトル}
   - File: path/to/file.ts:123
   - Evidence: {diff snippet}
   - Rule: {rule.id} / {rule.text}
   - Rationale: {rule.rationale}

### Warning
...

### Suggestion
...

## Rule Coverage
- Applied: {rule ids}
- Skipped (scope mismatch): {rule ids}

## Rule Proposals
- {提案内容}（根拠: {どの指摘から発生したか}）

## Stale Rules
- {rule.id} (lastSeenAt: YYYY-MM-DD)
```

## Review JSON 保存形式

`.memoria/reviews/YYYY/MM/review-YYYY-MM-DD_HHMMSS.json` に保存する。

```json
{
  "id": "review-2026-01-25_145500",
  "createdAt": "2026-01-25T14:55:00Z",
  "target": {
    "type": "staged",
    "branch": "main"
  },
  "summary": {
    "blocker": 1,
    "warning": 2,
    "suggestion": 3,
    "matchedRules": 4,
    "totalRules": 10,
    "newRuleProposals": 1
  },
  "findings": [
    {
      "id": "finding-001",
      "severity": "blocker",
      "title": "本番設定の秘密情報がハードコードされている",
      "ruleId": "review-2026-01-24_abc123-0",
      "ruleText": "シークレットは環境変数に置く",
      "rationale": "漏洩リスクを避けるため",
      "file": "src/config.ts",
      "line": 42,
      "evidence": "API_KEY = \"xxx\""
    }
  ],
  "coverage": {
    "appliedRuleIds": ["review-2026-01-24_abc123-0"],
    "skippedRuleIds": ["dev-2026-01-20_def456-1"]
  },
  "proposals": [
    {
      "text": "APIクライアントは必ず timeout を設定する",
      "fromFindingIds": ["finding-002"]
    }
  ],
  "staleRules": [
    { "id": "dev-2025-12-01_aaa111-0", "lastSeenAt": "2025-12-05T00:00:00Z" }
  ],
  "context": {
    "projectDir": "/path/to/project",
    "branch": "main"
  }
}
```
