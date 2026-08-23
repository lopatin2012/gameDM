/* ================================================================
   ui.js — рендер интерфейса: HUD, лента, оборудование, прокачка, модалки
   ================================================================ */

Game.ui = (function () {
  const $ = id => document.getElementById(id);
  const S = () => Game.S;
  const E = Game.engine;

  let modalOpen = false;
  let victoryOpen = false;
  let lastChipAt = 0;
  let lastHpAt = 0;
  let lastContrAt = 0;
  let lastFlashAt = 0;

  const EFFECT_BANNERS = {
    sale_camera: '🏷️ Скидка на камеру −20%',
    slow: '🐌 Линия замедлена',
    defect_up: '🎨 Брак этикеток +25%',
    camera_half: '☀️ Камера вполсилы',
    camera_off: '🌑 Камера отключена',
    server_down: '📡 Сервер недоступен',
    speed_up: '⚡ Поток +25%',
    profit_x15: '🤝 Цена ×1.5',
    print_off: '🧻 Печать этикеток встала',
    appl_off: '⚙️ Аппликатор сломан — клейте вручную',
  };

  const pct = v => Math.round(v * 100) + '%';

  /* ---------- коробки ---------- */

  const STATE_LABELS = {
    raw: 'этикетка не наклеена',
    coded: 'этикетка наклеена',
    ok: 'проверен, код читается',
    bad: 'брак: код не прочитан',
    missed: 'код потерян (буфер!)',
  };

  function createBoxEl(b) {
    const el = document.createElement('div');
    el.className = 'box raw';
    el.dataset.id = b.id;
    el.title = b.product.name + ' — ' + (STATE_LABELS[b.state] || b.state);
    el.style.top = b.top + 'px';
    positionBoxEl(el, b.x);

    const icon = document.createElement('span');
    icon.className = 'box-icon';
    icon.textContent = b.product.icon;
    el.appendChild(icon);

    const dm = document.createElement('span');
    dm.className = 'dm hidden';
    dm.title = 'Символ DataMatrix';
    el.appendChild(dm);

    $('belt').appendChild(el);
    b.el = el;
    setBoxState(b);
    return el;
  }

  function setBoxState(b) {
    b.el.className = Game.engine.boxClass(b);
    const dm = b.el.querySelector && b.el.querySelector('.dm');
    let hasCode = false;
    if (dm) {
      hasCode = b.state === 'coded' || b.state === 'ok' || b.state === 'bad' || b.state === 'missed';
      dm.classList.toggle('hidden', !hasCode);
      if (hasCode && b.code) drawDM(dm, b.code, b.defectLabel === true, (b.recycles || 0) > 0);
    }
    b.el.title = b.product.name + (b.grade && b.grade.mult > 1 ? ' (' + b.grade.name + ' ×' + b.grade.mult + ')' : '') + ' — ' + (STATE_LABELS[b.state] || b.state) +
      (hasCode && b.code ? '\nКод: ' + b.code : '\nКлик — паспорт продукта');
  }

  /* рисует DataMatrix: настоящая генерация через DATAMatrix (datamatrix-svg), 
   иначе — встроенный fallback на canvas. Кэш по коду и состоянию */
  function drawDM(host, code, blurred, damaged) {
    if (!host) return;
    const key = String(code || '') + (blurred ? '#blur' : '') + (damaged ? '#dmg' : '');
    if (host.dataset.dmcode === key) return;
    host.dataset.dmcode = key;
    host.textContent = '';
    if (!code) return;

    // реальная генерация DataMatrix (ECC200) → SVG
    const real = (typeof DATAMatrix === 'function') ? DATAMatrix({ msg: code, dim: 256, pad: 1, pal: ['#000000', '#ffffff'] }) : null;
    if (real && real.nodeType) {
      try {
        real.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        real.setAttribute('width', '100%');
        real.setAttribute('height', '100%');
      } catch (e) { /* some svg sets may be strict */ }
      host.appendChild(real);
      host.classList.toggle('dm-blur', !!blurred);
      host.classList.toggle('dm-damage', !!damaged);
      return;
    }

    // fallback: детерминированный canvas-глиф
    let cv = host.querySelector && host.querySelector('.dm-canvas');
    if (!cv) {
      cv = document.createElement('canvas');
      cv.className = 'dm-canvas';
      host.appendChild(cv);
    }
    const size = Math.max(host.clientWidth || 16, 16);
    if (cv.width !== size) { cv.width = size; cv.height = size; }
    renderDataMatrix(cv, code, blurred, damaged);
  }

  function positionBoxEl(el, x) {
    el.style.left = 'calc(' + (x * 100).toFixed(2) + '% - 20px)';
  }

  function positionBox(b) {
    positionBoxEl(b.el, b.x);
  }

  function removeBox(b) {
    if (b.el && b.el.parentNode) b.el.parentNode.removeChild(b.el);
  }

  function fx(b, txt, cls) {
    const span = document.createElement('span');
    span.className = 'fx ' + cls;
    span.textContent = txt;
    span.style.left = 'calc(' + (b.x * 100).toFixed(2) + '% - 20px)';
    span.style.top = ((b.top || 0) - 4) + 'px';
    $('belt').appendChild(span);
    setTimeout(() => span.remove(), 1000);
  }

  /* ---------- лог / этап / баннер ---------- */

  function log(msg, cls) {
    const ul = $('log-list');
    const li = document.createElement('li');
    li.className = cls || 'info';
    li.textContent = msg;
    ul.prepend(li);
    while (ul.children.length > 50) ul.removeChild(ul.lastChild);
  }

  function stage(text) {
    $('stage-text').textContent = text;
  }

  function banner() {
    const parts = [];
    const s = S();
    if (s.strike) parts.push('⛔ Оператор остановил производство — переклейте брак');
    const brk = E.brokenModules();
    if (brk.length) parts.push('💥 Сломан модуль: ' + brk.join(', ') + ' — линия замедлена, модуль работает вручную');
    if (s.ir < 0 && s.phase !== 'over') {
      const left = Math.max(0, Math.ceil(CFG.BANKRUPT_GRACE_S - s.negTimer));
      parts.push('💰 БАЛАНС В МИНУСЕ! Исправьте за ' + left + ' с, иначе банкротство!');
    }
    for (const e of s.effects) {
      if (e.until > s.t && EFFECT_BANNERS[e.id]) parts.push(EFFECT_BANNERS[e.id] + ' — ещё ' + Math.max(0, e.until - s.t).toFixed(0) + ' с');
    }
    if (E.paused()) {
      const left = Math.max(0, s.pauseUntil - s.t);
      parts.push('⏸ Линия остановлена — запуск через ' + left.toFixed(1) + ' с');
    }
    const el = $('banner');
    if (parts.length) {
      el.textContent = parts.join('  ·  ');
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  }

  /* ---------- HUD (обновление раз в 150 мс) ---------- */

  function frame(dt, now) {
    const s = S();
    if (now - lastChipAt < 150) return;
    lastChipAt = now;

    const b1 = s.equip.printer === 'none' && $('belt') !== null;
    $('hint').classList.toggle('hidden', !(b1 && s.t < 90));

    $('chp-ir').querySelector('b').textContent = fmt(s.ir);
    const irEl = $('chp-ir');
    irEl.classList.toggle('negative', s.ir < 0);
    if (s.ir < 0) {
      irEl.title = '⚠️ Баланс отрицательный!';
    } else {
      irEl.title = 'Рубли — основная валюта';
    }

    const timeEl = $('chp-time');
    const tEl = timeEl.querySelector('b');
    if (modalOpen || victoryOpen) {
      tEl.textContent = '⏸ пауза';
      timeEl.classList.remove('urgent');
    } else if (s.phase === 'prep') {
      const dl = s.deadlineS || CFG.DEADLINE_S;
      if (!isFinite(dl)) {
        tEl.textContent = '∞ бесконечный';
        timeEl.classList.remove('urgent');
      } else {
        const left = Math.max(0, dl - s.t);
        tEl.textContent = mmss(left);
        timeEl.classList.toggle('urgent', left < 60);
      }
      $('chp-phase').querySelector('b').textContent = s.t >= CFG.GRACE_S ? 'Маркировка обязательна' : 'Подготовка';
    } else if (s.phase === 'post') {
      const au = s.auditS || CFG.AUDIT_AT_S;
      const left = Math.max(0, au - s.t);
      tEl.textContent = left > 0 ? 'аудит через ' + mmss(left) : 'аудит';
      timeEl.classList.remove('urgent');
      $('chp-phase').querySelector('b').textContent = 'Работа под ЧЗ';
    } else if (s.phase === 'won') {
      tEl.textContent = 'пройден ✅';
      timeEl.classList.remove('urgent');
      $('chp-phase').querySelector('b').textContent = 'Песочница';
    }

    const inGrace = s.t < CFG.GRACE_S; // до обязательной маркировки учёт не ведём
    $('chp-req').querySelector('b').textContent = inGrace ? '—' : pct(E.requirement());
    $('chp-reg').querySelector('b').textContent = inGrace ? '—' : pct(E.markRatio());
    $('chp-streak').querySelector('b').textContent = '×' + E.streakMult().toFixed(1);
    const prodChip = $('chp-product');
    if (prodChip) {
      const p = s.productType || PRODUCTS[0];
      const ql = s.upgradeLevels.quality_grade || 0;
      prodChip.querySelector('b').textContent = p.name + (ql > 0 ? ' · качество ур. ' + ql : '');
    }

    banner();

    setBeltPaused(E.paused());
    updateOperator();
    updateAffordability();
    // здоровье модулей обновляется раз в секунду (не только при переключении)
    if (now - lastHpAt > 1000) {
      lastHpAt = now;
      updateHealthUi();
    }
    // цифры на складе в контрактах — живые (раз в секунду)
    if (now - lastContrAt > 1000) {
      lastContrAt = now;
      renderContracts();
    }
    // вспышки камеры: подсвечивают ПРОДУКТ, который в зоне чтения и ещё не проверен
    const camWorks = s.equip.camera === 'basic' && E.moduleOk('camera') && !s.research.includes('cam_light');
    const scanTarget = s.boxes.find(b => !b.scanned && b.x >= CFG.SCAN_ZONE_MIN && b.x <= CFG.SCAN_ZONE_MAX);
    if (camWorks && scanTarget && now - lastFlashAt > 260) {
      lastFlashAt = now;
      const beltEl = $('belt');
      if (beltEl) {
        const fx = document.createElement('div');
        fx.className = 'cam-flash';
        fx.style.left = 'calc(' + (scanTarget.x * 100).toFixed(2) + '% - 22px)';
        fx.style.top = ((scanTarget.top || 0) + 4) + 'px';
        beltEl.appendChild(fx);
        setTimeout(() => { if (fx.parentNode) fx.parentNode.removeChild(fx); }, 320);
      }
    }
  }

  /* покупки должны оживать, как только накопились деньги */
  function updateAffordability() {
    const ir = S().ir;
    document.querySelectorAll('.btn[data-cost]').forEach(btn => {
      btn.disabled = ir < Number(btn.dataset.cost);
    });
  }

  /* полоски здоровья обновляются каждый тик-секунду */
  function updateHealthUi() {
    const s = S();
    const hard = s.difficulty === 'hard' ? 1.5 : 1;
    document.querySelectorAll('.hp-fill[data-hp]').forEach(fill => {
      const k = fill.dataset.hp;
      const hp = s.health[k] || 1;
      fill.style.width = Math.round(hp * 100) + '%';
      fill.className = 'hp-fill' + (hp <= 0 ? ' broken' : (hp < 0.35 ? ' warn' : ''));
      const btn = document.querySelector('.btn[data-repair="' + k + '"]');
      if (!btn) return;
      if (hp <= 0) {
        const stage = Game.upgrades.currentStage(k);
        const base = (stage && stage.cost) ? stage.cost : (REPAIR_COST[k] || 100);
        btn.dataset.cost = Math.round(base * hard);
        btn.textContent = '🆕 Купить новое ' + fmt(Math.round(base * hard));
      } else {
        const c = Math.round((REPAIR_COST[k] || 100) * (1 - hp) * hard);
        btn.dataset.cost = c;
        btn.textContent = '🔧 Ремонт ' + fmt(c);
      }
      btn.disabled = hp >= 0.99;
    });
  }

  /* ---------- панель «Оператор»: ручные операции по этапам ---------- */

  function scannerInfo() {
    const s = S();
    const camModel = 'ReaderDM' + (100 * Math.max(1, s.upgradeLevels.cam_accel || 0));
    if (s.equip.camera === 'basic' && E.moduleOk('camera')) {
      const miss = (E.camMiss() * 100).toFixed(1).replace('.', ',');
      return '📷 ' + camModel + ' · пропуск кода ' + miss + '%' +
        (s.research.includes('cam_software') ? ' · ПО «Чёткость»' : '');
    }
    if (s.equip.camera === 'basic') return '📷 Камера СЛОМАНА — проверка вручную';
    return '📷 Камеры нет — коды НЕ проверяются!';
  }

  function updateOperator() {
    const s = S();
    const t = E.getOpTargets();

    // Партия производства
    const bi = E.batchInfo();
    const whdle = s.contracts.length && !s.contracts[0].done ? ' · под контракт' : ' · авто-размер';
    $('op-batch-info').textContent = 'Партия №' + bi.no + ': ' + bi.done + ' / ' + bi.qty + ' шт' + whdle +
      ' (лимит ' + bi.max + ')';
    const bfill = $('op-batch-fill');
    if (bfill) bfill.style.width = Math.max(2, Math.round(bi.done / bi.qty * 100)) + '%';

    // метка зоны маркировки: кто наносит код и с какой скоростью
    const zl = $('zprint-label');
    if (zl) {
      zl.textContent = s.equip.printer === 'typography'
        ? '🖨️ Прямая печать'
        : (s.equip.printer === 'own'
          ? (s.research.includes('prn_applicator') ? '🖨️+👷: ' + E.stickerRate().toFixed(1) + ' шт/с' : '👷 Наклейка: ' + E.stickerRate().toFixed(1) + ' шт/с')
          : '🏷️ Наклейка');
    }
    // вторая линия — видимая: разделитель дорожек
    const belt = $('belt');
    if (belt) belt.classList.toggle('two-lanes', s.lines >= 2);

    // Этап 0 «Коды ЧЗ» — заказ и печать этикеток
    const chz = s.chz;
    $('op-codes-stock').textContent = s.equip.printer === 'typography'
      ? 'Коды ЧЗ: ' + chz.pool.length + ' · прямая печать кода на продукт'
      : 'Коды ЧЗ: ' + chz.pool.length + ' · рулон: ' + chz.labels.length + '/' + E.rollMax() + ' · буфер: ' + chz.buffer.length;
    const st = $('op-codes-status');
    const btnCodes = $('btn-op-codes');
    if (chz.ordering) {
      const left = Math.max(0, Math.ceil(chz.orderDoneAt - s.t));
      st.textContent = '⏳ Генерация кодов в Честном знаке… осталось ' + left + ' с';
      st.classList.add('hot');
      btnCodes.disabled = true;
      btnCodes.textContent = '⏳ генерация…';
    } else {
      st.textContent = chz.pool.length + chz.labels.length
        ? 'Запас кодов: ' + (chz.pool.length + chz.labels.length)
        : 'Кодов нет — закажите партию в Честном знаке!';
      st.classList.remove('hot');
      btnCodes.disabled = chz.pool.length + chz.labels.length >= CFG.POOL_MAX;
      btnCodes.textContent = '📦 Заказать ' + CFG.ORDER_CODE_BATCH + ' кодов ЧЗ';
    }

    // Этап 1 «Наклейка этикетки»
    const stickProd = $('op-stick-prod');
    if (t.stick) {
      stickProd.textContent = t.stick.product.icon + ' ' + t.stick.product.name;
    } else {
      stickProd.textContent = '— ждём продукт в зоне наклейки —';
    }
    $('op-stick-info').textContent = chz.labels.length
      ? (t.stick ? 'Этикетка готова — наклейте её!' : 'На рулоне ' + chz.labels.length + ' этикеток')
      : 'Этикеток нет: закажите коды, дождитесь генерации и печати';
    const bs = $('btn-op-stick');
    bs.disabled = !(t.stick && s.manualCd <= 0);
    bs.textContent = s.manualCd > 0 ? '⏳ наклеивается…' : '🏷️ Наклеить этикетку';

    // Этап 2 «Сканирование» (информация + текущий продукт)
    $('op-scan-err').textContent = scannerInfo();
    const scanProd = $('op-scan-prod');
    const stEl = $('op-scan-status');
    if (t.scan) {
      scanProd.textContent = t.scan.product.icon + ' ' + t.scan.product.name;
      stEl.textContent = STATE_LABELS[t.scan.state] || t.scan.state;
    } else {
      scanProd.textContent = '— ждём продукт в зоне сканирования —';
      stEl.textContent = '';
    }
    stEl.classList.toggle('good', !!t.scan && (t.scan.state === 'coded' || t.scan.state === 'ok'));
    stEl.classList.toggle('bad', !!t.scan && (t.scan.state === 'bad' || t.scan.state === 'missed'));

    // Этап 3 «Склад» — готовая продукция
    const whMax = E.warehouseMax();
    $('op-send-count').textContent =
      'Заполнение склада: ' + s.pending.length + ' / ' + whMax +
      (s.contracts.length
        ? ' · товар ждёт заказчика'
        : (s.equip.server === 'basic' ? ' · рынок автоматический' : ' · рынок вручную'));
    const whFill = $('op-wh-fill');
    if (whFill) whFill.style.width = Math.max(2, Math.round(s.pending.length / whMax * 100)) + '%';
    const br = $('btn-op-send');
    br.disabled = !s.pending.length;
    br.textContent = '📤 Продать на рынок' + (s.pending.length ? ' (' + s.pending.length + ')' : '');
  }

  /* ---------- контракты заказчиков (центр) ---------- */

  function renderContracts() {
    const wrap = $('contracts-list');
    const list = S().contracts || [];
    if (!list.length) {
      $('contracts-empty').classList.remove('hidden');
      wrap.innerHTML = '';
      return;
    }
    $('contracts-empty').classList.add('hidden');
    wrap.innerHTML = '';
    list.forEach((c, idx) => {
      const card = document.createElement('div');
      card.className = 'contract-card';
      const need = c.qty - c.delivered;
      const pctNow = Math.round(c.delivered / c.qty * 100);
      card.innerHTML =
        '<div class="cc-head"><span class="cc-icon">' + c.icon + '</span>' +
        '<span class="cc-name">' + c.customer + '</span>' +
        '<span class="cc-due">до ' + c.dueText + '</span></div>' +
        '<div class="cc-prod">' + (c.product ? c.product.icon + ' ' + c.product.name + ' — ' + c.qty + ' упаковок' : c.qty + ' упаковок') + '</div>' +
        '<div class="cc-req">передано ' + c.delivered + ' / ' + c.qty + ' · награда +' + fmt(c.reward) + ' ₽</div>' +
        '<div class="bar"><div class="cc-fill" style="width:' + pctNow + '%"></div></div>' +
        (c.delivered >= c.qty
          ? '<div class="cc-done">✅ Контракт выполнен!</div>'
          : '<button class="btn btn-primary" data-deliver="' + idx + '">📦 Передать заказчику (со склада: ' + S().pending.length + ')</button>' +
            '<div class="small">осталось ' + need + ' шт · склад ' + S().pending.length + '/' + E.warehouseMax() + '</div>');
      wrap.appendChild(card);
    });
  }

  /* ---------- модуль ОТБРАКОВКИ (внутри ленты, между проверкой и накопителем) ---------- */

  function renderScrap() {
    const mod = $('reject-module');
    const list = S().scrap;
    if (!list.length) {
      mod.classList.add('hidden');
      return;
    }
    mod.classList.remove('hidden');
    $('scrap-icons').innerHTML =
      list.slice(0, 6).map(u =>
        '<span class="scrap-item" title="Брак: ' + (BRAK_REASONS[u.scanReason] || 'неизвестно') +
        (u.code ? '\nКод: ' + u.code : '') + '\nКлик — вернуть на конвейер для перемаркировки">' + u.icon + '</span>'
      ).join('') +
      (list.length > 6 ? '<span class="scrap-more">+' + (list.length - 6) + '</span>' : '');
    $('scrap-count').textContent = list.length;
    // сводка причин + настроение сотрудников
    const counts = {};
    list.forEach(u => { counts[BRAK_REASONS[u.scanReason] || '?'] = (counts[BRAK_REASONS[u.scanReason] || '?'] || 0) + 1; });
    let reasons = Object.entries(counts).map(([k, v]) => v + ' × ' + k).join(' · ');
    if (S().stats.badStreak >= 3) reasons += ' · 😡 ' + S().stats.badStreak + ' брака подряд';
    $('scrap-reasons').textContent = reasons;
  }

  /* ---------- уведомления (независимые события) ---------- */

  function toast(icon, text) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = '<span class="toast-icon">' + icon + '</span><span>' + text + '</span>';
    $('toast-feed').appendChild(el);
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 5000);
  }

  /* ---------- паспорт продукта (просмотр кода DataMatrix) ---------- */

  function openInspect(b) {
    if (!b) return;
    $('inspect-icon').textContent = b.product.icon;
    $('inspect-name').textContent = b.product.name;
    let status = STATE_LABELS[b.state] || b.state;
    if (b.state === 'bad' && b.scanReason) status += ' — «' + (BRAK_REASONS[b.scanReason] || b.scanReason) + '»';
    if (b.grade && b.grade.mult > 1) status += ' · сорт: ' + b.grade.name + ' (×' + b.grade.mult + ')';
    $('inspect-status').textContent = status;
    $('inspect-dates').textContent = b.prodDate && b.expDate
      ? 'Маркировка: ' + b.prodDate + ' · Годен до: ' + b.expDate
      : '';
    const hasCode = b.state !== 'raw';
    $('inspect-code').textContent = hasCode && b.code ? b.code : '— этикетка ещё не наклеена —';
    drawDM($('inspect-dm'), hasCode ? b.code : null, hasCode ? (b.defectLabel === true) : false, hasCode ? ((b.recycles || 0) > 0) : false);
    $('inspect-dm').classList.toggle('dimmed', !hasCode);
    $('inspect-hint').textContent = hasCode
      ? 'Строка кода DataMatrix этой единицы продукции (можно скопировать):'
      : 'Продукт без маркировки. Наклейте этикетку — и здесь появится уникальный код.';
    $('inspect-hint').classList.remove('hidden');
    $('inspect').classList.remove('hidden');
  }

  function closeInspect() {
    $('inspect').classList.add('hidden');
  }

  function setBeltPaused(p) {
    $('belt').classList.toggle('paused', p);
  }

  function mmss(sec) {
    sec = Math.max(0, Math.floor(sec));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  /* ---------- оборудование (модули) и деревья прокачки ---------- */

  const EQ_LABELS = { printer: 'Маркировка', camera: 'Проверка', rejector: 'Отбраковка', server: 'Отчёты', shop: 'Цех' };
  const EQ_ORDER = ['printer', 'camera', 'rejector', 'server', 'shop'];
  let eqTreeKind = 'printer';

  function selectEq(kind) {
    if (!EQ_LABELS[kind]) return;
    eqTreeKind = kind;
    renderEquipment();
    renderResearch();
    const modal = $('upgrade-modal');
    if (modal) modal.classList.remove('hidden'); // открываем окно улучшений по шестерёнке
  }

  function closeUpgradeModal() {
    const modal = $('upgrade-modal');
    if (modal) modal.classList.add('hidden');
  }

  function renderEquipment() {
    const s = S();
    const wrap = $('equip-list');
    wrap.innerHTML = '';

    for (const kind of EQ_ORDER) {
      // «Цех» — общий модуль без стадий покупки
      const cur = kind === 'shop'
        ? { icon: '🏭', label: 'Цеховые улучшения', desc: 'Общее для производства: вторая линия, турбо-конвейер, автозаказ кодов.' }
        : Game.upgrades.currentStage(kind);
      const next = kind === 'shop' ? null : Game.upgrades.nextStage(kind);
      const card = document.createElement('div');
      card.className = 'equip-card' + (eqTreeKind === kind ? ' eq-selected' : '');

      const top = document.createElement('div');
      top.className = 'ec-top ec-click';
      top.dataset.eq = kind;
      top.title = 'Нажмите, чтобы открыть дерево прокачки «' + EQ_LABELS[kind] + '»';
      const icon = document.createElement('span');
      icon.className = 'ec-icon';
      icon.textContent = cur.icon;
      const name = document.createElement('span');
      name.className = 'ec-name';
      name.textContent = kindLabel(kind);
      const st = document.createElement('span');
      st.className = 'ec-stage';
      st.textContent = cur.label;
      const gear = document.createElement('span');
      gear.className = 'ec-gear';
      gear.textContent = '🔧';
      gear.title = 'Открыть дерево прокачки';
      top.appendChild(icon);
      top.appendChild(name);
      top.appendChild(st);
      top.appendChild(gear);
      card.appendChild(top);

      if (kind !== 'shop') {
        const desc = document.createElement('div');
        desc.className = 'ec-desc';
        desc.textContent = cur.desc;
        card.appendChild(desc);
      }

      // показатели производительности — цифры (прозрачность!)
      const statsEl = document.createElement('div');
      statsEl.className = 'ec-desc ec-metrics';
      statsEl.textContent = metricLine(kind);
      card.appendChild(statsEl);

      if (kind === 'printer') {
        // режимы маркировки: типография (код сразу) ↔ свой принтер (этикетки+наклейка)
        const modes = [
          { id: 'typography', label: '🖨️ Типография — код сразу на продукт', cost: PRINTER_STAGES[1].cost },
          { id: 'own', label: '🛠️ Свой принтер этикеток', cost: PRINTER_STAGES[2].cost },
        ];
        for (const m of modes) {
          const owned = s.printerModes[m.id];
          const active = s.equip.printer === m.id;
          const btn = document.createElement('button');
          btn.className = 'btn' + (active ? ' btn-primary' : '');
          if (owned) {
            btn.textContent = active ? '✓ активен: ' + m.label : '➜ Переключить: ' + m.label;
            btn.disabled = active;
          } else {
            btn.textContent = 'Купить: ' + m.label + ' · ' + fmt(m.cost) + ' ₽';
            btn.dataset.cost = m.cost;
            btn.disabled = !E.canAfford(m.cost);
          }
          btn.onclick = () => { Game.upgrades.buyPrinter(m.id); renderEquipment(); renderResearch(); };
          card.appendChild(btn);
        }
      } else if (next) {
        const cost = E.costFor(kind);
        const btn = document.createElement('button');
        btn.className = 'btn btn-primary';
        btn.dataset.cost = cost;
        btn.textContent = 'Купить: ' + next.label + ' · ' + fmt(cost) + ' ₽';
        btn.disabled = !E.canAfford(cost);
        btn.onclick = () => { Game.upgrades.buyStage(kind); renderEquipment(); renderResearch(); };
        card.appendChild(btn);
      } else if (kind !== 'shop') {
        const done = document.createElement('div');
        done.className = 'ec-stage';
        // у камеры стадий нет — вместо «максимума» показываем скорость считывания
        done.textContent = kind === 'camera'
          ? '⚡ считывание: ' + E.camSpeed().toFixed(1) + ' кодов/с'
          : '✔ максимум';
        card.appendChild(done);
      }

      // здоровье модуля + ремонт
      if (kind !== 'shop' && cur.id !== 'none') {
        const hp = S().health[kind];
        const broken = hp <= 0;
        const row = document.createElement('div');
        row.className = 'hp-row';
        const dot = document.createElement('span');
        dot.className = 'hp-dot';
        dot.textContent = broken ? '💥' : '🔩';
        const bar = document.createElement('div');
        bar.className = 'bar';
        const fill = document.createElement('div');
        fill.className = 'hp-fill' + (broken ? ' broken' : (hp < 0.35 ? ' warn' : ''));
        fill.dataset.hp = kind;
        fill.style.width = Math.round(hp * 100) + '%';
        bar.appendChild(fill);
        const rep = document.createElement('button');
        rep.className = 'btn btn-warn';
        rep.dataset.repair = kind;
        rep.dataset.cost = 99999;
        rep.textContent = hp <= 0 ? '🆕 Купить новое' : '🔧 Ремонт';
        rep.disabled = hp >= 0.99;
        rep.onclick = () => { Game.engine.repairModule(kind); };
        row.appendChild(dot);
        row.appendChild(bar);
        row.appendChild(rep);
        card.appendChild(row);
      }

      wrap.appendChild(card);
    }
  }

  function kindLabel(kind) {
    return { printer: 'Печать кода DM', camera: 'Проверка DM', rejector: 'Отбраковщик', server: 'Отчёты в ЧЗ', shop: 'Цех' }[kind] || '?';
  }

  /* числовые показатели оборудования — прозрачность механик */
  function metricLine(kind) {
    const s = S();
    if (kind === 'printer') {
      if (s.equip.printer === 'typography') {
        return '🖨️ подрядчик кодирует сразу (×3 ₽/код) · скорость по линии: ' + E.flowRate().toFixed(2) + ' шт/с';
      }
      if (s.equip.printer === 'own') {
        const rm = E.rollMax();
        const low = s.chz.labels.length < CFG.STICKER_STOP_AT ? ' · 🗞️ ждём печать (рулон мал)' : '';
        const human = (CFG.STICKER_BASE_RATE + CFG.STICKER_SKILL_STEP * (s.upgradeLevels.sticker_skill || 0)) * E.productSpeedMult();
        const sticker = s.research.includes('prn_applicator')
          ? '🖨️ аппликатор ' + E.printRate().toFixed(1) + ' + 👷 человек ' + human.toFixed(2) + ' = ' + E.stickerRate().toFixed(1) + ' шт/с'
          : '👷 человек клеит ' + E.stickerRate().toFixed(2) + ' шт/с (навык ур. ' + (s.upgradeLevels.sticker_skill || 0) + ')';
        return sticker + ' · печать этикеток ' + E.printRate().toFixed(1) + ' шт/с · рулон ' + s.chz.labels.length + '/' + rm +
          ' (буфер: ' + s.chz.buffer.length + ')' +
          (s.research.includes('prn_swap') ? ' · автозамена' : '') + low;
      }
      return '⚡ маркировки нет — выберите режим ниже';
    }
    if (kind === 'camera') {
      return s.equip.camera === 'none'
        ? '📸 камеры нет — коды не проверяются'
        : '📸 считывание: ' + E.camSpeed().toFixed(1) + ' кодов/с (улучшения ускоряют) · пропуск: ' + (E.camMiss() * 100).toFixed(1) + '%';
    }
    if (kind === 'rejector') {
      return s.equip.rejector === 'none'
        ? '🗑️ лоток ручной — брак возвращаете сами'
        : '🗑️ брак возвращается сам: до ' + (s.research.includes('rej_duo') ? 2 : 1) + ' раз, задержки нет';
    }
    if (kind === 'server') {
      return s.equip.server === 'none'
        ? '🌐 сервера нет — отчёты только вручную'
        : '🌐 отчёты авто: каждые ' + CFG.BATCH_MAX + ' ед. или раз в ' + CFG.BATCH_TIMER_S + ' с';
    }
    return '🏭 поток линии: ' + E.flowRate().toFixed(2) + ' шт/с · размер партии до ' + E.maxBatchQty() + ' шт' +
      ' · склад ' + E.warehouseMax() + ' мест · рекламации ' + (E.failSaleChance() * 100).toFixed(1) + '%';
  }

  /* дерево прокачки выбранного оборудования — в модальном окне */
  function renderResearch() {
    const s = S();
    const label = $('upgr-label');
    if (label) label.textContent = '🔧 Улучшения: ' + (EQ_LABELS[eqTreeKind] || '?');
    const wrap = $('upgr-list');
    if (!wrap) return;
    wrap.innerHTML = '';

    for (const id of Object.keys(UPGRADES)) {
      const u = UPGRADES[id];
      if (u.eq !== eqTreeKind) continue;
      const maxLevels = u.levels || 1;
      const lv = u.levels && u.levels > 1 ? (s.upgradeLevels[id] || 0) : (s.research.includes(id) ? maxLevels : 0);
      const maxed = lv >= maxLevels;
      const item = document.createElement('div');
      item.className = 'res-item' + (maxed ? ' done' : '');

      const main = document.createElement('div');
      main.className = 'ri-main';
      const nm = document.createElement('div');
      nm.className = 'ri-name';
      // фирменный модельный ряд: ReaderDM100 → ReaderDM200 → …
      const shownName = u.model
        ? u.model + (100 * Math.max(1, lv))
        : u.name;
      nm.textContent = (u.levels && u.levels > 1 && lv > 0 ? 'ур. ' + lv + ' ' : '') + shownName;
      const br = document.createElement('div');
      br.className = 'ri-branch';
      br.textContent = EQ_LABELS[u.eq] + (u.levels && u.levels > 1 ? ' · ' + maxLevels + ' ур.' : '');
      const ds = document.createElement('div');
      ds.className = 'ri-desc';
      ds.textContent = u.desc;
      main.appendChild(nm);
      main.appendChild(br);
      main.appendChild(ds);
      item.appendChild(main);

      const btn = document.createElement('button');
      if (!maxed) {
        const costNow = researchCostFor(u, lv);
        btn.className = 'btn';
        btn.textContent = (u.levels && u.levels > 1 ? fmt(costNow) + ' ₽ · ур. ' + lv + '/' + maxLevels : fmt(costNow) + ' ₽');
        const ok = Game.upgrades.prereqOk(id);
        if (ok) btn.dataset.cost = costNow; // куплено-обновление только для доступных
        btn.disabled = !ok || !E.canAfford(costNow);
        if (!ok) btn.title = 'Требует: ' + reqText(u.req);
        btn.onclick = () => { Game.upgrades.buyResearch(id); renderResearch(); renderEquipment(); };
      } else {
        btn.className = 'btn';
        btn.textContent = '✓';
        btn.disabled = true;
      }
      item.appendChild(btn);
      wrap.appendChild(item);
    }
    if (!wrap.children.length) {
      const empty = document.createElement('div');
      empty.className = 'small';
      empty.textContent = 'Для этого оборудования нет улучшений (или они уже все куплены).';
      wrap.appendChild(empty);
    }
  }

  function reqText(req) {
    const map = {
      camera_installed: 'камеру',
      printer_installed: 'печать этикеток',
      printer_own: 'свой принтер',
      server_installed: 'сервер',
      rejector_installed: 'отбраковщик',
    };
    return map[req] || '—';
  }

  function researchCostFor(u, lv) {
    return Game.upgrades.researchCost(u, lv || 0);
  }

  /* ---------- модалка события ---------- */

  function openEvent(ev) {
    modalOpen = true;
    $('modal-icon').textContent = ev.icon;
    $('modal-title').textContent = ev.name;
    $('modal-text').textContent = ev.text();
    $('modal-close').onclick = closeModal;
    const wrap = $('modal-choices');
    wrap.innerHTML = '';

    ev.choices.forEach((ch, idx) => {
      const btn = document.createElement('button');
      btn.className = 'btn';
      let label = ch.label;
      if (ch.cost) label += ' (−' + fmt(ch.cost) + ' ₽)';
      if (ch.req && !ch.req()) label += ' (нет условий)';
      btn.textContent = label;
      // бесплатный вариант доступен всегда, даже при отрицательном балансе
      btn.disabled = (ch.cost > 0 && ch.cost > S().ir) || (ch.req && !ch.req());
      btn.onclick = () => Game.events.choose(ev, idx);
      wrap.appendChild(btn);
    });

    $('modal').classList.remove('hidden');
  }

  function closeModal() {
    modalOpen = false;
    $('modal').classList.add('hidden');
  }

  function saveRecord() {
    const s = S();
    const rec = Game.records.compute(s);
    Game.records.add({
      date: new Date().toLocaleDateString('ru-RU'),
      product: (s.productType ? s.productType.icon + ' ' + s.productType.name : '—'),
      produced: s.stats.produced,
      marked: s.stats.registered,
      score: rec.score,
      mult: rec.mult,
    });
  }

  function renderRecords() {
    const el = $('records-panel');
    if (!el) return;
    const list = Game.records.load();
    if (!list.length) {
      el.innerHTML = '<div class="small records-empty">Пока нет рекордов — сыграйте партию (счёт зависит от сложности: лёгкий ×0.7, стандарт ×1, хардкор ×3).</div>';
    } else {
      el.innerHTML = list.slice(0, 8).map((r, i) =>
        '<div class="rec-row' + (i === 0 ? ' rec-top' : '') + '">' +
        '<span>' + (i + 1) + '. ' + (r.product || '—') + '</span>' +
        '<span class="small">🏭 ' + r.produced + ' · ✓ ' + r.marked + '</span>' +
        '<b>' + r.score + (r.mult && r.mult !== 1 ? ' ×' + r.mult : '') + '</b>' +
        '<span class="small">' + (r.date || '') + '</span></div>'
      ).join('');
    }
    // кнопка сброса рекордов
    const resetBtn = document.createElement('button');
    resetBtn.className = 'btn btn-debug rec-reset';
    resetBtn.textContent = '🗑 Сбросить рекорды';
    resetBtn.onclick = () => {
      if (window.confirm && !window.confirm('Удалить все рекорды?')) return;
      Game.records.reset();
      renderRecords();
    };
    el.appendChild(resetBtn);
  }

  /* ---------- конец игры / победа ---------- */

  function gameOver(type) {
    const s = S();
    s.phase = 'over';
    Game.running = false;
    Game.state.save();
    saveRecord();
    // после проигрыша лента останавливается пустой — продукция партии была распродана/брошена
    s.boxes.forEach(b => { if (b.el && b.el.parentNode) b.el.parentNode.removeChild(b.el); });
    s.boxes = [];
    s.scrap = [];
    renderScrap();

    const titles = {
      deadline: 'Бизнес закрыт: не успели',
      bankrupt: 'Банкротство',
      audit: 'Аудит не пройден',
    };
    const texts = {
      deadline: 'К Часу Ч вы не внедрили систему Честного знака (нужны принтер, камера и сервер). Партия ушла немаркированной — предприятие закрыто.',
      bankrupt: 'Баланс пробыл в минусе ' + CFG.BANKRUPT_GRACE_S + ' секунд — кредиторы забрали предприятие.',
      audit: 'Доля зарегистрированной продукции не дотянула до 90% (или счёт в минусе). Контракт на маркировку не продлён.',
    };
    $('gameover-title').textContent = titles[type] || 'Бизнес закрыт';
    $('gameover-text').textContent = texts[type] || '';
    $('gameover-stats').innerHTML = recapHTML();
    $('gameover-screen').classList.remove('hidden');
    hideTitle();
  }

  function victory() {
    victoryOpen = true;
    saveRecord();
    $('victory-stats').innerHTML = recapHTML();
    $('victory-screen').classList.remove('hidden');
    hideTitle();
  }

  function recapHTML() {
    const s = S();
    const rows = [
      'Произведено боксов: ' + fmt(s.stats.produced),
      'Промаркировано: ' + fmt(s.stats.marked),
      'Зарегистрировано в ЧЗ: ' + fmt(s.stats.registered),
      'Брак отправлен на перепроверку: ' + fmt(s.stats.defectsCaught),
      'Брак утилизирован: ' + fmt(s.stats.defectsShipped),
      'Продано без регистрации в ЧЗ: ' + fmt(s.stats.unregistered),
      'Всего заработано: ' + rub(s.stats.totalEarned),
      'Штрафы (включая проверки): ' + rub(s.stats.fines),
      'Событий на производстве: ' + s.stats.events,
      'Время работы: ' + mmss(s.t),
      'Счёт: ' + fmt(Game.records.compute(s).score) + ' (множитель ×' + Game.records.compute(s).mult + ')',
    ];
    return rows.map(r => '<div>' + r + '</div>').join('');
  }

  function finishOverlay() {
    victoryOpen = false;
    $('gameover-screen').classList.add('hidden');
    $('victory-screen').classList.add('hidden');
  }

  function hideTitle() {
    $('title-screen').classList.add('hidden');
  }
  function showTitle() {
    renderRecords();
    $('title-screen').classList.remove('hidden');
  }

  function refreshAll() {
    renderEquipment();
    renderResearch();
    renderScrap();
    renderContracts();
    updateOperator();
  }

  return {
    createBoxEl,
    positionBox,
    setBoxState,
    removeBox,
    fx,
    log,
    stage,
    frame,
    renderEquipment,
    renderResearch,
    renderScrap,
    renderContracts,
    selectEq,
    closeUpgradeModal,
    toast,
    openEvent,
    closeModal,
    updateOperator,
    openInspect,
    closeInspect,
    gameOver,
    victory,
    refreshAll,
    finishOverlay,
    hideTitle,
    showTitle,
    setBeltPaused,
    get modalOpen() { return modalOpen; },
    get victoryOpen() { return victoryOpen; },
  };
})();