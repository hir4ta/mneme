---
name: decision
description: 設計決定を記録する。
---

# /memoria decision

設計決定（ADR: Architecture Decision Record）を記録するスキルです。

## 使い方

```
/memoria decision "タイトル"
```

対話形式で設計決定を記録します。

## 実行手順

1. タイトルを受け取る（引数から、または対話で入力）
2. 以下の情報を対話で収集:
   - decision: 何を決定したか
   - reasoning: なぜその決定をしたか
   - alternatives: 検討した代替案（オプション）
   - tags: 関連タグ
3. MCPツール `memoria_save_decision` を呼び出して保存

## 入力フォーマット

### 対話形式

```
> /memoria decision "認証方式の選択"

設計決定を記録します。

決定内容を入力してください:
> セッション管理にJWTを採用する

その理由を入力してください:
> マイクロサービス間での認証共有が容易。ステートレスでスケーラブル。

検討した代替案があれば入力してください（スキップ: Enter）:
> セッションCookie - サーバー側で状態管理が必要、スケールしにくい

タグを入力してください（カンマ区切り）:
> auth, architecture, jwt
```

## 出力フォーマット

```
設計決定を保存しました。

ID: jwt-auth-decision-001
タイトル: 認証方式の選択
決定: セッション管理にJWTを採用する
タグ: [auth] [architecture] [jwt]

この決定は /memoria search で検索できます。
```
