---
name: search
description: ナレッジを検索する。
---

# /memoria search

保存されたセッション、設計決定、パターンを検索するスキルです。

## 使い方

```
/memoria search <query>
```

指定したクエリで全てのナレッジを検索します。

### 種類を指定して検索

```
/memoria search <query> --type session
/memoria search <query> --type decision
/memoria search <query> --type pattern
```

## 実行手順

1. MCPツール `memoria_search` を呼び出して検索
2. 結果をスコア順にソートして表示
3. ユーザーが詳細を見たい項目があれば、該当するMCPツールで詳細を取得

## 出力フォーマット

```
「JWT」の検索結果: 5件

[decision] jwt-auth-decision-001 (スコア: 8)
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

## 検索アルゴリズム

- タイトル/要約にマッチ: +3点
- 本文/詳細にマッチ: +2点
- タグにマッチ: +1点
- 完全一致: スコア2倍
