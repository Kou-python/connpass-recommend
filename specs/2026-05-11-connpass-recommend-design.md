# connpass おすすめイベント自動集約サイト 設計書

- **作成日**: 2026-05-11
- **ステータス**: Approved（実装フェーズへ移行可）

## 1. 目的と背景

connpass の新着イベントを毎日チェックする手間を省き、関心領域に合致した人気イベントを一覧で確認できる静的サイトを構築する。さらに、通常の「一覧→詳細→申込」というフローを短縮し、サイトから1クリックで申込画面に到達できるようにする。

## 2. ゴール / ノンゴール

### ゴール

- 今後30日以内の connpass イベントから、関心領域 × 人気度の両軸で価値あるものだけを抽出して一覧表示する
- データを毎日自動更新する（運用工数ゼロ）
- 各イベントの申込画面に1クリックで直接飛べるようにする
- ユーザーがキーワード・閾値を設定ファイルで編集できるようにする

### ノンゴール

- ログインセッションを使った完全自動申込（規約・セキュリティリスクのため対応しない）
- イベントへの「いいね」「ブックマーク」などの個人化機能
- 過去イベントのアーカイブ表示
- モバイルアプリ化

## 3. 要件

### 3.1 機能要件

| ID | 要件 |
|----|------|
| FR-1 | connpass API V2 から今後30日のイベントを取得する |
| FR-2 | 「参加者数 ≥ 100」かつ「キーワードのいずれかにマッチ」を満たすイベントのみ表示する |
| FR-3 | 表示順は参加者数の降順（固定） |
| FR-4 | 各イベントカードに「申込む」ボタンがあり、`https://connpass.com/event/{event_id}/order/` を新規タブで開く |
| FR-5 | 上部にカテゴリチップ（[すべて][AI][フロント][PdM]）を配置し、クライアントサイドで絞り込みできる |
| FR-6 | サイト上部に最終更新日時を表示する |
| FR-7 | 毎日 06:00 JST にデータを自動更新する |
| FR-8 | キーワード・閾値・カテゴリ定義は `config.json` で編集可能 |

### 3.2 非機能要件

- ホスティング・運用コストはゼロ円（GitHub 無料枠内）
- API 失敗時もサイトは前回データで動き続ける（フェイルセーフ）
- イベント0件時もエラーにならず、空状態のメッセージを表示する
- ページロードはローカルJSONを fetch するだけで完結（外部APIをブラウザから叩かない）

## 4. アーキテクチャ

```
┌─────────────────────────────────────────────────────────┐
│ GitHub Actions (cron: '0 21 * * *' = 06:00 JST)         │
│  ┌───────────────────────────────────────────────────┐  │
│  │ scripts/fetch.py                                  │  │
│  │  1. config.json 読み込み                           │  │
│  │  2. connpass API V2 でイベント取得（ページング）    │  │
│  │  3. フィルタ（参加者数 + キーワード）              │  │
│  │  4. ソート（参加者数 降順）                        │  │
│  │  5. data/events.json に書き出し                   │  │
│  └───────────────────────────────────────────────────┘  │
│                  ↓ commit & push to main                 │
└─────────────────────────────────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────────────┐
│ GitHub Pages (静的ホスティング)                          │
│   index.html + style.css + app.js + data/events.json    │
│   → fetch('data/events.json') でカード描画              │
│   → カテゴリチップでクライアントサイドフィルタ           │
│   → 申込ボタン → connpass.com/event/{id}/order/         │
└─────────────────────────────────────────────────────────┘
```

### 4.1 コンポーネント分離

3つのユニットに分離し、それぞれ独立に理解・テスト可能にする。

| ユニット | 責務 | 依存先 |
|---------|------|--------|
| `scripts/fetch.py` | API取得・フィルタ・JSON生成 | connpass API、config.json |
| `public/app.js` | events.json を描画・クライアントフィルタ | data/events.json |
| `.github/workflows/update.yml` | cron 実行・コミット | scripts/fetch.py |

`fetch.py` の中身もさらに3関数に分解する：
- `fetch_events(api_key, days)` — API呼び出し（純粋にIO層）
- `filter_events(events, config)` — フィルタリング（純粋関数、テスト容易）
- `save_events(events, path)` — JSON書き出し

## 5. データ仕様

### 5.1 config.json

```json
{
  "min_accepted": 100,
  "fetch_days": 30,
  "keywords": [
    "AI", "LLM", "ChatGPT", "Claude", "RAG", "生成AI", "エージェント",
    "React", "Next.js", "TypeScript", "フロントエンド", "Web",
    "プロダクトマネジメント", "PdM", "プロダクトマネージャー", "UX"
  ],
  "categories": {
    "AI": ["AI", "LLM", "ChatGPT", "Claude", "RAG", "生成AI", "エージェント"],
    "フロント": ["React", "Next.js", "TypeScript", "フロントエンド", "Web"],
    "PdM": ["プロダクトマネジメント", "PdM", "プロダクトマネージャー", "UX"]
  }
}
```

### 5.2 data/events.json（生成物）

```json
{
  "updated_at": "2026-05-11T06:00:00+09:00",
  "events": [
    {
      "event_id": 123456,
      "title": "AI Agent Conference 2026",
      "started_at": "2026-05-15T19:00:00+09:00",
      "place": "渋谷",
      "online": false,
      "accepted": 234,
      "limit": 200,
      "matched_keywords": ["AI", "エージェント"],
      "matched_categories": ["AI"],
      "url": "https://connpass.com/event/123456/",
      "order_url": "https://connpass.com/event/123456/order/"
    }
  ]
}
```

## 6. データ取得詳細

- **API エンドポイント**: `https://connpass.com/api/v2/events/`
- **認証**: HTTPヘッダー `X-API-Key: <key>`（GitHub Secrets `CONNPASS_API_KEY`）
- **取得方法**: 今後30日分の `ymd` を生成し、`count=100`、必要に応じて `start` パラメータでページング
- **レート制限**: 1秒1回程度を遵守（リクエスト間に `time.sleep(1)`）
- **重複排除**: 同一 event_id を Set で除去

### キーワードマッチ

`title + catch + description` を結合した文字列に対して、各キーワードを大文字小文字無視で部分一致検索。マッチしたキーワードを `matched_keywords` に格納。1個以上マッチ かつ `accepted ≥ min_accepted` を通過条件とする。

### 申込URL

`https://connpass.com/event/{event_id}/order/` を `order_url` として保存。未ログイン時は connpass のログイン画面に飛び、ログイン後に申込画面へ自動遷移する。

## 7. UI 仕様

### レイアウト

```
┌──────────────────────────────────────────────────┐
│  connpass おすすめ  [最終更新: 2026-05-11 06:00] │
├──────────────────────────────────────────────────┤
│  [すべて][AI][フロント][PdM]                      │
├──────────────────────────────────────────────────┤
│ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│ │ タイトル  │ │ タイトル  │ │ タイトル  │           │
│ │ 5/15 @渋谷│ │ 5/18 オン│ │ 5/20 @品川│           │
│ │ 👥 234/200│ │ 👥 156/∞ │ │ 👥 102/150│           │
│ │ #AI #LLM │ │ #React   │ │ #PdM     │           │
│ │ [申込む→]│ │ [申込む→]│ │ [申込む→]│           │
│ └──────────┘ └──────────┘ └──────────┘           │
└──────────────────────────────────────────────────┘
```

### カード構成要素

- タイトル（クリックで詳細ページを新規タブで開く）
- 開催日時（`YYYY-MM-DD HH:mm` 形式）
- 場所（オンラインの場合は「オンライン」表示）
- 参加者数 / 定員（定員なしは `∞`）
- マッチしたキーワードをタグ表示
- 「申込む→」ボタン（`order_url` を新規タブで開く、目立つ色）

### カテゴリチップ

クリックで該当カテゴリのキーワードが `matched_categories` に含まれるイベントだけ表示。「すべて」がデフォルト選択。

## 8. 自動更新

### .github/workflows/update.yml

```yaml
name: Update events
on:
  schedule:
    - cron: '0 21 * * *'  # 06:00 JST
  workflow_dispatch:
jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.12' }
      - run: pip install -r scripts/requirements.txt
      - run: python scripts/fetch.py
        env:
          CONNPASS_API_KEY: ${{ secrets.CONNPASS_API_KEY }}
      - name: Commit and push
        run: |
          git config user.name 'github-actions[bot]'
          git config user.email 'github-actions[bot]@users.noreply.github.com'
          git add site/data/events.json
          git diff --cached --quiet || git commit -m "Update events $(date -u +%Y-%m-%d)"
          git push
      - uses: actions/upload-pages-artifact@v3
        with:
          path: site
      - uses: actions/deploy-pages@v4
```

## 9. エラーハンドリング

| シナリオ | 挙動 |
|---------|------|
| API キー未設定 | スクリプトがエラー終了し Actions が失敗。既存 events.json は保持される |
| API レート制限超過 | リクエスト間に sleep を入れる。429 受信時はスキップしてログ出力 |
| API 一時障害 | Actions ジョブ失敗。サイトは前回データで動作 |
| イベント0件 | 空配列を書き出し。フロントは「条件に合うイベントがありません」を表示 |
| events.json 取得失敗 | フロントはエラーメッセージ表示「データを取得できませんでした」 |

サイレント失敗は避け、API 失敗は必ず Actions ログに残す。

## 10. テスト戦略

| 対象 | 手法 |
|------|------|
| `filter_events` | ユニットテスト（pytest）。フィクスチャでサンプルイベント、各種条件をテスト |
| `fetch_events` | API モックを使った1ケースのみ（複雑な認証・ページングロジックの確認） |
| フロント | 手動確認（events.json 切替で空状態・大量データを目視チェック） |

## 11. ファイル構成

```
connpass-recommend/
├── README.md                        # 使い方・APIキー申請手順
├── config.json                      # ユーザー編集可
├── scripts/
│   ├── fetch.py
│   └── requirements.txt             # requests のみ
├── site/                            # GitHub Pages 公開ディレクトリ
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   └── data/
│       └── events.json              # fetch.py が直接書き出す（生成物）
├── specs/                           # 設計ドキュメント（公開対象外）
│   └── 2026-05-11-connpass-recommend-design.md
├── .github/workflows/
│   └── update.yml
└── tests/
    └── test_filter.py
```

GitHub Pages は GitHub Actions ベースのデプロイを使い、`site/` ディレクトリをアーティファクトとして公開する。これにより `/docs` 制約を回避でき、spec と公開ファイルを明確に分離できる。`fetch.py` は `site/data/events.json` に直接書き出す。フロントは相対パス `data/events.json` で読み込む。

（注: この設計書のスナップショットは初期コミット時に `specs/2026-05-11-connpass-recommend-design.md` へ移動する。現在は brainstorming 用の作業ディレクトリ `docs/superpowers/specs/` にある）

## 12. セットアップ手順（ユーザー向け）

1. https://connpass.com/about/api/ から API キーを申請
2. GitHub リポジトリの Secrets に `CONNPASS_API_KEY` を登録
3. GitHub Pages を有効化（Settings → Pages → Source: GitHub Actions）
4. Actions タブから `Update events` を手動実行して初回データ生成
5. `https://<username>.github.io/connpass-recommend/` でアクセス可能に

## 13. オープンクエスチョン

- 「申込む」ボタンの直リンク先 `order/` は connpass の内部URL構造に依存している。将来 connpass 側で変更された場合は `event/{id}/` への単純リンクにフォールバックする方針とする
- API 仕様変更への対応は当面手動。月1で動作確認する

## 14. 参考

- [connpass API リファレンス](https://connpass.com/about/api/)
- GitHub Actions cron expression: `0 21 * * *` (UTC) = 06:00 JST
