# connpass おすすめイベント

connpass の人気イベントを毎日自動収集し、関心キーワードでフィルタしたものを表示する静的サイト。

## セットアップ

1. [connpass API キー申請ページ](https://connpass.com/about/api/) から API キーを申請
2. このリポジトリの Settings → Secrets and variables → Actions で `CONNPASS_API_KEY` を登録
3. Settings → Pages で Source を「GitHub Actions」に設定
4. Actions タブの `Update events` ワークフローを手動実行して初回データを生成
5. `https://<username>.github.io/<repo>/` でアクセス

## カスタマイズ

`config.json` を編集してキーワード・閾値を変更できる。

- `min_accepted` — 表示する最小参加者数（デフォルト 100）
- `fetch_days` — 取得する未来何日分か（デフォルト 30）
- `keywords` — マッチング対象のキーワード一覧
- `categories` — UI のカテゴリチップ定義

## ローカル実行

```bash
pip install -r scripts/requirements.txt
export CONNPASS_API_KEY=xxxx
python scripts/fetch.py
```

## ライセンス

MIT
