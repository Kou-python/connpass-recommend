# 設計仕様: 新着バッジ + 応募済み下移動

**作成日**: 2026-06-02  
**対象プロジェクト**: connpass-recommend

---

## Context

現状の人数順ソートでは新着イベントが埋もれやすく、応募済みイベントが一覧に混在してどれが未応募か探しづらい。

解決したい2つの課題:
1. **新着イベントを見逃しやすい** → 3日以内に events.json へ初登場したイベントに「NEW」バッジを表示
2. **応募済みが溜まって探しづらい** → 応募済みをマークすると一覧下段に移動

---

## アーキテクチャ概要

### 応募済み判定（アプローチC: ビルド時API + 手動オーバーライド）

```
GitHub Actions (毎日06:00 JST)
  ├── scripts/fetch.py  →  events.json（既存）
  └── scripts/fetch_applied.py  →  data/applied_ids.json（新規）
          connpass ユーザーAPIを叩いて参加済みイベントIDを取得

フロント (app.js)
  ├── applied_ids.json を読み込み
  └── localStorage の手動マークとORで応募済み判定
          applied_state = appliedIds.has(id) || localOverride.has(id)
```

### 新着判定（ビルド時にPythonで付与）

```
scripts/fetch.py（改修）
  ├── site/data/events.json を読み込み（前回分）
  ├── 既存イベントIDのセットを作成
  └── 今回新たに加わったイベントに "is_new": true を付与
        ただし started_at が今日から3日以内のもののみ
```

---

## 変更ファイル一覧

| ファイル | 変更種別 | 概要 |
|---|---|---|
| `scripts/fetch.py` | 改修 | `filter_events` に `known_ids` を渡し `is_new` フラグを付与 |
| `scripts/fetch_applied.py` | 新規 | connpass ユーザー参加イベントAPIで applied_ids を取得 |
| `site/data/applied_ids.json` | 新規(生成物) | `{"applied_ids": [394427, ...]}` |
| `site/app.js` | 改修 | 応募済み下移動 + 手動トグル + NEW バッジ |
| `site/style.css` | 改修 | `.badge-new`, `.event-card.applied` スタイル |
| `config.json` | 改修 | `connpass_username` フィールド追加 |
| `.github/workflows/update.yml` | 改修 | `CONNPASS_USERNAME` 環境変数と fetch_applied.py 実行ステップ追加 |

---

## 詳細設計

### 1. `scripts/fetch_applied.py`（新規）

connpass ユーザーAPIエンドポイント: `https://connpass.com/api/v2/users/{username}/events/`

```python
def fetch_applied_event_ids(username: str) -> list[int]:
    """ユーザーが参加申し込みしたイベントIDの一覧を返す。"""
    # ページネーション対応、全件取得
    # レート制限: 1秒スリープ
    # 戻り値: [event_id, ...]
```

出力: `site/data/applied_ids.json`
```json
{
  "updated_at": "2026-06-02T06:00:00+09:00",
  "applied_ids": [394427, 391234, ...]
}
```

`CONNPASS_USERNAME` が未設定の場合はスキップし、空の `applied_ids.json` を出力する（後方互換）。

### 2. `scripts/fetch.py` の改修

`filter_events()` に新着フラグを追加:

```python
NEW_BADGE_DAYS = 3  # config.json で上書き可能にしてもよい

def filter_events(events, config, known_ids: set[int] | None = None) -> list[dict]:
    # ... 既存ロジック ...
    # 新着判定:
    #   - known_ids に含まれない（前回 events.json に未登場）
    #   - かつ started_at が今日から NEW_BADGE_DAYS 日以内
    today = datetime.now(JST).date()
    started = datetime.fromisoformat(event.get("started_at", "")).date()
    is_new = (
        known_ids is not None
        and event_id not in known_ids
        and (started - today).days <= NEW_BADGE_DAYS
    )
    filtered.append({
        ...既存フィールド...,
        "is_new": is_new,
    })
```

`main()` で `known_ids` を渡す:
```python
# 既存の events.json があれば読み込んで known_ids を構築
existing = json.loads(output_path.read_text()) if output_path.exists() else {}
known_ids = {e["event_id"] for e in existing.get("events", [])}
filtered = filter_events(raw_events, config, known_ids=known_ids)
```

> **注意**: connpass APIのユーザー参加イベントエンドポイント（`/api/v2/users/{username}/events/`）の認証要否は実装前に要確認。APIキーが必要な場合は `CONNPASS_API_KEY` を `fetch_applied.py` でも使用する。

### 3. `site/app.js` の改修

**追加するモジュール変数:**
```js
let appliedFromApi = new Set();    // applied_ids.json から読み込み
let appliedOverride = new Set();   // localStorageによる手動追加
let removedOverride = new Set();   // APIがtrueでも手動で解除したもの
```

**ローカルストレージキー:**
- `connpass_applied_add`: JSON配列 (手動で追加したID)
- `connpass_applied_remove`: JSON配列 (APIをオーバーライドして解除したID)

**応募済み判定:**
```js
function isApplied(eventId) {
  if (removedOverride.has(eventId)) return false;
  return appliedFromApi.has(eventId) || appliedOverride.has(eventId);
}
```

**`renderEvents()` の改修:**
```js
// visibleを未応募と応募済みに分割
const pending = visible.filter(e => !isApplied(e.event_id));
const applied = visible.filter(e => isApplied(e.event_id));
// pending → applied の順でレンダリング
// appliedの先頭に区切り線「── 応募済み ──」を挿入
```

**`buildCard()` の改修:**
```js
// 1. NEWバッジ: event.is_new === true のとき <span class="badge-new">NEW</span> を title に追加
// 2. 応募済み: isApplied(event.event_id) のとき card.classList.add('applied')
// 3. 申込むボタン: クリック時に toggleApplied(event.event_id) を呼び出す
function toggleApplied(eventId) {
  if (isApplied(eventId)) {
    // 解除: removedOverrideに追加、appliedOverrideから削除
  } else {
    // 追加: appliedOverrideに追加、removedOverrideから削除
  }
  persistOverrides();
  renderEvents();  // 再描画（下段に移動）
}
```

**申込みボタンの動作変更:**
- クリック → connpassへ遷移（`window.open()`）+ `toggleApplied()` を呼ぶ
- 応募済みカードのボタンは「✓ 応募済み（取消）」と表示

### 4. `site/style.css` の追加スタイル

```css
/* 新着バッジ */
.badge-new {
  background: #ef4444;
  color: #fff;
  font-size: 0.65rem;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 4px;
  margin-left: 6px;
  vertical-align: middle;
}

/* 応募済みカード */
.event-card.applied {
  opacity: 0.55;
}
.event-card.applied .apply-button {
  background: #6b7280;  /* グレー */
}

/* 応募済みセクション区切り */
.applied-divider {
  grid-column: 1 / -1;
  text-align: center;
  color: var(--text-muted);
  font-size: 0.8rem;
  padding: 8px 0;
  border-top: 1px dashed var(--border);
}
```

### 5. `config.json` の追加フィールド

```json
{
  ...既存フィールド...,
  "connpass_username": ""
}
```

空文字列の場合は `fetch_applied.py` の実行をスキップ。

### 6. GitHub Actions ワークフロー改修

```yaml
- name: Fetch applied events
  env:
    CONNPASS_API_KEY: ${{ secrets.CONNPASS_API_KEY }}
    CONNPASS_USERNAME: ${{ vars.CONNPASS_USERNAME }}
  run: python -m scripts.fetch_applied

- name: Commit updated data
  run: |
    git add site/data/events.json site/data/trends.json site/data/applied_ids.json
    ...
```

`CONNPASS_USERNAME` は Secrets ではなく Variables（公開しても問題ない）として管理。

---

## データフロー

```
毎日06:00 JST
  │
  ├─ fetch_events() → raw API data
  ├─ filter_events(known_ids) → events.json (is_new フラグ付き)
  ├─ fetch_applied_event_ids() → applied_ids.json
  └─ extract_trends() → trends.json（変更なし）
  
ブラウザ初期化
  │
  ├─ events.json 読み込み
  ├─ applied_ids.json 読み込み → appliedFromApi
  ├─ localStorage 読み込み → appliedOverride / removedOverride
  └─ renderEvents() → 未応募先頭 / 応募済み末尾
```

---

## 検証方法

1. **新着バッジ**: `events.json` の任意のイベントに `"is_new": true` を手動で追加し、カードに「NEW」バッジが赤く表示されることを確認
2. **応募済み下移動**: 「申込む →」を押すとカードが一覧下段に移動し、区切り線「── 応募済み ──」の後に表示されることを確認
3. **手動解除**: 応募済みカードの「✓ 応募済み（取消）」を押すと上段に戻ることを確認
4. **localStorage 永続化**: リロード後も応募済み状態が維持されることを確認
5. **API自動取得**: `CONNPASS_USERNAME` をセットして GitHub Actions を手動実行し、`applied_ids.json` が生成されることを確認
6. **ユーザー名未設定時のフォールバック**: `connpass_username` が空でもサイトが正常表示されることを確認
