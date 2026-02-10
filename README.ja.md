# mneme

![Version](https://img.shields.io/badge/version-0.22.6-blue)
![Node.js](https://img.shields.io/badge/node-%3E%3D22.5.0-brightgreen)
[![NPM Version](https://img.shields.io/npm/v/%40hir4ta%2Fmneme)](https://www.npmjs.com/package/@hir4ta/mneme)
[![MIT License](https://img.shields.io/npm/l/%40hir4ta%2Fmneme)](https://github.com/hir4ta/mneme/blob/main/LICENSE)

Claude Codeの長期記憶を実現するプラグイン

セッションの自動保存、インテリジェントな記憶検索、Webダッシュボードでの管理を提供します。

## 機能

- **インクリメンタル保存**: 各ターン完了時に差分のみをSQLiteに保存（Node.js、高速）
- **自動記憶検索**: プロンプトごとに関連する過去のセッション・判断を自動で注入
- **PreCompact対応**: Auto-Compact前に未保存分をキャッチアップ（コンテキスト95%で発動）
- **フルデータ抽出**: `/mneme:save` で要約・判断・パターン・ルールを一括保存
- **セッション再開**: `/mneme:resume` で過去のセッションを再開（チェーン追跡付き）
- **セッション提案**: セッション開始時に最新3件を提案
- **知見の抽出**: `/mneme:harvest` でPRコメントから decision/pattern/rule の元データを抽出
- **Webダッシュボード**: セッション・元データ・開発ルールの閲覧
- **開発ルール + 承認**: 意思決定・パターン・ルールから開発ルールを生成し、インラインで承認/却下
- **知識グラフ層**: セッションと承認済み開発ルールを一つのグラフで可視化

## 課題と解決

Claude Codeのセッションは終了やAuto-Compactで文脈が失われ、過去の判断が追えず、知見の再利用が困難です。

**よくある問題**: セッション間での文脈喪失、同じミスの繰り返し、不透明な設計判断

**mnemeでの解決**: 自動保存と再開、毎プロンプトでの自動記憶検索、判断・パターン履歴の検索

**チームでの利点**: `.mneme/` のJSONファイルはGit管理され、判断やセッション履歴をチームで共有できます。

## インストール

### 前提条件

> **⚠️ 重要: Node.js 22.5.0 以上が必要です**
>
> mnemeは **Node.js 22.5.0** で導入された組み込みの `node:sqlite` モジュールを使用しています。
> Node.js 20以前のバージョンではダッシュボードが動作しません。
>
> バージョン確認: `node --version`
>
> Node.js 20 LTSは2026年4月でサポート終了です。Node.js 22以上にアップグレードしてください。

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

### コマンド

| コマンド                   | 説明                                       |
| -------------------------- | ------------------------------------------ |
| `/init-mneme`              | プロジェクトでmnemeを初期化                |
| `/mneme:save`              | 全データ抽出: 要約・判断・パターン・ルール |
| `/mneme:resume [id]`       | セッションを再開（ID省略で一覧表示）       |
| `/mneme:search "クエリ"`   | セッションと承認済み開発ルールを検索       |
| `/mneme:harvest <PR URL>`  | PRレビューコメントから知見を抽出           |

### 推奨ワークフロー

```
implement → save → approve rules
```

1. **implement**: コードを実装
2. **save**: 元データを抽出して開発ルール候補を生成
3. **validate**: `npm run validate:sources` で必須項目/priority/tags を検証
4. **approve rules**: 生成された開発ルールをインラインで確認・承認/却下

ランタイム詳細（Hook分岐、未保存終了、Auto-Compact）は以下:
- `docs/mneme-runtime-flow.md`

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
- **開発ルール**: 意思決定・パターン・ルールから生成されたルールの確認・承認
- **Statistics**: アクティビティチャート・セッション統計の表示
- **Graph**: タグ共有によるセッション関連性の可視化

#### 言語切り替え

ダッシュボードは日本語と英語に対応しています。ヘッダーの言語切り替えボタン（EN/JA）をクリックして切り替えできます。設定はlocalStorageに保存されます。

### 週次ナレッジHTML出力

直近7日間の知見活動を共有用HTMLとして出力できます:

```bash
npm run export:weekly-html
```

出力先:
- `.mneme/exports/weekly-knowledge-YYYY-MM-DD.html`

## データ保存

mnemeは**ハイブリッドストレージ**方式でプライバシーと共有を両立：JSON（Git管理）でチーム共有、SQLite（gitignored）で会話をプライベートに保存。

| ストレージ | 場所              | 用途                         | 共有                       |
| ---------- | ----------------- | ---------------------------- | -------------------------- |
| **JSON**   | `.mneme/`         | 要約、決定、パターン、ルール | Git管理（チーム共有）      |
| **SQLite** | `.mneme/local.db` | 会話履歴、バックアップ       | ローカル専用（gitignored） |

会話ログは各ターン完了時に自動保存されます。設定不要。

自動記憶検索はプロンプトごとに実行され、キーワード抽出 → 過去のセッション/開発ルール検索 → 関連コンテキスト注入を自動で行います。

セッション開始時に最新3件が表示されるので、`/mneme:resume <id>` ですぐに再開できます。

## セキュリティとプライバシー

mnemeは**完全にローカルで動作**し、外部サーバーへのデータ送信は一切ありません。

| 項目           | 説明                                                          |
| -------------- | ------------------------------------------------------------- |
| **外部通信**   | なし - curl/fetch/HTTP リクエスト等は一切使用していません     |
| **データ保存** | すべてプロジェクト内の `.mneme/` ディレクトリに保存           |
| **会話履歴**   | `local.db` に保存され、自動的にgitignore（Git共有されません） |
| **使用ツール** | bash, Node.js, jq, sqlite3（外部依存なし）                    |
| **コード**     | オープンソース - すべてのコードは監査可能です                 |

## ライセンス

MIT
