# connpass-recommend 機能改善 設計ドキュメント

- 日付: 2026-06-18
- 対象: `connpass-recommend`（本番稼働中 https://kou-python.github.io/connpass-recommend/ ）
- スコープ: NEWタグ条件変更 / カテゴリ絞り込み廃止 / ソート機能追加 / カーソルパーティクルエフェクト / 改善提案の記載

## 背景・目的

本番稼働中の静的サイト（GitHub Pages、バニラJS）に対し、ユーザー体験の改善を行う。
具体的には以下4点の実装と、追加の改善提案の整理。

1. NEWタグを「公開されてから1週間」相当に変更
2. カテゴリによる絞り込みを廃止し、トレンドのみにする
3. ソートに「新しい順」を追加する
4. カーソルを動かすと楽しいパーティクルエフェクトが走るようにする
5. 新機能追加・改善提案（本docに記載のみ、実装は別途）

## 前提となる調査結果

- **connpass API v2 のイベントオブジェクトには「公開日時/作成日時」フィールドが存在しない。** 日時系は `started_at`（開催開始）/ `ended_at`（開催終了）/ `updated_at`（更新日時）の3つのみ。
  そのため「公開されてから1週間」を厳密に取得することは不可能。本設計では**開催日ベースの近似**を採用する。
- カーソルエフェクトは、依存ゼロ・テーマ追従・軽量・サプライチェーンリスク無しを重視し、**自前canvas実装**を採用する（tsParticles/cursor-effects等の外部ライブラリは不採用）。

## 各機能の設計

### 1. NEWタグ：初登場かつ開催7日以内

**決定事項:** NEW条件 = 「events.json に初登場（`known_ids` に無い）」 **かつ** 「開催日が今日〜今日+7日以内」。

**変更箇所:** `scripts/fetch.py` の `filter_events`

現状:
```python
if 0 <= (started - today).days <= 3:
    is_new = True
```
変更後:
```python
if 0 <= (started - today).days <= 7:
    is_new = True
```

- `known_ids is not None and event_id not in known_ids` の初登場判定はそのまま維持する。
- フロント `app.js` 側の `is_new` バッジ表示ロジックは変更不要（`event.is_new === true` で表示）。
- 既存の `events.json` を `known_ids` ソースとして読み込む仕組みも変更不要。

**意味:** 「サイトに新しく載った（初登場）」かつ「もうすぐ開催される（7日以内）」イベントにNEWが付く。

### 2. カテゴリ絞り込み廃止、トレンドのみ

**変更箇所:** `site/app.js`、`site/index.html`（フィルタ領域のラベル等は動的生成のため主に app.js）

- `renderFilters(categories, trendTerms)`: 「カテゴリ」グループの生成を削除。残すのは「すべて」チップと「トレンド」チップのみ。
  - シグネチャは `renderFilters(trendTerms)` に簡素化する（`categories` 引数を削除）。
- `renderEvents()`: カテゴリによるフィルタ分岐（`(e.matched_categories || []).includes(activeCategory)`）を削除。
  - 残す分岐: `activeCategory === 'all'`（全件）/ トレンド語マッチ（`title`+`catch` への部分一致）。
- `isAdHocTrendKey()`: カテゴリ概念がUIから消えるため、判定を簡素化。`activeCategory` が 'all' 以外なら全てトレンド語扱いとする。
  - URLパラメータ `?tag=` で任意語が来た場合もトレンドチップとして扱う（既存の ad-hoc trend 挿入ロジックを流用）。
- `init()`: `categories` の算出（`matched_categories` からの集合生成）と `renderFilters` への受け渡しを削除。

**データ互換性:** `events.json` の `matched_categories` フィールドは**残す**（将来の復活・他用途のため）。バックエンド `fetch.py` の `matched_categories` 生成も変更しない。UIで参照しなくなるだけ。

### 3. ソートに「新しい順」を追加

**変更箇所:** `site/index.html`、`site/app.js`、`site/style.css`

- **UI:** フィルタ領域の近く（`<nav class="filters">` の前後）に `<select id="sort-select">` を新設。
  - 選択肢: 「人気順」（value=`popular`）/「新しい順」（value=`new`）
  - デフォルト: 人気順（`popular`）= 現状の `accepted` 降順を維持。
- **ロジック:** `app.js` にモジュール変数 `currentSort = 'popular'` を追加。
  - `popular`: `accepted` 降順（現状 `fetch.py` 側で既にソート済みだが、フロントでも明示的に適用して将来の堅牢性を確保）。
  - `new`: `started_at` 昇順（開催日が近い順 = もうすぐ開催されるものが上）。
  - `renderEvents()` 内で `visible` をソートしてから pending/applied 分割を行う。応募済みを下段に分ける既存ロジックは維持（ソートは pending・applied それぞれの内部順序に適用）。
  - select の `change` イベントで `currentSort` を更新し `renderEvents()` を再実行。
- **スタイル:** `#sort-select` を既存の `.filter-chip` / フォーム要素のトーンに合わせる（`var(--surface)` 背景、`var(--border)` ボーダー、`var(--text)` 文字色）。

### 4. カーソル追従パーティクルエフェクト（自前canvas実装）

**新規ファイル:** `site/cursor-fx.js`（依存ゼロ、目安 ~120行）

**変更箇所:** `site/index.html`、`site/trends.html`（canvas要素とscript読み込み追加）、`site/style.css`（canvas配置）

**仕様:**
- 全画面固定の `<canvas>`（`position: fixed; inset: 0; pointer-events: none; z-index`は最前面だが操作を妨げない）。
- `mousemove` でカーソル位置に粒子を生成。粒子はカーソルに群がる/軌跡を引くように、初速・減衰・寿命（フェードアウト）を持つ。
- `requestAnimationFrame` ループで描画。粒子は寿命が尽きたら配列から除去。
- **テーマ追従:** 粒子色は `getComputedStyle(document.documentElement).getPropertyValue('--accent')` を読む。テーマ切替時（`data-theme` 変更）に色を再取得する（`MutationObserver` で `data-theme` 属性を監視、もしくは描画フレームごとに軽量に読む）。
- **アクセシビリティ / パフォーマンス:**
  - `window.matchMedia('(prefers-reduced-motion: reduce)').matches` が true の場合はエフェクトを起動しない。
  - タッチ主体デバイス（`window.matchMedia('(pointer: coarse)').matches`）では起動しない（mousemove が無い/重いため）。
  - 粒子数に上限を設け（例: 同時 ~150個）、配列肥大を防ぐ。
  - `canvas` は `devicePixelRatio` を考慮してリサイズ。`resize` イベントで再設定。
- **読み込み:** `index.html` と `trends.html` の両方に `<script src="cursor-fx.js" defer></script>` と `<canvas id="cursor-fx" aria-hidden="true"></canvas>` を追加。

**設計の単位としての独立性:** `cursor-fx.js` は他のアプリロジック（app.js / trends.js）に一切依存せず、DOMに `#cursor-fx` canvas があれば自己完結で動作する。逆にアプリ側も cursor-fx を参照しない。完全に疎結合。

### 5. 改善提案（本docに記載のみ・今回は未実装）

以下は今回のスコープ外。採用可否は別セッションで検討する。

1. **検索ボックス:** タイトル/キャッチのキーワード全文検索。トレンドチップと併用できると探索性が上がる。
2. **開催形式フィルタ（オンライン/オフライン）:** `place` が「オンライン」かどうかでトグル。
3. **お気に入り/ブックマーク:** localStorage で気になるイベントを保存（応募とは別軸）。
4. **NEWバッジの粒度向上:** 「初登場」を first_seen として記録すれば、「サイトに追加されてからN日」という本来の意味の新着が出せる（API公開日が無い制約への根本対応）。
5. **トレンドチップの複数選択（AND/OR）:** 現状は単一選択。複数語での絞り込み。
6. **ソート種別の追加:** 「定員に対する充足率」「残席が少ない順（締切間近）」など。
7. **PWA化 / オフライン対応:** Service Worker で events.json をキャッシュ。
8. **OGP / メタタグ整備:** SNS共有時のカード表示改善。

## エラーハンドリング方針

- `cursor-fx.js`: canvas/2Dコンテキスト取得失敗時は静かに何もしない（エフェクトは付加価値のため、失敗してもアプリ本体に影響させない）。ただし `console.warn` で理由を残す（サイレント失敗を避ける）。
- `app.js` のソート: `started_at` がパース不能な場合は末尾に寄せる（`NaN` 比較対策）。

## テスト観点

- `tests/`（pytest）: `filter_events` の `is_new` 判定が開催0〜7日でtrue、8日以上でfalse、初登場でない場合はfalse、になることを確認。既存テストがあれば閾値変更に追従。
- フロント: 手動確認（ローカルで `site/` を簡易サーバ起動）。
  - カテゴリチップが消えトレンドのみ表示される。
  - ソート切替で並び順が変わる（人気順 / 新しい順）。応募済みが下段に残る。
  - カーソル移動で粒子が出る。テーマ切替で色が変わる。reduced-motion 環境で出ない。
  - NEWバッジが該当イベントに付く。

## ロールバック

- いずれも独立した変更。問題があれば該当コミット単位で revert 可能。`cursor-fx.js` は script タグ削除だけで完全に無効化できる。
