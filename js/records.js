/* ================================================================
   records.js — база рекордов
   При запуске через node-сервер (http) рекорды хранятся на сервере
   (/api/records, файл data/records.json). Без сервера (file://) —
   в localStorage. В обоих случаях — формат записи один.
   Запись: товар, произведено, промаркировано, счёт, дата.
   Счёт = (промаркировано × 3 + произведено) × множитель сложности.
   ================================================================ */

Game.records = (function () {
  const KEY = 'dmg_records_v1';
  let cache = null; // память: источник истины, если сервер доступен

  function onServer() {
    return typeof location !== 'undefined' && location.protocol &&
      location.protocol.indexOf('http') === 0 && typeof fetch === 'function';
  }

  function load() {
    if (cache) return cache;
    try {
      const raw = localStorage.getItem(KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function persist(list) {
    cache = list.slice(0, 12);
    try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch (e) { /* нет места */ }
  }

  /* при старте подтягиваем рекорды с сервера (если он есть) */
  function init() {
    if (!onServer()) return;
    fetch('/api/records')
      .then(r => r.json())
      .then(list => {
        if (!Array.isArray(list)) return;
        cache = list;
        if (Game.ui && Game.ui.renderRecords) Game.ui.renderRecords();
      })
      .catch(() => { /* сервер молчит — остаёмся на localStorage */ });
  }

  function scoreMult() {
    const d = DIFFICULTY[Game.S ? (Game.S.difficulty || 'standard') : 'standard'];
    return d ? d.scoreMult : 1;
  }

  function compute(s) {
    const mult = scoreMult();
    return {
      score: Math.round((s.stats.registered * 3 + s.stats.produced) * mult),
      mult,
    };
  }

  function add(entry) {
    const arr = load();
    arr.push(entry);
    arr.sort((a, b) => b.score - a.score);
    const top = arr.slice(0, 12);
    persist(top);
    if (onServer()) {
      try {
        fetch('/api/records', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(top),
        }).catch(() => {});
      } catch (e) { /* noop */ }
    }
    return top;
  }

  function reset() {
    cache = [];
    try { localStorage.removeItem(KEY); } catch (e) { /* noop */ }
    if (onServer()) {
      try { fetch('/api/records', { method: 'DELETE' }).catch(() => {}); } catch (e) { /* noop */ }
    }
  }

  return { load, add, compute, scoreMult, reset, init };
})();