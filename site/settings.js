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

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

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
    const username = inputUsername.value.trim();
    const repo     = inputRepo.value.trim();
    const pat      = inputPat.value.trim();
    saveSettings(username, repo, pat);
    triggerDispatch(repo, pat, username);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSettings);
} else {
  initSettings();
}
