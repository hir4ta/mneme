---
name: search
description: ナレッジを検索する。
---

# /memoria:search

保存されたセッション、技術的な判断、パターンを検索するスキルです。

## 使い方

```
/memoria:search <query>
```

指定したクエリで全てのナレッジを検索します。

### 種類を指定して検索

```
/memoria:search <query> --type session
/memoria:search <query> --type decision
/memoria:search <query> --type pattern
```

## 実行手順

1. `.memoria/` 配下の全JSONファイルを読み込む
2. クエリでテキスト検索（タイトル、要約、内容、タグ）
3. スコアリングして結果を表示
4. ユーザーが詳細を見たい項目があれば、該当ファイルを再読み込み

### 具体的な操作

```bash
# 各タイプのファイルを取得
Glob: .memoria/sessions/*.json
Glob: .memoria/decisions/*.json
Glob: .memoria/patterns/*.json

# 各ファイルを読み込んで検索
Read: .memoria/{type}/{filename}.json
```

## 検索アルゴリズム

各ファイルのコンテンツに対してテキストマッチングを行う:

- タイトル/要約にマッチ: +3点
- 本文/詳細にマッチ: +2点
- タグにマッチ: +1点
- 完全一致: スコア2倍

## 検索対象フィールド

### セッション (.memoria/sessions/*.json)
- `summary` - 要約
- `messages[].content` - メッセージ内容
- `tags` - タグ

### 技術的な判断 (.memoria/decisions/*.json)
- `title` - タイトル
- `decision` - 決定内容
- `reasoning` - 理由
- `tags` - タグ

### パターン (.memoria/patterns/*.json)
- `title` - タイトル
- `description` - 説明
- `example` - 例
- `tags` - タグ

## 出力フォーマット

```
「JWT」の検索結果: 5件

[decision] jwt-auth-001 (スコア: 8)
  認証方式にJWTを採用
  マッチ: title, reasoning

[session] 2026-01-24_abc123 (スコア: 6)
  認証機能のJWT実装
  マッチ: summary, messages

[pattern] pattern-tanaka-001 (スコア: 3)
  JWTトークンの有効期限を短く設定
  マッチ: description

詳細を見るには番号を入力してください（終了: q）:
```

## 詳細表示

ユーザーが番号を選択した場合:

```
[decision] jwt-auth-001

タイトル: 認証方式の選択
決定: セッション管理にJWTを採用する
理由: マイクロサービス間での認証共有が容易。ステートレスでスケーラブル。

代替案:
  - セッションCookie: サーバー側で状態管理が必要、スケールしにくい

タグ: [auth] [architecture] [jwt]
作成日: 2026-01-24
```
