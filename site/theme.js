'use strict';

(function () {
  const STORAGE_KEY = 'connpass-theme';

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent = theme === 'dark' ? '☀' : '🌙';
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
  }

  // localStorage の設定を反映（HTMLのデフォルトを上書き）
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) applyTheme(saved);

  document.addEventListener('DOMContentLoaded', function () {
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.addEventListener('click', toggleTheme);
    applyTheme(document.documentElement.getAttribute('data-theme') || 'dark');
  });
})();
