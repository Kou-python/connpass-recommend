# connpass おすすめイベント自動集約サイト Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** connpass の人気イベントを毎日自動収集し、関心キーワードでフィルタした静的サイトを GitHub Pages に公開する。各イベントに「申込画面への直リンク」ボタンを付け、詳細ページをスキップして1クリックで申込フォームに到達できるようにする。

**Architecture:** Python スクリプト（`scripts/fetch.py`）が connpass API V2 からイベントを取得・フィルタし、`site/data/events.json` に書き出す。GitHub Actions の cron（毎日06:00 JST）でこのスクリプトを実行し、結果をコミット＆ Pages デプロイする。フロントは Vanilla HTML/CSS/JS で `events.json` を fetch して描画する。

**Tech Stack:** Python 3.12 + requests / Vanilla HTML+CSS+JS / GitHub Actions / GitHub Pages（Actions ベースのデプロイ）/ pytest

**Spec:** `docs/superpowers/specs/2026-05-11-connpass-recommend-design.md`

**Project root:** `/Users/koseisasagawa/Desktop/Claude/connpass-recommend/`

---

## File Structure

```
connpass-recommend/
├── README.md                              # 使い方・APIキー申請手順
├── config.json                            # ユーザー編集可（キーワード・閾値）
├── .gitignore
├── scripts/
│   ├── requirements.txt                   # requests のみ
│   └── fetch.py                           # API取得・フィルタ・JSON生成
├── tests/
│   └── test_filter.py                     # filter_events のユニットテスト
├── site/                                  # GitHub Pages 公開ディレクトリ
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   └── data/
│       └── events.json                    # 生成物（fetch.py が書き出す）
└── .github/workflows/
    └── update.yml                         # cron 実行 + Pages デプロイ
```

**責務:**
- `scripts/fetch.py` — API IO、フィルタ、JSON書き出し（3つの純粋関数に分解）
- `tests/test_filter.py` — `filter_events` の挙動確認（純粋関数なのでテスト容易）
- `site/app.js` — events.json を読んで描画、カテゴリチップでクライアントフィルタ
- `site/index.html`, `site/style.css` — 構造とスタイル
- `config.json` — ユーザーが編集する唯一の設定ファイル
- `.github/workflows/update.yml` — cron 実行、コミット、Pages デプロイ

---

## Task 1: プロジェクト初期化と Git セットアップ

**Files:**
- Create: `connpass-recommend/.gitignore`
- Create: `connpass-recommend/README.md`

- [ ] **Step 1: Git リポジトリを初期化**

Run:
```bash
cd /Users/koseisasagawa/Desktop/Claude/connpass-recommend
git init
git branch -M main
```

Expected: `Initialized empty Git repository in .../connpass-recommend/.git/`

- [ ] **Step 2: `.gitignore` を作成**

Create `.gitignore`:
```
__pycache__/
*.pyc
.pytest_cache/
.venv/
venv/
.DS_Store
.env
```

- [ ] **Step 3: `README.md` を作成**

Create `README.md`:
```markdown
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
```

- [ ] **Step 4: Commit**

```bash
git add .gitignore README.md
git commit -m "chore: initialize project with gitignore and readme"
```

---

## Task 2: 設定ファイルとスペック・プランの配置

**Files:**
- Create: `connpass-recommend/config.json`
- Move: `docs/superpowers/specs/2026-05-11-connpass-recommend-design.md` → `specs/2026-05-11-connpass-recommend-design.md`

- [ ] **Step 1: `config.json` を作成**

Create `config.json`:
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

- [ ] **Step 2: spec ドキュメントを `specs/` 直下に整理**

Run:
```bash
mkdir -p specs
mv docs/superpowers/specs/2026-05-11-connpass-recommend-design.md specs/
mkdir -p docs/superpowers/plans
```

注: 既存の `docs/superpowers/plans/2026-05-11-connpass-recommend.md`（このファイル）はそのまま残す。

- [ ] **Step 3: Commit**

```bash
git add config.json specs/ docs/
git commit -m "chore: add config.json and organize spec/plan docs"
```

---

## Task 3: テストフィクスチャと filter_events のテスト

**Files:**
- Create: `connpass-recommend/scripts/__init__.py` (空ファイル)
- Create: `connpass-recommend/tests/__init__.py` (空ファイル)
- Create: `connpass-recommend/tests/test_filter.py`

- [ ] **Step 1: パッケージ用の空ファイルを作成**

```bash
mkdir -p scripts tests
touch scripts/__init__.py tests/__init__.py
```

- [ ] **Step 2: pytest を venv にインストール**

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install pytest requests
```

- [ ] **Step 3: 失敗するテストを書く**

Create `tests/test_filter.py`:
```python
"""filter_events のユニットテスト。

filter_events は connpass API のレスポンス（生イベントのリスト）と
config dict を受け取り、フィルタとソートを適用したリストを返す純粋関数。
"""
import pytest
from scripts.fetch import filter_events


def make_event(event_id=1, title="Test", catch="", description="",
               accepted=50, limit=100, started_at="2026-06-01T19:00:00+09:00",
               place="渋谷"):
    """テスト用にイベント dict を組み立てるヘルパー。"""
    return {
        "id": event_id,
        "title": title,
        "catch": catch,
        "description": description,
        "accepted": accepted,
        "limit": limit,
        "started_at": started_at,
        "place": place,
        "url": f"https://connpass.com/event/{event_id}/",
    }


CONFIG = {
    "min_accepted": 100,
    "keywords": ["AI", "React", "PdM"],
    "categories": {
        "AI": ["AI"],
        "フロント": ["React"],
        "PdM": ["PdM"],
    },
}


def test_filters_out_events_below_min_accepted():
    events = [make_event(title="AI Conf", accepted=50)]
    result = filter_events(events, CONFIG)
    assert result == []


def test_filters_out_events_with_no_keyword_match():
    events = [make_event(title="ただの飲み会", accepted=200)]
    result = filter_events(events, CONFIG)
    assert result == []


def test_keeps_event_meeting_both_conditions():
    events = [make_event(event_id=1, title="AI Conference", accepted=200)]
    result = filter_events(events, CONFIG)
    assert len(result) == 1
    assert result[0]["event_id"] == 1


def test_matches_keyword_in_description():
    events = [make_event(title="勉強会", description="Reactの話をします", accepted=150)]
    result = filter_events(events, CONFIG)
    assert len(result) == 1
    assert "React" in result[0]["matched_keywords"]


def test_matches_keyword_case_insensitively():
    events = [make_event(title="ai meetup", accepted=150)]
    result = filter_events(events, CONFIG)
    assert len(result) == 1
    assert "AI" in result[0]["matched_keywords"]


def test_sorts_by_accepted_descending():
    events = [
        make_event(event_id=1, title="AI A", accepted=150),
        make_event(event_id=2, title="AI B", accepted=300),
        make_event(event_id=3, title="AI C", accepted=200),
    ]
    result = filter_events(events, CONFIG)
    assert [e["event_id"] for e in result] == [2, 3, 1]


def test_includes_matched_categories():
    events = [make_event(title="AI Conference", accepted=200)]
    result = filter_events(events, CONFIG)
    assert result[0]["matched_categories"] == ["AI"]


def test_event_with_multiple_category_keywords_lists_both():
    events = [make_event(title="AI x React Hackathon", accepted=200)]
    result = filter_events(events, CONFIG)
    assert set(result[0]["matched_categories"]) == {"AI", "フロント"}


def test_output_includes_order_url():
    events = [make_event(event_id=42, title="AI Conf", accepted=200)]
    result = filter_events(events, CONFIG)
    assert result[0]["order_url"] == "https://connpass.com/event/42/order/"


def test_empty_input_returns_empty_list():
    result = filter_events([], CONFIG)
    assert result == []
```

- [ ] **Step 4: テストを実行して失敗を確認**

Run:
```bash
cd /Users/koseisasagawa/Desktop/Claude/connpass-recommend
source .venv/bin/activate
python -m pytest tests/test_filter.py -v
```

Expected: `ImportError: cannot import name 'filter_events' from 'scripts.fetch'`（モジュールがまだ存在しないため）

- [ ] **Step 5: Commit**

```bash
git add scripts/__init__.py tests/__init__.py tests/test_filter.py
git commit -m "test: add filter_events unit tests"
```

---

## Task 4: filter_events 関数の実装

**Files:**
- Create: `connpass-recommend/scripts/fetch.py` (filter_events のみ実装)

- [ ] **Step 1: filter_events を実装**

Create `scripts/fetch.py`:
```python
"""connpass API からイベントを取得し、フィルタして JSON に書き出す。

3つの責務に分離:
- fetch_events: API IO（Task 5 で実装）
- filter_events: 純粋関数のフィルタ・ソート
- save_events: JSON 書き出し（Task 5 で実装）
"""
from __future__ import annotations


def filter_events(events: list[dict], config: dict) -> list[dict]:
    """API レスポンスをフィルタ＆ソートし、フロント向けの形に整形する。

    フィルタ条件: accepted >= min_accepted かつ キーワード1つ以上にマッチ。
    ソート: accepted の降順。
    """
    keywords = config["keywords"]
    categories = config["categories"]
    min_accepted = config["min_accepted"]

    filtered = []
    for event in events:
        if event.get("accepted", 0) < min_accepted:
            continue

        haystack = " ".join([
            event.get("title") or "",
            event.get("catch") or "",
            event.get("description") or "",
        ]).lower()

        matched_keywords = [k for k in keywords if k.lower() in haystack]
        if not matched_keywords:
            continue

        matched_categories = [
            cat for cat, cat_keywords in categories.items()
            if any(k.lower() in haystack for k in cat_keywords)
        ]

        event_id = event["id"]
        filtered.append({
            "event_id": event_id,
            "title": event.get("title", ""),
            "started_at": event.get("started_at", ""),
            "place": event.get("place", ""),
            "accepted": event.get("accepted", 0),
            "limit": event.get("limit"),
            "matched_keywords": matched_keywords,
            "matched_categories": matched_categories,
            "url": event.get("url", f"https://connpass.com/event/{event_id}/"),
            "order_url": f"https://connpass.com/event/{event_id}/order/",
        })

    filtered.sort(key=lambda e: e["accepted"], reverse=True)
    return filtered
```

- [ ] **Step 2: テストを実行してパスを確認**

Run:
```bash
cd /Users/koseisasagawa/Desktop/Claude/connpass-recommend
source .venv/bin/activate
python -m pytest tests/test_filter.py -v
```

Expected: 全10テスト PASS

- [ ] **Step 3: Commit**

```bash
git add scripts/fetch.py
git commit -m "feat: implement filter_events"
```

---

## Task 5: API 取得と JSON 書き出しの実装

**Files:**
- Modify: `connpass-recommend/scripts/fetch.py` (fetch_events, save_events, main 追加)
- Create: `connpass-recommend/scripts/requirements.txt`

- [ ] **Step 1: requirements.txt を作成**

Create `scripts/requirements.txt`:
```
requests==2.32.3
```

- [ ] **Step 2: fetch.py に fetch_events / save_events / main を追加**

Append to `scripts/fetch.py`:
```python
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

API_URL = "https://connpass.com/api/v2/events/"
JST = timezone(timedelta(hours=9))


def fetch_events(api_key: str, days: int) -> list[dict]:
    """今後 days 日分のイベントを connpass API から取得する。

    ymd パラメータを日付ごとに指定して取得し、重複を排除する。
    レート制限対策として各リクエスト間に 1 秒スリープする。
    """
    today = datetime.now(JST).date()
    all_events: dict[int, dict] = {}

    for offset in range(days):
        target_date = today + timedelta(days=offset)
        ymd = target_date.strftime("%Y%m%d")
        start = 1
        while True:
            params = {"ymd": ymd, "count": 100, "start": start}
            response = requests.get(
                API_URL,
                params=params,
                headers={"X-API-Key": api_key},
                timeout=30,
            )
            response.raise_for_status()
            payload = response.json()
            events = payload.get("events", [])
            for event in events:
                all_events[event["id"]] = event

            results_returned = payload.get("results_returned", len(events))
            results_available = payload.get("results_available", 0)
            if start + results_returned > results_available or results_returned == 0:
                break
            start += results_returned
            time.sleep(1)
        time.sleep(1)

    return list(all_events.values())


def save_events(events: list[dict], path: Path) -> None:
    """events.json を書き出す。updated_at は JST の ISO 形式。"""
    payload = {
        "updated_at": datetime.now(JST).isoformat(timespec="seconds"),
        "events": events,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def main() -> int:
    api_key = os.environ.get("CONNPASS_API_KEY")
    if not api_key:
        print("ERROR: CONNPASS_API_KEY is not set", file=sys.stderr)
        return 1

    project_root = Path(__file__).resolve().parent.parent
    config = json.loads((project_root / "config.json").read_text(encoding="utf-8"))
    output_path = project_root / "site" / "data" / "events.json"

    raw_events = fetch_events(api_key, config["fetch_days"])
    print(f"Fetched {len(raw_events)} events from API")

    filtered = filter_events(raw_events, config)
    print(f"After filtering: {len(filtered)} events")

    save_events(filtered, output_path)
    print(f"Wrote {output_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 3: 既存テストが壊れていないことを確認**

Run:
```bash
cd /Users/koseisasagawa/Desktop/Claude/connpass-recommend
source .venv/bin/activate
python -m pytest tests/test_filter.py -v
```

Expected: 全10テスト PASS

- [ ] **Step 4: --dry-run なしで構文エラーがないことを確認**

Run:
```bash
python -c "from scripts.fetch import fetch_events, filter_events, save_events, main"
```

Expected: エラーなし

- [ ] **Step 5: Commit**

```bash
git add scripts/fetch.py scripts/requirements.txt
git commit -m "feat: implement fetch_events, save_events, and main entrypoint"
```

---

## Task 6: ダミーデータでフロントを動かせるようにする

**Files:**
- Create: `connpass-recommend/site/data/events.json` (手書きのサンプルデータ)

- [ ] **Step 1: ダミー events.json を作成**

Create `site/data/events.json`:
```json
{
  "updated_at": "2026-05-11T06:00:00+09:00",
  "events": [
    {
      "event_id": 100001,
      "title": "AI Agent Conference 2026",
      "started_at": "2026-05-15T19:00:00+09:00",
      "place": "渋谷",
      "accepted": 234,
      "limit": 200,
      "matched_keywords": ["AI", "エージェント"],
      "matched_categories": ["AI"],
      "url": "https://connpass.com/event/100001/",
      "order_url": "https://connpass.com/event/100001/order/"
    },
    {
      "event_id": 100002,
      "title": "Next.js 大規模アプリ設計",
      "started_at": "2026-05-18T20:00:00+09:00",
      "place": "オンライン",
      "accepted": 156,
      "limit": null,
      "matched_keywords": ["Next.js"],
      "matched_categories": ["フロント"],
      "url": "https://connpass.com/event/100002/",
      "order_url": "https://connpass.com/event/100002/order/"
    },
    {
      "event_id": 100003,
      "title": "PdM Night - プロダクト戦略の作り方",
      "started_at": "2026-05-20T19:30:00+09:00",
      "place": "品川",
      "accepted": 102,
      "limit": 150,
      "matched_keywords": ["PdM", "プロダクトマネジメント"],
      "matched_categories": ["PdM"],
      "url": "https://connpass.com/event/100003/",
      "order_url": "https://connpass.com/event/100003/order/"
    }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add site/data/events.json
git commit -m "chore: add sample events.json for frontend development"
```

---

## Task 7: HTML 構造の作成

**Files:**
- Create: `connpass-recommend/site/index.html`

- [ ] **Step 1: index.html を作成**

Create `site/index.html`:
```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>connpass おすすめイベント</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <header class="site-header">
    <h1>connpass おすすめイベント</h1>
    <p class="updated">最終更新: <span id="updated-at">読み込み中...</span></p>
  </header>

  <nav class="filters" id="filters" aria-label="カテゴリフィルタ">
    <!-- カテゴリチップは app.js が動的生成 -->
  </nav>

  <main>
    <section id="event-grid" class="event-grid" aria-live="polite">
      <p class="status">イベントを読み込んでいます...</p>
    </section>
  </main>

  <footer class="site-footer">
    <p>
      データ提供: <a href="https://connpass.com/" target="_blank" rel="noopener">connpass</a>
    </p>
  </footer>

  <script src="app.js" defer></script>
</body>
</html>
```

- [ ] **Step 2: ローカルで開いて構造を目視確認**

Run:
```bash
cd /Users/koseisasagawa/Desktop/Claude/connpass-recommend
python3 -m http.server 8000 --directory site &
SERVER_PID=$!
sleep 1
open http://localhost:8000/
```

Expected: ブラウザに「connpass おすすめイベント」のヘッダーと「イベントを読み込んでいます...」が見える（CSS未適用なので装飾なし）

サーバー停止: `kill $SERVER_PID`

- [ ] **Step 3: Commit**

```bash
git add site/index.html
git commit -m "feat: add HTML structure for site"
```

---

## Task 8: CSS の作成

**Files:**
- Create: `connpass-recommend/site/style.css`

- [ ] **Step 1: style.css を作成**

Create `site/style.css`:
```css
:root {
  --bg: #f7f8fa;
  --surface: #ffffff;
  --border: #e1e4e8;
  --text: #1f2328;
  --text-muted: #57606a;
  --accent: #0969da;
  --accent-hover: #0860c4;
  --tag-bg: #ddf4ff;
  --tag-text: #0969da;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans",
    "Meiryo", sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.6;
}

.site-header {
  padding: 24px 32px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}

.site-header h1 {
  margin: 0 0 4px;
  font-size: 24px;
}

.updated {
  margin: 0;
  font-size: 13px;
  color: var(--text-muted);
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 16px 32px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

.filter-chip {
  padding: 6px 14px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s;
}

.filter-chip:hover {
  border-color: var(--accent);
}

.filter-chip.active {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}

.event-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
  padding: 24px 32px;
}

.event-card {
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  transition: box-shadow 0.15s;
}

.event-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.event-card h2 {
  margin: 0 0 8px;
  font-size: 16px;
  line-height: 1.4;
}

.event-card h2 a {
  color: var(--text);
  text-decoration: none;
}

.event-card h2 a:hover {
  color: var(--accent);
  text-decoration: underline;
}

.event-meta {
  font-size: 13px;
  color: var(--text-muted);
  margin: 0 0 12px;
}

.event-meta span + span::before {
  content: " · ";
}

.event-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 0 0 16px;
}

.event-tag {
  font-size: 11px;
  padding: 2px 8px;
  background: var(--tag-bg);
  color: var(--tag-text);
  border-radius: 999px;
}

.apply-button {
  display: inline-block;
  margin-top: auto;
  padding: 10px 16px;
  background: var(--accent);
  color: #fff;
  text-decoration: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  text-align: center;
  transition: background 0.15s;
}

.apply-button:hover {
  background: var(--accent-hover);
}

.status {
  grid-column: 1 / -1;
  text-align: center;
  color: var(--text-muted);
  padding: 32px;
}

.site-footer {
  padding: 24px 32px;
  text-align: center;
  font-size: 13px;
  color: var(--text-muted);
  border-top: 1px solid var(--border);
}

.site-footer a {
  color: var(--accent);
}

@media (max-width: 600px) {
  .site-header,
  .filters,
  .event-grid,
  .site-footer {
    padding-left: 16px;
    padding-right: 16px;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add site/style.css
git commit -m "feat: add CSS styling"
```

---

## Task 9: フロントエンドの描画＆フィルタロジック

**Files:**
- Create: `connpass-recommend/site/app.js`

- [ ] **Step 1: app.js を作成**

Create `site/app.js`:
```javascript
'use strict';

const CATEGORY_COLOR = {
  AI: '#8b5cf6',
  'フロント': '#0ea5e9',
  PdM: '#f59e0b',
};

let allEvents = [];
let activeCategory = 'all';

async function loadEvents() {
  try {
    const response = await fetch('data/events.json', { cache: 'no-cache' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } catch (err) {
    console.error('Failed to load events.json', err);
    return null;
  }
}

function formatDate(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return isoString;
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hour = String(d.getHours()).padStart(2, '0');
  const minute = String(d.getMinutes()).padStart(2, '0');
  const weekday = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
  return `${month}/${day}(${weekday}) ${hour}:${minute}`;
}

function renderUpdatedAt(isoString) {
  const el = document.getElementById('updated-at');
  if (!isoString) {
    el.textContent = '不明';
    return;
  }
  const d = new Date(isoString);
  el.textContent = d.toLocaleString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function renderFilters(categories) {
  const container = document.getElementById('filters');
  container.innerHTML = '';
  const buttons = [['all', 'すべて'], ...categories.map((c) => [c, c])];
  for (const [key, label] of buttons) {
    const button = document.createElement('button');
    button.className = 'filter-chip' + (key === activeCategory ? ' active' : '');
    button.textContent = label;
    button.dataset.category = key;
    button.addEventListener('click', () => {
      activeCategory = key;
      document.querySelectorAll('.filter-chip').forEach((b) => {
        b.classList.toggle('active', b.dataset.category === key);
      });
      renderEvents();
    });
    container.appendChild(button);
  }
}

function renderEvents() {
  const grid = document.getElementById('event-grid');
  const visible = activeCategory === 'all'
    ? allEvents
    : allEvents.filter((e) => (e.matched_categories || []).includes(activeCategory));

  if (visible.length === 0) {
    grid.innerHTML = '<p class="status">条件に合うイベントがありません。</p>';
    return;
  }

  grid.innerHTML = '';
  for (const event of visible) {
    grid.appendChild(buildCard(event));
  }
}

function buildCard(event) {
  const card = document.createElement('article');
  card.className = 'event-card';

  const limit = event.limit == null ? '∞' : event.limit;
  const place = event.place || 'オンライン';
  const tags = (event.matched_keywords || [])
    .slice(0, 5)
    .map((k) => `<span class="event-tag">#${escapeHtml(k)}</span>`)
    .join('');

  card.innerHTML = `
    <h2>
      <a href="${escapeAttr(event.url)}" target="_blank" rel="noopener">
        ${escapeHtml(event.title)}
      </a>
    </h2>
    <p class="event-meta">
      <span>${formatDate(event.started_at)}</span>
      <span>${escapeHtml(place)}</span>
      <span>👥 ${event.accepted}/${escapeHtml(String(limit))}</span>
    </p>
    <div class="event-tags">${tags}</div>
    <a class="apply-button"
       href="${escapeAttr(event.order_url)}"
       target="_blank" rel="noopener">
      申込む →
    </a>
  `;
  return card;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s) {
  return escapeHtml(s);
}

async function init() {
  const data = await loadEvents();
  if (!data) {
    document.getElementById('event-grid').innerHTML =
      '<p class="status">データを取得できませんでした。</p>';
    return;
  }
  allEvents = data.events || [];
  renderUpdatedAt(data.updated_at);
  const categories = Array.from(
    new Set(allEvents.flatMap((e) => e.matched_categories || []))
  );
  renderFilters(categories);
  renderEvents();
}

init();
```

- [ ] **Step 2: ローカルで動作確認**

Run:
```bash
cd /Users/koseisasagawa/Desktop/Claude/connpass-recommend
python3 -m http.server 8000 --directory site &
SERVER_PID=$!
sleep 1
open http://localhost:8000/
```

Expected:
- ヘッダーに最終更新日時が表示される
- カテゴリチップ「すべて」「AI」「フロント」「PdM」が並ぶ
- 3枚のサンプルカードが表示され、それぞれに「申込む →」ボタンがある
- カテゴリチップをクリックすると絞り込まれる
- 「申込む」ボタンをクリックすると connpass の申込URLが新規タブで開く（404になるが挙動は確認できる）

サーバー停止: `kill $SERVER_PID`

- [ ] **Step 3: Commit**

```bash
git add site/app.js
git commit -m "feat: implement frontend rendering and category filtering"
```

---

## Task 10: GitHub Actions ワークフローの作成

**Files:**
- Create: `connpass-recommend/.github/workflows/update.yml`

- [ ] **Step 1: ワークフローファイルを作成**

```bash
mkdir -p .github/workflows
```

Create `.github/workflows/update.yml`:
```yaml
name: Update events

on:
  schedule:
    - cron: '0 21 * * *'  # 06:00 JST
  workflow_dispatch:

permissions:
  contents: write
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  update:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'

      - name: Install dependencies
        run: pip install -r scripts/requirements.txt

      - name: Fetch events
        env:
          CONNPASS_API_KEY: ${{ secrets.CONNPASS_API_KEY }}
        run: python scripts/fetch.py

      - name: Commit updated events.json
        run: |
          git config user.name 'github-actions[bot]'
          git config user.email 'github-actions[bot]@users.noreply.github.com'
          git add site/data/events.json
          if git diff --cached --quiet; then
            echo "No changes in events.json"
          else
            git commit -m "chore: update events $(date -u +%Y-%m-%d)"
            git push
          fi

      - name: Setup Pages
        uses: actions/configure-pages@v5

      - name: Upload Pages artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: site

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: ローカルで YAML 構文を検証**

Run:
```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/update.yml'))"
```

Expected: エラーなし（PyYAML 未インストールなら `pip install pyyaml` してから再実行）

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/update.yml
git commit -m "ci: add GitHub Actions workflow for daily updates and Pages deploy"
```

---

## Task 11: 最終チェック（全体動作確認）

**Files:**
- なし（既存ファイルの動作確認のみ）

- [ ] **Step 1: 全テスト実行**

Run:
```bash
cd /Users/koseisasagawa/Desktop/Claude/connpass-recommend
source .venv/bin/activate
python -m pytest tests/ -v
```

Expected: 全 10 テスト PASS

- [ ] **Step 2: ローカルで実際の API は叩かず構文チェックのみ**

Run:
```bash
python -c "
from scripts.fetch import filter_events
import json
config = json.load(open('config.json'))
data = json.load(open('site/data/events.json'))
result = filter_events([], config)
print('OK', result)
"
```

Expected: `OK []`（空入力で空出力、例外なし）

- [ ] **Step 3: フロント目視確認**

Run:
```bash
python3 -m http.server 8000 --directory site &
SERVER_PID=$!
sleep 1
open http://localhost:8000/
```

確認項目:
- [ ] ヘッダーに最終更新日時が表示される
- [ ] カテゴリチップが「すべて / AI / フロント / PdM」の順で並ぶ
- [ ] サンプル3イベントが参加者数の降順で並ぶ（234 → 156 → 102）
- [ ] 各カテゴリチップで絞り込みができる
- [ ] 「申込む →」ボタンが目立つ青色で各カードにある
- [ ] スマホ幅にリサイズしてもレイアウトが崩れない

サーバー停止: `kill $SERVER_PID`

- [ ] **Step 4: ファイル構成の最終確認**

Run:
```bash
find . -type f -not -path './.git/*' -not -path './.venv/*' -not -path '*/__pycache__/*' -not -path '*/.pytest_cache/*' | sort
```

Expected:
```
./.github/workflows/update.yml
./.gitignore
./README.md
./config.json
./docs/superpowers/plans/2026-05-11-connpass-recommend.md
./scripts/__init__.py
./scripts/fetch.py
./scripts/requirements.txt
./site/app.js
./site/data/events.json
./site/index.html
./site/style.css
./specs/2026-05-11-connpass-recommend-design.md
./tests/__init__.py
./tests/test_filter.py
```

- [ ] **Step 5: README に記載した手順がそのまま動くか確認**

Run:
```bash
cat README.md
```

セットアップ手順が現在のファイル構成と整合しているか確認。問題なければ完了。

- [ ] **Step 6: 最終コミット**

```bash
# もし未コミットの変更があれば
git status
# あれば
git add -A
git commit -m "chore: finalize project"
```

---

## 完了基準

- [ ] 全 10 ユニットテストが PASS
- [ ] ローカルで `python3 -m http.server 8000 --directory site` した時にサンプルカード3枚が描画され、フィルタが動作する
- [ ] GitHub Actions ワークフローの YAML が構文的に正しい
- [ ] README に書いたセットアップ手順がそのまま動く
- [ ] 全ての変更がコミット済み

## デプロイ後の検証（プラン外、ユーザー作業）

実装完了後、以下はユーザーが手動で実施:
1. GitHub にリポジトリを作成して push
2. connpass API キーを Secrets に登録
3. Pages を Actions ベースで有効化
4. `Update events` ワークフローを手動実行
5. 公開URL でサイトが見える＆実データが表示されることを確認
6. 任意のカードの「申込む」ボタンから connpass の申込フォームに到達できることを確認
