# Claude Code 入門（ジュニア向け + シニアにも有益）目次

## 0. はじめに
- 目的と読み方
- 学習の進め方（小さく試す → 反省 → ルール化）

## 0.5 Quickstart（最短で体験）
- 最小プロンプトで 1 回動かす
- 目的 / 制約 / 完了条件の書き方
- 失敗した時の修正ループ

## 1. 概念（Claude Code の全体像）
- Claude Code の位置づけと思想
- メモリ／コンテキスト／ツール／権限の関係
- 拡張機能の整理（いつ読み込まれるか × 誰が動くか）

## 2. プロンプトエンジニアリング
- 成功条件・評価・初期プロンプト
- クリアで具体的な指示、例示、役割、XMLタグ
- チェーン化・長文コンテキストの扱い

## 3. コンテキストエンジニアリング
- 何を入れるか／入れないか
- CLAUDE.md を「薄く」保つ
- .claude/rules の動的ロードと設計
- コンテキストの圧縮・記憶・整理

## 4. 各機能の使い方（リファレンス）
- スラッシュコマンド
- Skills
- Sub-agents
- Hooks
- MCP
- 設定 / 権限 / サンドボックス / チェックポイント

## 5. 応用（実務でどう使う）
- 典型ワークフロー（調査→計画→実装→検証）
- チーム運用（CLAUDE.md 更新、並列作業、レビュー）
- 失敗パターンと回避策

## 6. 応用その2（spec-workflow MCP 連携）
- 導入の目的と向き不向き
- セットアップ概要
- 要件→設計→タスク化の流れ
- チーム運用のポイント

## 7. ドキュメントのベストプラクティス
- Diataxis（Tutorial / How-to / Reference / Explanation）
- 売れているドキュメントの構成パターン
- 書き方の原則（明確さ・一貫性・アクセシビリティ）

## 参考リンク
- 公式ドキュメント
- 参考記事（ルール設計・運用・拡張）

### 公式ドキュメント
- https://docs.claude.com/en/docs/claude-code/overview
- https://docs.claude.com/en/docs/claude-code/quickstart
- https://code.claude.com/docs/en/best-practices
- https://docs.claude.com/en/docs/claude-code/common-workflows
- https://docs.claude.com/en/docs/claude-code/slash-commands
- https://docs.claude.com/en/docs/claude-code/skills
- https://docs.claude.com/en/docs/claude-code/sub-agents
- https://docs.claude.com/en/docs/claude-code/hooks
- https://docs.claude.com/en/docs/claude-code/mcp
- https://docs.claude.com/en/docs/claude-code/settings
- https://docs.claude.com/en/docs/claude-code/checkpoints
- https://docs.claude.com/en/docs/claude-code/sandboxing
- https://platform.claude.com/docs/ja/build-with-claude/prompt-engineering/overview

### 参考記事
- https://www.humanlayer.dev/blog/writing-a-good-claude-md
- https://zenn.dev/hiraoku/scraps/de8a8f86d6e25d
- https://zenn.dev/tmasuyama1114/articles/claude_code_dynamic_rules
- https://zenn.dev/tmasuyama1114/articles/claude_code_extension_guide
- https://zenn.dev/akino/articles/62e25d7c1b37d6
- https://github.com/Pimzino/spec-workflow-mcp
- https://github.com/Pimzino/claude-code-spec-workflow
