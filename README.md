# memoria

Claude Codeの長期記憶を実現するプラグイン。

セッションの自動保存、設計決定の記録、開発者パターンの学習、Webダッシュボードでの管理を提供します。

## 機能

- **セッション自動保存**: SessionEnd/PreCompact時に会話履歴を自動保存
- **セッション再開**: `/memoria resume` で過去のセッションを再開
- **設計決定の記録**: プロジェクトの設計決定を保存・検索
- **開発者パターン**: good/badパターンを収集・学習
- **コーディングルール**: プロジェクト固有のルールを管理
- **Webダッシュボード**: セッション・決定・パターン・ルールの閲覧・編集

## インストール

```bash
# リポジトリをクローン
git clone https://github.com/your-username/memoria.git
cd memoria

# 依存関係をインストール
npm install

# MCPサーバーをビルド
cd mcp-server && npm install && npm run build && cd ..
```

## セットアップ

### 1. Claude Codeプラグインとして登録

`~/.claude/plugins/` にシンボリックリンクを作成:

```bash
ln -s /path/to/memoria ~/.claude/plugins/memoria
```

### 2. MCPサーバーを設定

`~/.claude/settings.json` に追加:

```json
{
  "mcpServers": {
    "memoria": {
      "command": "node",
      "args": ["/path/to/memoria/mcp-server/dist/index.js"]
    }
  }
}
```

## 使い方

### Hooks（自動動作）

| Hook | タイミング | 動作 |
|------|-----------|------|
| session-end | セッション終了時 | 会話履歴を自動保存、要約生成 |
| pre-compact | 圧縮前 | 進行中のセッションを保存 |
| session-start | セッション開始時 | 関連セッションの提案 |

### Skills（コマンド）

| コマンド | 説明 |
|---------|------|
| `/memoria resume [id]` | セッションを再開（ID省略で一覧表示） |
| `/memoria save` | 現在のセッションを手動保存 |
| `/memoria decision "タイトル"` | 設計決定を記録 |
| `/memoria search "クエリ"` | セッション・決定を検索 |
| `/memoria dashboard` | ダッシュボードURLを表示 |

### MCPツール

| ツール | 説明 |
|-------|------|
| `memoria_list_sessions` | セッション一覧を取得 |
| `memoria_get_session` | セッション詳細を取得 |
| `memoria_save_decision` | 設計決定を保存 |
| `memoria_save_pattern` | 開発者パターンを保存 |
| `memoria_search` | 全データを検索 |

### ダッシュボード

```bash
# 開発サーバーを起動
npm run dev
```

ブラウザで http://localhost:3000 を開く。

#### 画面一覧

- **Sessions**: セッション一覧・詳細・編集・削除
- **Decisions**: 設計決定の一覧・作成・編集・削除
- **Patterns**: 開発者パターンの一覧・追加・削除
- **Rules**: コーディングルールの一覧・追加・編集・削除
- **Settings**: 設定情報の表示

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
# ダッシュボード開発サーバー
npm run dev

# MCPサーバー開発
cd mcp-server && npm run dev

# ビルド
npm run build
cd mcp-server && npm run build
```

## 技術スタック

- **ダッシュボード**: Next.js 16, React 19, TypeScript, Tailwind CSS v4, shadcn/ui
- **MCPサーバー**: Node.js, TypeScript, @modelcontextprotocol/sdk
- **Hooks/Skills**: TypeScript, tsx

## ライセンス

MIT
