---
name: dashboard
description: WebダッシュボードのURLを表示する。
---

# /memoria dashboard

Webダッシュボードを起動または表示するスキルです。

## 使い方

```
/memoria dashboard
```

ダッシュボードのURLを表示します。まだ起動していない場合は起動方法を案内します。

## 実行手順

1. ダッシュボードのURLを表示
2. 必要に応じて起動コマンドを案内

## 出力フォーマット

### ダッシュボードが利用可能な場合

```
memoria ダッシュボード

URL: http://localhost:3000

ブラウザで上記URLを開いてください。

主な機能:
- セッション履歴の閲覧
- 設計決定の管理
- 開発者パターンの確認
- コーディングルールの編集
```

### ダッシュボードを起動する場合

```
ダッシュボードを起動するには、以下のコマンドを実行してください:

cd /path/to/project
npm run dashboard

または

npx memoria-dashboard

起動後、http://localhost:3000 でアクセスできます。
```

## 注意事項

- ダッシュボードは Next.js アプリケーションとして実装されています
- 開発中は `npm run dev` で起動します
- 本番環境では `npm run build && npm start` で起動します
