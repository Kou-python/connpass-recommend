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
