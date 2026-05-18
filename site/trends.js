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