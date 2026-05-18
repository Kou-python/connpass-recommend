'use strict';

const CATEGORY_COLOR = {
  AI: '#8b5cf6',
  'フロント': '#0ea5e9',
  PdM: '#f59e0b',
};

let allEvents = [];
let activeCategory = 'all';
let trendChipTerms = [];   // top-N terms displayed as chips
let topNChips = 8;         // override from config if available

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
  if (key === 'all') return false;
  const knownCategories = Array.from(
    new Set(allEvents.flatMap((e) => e.matched_categories || []))
  );
  return !knownCategories.includes(key);
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

  card.innerHTML = `
    <a class="event-thumb" href="${escapeAttr(event.url)}"
       target="_blank" rel="noopener" aria-hidden="true">
      ${thumb}
    </a>
    <div class="event-card-body">
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
         href="${escapeAttr(event.join_url)}"
         target="_blank" rel="noopener">
        申込む →
      </a>
    </div>
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

  const params = new URLSearchParams(window.location.search);
  const tag = params.get('tag');
  if (tag) {
    activeCategory = tag;
    if (!categories.includes(tag) && !trendChipTerms.includes(tag)) {
      trendChipTerms = [tag, ...trendChipTerms];
    }
  }

  renderFilters(categories, trendChipTerms);
  renderEvents();
}

init();
