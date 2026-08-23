/* ================================================================
   harness.js — общий каркас тестов:
   заглушки DOM/localStorage + загрузка игровых скриптов в изолированный
   контекст + общий прогонщик сценариев (runScenario).
   Используется тестами tests/*_test.js через tests/run.js
   ================================================================ */

'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* ---- заглушки DOM ---- */
class El {
  constructor(tag, id) {
    this.tagName = (tag || 'div').toUpperCase();
    this.id = id || '';
    this.children = [];
    this.style = {};
    this.dataset = {};
    this._cls = new Set();
    this.classList = {
      add: (...c) => c.forEach(x => this._cls.add(x)),
      remove: (...c) => c.forEach(x => this._cls.delete(x)),
      toggle: (c, f) => {
        if (f === undefined) { this._cls.has(c) ? this._cls.delete(c) : this._cls.add(c); }
        else f ? this._cls.add(c) : this._cls.delete(c);
      },
      contains: c => this._cls.has(c),
    };
    this.textContent = '';
    this.innerHTML = '';
    this.title = '';
    this.disabled = false;
    this.onclick = null;
    this.parentNode = null;
  }
  appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
  prepend(c) { c.parentNode = this; this.children.unshift(c); }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  querySelector() { return new El('b'); }
  closest() { return null; }
  addEventListener() {}
  get lastChild() { return this.children[this.children.length - 1]; }
}

const elMap = {};

/* ---- создание свежей игровой сессии (изолированный контекст) ---- */
function loadGame() {
  const ctx = {};
  ctx.window = ctx;
  ctx.document = {
    getElementById: id => elMap[id] || (elMap[id] = new El('div', id)),
    createElement: tag => new El(tag),
    addEventListener() {},
    querySelectorAll: () => [],
  };
  ctx.performance = { now: () => Date.now() };
  const store = {};
  ctx.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
  };
  ctx.confirm = () => true;
  ctx.addEventListener = () => {};
  ctx.setTimeout = setTimeout;
  ctx.console = console;
  vm.createContext(ctx);

  const DIR = path.join(__dirname, '..');
  for (const f of ['config.js', 'state.js', 'records.js', 'engine.js', 'events.js', 'upgrades.js', 'ui.js', 'main.js']) {
    vm.runInContext(fs.readFileSync(path.join(DIR, 'js', f), 'utf8'), ctx, { filename: f });
  }

  return {
    ctx,
    Game: ctx.Game,
    CFG: vm.runInContext('CFG', ctx),
    genDM: () => vm.runInContext('genDataMatrix()', ctx),
    products: () => vm.runInContext('PRODUCTS', ctx),
  };
}

/* ---- общий прогонщик сценария: тики, кликер, покупки, модалки ---- */
function runScenario(game, seconds, opts) {
  const G = game.Game;
  G.state.new();
  G.running = true;
  G.ui.finishOverlay();
  G.ui.closeModal();
  G.S.ir += opts.startIr || 0;
  if (opts.noEvents) G.S.nextEventAt = 1e9;
  if (opts.noContracts) G.S.nextContractAt = 1e9;
  if (opts.product !== undefined) G.S.productType = opts.product;
  if (opts.deadlineS) { G.S.deadlineS = opts.deadlineS; G.S.auditS = opts.auditS || (opts.deadlineS + 300); }

  let t = 0;
  const dt = 0.25;
  while (t < seconds) {
    if (opts.holdNegative) G.S.ir = Math.min(G.S.ir, -10);
    G.engine.tick(dt);
    G.ui.frame(dt, t * 1000);

    if (opts.clicks) {
      const reserve = G.S.chz.pool.length + G.S.chz.labels.length;
      if (!G.S.chz.ordering && reserve < 100) G.engine.orderCodes();
      const raw = G.S.boxes.find(b => b.state === 'raw' && b.x <= game.CFG.CLICK_ZONE_MAX && b.x >= 0.05);
      if (raw) G.engine.manualStick(raw);
      if (!opts.noAutoDeliver && G.S.contracts.length && G.S.pending.length) G.engine.deliverToContract(0);
      if (G.S.pending.length >= 3 && G.S.equip.server === 'none' && !G.S.contracts.length) G.engine.manualBatchSend();
      if (G.S.scrap.length) G.engine.recycleAll();
    }
    if (opts.buyCycle) {
      G.upgrades.buyStage('printer');
      G.upgrades.buyStage('camera');
      G.upgrades.buyStage('rejector');
      G.upgrades.buyStage('server');
    }
    if (opts.hook) opts.hook(t, G, game.CFG);

    if (G.ui.modalOpen) {
      const title = elMap['modal-title'] && elMap['modal-title'].textContent;
      const ev = G.events.EVENTS.find(e => e.name === title) || G.events.EVENTS[0];
      const tBefore = G.S.t;
      G.engine.tick(0.25);
      if (G.S.t !== tBefore) throw new Error('время идёт при открытой модалке');
      G.events.choose(ev, 0);
      if (G.ui.modalOpen) G.events.choose(ev, 1);
      if (G.ui.modalOpen) G.events.choose(ev, ev.choices.length - 1);
      if (G.ui.modalOpen) G.ui.closeModal();
    }
    t += dt;
  }
  return G.S;
}

module.exports = { El, loadGame, runScenario };