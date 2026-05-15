# 次のアクション（API キー申請待ち）

最終更新: 2026-05-11

## 現在の状況

実装は完了しており、connpass API キーの申請結果を待っている段階。
申請通過後は GitHub にリポジトリを作って push するだけで本番稼働する。

- 全11タスク実装完了（12コミット）
- ユニットテスト 10/10 PASS
- ローカル静的サーバーで動作確認済み（http://localhost:8765/）
- リポジトリは未 push（GitHub に未作成）

## 待機中のタスク

### 1. API キー申請（送信済み or これから送信）

申請ページ: https://connpass.com/about/api/

**申請フォーム回答案（Public 公開版）:**

> **API の利用目的:**
> 個人開発の学習プロジェクトとして、connpass の公開イベント情報を毎日1回定期取得し、関心キーワード（AI、Web フロントエンド、PdM 等）でフィルタした人気イベントの一覧サイトを構築する。サイトは GitHub Pages 上で公開するが、表示する情報は connpass 上で既に一般公開されているもの（タイトル、開催日時、参加者数、イベントURL）に限定し、フッターに「データ提供: connpass」のクレジットを明記する。商用利用は行わず、収益化（広告掲載・有料機能等）も予定しない。リクエスト頻度はリクエスト間1秒スリープ・1日1回の定期実行のみで、サーバー負荷に配慮する。
>
> **商用目的では利用しない:** 同意する
>
> **データベースに保存する予定:** はい
> （補足記入欄があれば: 「取得結果を JSON ファイル（events.json）として保存し、サイト表示用に毎日上書き更新する。独自 DB への蓄積はせず、最新版のみを保持する」）

返信は connpass 運営から数日〜数週間かかる可能性あり。

## API キー受領後のアクション（順番に実施）

### 2. ローカルで実データの取得テスト

```bash
cd /Users/koseisasagawa/Desktop/Claude/connpass-recommend
source .venv/bin/activate
export CONNPASS_API_KEY=<受領したキー>
python scripts/fetch.py
```

期待結果:
- `Fetched N events from API` と `After filtering: M events` が出力される
- `site/data/events.json` が実データで上書きされる

エラーが出たら、レスポンス形式が想定と違う可能性あり（特に `image_url` フィールド名や `place` の構造）。`scripts/fetch.py` の出力辞書定義を実レスポンスに合わせて調整する。

ブラウザで再確認:
```bash
python3 -m http.server 8765 --directory site
open http://localhost:8765/
```

### 3. GitHub に Public リポジトリ作成して push

```bash
cd /Users/koseisasagawa/Desktop/Claude/connpass-recommend
gh repo create connpass-recommend --public --source=. --push
```

または手動で GitHub 上に作成して:
```bash
git remote add origin git@github.com:<username>/connpass-recommend.git
git push -u origin main
```

### 4. GitHub Secrets と Pages 設定

GitHub Web UI で:

1. **Secrets 登録**: Settings → Secrets and variables → Actions → New repository secret
   - Name: `CONNPASS_API_KEY`
   - Value: `<受領したキー>`

2. **Pages 有効化**: Settings → Pages → Build and deployment
   - Source: **GitHub Actions** を選択（重要：Deploy from a branch ではない）

### 5. ワークフローの初回実行

GitHub Web UI の Actions タブで:
1. 左サイドバーの「Update events」を選択
2. 「Run workflow」ボタン → main ブランチ → Run workflow

期待結果:
- ワークフローが緑チェックで完了
- `site/data/events.json` が実データで更新されたコミットが追加される
- Pages にデプロイされ、`https://<username>.github.io/connpass-recommend/` でアクセス可能

### 6. 動作確認

公開URLで以下を確認:
- カードが実イベントで表示されている
- カテゴリチップで絞り込みが効く
- 「申込む →」ボタンから connpass の申込画面に遷移できる
- 画像サムネイルが表示される（PNG/JPG どちらでも）

## トラブルシューティング

### API レスポンスのフィールドが想定と違う場合

`scripts/fetch.py` の `fetch_events` 内で `print(payload)` を追加してレスポンス構造を確認。
特に確認すべきフィールド:
- イベント ID のキー名（`id` か `event_id` か）
- 画像 URL のキー名（`image_url` か `event_image` か）
- 場所のフィールド（`place` か `address` か、文字列か dict か）

V2 API の正式仕様: https://connpass.com/api/

### Actions が失敗する場合

- API キーが Secrets に正しく登録されているか
- ワークフロー権限が `contents: write` `pages: write` `id-token: write` になっているか（update.yml で設定済み）
- レート制限超過なら、`fetch_days` を 30 → 14 に下げて様子見

### Pages がデプロイされない場合

Settings → Pages の Source が「GitHub Actions」になっているか再確認（「Deploy from a branch」だと従来方式になる）

## ファイル構成（実装済み）

```
connpass-recommend/
├── README.md, config.json, .gitignore, NEXT_STEPS.md
├── scripts/fetch.py + requirements.txt   # API取得・フィルタ・JSON生成
├── tests/test_filter.py                   # 10テスト全PASS
├── site/                                  # GitHub Pages 公開対象
│   ├── index.html / style.css / app.js
│   └── data/events.json                   # 現状はサンプル3件（API取得後に上書き）
├── specs/2026-05-11-connpass-recommend-design.md
├── docs/superpowers/plans/2026-05-11-connpass-recommend.md
└── .github/workflows/update.yml           # 毎日06:00JST cron + Pages デプロイ
```

## 設計判断のメモ（再開時に参照）

- **公開範囲**: Public（B 案で確定）。申請文に Public 公開・クレジット表記を明記
- **申込フロー**: イベント url 末尾に `join/` を付けた直リンク（例 `https://findy.connpass.com/event/389503/join/`）。直接自動申込はしない
- **フィルタ条件**: `accepted >= 100` AND `キーワード1個以上マッチ`、ソートは `accepted` の降順のみ
- **キーワード**: AI / フロント / PdM の3カテゴリ。`config.json` で編集可能
- **更新頻度**: 毎日 06:00 JST（GitHub Actions cron `0 21 * * *` UTC）
- **画像**: 16:9 サムネイル、画像なしはグラデーション + タイトル頭文字でフォールバック
