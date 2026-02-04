# 6. 応用その2（spec-workflow MCP 連携）

## 6.1 目的と向き不向き
spec-workflow MCP は、**要件 → 設計 → タスク**の流れを型化するための MCP サーバーです。
Claude Code に “設計の型” を提供したいチーム向けです。

向いているケース:
- 仕様や設計が曖昧なまま実装が始まりがち
- チームの設計プロセスを統一したい
- 「まず仕様を固める」文化を作りたい

向いていないケース:
- 緊急バグ修正や小さな変更が中心
- 仕様がほぼ自明で、速度が最優先

## 6.2 セットアップ概要（MCP）
README では、MCP クライアントとして追加する方法が紹介されています。

**Claude Code CLI の例（README より）**
```
claude mcp add spec-workflow npx @pimzino/spec-workflow-mcp@latest -- /path/to/your/project
```

重要ポイント:
- `--` の後ろは **spec-workflow に渡す引数**
- `-y` を付けると npm の確認を省略できる

ダッシュボードは別プロセスで起動します:
```
npx -y @pimzino/spec-workflow-mcp@latest --dashboard
```

## 6.3 使い方のイメージ
- Claude Code に「仕様を整理して」などと依頼する
- MCP が要件・設計・タスクを構造化
- その後、通常の実装フローへ

## 6.4 チーム運用のポイント
- “設計 docs を正本” にする運用が前提
- spec-workflow で出た成果物を必ずレビュー
- ルール化しすぎない（運用の柔軟性を残す）

## 6.5 例（spec-workflow での流れ）
1. 依頼: 「新しい検索フィルタを追加したい。仕様の整理から」
2. MCP が要件を整理し、設計草案を作る
3. タスク分割を行い、実装の順序を決める

## 6.5.1 良い / 悪い例（要件の切り方）

| 観点 | 悪い例 | 良い例 |
| --- | --- | --- |
| 要件 | 検索を良くする | 検索結果の並び順を created_at 降順にする |
| 設計 | とにかく全部直す | 並び順のソートキーを追加する |
| タスク | まとめて全部やる | search.py 修正 → テスト実行 |

## 6.6 使い方（詳細）

### 6.6.1 推奨ワークフロー
1. **要件整理**: 目的と制約を最小粒度で書く
2. **設計草案**: 仕様の正本に基づき構造化
3. **タスク化**: 実装単位に分割
4. **レビュー**: 仕様とリスクの確認
5. **実装**: 小さく実装し検証

### 6.6.2 Claude Code での指示例
```
<goal>
検索結果の並び順を created_at 降順にしたい
</goal>

<constraints>
- 仕様は docs/requirements.md に従う
- 変更範囲は app/api/search.py のみ
</constraints>

<context>
- 正本: docs/requirements.md
- 参考: app/api/search.py
</context>

<output_format>
- 要件整理
- 設計草案
- タスク分割
</output_format>
```

### 6.6.3 MCP の出力をどう扱うか
- **要件**: 3 点以内に絞る
- **設計**: 1 つの構造（図/箇条書き）にまとめる
- **タスク**: 実装単位で分割し、依存関係を明示

### 6.6.4 失敗しやすいパターン
- 要件が大きすぎて「設計」にならない
- 設計が抽象的でタスクに落ちない
- タスクが大きすぎてレビュー不能

### 6.6.5 チームでの運用例
- 週次で spec-workflow の成果物レビュー
- ルールの更新は PR で合意
- 失敗例をナレッジとして残す

## 6.6.6 実務の通し例（要件→設計→タスク→実装案）

### 前提
- 対象: 既存の検索 API
- 変更: 並び順を `created_at` 降順に統一
- 仕様正本: `docs/requirements.md`
- 対象ファイル: `app/api/search.py`

### 要件（3 点以内）
1. 検索結果は `created_at` 降順で返す
2. 既存 API の互換性を維持する
3. 既存テストが通ること

### 設計（構造）
- `search.py` 内でソート条件を追加
- 既存のクエリ組み立てを壊さない

### タスク（実装単位）
1. `app/api/search.py` のクエリにソート条件を追加
2. 既存テストを実行し、結果を確認
3. 変更点を README または docs に追記（必要なら）

### 実装案（サンプル）
```python
# app/api/search.py

def search(query, limit=50):
    q = build_query(query)
    # 既存のフィルタ条件は維持
    # 追加: created_at 降順で統一
    q = q.order_by("created_at DESC")
    return q.limit(limit).execute()
```

### 期待するレビュー観点
- 仕様に一致しているか（created_at 降順）
- 既存のフィルタ条件を壊していないか
- 影響範囲がこの関数内に閉じているか

## 6.7 練習
- 自分のプロジェクトの変更を 1 つ選び、「要件 → 設計 → タスク」の流れで箇条書きする

### 演習テンプレ
目的: 要件→設計→タスクを分離する
入力: 変更したい機能 1 件
出力:
```
要件:
- 
- 

設計:
- 

タスク:
- 
- 
```

### 解答例
```
要件:
- 検索結果を created_at 降順で表示する
- 既存 API の互換性を維持する

設計:
- search.py でソートキーを追加

タスク:
- search.py を修正
- 既存テストを実行
```

## 6.8 チェックリスト
- 要件が 3 点以内に整理されている
- 設計が 1 つ以上の図や構造で表現できる
- タスクが「実装単位」で分割されている

## 参考
- https://github.com/Pimzino/spec-workflow-mcp
- https://github.com/Pimzino/claude-code-spec-workflow
- https://docs.claude.com/en/docs/claude-code/mcp
