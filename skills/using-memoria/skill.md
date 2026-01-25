---
name: using-memoria
description: memoriaの使い方を確認する - セッション開始時に自動ロード
---

# Using memoria

memoriaはClaude Codeに長期記憶を与えるプラグインです。

## 機能

1. **セッション自動保存**: セッション終了時・コンパクト時に会話履歴を自動保存
2. **セッション再開**: `/memoria:resume` で過去のセッションを復元
3. **技術的な判断の記録**: セッション終了時に自動検出 + `/memoria:decision` で手動記録
4. **ナレッジ検索**: `/memoria:search` で保存した情報を検索
5. **Webダッシュボード**: セッション・判断記録を視覚的に管理

## 技術的な判断の自動保存

| 保存方式 | タイミング | ステータス |
|---------|-----------|-----------|
| **自動** | セッション終了時 | `draft`（要レビュー） |
| **手動** | `/memoria:decision` 実行時 | `active`（確定） |

セッション終了時に、会話から技術的な判断を自動検出して保存します（`status: draft`）。
自動検出された判断はダッシュボードでレビュー・編集できます。

## コマンド

| コマンド | 説明 |
|---------|------|
| `/memoria:resume [id]` | セッションを再開（ID省略で一覧） |
| `/memoria:save` | 現在のセッションを手動保存 |
| `/memoria:decision "タイトル"` | 技術的な判断を記録（確定） |
| `/memoria:search <query>` | ナレッジを検索 |

## ダッシュボード

Webダッシュボードを起動するには、ターミナルで:

```bash
npx @hir4ta/memoria --dashboard
```

## データ保存場所

`.memoria/` ディレクトリにJSON形式で保存:

```
.memoria/
├── sessions/     # セッション履歴
└── decisions/    # 技術的な判断
```

## 重要: ファイル操作方法

スキル実行時は、`.memoria/` 配下のJSONファイルを直接操作すること:

- **読み込み**: Read ツールで `.memoria/{type}/*.json` を読む
- **書き込み**: Write ツールで `.memoria/{type}/{id}.json` に保存
- **検索**: Glob + Read で該当ファイルを探して内容を確認

## セッションJSONスキーマ

```json
{
  "id": "2026-01-24_abc123",
  "sessionId": "full-uuid",
  "createdAt": "2026-01-24T10:00:00Z",
  "endedAt": "2026-01-24T12:00:00Z",
  "user": { "name": "user", "email": "user@example.com" },
  "context": { "branch": "main", "projectDir": "/path/to/project" },
  "tags": ["auth", "api"],
  "status": "completed",
  "summary": "認証機能の実装",
  "messages": [
    { "type": "user", "timestamp": "...", "content": "..." },
    { "type": "assistant", "timestamp": "...", "content": "...", "thinking": "..." }
  ],
  "filesModified": [
    { "path": "/path/to/file.ts", "action": "created" }
  ]
}
```

## 技術的な判断JSONスキーマ

```json
{
  "id": "jwt-auth-001",
  "title": "認証方式の選択",
  "decision": "JWTを採用する",
  "reasoning": "マイクロサービス間の認証共有が容易",
  "alternatives": ["Session Cookie", "OAuth2"],
  "tags": ["auth", "architecture"],
  "createdAt": "2026-01-24T10:00:00Z",
  "user": { "name": "user" },
  "source": "manual",
  "status": "active"
}
```

### status フィールド

| 値 | 説明 |
|---|------|
| `draft` | 自動検出（要レビュー） |
| `active` | 確定済み |
| `superseded` | 後の判断で置き換え |
| `deprecated` | 非推奨 |

### source フィールド

| 値 | 説明 |
|---|------|
| `auto` | セッション終了時に自動検出 |
| `manual` | `/memoria:decision` で手動記録 |
