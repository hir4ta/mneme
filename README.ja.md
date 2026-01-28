# memoria

Claude Codeの長期記憶を実現するプラグイン

セッションの自動保存、技術的な判断の記録、Webダッシュボードでの管理を提供します。

## 機能

### コア機能
- **会話の自動保存**: セッション終了時にjqで自動保存（確実・高速）
- **PreCompactバックアップ**: Auto-Compact前にinteractionsをバックアップ（コンテキスト95%で発動）
- **手動保存**: `/memoria:save` で要約作成 + 構造化データ保存
- **セッション再開**: `/memoria:resume` で過去のセッションを再開（チェーン追跡付き）
- **セッション提案**: セッション開始時に最新3件を提案
- **技術的な判断の記録**: `/memoria:decision` で判断を記録
- **ルールベースレビュー**: `dev-rules.json` / `review-guidelines.json` に基づくレビュー
- **週次レポート**: レビュー結果を集計したMarkdownレポートを自動生成
- **Webダッシュボード**: セッション・判断記録の閲覧・編集

### 開発ワークフロー
- **ブレインストーミング**: ソクラティック質問 + 記憶参照で設計 (`/memoria:brainstorm`)
- **計画作成**: 2-5分単位のTDDタスク分割 (`/memoria:plan`)
- **TDD**: RED-GREEN-REFACTORサイクルの厳格強制 (`/memoria:tdd`)
- **デバッグ**: 根本原因分析 + エラーパターン参照 (`/memoria:debug`)
- **二段階レビュー**: 仕様準拠 + コード品質 (`/memoria:review --full`)

## 課題と解決（導入メリット）

### Claude Code 開発で起きがちな課題

- **コンテキストの消失**: セッション終了やAuto-Compactで会話の文脈が失われる
- **判断の不透明化**: 「なぜこの設計にしたのか」が後から追えない
- **知見の再利用が難しい**: 過去のやり取りや決定を検索・参照しづらい

### memoria でできること／解消できること

- **自動保存 + 再開**で、セッションを跨いだ文脈の継続が可能
- **判断記録**で、理由・代替案を後から追跡
- **検索とダッシュボード**で、過去の記録を素早く参照
- **レビュー機能**で、リポジトリ固有の観点に基づいて指摘
- **週次レポート**で、レビュー観点の改善と共有が容易

### チーム利用のメリット

- `.memoria/` のJSONファイルは**Git管理可能**なので、判断や会話の履歴をチームで共有できる
- オンボーディングやレビュー時に「背景・経緯」を短時間で把握できる

## インストール

### 前提条件

- **jq**: フックでJSON処理に使用します

```bash
# macOS
brew install jq

# Ubuntu/Debian
sudo apt-get install jq

# Windows (Chocolatey)
choco install jq

# Windows (Scoop)
scoop install jq

# Windows (winget)
winget install jqlang.jq
```

### プラグインのインストール

Claude Code内で以下を実行

```bash
/plugin marketplace add hir4ta/memoria-marketplace
/plugin install memoria@memoria-marketplace
```

Claude Codeを再起動して完了

## アップデート

Claude Code内で以下を実行

```bash
/plugin marketplace update memoria-marketplace
```

Claude Codeを再起動

### 自動更新を有効にする（推奨）

1. `/plugin` を実行
2. Marketplaces タブを選択
3. `memoria-marketplace` を選択
4. "Enable auto-update" を有効化

これによりClaude Code起動時に自動でアップデートされます

## 使い方

### セッション自動保存

**会話ログは自動保存**されます（セッション終了時にjqで抽出）。設定不要。

**PreCompact**ではinteractionsを`preCompactBackups`にバックアップします（コンテキスト95%で発動）。要約は自動作成されません。

**要約と構造化データ**は `/memoria:save` で手動作成：
- JSON: `title`, `tags`, `summary`, `plan`, `discussions`, `errors`, `handoff`, `references` を更新

### セッション提案

セッション開始時に最新3件が表示されます：

```
**Recent sessions:**
  1. [abc123] JWT認証の実装 (2026-01-27, main)
  2. [def456] ダッシュボードUI (2026-01-26, main)
  3. [ghi789] バグ修正 (2026-01-25, main)

Continue from a previous session? Use `/memoria:resume <id>`
```

### セッションチェーン追跡

セッションを再開すると、チェーンが追跡されます：

```
/memoria:resume abc123
  ↓
現在のセッションJSONを更新: "resumedFrom": "abc123"
  ↓
チェーン: current ← abc123
```

### コマンド

| コマンド | 説明 |
| --------- | ------ |
| `/memoria:resume [id]` | セッションを再開（ID省略で一覧表示） |
| `/memoria:save` | 要約作成 + 構造化データ保存 + ルール抽出 |
| `/memoria:decision "タイトル"` | 技術的な判断を記録 |
| `/memoria:search "クエリ"` | セッション・判断記録を検索 |
| `/memoria:review [--staged\|--all\|--diff=branch\|--full]` | ルールに基づくレビュー（--fullで二段階） |
| `/memoria:report [--from YYYY-MM-DD --to YYYY-MM-DD]` | 週次レビューレポート |
| `/memoria:brainstorm [トピック]` | ソクラティック質問 + 記憶参照で設計 |
| `/memoria:plan [トピック]` | 2-5分TDDタスクに分割した計画作成 |
| `/memoria:tdd` | RED-GREEN-REFACTOR厳格サイクル |
| `/memoria:debug` | 根本原因分析 + エラーパターン参照 |

### 推奨ワークフロー

```
brainstorm → plan → tdd → review
```

1. **brainstorm**: ソクラティック質問 + 記憶参照で設計
2. **plan**: 2-5分TDDタスクに分割
3. **tdd**: RED → GREEN → REFACTOR で実装
4. **review**: 仕様準拠（--full）+ コード品質をレビュー

### ダッシュボード

プロジェクトディレクトリで以下を実行

```bash
npx @hir4ta/memoria --dashboard
```

ブラウザで <http://localhost:7777> を開く。

ポート変更:

```bash
npx @hir4ta/memoria --dashboard --port 8080
```

#### 画面一覧

- **Sessions**: セッション一覧・詳細・編集・削除
- **Decisions**: 技術的な判断の一覧・作成・編集・削除
- **Rules**: 開発ルール・レビュー観点の閲覧・編集
- **Patterns**: 学習済みパターンの閲覧（グッドパターン、アンチパターン、エラー解決策）
- **Statistics**: アクティビティチャート・セッション統計の表示
- **Graph**: タグ共有によるセッション関連性の可視化

#### 言語切り替え

ダッシュボードは日本語と英語に対応しています。ヘッダーの言語切り替えボタン（EN/JA）をクリックして切り替えできます。設定はlocalStorageに保存されます。

## 仕組み

```mermaid
flowchart TB
    subgraph autosave [会話の自動保存]
        A[セッション終了] --> B[SessionEndフック]
        B --> C[jqでトランスクリプトから抽出]
        C --> D[interactions + files + metrics]
    end

    subgraph backup [PreCompactバックアップ]
        E[コンテキスト95%] --> F[PreCompactフック]
        F --> G[interactionsをpreCompactBackupsに保存]
    end

    subgraph manual [手動操作]
        H["memoria:save"] --> I[JSON更新（構造化データ）]
        J["memoria:decision"] --> K[判断を明示的に記録]
    end

    subgraph resume [セッション再開]
        L["memoria:resume"] --> M[一覧から選択]
        M --> N[過去の文脈を復元 + resumedFrom設定]
    end

    subgraph search [検索]
        O["memoria:search"] --> P[セッションと判断を検索]
    end

    subgraph review [レビュー]
        Q["memoria:review"] --> R[ルールに基づく指摘]
        R --> S[レビュー結果を保存]
    end

    subgraph report [週次レポート]
        T["memoria:report"] --> U[レビュー集計レポート]
    end

    subgraph dashboard [ダッシュボード]
        V["npx @hir4ta/memoria -d"] --> W[ブラウザで表示]
        W --> X[閲覧・編集・削除]
    end

    D --> L
    G --> L
    I --> L
    K --> O
    D --> S
    S --> U
    D --> V
    K --> V
```

## データ保存

すべてのデータは `.memoria/` ディレクトリに保存

```text
.memoria/
├── tags.json         # タグマスターファイル（93タグ、表記揺れ防止）
├── sessions/         # セッション履歴 (YYYY/MM)
│   └── YYYY/MM/
│       └── {id}.json # 全セッションデータ（自動 + 手動保存）
├── decisions/        # 技術的な判断 (YYYY/MM)
├── rules/            # 開発ルール / レビュー観点
├── reviews/          # レビュー結果 (YYYY/MM)
└── reports/          # 週次レポート (YYYY-MM)
```

Gitでバージョン管理可能です。`.gitignore` に追加するかはプロジェクトに応じて判断してください。

### セッションJSONスキーマ

全てのセッションデータは単一のJSONファイルに保存されます：

```json
{
  "id": "abc12345",
  "sessionId": "claude-code-からの-full-uuid",
  "createdAt": "2026-01-27T10:00:00Z",
  "endedAt": "2026-01-27T12:00:00Z",
  "title": "JWT認証機能の実装",
  "tags": ["auth", "jwt"],
  "context": {
    "branch": "feature/auth",
    "projectDir": "/path/to/project",
    "user": { "name": "tanaka", "email": "tanaka@example.com" }
  },
  "interactions": [
    {
      "id": "int-001",
      "timestamp": "2026-01-27T10:15:00Z",
      "user": "認証機能を実装して",
      "thinking": "思考プロセスの重要なポイント",
      "assistant": "RS256署名でJWT認証を実装しました"
    }
  ],
  "metrics": {
    "userMessages": 5,
    "assistantResponses": 5,
    "thinkingBlocks": 5,
    "toolUsage": [{"name": "Edit", "count": 3}, {"name": "Write", "count": 2}]
  },
  "files": [
    { "path": "src/auth/jwt.ts", "action": "create" }
  ],
  "preCompactBackups": [],
  "resumedFrom": "def45678",
  "status": "complete",

  "summary": {
    "title": "JWT認証機能の実装",
    "goal": "JWTベースの認証機能を実装",
    "outcome": "success",
    "description": "RS256署名でJWT認証を実装",
    "sessionType": "implementation"
  },

  "plan": {
    "tasks": ["[x] JWT署名方式の選定", "[x] ミドルウェア実装", "[ ] テスト追加"],
    "remaining": ["テスト追加"]
  },

  "discussions": [
    {
      "topic": "署名方式",
      "decision": "RS256を採用",
      "reasoning": "本番環境でのセキュリティを考慮",
      "alternatives": ["HS256（シンプルだが秘密鍵共有が必要）"]
    }
  ],

  "errors": [
    {
      "error": "secretOrPrivateKey must be asymmetric",
      "cause": "HS256用の秘密鍵をRS256で使用",
      "solution": "RS256用のキーペアを生成"
    }
  ],

  "handoff": {
    "stoppedReason": "テスト作成は次回に持ち越し",
    "notes": ["vitest設定済み", "モック用のキーペアは test/fixtures/ に配置"],
    "nextSteps": ["jwt.test.ts を作成", "E2Eテスト追加"]
  },

  "references": [
    { "url": "https://jwt.io/introduction", "title": "JWT Introduction" }
  ]
}
```

### セッションタイプ

`sessionType` フィールドはセッションの種類を分類します。

| タイプ | 説明 |
|--------|------|
| `decision` | 決定サイクルあり（設計判断、技術選択など） |
| `implementation` | コード変更あり |
| `research` | リサーチ・学習・キャッチアップ |
| `exploration` | コードベース探索 |
| `discussion` | 議論・相談のみ |
| `debug` | デバッグ・調査 |
| `review` | コードレビュー |

### タグ

タグは `.memoria/tags.json` から選択され、表記揺れを防止します（例: 「フロント」→「frontend」）。マスターファイルには11カテゴリ93タグが含まれています：

- **domain**: frontend, backend, api, db, infra, mobile, cli
- **phase**: feature, bugfix, refactor, test, docs
- **ai**: llm, ai-agent, mcp, rag, vector-db, embedding
- **cloud**: serverless, microservices, edge, wasm
- その他...

## ライセンス

MIT
