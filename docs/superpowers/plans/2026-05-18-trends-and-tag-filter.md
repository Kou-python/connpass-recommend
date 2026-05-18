# Trends Page & Tag Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a trends page that surfaces high-frequency tech terms from raw connpass events, and expose the top 8 trending terms as additional single-select chips on the top page (with `?tag=<term>` URL deep-linking).

**Architecture:** `scripts/extract_trends.py` (new pure module + dictionary) feeds `site/data/trends.json` from `fetch.py`. Top page (`app.js`) reads trends.json and renders extra chips alongside the existing 3 categories; trending filter is computed client-side by matching `event.title + event.catch` against the term. New `trends.html` lists all 50 terms and links back to top with `?tag=`.

**Tech Stack:** Python 3.13 + pytest (already in repo, .venv present), vanilla HTML/CSS/JS (no framework), GitHub Actions cron.

**Spec:** `docs/superpowers/specs/2026-05-18-trends-and-tag-filter-design.md`

---

## File Structure

**Create:**
- `scripts/dictionary.py` — `BASE_TERMS`, `STOPWORDS` constants for trend extraction.
- `scripts/extract_trends.py` — pure `extract_trends(raw_events, dictionary, stopwords, top_n)` function.
- `tests/test_extract_trends.py` — 7 unit tests.
- `site/trends.html` — trends page markup.
- `site/trends.js` — trends page logic (load `trends.json`, render bars, link to `index.html?tag=`).

**Modify:**
- `scripts/fetch.py` — call `extract_trends`, write `trends.json`. Pass raw_events (pre-filter) to extractor.
- `site/app.js` — load `trends.json`, render trend chips (top N from config), parse `?tag=`, sync URL on chip switch, build `event.matched_trends` client-side from title+catch.
- `site/index.html` — add nav link to `trends.html`.
- `site/style.css` — add nav, trend chip variant, trends-page bar styles.
- `config.json` — add `trends.top_n_chips`, `trends.top_n_total`, `trends.dictionary_extra`, `trends.stopwords_extra`.

---

## Task 1: Add config.json trends section

**Files:**
- Modify: `config.json`

- [ ] **Step 1: Edit `config.json`**

Add `trends` object (alongside existing keys). Final file content:

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
  },
  "trends": {
    "top_n_chips": 8,
    "top_n_total": 50,
    "dictionary_extra": [],
    "stopwords_extra": []
  }
}
```

- [ ] **Step 2: Verify config parses**

Run: `.venv/bin/python -c "import json; print(json.load(open('config.json'))['trends'])"`

Expected output: `{'top_n_chips': 8, 'top_n_total': 50, 'dictionary_extra': [], 'stopwords_extra': []}`

- [ ] **Step 3: Commit**

```bash
git add config.json
git commit -m "feat: add trends section to config"
```

---

## Task 2: Create dictionary module

**Files:**
- Create: `scripts/dictionary.py`

- [ ] **Step 1: Write `scripts/dictionary.py`**

```python
"""トレンド抽出用の辞書とストップワード。

editable: BASE_TERMS に追加するか、config.json の trends.dictionary_extra に
ユーザー側で追記する。後者は再ビルド不要で済む。
"""
from __future__ import annotations

BASE_TERMS: list[str] = [
    # AI / LLM
    "AI", "LLM", "RAG", "MCP",
    "Claude", "Codex", "Cursor", "Copilot",
    "ChatGPT", "Gemini",
    "エージェント", "生成AI", "プロンプト",
    # フロント
    "React", "Next.js", "TypeScript", "Vue", "Svelte",
    "フロントエンド", "Web",
    # クラウド・インフラ
    "AWS", "GCP", "Azure",
    "Kubernetes", "Docker", "Terraform",
    # 言語
    "Rust", "Go", "Python", "Ruby", "Java", "Kotlin",
    # データ
    "データ基盤", "Snowflake", "BigQuery", "dbt", "Iceberg", "Databricks",
    # PdM・UX
    "PdM", "プロダクトマネジメント", "UX", "デザイン",
    # セキュリティ
    "セキュリティ", "脆弱性",
    # その他開発
    "DevOps", "SRE", "QA", "テスト",
]

STOPWORDS: set[str] = {"イベント", "勉強会", "LT会", "オンライン", "ハイブリッド"}
```

- [ ] **Step 2: Verify import works**

Run: `.venv/bin/python -c "from scripts.dictionary import BASE_TERMS, STOPWORDS; print(len(BASE_TERMS), len(STOPWORDS))"`

Expected output: a line like `48 5` (counts may differ if you tweak the lists, that's fine).

- [ ] **Step 3: Commit**

```bash
git add scripts/dictionary.py
git commit -m "feat: add trend extraction dictionary"
```

---

## Task 3: Write `extract_trends` failing test (basic counting)

**Files:**
- Create: `tests/test_extract_trends.py`

- [ ] **Step 1: Write the test file with first test**

```python
"""extract_trends のユニットテスト。

extract_trends は生イベントのリストと辞書を受け取り、
[{"term": str, "count": int}, ...] を出現数降順で返す純粋関数。
"""
import pytest


def make_event(title="", catch=""):
    return {"title": title, "catch": catch}


def test_counts_dictionary_term_in_title():
    from scripts.extract_trends import extract_trends
    events = [
        make_event(title="Claude Code Meetup"),
        make_event(title="Claude vs ChatGPT"),
        make_event(title="React deep dive"),
    ]
    result = extract_trends(events, dictionary=["Claude", "React"],
                            stopwords=set(), top_n=10)
    assert {"term": "Claude", "count": 2} in result
    assert {"term": "React", "count": 1} in result
```

- [ ] **Step 2: Run test, verify it fails**

Run: `.venv/bin/python -m pytest tests/test_extract_trends.py -v`

Expected: FAIL with `ModuleNotFoundError: No module named 'scripts.extract_trends'`

- [ ] **Step 3: Commit (red)**

```bash
git add tests/test_extract_trends.py
git commit -m "test: add failing test for extract_trends counting"
```

---

## Task 4: Make Task 3 test pass (minimal extract_trends)

**Files:**
- Create: `scripts/extract_trends.py`

- [ ] **Step 1: Write minimal `extract_trends`**

```python
"""トレンド語抽出: シンプル頻度カウント方式。

入力: connpass V2 API の生イベント list[dict]（filter 適用前）。
出力: [{"term": str, "count": int}, ...] を count 降順で top_n まで。

同一イベント内の同一語は1回のみカウント。大文字小文字無視。
"""
from __future__ import annotations


def extract_trends(
    events: list[dict],
    dictionary: list[str],
    stopwords: set[str],
    top_n: int,
) -> list[dict]:
    counter: dict[str, int] = {}
    for event in events:
        haystack = (
            (event.get("title") or "") + " " + (event.get("catch") or "")
        ).lower()
        seen: set[str] = set()
        for term in dictionary:
            if term in stopwords:
                continue
            if term.lower() in haystack and term not in seen:
                counter[term] = counter.get(term, 0) + 1
                seen.add(term)

    items = [{"term": t, "count": c} for t, c in counter.items()]
    items.sort(key=lambda x: (-x["count"], x["term"]))
    return items[:top_n]
```

- [ ] **Step 2: Run test, verify it passes**

Run: `.venv/bin/python -m pytest tests/test_extract_trends.py -v`

Expected: 1 passed.

- [ ] **Step 3: Commit (green)**

```bash
git add scripts/extract_trends.py
git commit -m "feat: implement extract_trends frequency counter"
```

---

## Task 5: Add same-event de-dup test

**Files:**
- Modify: `tests/test_extract_trends.py`

- [ ] **Step 1: Append test for de-dup**

Add at end of `tests/test_extract_trends.py`:

```python
def test_same_event_counts_term_only_once():
    from scripts.extract_trends import extract_trends
    events = [make_event(title="Claude Claude Claude", catch="Claude rocks")]
    result = extract_trends(events, dictionary=["Claude"],
                            stopwords=set(), top_n=10)
    assert result == [{"term": "Claude", "count": 1}]
```

- [ ] **Step 2: Run test, verify it passes**

Run: `.venv/bin/python -m pytest tests/test_extract_trends.py -v`

Expected: 2 passed (Task 4 already implements de-dup via `seen` set).

- [ ] **Step 3: Commit**

```bash
git add tests/test_extract_trends.py
git commit -m "test: verify per-event de-dup in extract_trends"
```

---

## Task 6: Add stopword test

**Files:**
- Modify: `tests/test_extract_trends.py`

- [ ] **Step 1: Append stopword test**

```python
def test_stopwords_are_excluded():
    from scripts.extract_trends import extract_trends
    events = [make_event(title="勉強会 about Claude")]
    result = extract_trends(events, dictionary=["勉強会", "Claude"],
                            stopwords={"勉強会"}, top_n=10)
    terms = [r["term"] for r in result]
    assert "勉強会" not in terms
    assert "Claude" in terms
```

- [ ] **Step 2: Run test**

Run: `.venv/bin/python -m pytest tests/test_extract_trends.py -v`

Expected: 3 passed.

- [ ] **Step 3: Commit**

```bash
git add tests/test_extract_trends.py
git commit -m "test: verify stopwords excluded"
```

---

## Task 7: Add case-insensitive test

**Files:**
- Modify: `tests/test_extract_trends.py`

- [ ] **Step 1: Append case-insensitive test**

```python
def test_case_insensitive_match():
    from scripts.extract_trends import extract_trends
    events = [
        make_event(title="claude is great"),
        make_event(title="CLAUDE Meetup"),
        make_event(title="ClAuDe deep dive"),
    ]
    result = extract_trends(events, dictionary=["Claude"],
                            stopwords=set(), top_n=10)
    assert result == [{"term": "Claude", "count": 3}]
```

- [ ] **Step 2: Run test**

Run: `.venv/bin/python -m pytest tests/test_extract_trends.py -v`

Expected: 4 passed.

- [ ] **Step 3: Commit**

```bash
git add tests/test_extract_trends.py
git commit -m "test: verify case-insensitive matching"
```

---

## Task 8: Add top_n / sort test

**Files:**
- Modify: `tests/test_extract_trends.py`

- [ ] **Step 1: Append sort and top_n test**

```python
def test_returns_top_n_sorted_descending():
    from scripts.extract_trends import extract_trends
    events = [
        make_event(title="A B C D"),
        make_event(title="A B C"),
        make_event(title="A B"),
        make_event(title="A"),
    ]
    result = extract_trends(events, dictionary=["A", "B", "C", "D"],
                            stopwords=set(), top_n=2)
    assert result == [
        {"term": "A", "count": 4},
        {"term": "B", "count": 3},
    ]
```

- [ ] **Step 2: Run test**

Run: `.venv/bin/python -m pytest tests/test_extract_trends.py -v`

Expected: 5 passed.

- [ ] **Step 3: Commit**

```bash
git add tests/test_extract_trends.py
git commit -m "test: verify top_n cutoff and descending sort"
```

---

## Task 9: Add empty-input and missing-field tests

**Files:**
- Modify: `tests/test_extract_trends.py`

- [ ] **Step 1: Append final tests**

```python
def test_empty_events_returns_empty_list():
    from scripts.extract_trends import extract_trends
    assert extract_trends([], dictionary=["Claude"],
                          stopwords=set(), top_n=10) == []


def test_handles_missing_title_or_catch():
    from scripts.extract_trends import extract_trends
    events = [
        {"title": "Claude only"},
        {"catch": "React only"},
        {},
    ]
    result = extract_trends(events, dictionary=["Claude", "React"],
                            stopwords=set(), top_n=10)
    terms = {r["term"]: r["count"] for r in result}
    assert terms == {"Claude": 1, "React": 1}
```

- [ ] **Step 2: Run all tests**

Run: `.venv/bin/python -m pytest tests/ -v`

Expected: 7 passed in `test_extract_trends.py` + 11 passed in `test_filter.py` = 18 total.

- [ ] **Step 3: Commit**

```bash
git add tests/test_extract_trends.py
git commit -m "test: cover empty input and missing fields"
```

---

## Task 10: Wire `extract_trends` into `fetch.py`

**Files:**
- Modify: `scripts/fetch.py`

- [ ] **Step 1: Read the current `main()` to confirm structure**

Run: `.venv/bin/python -c "import inspect; from scripts.fetch import main; print(inspect.getsource(main))"`

Confirm `main()` ends with `save_events(filtered, output_path)`.

- [ ] **Step 2: Add imports near top of `scripts/fetch.py`**

Find the existing imports block (lines ~10-17). Add after `import requests`:

```python
from scripts.dictionary import BASE_TERMS, STOPWORDS
from scripts.extract_trends import extract_trends
```

- [ ] **Step 3: Add `save_trends` function below `save_events`**

```python
def save_trends(trends: list[dict], path: Path) -> None:
    """trends.json を書き出す。updated_at は JST の ISO 形式。"""
    payload = {
        "updated_at": datetime.now(JST).isoformat(timespec="seconds"),
        "trends": trends,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
```

- [ ] **Step 4: Update `main()` to compute and write trends**

Replace the tail of `main()` (from `save_events(...)` through `return 0`) with:

```python
    save_events(filtered, output_path)
    print(f"Wrote {output_path}")

    trends_config = config.get("trends", {})
    dictionary = list(BASE_TERMS) + list(trends_config.get("dictionary_extra", []))
    stopwords = STOPWORDS | set(trends_config.get("stopwords_extra", []))
    top_n_total = trends_config.get("top_n_total", 50)

    trends = extract_trends(raw_events, dictionary, stopwords, top_n_total)
    print(f"Extracted {len(trends)} trend terms")

    trends_path = project_root / "site" / "data" / "trends.json"
    save_trends(trends, trends_path)
    print(f"Wrote {trends_path}")

    return 0
```

- [ ] **Step 5: Run fetch locally to confirm it produces both JSONs**

Run: `CONNPASS_API_KEY='<your-key>' .venv/bin/python scripts/fetch.py`

Expected stdout:
```
Fetched 1100+ events from API
After filtering: 50+ events
Wrote .../events.json
Extracted 50 trend terms
Wrote .../trends.json
```

- [ ] **Step 6: Inspect `trends.json`**

Run: `.venv/bin/python -c "import json; d=json.load(open('site/data/trends.json')); print(d['trends'][:5])"`

Expected: top 5 dicts like `{'term': 'AI', 'count': N}` with N a positive integer.

- [ ] **Step 7: Commit**

```bash
git add scripts/fetch.py site/data/trends.json
git commit -m "feat: generate trends.json from raw events"
```

---

## Task 11: Add nav links to index.html

**Files:**
- Modify: `site/index.html`

- [ ] **Step 1: Edit `site/index.html`**

Replace the `<header>` block with:

```html
  <header class="site-header">
    <div class="header-row">
      <h1>connpass おすすめイベント</h1>
      <nav class="site-nav">
        <a href="index.html" class="nav-link active">イベント</a>
        <a href="trends.html" class="nav-link">トレンド</a>
      </nav>
    </div>
    <p class="updated">最終更新: <span id="updated-at">読み込み中...</span></p>
  </header>
```

- [ ] **Step 2: Verify file is valid HTML**

Run: `.venv/bin/python -c "from html.parser import HTMLParser; HTMLParser().feed(open('site/index.html').read()); print('ok')"`

Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add site/index.html
git commit -m "feat: add nav links between events and trends pages"
```

---

## Task 12: Add nav and trend-chip styles to style.css

**Files:**
- Modify: `site/style.css`

- [ ] **Step 1: Append to `site/style.css`**

```css
.header-row {
  display: flex;
  align-items: baseline;
  gap: 24px;
  flex-wrap: wrap;
}

.site-nav {
  display: flex;
  gap: 16px;
  margin-left: auto;
}

.nav-link {
  font-size: 14px;
  color: var(--text-muted);
  text-decoration: none;
  padding: 4px 0;
  border-bottom: 2px solid transparent;
}

.nav-link.active {
  color: var(--text);
  border-bottom-color: var(--accent);
  font-weight: 600;
}

.nav-link:hover {
  color: var(--accent);
}

.filter-chip.trend {
  background: var(--tag-bg);
  color: var(--tag-text);
  border-color: transparent;
}

.filter-chip.trend.active {
  background: var(--accent);
  color: #fff;
}

.filter-group-label {
  font-size: 12px;
  color: var(--text-muted);
  align-self: center;
  margin-right: 4px;
}

/* trends page */
.trends-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 24px 32px;
  max-width: 720px;
  margin: 0 auto;
}

.trend-row {
  display: grid;
  grid-template-columns: 160px 1fr 60px;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-radius: 6px;
  background: var(--surface);
  border: 1px solid var(--border);
  text-decoration: none;
  color: var(--text);
  transition: border-color 0.15s;
}

.trend-row:hover {
  border-color: var(--accent);
}

.trend-rank {
  font-size: 13px;
  color: var(--text-muted);
}

.trend-term {
  font-weight: 600;
}

.trend-bar {
  height: 8px;
  background: var(--tag-bg);
  border-radius: 4px;
  overflow: hidden;
}

.trend-bar > span {
  display: block;
  height: 100%;
  background: var(--accent);
}

.trend-count {
  text-align: right;
  font-size: 13px;
  color: var(--text-muted);
}

@media (max-width: 600px) {
  .trends-list {
    padding-left: 16px;
    padding-right: 16px;
  }
  .trend-row {
    grid-template-columns: 100px 1fr 50px;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add site/style.css
git commit -m "feat: add styles for nav, trend chips, and trends page"
```

---

## Task 13: Extend `app.js` to load trends.json and render extra chips

**Files:**
- Modify: `site/app.js`

- [ ] **Step 1: Replace `loadEvents` with parallel loader**

Replace lines 12-23 (`async function loadEvents() { ... }`) with:

```javascript
async function loadJson(path) {
  try {
    const response = await fetch(path, { cache: 'no-cache' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } catch (err) {
    console.error(`Failed to load ${path}`, err);
    return null;
  }
}
```

- [ ] **Step 2: Add module-level state for trend chip terms and config**

After `let activeCategory = 'all';` (line ~10), add:

```javascript
let trendChipTerms = [];   // top-N terms displayed as chips
let topNChips = 8;         // override from config if available
```

- [ ] **Step 3: Replace `renderFilters` with category + trend version**

Replace the existing `renderFilters` function (lines ~50-68) with:

```javascript
function renderFilters(categories, trendTerms) {
  const container = document.getElementById('filters');
  container.innerHTML = '';

  const groups = [
    { label: '', items: [['all', 'すべて']] },
    { label: 'カテゴリ', items: categories.map((c) => [c, c]) },
    { label: 'トレンド', items: trendTerms.map((t) => [t, `#${t}`]) },
  ];

  for (const group of groups) {
    if (group.items.length === 0) continue;
    if (group.label) {
      const label = document.createElement('span');
      label.className = 'filter-group-label';
      label.textContent = group.label;
      container.appendChild(label);
    }
    for (const [key, text] of group.items) {
      const button = document.createElement('button');
      const isTrend = group.label === 'トレンド';
      button.className = 'filter-chip' + (isTrend ? ' trend' : '')
        + (key === activeCategory ? ' active' : '');
      button.textContent = text;
      button.dataset.category = key;
      button.dataset.kind = isTrend ? 'trend' : (key === 'all' ? 'all' : 'category');
      button.addEventListener('click', () => selectFilter(key));
      container.appendChild(button);
    }
  }
}

function selectFilter(key) {
  activeCategory = key;
  document.querySelectorAll('.filter-chip').forEach((b) => {
    b.classList.toggle('active', b.dataset.category === key);
  });
  syncUrlTag(key);
  renderEvents();
}

function syncUrlTag(key) {
  const url = new URL(window.location.href);
  if (key === 'all') {
    url.searchParams.delete('tag');
  } else {
    url.searchParams.set('tag', key);
  }
  window.history.replaceState({}, '', url);
}
```

- [ ] **Step 4: Replace `renderEvents` with version that handles trend keys**

Replace `renderEvents` (lines ~70-85) with:

```javascript
function renderEvents() {
  const grid = document.getElementById('event-grid');

  let visible;
  if (activeCategory === 'all') {
    visible = allEvents;
  } else if (trendChipTerms.includes(activeCategory)
             || isAdHocTrendKey(activeCategory)) {
    const needle = activeCategory.toLowerCase();
    visible = allEvents.filter((e) => {
      const hay = ((e.title || '') + ' '
                   + (e.catch || '')).toLowerCase();
      return hay.includes(needle);
    });
  } else {
    visible = allEvents.filter(
      (e) => (e.matched_categories || []).includes(activeCategory)
    );
  }

  if (visible.length === 0) {
    grid.innerHTML = '<p class="status">条件に合うイベントがありません。</p>';
    return;
  }

  grid.innerHTML = '';
  for (const event of visible) {
    grid.appendChild(buildCard(event));
  }
}

function isAdHocTrendKey(key) {
  // Term came from ?tag=… but isn't in the current top-N or built-in categories.
  if (key === 'all') return false;
  const knownCategories = Array.from(
    new Set(allEvents.flatMap((e) => e.matched_categories || []))
  );
  return !knownCategories.includes(key);
}
```

Note: this requires `event.title` and `event.catch` to be available on each event. The current `events.json` only stores `title`, not `catch`. So we ALSO need to widen `filter_events` output. Address this in Task 14.

- [ ] **Step 5: Replace `init` to load both JSONs and parse `?tag=`**

Replace `init` (lines ~143-157) with:

```javascript
async function init() {
  const [eventData, trendData] = await Promise.all([
    loadJson('data/events.json'),
    loadJson('data/trends.json'),
  ]);

  if (!eventData) {
    document.getElementById('event-grid').innerHTML =
      '<p class="status">データを取得できませんでした。</p>';
    return;
  }

  allEvents = eventData.events || [];
  renderUpdatedAt(eventData.updated_at);

  const categories = Array.from(
    new Set(allEvents.flatMap((e) => e.matched_categories || []))
  );

  const trends = (trendData && trendData.trends) || [];
  trendChipTerms = trends.slice(0, topNChips).map((t) => t.term);

  // Initial filter from ?tag=
  const params = new URLSearchParams(window.location.search);
  const tag = params.get('tag');
  if (tag) {
    activeCategory = tag;
    if (!categories.includes(tag) && !trendChipTerms.includes(tag)) {
      // ad-hoc term from URL: surface it as an extra chip so the user can clear it
      trendChipTerms = [tag, ...trendChipTerms];
    }
  }

  renderFilters(categories, trendChipTerms);
  renderEvents();
}
```

- [ ] **Step 6: Verify file syntax**

Run: `node -c site/app.js 2>&1 || .venv/bin/python -c "import esprima" 2>/dev/null` — if neither tool is available, just `head` the file:

Run: `head -5 site/app.js && tail -5 site/app.js`

Visually confirm `'use strict';` at top and the file ends cleanly.

- [ ] **Step 7: Commit**

```bash
git add site/app.js
git commit -m "feat: load trends.json and render trend chips with URL sync"
```

---

## Task 14: Include `catch` field in events.json

**Files:**
- Modify: `scripts/fetch.py`
- Modify: `tests/test_filter.py`

Trend filtering needs `event.catch` on the client. Add it to `filter_events` output.

- [ ] **Step 1: Add failing test**

Append to `tests/test_filter.py`:

```python
def test_output_includes_catch():
    events = [make_event(event_id=1, title="AI", catch="LLM hands-on", accepted=200)]
    result = filter_events(events, CONFIG)
    assert result[0]["catch"] == "LLM hands-on"
```

- [ ] **Step 2: Verify it fails**

Run: `.venv/bin/python -m pytest tests/test_filter.py::test_output_includes_catch -v`

Expected: FAIL with `KeyError: 'catch'`.

- [ ] **Step 3: Update `filter_events` output dict**

In `scripts/fetch.py`, find the `filtered.append({...})` block. Add `"catch": event.get("catch", ""),` between `"title"` and `"started_at"`:

```python
        filtered.append({
            "event_id": event_id,
            "title": event.get("title", ""),
            "catch": event.get("catch", ""),
            "started_at": event.get("started_at", ""),
            ...
        })
```

- [ ] **Step 4: Verify all tests pass**

Run: `.venv/bin/python -m pytest tests/ -v`

Expected: 19 passed (12 in test_filter, 7 in test_extract_trends).

- [ ] **Step 5: Commit**

```bash
git add tests/test_filter.py scripts/fetch.py
git commit -m "feat: include catch field in events.json for client-side trend matching"
```

---

## Task 15: Build trends.html

**Files:**
- Create: `site/trends.html`

- [ ] **Step 1: Write `site/trends.html`**

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>connpass トレンド | connpass おすすめイベント</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <header class="site-header">
    <div class="header-row">
      <h1>トレンドワード</h1>
      <nav class="site-nav">
        <a href="index.html" class="nav-link">イベント</a>
        <a href="trends.html" class="nav-link active">トレンド</a>
      </nav>
    </div>
    <p class="updated">最終更新: <span id="updated-at">読み込み中...</span></p>
  </header>

  <main>
    <section id="trends-list" class="trends-list" aria-live="polite">
      <p class="status">トレンドを読み込んでいます...</p>
    </section>
  </main>

  <footer class="site-footer">
    <p>
      データ提供: <a href="https://connpass.com/" target="_blank" rel="noopener">connpass</a>
    </p>
  </footer>

  <script src="trends.js" defer></script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add site/trends.html
git commit -m "feat: add trends page markup"
```

---

## Task 16: Build trends.js

**Files:**
- Create: `site/trends.js`

- [ ] **Step 1: Write `site/trends.js`**

```javascript
'use strict';

async function loadTrends() {
  try {
    const response = await fetch('data/trends.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (err) {
    console.error('Failed to load trends.json', err);
    return null;
  }
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

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderTrends(trends) {
  const list = document.getElementById('trends-list');
  if (!trends || trends.length === 0) {
    list.innerHTML = '<p class="status">トレンドデータがありません。</p>';
    return;
  }

  const max = trends[0].count;
  list.innerHTML = '';

  trends.forEach((t, i) => {
    const a = document.createElement('a');
    a.className = 'trend-row';
    a.href = `index.html?tag=${encodeURIComponent(t.term)}`;
    const pct = Math.max(2, Math.round((t.count / max) * 100));
    a.innerHTML = `
      <span class="trend-rank">${i + 1}. <span class="trend-term">${escapeHtml(t.term)}</span></span>
      <span class="trend-bar"><span style="width: ${pct}%"></span></span>
      <span class="trend-count">${t.count}</span>
    `;
    list.appendChild(a);
  });
}

async function init() {
  const data = await loadTrends();
  if (!data) {
    document.getElementById('trends-list').innerHTML =
      '<p class="status">データを取得できませんでした。</p>';
    return;
  }
  renderUpdatedAt(data.updated_at);
  renderTrends(data.trends || []);
}

init();
```

- [ ] **Step 2: Commit**

```bash
git add site/trends.js
git commit -m "feat: add trends page logic"
```

---

## Task 17: Local end-to-end smoke test

**Files:** none modified.

- [ ] **Step 1: Re-fetch with the API key to refresh local JSON**

Run: `CONNPASS_API_KEY='<your-key>' .venv/bin/python scripts/fetch.py`

Expected:
```
Fetched 1000+ events from API
After filtering: 60+ events
Wrote .../events.json
Extracted 50 trend terms
Wrote .../trends.json
```

- [ ] **Step 2: Confirm `events.json` has `catch` and `trends.json` has terms**

Run:
```bash
.venv/bin/python -c "
import json
e = json.load(open('site/data/events.json'))['events'][0]
t = json.load(open('site/data/trends.json'))['trends']
print('catch present:', 'catch' in e)
print('top 5 trends:', [(x['term'], x['count']) for x in t[:5]])
"
```

Expected: `catch present: True` and a list of 5 `(term, count)` tuples.

- [ ] **Step 3: Serve site/ if no server is running**

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8765/`

If `200`, server is already up; skip start. Otherwise:

Run: `python3 -m http.server 8765 --directory site &`

- [ ] **Step 4: Verify pages load**

Run:
```bash
curl -s -o /dev/null -w "index: %{http_code}\n" http://localhost:8765/
curl -s -o /dev/null -w "trends html: %{http_code}\n" http://localhost:8765/trends.html
curl -s -o /dev/null -w "trends json: %{http_code}\n" http://localhost:8765/data/trends.json
```

Expected: all `200`.

- [ ] **Step 5: Browser checks (manual or via Playwright)**

Open `http://localhost:8765/` in a browser:
- Verify category chips (3) plus trend chips (8) appear with `カテゴリ` and `トレンド` group labels.
- Click a trend chip; URL becomes `?tag=<term>`; events list filters down.
- Click `すべて`; URL `?tag=` removed; full list returns.
- Click `トレンド` in nav; trends page renders 50 ranked rows.
- Click any row; lands on `index.html?tag=<term>` with that chip active.
- Try `http://localhost:8765/?tag=Foobar`; chip "#Foobar" appears prepended (ad-hoc), 0 events shown.

Mark this step done only after all 5 visual checks pass.

- [ ] **Step 6: Commit refreshed data**

```bash
git add site/data/events.json site/data/trends.json
git commit -m "data: refresh after trends feature wiring"
```

---

## Task 18: Push and verify production deploy

**Files:** none modified.

- [ ] **Step 1: Push**

```bash
git push
```

- [ ] **Step 2: Trigger workflow**

```bash
gh workflow run "Update events" --repo Kou-python/connpass-recommend --ref main
```

- [ ] **Step 3: Wait for completion**

Run: `gh run list --repo Kou-python/connpass-recommend --limit 1 --json databaseId --jq '.[0].databaseId'`

Take the ID, then:

```bash
gh run watch <id> --repo Kou-python/connpass-recommend --exit-status
```

Expected: green check, all steps pass.

- [ ] **Step 4: Verify public URLs**

```bash
curl -s -o /dev/null -w "index: %{http_code}\n" https://kou-python.github.io/connpass-recommend/
curl -s -o /dev/null -w "trends html: %{http_code}\n" https://kou-python.github.io/connpass-recommend/trends.html
curl -s https://kou-python.github.io/connpass-recommend/data/trends.json | .venv/bin/python -c "import json,sys; d=json.load(sys.stdin); print('terms:', len(d['trends'])); print('top1:', d['trends'][0])"
```

Expected: both pages `200`, `terms: 50`, `top1: {'term': '...', 'count': N}`.

---

## Spec Coverage Check

Spec sections vs tasks:

- §概要 (3カテゴリ + 上位8語チップ + URL deep link) → Tasks 13, 17
- §非目標 → respected (no AND/OR, no LLM, no morpheme analysis)
- §アーキテクチャ → Tasks 4, 10
- §データ仕様 trends.json → Tasks 4, 10
- §データ仕様 events.json (catch field added) → Task 14
- §抽出アルゴリズム → Tasks 4-9
- §辞書構造 → Tasks 1, 2
- §フロント挙動 トップ → Task 13
- §フロント挙動 トレンド → Tasks 15, 16
- §URL 連動 → Task 13 (Step 5: ad-hoc term via `trendChipTerms` prepend)
- §エラーハンドリング → Task 13 (loadJson returns null on 404; trend group skipped if `trendTerms.length === 0`)
- §テスト → Tasks 3-9, 14
- §設定変更 → Task 1
- §デプロイ → Task 18

All spec sections covered.

## Self-review checklist

- [x] No placeholders / "TBD" — checked.
- [x] Method names consistent: `extract_trends`, `loadJson`, `renderFilters`, `selectFilter`, `syncUrlTag`, `isAdHocTrendKey`, `renderTrends`, `loadTrends`. No collisions or rename mid-plan.
- [x] Type alignment: `trends.json.trends[*] = {term: str, count: int}` used uniformly in Python (Tasks 4, 10) and JS (Tasks 13, 16).
- [x] Test count math: 11 (existing) + 1 (Task 14) + 7 (Tasks 3-9) = 19. Stated in Task 14 Step 4.
- [x] No unreferenced symbols.
