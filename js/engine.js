/* ================================================================
   engine.js — игровой цикл, конвейер, станции, партии отчётов, фазы
   Производственный поток:
   заказ кодов ЧЗ → печать этикеток → наклейка → сканирование →
   брак-лоток (повторная проверка) → накопитель → отправка партиями
   ================================================================ */

Game.engine = (function () {
  const S = () => Game.S;

  /* ---------- базовые предикаты ---------- */

  function hasResearch(id) { return S().research.includes(id); }
  function hasEffect(id) { return S().effects.some(e => e.id === id && S().t < e.until); }
  function addEffect(id, dur, data) {
    S().effects = S().effects.filter(e => e.id !== id);
    S().effects.push({ id, until: S().t + dur, data: data || {} });
  }
  function pause(sec) { S().pauseUntil = Math.max(S().pauseUntil, S().t + sec); }
  function paused() { return S().serviceBusy > 0 || S().pauseUntil > S().t; }

  function serverUp() {
    const s = S();
    return s.equip.server === 'basic' && s.health.server > 0 && !hasEffect('server_down');
  }

  /* льготный период: первые GRACE_S секунд маркировка не обязательна */
  function requirement() {
    const s = S();
    if (s.phase !== 'prep') return 1;
    if (s.t <= CFG.GRACE_S) return 0;
    const dl = s.deadlineS || CFG.DEADLINE_S;
    if (!isFinite(dl)) {
      // бесконечный режим: требование медленно растёт по времени (10 минут до 100%)
      return clamp((s.t - CFG.GRACE_S) / 600, 0, 1);
    }
    return clamp((s.t - CFG.GRACE_S) / (dl - CFG.GRACE_S), 0, 1);
  }

  function deadlineS() { return S().deadlineS || CFG.DEADLINE_S; }
  function auditS() { return S().auditS || CFG.AUDIT_AT_S; }
  function fineMult() {
    const d = DIFFICULTY[S().difficulty];
    return d ? d.fineMult : 1;
  }

  /* цена продукта: базовая стоимость типа × сорт (градиент «качества продукта») */
  function prodPrice(p, grade) {
    const base = (p && p.value) ? p.value : CFG.BOX_VALUE;
    const mult = (grade && grade.mult) ? grade.mult : 1;
    return base * mult;
  }

  /* сорта продукции: чем выше уровень «Качества продукта», тем чаще дорогие */
  const GRADES = [
    { id: 'common', name: 'обычный', mult: 1 },
    { id: 'premium', name: 'премиум', mult: 1.3 },
    { id: 'lux', name: 'люкс', mult: 1.7 },
    { id: 'elite', name: 'элитный', mult: 2.2 },
  ];
  function gradeWeight(idx, level) {
    if (idx === 0) return Math.max(0.05, 0.6 - 0.05 * level);
    if (idx === 1) return 0.25 + 0.03 * level;
    if (idx === 2) return 0.1 + 0.02 * level;
    return 0.05 + 0.015 * level;
  }
  function gradeWeights(level) {
    return GRADES.map((g, i) => ({ name: g.name, mult: g.mult, w: gradeWeight(i, level) }));
  }
  function rollGrade() {
    const L = upgradeLevel('quality_grade');
    const ws = gradeWeights(L);
    const total = ws.reduce((a, g) => a + g.w, 0);
    let r = Math.random() * total;
    for (const g of ws) { r -= g.w; if (r <= 0) return { name: g.name, mult: g.mult }; }
    return { name: 'обычный', mult: 1 };
  }

  /* истёк ли срок годности продукта (игровое время: months = минут) */
  function isExpired(b) {
    const age = S().t - (b.markedAt || 0);
    return age > b.product.months * 60;
  }

  function unregPenalty() { return requirement() > 0 ? CFG.UNREGISTERED_RATIO : 1; }

  /* доля реально промаркированных продуктов среди последних завершённых (окно 25) */
  function markRatio() {
    const lg = S().stats.markLog;
    if (!lg.length) return 1;
    return lg.reduce((a, x) => a + x.m, 0) / lg.length;
  }

  function shareNow() {
    const log = S().stats.shipLog;
    if (!log.length) return 0;
    return log.reduce((a, x) => a + x.reg, 0) / log.length;
  }

  function streakMult() {
    return 1 + Math.min(S().stats.streak, CFG.STREAK_MAX) * CFG.STREAK_MULT_STEP;
  }

  function defectBonus() { return hasEffect('defect_up') ? 0.25 : 0; }

  /* брак печати этикетки: зависит от источника печати и здоровья модуля */
  function labelDefectChance() {
    const s = S();
    const st = s.equip.printer;
    let d = 0;
    if (st === 'typography') d = CFG.DEFECT_TYPOGRAPHY;
    else if (st === 'own') d = hasResearch('prn_laser') ? 0.01 : CFG.DEFECT_OWN_BASE + (1 - s.health.printer) * 0.25;
    d += defectBonus();
    // «Качество печати»: −0.1% брака за уровень (до 20)
    d -= 0.001 * upgradeLevel('prn_quality');
    return Math.max(0.002, d);
  }

  /* --- возмущение сотрудников при затяжном браке --- */
  const FRUSTRATION = [
    { at: 3, text: 'Опять брак?! Да что ж такое-то… Мать его!', },
    { at: 5, text: 'Кто так этикетки клеит?! Ещё раз — и я уйду на перекур!' },
    { at: 7, text: 'Да ё*аный принтер, опять нах*ярил брак! Я же говорил — г**но это, а не оборудование!' },
    { at: 9, text: 'Это не маркировка, а кошмар. Так и уйдёт вся смена в это ***но!' },
    { at: 12, text: 'Позор, а не завод! Я не робот, чтобы переклеивать вечно! НАХ**Й такую работу!' },
    { at: 15, text: 'ХВАТИТ! Пятнадцатый подряд — я уже вижу этот брак в кошмарах. Всё, я бастую!' },
    { at: 18, text: 'Всё! Пишу заявление. Пусть сами с этим Честным знаком возятся, козлы!' },
    { at: 25, text: 'ЧТО ЗА *** ЭТА МАРК₽ОВКА?! УВОЛЬНЯЮСЬ, НАДОЕЛО, ЗАЕБАЛО!' },
    { at: 35, text: 'Я СЕЙЧАС ПРИНТЕР ЭТОТ ГАЕЧНЫМ КЛЮЧОМ ПОЧИНЮ. ПО НАДЁЖНОСТИ ВОССТАНОВЛЮ, Е**НОЕ ОБОРУДОВАНИЕ!' },
    { at: 50, text: 'Всё, я ухожу. Оставляю вам этот цирк с конями и маркировкой! Ловите сами!' },
  ];

  /* случайная реплика оператора по ситуации (производство — оператор крепкий на язык) */
  const OPERATOR_LINES = {
    strike: [
      '⛔ Да е**ть! Пятнадцатый брак подряд — я НЕ сдвинусь! Сначала переклейте своё г**но!',
      '⛔ Нах**й такую работу! Линия стоит, пока лоток брака не разгребёте, понятно?!',
      '⛔ Я всё. ЗАБАСТОВКА! Разбирайтесь сами, я отдыхаю. Брак ваш — долго не переклеите!',
    ],
    bad: {
      3: '😤 Да что за х**ня?! Опять брак! Я же их клею, клею…',
      5: '😠 Опять?! Принтер ваш — полное г**но, я же предупреждал!',
      8: '😡 Сколько можно?! Это же элементарно — клей, проверь, отпусти! Е**ное производство!',
      12: '🤬 ШВАРЦКОПФ! Двенадцатый подряд! Я сейчас сам на линию пойду и всё руками сделаю!',
      14: '🤬 Ещё один — и я научу камеру материться, б**дь!',
    },
    scrap: [
      '🗑️ Лоток ЗАБИТ! Вы что, свалку тут устроили?! Уберите брак, пока я не сжёг!',
      '🗑️ Мать твою, куда это всё складывать?! Лоток полный — разберитесь!',
    ],
    good: [
      '📤 Ушла партия! Нормальная работа, так бы всегда — и зарплату бы платили нормально…',
      '📤 Приняли! Спасибо, конечно, но это я бонусами не закрою. Хотя бы без брака!',
      '📤 Всё, уехало! Так и крутили бы весь день — пыль бы столбом стояла!',
    ],
  };

  function operatorSay(kind) {
    const lines = OPERATOR_LINES[kind];
    if (!lines) return null;
    return lines[Math.floor(Math.random() * lines.length)];
  }

  /* шанс, что отбраковщик ПРОПУСТИТ бракованный продукт (штраф при продаже).
   Снижается модельным рядом отбраковщиков и двухступенчатой отбраковкой. */
  function rejectorMiss() {
    let m = 0.06 - 0.005 * upgradeLevel('rej_accel');
    if (hasResearch('rej_duo')) m -= 0.02;
    return Math.max(0.005, m);
  }

  function frustrationStep() {
    const s = S();
    // «Учёт брака» и модельный ряд отбраковщиков замедляют злость
    let inc = 1 - 0.05 * upgradeLevel('rej_accel');
    if (hasResearch('rej_order')) inc = Math.min(inc, 0.5);
    s.frustration = (s.frustration || 0) + Math.max(0.1, inc);
    const lvl = FRUSTRATION.find(f => f.at === s.frustration);
    if (lvl) {
      Game.ui.toast('🧑🏭', 'Оператор: «' + lvl.text + '» (брак ' + Math.floor(s.frustration) + ' подряд!)');
      Game.ui.log('😡 Оператор: «' + lvl.text + '»', 'bad');
    }
    // слишком много брака — оператор останавливает производство
    if (s.frustration >= CFG.STRIKE_AT && !s.strike) {
      s.strike = true;
      const re = operatorSay('strike');
      Game.ui.toast('⛔', re || 'Оператор остановил производство: брак зашкаливает! Верните брак на переклейку.');
      Game.ui.log('⛔ ' + (re || 'Оператор остановил производство — пока брак не будет переклеен, новые продукты не пойдут.'), 'bad');
    }
  }

  function checkStrike() {
    const s = S();
    if (!s.strike) return;
    if (s.frustration === 0 || s.scrap.length === 0) {
      s.strike = false;
      Game.ui.log('✅ Оператор вернулся к работе: линия снова выпускает продукцию.', 'good');
    }
  }

  /* ---------- покупки и цены ---------- */

  function costFor(kind) {
    const s = S();
    if (kind === 'printer') {
      if (s.equip.printer === 'typography') return PRINTER_STAGES[2].cost;
      return PRINTER_STAGES[1].cost;
    }
    if (kind === 'camera') {
      let c = CAMERA_STAGES[1].cost;
      if (hasEffect('sale_camera')) c = Math.round(c * 0.8);
      return c;
    }
    if (kind === 'rejector') return REJECTOR_STAGES[1].cost;
    if (kind === 'server') return SERVER_STAGES[1].cost;
    return 0;
  }

  function canAfford(cost) { return S().ir >= cost; }

  /* ---------- здоровье и ремонт оборудования ---------- */

  function wearRateMult() { return hasResearch('prod_support') ? 0.5 : 1; }

  function wearModules(dt) {
    const s = S();
    const prMult = wearRateMult();
    if (s.equip.printer !== 'none' && !hasResearch('prn_laser')) {
      s.health.printer = Math.max(0, s.health.printer - WEAR_RATE * prMult * dt);
    }
    if (hasResearch('prn_autoclean') && s.equip.printer !== 'none' && s.health.printer > 0 && s.health.printer < 0.3) {
      s.health.printer = 0.3; // автоочистка поддерживает здоровье
    }
    for (const k of ['camera', 'rejector', 'server']) {
      if (s.equip[k] !== 'none') s.health[k] = Math.max(0, s.health[k] - WEAR_RATE * wearRateMult() * dt);
    }
  }

  function moduleOk(k) { return S().health[k] > 0; }

  function brokenModules() {
    const s = S();
    const out = [];
    if (s.equip.printer !== 'none' && !moduleOk('printer')) out.push(MODULE_NAMES.printer);
    if (s.equip.camera !== 'none' && !moduleOk('camera')) out.push(MODULE_NAMES.camera);
    if (s.equip.rejector !== 'none' && !moduleOk('rejector')) out.push(MODULE_NAMES.rejector);
    if (s.equip.server !== 'none' && !moduleOk('server')) out.push(MODULE_NAMES.server);
    return out;
  }

  function repairModule(k) {
    const s = S();
    if (s.equip[k] === 'none' || s.health[k] >= 0.99) return false;
    const hard = s.difficulty === 'hard' ? 1.5 : 1;
    let cost;
    let action;
    if (s.health[k] <= 0) {
      // полный выход из строя — покупка нового оборудования
      const stage = Game.upgrades.currentStage(k);
      const base = (stage && stage.cost) ? stage.cost : (REPAIR_COST[k] || 100);
      cost = Math.round(base * hard);
      action = '🆕 Куплено новое оборудование';
    } else {
      // стоимость ремонта зависит от износа: чем хуже, тем дороже
      cost = Math.round((REPAIR_COST[k] || 100) * (1 - s.health[k]) * hard);
      action = '🔧 Отремонтировано';
    }
    if (!canAfford(cost)) {
      Game.ui.log('Не хватает ₽ на ' + ({
        printer: 'ремонт модуля маркировки',
        camera: 'ремонт камеры',
        rejector: 'ремонт отбраковщика',
        server: 'ремонт сервера',
      }[k] || 'ремонт') + '.', 'bad');
      return false;
    }
    s.ir -= cost;
    s.health[k] = 1;
    Game.ui.log(action + ' («' + (MODULE_NAMES[k] || k) + '», −' + fmt(cost) + ' ₽).', 'good');
    Game.ui.refreshAll();
    return true;
  }

  /* ---------- склад готовой продукции ---------- */

  /* вместимость склада: база + «Склад: расширение» (+30 мест за уровень) */
  function warehouseMax() {
    return CFG.WAREHOUSE_MAX + 30 * upgradeLevel('wh_capacity');
  }

  /* шанс «неудачной» продажи (рекламация): база 10%, «Климат-контроль» −1% за уровень */
  function failSaleChance() {
    return Math.max(0.005, 0.1 - 0.01 * upgradeLevel('wh_climate'));
  }

  /* бонус к цене продаж со склада: «Отгрузка без потерь» +2% за уровень */
  function salePriceMult() {
    return 1 + 0.02 * upgradeLevel('wh_trade');
  }

  /* ---------- производство ---------- */

  function upgradeLevel(id) { return S().upgradeLevels[id] || 0; }

  function spawnRateMult() {
    let m = S().lines * (1 + 0.2 * upgradeLevel('spd_accel')); // «Разгон конвейера»
    if (hasResearch('spd_turbo')) m *= CFG.TURBO_MULT;
    if (hasEffect('speed_up')) m *= 1.25;
    if (hasEffect('slow')) m *= 0.7;
    return m;
  }

  function boxSpeed() {
    let v = 0.15; // доля ленты в секунду (проезд ~6.7 с)
    if (hasEffect('slow')) v *= 0.7;
    if (brokenModules().length) v *= 0.85; // линия замедляется у сломанных модулей
    return v;
  }

  const BOX_CSS = { raw: 'raw', coded: 'coded', bad: 'defect', ok: 'ok', missed: 'unreg' };
  function boxClass(b) {
    return 'box ' + (BOX_CSS[b.state] || b.state);
  }

  function makeBox() {
    const s = S();
    const product = s.productType || PRODUCTS[0]; // по конвейеру — только один тип
    const grade = rollGrade();                 // сорт продукции (случайный, зависит от «Качества продукта»)
    const lane = s.lines > 1 ? (Math.random() < 0.5 ? 1 : 2) : 1;
    const top = lane === 1 ? pick([12, 30, 48]) : pick([88, 100, 110]);
    const d = labelDates(s.t, product);
    return {
      id: ++s.boxSeq,
      lane,
      top,
      x: 0,
      code: null,            // код появится из этикетки (пул ЧЗ)
      state: 'raw',
      scanned: false,        // прошёл ли зону сканирования
      passedScan: false,     // успешно ли прочитан
      defectLabel: false,    // наклеена плохая этикетка (не читается)
      foreignCode: false,    // наклеен код чужого продукта
      scanReason: null,      // причина брака (см. BRAK_REASONS)
      recycles: 0,           // сколько раз отбраковщик вернул на переклейку
      markedAt: null,        // момент маркировки (для проверки срока годности)
      prodDate: d.prodDate,  // дата маркировки на упаковке
      expDate: d.expDate,    // срок годности
      grade,                 // сорт: обычный/премиум/люкс/элитный (влияет на цену)
      product,
      el: null,
    };
  }

  function spawnBox() {
    const s = S();
    if (s.strike) return; // оператор остановил производство
    if (s.pending.length >= warehouseMax()) return; // склад заполнен
    if (!rollReady()) { s.rollWaitLogged = true; return; } // рулон этикеток пуст — ждём печать
    s.rollWaitLogged = false;
    const b = makeBox();
    s.stats.produced++;
    b.el = Game.ui.createBoxEl(b);
    s.boxes.push(b);
  }

  /* ручная подача продукта на линию: клик в зоне «Производство» = один продукт */
  function addManualBox() {
    const s = S();
    if (s.phase === 'over') return false;
    if (s.strike) {
      Game.ui.log('⛔ Производство остановлено оператором — сначала переклейте брак.', 'bad');
      return false;
    }
    if (s.pending.length >= warehouseMax()) {
      Game.ui.log('📦 Склад заполнен — сначала продайте или передайте товар заказчику.', 'bad');
      return false;
    }
    if (!rollReady()) {
      Game.ui.log('🗞️ Рулон этикеток кончился — линия ждёт, пока напечатается запас (минимум ' + CFG.STICKER_STOP_AT + ' шт).', 'bad');
      return false;
    }
    const b = makeBox();
    b.x = -0.05 - Math.random() * 0.1;
    s.stats.produced++;
    b.el = Game.ui.createBoxEl(b);
    s.boxes.push(b);
    Game.ui.fx(b, '➕ подано', 'fx-good');
    return true;
  }

  /* ---------- заказ кодов в Честном знаке ---------- */

  function orderCodes() {
    const s = S();
    if (s.chz.ordering) return false;
    if (s.chz.pool.length + s.chz.labels.length >= CFG.POOL_MAX) return false;
    s.chz.ordering = true;
    s.chz.orderDoneAt = s.t + CFG.ORDER_CODE_GEN_S;
    Game.ui.log('📦 Заказано ' + CFG.ORDER_CODE_BATCH + ' кодов DataMatrix в Честном знаке. Генерация: ' + CFG.ORDER_CODE_GEN_S + ' с.', 'info');
    Game.state.save();
    return true;
  }

  function completeOrder() {
    const s = S();
    if (!s.chz.ordering || s.t < s.chz.orderDoneAt) return false;
    s.chz.ordering = false;
    const arr = Array.from({ length: CFG.ORDER_CODE_BATCH }, genDataMatrix);
    s.chz.pool.push(...arr);
    Game.ui.log('✅ Честный знак выдал ' + arr.length + ' кодов. Печатайте этикетки!', 'good');
    return true;
  }

  /* автозаказ кодов ЧЗ: запас на ~100 секунд работы линии.
   При 1 продукте/с порог ≈ 100 штук, при 2 продуктах/с ≈ 200 — заказ всегда идёт заранее */
  function autoOrderThreshold() {
    return Math.max(50, Math.round(flowRate() * 100));
  }

  function autoOrderCheck() {
    const s = S();
    if (!hasResearch('prod_autoorder')) return;
    if (s.chz.ordering) return;
    const stock = s.chz.pool.length + s.chz.labels.length + s.chz.buffer.length;
    if (stock < autoOrderThreshold()) orderCodes();
  }

  /* ---------- печать этикеток (вне ленты, из пула ЧЗ-кодов) ---------- */

  function produceLabels(dt) {
    const s = S();
    if (s.equip.printer !== 'own' || hasEffect('print_off') || !moduleOk('printer')) return;
    let rate = printRate();
    s.chz.printAcc += rate * dt;
    // печать напечатанного кода идёт в БУФЕР; установленный рулон виден отдельно
    const cap = rollMax();
    while (s.chz.printAcc >= 1) {
      if (s.chz.pool.length === 0) break;
      if (s.chz.buffer.length >= cap) break; // буфер полон — печать ждёт установки
      s.chz.printAcc -= 1;
      s.chz.buffer.push(s.chz.pool.shift());
    }
    if (s.chz.printAcc > 2) s.chz.printAcc = 2;
    // «на ленту» ставят, когда запас кончился, а буфер успел накопить этикетки;
// рулон не может превысить вместимость — переносим только до предела
    if (s.chz.labels.length < CFG.STICKER_STOP_AT && s.chz.buffer.length >= CFG.STICKER_STOP_AT) {
      const cap = rollMax();
      const take = Math.min(s.chz.buffer.length, Math.max(0, cap - s.chz.labels.length));
      if (take > 0) {
        s.chz.labels.push(...s.chz.buffer.splice(0, take));
        Game.ui.log('🔄 ' + (hasResearch('prn_swap') ? 'Автозамена рулона: ' : 'Установлен рулон из буфера: ') +
          s.chz.labels.length + ' этикеток' + (s.chz.buffer.length ? ', буфер: ' + s.chz.buffer.length : '') + '.', 'info');
      }
    }
  }

  /* скорость проклейки: человек (0.5 + 0.25/ур навыка), а принтер-аппликатор клеит СВЕРХУ
   со скоростью печати — итоговая = сумма обеих проклеек */
  function stickerRate() {
    const s = S();
    if (s.equip.printer === 'typography') return 999; // подрядчик кодирует сразу
    if (s.equip.printer !== 'own') return 0;
    const mult = productSpeedMult();
    const human = (CFG.STICKER_BASE_RATE + CFG.STICKER_SKILL_STEP * upgradeLevel('sticker_skill')) * mult;
    if (hasResearch('prn_applicator')) return printRate() + human; // принтер + человек
    return human;
  }

  /* ёмкость рулона: базово 90; «Принтер-аппликатор» — 200 + 133 за уровень (макс 600) */
  function rollMax() {
    if (hasResearch('prn_applicator')) {
      return Math.min(CFG.APPLICATOR_MAX, CFG.APPLICATOR_ROLL + CFG.APPLICATOR_STEP * upgradeLevel('prn_rollsize'));
    }
    return CFG.ROLL_MAX;
  }

  /* скорость печати этикеток (своим принтером) в штуках в секунду (быстрее для дешёвого продукта).
   «Принтер-аппликатор» печатает и клеит сам, но в 2 раза медленнее (выход этикеток/нанесение DM) */
  function printRate() {
    let rate = CFG.PRINT_RATE_OWN * (1 + 0.25 * upgradeLevel('prn_accel'));
    if (hasResearch('prod_fastprint')) rate *= CFG.FASTPRINT_MULT;
    if (hasResearch('prn_tape')) rate *= CFG.TAPE_MULT;
    if (hasResearch('prn_applicator')) rate *= 0.5;
    return rate * productSpeedMult();
  }

  /* скорость линии по типу продукта: квадрат отношения цен — консервы ×1,
   при разнице в цене в 2 раза линия идёт в 4 раза быстрее */
  function productSpeedMult() {
    const v = ((S().productType || PRODUCTS[0]).value) || CFG.BOX_VALUE;
    const ratio = BASE_PRODUCT_VALUE / v;
    return clamp(ratio * ratio, 1, 8);
  }

  /* можно ли запускать продукт на линию: у собственного принтера должен быть запас этикеток.
     До обязательной маркировки рулон не критичен — линия не останавливается */
  function rollReady() {
    const s = S();
    if (s.equip.printer !== 'own') return true;
    if (requirement() === 0) return true;
    return s.chz.labels.length >= CFG.STICKER_STOP_AT;
  }

  /* поток линии: сколько продукции выходит в секунду (зависит от типа продукта) */
  function flowRate() {
    return spawnRateMult() * productSpeedMult() / CFG.BASE_SPAWN_S;
  }

  /* ---------- станции ленты ---------- */

  function processBox(b) {
    // СТАНЦИЯ 1: зона наклейки (0.18–0.36): авто (подрядчик/наклейщик) или вручную кнопкой
    if (b.state === 'raw' && b.x >= 0.18 && b.x <= CFG.CLICK_ZONE_MAX) tryAutoStick(b);
    // СТАНЦИЯ 2: проверка кода камерой (0.42–0.60) — ограничена скоростью считывания
    if (!b.scanned && b.x >= CFG.SCAN_ZONE_MIN) {
      if (S().equip.camera === 'basic' && moduleOk('camera')) {
        if (S().camBudget >= 1) { S().camBudget -= 1; doScan(b); }
      } else {
        doScan(b); // без камеры проверки нет — бокс проезжает сразу
      }
    }
    // СТАНЦИЯ 3: модуль ОТБРАКОВКИ (0.62–0.72): брак «скатывается» с ленты
    if (b.state === 'bad' && b.x >= 0.64) handleBadBox(b);
  }

  /* скорость считывания камеры: кодов в секунду (база 4, +20%/модель, «Промышленное освещение» +25%) */
  function camSpeed() {
    let sp = CFG.CAM_SPEED_BASE * (1 + 0.2 * upgradeLevel('cam_accel'));
    if (hasResearch('cam_light')) sp *= 1.25;
    return sp;
  }

  /* брак, не прошедший проверку: авто-возврат (отбраковщик) или модуль отбраковки */
  function handleBadBox(b) {
    const s = S();
    s.boxes = s.boxes.filter(x => x !== b);
    Game.ui.removeBox(b);

    if (b.scanReason === 'expired') {
      s.stats.defectsShipped++;
      Game.ui.fx(b, '🕳️ утиль', 'fx-bad');
      Game.ui.log('🕳️ Продукт с истёкшим сроком годности утилизирован.', 'bad');
      return;
    }

    // отбраковщик иногда ПРОПУСКАЕТ брак: продукт уходит в отгрузку со штрафом −15%
    if (s.equip.rejector === 'basic' && moduleOk('rejector') && Math.random() < rejectorMiss()) {
      b.state = 'ok';
      b.passedScan = true;
      b.rejectMissed = true;
      Game.ui.setBoxState(b);
      Game.ui.fx(b, '⚠️ проскочил', 'fx-bad');
      Game.ui.log('⚠️ Брак проскочил мимо отбраковщика! Будет продан со штрафом −15% (улучшайте отбраковку).', 'bad');
      return;
    }

    s.stats.streak = 0; // любая неудачная маркировка сбрасывает «Наценку»
    s.stats.badStreak++; // счётчик брака ПОДРЯД (сбрасывается удачной проверкой)
    const rage = OPERATOR_LINES.bad[s.stats.badStreak];
    if (rage) Game.ui.log('🧑‍🏭 Оператор: «' + rage + '»', 'bad');
    frustrationStep();
    const rejLimit = hasResearch('rej_duo') ? 2 : 1;
    if (s.equip.rejector === 'basic' && moduleOk('rejector') && b.recycles < rejLimit) {
      b.recycles++;
      reenterBox(b);
      return;
    }
    if (s.scrap.length >= 12) {
      s.stats.defectsShipped++;
      const sc = operatorSay('scrap');
      Game.ui.log(sc || '🗑️ Модуль отбраковки переполнен — продукт утилизирован.', 'bad');
    } else {
      s.stats.defectsCaught++;
      s.scrap.push({
        product: b.product, code: b.code, icon: b.product.icon,
        defectLabel: b.defectLabel,
        scanReason: b.scanReason || 'quality',
        prodDate: b.prodDate, expDate: b.expDate,
      });
      Game.ui.renderScrap();
    }
  }

  function stickLabel(b) {
    const s = S();
    if (b.state !== 'raw' || s.chz.labels.length === 0) return false;
    b.code = s.chz.labels.pop();
    b.markedAt = s.t; // момент маркировки = старт отсчёта срока годности
    s.stats.marked++;
    // подрядчик берёт в 3 раза дороже (печать + наклейка)
    if (s.equip.printer === 'typography') s.ir -= CFG.TYPO_MARK_FEE * 3;
    // пока маркировка не обязательна, брак за качество кода не имеет смысла
    b.defectLabel = requirement() > 0 && Math.random() < labelDefectChance();
    b.foreignCode = requirement() > 0 && Math.random() < CFG.FOREIGN_CODE_CHANCE;
    b.state = b.defectLabel ? 'bad' : 'coded';
    Game.ui.setBoxState(b);
    if (b.defectLabel) {
      b.scanReason = 'quality';
      Game.ui.log('🖨️ Наклеена этикетка с нечитаемым кодом — камера отправит её в брак (ПО «Чёткость»).', 'hot');
    }
    return true;
  }

  /* типография печатает код DM прямо на продукт (этикетки не нужны) */
  function inlineMark(b) {
    const s = S();
    if (s.chz.pool.length === 0) return false;
    b.code = s.chz.pool.shift();
    b.markedAt = s.t;
    s.stats.marked++;
    s.ir -= CFG.TYPO_MARK_FEE * 3; // подрядчик: каждый код ×3
    b.defectLabel = requirement() > 0 && Math.random() < labelDefectChance();
    b.foreignCode = requirement() > 0 && Math.random() < CFG.FOREIGN_CODE_CHANCE;
    b.state = b.defectLabel ? 'bad' : 'coded';
    Game.ui.setBoxState(b);
    if (b.defectLabel) {
      b.scanReason = 'quality';
      Game.ui.log('🖨️ Типография нанесла нечитаемый код — при проверке уйдёт в брак (ПО «Чёткость»).', 'hot');
    }
    return true;
  }

  /* авто-маркировка: типография кодирует сразу; свой принтер — оператор клеит этикетки (медленно) */
  function tryAutoStick(b) {
    const s = S();
    if (!moduleOk('printer')) return;
    if (s.equip.printer === 'typography') { inlineMark(b); return; }
    // свой принтер: оператор (или нанятый наклейщик) клеит по мере сил
    if (s.stickerAcc >= 1) { s.stickerAcc -= 1; stickLabel(b); }
  }

  function markBrak(b, reason) {
    b.state = 'bad';
    b.scanReason = reason;
    Game.ui.setBoxState(b);
  }

  /* камера иногда «не прочитывает» код; «Разгон камеры» снижает пропуски,
   «Промышленное освещение» — ещё на 25%; быстрый дешёвый продукт сканируется быстрее (пропусков меньше) */
  function camMiss() {
    let m = Math.max(0.002, CFG.CAM_MISS_BASE - CFG.CAM_MISS_STEP * upgradeLevel('cam_accel'));
    if (hasResearch('cam_light')) m *= 0.75;
    m /= productSpeedMult();
    return Math.max(0.002, m);
  }

  function doScan(b) {
    const s = S();
    b.scanned = true;
    // срок годности важен всегда: просроченное — в утиль
    if (isExpired(b)) {
      markBrak(b, 'expired');
      Game.ui.log('🕳️ Срок годности истёк (маркировка ' + b.prodDate + ') — продукт в утиль.', 'bad');
      return;
    }
    // во время подготовки (до обязательной маркировки) брак за чтение DM не имеет смысла
    if (requirement() === 0) { b.passedScan = false; return; }
    // без камеры или при сломанной — проверки нет: код не подтверждён
    if (s.equip.camera !== 'basic' || !moduleOk('camera')) { b.passedScan = false; return; }
    if (hasEffect('camera_off')) { b.passedScan = false; Game.ui.setBoxState(b); return; }

    // отсутствие кода на контроле — брак (после льготного периода)
    if (b.state === 'raw') {
      b.passedScan = false;
      if (requirement() > 0) {
        markBrak(b, 'missing');
        Game.ui.log('🚫 Продукт без кода на этапе контроля — брак «отсутствие кода».', 'bad');
      }
      return;
    }
    if (b.state !== 'coded') { b.passedScan = false; return; }

    // вторая линия без широкого объектива не проверяется
    if (b.lane === 2 && !hasResearch('cam_wide')) {
      b.passedScan = false;
      Game.ui.setBoxState(b);
      return;
    }
    // турбо без буфера теряет коды
    if (hasResearch('spd_turbo') && !hasResearch('sw_buffer') && Math.random() < CFG.TURBO_MISS) {
      b.state = 'missed';
      Game.ui.setBoxState(b);
      Game.ui.log('📷 Сканер не успел прочитать код (нужен буфер памяти).', 'hot');
      return;
    }
    // дубль: этот код уже отправлен в ЧЗ
    if (s.sentCodes.includes(b.code)) {
      markBrak(b, 'dup');
      Game.ui.log('♻️ Код уже отправлялся в ЧЗ — дубль DataMatrix! Нужна переклейка.', 'bad');
      return;
    }
    // код чужого продукта
    if (b.foreignCode) {
      markBrak(b, 'foreign');
      Game.ui.log('🏷️ Наклеен код чужого продукта — требуется переклейка.', 'bad');
      return;
    }
    // плохое качество кода: ловится только ПО «Чёткость распознавания»
    if (b.defectLabel) {
      if (hasResearch('cam_software')) {
        markBrak(b, 'quality');
        Game.ui.log('🚫 Код на этикетке не читается — брак «плохое качество кода».', 'bad');
      } else {
        b.state = 'ok';
        b.passedScan = true;
        Game.ui.setBoxState(b);
        Game.ui.log('⚠️ Камера пропустила смазанный код (купите ПО «Чёткость»).', 'hot');
      }
      return;
    }
    // истёк срок годности — в утиль (перемаркировка не поможет)
    if (isExpired(b)) {
      markBrak(b, 'expired');
      Game.ui.log('🕳️ Срок годности истёк (маркировка ' + b.prodDate + ') — продукт в утиль.', 'bad');
      return;
    }
    // камера «не прочитала» код — ложный брак, перепроверка поможет
    if (Math.random() < camMiss()) {
      markBrak(b, 'scan');
      Game.ui.log('📷 Камера не прочитала код — продукт уходит на перепроверку (разгон камеры снижает пропуски).', 'hot');
      return;
    }
    b.state = 'ok';
    b.passedScan = true;
    s.stats.badStreak = 0; // удачная проверка обнуляет серию брака
    Game.ui.setBoxState(b);
  }

  function finalizeBox(b) {
    const s = S();
    s.boxes = s.boxes.filter(x => x !== b);
    Game.ui.removeBox(b);

    // реальный след каждого продукта: был ли на нём код DM (для чипа «Промаркировано»)
    s.stats.markLog.push({ m: b.code ? 1 : 0 });
    while (s.stats.markLog.length > 25) s.stats.markLog.shift();

    if (b.state === 'bad') { handleBadBox(b); return; } // запасной путь (обычно снимается в 0.64)

    if (b.state === 'ok') {
      // ждёт отправки отчёта партией / передачи в контракт (проскочивший брак — со штрафом при продаже)
      s.pending.push({
        product: b.product, code: b.code, icon: b.product.icon, grade: b.grade,
        rejectMissed: b.rejectMissed === true,
        defect: b.defectLabel === true, // мыльный DM, который камера НЕ поймала (вернётся покупателем)
      });
      Game.ui.updateOperator();
      return;
    }

    // ТОВАР НЕ ПРОШЁЛ ПРОВЕРКУ (без кода / код потерян / не проверен камерой).
    // После введения обязательной маркировки он не продаётся НИКАК — только перемаркировка.
    if (requirement() > 0) {
      markBrak(b, 'missing');
      handleBadBox(b);
      return;
    }

    // ЛЬГОТНЫЙ ПЕРИОД: продукция продаётся без маркировки по полной цене (с учётом сорта)
    let val = prodPrice(b.product, b.grade) * streakMult();
    if (hasResearch('spd_autoship')) val *= (1 + CFG.AUTO_SHIP_BONUS);
    if (hasEffect('profit_x15')) val *= 1.5;
    s.ir += val;
    s.stats.totalEarned += val;
    s.stats.sold++;
    s.stats.unregistered++;
    s.stats.streak = Math.min(CFG.STREAK_MAX, s.stats.streak + 1);
    s.stats.shipLog.push({ reg: 0, t: s.t });
    Game.ui.fx(b, '💵 +' + fmt(val), 'fx-good');
    while (s.stats.shipLog.length > CFG.COMPLIANCE_WINDOW) s.stats.shipLog.shift();
  }

  /* ---------- повторная проверка брака ---------- */

  function reenterBox(b) {
    const s = S();
    // возврат на переклейку: код снимается, продукт едет к зоне наклейки
    b.state = 'raw';
    b.code = null;
    b.scanned = false;
    b.passedScan = false;
    b.scanReason = null;
    b.defectLabel = false;
    b.foreignCode = false;
    b.x = CFG.STICK_RETRY_X;
    b.lane = 1;
    b.top = pick([12, 30, 48]);
    b.el = Game.ui.createBoxEl(b);
    s.boxes.push(b);
    Game.ui.fx(b, '↩️ на переклейку', 'fx-good');
    Game.ui.log('↩️ Брак возвращён к зоне наклейки (авто-перепроверка).', 'info');
  }

  function recycleAll() {
    const s = S();
    if (!s.scrap.length) return false;
    const list = s.scrap.splice(0, s.scrap.length);
    for (const u of list) {
      const b = makeBox();
      b.product = u.product;
      b.prodDate = u.prodDate || b.prodDate;
      b.expDate = u.expDate || b.expDate;
      b.state = 'raw';
      b.code = null;             // код снят — нужна новая этикетка
      b.scanned = false;
      b.passedScan = false;
      b.recycledOnce = true;
      b.x = CFG.STICK_RETRY_X + Math.random() * 0.06;
      b.el = Game.ui.createBoxEl(b);
      s.boxes.push(b);
    }
    Game.ui.renderScrap();
    Game.ui.log('↩️ ' + list.length + ' ед. брака плавно переехали к зоне наклейки (переклейка).', 'info');
    return true;
  }

  /* ---------- контракты заказчиков ---------- */

  const CUSTOMERS = [
    { icon: '🛒', name: 'Супермаркет «Солнышко»' },
    { icon: '🏪', name: 'Магазинчик у дома' },
    { icon: '🛒', name: 'Сеть «ВкусFull»' },
    { icon: '🏬', name: 'Гипермаркет «Море»' },
    { icon: '🚚', name: 'Кооператив «Урожай»' },
  ];
  const MODULE_NAMES = { printer: 'Маркировка', camera: 'Проверка', rejector: 'Отбраковка', server: 'Отчёты' };

  function dueDateText(t) {
    const daysPassed = Math.floor(t / 60);
    const month = 10 + Math.floor(daysPassed / 28);
    const day = 15 + (daysPassed % 28);
    const mm = String(((month - 1) % 12) + 1).padStart(2, '0');
    const dd = String(Math.min(day, 28)).padStart(2, '0');
    return dd + '.' + mm + '.' + (25 + Math.floor((month - 1) / 12));
  }

  function generateContract() {
    const s = S();
    if (s.phase === 'over' || s.contracts.length > 0 || s.t < s.nextContractAt) return;
    const c = pick(CUSTOMERS);
    const product = s.productType || PRODUCTS[0]; // контракты — только для продукта завода
    const qty = Math.round(rand(CFG.CONTRACT_QTY_MIN, CFG.CONTRACT_QTY_MAX));
    const due = s.t + rand(CFG.CONTRACT_DUE_MIN_S, CFG.CONTRACT_DUE_MAX_S);
    const reward = Math.round(prodPrice(product) * qty * CFG.CONTRACT_REWARD_MULT);
    s.contracts.push({
      id: ++s.contractSeq,
      icon: c.icon,
      customer: c.name,
      product,
      qty,
      dueAt: due,
      dueText: dueDateText(due),
      reward,
      delivered: 0,
      done: false,
    });
    // партия теперь собирается ПОД контракт
    s.batch.qty = qty;
    Game.ui.log('🏭 Новый заказчик: «' + c.name + '». Производственная партия назначена под контракт: соберите ' + qty + ' шт.', 'good');
    s.nextContractAt = s.t + CFG.CONTRACT_COOLDOWN_S;
    Game.ui.log('🛒 Новый контракт: ' + c.name + ' ждёт ' + qty + ' упаковок ' + product.name.toLowerCase() + ' до ' + dueDateText(due) + '.', 'good');
    Game.ui.renderContracts();
  }

  function checkContracts() {
    const s = S();
    let changed = false;
    for (let i = s.contracts.length - 1; i >= 0; i--) {
      const c = s.contracts[i];
      if (c.done) { s.contracts.splice(i, 1); changed = true; continue; }
      if (s.t >= c.dueAt && c.delivered < c.qty) {
        s.ir -= CFG.CONTRACT_FAIL_FINE;
        s.stats.fines += CFG.CONTRACT_FAIL_FINE;
        Game.ui.log('📉 Срок контракта с ' + c.customer + ' истёк — заказчик ушёл к конкуренту. Штраф −' + CFG.CONTRACT_FAIL_FINE + ' ₽.', 'bad');
        s.contracts.splice(i, 1);
        changed = true;
      }
    }
    // перерисовываем карточки только при изменениях (иначе кнопки не кликаются!)
    if (changed) Game.ui.renderContracts();
  }

  function activeContract() {
    return S().contracts.length > 0;
  }

  function deliverToContract(idx) {
    const s = S();
    const c = s.contracts[idx];
    if (!c) return false;
    const need = c.qty - c.delivered;
    const take = Math.min(need, s.pending.length);
    if (take <= 0) return false;
    const items = s.pending.splice(0, take);
    c.delivered += take;

    let missLogged = false;
    let failLogged = false;
    let sum = 0;
    for (const u of items) {
      s.stats.registered++;
      s.sentCodes.push(u.code);
      if (s.sentCodes.length > 1200) s.sentCodes.shift();
      let val = prodPrice(u.product, u.grade) * streakMult();
      if (u.rejectMissed) {
        val *= 0.85; // штраф за проскочивший брак
        if (!missLogged) {
          missLogged = true;
          Game.ui.log('⚠️ Заказчику ушёл брак, проскочивший отбраковку: скидка −15%.', 'bad');
        }
      }
      val *= salePriceMult(); // «Отгрузка без потерь»: +2% за уровень
      if (Math.random() < failSaleChance()) {
        val *= 0.8; // рекламация со склада
        if (!failLogged) {
          failLogged = true;
          Game.ui.log('💔 Одна из позиций вернулась рекламацией: −20% (климат-контроль помогает).', 'bad');
        }
      }
      if (hasResearch('spd_autoship')) val *= (1 + CFG.AUTO_SHIP_BONUS);
      if (hasEffect('profit_x15')) val *= 1.5;
      s.ir += val;
      s.stats.totalEarned += val;
      s.stats.sold++;
      // мыльный DM, проскочивший камеру, «обнаруживается» покупателем: возврат = штраф
      if (u.defect && Math.random() < CFG.RETURN_BAD_CHANCE) {
        s.ir -= val;
        s.stats.totalEarned -= val;
        s.stats.returns++;
        if (!retLogged) {
          retLogged = true;
          Game.ui.log('↩️ Покупатель вернул товар с мыльным DM (−' + fmt(val) + ' ₽). Камера с ПО «Чёткость» ловит такие раньше.', 'bad');
        }
      }
      s.stats.streak = Math.min(CFG.STREAK_MAX, s.stats.streak + 1);
      s.stats.shipLog.push({ reg: 1, t: s.t });
      sum += val;
    }
    while (s.stats.shipLog.length > CFG.COMPLIANCE_WINDOW) s.stats.shipLog.shift();
    s.frustration = 0; // удачная поставка успокаивает сотрудников

    Game.ui.log('🛒 ' + c.customer + ': передано ' + take + ' упаковок (+' + fmt(sum) + ' ₽, всего ' + c.delivered + '/' + c.qty + ').', 'good');
    if (c.delivered >= c.qty) {
      c.done = true;
      s.ir += c.reward;
      s.stats.totalEarned += c.reward;
      Game.ui.toast('🤝', 'Контракт с ' + c.customer + ' выполнен: бонус +' + fmt(c.reward) + ' ₽!');
      Game.ui.log('🏆 Контракт с ' + c.customer + ' выполнен! Бонус +' + fmt(c.reward) + ' ₽.', 'good');
    }
    Game.ui.renderContracts();
    return true;
  }

  /* ---------- производственные партии ---------- */

  function maxBatchQty() {
    // лимит партии растёт с производительностью линии
    return Math.min(CFG.BATCH_MAX_QTY, CFG.BATCH_MIN_QTY + Math.ceil(spawnRateMult() * 55));
  }

  function changeBatchQty(delta) {
    const s = S();
    const max = maxBatchQty();
    s.batch.qty = clamp(s.batch.qty + delta, CFG.BATCH_MIN_QTY, max);
    Game.ui.updateOperator();
    return s.batch.qty;
  }

  function batchInfo() {
    const s = S();
    return {
      no: s.batch.no,
      qty: s.batch.qty,
      done: Math.min(s.stats.produced - s.batch.start.produced, s.batch.qty),
      max: maxBatchQty(),
    };
  }

  function checkBatch() {
    const s = S();
    const doneProduced = s.stats.produced - s.batch.start.produced;
    if (doneProduced < s.batch.qty) return;
    // собранная партия сразу закрывает контракт, под который собиралась
    if (s.contracts.length && !s.contracts[0].done) deliverToContract(0);
    const res = {
      produced: doneProduced,
      registered: s.stats.registered - s.batch.start.registered,
      earned: Math.round(s.stats.totalEarned - s.batch.start.earned),
    };
    s.batch.no++;
    s.batch.start = {
      produced: s.stats.produced,
      marked: s.stats.marked,
      registered: s.stats.registered,
      earned: s.stats.totalEarned,
    };
    // следующий размер: под активный контракт — его остаток; иначе произвольный, по производительности
    const c = s.contracts[0];
    s.batch.qty = (c && !c.done) ? Math.max(1, c.qty - c.delivered) : autoBatchQty();
    Game.ui.toast('🏭', 'Партия №' + (s.batch.no - 1) + ' (' + res.produced + ' шт) выполнена: промаркировано ' + res.registered + ', доход +' + fmt(res.earned) + ' ₽.');
    Game.ui.log('🏭 Партия №' + (s.batch.no - 1) + ' завершена → партия №' + s.batch.no + '. Произведено ' + res.produced + ', промаркировано ' + res.registered + ', доход +' + fmt(res.earned) + ' ₽.', 'good');
    Game.ui.updateOperator();
  }

  /* произвольный размер партии без контракта: в рамках производительности линии */
  function autoBatchQty() {
    const max = maxBatchQty();
    const randPick = 0.6 + Math.random() * 0.4;
    return Math.max(CFG.BATCH_MIN_QTY, Math.min(max, Math.round(max * randPick)));
  }

  /* ---------- отчёты партиями ---------- */

  function sellBatch(manual) {
    const s = S();
    if (!s.pending.length) return false;
    if (!manual && !serverUp()) return false;
    const list = s.pending;
    const canReg = manual || serverUp();
    let regCount = 0;
    let sum = 0;
    let missLogged = false;
    let failLogged = false;
    let retLogged = false;
    for (const u of list) {
      if (canReg) {
        s.stats.registered++;
        regCount++;
        s.sentCodes.push(u.code);
        if (s.sentCodes.length > 1200) s.sentCodes.shift();
      }
      else s.stats.unregistered++;

      let val = prodPrice(u.product, u.grade) * streakMult() * (canReg ? 1 : unregPenalty());
      if (u.rejectMissed) {
        val *= 0.85; // штраф за проскочивший брак
        if (!missLogged) {
          missLogged = true;
          Game.ui.log('⚠️ В партии оказался брак, проскочивший отбраковку: продано со штрафом −15%.', 'bad');
        }
      }
      val *= salePriceMult(); // «Отгрузка без потерь»: +2% за уровень
      if (Math.random() < failSaleChance()) {
        val *= 0.8; // товар вернулся рекламацией
        if (!failLogged) {
          failLogged = true;
          Game.ui.log('💔 Часть партии вернулась со склада рекламацией: −20% к цене (климат-контроль помогает).', 'bad');
        }
      }
      if (hasResearch('spd_autoship')) val *= (1 + CFG.AUTO_SHIP_BONUS);
      if (hasEffect('profit_x15')) val *= 1.5;
      s.ir += val;
      s.stats.totalEarned += val;
      s.stats.sold++;
      // мыльный DM, проскочивший камеру, «обнаруживается» покупателем: возврат = штраф
      if (u.defect && Math.random() < CFG.RETURN_BAD_CHANCE) {
        s.ir -= val;
        s.stats.totalEarned -= val;
        s.stats.returns++;
        if (!retLogged) {
          retLogged = true;
          Game.ui.log('↩️ Покупатель вернул товар с мыльным DM (−' + fmt(val) + ' ₽). Камера с ПО «Чёткость» ловит такие раньше.', 'bad');
        }
      }
      s.stats.streak = Math.min(CFG.STREAK_MAX, s.stats.streak + 1);
      s.stats.shipLog.push({ reg: canReg ? 1 : 0, t: s.t });
      sum += val;
    }
    while (s.stats.shipLog.length > CFG.COMPLIANCE_WINDOW) s.stats.shipLog.shift();
    s.pending = [];
    s.batchNo++;
    s.frustration = 0; // успешная продажа успокаивает сотрудников
    Game.ui.log('📤 Партия №' + s.batchNo + ' продана на рынок: ' + list.length + ' ед., зарегистрировано ' + regCount + ', +' + fmt(sum) + ' ₽.',
      canReg ? 'good' : 'hot');
    const cheer = operatorSay('good');
    if (cheer && Math.random() < 0.6) Game.ui.log('🧑‍🏭 Оператор: «' + cheer + '»', 'good');
    Game.ui.updateOperator();
    return true;
  }

  function manualBatchSend() {
    const s = S();
    if (!s.pending.length) return false;
    s.batchSendCd = 0.5;
    return sellBatch(true);
  }

  /* ---------- ручные (кликерные) действия ---------- */

  function getOpTargets() {
    const s = S();
    return {
      stick: s.boxes.find(b => b.state === 'raw' && b.x <= CFG.CLICK_ZONE_MAX && b.x >= 0.05),
      scan: s.boxes.find(b => !b.scanned && b.x >= CFG.SCAN_ZONE_MIN && b.x <= CFG.SCAN_ZONE_MAX),
    };
  }

  function manualStick(b) {
    const s = S();
    if (!b || b.state !== 'raw' || b.x > CFG.CLICK_ZONE_MAX || s.manualCd > 0) return false;
    if (s.chz.labels.length === 0) {
      Game.ui.log('🏷️ Этикеток нет: закажите коды в ЧЗ и дождитесь печати.', 'bad');
      return false;
    }
    s.manualCd = CFG.MANUAL_STICK_CD_S;
    if (stickLabel(b)) {
      Game.ui.fx(b, '🏷️ этикетка наклеена', 'fx-good');
      return true;
    }
    return false;
  }

  function servicePrinter() {
    const s = S();
    if (s.equip.printer !== 'own') return;
    if (s.printerWear < 0.05) return;
    if (!canAfford(CFG.SERVICE_COST)) {
      Game.ui.log('Не хватает ₽ на обслуживание принтера.', 'bad');
      return;
    }
    s.ir -= CFG.SERVICE_COST;
    s.printerWear = 0;
    s.serviceBusy = CFG.SERVICE_PAUSE_S;
    Game.ui.log('🔧 Принтер обслужен. Линия стоит ' + CFG.SERVICE_PAUSE_S + ' с. Брак вернулся к норме.', 'good');
  }

  /* ---------- контрольные точки и штрафы ---------- */

  function complianceTick(dt) {
    const s = S();
    s.cCheckAcc = (s.cCheckAcc || 0) + dt;
    if (s.cCheckAcc < CFG.COMPLIANCE_CHECK_EVERY_S) return;
    s.cCheckAcc = 0;
    if (s.phase === 'over') return;

    const req = requirement();
    const share = shareNow();
    if (req > 0 && share + 0.001 < req) {
      const fine = Math.round(CFG.PREP_FINE * fineMult());
      s.ir -= fine;
      s.stats.fines += fine;
      Game.ui.log('🚨 Проверка партии: регистрация ' + Math.round(share * 100) + '% при требовании ' + Math.round(req * 100) + '%. Штраф −' + fine + ' ₽.', 'bad');
    }
  }

  function checkGrace() {
    const s = S();
    if (s.graceDone || s.phase !== 'prep') return;
    if (s.t < CFG.GRACE_S) return;
    s.graceDone = true;
    Game.ui.log('🚨 Обязательная цифровая маркировка введена! Требование ЧЗ начнёт расти — внедряйте систему.', 'bad');
    Game.ui.stage('Обязательная маркировка введена — внедряйте ЧЗ!');
  }

  function checkDeadline() {
    const s = S();
    if (s.deadlineDone) return;
    if (s.t < deadlineS()) return;
    s.deadlineDone = true;
    if (s.phase !== 'prep') return;

    const ok = s.equip.printer !== 'none' && s.equip.camera !== 'none' && s.equip.server !== 'none';
    if (ok) {
      s.phase = 'post';
      Game.ui.log('🎉 Час Ч наступил, система Честного знака внедрена! До аудита 5 минут.', 'good');
      Game.ui.stage('Фаза II · Работа под ЧЗ — готовьтесь к аудиту');
    } else {
      Game.ui.gameOver('deadline');
    }
  }

  function checkAudit() {
    const s = S();
    if (s.auditDone) return;
    if (s.t < auditS()) return;
    s.auditDone = true;
    if (s.phase !== 'post') return;

    const share = shareNow();
    if (share >= CFG.AUDIT_SHARE_REQ && s.ir >= 0) {
      s.phase = 'won';
      Game.state.save();
      Game.ui.victory();
    } else {
      Game.ui.gameOver('audit');
    }
  }

  function checkBankrupt() {
    const s = S();
    if (s.phase === 'over' || s.phase === 'won') return;
    if (s.ir < CFG.BANKRUPT_AT) Game.ui.gameOver('bankrupt');
  }

  function checkNegativeBalance(dt) {
    const s = S();
    if (s.phase === 'over' || s.phase === 'won') return;
    if (s.ir < 0) {
      if (s.negTimer === 0) Game.ui.log('⚠️ Баланс отрицательный! Исправьте за ' + CFG.BANKRUPT_GRACE_S + ' секунд, иначе банкротство.', 'bad');
      s.negTimer += dt;
      if (s.negTimer >= CFG.BANKRUPT_GRACE_S) Game.ui.gameOver('bankrupt');
    } else {
      s.negTimer = 0;
    }
  }

  function autoSave(dt) {
    const s = S();
    s.saveAcc = (s.saveAcc || 0) + dt;
    if (s.saveAcc >= CFG.SAVE_EVERY_S) {
      s.saveAcc = 0;
      Game.state.save();
    }
  }

  /* ---------- главный тик ---------- */

  function tick(dt) {
    const s = S();
    if (!Game.running || s.phase === 'over') return;
    if (Game.ui.modalOpen || Game.ui.victoryOpen) return;
    s.t += dt;
    s.manualCd = Math.max(0, s.manualCd - dt);
    s.batchSendCd = Math.max(0, s.batchSendCd - dt);
    s.serviceBusy = Math.max(0, s.serviceBusy - dt);

    // износ модулей оборудования + «руки» наклейщика (свой принтер — клейка всегда идёт,
// но медленно; «Наклейщик» ускоряет, при поломке печати этикеток нет — клеить нечем)
    wearModules(dt);
    if (s.equip.printer === 'own' && moduleOk('printer') && !hasEffect('print_off')) {
      const rate = stickerRate();
      const cap = Math.max(2, rate * 0.6 + 1); // «в руках» столько, сколько успеет
      s.stickerAcc = Math.min(cap, s.stickerAcc + rate * dt);
    }
    // бюджет считывания камеры: X кодов в секунду
    if (s.equip.camera === 'basic' && moduleOk('camera')) {
      s.camBudget = Math.min(16, s.camBudget + camSpeed() * dt);
    }

    // Честный знак: генерация заказа, автозаказ, печать этикеток
    completeOrder();
    autoOrderCheck();
    if (!paused()) produceLabels(dt);

    if (!paused()) {
      const interval = CFG.BASE_SPAWN_S / (spawnRateMult() * productSpeedMult());
      s.spawnAcc += dt;
      let guard = 0;
      while (s.spawnAcc >= interval && guard < 8) {
        s.spawnAcc -= interval;
        spawnBox();
        guard++;
      }
      for (let i = s.boxes.length - 1; i >= 0; i--) {
        const b = s.boxes[i];
        b.x += boxSpeed() * dt;
        Game.ui.positionBox(b);
        processBox(b);
        if (b.x >= 1) finalizeBox(b);
      }
    }

    // автоотправка на рынок партиями (с сервером);
    // пока активен контракт — товар копим для заказчика
    if (serverUp() && s.pending.length && !s.contracts.length) {
      s.batchTimer += dt;
      const timerCap = hasResearch('srv_fast') ? 6 : CFG.BATCH_TIMER_S;
      if (s.pending.length >= CFG.BATCH_MAX || s.batchTimer >= timerCap) {
        sellBatch(false);
        s.batchTimer = 0;
      }
    } else {
      s.batchTimer = 0;
    }

    // контракты заказчиков
    generateContract();
    const cAct = s.contracts[0];
    if (cAct && !cAct.done) s.batch.qty = Math.max(1, cAct.qty - cAct.delivered); // партия под контракт
    checkContracts();
    checkStrike();
    checkBatch();

    if (s.t >= s.nextEventAt && !Game.ui.modalOpen) {
      s.nextEventAt = s.t + CFG.EVENT_EVERY_S;
      Game.events.trigger();
    }

    complianceTick(dt);
    checkGrace();
    checkDeadline();
    checkAudit();
    checkBankrupt();
    checkNegativeBalance(dt);
    autoSave(dt);
  }

  /* ---------- публичное API ---------- */

  return {
    tick,
    spawnBox,
    addManualBox,
    orderCodes,
    manualBatchSend,
    recycleAll,
    deliverToContract,
    activeContract,
    getOpTargets,
    manualStick,
    servicePrinter,
    repairModule,
    moduleOk,
    brokenModules,
    upgradeLevel,
    camMiss,
    camSpeed,
    stickerRate,
    printRate,
    flowRate,
    productSpeedMult,
    rollReady,
    rollMax,
    rejectorMiss,
    labelDefectChance,
    warehouseMax,
    failSaleChance,
    salePriceMult,
    gradeWeights,
    changeBatchQty,
    maxBatchQty,
    batchInfo,
    autoOrderThreshold,
    hasResearch,
    hasEffect,
    addEffect,
    pause,
    paused,
    serverUp,
    requirement,
    markRatio,
    shareNow,
    streakMult,
    costFor,
    canAfford,
    boxClass,
  };
})();