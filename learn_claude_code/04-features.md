# 4. 各機能の使い方（リファレンス）

## 4.1 Slash Commands
CLI 内で使えるコマンド。**作業の切り替えや補助**に使います。

### よく使う built-in コマンド（例）
- `/help` でヘルプ
- `/clear` で会話リセット
- `/compact` で要約
- `/config` で設定画面
- `/init` で CLAUDE.md の初期化
- `/mcp` で MCP 接続管理
- `/permissions` で権限確認・更新
- `/rewind` でチェックポイントへ戻る

### カスタムスラッシュコマンド
`.claude/commands/`（プロジェクト）や `~/.claude/commands/`（個人）に
Markdown + frontmatter を置くと、再利用可能な作業テンプレになります。

**最小テンプレ例**
```
---
description: "API 変更の影響確認"
---

1) 影響範囲を列挙して
2) 変更ファイル一覧を出して
3) 追加すべきテストを挙げて
```

**引数の扱い**
- `$ARGUMENTS` で引数全体を受け取る
- `$1`, `$2` のように個別に扱う

**便利機能**
- `@path/to/file` でファイル参照
- `!command` で bash 実行の結果を差し込む（frontmatter で許可が必要）

**作成の流れ（最短）**
1. `.claude/commands/` を作成
2. `impact-check.md` などのファイルを置く
3. `/impact-check` で呼び出す

## 4.1.1 良い / 悪い例（カスタムコマンド）

| 観点 | 悪い例 | 良い例 |
| --- | --- | --- |
| 目的 | なんでもやるコマンド | 変更影響を確認するコマンド |
| 手順 | 指示が曖昧 | 影響範囲/変更ファイル/テストを順に出す |

## 4.2 Skills
**作業手順を型として保存**する仕組み。

- `.claude/skills/<skill-name>/SKILL.md` に定義
- 複数ファイル（reference, scripts, templates）をまとめられる
- `allowed-tools` でツール制限を付けられる（Claude Code CLI）

作りすぎると管理が破綻するので、「毎回同じ手順が発生する作業」だけに絞るのがコツです。

**適用の目安**
- 週 1 回以上使う
- 失敗時のコストが高い
- 手順が 3 ステップ以上

## 4.3 Sub-agents
役割を分担するための仕組み。`/agents` で管理できます。

- 調査専用
- コードレビュー専用
- テスト観点洗い出し専用

Sub-agent は独立したコンテキストで動くため、
「並列化したい作業」や「観点の固定化」に効果的です。
**使いすぎるとコンテキストが散る**ので、
「明確な役割分離があるとき」だけ使うのが良いです。

**使いどころ例**
- 調査担当: 仕様・設計 doc を読むだけ
- レビュー担当: 変更差分だけ評価

## 4.4 Hooks
セッション開始/終了やツール実行前後で自動処理を実行できます。
`settings.json` で設定します。

- セッション開始時にルールを注入
- 重要なログを保存
- コマンド実行履歴の加工

**運用のコツ**
- フックは最小限に（動作が不透明になりやすい）
- 必ずログを残す（誰が、何を、いつ動かしたか）

## 4.5 MCP
**外部ツールと連携するための標準プロトコル**。

- DB 検索
- 社内 API 連携
- ドキュメントの参照

MCP は「Claude Code だけでは届かない知識」を安全に補うための機能です。

**導入時の注意**
- どのデータにアクセスするかを明示
- 失敗時のフォールバック（検索できない場合の運用）を決める

## 4.6 設定 / 権限 / サンドボックス / チェックポイント

- **設定**: モデルや動作を調整（`~/.claude/settings.json` や `.claude/settings.json`）
- **権限**: ファイル書き込みやコマンド実行の範囲
- **サンドボックス**: 影響範囲の隔離
- **チェックポイント**: 作業状態の保存・復元

チェックポイントは `/rewind` または `Esc` を 2 回で復帰できます。
ただし **bash で変更したファイルは戻らない**ため、
安全に戻したい場合は Claude の編集ツールを使うのが基本です。

## 4.7 練習
- `/help` でコマンド一覧を確認する
- `/compact` を使って会話を要約してみる
- カスタムスラッシュコマンドを 1 つ作る

### 演習テンプレ（カスタムコマンド）
目的: 反復作業をコマンド化する
入力: よく使う手順 1 つ
出力:
```
---
description: ""
---

1) 
2) 
3) 
```

### 解答例
```
---
description: "変更影響の簡易チェック"
---

1) 変更ファイル一覧を出して
2) 影響範囲を箇条書きで整理して
3) 追加すべきテストを列挙して
```

## 4.8 チェックリスト
- スラッシュコマンドの用途が説明できる
- Skills / Sub-agents / Hooks / MCP の役割が言える
- 権限とサンドボックスの違いが説明できる

## 参考
- https://docs.claude.com/en/docs/claude-code/slash-commands
- https://docs.claude.com/en/docs/claude-code/hooks
- https://docs.claude.com/en/docs/claude-code/mcp
- https://docs.claude.com/en/docs/claude-code/settings
- https://docs.claude.com/en/docs/claude-code/checkpointing
- https://platform.claude.com/docs/en/agent-sdk/skills
