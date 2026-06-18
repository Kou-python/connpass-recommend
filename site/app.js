'use strict';

let allEvents = [];
let activeCategory = 'all';
let trendChipTerms = [];   // top-N terms displayed as chips
let topNChips = 8;         // override from config if available
let currentSort = 'popular';

let appliedFromApi = new Set();    // applied_ids.json から読み込み
let appliedOverride = new Set();   // localStorage で手動追加
let removedOverride = new Set();   // localStorage で手動解除（APIがtrueでも解除可能）

const LS_APPLIED_ADD = 'connpass_applied_add';
const LS_APPLIED_REMOVE = 'connpass_applied_remove';

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

function loadOverrides() {
  try {
    const addRaw = localStorage.getItem(LS_APPLIED_ADD);
    appliedOverride = new Set(addRaw ? JSON.parse(addRaw) : []);
  } catch (err) {
    appliedOverride = new Set();
  }
  try {
    const removeRaw = localStorage.getItem(LS_APPLIED_REMOVE);
    removedOverride = new Set(removeRaw ? JSON.parse(removeRaw) : []);
  } catch (err) {
    removedOverride = new Set();
  }
}

function persistOverrides() {
  localStorage.setItem(LS_APPLIED_ADD, JSON.stringify([...appliedOverride]));
  localStorage.setItem(LS_APPLIED_REMOVE, JSON.stringify([...removedOverride]));
}

function isApplied(eventId) {
  if (removedOverride.has(eventId)) return false;
  return appliedFromApi.has(eventId) || appliedOverride.has(eventId);
}

function toggleApplied(eventId) {
  if (isApplied(eventId)) {
    removedOverride.add(eventId);
    appliedOverride.delete(eventId);
  } else {
    appliedOverride.add(eventId);
    removedOverride.delete(eventId);
  }
  persistOverrides();
  renderEvents();
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

  const sorted = sortEvents(visible);

  if (sorted.length === 0) {
    grid.innerHTML = '<p class="status">条件に合うイベントがありません。</p>';
    return;
  }

  const pending = sorted.filter(e => !isApplied(e.event_id));
  const applied = sorted.filter(e => isApplied(e.event_id));

  grid.innerHTML = '';
  for (const event of pending) {
    grid.appendChild(buildCard(event));
  }

  if (applied.length > 0) {
    const divider = document.createElement('div');
    divider.className = 'applied-divider';
    divider.textContent = '── 応募済み ──';
    grid.appendChild(divider);
    for (const event of applied) {
      grid.appendChild(buildCard(event));
    }
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

  const thumb = event.image_url
    ? `<img src="${escapeAttr(event.image_url)}" alt="" loading="lazy"
            onerror="this.remove()" />`
    : `<span>${escapeHtml((event.title || '?').trim().charAt(0))}</span>`;

  const newBadge = event.is_new === true ? '<span class="badge-new">NEW</span>' : '';
  const appliedNow = isApplied(event.event_id);
  const applyBtnText = appliedNow ? '✓ 応募済み（取消）' : '申込む →';

  if (appliedNow) {
    card.classList.add('applied');
  }

  card.innerHTML = `
    <a class="event-thumb" href="${escapeAttr(event.url)}"
       target="_blank" rel="noopener" aria-hidden="true">
      ${thumb}
    </a>
    <div class="event-card-body">
      <h2>
        <a href="${escapeAttr(event.url)}" target="_blank" rel="noopener">
          ${escapeHtml(event.title)}
        </a>${newBadge}
      </h2>
      <p class="event-meta">
        <span>${formatDate(event.started_at)}</span>
        <span>${escapeHtml(place)}</span>
        <span>👥 ${event.accepted}/${escapeHtml(String(limit))}</span>
      </p>
      <div class="event-tags">${tags}</div>
      <button class="apply-button" data-event-id="${escapeAttr(String(event.event_id))}">
        ${escapeHtml(applyBtnText)}
      </button>
    </div>
  `;

  const applyBtn = card.querySelector('.apply-button');
  applyBtn.addEventListener('click', () => {
    if (!isApplied(event.event_id)) {
      window.open(event.join_url, '_blank', 'noopener,noreferrer');
    }
    toggleApplied(event.event_id);
  });

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
  const [eventData, trendData, appliedData] = await Promise.all([
    loadJson('data/events.json'),
    loadJson('data/trends.json'),
    loadJson('data/applied_ids.json'),
  ]);

  if (!eventData) {
    document.getElementById('event-grid').innerHTML =
      '<p class="status">データを取得できませんでした。</p>';
    return;
  }

  if (appliedData && Array.isArray(appliedData.applied_ids)) {
    appliedFromApi = new Set(appliedData.applied_ids);
  }

  loadOverrides();

  allEvents = eventData.events || [];
  renderUpdatedAt(eventData.updated_at);

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

  const sortSelect = document.getElementById('sort-select');
  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      currentSort = sortSelect.value;
      renderEvents();
    });
  }

  renderFilters(trendChipTerms);
  renderEvents();
}

init();
