# mneme

[![NPM Version](https://img.shields.io/npm/v/%40hir4ta%2Fmneme)](https://www.npmjs.com/package/@hir4ta/mneme)
[![MIT License](https://img.shields.io/npm/l/%40hir4ta%2Fmneme)](https://github.com/hir4ta/mneme/blob/main/LICENSE)

Claude Codeの長期記憶を実現するプラグイン

セッションの自動保存、インテリジェントな記憶検索、Webダッシュボードでの管理を提供します。

## 機能

### コア機能
- **会話の自動保存**: セッション終了時にjqで自動保存（確実・高速）
- **自動記憶検索**: プロンプトごとに関連する過去のセッション・判断を自動で注入
- **PreCompactバックアップ**: Auto-Compact前にinteractionsをバックアップ（コンテキスト95%で発動）
- **フルデータ抽出**: `/mneme:save` で要約・判断・パターン・ルールを一括保存
- **記憶参照プランニング**: `/mneme:plan` で過去の知見を活用した設計・計画
- **セッション再開**: `/mneme:resume` で過去のセッションを再開（チェーン追跡付き）
- **セッション提案**: セッション開始時に最新3件を提案
- **ルールベースレビュー**: `dev-rules.json` / `review-guidelines.json` に基づくレビュー
- **GitHub PRレビュー**: `/mneme:review <PR URL>` でGitHub PRをレビュー
- **知見の抽出**: `/mneme:harvest` でPRコメントからルール・パターンを抽出
- **週次レポート**: レビュー結果を集計したMarkdownレポートを自動生成
- **Webダッシュボード**: セッション・判断・パターン・ルールの閲覧

## 課題と解決（導入メリット）

### Claude Code 開発で起きがちな課題

- **コンテキストの消失**: セッション終了やAuto-Compactで会話の文脈が失われる
- **判断の不透明化**: 「なぜこの設計にしたのか」が後から追えない
- **同じミスの繰り返し**: 同じエラーを何度も解決（学習されない）
- **知見の再利用が難しい**: 過去のやり取りや決定を検索・参照しづらい

### mneme でできること

- **自動保存 + 再開**で、セッションを跨いだ文脈の継続が可能
- **自動記憶検索**で、関連する過去の知見が常に会話に反映される
- **判断・パターン記録**で、理由やエラー解決策を後から追跡
- **検索とダッシュボード**で、過去の記録を素早く参照
- **レビュー機能**で、リポジトリ固有の観点に基づいて指摘

### チーム利用のメリット

- `.mneme/` のJSONファイルは**Git管理可能**なので、判断や会話の履歴をチームで共有できる
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
/plugin marketplace add hir4ta/mneme-marketplace
/plugin install mneme@mneme-marketplace
```

プロジェクトでmnemeを初期化：

```bash
# Claude Code内で
/init-mneme

# またはターミナルから
npx @hir4ta/mneme --init
```

Claude Codeを再起動して完了

## アップデート

Claude Code内で以下を実行

```bash
/plugin marketplace update mneme-marketplace
```

Claude Codeを再起動

### 自動更新を有効にする（推奨）

1. `/plugin` を実行
2. Marketplaces タブを選択
3. `mneme-marketplace` を選択
4. "Enable auto-update" を有効化

これによりClaude Code起動時に自動でアップデートされます

## 使い方

### セッション自動保存

**会話ログは自動保存**されます（セッション終了時にjqで抽出）。設定不要。

**PreCompact**ではinteractionsを`preCompactBackups`にバックアップします（コンテキスト95%で発動）。要約は自動作成されません。

### 自動記憶検索

**プロンプトごとに**、mnemeは自動で：
1. メッセージからキーワードを抽出
2. sessions/decisions/patternsを検索
3. 関連情報をClaudeに注入

手動で検索しなくても、過去の知見が常に活用されます。

### セッション提案

セッション開始時に最新3件が表示されます：

```
**Recent sessions:**
  1. [abc123] JWT認証の実装 (2026-01-27, main)
  2. [def456] ダッシュボードUI (2026-01-26, main)
  3. [ghi789] バグ修正 (2026-01-25, main)

Continue from a previous session? Use `/mneme:resume <id>`
```

### コマンド

| コマンド | 説明 |
| --------- | ------ |
| `/init-mneme` | プロジェクトでmnemeを初期化 |
| `/mneme:save` | 全データ抽出: 要約・判断・パターン・ルール |
| `/mneme:plan [トピック]` | 記憶参照 + ソクラティック質問 + タスク分割 |
| `/mneme:resume [id]` | セッションを再開（ID省略で一覧表示） |
| `/mneme:search "クエリ"` | セッション・判断・パターンを検索 |
| `/mneme:review [--staged\|--all\|--diff=branch\|--full]` | ルールに基づくレビュー |
| `/mneme:review <PR URL>` | GitHub PRをレビュー |
| `/mneme:harvest <PR URL>` | PRレビューコメントから知見を抽出 |
| `/mneme:report [--from YYYY-MM-DD --to YYYY-MM-DD]` | 週次レビューレポート |

### 推奨ワークフロー

```
plan → implement → save → review
```

1. **plan**: 記憶参照 + ソクラティック質問 + タスク分割
2. **implement**: 計画に沿って実装
3. **save**: 判断・パターン・ルールを抽出
4. **review**: 計画準拠とコード品質をレビュー

### ダッシュボード

プロジェクトディレクトリで以下を実行

```bash
npx @hir4ta/mneme --dashboard
```

ブラウザで <http://localhost:7777> を開く。

ポート変更:

```bash
npx @hir4ta/mneme --dashboard --port 8080
```

#### 画面一覧

- **Sessions**: セッション一覧・詳細
- **Decisions**: 技術的な判断の一覧・詳細
- **Rules**: 開発ルール・レビュー観点の閲覧
- **Patterns**: 学習済みパターンの閲覧（グッドパターン、アンチパターン、エラー解決策）
- **Statistics**: アクティビティチャート・セッション統計の表示
- **Graph**: タグ共有によるセッション関連性の可視化

#### 言語切り替え

ダッシュボードは日本語と英語に対応しています。ヘッダーの言語切り替えボタン（EN/JA）をクリックして切り替えできます。設定はlocalStorageに保存されます。

### MCPツール

mnemeはMCPサーバーを提供し、Claude Codeから直接呼び出せる検索・データベースツールを提供：

| サーバー | ツール | 説明 |
|---------|--------|------|
| mneme-search | `mneme_search` | 統合検索（FTS5、タグエイリアス解決） |
| mneme-search | `mneme_get_session` | セッション詳細取得 |
| mneme-search | `mneme_get_decision` | 決定詳細取得 |
| mneme-db | `mneme_list_projects` | 全プロジェクト一覧 |
| mneme-db | `mneme_cross_project_search` | クロスプロジェクト検索 |

### サブエージェント

| エージェント | 説明 |
|-------------|------|
| `mneme-reviewer` | ルールベースのコードレビュー（独立コンテキスト） |

## 仕組み

```mermaid
flowchart TB
    subgraph autosave [会話の自動保存]
        A[セッション終了] --> B[SessionEndフック]
        B --> C[jqでトランスクリプトから抽出]
        C --> D[interactions + files + metrics]
    end

    subgraph autosearch [自動記憶検索]
        E[ユーザープロンプト] --> F[UserPromptSubmitフック]
        F --> G[sessions/decisions/patternsを検索]
        G --> H[関連コンテキストを注入]
    end

    subgraph backup [PreCompactバックアップ]
        I[コンテキスト95%] --> J[PreCompactフック]
        J --> K[interactionsをpreCompactBackupsに保存]
    end

    subgraph manual [手動操作]
        L["mneme:save"] --> M[判断 + パターン + ルールを抽出]
        N["mneme:plan"] --> O[記憶参照 + 設計 + タスク分割]
    end

    subgraph resume [セッション再開]
        P["mneme:resume"] --> Q[一覧から選択]
        Q --> R[過去の文脈を復元 + resumedFrom設定]
    end

    subgraph review [レビュー]
        S["mneme:review"] --> T[ルールに基づく指摘]
        T --> U[レビュー結果を保存]
    end

    subgraph dashboard [ダッシュボード]
        V["npx @hir4ta/mneme -d"] --> W[ブラウザで表示]
        W --> X[全データを閲覧]
    end

    D --> P
    H --> L
    M --> V
    U --> V
```

## データ保存

mnemeは**ハイブリッドストレージ**方式でプライバシーと共有を両立：

| ストレージ | 場所 | 用途 | 共有 |
|-----------|------|------|------|
| **JSON** | `.mneme/` | 要約、決定、パターン、ルール | Git管理（チーム共有） |
| **SQLite** | `.mneme/local.db` | 会話履歴、バックアップ | ローカル専用（gitignored） |

**なぜハイブリッド？**
- **プライバシー**: 会話履歴（interactions）はローカルのみ（gitignored）
- **軽量化**: JSONファイルが100KB+から約5KBに軽量化（interactions除外）
- **将来対応**: セマンティック検索用のembeddingsテーブル準備済み

### ディレクトリ構成

**プロジェクト内** (`.mneme/`):
```text
.mneme/
├── local.db          # SQLite（会話履歴）- gitignored
├── tags.json         # タグマスターファイル（93タグ、表記揺れ防止）
├── sessions/         # セッションメタデータ - Git管理
│   └── YYYY/MM/
│       └── {id}.json # メタデータのみ（interactionsはlocal.db）
├── decisions/        # 技術的な判断（/saveから）- Git管理
│   └── YYYY/MM/
│       └── {id}.json
├── patterns/         # エラーパターン（/saveから）- Git管理
│   └── {user}.json
├── rules/            # 開発ルール / レビュー観点 - Git管理
├── reviews/          # レビュー結果 (YYYY/MM) - Git管理
└── reports/          # 週次レポート (YYYY-MM) - Git管理
```

`local.db` は `.mneme/.gitignore` に追加され、会話はプライベートに保たれます。

### セッションJSONスキーマ

セッションメタデータはJSONに保存（interactionsはプライバシー保護のためSQLiteに保存）：

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
  "metrics": {
    "userMessages": 5,
    "assistantResponses": 5,
    "thinkingBlocks": 5,
    "toolUsage": [{"name": "Edit", "count": 3}, {"name": "Write", "count": 2}]
  },
  "files": [
    { "path": "src/auth/jwt.ts", "action": "create" }
  ],
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

タグは `.mneme/tags.json` から選択され、表記揺れを防止します（例: 「フロント」→「frontend」）。マスターファイルには11カテゴリ93タグが含まれています：

- **domain**: frontend, backend, api, db, infra, mobile, cli
- **phase**: feature, bugfix, refactor, test, docs
- **ai**: llm, ai-agent, mcp, rag, vector-db, embedding
- **cloud**: serverless, microservices, edge, wasm
- その他...

## セキュリティとプライバシー

mnemeは**完全にローカルで動作**し、外部サーバーへのデータ送信は一切ありません。

| 項目 | 説明 |
|------|------|
| **外部通信** | なし - curl/fetch/HTTP リクエスト等は一切使用していません |
| **データ保存** | すべてプロジェクト内の `.mneme/` ディレクトリに保存 |
| **会話履歴** | `local.db` に保存され、自動的にgitignore（Git共有されません） |
| **使用ツール** | bash, jq, sqlite3, Node.js標準ライブラリのみ |
| **コード** | オープンソース - すべてのコードは監査可能です |

### プライバシー設計

- **会話内容（interactions）はローカル専用**: SQLite（`local.db`）に保存され、`.gitignore`に自動追加
- **メタデータのみGit共有可能**: セッション要約、決定、パターンなどはJSONでチーム共有可能
- **テレメトリなし**: 使用状況の追跡や外部送信は行いません

## ライセンス

MIT
