# connpass-recommend 機能改善 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** NEWタグ条件変更・カテゴリ廃止・ソート追加・カーソルパーティクルエフェクトの4機能を connpass-recommend サイトに実装する。

**Architecture:** バックエンド（Python fetch スクリプト）と フロントエンド（バニラJS静的サイト）を独立して変更する。フロント変更はすべて `site/` 以下に閉じており、GitHub Pages にデプロイ済みの本番サイトに直結する。`cursor-fx.js` は他のモジュールと完全に疎結合で、canvasが存在すれば自己完結で動作する。

**Tech Stack:** Python 3.x (pytest)、バニラJS、CSS カスタムプロパティ、Canvas 2D API、requestAnimationFrame、MutationObserver

## Global Constraints

- `scripts/fetch.py` の `filter_events` は純粋関数として保つ（副作用なし）
- `site/` 以下のファイルは外部ライブラリへの CDN 依存を新規追加しない
- `matched_categories` フィールドは `events.json` のデータとして残す（UIでは使わない）
- `cursor-fx.js` は `prefers-reduced-motion: reduce` または `pointer: coarse` 環境では起動しない
- 粒子色は CSS 変数 `--accent` を `getComputedStyle` で読み、ダーク/ライト両テーマに追従する

---

## ファイル対応表

| ファイル | 変更種別 | 担当タスク |
|---|---|---|
| `tests/test_filter.py` | 変更 | Task 1 |
| `scripts/fetch.py` | 変更 | Task 1 |
| `site/app.js` | 変更 | Task 2, Task 3 |
| `site/index.html` | 変更 | Task 3, Task 4 |
| `site/style.css` | 変更 | Task 3, Task 4 |
| `site/cursor-fx.js` | 新規作成 | Task 4 |
| `site/trends.html` | 変更 | Task 4 |

---

## Task 1: NEWタグ閾値を3日→7日に変更

**Files:**
- Modify: `tests/test_filter.py:156-171`
- Modify: `scripts/fetch.py:101`

**Interfaces:**
- Produces: `filter_events(events, config, known_ids)` が `started_at` の今日から7日以内（`0 <= days <= 7`）かつ `known_ids` に無い場合に `is_new=True` を返す

- [ ] **Step 1: 既存テストを確認して失敗するテストを追加する**

`tests/test_filter.py` の末尾のブロック（`# --- is_new フラグのテスト ---` 以降）を以下の状態に書き換える。

既存の `test_is_new_false_for_new_event_4_days_ahead` は「4日後がFalse」を検証しているが、変更後は4日後はTrue（7日以内）になる。このテストを削除し、代わりに「7日後がTrue」「8日後がFalse」を追加する。

```python
# --- is_new フラグのテスト ---

def test_is_new_false_when_known_ids_is_none():
    """known_ids=None の場合は is_new=False。"""
    events = [make_event(event_id=1, title="AI Conference", accepted=200)]
    result = filter_events(events, CONFIG, known_ids=None)
    assert result[0]["is_new"] is False


def test_is_new_false_for_existing_event():
    """known_ids にある既知イベントは is_new=False。"""
    today = datetime.now(JST).date()
    started_at = (today + timedelta(days=1)).isoformat() + "T19:00:00+09:00"
    events = [make_event(event_id=1, title="AI Conference", accepted=200, started_at=started_at)]
    result = filter_events(events, CONFIG, known_ids={1})
    assert result[0]["is_new"] is False


def test_is_new_true_for_new_event_within_3_days():
    """known_ids にない新規イベントで started_at が今日から3日以内 → is_new=True。"""
    today = datetime.now(JST).date()
    started_at = (today + timedelta(days=2)).isoformat() + "T19:00:00+09:00"
    events = [make_event(event_id=99, title="AI Conference", accepted=200, started_at=started_at)]
    result = filter_events(events, CONFIG, known_ids=set())
    assert result[0]["is_new"] is True


def test_is_new_true_for_new_event_on_today():
    """known_ids にない新規イベントで started_at が当日 → is_new=True。"""
    today = datetime.now(JST).date()
    started_at = today.isoformat() + "T19:00:00+09:00"
    events = [make_event(event_id=99, title="AI Conference", accepted=200, started_at=started_at)]
    result = filter_events(events, CONFIG, known_ids=set())
    assert result[0]["is_new"] is True


def test_is_new_true_for_new_event_4_days_ahead():
    """known_ids にない新規イベントで started_at が4日後 → is_new=True（7日以内）。"""
    today = datetime.now(JST).date()
    started_at = (today + timedelta(days=4)).isoformat() + "T19:00:00+09:00"
    events = [make_event(event_id=99, title="AI Conference", accepted=200, started_at=started_at)]
    result = filter_events(events, CONFIG, known_ids=set())
    assert result[0]["is_new"] is True


def test_is_new_true_for_new_event_exactly_7_days_ahead():
    """known_ids にない新規イベントで started_at がちょうど7日後 → is_new=True。"""
    today = datetime.now(JST).date()
    started_at = (today + timedelta(days=7)).isoformat() + "T19:00:00+09:00"
    events = [make_event(event_id=99, title="AI Conference", accepted=200, started_at=started_at)]
    result = filter_events(events, CONFIG, known_ids=set())
    assert result[0]["is_new"] is True


def test_is_new_false_for_new_event_8_days_ahead():
    """known_ids にない新規イベントで started_at が8日以上先 → is_new=False。"""
    today = datetime.now(JST).date()
    started_at = (today + timedelta(days=8)).isoformat() + "T19:00:00+09:00"
    events = [make_event(event_id=99, title="AI Conference", accepted=200, started_at=started_at)]
    result = filter_events(events, CONFIG, known_ids=set())
    assert result[0]["is_new"] is False


def test_is_new_false_on_parse_error():
    """started_at パースエラー（空文字列）でも例外を出さず is_new=False。"""
    events = [make_event(event_id=99, title="AI Conference", accepted=200, started_at="")]
    result = filter_events(events, CONFIG, known_ids=set())
    assert result[0]["is_new"] is False


def test_is_new_false_for_past_event():
    """known_ids にない新規イベントでも started_at が過去なら is_new=False。"""
    today = datetime.now(JST).date()
    started_at = (today - timedelta(days=1)).isoformat() + "T19:00:00+09:00"
    events = [make_event(event_id=99, title="AI Conference", accepted=200, started_at=started_at)]
    result = filter_events(events, CONFIG, known_ids=set())
    assert result[0]["is_new"] is False
```

- [ ] **Step 2: 新規テストが失敗することを確認する**

```bash
cd /Users/koseisasagawa/Desktop/Claude/connpass-recommend
python -m pytest tests/test_filter.py -v -k "is_new"
```

期待結果: `test_is_new_true_for_new_event_4_days_ahead` と `test_is_new_true_for_new_event_exactly_7_days_ahead` が **FAIL**（fetch.py がまだ `<= 3` のため）。他のテストはすべて PASS。

- [ ] **Step 3: fetch.py の閾値を変更する**

`scripts/fetch.py:101` の

```python
                if 0 <= (started - today).days <= 3:
```

を

```python
                if 0 <= (started - today).days <= 7:
```

に変更する。

- [ ] **Step 4: テストがすべてパスすることを確認する**

```bash
python -m pytest tests/test_filter.py -v -k "is_new"
```

期待結果: `is_new` 関連の全テストが **PASS**。

- [ ] **Step 5: テスト全件を通す**

```bash
python -m pytest tests/ -v
```

期待結果: すべて **PASS**。

- [ ] **Step 6: コミット**

```bash
git add tests/test_filter.py scripts/fetch.py
git commit -m "feat: NEWタグ条件を開催7日以内に拡大

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: カテゴリ絞り込み廃止、トレンドのみに簡素化

**Files:**
- Modify: `site/app.js`

**Interfaces:**
- Consumes: なし（Task 1 との依存なし）
- Produces: `renderFilters(trendTerms: string[]): void`（シグネチャ変更）。`isAdHocTrendKey` は削除。`renderEvents()` はカテゴリ分岐を持たず `activeCategory === 'all'` かトレンド語マッチの2系統のみ。

- [ ] **Step 1: app.js を以下の diff に従って変更する**

**1a. `CATEGORY_COLOR` オブジェクト（先頭の定数定義）を削除する**

削除対象:
```javascript
const CATEGORY_COLOR = {
  AI: '#8b5cf6',
  'フロント': '#0ea5e9',
  PdM: '#f59e0b',
};
```

**1b. `renderFilters` を書き換える**

変更前（lines 96-126）:
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
```

変更後:
```javascript
function renderFilters(trendTerms) {
  const container = document.getElementById('filters');
  container.innerHTML = '';

  const allBtn = document.createElement('button');
  allBtn.className = 'filter-chip' + (activeCategory === 'all' ? ' active' : '');
  allBtn.textContent = 'すべて';
  allBtn.dataset.category = 'all';
  allBtn.addEventListener('click', () => selectFilter('all'));
  container.appendChild(allBtn);

  for (const term of trendTerms) {
    const button = document.createElement('button');
    button.className = 'filter-chip trend' + (term === activeCategory ? ' active' : '');
    button.textContent = `#${term}`;
    button.dataset.category = term;
    button.addEventListener('click', () => selectFilter(term));
    container.appendChild(button);
  }
}
```

**1c. `renderEvents` のカテゴリ分岐を削除する**

変更前（lines 147-165）:
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
```

変更後:
```javascript
function renderEvents() {
  const grid = document.getElementById('event-grid');

  let visible;
  if (activeCategory === 'all') {
    visible = allEvents;
  } else {
    const needle = activeCategory.toLowerCase();
    visible = allEvents.filter((e) => {
      const hay = ((e.title || '') + ' ' + (e.catch || '')).toLowerCase();
      return hay.includes(needle);
    });
  }
```

**1d. `isAdHocTrendKey` 関数を削除する**（lines 191-197 の関数ブロック全体）

```javascript
function isAdHocTrendKey(key) {
  if (key === 'all') return false;
  const knownCategories = Array.from(
    new Set(allEvents.flatMap((e) => e.matched_categories || []))
  );
  return !knownCategories.includes(key);
}
```

**1e. `init` 内のカテゴリ算出と `renderFilters` 呼び出しを変更する**

変更前（init 内の該当箇所）:
```javascript
  const categories = Array.from(
    new Set(allEvents.flatMap((e) => e.matched_categories || []))
  );

  const trends = (trendData && trendData.trends) || [];
  trendChipTerms = trends.slice(0, topNChips).map((t) => t.term);

  const params = new URLSearchParams(window.location.search);
  const tag = params.get('tag');
  if (tag) {
    activeCategory = tag;
    if (!categories.includes(tag) && !trendChipTerms.includes(tag)) {
      trendChipTerms = [tag, ...trendChipTerms];
    }
  }

  renderFilters(categories, trendChipTerms);
```

変更後:
```javascript
  const trends = (trendData && trendData.trends) || [];
  trendChipTerms = trends.slice(0, topNChips).map((t) => t.term);

  const params = new URLSearchParams(window.location.search);
  const tag = params.get('tag');
  if (tag) {
    activeCategory = tag;
    if (!trendChipTerms.includes(tag)) {
      trendChipTerms = [tag, ...trendChipTerms];
    }
  }

  renderFilters(trendChipTerms);
```

- [ ] **Step 2: ブラウザで手動確認する**

`site/` をローカルサーバで起動して確認（例: `python3 -m http.server 8080 --directory site`）。

確認項目:
- カテゴリチップ（AI / フロント / PdM）が消えている
- 「すべて」チップとトレンドチップのみ表示される
- トレンドチップをクリックするとキーワードで絞り込める
- 「すべて」クリックで全件表示に戻る
- ページ読み込み時にコンソールエラーがない

- [ ] **Step 3: コミット**

```bash
git add site/app.js
git commit -m "feat: カテゴリ絞り込みを廃止しトレンドのみに簡素化

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: ソートに「新しい順」を追加

**Files:**
- Modify: `site/index.html`
- Modify: `site/app.js`（Task 2 の変更が適用済みの状態を前提とする）
- Modify: `site/style.css`

**Interfaces:**
- Consumes: Task 2 後の `renderEvents()` / `renderFilters(trendTerms)` の状態
- Produces: モジュール変数 `currentSort: 'popular' | 'new'`、`sortEvents(events: object[]): object[]`

- [ ] **Step 1: index.html にソート選択 UI を追加する**

`<nav class="filters" ...>` ブロックの直後（`<main>` の前）に以下を追加する:

```html
  <div class="sort-bar">
    <label for="sort-select" class="sort-label">並び順:</label>
    <select id="sort-select" class="sort-select">
      <option value="popular">人気順</option>
      <option value="new">新しい順</option>
    </select>
  </div>
```

また `<nav class="filters" ... aria-label="カテゴリフィルタ">` の `aria-label` を `"トレンドフィルタ"` に変更する。

- [ ] **Step 2: style.css にソートバーのスタイルを追加する**

`style.css` の末尾（既存コードの後）に以下を追加する:

```css
/* ソートバー */
.sort-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 32px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

.sort-label {
  font-size: 13px;
  color: var(--text-muted);
}

.sort-select {
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  outline: none;
  transition: border-color 0.15s;
}

.sort-select:focus,
.sort-select:hover {
  border-color: var(--accent);
}

@media (max-width: 600px) {
  .sort-bar {
    padding-left: 16px;
    padding-right: 16px;
  }
}
```

- [ ] **Step 3: app.js にソートロジックを追加する**

**3a. モジュール変数 `currentSort` を追加する**

`let trendChipTerms = [];` の直後に追加:

```javascript
let currentSort = 'popular';
```

**3b. `sortEvents` 関数を追加する**

`renderEvents` 関数の直前に追加:

```javascript
function sortEvents(events) {
  const copy = events.slice();
  if (currentSort === 'new') {
    copy.sort((a, b) => {
      const da = a.started_at ? new Date(a.started_at).getTime() : Infinity;
      const db = b.started_at ? new Date(b.started_at).getTime() : Infinity;
      return da - db;
    });
  } else {
    copy.sort((a, b) => b.accepted - a.accepted);
  }
  return copy;
}
```

**3c. `renderEvents` の `visible` 決定直後にソートを適用する**

`renderEvents` 内の `if (visible.length === 0)` の前に以下を追加し、以降は `visible` の代わりに `sorted` を使う:

変更前:
```javascript
  if (visible.length === 0) {
    grid.innerHTML = '<p class="status">条件に合うイベントがありません。</p>';
    return;
  }

  const pending = visible.filter(e => !isApplied(e.event_id));
  const applied = visible.filter(e => isApplied(e.event_id));
```

変更後:
```javascript
  const sorted = sortEvents(visible);

  if (sorted.length === 0) {
    grid.innerHTML = '<p class="status">条件に合うイベントがありません。</p>';
    return;
  }

  const pending = sorted.filter(e => !isApplied(e.event_id));
  const applied = sorted.filter(e => isApplied(e.event_id));
```

**3d. `init` 内にソートセレクトのイベントリスナーを追加する**

`init` 内の `renderFilters(trendChipTerms);` の直前に追加:

```javascript
  const sortSelect = document.getElementById('sort-select');
  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      currentSort = sortSelect.value;
      renderEvents();
    });
  }
```

- [ ] **Step 4: ブラウザで手動確認する**

`python3 -m http.server 8080 --directory site`

確認項目:
- 「並び順:」ラベルと「人気順 / 新しい順」セレクトが表示されている
- デフォルト（人気順）で accepted 降順に並んでいる
- 「新しい順」を選択すると `started_at` 昇順（最も近い開催日が先頭）に変わる
- 応募済みイベントは、人気順・新しい順ともに下段に分かれている
- トレンドフィルタと組み合わせてソートが機能する
- ダーク/ライトテーマでセレクトの色が適切に切り替わる

- [ ] **Step 5: コミット**

```bash
git add site/index.html site/app.js site/style.css
git commit -m "feat: ソートに新しい順（開催日が近い順）を追加

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: カーソル追従パーティクルエフェクト

**Files:**
- Create: `site/cursor-fx.js`
- Modify: `site/index.html`
- Modify: `site/trends.html`
- Modify: `site/style.css`

**Interfaces:**
- Consumes: `#cursor-fx` canvas 要素、CSS 変数 `--accent`、`document.documentElement` の `data-theme` 属性
- Produces: canvas に描画されるパーティクルアニメーション。他のモジュールへの依存・公開 API は一切なし。

- [ ] **Step 1: cursor-fx.js を新規作成する**

`site/cursor-fx.js` を以下の内容で作成する:

```javascript
'use strict';

(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (window.matchMedia('(pointer: coarse)').matches) return;

  const canvas = document.getElementById('cursor-fx');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.warn('cursor-fx: 2D context unavailable');
    return;
  }

  const MAX_PARTICLES = 150;
  const particles = [];
  let W = 0, H = 0, dpr = 1;
  let accentColor = '#58a6ff';

  function readAccentColor() {
    accentColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--accent').trim() || '#58a6ff';
  }

  function resize() {
    dpr = window.devicePixelRatio || 1;
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  window.addEventListener('resize', resize);
  resize();
  readAccentColor();

  new MutationObserver(readAccentColor).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });

  function Particle(x, y) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.5 + Math.random() * 2;
    this.x = x;
    this.y = y;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.life = 1.0;
    this.decay = 0.02 + Math.random() * 0.03;
    this.size = 2 + Math.random() * 3;
  }

  Particle.prototype.update = function () {
    this.x += this.vx;
    this.y += this.vy;
    this.vx *= 0.95;
    this.vy *= 0.95;
    this.life -= this.decay;
  };

  Particle.prototype.draw = function () {
    ctx.globalAlpha = Math.max(0, this.life);
    ctx.fillStyle = accentColor;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size * this.life, 0, Math.PI * 2);
    ctx.fill();
  };

  window.addEventListener('mousemove', function (e) {
    if (particles.length >= MAX_PARTICLES) return;
    const count = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) {
      particles.push(new Particle(e.clientX, e.clientY));
    }
  });

  function loop() {
    ctx.clearRect(0, 0, W, H);
    for (let i = particles.length - 1; i >= 0; i--) {
      particles[i].update();
      particles[i].draw();
      if (particles[i].life <= 0) {
        particles.splice(i, 1);
      }
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(loop);
  }

  loop();
})();
```

- [ ] **Step 2: style.css に canvas スタイルを追加する**

`style.css` の末尾に追加:

```css
/* カーソルパーティクルエフェクト */
#cursor-fx {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9999;
}
```

- [ ] **Step 3: index.html に canvas と script を追加する**

`</body>` の直前（`<script src="app.js" defer></script>` の後）に追加:

```html
  <canvas id="cursor-fx" aria-hidden="true"></canvas>
  <script src="cursor-fx.js" defer></script>
```

- [ ] **Step 4: trends.html に canvas と script を追加する**

`</body>` の直前（`<script src="trends.js" defer></script>` の後）に追加:

```html
  <canvas id="cursor-fx" aria-hidden="true"></canvas>
  <script src="cursor-fx.js" defer></script>
```

- [ ] **Step 5: ブラウザで手動確認する**

`python3 -m http.server 8080 --directory site`

確認項目:
- マウスを動かすと `--accent` 色の粒子が出てカーソルに追従する（軌跡が残ってフェードアウトする）
- テーマを切り替えると粒子色がダーク（`#58a6ff`）↔ ライト（`#0969da`）で変わる
- イベントリンク・ボタン等のクリック操作が妨げられない（`pointer-events: none` が効いている）
- `trends.html` でも同様にパーティクルが出る
- コンソールエラーがない
- （検証困難な場合は注記）`prefers-reduced-motion` 環境でのエフェクト非表示

- [ ] **Step 6: コミット**

```bash
git add site/cursor-fx.js site/index.html site/trends.html site/style.css
git commit -m "feat: カーソル追従パーティクルエフェクトを追加（自前canvas実装）

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## 完了後の確認

全4タスク完了後、以下をまとめて確認する:

```bash
# Python テスト全件
python -m pytest tests/ -v

# git log で4コミットが積まれていることを確認
git log --oneline -6
```

期待する git log:
```
<hash> feat: カーソル追従パーティクルエフェクトを追加（自前canvas実装）
<hash> feat: ソートに新しい順（開催日が近い順）を追加
<hash> feat: カテゴリ絞り込みを廃止しトレンドのみに簡素化
<hash> feat: NEWタグ条件を開催7日以内に拡大
```
