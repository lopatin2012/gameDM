/* ================================================================
   main.js — бутстрап, игровой цикл, управление, чит-панель
   ================================================================ */

(function () {
  const $ = id => document.getElementById(id);
  const S = () => Game.S;

  Game.running = false;

  /* ---------- запуск партии ---------- */

  function start() {
    Game.ui.showTitle(); // скрывается ниже, если экран титульный
    $('title-screen').classList.add('hidden');
    $('hud').classList.remove('hidden');
    $('game').classList.remove('hidden');
    Game.ui.finishOverlay();
    Game.ui.refreshAll();
    Game.ui.stage('Этап 0 · Запуск линии');
    Game.ui.log('🏭 Добро пожаловать на линию! Покупайте оборудование и успейте до Часа Ч.', 'good');
    Game.state.save();

    Game.running = true;
    let last = performance.now();
    function frame(now) {
      if (!Game.running) return;
      requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      Game.engine.tick(dt);
      Game.ui.frame(dt, now);
    }
    requestAnimationFrame(frame);
  }

  function newRun() {
    Game.state.new();
    const diff = Game.pickedDifficulty || 'standard';
    const d = DIFFICULTY[diff] || DIFFICULTY.standard;
    const s = Game.S;
    s.difficulty = diff;
    s.deadlineS = Math.round(CFG.DEADLINE_S * d.deadlineMult);
    s.auditS = s.deadlineS + 300; // аудит через 5 минут после Часа Ч
    s.ir = d.budget;
    s.productType = Game.pickedProduct || PRODUCTS[0]; // один тип на партию
    start();
    Game.ui.log('🎯 Сложность: ' + d.label + ' · Бюджет: ' + fmt(d.budget) + ' ₽ · Дедлайн: ' + Math.round(s.deadlineS / 60) + ' мин · Продукт: ' + s.productType.icon + ' ' + s.productType.name, 'info');
  }

  function continueRun() {
    const s = Game.state.load();
    if (!s) return;
    Game.S = s;
    Game.S.boxes = [];
    start();
  }

  /* ---------- события ленты ---------- */

  // клик в зоне «Производство» — подать продукт (1 клик = 1 продукт);
  // клик по коробке — паспорт продукта
  function onBeltPointerDown(e) {
    if (!Game.running) return;
    if (e.target.closest('#zone-prod')) {
      Game.engine.addManualBox();
      return;
    }
    const el = e.target.closest('.box');
    if (!el) return;
    const s = S();
    const b = s.boxes.find(x => String(x.id) === el.dataset.id);
    // в зоне производства паспорт не открывается (здесь только подача продукта)
    if (b && b.x < 0.14) return;
    if (b) Game.ui.openInspect(b);
  }

  /* ---------- кнопки ---------- */

  function bind() {
    $('btn-new').onclick = newRun;
    $('btn-retry').onclick = newRun;
    $('btn-continue').onclick = () => Game.ui.finishOverlay();
    $('btn-cont').onclick = continueRun;
    $('btn-reset').onclick = () => {
      if (confirm('Сбросить весь прогресс? Это необратимо.')) {
        Game.state.reset();
        location.reload();
      }
    };

    // панель «Оператор»: этапы конвейера
    $('btn-op-codes').onclick = () => { Game.engine.orderCodes(); Game.ui.updateOperator(); };
    $('btn-op-stick').onclick = () => { Game.engine.manualStick(Game.engine.getOpTargets().stick); Game.ui.updateOperator(); };
    $('btn-op-send').onclick = () => { Game.engine.manualBatchSend(); Game.ui.updateOperator(); };
    // подача продукта кнопкой
    $('btn-prod-add').onclick = () => { Game.engine.addManualBox(); Game.ui.updateOperator(); };
    // окно улучшений
    $('upgr-close').onclick = () => Game.ui.closeUpgradeModal();

    // лоток брака → модуль отбраковки на ленте: докинуть брак на перемаркировку
    $('reject-module').addEventListener('click', () => {
      if (Game.engine.recycleAll()) Game.ui.updateOperator();
    });

    // паспорт продукта
    $('inspect-close').onclick = () => Game.ui.closeInspect();
    $('btn-inspect-ok').onclick = () => Game.ui.closeInspect();
    $('inspect').addEventListener('click', e => {
      if (e.target === $('inspect')) Game.ui.closeInspect();
    });

    $('belt').addEventListener('pointerdown', onBeltPointerDown);

    document.addEventListener('click', e => {
      const cheat = e.target.closest('[data-cheat]');
      if (cheat) applyCheat(cheat.dataset.cheat);
      const op = e.target.closest('[data-op]');
      if (op) {
        const key = op.dataset.op; // 'stick' | 'scan'
        Game.ui.openInspect(Game.engine.getOpTargets()[key]);
      }
      const deliver = e.target.closest('[data-deliver]');
      if (deliver) {
        if (!Game.engine.deliverToContract(Number(deliver.dataset.deliver))) {
          Game.ui.log('📦 На складе пусто: сначала промаркируйте товары и проверьте их камерой.', 'bad');
        }
        Game.ui.renderContracts();
      }
      const prodBtn = e.target.closest('[data-prod]');
      if (prodBtn) selectProduct(Number(prodBtn.dataset.prod));
      const diffBtn = e.target.closest('[data-diff]');
      if (diffBtn) selectDifficulty(diffBtn.dataset.diff);
      const eqBtn = e.target.closest('[data-eq]');
      if (eqBtn) Game.ui.selectEq(eqBtn.dataset.eq);
    });
  }

  /* ---------- сложность партии ---------- */

  function selectDifficulty(key) {
    if (!DIFFICULTY[key]) return;
    Game.pickedDifficulty = key;
    document.querySelectorAll('.diff-btn').forEach(b => b.classList.toggle('active', b.dataset.diff === key));
  }

  /* ---------- выбор продукта завода (один тип на партию) ---------- */

  function selectProduct(idx) {
    if (!PRODUCTS[idx]) return;
    Game.pickedProduct = PRODUCTS[idx];
    document.querySelectorAll('.prod-btn').forEach((b, i) => b.classList.toggle('active', i === idx));
  }

  /* ---------- чит-панель (для теста баланса) ---------- */

  function applyCheat(id) {
    const s = S();
    switch (id) {
      case 'ir1000': s.ir += 1000; break;
      case 'ir5000': s.ir += 5000; break;
      case 'event': Game.events.trigger(); break;
      case 'fastcore': {
        s.equip.printer = 'typography';
        s.equip.camera = 'basic';
        s.equip.rejector = 'none';
        s.equip.server = 'basic';
        if (!s.chz.pool.length && !s.chz.ordering) {
          s.chz.pool.push(...Array.from({ length: CFG.ORDER_CODE_BATCH }, genDataMatrix));
        }
        Game.ui.refreshAll();
        Game.ui.log('🧪 Мгновенное ядро: типография, камера, сервер и ' + CFG.ORDER_CODE_BATCH + ' кодов ЧЗ.', 'info');
        break;
      }
      case 'time': s.t += 120; break;
    }
    Game.ui.renderEquipment();
    Game.ui.renderResearch();
  }

  /* ---------- сохранение при закрытии ---------- */

  window.addEventListener('beforeunload', () => {
    if (Game.running) Game.state.save();
  });

  /* ---------- старт ---------- */

  function boot() {
    // продукт и сложность по умолчанию
    Game.pickedProduct = PRODUCTS[0];
    selectProduct(0);
    Game.pickedDifficulty = 'standard';
    selectDifficulty('standard');
    bind();
    Game.ui.showTitle(); // рендер рекордов на титуле
    Game.records.init(); // подтянуть рекорды с сервера (если игра запущена через node)
    const s = Game.state.load();
    if (s) {
      if (s.productType) {
        const idx = PRODUCTS.findIndex(p => p.name === s.productType.name);
        Game.pickedProduct = s.productType;
        if (idx >= 0) selectProduct(idx);
      }
      if (s.difficulty) selectDifficulty(s.difficulty);
      $('btn-cont').classList.remove('hidden');
      $('btn-reset').classList.remove('hidden');
      $('btn-new').textContent = '▶ Новая игра (сбросит прогресс)';
    }
  }

  boot();
})();