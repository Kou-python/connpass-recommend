# Settings UI & Manual Dispatch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** サイト上で connpass username と GitHub PAT を入力・保存し、「今すぐ更新」ボタンで GitHub Actions workflow_dispatch を手動トリガーできるようにする。

**Architecture:** ブラウザ側に⚙️ボタン付き設定モーダルを追加する。入力値（username・PAT・owner/repo）は localStorage に保存。「今すぐ更新」ボタンは GitHub API (`POST /repos/{owner}/{repo}/actions/workflows/update.yml/dispatches`) を叩いて workflow を起動し、inputs として `connpass_username` を渡す。workflow 側は `workflow_dispatch.inputs.connpass_username` が指定されていればそれを優先し、なければ `vars.CONNPASS_USERNAME` を使う。

**Tech Stack:** Vanilla JS（既存の app.js スタイルに従う）、GitHub REST API v3、localStorage、CSS カスタムプロパティ（既存テーマ変数を使用）

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `.github/workflows/update.yml` | Modify | `workflow_dispatch.inputs.connpass_username` 追加、fetch_applied ステップで input を優先 |
| `site/index.html` | Modify | ⚙️ボタン + 設定モーダル HTML を追加 |
| `site/settings.js` | Create | 設定の読み書き・モーダル制御・GitHub API 呼び出し |
| `site/style.css` | Modify | モーダル・設定フォームのスタイルを追加 |

---

### Task 1: update.yml に workflow_dispatch input を追加

**Files:**
- Modify: `.github/workflows/update.yml`

`workflow_dispatch` に `connpass_username` 入力項目を追加し、`Fetch applied events` ステップが input → vars の優先順で使うようにする。

- [ ] **Step 1: update.yml を編集**

`.github/workflows/update.yml` の `workflow_dispatch:` を以下に変更する（現在は引数なしの `workflow_dispatch:` のみ）:

```yaml
on:
  schedule:
    - cron: '0 21 * * *'  # 06:00 JST
  workflow_dispatch:
    inputs:
      connpass_username:
        description: 'connpass username for applied events'
        required: false
        default: ''
```

`Fetch applied events` ステップの env を変更:

```yaml
      - name: Fetch applied events
        env:
          CONNPASS_USERNAME: ${{ inputs.connpass_username || vars.CONNPASS_USERNAME }}
        run: python -m scripts.fetch_applied
```

- [ ] **Step 2: コミット**

```bash
git add .github/workflows/update.yml
git commit -m "feat: add connpass_username input to workflow_dispatch"
```

---

### Task 2: 設定モーダルの HTML を index.html に追加

**Files:**
- Modify: `site/index.html`

⚙️ボタンをナビゲーションバーに追加し、設定モーダルを body 末尾に追加する。

- [ ] **Step 1: index.html を編集**

`<button id="theme-toggle" ...>` の直後に⚙️ボタンを追加:

```html
        <button id="settings-toggle" class="theme-toggle" aria-label="設定">⚙</button>
```

`<script src="app.js" defer></script>` の直前にモーダル HTML を追加:

```html
  <!-- 設定モーダル -->
  <div id="settings-modal" class="modal-overlay" hidden>
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-header">
        <h2 id="modal-title">設定</h2>
        <button id="settings-close" class="modal-close" aria-label="閉じる">✕</button>
      </div>
      <div class="modal-body">
        <label class="setting-label" for="setting-username">
          connpass ユーザー名
          <span class="setting-hint">参加済みイベントを下段に移動するために使用します</span>
        </label>
        <input id="setting-username" type="text" class="setting-input"
               placeholder="例: kariiho" autocomplete="off" />

        <label class="setting-label" for="setting-repo">
          GitHub リポジトリ (owner/repo)
          <span class="setting-hint">「今すぐ更新」ボタンで使用します</span>
        </label>
        <input id="setting-repo" type="text" class="setting-input"
               placeholder="例: kou-python/connpass-recommend" autocomplete="off" />

        <label class="setting-label" for="setting-pat">
          GitHub Personal Access Token
          <span class="setting-hint">workflow スコープが必要です。localStorage に保存されます</span>
        </label>
        <input id="setting-pat" type="password" class="setting-input"
               placeholder="github_pat_..." autocomplete="off" />
      </div>
      <div class="modal-footer">
        <button id="settings-save" class="btn-primary">保存</button>
        <button id="settings-dispatch" class="btn-secondary">今すぐ更新</button>
      </div>
      <p id="settings-status" class="settings-status" hidden></p>
    </div>
  </div>

  <script src="settings.js" defer></script>
```

- [ ] **Step 2: コミット**

```bash
git add site/index.html
git commit -m "feat: add settings modal HTML to index.html"
```

---

### Task 3: settings.js を新規作成

**Files:**
- Create: `site/settings.js`

設定の localStorage 保存・読み込み、モーダル開閉、「保存」「今すぐ更新」の動作を実装する。

localStorage キー:
- `connpass_settings_username` — connpass ユーザー名
- `connpass_settings_repo` — GitHub owner/repo
- `connpass_settings_pat` — GitHub PAT

「今すぐ更新」は `POST https://api.github.com/repos/{owner}/{repo}/actions/workflows/update.yml/dispatches` を呼び出し、body に `{"ref":"main","inputs":{"connpass_username":"{username}"}}` を渡す。

- [ ] **Step 1: `site/settings.js` を作成**

```js
'use strict';

const LS_USERNAME = 'connpass_settings_username';
const LS_REPO    = 'connpass_settings_repo';
const LS_PAT     = 'connpass_settings_pat';

function loadSettings() {
  return {
    username: localStorage.getItem(LS_USERNAME) || '',
    repo:     localStorage.getItem(LS_REPO)     || '',
    pat:      localStorage.getItem(LS_PAT)       || '',
  };
}

function saveSettings(username, repo, pat) {
  localStorage.setItem(LS_USERNAME, username);
  localStorage.setItem(LS_REPO, repo);
  if (pat) localStorage.setItem(LS_PAT, pat);
}

function showStatus(message, isError = false) {
  const el = document.getElementById('settings-status');
  el.textContent = message;
  el.className = 'settings-status' + (isError ? ' error' : ' success');
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, 4000);
}

async function triggerDispatch(repo, pat, username) {
  const [owner, repoName] = repo.split('/');
  if (!owner || !repoName) {
    showStatus('リポジトリ名の形式が正しくありません（例: owner/repo）', true);
    return;
  }
  if (!pat) {
    showStatus('GitHub PAT が設定されていません', true);
    return;
  }

  const btn = document.getElementById('settings-dispatch');
  btn.disabled = true;
  btn.textContent = '送信中...';

  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repoName}/actions/workflows/update.yml/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${pat}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ref: 'main',
          inputs: { connpass_username: username },
        }),
      }
    );

    if (res.status === 204) {
      showStatus('✓ ワークフローを起動しました。数分後にページを再読み込みしてください。');
    } else if (res.status === 401) {
      showStatus('PAT が無効か期限切れです（401）', true);
    } else if (res.status === 404) {
      showStatus('リポジトリまたはワークフローが見つかりません（404）', true);
    } else if (res.status === 422) {
      showStatus('入力値が正しくありません（422）', true);
    } else {
      showStatus(`エラー: HTTP ${res.status}`, true);
    }
  } catch (e) {
    showStatus(`ネットワークエラー: ${e.message}`, true);
  } finally {
    btn.disabled = false;
    btn.textContent = '今すぐ更新';
  }
}

function initSettings() {
  const modal   = document.getElementById('settings-modal');
  const toggle  = document.getElementById('settings-toggle');
  const close   = document.getElementById('settings-close');
  const saveBtn = document.getElementById('settings-save');
  const dispBtn = document.getElementById('settings-dispatch');
  const inputUsername = document.getElementById('setting-username');
  const inputRepo     = document.getElementById('setting-repo');
  const inputPat      = document.getElementById('setting-pat');

  function openModal() {
    const s = loadSettings();
    inputUsername.value = s.username;
    inputRepo.value     = s.repo;
    inputPat.value      = s.pat;
    modal.hidden = false;
    inputUsername.focus();
  }

  function closeModal() {
    modal.hidden = true;
  }

  toggle.addEventListener('click', openModal);
  close.addEventListener('click', closeModal);

  // オーバーレイ（モーダル外）クリックで閉じる
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  // Escape キーで閉じる
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) closeModal();
  });

  saveBtn.addEventListener('click', () => {
    saveSettings(
      inputUsername.value.trim(),
      inputRepo.value.trim(),
      inputPat.value.trim()
    );
    showStatus('✓ 保存しました');
  });

  dispBtn.addEventListener('click', () => {
    // 現在の入力値で保存してからdispatch
    const username = inputUsername.value.trim();
    const repo     = inputRepo.value.trim();
    const pat      = inputPat.value.trim();
    saveSettings(username, repo, pat);
    triggerDispatch(repo, pat, username);
  });
}

// DOM 準備後に初期化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSettings);
} else {
  initSettings();
}
```

- [ ] **Step 2: コミット**

```bash
git add site/settings.js
git commit -m "feat: add settings.js for modal, localStorage, and workflow dispatch"
```

---

### Task 4: style.css にモーダルスタイルを追加

**Files:**
- Modify: `site/style.css`

既存のCSSカスタムプロパティ（`--bg`, `--surface`, `--border`, `--text`, `--accent` 等）を使ってモーダルをスタイリングする。

- [ ] **Step 1: style.css の末尾に追加**

```css
/* 設定モーダル */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  width: min(480px, calc(100vw - 32px));
  max-height: calc(100vh - 64px);
  overflow-y: auto;
  padding: 0;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.modal-header h2 {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
  color: var(--text);
}

.modal-close {
  background: none;
  border: none;
  font-size: 1rem;
  cursor: pointer;
  color: var(--text-muted);
  padding: 4px 8px;
  border-radius: 4px;
  line-height: 1;
}

.modal-close:hover {
  color: var(--text);
  background: var(--border);
}

.modal-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.setting-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text);
}

.setting-hint {
  font-weight: 400;
  font-size: 0.75rem;
  color: var(--text-muted);
}

.setting-input {
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text);
  font-size: 0.9rem;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;
}

.setting-input:focus {
  border-color: var(--accent);
}

.modal-footer {
  display: flex;
  gap: 8px;
  padding: 16px 20px;
  border-top: 1px solid var(--border);
}

.btn-primary {
  padding: 9px 18px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 0.9rem;
  font-family: inherit;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

.btn-primary:hover {
  background: var(--accent-hover);
}

.btn-secondary {
  padding: 9px 18px;
  background: transparent;
  color: var(--accent);
  border: 1px solid var(--accent);
  border-radius: 6px;
  font-size: 0.9rem;
  font-family: inherit;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.btn-secondary:hover {
  background: var(--accent);
  color: #fff;
}

.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.settings-status {
  margin: 0 20px 16px;
  font-size: 0.8rem;
  padding: 6px 10px;
  border-radius: 4px;
}

.settings-status.success {
  background: #dcfce7;
  color: #166534;
}

.settings-status.error {
  background: #fee2e2;
  color: #991b1b;
}

[data-theme="dark"] .settings-status.success {
  background: #14532d;
  color: #86efac;
}

[data-theme="dark"] .settings-status.error {
  background: #450a0a;
  color: #fca5a5;
}
```

- [ ] **Step 2: コミット**

```bash
git add site/style.css
git commit -m "feat: add modal styles for settings UI"
```

---

## 検証手順

1. **ローカル確認**:
   ```bash
   cd site && python3 -m http.server 8000
   ```
   - http://localhost:8000 を開く
   - ⚙️ボタンをクリック → モーダルが開く
   - username・repo（`kou-python/connpass-recommend`）・PAT を入力して「保存」
   - ページリロード後にモーダルを再度開いて値が保持されているか確認
   - 「今すぐ更新」を押してGitHub Actions が実行されるか確認（GitHub の Actions タブで確認）
   - Escapeキー・オーバーレイクリックでモーダルが閉じるか確認

2. **workflow_dispatch 手動トリガー確認**:
   GitHub の Actions タブ → `Update events` → `Run workflow` ドロップダウンで `connpass_username` フィールドが表示されることを確認

3. **PAT なし・不正 repo エラー確認**:
   - PAT を空にして「今すぐ更新」→ エラーメッセージが表示される
   - repo を不正形式（スラッシュなし）にして「今すぐ更新」→ エラーメッセージが表示される
