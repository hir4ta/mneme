---
name: decision
description: 技術的な判断を記録する。
---

# /memoria:decision

技術的な判断（ADR: Architecture Decision Record）を記録するスキルです。

## 自動保存 vs 手動保存

| 保存方式 | タイミング | ステータス |
|---------|-----------|-----------|
| **自動** | セッション終了時 | `draft`（要レビュー） |
| **手動** | `/memoria:decision` 実行時 | `active`（確定） |

- **自動保存**: セッション終了時に会話から技術的な判断を自動検出・保存（`status: draft`）
- **手動保存**: このコマンドで明示的に記録（`status: active`）

自動検出された決定はダッシュボードでレビュー・編集できます。

## 使い方

```
/memoria:decision "タイトル"
```

対話形式で技術的な判断を記録します。

## 実行手順

1. タイトルを受け取る（引数から、または対話で入力）
2. 以下の情報を会話コンテキストから抽出（または対話で収集）:
   - decision: 何を決定したか
   - reasoning: なぜその決定をしたか
   - alternatives: 検討した代替案（オプション）
   - tags: 関連タグ
3. `.memoria/decisions/{id}.json` に保存

### 具体的な操作

```bash
# 決定ディレクトリを確認・作成
mkdir -p .memoria/decisions

# 決定JSONを作成して保存
Write: .memoria/decisions/jwt-auth-001.json
```

## 技術的な判断JSONスキーマ

```json
{
  "id": "jwt-auth-001",
  "title": "認証方式の選択",
  "decision": "セッション管理にJWTを採用する",
  "reasoning": "マイクロサービス間での認証共有が容易。ステートレスでスケーラブル。",
  "alternatives": [
    {
      "name": "セッションCookie",
      "reason": "サーバー側で状態管理が必要、スケールしにくい"
    }
  ],
  "tags": ["auth", "architecture", "jwt"],
  "createdAt": "2026-01-24T10:00:00Z",
  "user": {
    "name": "user-name"
  },
  "context": {
    "branch": "feature/auth",
    "projectDir": "/path/to/project"
  },
  "relatedSessions": ["2026-01-24_abc123"],
  "source": "manual",
  "status": "active"
}
```

### status フィールド

| 値 | 説明 |
|---|------|
| `draft` | 自動検出（要レビュー） |
| `active` | 確定済み |
| `superseded` | 後の決定で置き換え |
| `deprecated` | 非推奨 |

### source フィールド

| 値 | 説明 |
|---|------|
| `auto` | セッション終了時に自動検出 |
| `manual` | `/memoria:decision` で手動記録 |

## ID生成ルール

タイトルからスラッグを生成:
- 英数字とハイフンのみ
- 小文字に変換
- 末尾に連番（001, 002, ...）を付与

例: "認証方式の選択" → `auth-method-selection-001`

## 入力フォーマット

### 対話形式

```
> /memoria:decision "認証方式の選択"

技術的な判断を記録します。

決定内容を入力してください:
> セッション管理にJWTを採用する

その理由を入力してください:
> マイクロサービス間での認証共有が容易。ステートレスでスケーラブル。

検討した代替案があれば入力してください（スキップ: Enter）:
> セッションCookie - サーバー側で状態管理が必要、スケールしにくい

タグを入力してください（カンマ区切り）:
> auth, architecture, jwt
```

### 会話コンテキストからの自動抽出

現在の会話で技術的な判断がすでに議論されている場合、Claudeがコンテキストから自動的に抽出して記録します。

```
> /memoria:decision "認証方式の選択"

会話コンテキストから以下の情報を抽出しました:

- 決定: セッション管理にJWTを採用する
- 理由: マイクロサービス間での認証共有が容易
- 代替案: セッションCookie（却下理由: スケールしにくい）

この内容で保存しますか？（修正する場合は内容を入力）
```

## 出力フォーマット

```
技術的な判断を保存しました。

ID: jwt-auth-001
タイトル: 認証方式の選択
決定: セッション管理にJWTを採用する
タグ: [auth] [architecture] [jwt]

この決定は /memoria:search で検索できます。
```
