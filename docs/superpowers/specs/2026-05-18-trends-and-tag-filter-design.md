# 設計: トレンドページとタグフィルタ拡張

最終更新: 2026-05-18

## 目的

- 既存の3カテゴリ（AI / フロント / PdM）だけでは絞り込みが粗い。直近の話題語で絞りたい。
- 抽出辞書を手動メンテせず、API レスポンスの実データから「今話題の語」を自動集計したい。
- 上記2つを連動させる: トレンドページで見つけた語をそのままトップでフィルタできる。

## 非目標

- 形態素解析・LLM での意味的抽出（次フェーズ）。
- 複数タグの AND/OR、日付・場所・人数フィルタ（別チケット）。
- ログイン・お気に入り等の永続化機能。

## アーキテクチャ

```
GitHub Actions cron (06:00 JST)
  └─ scripts/fetch.py
       ├─ fetch_events()     # 既存。生 1100+ 件
       ├─ filter_events()    # 既存。62件前後
       ├─ extract_trends()   # 新規。生 1100+ 件 → 上位50語
       └─ save:
            ├─ site/data/events.json    # 既存（変更なし）
            └─ site/data/trends.json    # 新規

site/
  ├─ index.html      # 既存（チップに上位8語追加）
  ├─ app.js          # 既存（trends.json 読込・URL ?tag= 反映）
  ├─ trends.html     # 新規
  ├─ trends.js       # 新規
  └─ style.css       # 既存（追記）
```

## データ仕様

### `site/data/trends.json`

```json
{
  "updated_at": "2026-05-18T06:00:00+09:00",
  "trends": [
    { "term": "Claude", "count": 87 },
    { "term": "LLM", "count": 73 },
    ...
  ]
}
```

- `trends` は降順、上位 50 語。
- 上位 8 語をトップページのチップに使う（`config.json` で変更可）。

### `site/data/events.json`

変更なし。トレンド絞り込みはフロント側で `event.title + event.catch` と `trends[].term` をマッチさせて算出する。

理由: events.json を膨らませない。トレンド上位語が変わっても events.json 再生成不要。62 件 × 8 語の includes 計算は軽量（< 1ms）。

## 抽出アルゴリズム（シンプル頻度カウント）

入力: 生イベント `list[dict]`（filter 適用前、1100+ 件）。

```python
def extract_trends(raw_events: list[dict], dictionary: list[str],
                   stopwords: set[str], top_n: int) -> list[dict]:
    counter = {}
    for event in raw_events:
        haystack = (event.get("title", "") + " " +
                    event.get("catch", "")).lower()
        seen = set()
        for term in dictionary:
            if term.lower() in haystack and term not in seen:
                counter[term] = counter.get(term, 0) + 1
                seen.add(term)
    items = [
        {"term": t, "count": c}
        for t, c in counter.items()
        if t not in stopwords
    ]
    items.sort(key=lambda x: x["count"], reverse=True)
    return items[:top_n]
```

特徴:
- 同一イベント内の重複カウント抑制（`seen`）。
- 大文字小文字無視。境界は単純な部分一致（既存 `filter_events` と同方針）。
- ストップワード（`イベント`, `勉強会`, `LT会`）は辞書から除外。
- 1100 件 × 100 語 = 110,000 回 `in` 判定。Python で 100ms 未満。

## 辞書構造

`scripts/dictionary.py`:

```python
BASE_TERMS = [
    # AI / LLM
    "AI", "LLM", "RAG", "Claude", "Codex", "Cursor", "Copilot",
    "ChatGPT", "Gemini", "MCP", "エージェント", "生成AI",
    # フロント
    "React", "Next.js", "TypeScript", "Vue", "Svelte",
    "フロントエンド", "Web",
    # クラウド・インフラ
    "AWS", "GCP", "Azure", "Kubernetes", "Docker", "Terraform",
    # 言語
    "Rust", "Go", "Python", "Ruby", "Java",
    # データ
    "データ基盤", "Snowflake", "BigQuery", "dbt", "Iceberg",
    # PdM・UX
    "PdM", "プロダクトマネジメント", "UX",
    # セキュリティ
    "セキュリティ", "脆弱性",
]

STOPWORDS = {"イベント", "勉強会", "LT会", "オンライン"}
```

`config.json` に `trends.dictionary_extra: list[str]` と `trends.stopwords_extra: list[str]` を追加し、編集可能にする。

## フロント挙動

### トップ (`index.html`)

チップ並び: `すべて / AI / フロント / PdM / #Claude / #LLM / #AWS / ...（上位8語）`

- すべて単選。
- カテゴリチップ選択 → 既存ロジック（`matched_categories` で絞る）。
- トレンドチップ選択 → `event.title + event.catch` に該当語が含まれる events のみ表示。
- URL に `?tag=Claude` で開かれた場合、該当チップを active にして初期表示。
- チップ切替時に `history.replaceState` で URL の `?tag=` を更新。

### トレンドページ (`trends.html`)

- `trends.json` から全 50 語を一覧表示（バーチャート風 or リスト）。
- 各語に件数バッジ。
- クリックで `/index.html?tag=<term>` に遷移。
- `trends.json` の `updated_at` をヘッダに表示。
- ナビ: `index.html` ⇄ `trends.html` を相互リンク。

## URL 連動

- `?tag=Claude` → 起動時に該当チップ active。カテゴリ + トレンドどちらでもマッチさせる（カテゴリ名と一致すればカテゴリ、それ以外なら任意のトレンド語として扱う）。
- 単選なので URL の `tag` は最大1個。
- 該当語が現在のトレンド上位8に無い場合でもチップを動的に追加して active にする（「URL から飛んできた語」を尊重）。

## エラーハンドリング

- `trends.json` 取得失敗 → トレンドチップ部分を非表示。トップは既存の3カテゴリだけで動く（フォールバック）。
- 辞書語 0 件 → trends.json は `trends: []` で書き出す。フロントは「トレンド集計中」表示。
- `extract_trends` は raw_events が空でも空リストを返す（純粋関数）。

## テスト

`tests/test_extract_trends.py`:

1. 辞書ヒットでカウント増加。
2. 同イベント内の同一語は1回のみカウント。
3. ストップワードが上位語に出ない。
4. 大文字小文字無視（`Claude` と `claude` 同一視）。
5. 上位 N 切り出し。
6. 空入力で空リスト。
7. `title` のみ・`catch` のみのイベントを正しく扱う。

既存 `tests/test_filter.py` 11 件は変更なし。

## 設定変更

`config.json` 追加:

```json
{
  "trends": {
    "top_n_chips": 8,
    "top_n_total": 50,
    "dictionary_extra": [],
    "stopwords_extra": []
  }
}
```

## デプロイ

ワークフロー (`.github/workflows/update.yml`) は変更不要。`fetch.py` 内で trends.json も生成するため、既存の `git add site/data/` が両方拾う。

## ロールアウト

1. `extract_trends` 関数とテスト追加。
2. `fetch.py` 統合。ローカル動作確認。
3. `trends.html` / `trends.js` 追加。
4. `app.js` のチップ拡張・URL 連動。
5. style 調整。
6. ローカル e2e（Playwright）で URL 遷移確認。
7. push → Actions → Pages 反映確認。

## オープン課題（次フェーズ）

- 辞書を Self-tuning（出現語の n-gram 集計から候補追加）。
- LLM での意味的グルーピング（`AI Agent` と `エージェント` を統合）。
- 複数タグ AND/OR、日付・場所・人数フィルタ。
- トレンドの時系列グラフ（過去30日の出現推移）。
