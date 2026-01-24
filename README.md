# memoria

Claude Codeの長期記憶を実現するプラグイン。

セッションの自動保存、設計決定の記録、開発者パターンの学習、Webダッシュボードでの管理を提供します。

## 機能

- **セッション自動保存**: SessionEnd/PreCompact時に会話履歴を自動保存
- **セッション再開**: `/memoria:resume` で過去のセッションを再開
- **設計決定の自動検出**: セッション終了時に設計決定を自動検出・保存（手動記録も可能）
- **開発者パターン**: good/badパターンを収集・学習
- **コーディングルール**: プロジェクト固有のルールを管理
- **Webダッシュボード**: セッション・決定・パターン・ルールの閲覧・編集

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

### Claude Code プラグインとしてインストール

```bash
# マーケットプレースを追加
/plugin marketplace add hir4ta/memoria-marketplace

# memoriaをインストール
/plugin install memoria@memoria-marketplace
```

## 使い方

### Hooks（自動動作）

| Hook | タイミング | 動作 |
|------|-----------|------|
| session-start | セッション開始時 | 関連セッションの提案、未レビュー決定の通知 |
| session-end | セッション終了時 | 会話履歴を保存、設計決定を自動検出 |
| pre-compact | 圧縮前 | 進行中のセッションを保存 |

### Skills（コマンド）

| コマンド | 説明 |
|---------|------|
| `/memoria:resume [id]` | セッションを再開（ID省略で一覧表示） |
| `/memoria:save` | 現在のセッションを手動保存 |
| `/memoria:decision "タイトル"` | 設計決定を記録 |
| `/memoria:search "クエリ"` | セッション・決定を検索 |

### ダッシュボード

プロジェクトディレクトリで以下を実行:

```bash
npx @hir4ta/memoria --dashboard
```

ブラウザで http://localhost:7777 を開く。

ポート変更:
```bash
npx @hir4ta/memoria --dashboard --port 8080
```

#### 画面一覧

- **Sessions**: セッション一覧・詳細・編集・削除
- **Decisions**: 設計決定の一覧・作成・編集・削除
- **Patterns**: 開発者パターンの一覧・追加・削除
- **Rules**: コーディングルールの一覧・追加・編集・削除

## データ保存

すべてのデータは `.memoria/` ディレクトリにJSON形式で保存されます:

```
.memoria/
├── sessions/       # セッション履歴
│   └── {id}.json
├── decisions/      # 設計決定
│   └── {id}.json
├── patterns/       # 開発者パターン
│   └── {user}.json
└── rules/          # コーディングルール
    └── coding-standards.json
```

Gitでバージョン管理可能です。

## 開発

```bash
# リポジトリをクローン
git clone https://github.com/hir4ta/memoria.git
cd memoria

# 依存関係をインストール
npm install

# フロントエンド開発サーバー (localhost:5173)
npm run dev

# API開発サーバー (localhost:7777)
npm run dev:server

# ビルド
npm run build

# プレビュー
npm run preview
```

## 技術スタック

- **Server**: Hono (Node.js)
- **Frontend**: React 18, Vite, React Router v7
- **UI**: shadcn/ui, Tailwind CSS v4
- **Hooks**: Bash, jq
- **Skills**: Markdown

## アーキテクチャ

```
[Claude Code] → [hooks (bash/jq)] → [.memoria/*.json]
                                          ↑
[/memoria:* commands] → [skills] ─────────┘
                                          ↓
                  [dashboard (Hono)] ← [.memoria/*.json]
```

- **ビルド不要**: フックはbash、スキルはmarkdown
- **外部依存なし**: jqのみ必要、ダッシュボードはnpxで実行
- **Git互換**: すべてのデータをJSONで保存、バージョン管理可能

## ライセンス

MIT
