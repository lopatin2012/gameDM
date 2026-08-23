/* ================================================================
   04_settings_test.js — запрет продаж после маркировки, просрочка,
   пресеты сложности
   ================================================================ */
'use strict';
module.exports = function (h) {
  h.test('подрядчик (типография) наклеивает сам', function () {
    const g = h.loadGame();
    const G = g.Game;
    G.state.new();
    G.running = true;
    G.ui.finishOverlay();
    G.ui.closeModal();
    G.S.nextEventAt = 1e9;
    G.S.nextContractAt = 1e9;
    G.S.t = 120;               // после льготного периода: сырьё не продаётся, дохода нет
    G.S.ir += 5000;
    G.engine.orderCodes();
    let guard = 0;
    while (G.S.chz.ordering && guard < 300) { G.engine.tick(0.25); guard++; }
    G.upgrades.buyStage('printer'); // типография — печать и наклейка
    guard = 0;
    const irBefore = G.S.ir;
    while (guard < 1200 && G.S.stats.marked < 3) { G.engine.tick(0.25); guard++; }
    h.assert(G.S.stats.marked >= 3, 'типография не наклеила сама: marked=' + G.S.stats.marked);
    h.assert(G.S.ir < irBefore - 3, 'за наклейку подрядчику не списана тройная плата (было ' + irBefore + ', стало ' + G.S.ir + ')');
  });

  h.test('здоровье оборудования: поломка, замедленный ход, ремонт', function () {
    const g = h.loadGame();
    const G = g.Game;
    G.state.new();
    G.running = true;
    G.ui.finishOverlay();
    G.ui.closeModal();
    G.S.nextEventAt = 1e9;
    G.S.nextContractAt = 1e9;
    G.S.ir += 2000;
    G.S.equip.camera = 'basic';
    G.S.health.camera = 0.01; // почти сломана
    let guard = 0;
    while (guard < 20) { G.engine.tick(0.25); guard++; } // доезжаем до поломки
    h.assert(!G.engine.moduleOk('camera'), 'камера не сломалась при нулевом здоровье');
    h.assert(G.engine.brokenModules().indexOf('Проверка') >= 0, 'сломанная камера не видна в brokenModules');
    const irBefore = G.S.ir;
    h.assert(G.engine.repairModule('camera'), 'ремонт не удался');
    h.assert(G.engine.moduleOk('camera'), 'камера не отремонтирована');
    h.assert(G.S.ir < irBefore, 'за ремонт не списана плата');
  });

  h.test('уровневые улучшения: прокачка до 20 уровней (принтер)', function () {
    const g = h.loadGame();
    const G = g.Game;
    G.state.new();
    G.running = true;
    G.ui.finishOverlay();
    G.ui.closeModal();
    G.S.nextEventAt = 1e9;
    G.S.nextContractAt = 1e9;
    G.S.ir = 100000;
    G.upgrades.buyStage('printer'); // требование для prn_accel
    // прокачиваем модельный ряд принтера 3 раза
    for (let i = 0; i < 3; i++) G.upgrades.buyResearch('prn_accel');
    h.assert((G.S.upgradeLevels.prn_accel || 0) === 3, 'уровень не вырос до 3: ' + G.S.upgradeLevels.prn_accel);
    // до максимального (теперь 20)
    for (let i = 0; i < 20; i++) G.upgrades.buyResearch('prn_accel');
    h.assert((G.S.upgradeLevels.prn_accel || 0) === 20, 'уровень не упёрся в 20: ' + G.S.upgradeLevels.prn_accel);
    h.assert(G.engine.upgradeLevel('prn_accel') === 20, 'upgradeLevel не вернул 20');
    // сверх максимума не прокачивается
    G.upgrades.buyResearch('prn_accel');
    h.assert((G.S.upgradeLevels.prn_accel || 0) === 20, 'игнор лимита прокачки');
  });

  h.test('качество печати: −0.1% брака за уровень', function () {
    const g = h.loadGame();
    const G = g.Game;
    G.state.new();
    G.running = true;
    G.ui.finishOverlay();
    G.ui.closeModal();
    G.S.nextEventAt = 1e9;
    G.S.nextContractAt = 1e9;
    G.S.ir = 100000;
    G.upgrades.buyPrinter('typography');
    const base = G.engine.labelDefectChance();
    h.assert(Math.abs(base - g.CFG.DEFECT_TYPOGRAPHY) < 1e-9, 'базовый брак печати не типографский: ' + base);
    for (let i = 0; i < 20; i++) G.upgrades.buyResearch('prn_quality');
    h.assert(Math.abs(G.engine.labelDefectChance() - (g.CFG.DEFECT_TYPOGRAPHY - 0.02)) < 1e-9,
      'качество печати не снизило брак: ' + G.engine.labelDefectChance());
  });

  h.test('промышленное освещение: −25% пропусков камеры', function () {
    const g = h.loadGame();
    const G = g.Game;
    G.state.new();
    G.running = true;
    G.ui.finishOverlay();
    G.ui.closeModal();
    G.S.nextEventAt = 1e9;
    G.S.nextContractAt = 1e9;
    G.S.ir = 100000;
    G.upgrades.buyStage('camera');
    h.assert(Math.abs(G.engine.camSpeed() - 2) < 1e-9, 'базовая скорость считывания не 2 кода/с: ' + G.engine.camSpeed());
    const base = G.engine.camMiss();
    G.upgrades.buyResearch('cam_light');
    h.assert(Math.abs(G.engine.camMiss() - base * 0.75) < 1e-6, 'cam_light не дал −25%: ' + G.engine.camMiss());
  });

  h.test('рекорды: сохраняются, счёт зависит от сложности (хардкор ×3)', function () {
    const g = h.loadGame();
    const G = g.Game;
    G.state.new();
    G.running = true;
    G.ui.finishOverlay();
    G.ui.closeModal();
    G.S.nextEventAt = 1e9;
    G.S.nextContractAt = 1e9;
    G.S.difficulty = 'hard';
    G.S.productType = g.products()[1]; // Шампунь
    G.S.ir = -100; // мгновенное банкротство
    let guard = 0;
    while (G.S.phase !== 'over' && guard < 60) { G.engine.tick(0.25); guard++; }
    h.assert(G.S.phase === 'over', 'не банкрот: ' + G.S.phase);
    const list = G.records.load();
    h.assert(list.length >= 1, 'рекорд не записан');
    const r = list[0];
    h.assert(r.mult === 3, 'множитель рекорда не 3 на хардкоре: ' + r.mult);
    const expected = Math.round((G.S.stats.registered * 3 + G.S.stats.produced) * 3);
    h.assert(r.score === expected, 'счёт не по формуле: ' + r.score + ' vs ' + expected);
    h.assert(r.product === '🧴 Шампунь', 'товар в рекорде неверный: ' + r.product);
  });

  h.test('во время подготовки брак за плохое чтение DM не возникает', function () {
    const g = h.loadGame();
    const G = g.Game;
    G.state.new();
    G.running = true;
    G.ui.finishOverlay();
    G.ui.closeModal();
    G.S.nextEventAt = 1e9;
    G.S.nextContractAt = 1e9;
    G.S.ir += 5000;
    G.upgrades.buyStage('camera'); // камера есть, но маркировка ещё не обязательна
    G.S.t = 15; // идёт подготовка
    let guard = 0;
    while (guard < 80) {
      G.engine.tick(0.25);
      // игрок активно клеит этикетки (в т.ч. «плохие») — брак возникать не должен
      const raw = G.S.boxes.find(b => b.state === 'raw' && b.x <= g.CFG.CLICK_ZONE_MAX && b.x >= 0.05);
      if (raw) G.engine.manualStick(raw);
      guard++;
    }
    h.assert(G.S.scrap.length === 0, 'в подготовке появился брак: ' + G.S.scrap.length);
    h.assert(G.S.stats.sold > 0, 'в подготовке не было продаж');
    // после введения обязательной маркировки брак «отсутствие кода» начинается
    G.S.t = 100;
    guard = 0;
    while (guard < 240 && G.S.scrap.length === 0) { G.engine.tick(0.25); guard++; }
    h.assert(G.S.scrap.length > 0, 'после введения маркировки брак так и не появился');
  });

  h.test('производственная партия: завершение, итоги и лимит по производительности', function () {
    const g = h.loadGame();
    const G = g.Game;
    G.state.new();
    G.running = true;
    G.ui.finishOverlay();
    G.ui.closeModal();
    G.S.nextEventAt = 1e9;
    G.S.nextContractAt = 1e9;
    G.S.ir += 5000;
    G.S.batch.qty = 10; // маленькая партия для быстрого теста
    G.upgrades.buyStage('printer');
    G.upgrades.buyStage('camera'); // чтобы после grace продукция не шла в брак
    G.engine.orderCodes();
    let guard = 0;
    while (G.S.chz.ordering && guard < 300) { G.engine.tick(0.25); guard++; }
    guard = 0;
    const noBefore2 = G.S.batch.no;
    while (guard < 3000 && G.S.batch.no === noBefore2) {
      G.engine.tick(0.25);
      const raw = G.S.boxes.find(b => b.state === 'raw' && b.x <= g.CFG.CLICK_ZONE_MAX && b.x >= 0.05);
      if (raw) G.engine.manualStick(raw);
      if (G.S.pending.length) G.engine.manualBatchSend();
      guard++;
    }
    h.assert(G.S.batch.no > noBefore2, 'партия не завершилась (no=' + G.S.batch.no + ')');
    // размер партии: лимит не ниже минимума и не выше потолка
    G.engine.changeBatchQty(+500);
    h.assert(G.S.batch.qty <= g.CFG.BATCH_MAX_QTY, 'лимит партии превышен: ' + G.S.batch.qty);
    G.engine.changeBatchQty(-500);
    h.assert(G.S.batch.qty >= g.CFG.BATCH_MIN_QTY, 'партия меньше минимума: ' + G.S.batch.qty);
  });

  h.test('фирменный модельный ряд: ReaderDM100 → ReaderDM200', function () {
    const g = h.loadGame();
    const G = g.Game;
    G.state.new();
    G.running = true;
    G.ui.finishOverlay();
    G.ui.closeModal();
    G.S.nextEventAt = 1e9;
    G.S.nextContractAt = 1e9;
    G.S.ir = 100000;
    G.upgrades.buyStage('camera');
    for (let i = 0; i < 2; i++) G.upgrades.buyResearch('cam_accel');
    h.assert((G.S.upgradeLevels.cam_accel || 0) === 2, 'уровни камеры не выросли');
    // пропуск кода снизился на 2 ступени
    const missBase = g.CFG.CAM_MISS_BASE - g.CFG.CAM_MISS_STEP * 2;
    h.assert(Math.abs(G.engine.camMiss() - missBase) < 1e-9, 'пропуск камеры не по формуле');
    h.assert(G.engine.camMiss() < g.CFG.CAM_MISS_BASE, 'пропуск не снизился');
  });

  h.test('склад: лимит останавливает добавку продукции, потом снова пускает', function () {
    const g = h.loadGame();
    const G = g.Game;
    G.state.new();
    G.running = true;
    G.ui.finishOverlay();
    G.ui.closeModal();
    G.S.nextEventAt = 1e9;
    G.S.nextContractAt = 1e9;
    G.S.pending = Array.from({ length: G.S.warehouseMax }, () => ({
      product: g.products()[0], code: g.genDM(), icon: '🥫',
    }));
    h.assert(G.engine.addManualBox() === false, 'склад полон — добавка должна быть запрещена');
    G.S.pending = [];
    h.assert(G.engine.addManualBox() === true, 'после освобождения склада добавка разрешена');
    h.assert(G.S.pending.length === 0 && G.S.boxes.length > 0, 'продукт не попал на линию после подачи');
  });

  h.test('режимы маркировки: покупка, переключение, печать своим принтером', function () {
    const g = h.loadGame();
    const G = g.Game;
    G.state.new();
    G.running = true;
    G.ui.finishOverlay();
    G.ui.closeModal();
    G.S.nextEventAt = 1e9;
    G.S.nextContractAt = 1e9;
    G.S.ir += 5000;

    h.assert(G.upgrades.buyPrinter('typography'), 'типография не куплена');
    h.assert(G.S.equip.printer === 'typography', 'типография не активна');
    h.assert(G.upgrades.buyPrinter('own'), 'свой принтер не куплен');
    h.assert(G.S.equip.printer === 'own', 'свой принтер не активен');

    // печать своим принтером: коды → этикетки на рулон
    G.engine.orderCodes();
    let guard = 0;
    while (G.S.chz.ordering && guard < 300) { G.engine.tick(0.25); guard++; }
    guard = 0;
    while (G.S.chz.labels.length < 3 && guard < 800) { G.engine.tick(0.25); guard++; }
    h.assert(G.S.chz.labels.length >= 3, 'свой принтер не печатает этикетки: ' + G.S.chz.labels.length);

    // переключение обратно на типографию
    h.assert(G.upgrades.buyPrinter('typography') === true, 'переключение на типографию не удалось');
    h.assert(G.S.equip.printer === 'typography', 'не переключилось на типографию');
    // типография кодирует напрямую, без рулона
    const markedBefore = G.S.stats.marked;
    guard = 0;
    while (G.S.stats.marked === markedBefore && guard < 300) {
      G.engine.tick(0.25);
      const raw = G.S.boxes.find(b => b.state === 'raw' && b.x <= g.CFG.CLICK_ZONE_MAX && b.x >= 0.05);
      if (raw) G.engine.manualStick(raw);
      guard++;
    }
    h.assert(G.S.stats.marked > markedBefore, 'типография не кодирует напрямую');
  });

  h.test('события камеры не появляются до обязательной маркировки', function () {
    const g = h.loadGame();
    const G = g.Game;
    G.state.new();
    G.running = true;
    G.ui.finishOverlay();
    G.ui.closeModal();
    G.S.nextEventAt = 1e9;
    G.S.nextContractAt = 1e9;
    G.S.equip.camera = 'basic'; // камера есть, но маркировка ещё не обязательна
    const heavy = G.events.EVENTS.find(e => e.id === 'heavypo');
    const glare = G.events.EVENTS.find(e => e.id === 'glare');
    G.S.t = 10; // льготный период
    h.assert(heavy.prereq() === false, 'heavypo доступно до обязательной маркировки');
    h.assert(glare.prereq() === false, 'glare доступно до обязательной маркировки');
    G.S.t = 100; // после введения маркировки требование > 0
    h.assert(heavy.prereq() === true, 'heavypo не доступно после введения маркировки');
    h.assert(glare.prereq() === true, 'glare не доступно после введения маркировки');
  });

  h.test('свой принтер маркирует автоматически (без кнопок)', function () {
    const g = h.loadGame();
    const G = g.Game;
    G.state.new();
    G.running = true;
    G.ui.finishOverlay();
    G.ui.closeModal();
    G.S.nextEventAt = 1e9;
    G.S.nextContractAt = 1e9;
    G.S.ir += 5000;
    G.upgrades.buyPrinter('own'); // свой принтер, человек-наклейщик на 1 шт/с
    G.upgrades.buyStage('camera'); // чтобы после льготного периода завод продолжал жить
    G.engine.orderCodes();
    let guard = 0;
    while (G.S.chz.ordering && guard < 300) { G.engine.tick(0.25); guard++; }
    guard = 0;
    while (G.S.stats.marked < 3 && guard < 2000) { G.engine.tick(0.25); guard++; } // без ручных наклеек
    h.assert(G.S.stats.marked >= 3, 'свой принтер не маркирует сам: marked=' + G.S.stats.marked);
  });

  h.test('навык наклейщика: 0.5 + 0.25 шт/с за уровень', function () {
    const g = h.loadGame();
    const G = g.Game;
    G.state.new();
    G.running = true;
    G.ui.finishOverlay();
    G.ui.closeModal();
    G.S.nextEventAt = 1e9;
    G.S.nextContractAt = 1e9;
    G.S.ir = 100000;
    G.upgrades.buyPrinter('own');
    h.assert(Math.abs(G.engine.stickerRate() - 0.5) < 1e-9, 'базовая наклейка не 0.5 шт/с: ' + G.engine.stickerRate());
    const irBefore = G.S.ir;
    G.upgrades.buyResearch('sticker_skill'); // уровень 1, стоит 100/3 = 34
    h.assert(G.S.ir === irBefore - 34, 'стоимость 1-го уровня не 34: ' + (irBefore - G.S.ir));
    G.upgrades.buyResearch('sticker_skill'); // уровень 2, стоит 68
    h.assert(Math.abs(G.engine.stickerRate() - 1.0) < 1e-9, 'после 2 уровней наклейка не 1.0 шт/с: ' + G.engine.stickerRate());
    h.assert((G.S.upgradeLevels.sticker_skill || 0) === 2, 'уровень навыка не 2');
  });

  h.test('принтер-аппликатор: рулон 200, ёмкость до 600', function () {
    const g = h.loadGame();
    const G = g.Game;
    G.state.new();
    G.running = true;
    G.ui.finishOverlay();
    G.ui.closeModal();
    G.S.nextEventAt = 1e9;
    G.S.nextContractAt = 1e9;
    G.S.ir = 100000;
    G.upgrades.buyPrinter('own');
    h.assert(G.engine.rollMax() === g.CFG.ROLL_MAX, 'без аппликатора рулон не базовый: ' + G.engine.rollMax());
    G.upgrades.buyResearch('prn_applicator');
    h.assert(G.engine.rollMax() === 200, 'аппликатор не дал рулон 200: ' + G.engine.rollMax());
    // общая проклейка = принтер + человек (сумма, а не только скорость человека)
    const human = (g.CFG.STICKER_BASE_RATE + g.CFG.STICKER_SKILL_STEP * (G.S.upgradeLevels.sticker_skill || 0)) * G.engine.productSpeedMult();
    h.assert(Math.abs(G.engine.stickerRate() - (G.engine.printRate() + human)) < 0.01,
      'сумма проклеек не сходится: ' + G.engine.stickerRate() + ' vs ' + (G.engine.printRate() + human));
    for (let i = 0; i < 3; i++) G.upgrades.buyResearch('prn_rollsize');
    h.assert(G.engine.rollMax() === 600, 'ёмкость не достигла 600: ' + G.engine.rollMax());
    h.assert((G.S.upgradeLevels.prn_rollsize || 0) === 3, 'уровни ёмкости не набраны');
  });

  h.test('улучшения в 3 раза дешевле', function () {
    const g = h.loadGame();
    const G = g.Game;
    G.state.new();
    G.running = true;
    G.ui.finishOverlay();
    G.ui.closeModal();
    G.S.nextEventAt = 1e9;
    G.S.nextContractAt = 1e9;
    G.S.ir = 100000;
    G.upgrades.buyPrinter('typography'); // https:// req: printer_installed
    // «Скоростная печать» стоит 1200 → теперь 400
    const irBefore = G.S.ir;
    h.assert(G.upgrades.researchCost({ cost: 1200 }, 0) === 400, 'researchCost не удешевил в 3 раза: ' + G.upgrades.researchCost({ cost: 1200 }, 0));
    G.upgrades.buyResearch('prod_fastprint');
    h.assert(G.S.ir === irBefore - 400, 'списано не 400: ' + (irBefore - G.S.ir));
  });

  h.test('качество продукта: градиент сортов смещается с уровнем', function () {
    const g = h.loadGame();
    const G = g.Game;
    G.state.new();
    G.running = true;
    G.ui.finishOverlay();
    G.ui.closeModal();
    G.S.nextEventAt = 1e9;
    G.S.nextContractAt = 1e9;
    const w0 = G.engine.gradeWeights(0);
    const w10 = G.engine.gradeWeights(10);
    h.assert(w0[0].w > 0.5, 'на 0 уровне обычный сорт не доминирует: ' + w0[0].w);
    h.assert(w10[0].w < 0.2, 'на 10 уровне обычный сорт всё ещё частый: ' + w10[0].w);
    h.assert(w10[1].w > w0[1].w, 'с уровнем премиум-сорт не растёт');
    // у более дорогого сорта выше множитель
    h.assert(w10[3].mult > w10[0].mult, 'элитный не дороже обычного');
  });

  h.test('показатели производительности: печать, поток — числа', function () {
    const g = h.loadGame();
    const G = g.Game;
    G.state.new();
    G.running = true;
    G.ui.finishOverlay();
    G.ui.closeModal();
    G.S.nextEventAt = 1e9;
    G.S.nextContractAt = 1e9;
    G.S.ir += 5000;
    G.upgrades.buyPrinter('own');
    h.assert(G.engine.printRate() > 0, 'печать не в штуках: ' + G.engine.printRate());
    h.assert(Math.abs(G.engine.flowRate() - 1 / g.CFG.BASE_SPAWN_S) < 0.01, 'поток линии не посчитан: ' + G.engine.flowRate().toFixed(3) + ' vs ' + (1 / g.CFG.BASE_SPAWN_S).toFixed(3));
  });

  h.test('смена рулона: печать в буфер и установка рулона', function () {
    const g = h.loadGame();
    const G = g.Game;
    G.state.new();
    G.running = true;
    G.ui.finishOverlay();
    G.ui.closeModal();
    G.S.nextEventAt = 1e9;
    G.S.nextContractAt = 1e9;
    G.S.ir += 5000;
    G.upgrades.buyPrinter('own');
    G.engine.orderCodes();
    let guard = 0;
    while (G.S.chz.ordering && guard < 300) { G.engine.tick(0.25); guard++; }
    guard = 0;
    while (G.S.chz.labels.length < 3 && guard < 2000) { G.engine.tick(0.25); guard++; }
    h.assert(G.S.chz.labels.length >= 3, 'рулон не установился: labels=' + G.S.chz.labels.length);
    h.assert(G.S.chz.buffer.length <= g.CFG.ROLL_MAX, 'буферный рулон переполнен: ' + G.S.chz.buffer.length);
    h.assert(G.S.chz.pool.length < g.CFG.ORDER_CODE_BATCH, 'коды не расходуются на печать');
  });

  h.test('пропуски отбраковки: базовый шанс и снижение улучшениями', function () {
    const g = h.loadGame();
    const G = g.Game;
    G.state.new();
    G.running = true;
    G.ui.finishOverlay();
    G.ui.closeModal();
    G.S.nextEventAt = 1e9;
    G.S.nextContractAt = 1e9;
    G.S.ir = 100000;
    G.upgrades.buyStage('rejector');
    const base = G.engine.rejectorMiss();
    h.assert(Math.abs(base - 0.06) < 1e-9, 'базовый пропуск не 6%: ' + base);
    G.upgrades.buyResearch('rej_accel');
    G.upgrades.buyResearch('rej_accel');
    h.assert(Math.abs(G.engine.rejectorMiss() - 0.05) < 1e-9, 'после 2 моделей пропуск не 5%: ' + G.engine.rejectorMiss());
    G.upgrades.buyResearch('rej_duo');
    h.assert(Math.abs(G.engine.rejectorMiss() - 0.03) < 1e-9, 'с двухступенчатой не 3%: ' + G.engine.rejectorMiss());
  });

  h.test('склад: расширение, меньше рекламаций, выше цена отгрузки', function () {
    const g = h.loadGame();
    const G = g.Game;
    G.state.new();
    G.running = true;
    G.ui.finishOverlay();
    G.ui.closeModal();
    G.S.nextEventAt = 1e9;
    G.S.nextContractAt = 1e9;
    G.S.ir = 100000;
    h.assert(G.engine.warehouseMax() === g.CFG.WAREHOUSE_MAX, 'базовый склад не 40: ' + G.engine.warehouseMax());
    for (let i = 0; i < 2; i++) G.upgrades.buyResearch('wh_capacity');
    h.assert(G.engine.warehouseMax() === g.CFG.WAREHOUSE_MAX + 60, 'расширение склада не дало +60: ' + G.engine.warehouseMax());
    h.assert(Math.abs(G.engine.failSaleChance() - 0.1) < 1e-9, 'базовая рекламация не 10%: ' + G.engine.failSaleChance());
    for (let i = 0; i < 5; i++) G.upgrades.buyResearch('wh_climate');
    h.assert(Math.abs(G.engine.failSaleChance() - 0.05) < 1e-9, 'климат-контроль не снизил рекламации: ' + G.engine.failSaleChance());
    for (let i = 0; i < 3; i++) G.upgrades.buyResearch('wh_trade');
    h.assert(Math.abs(G.engine.salePriceMult() - 1.06) < 1e-9, 'отгрузка не дала +6%: ' + G.engine.salePriceMult());
  });

  h.test('бесконечный режим: нет дедлайна, требование растёт по времени', function () {
    const g = h.loadGame();
    const G = g.Game;
    G.state.new();
    G.running = true;
    G.ui.finishOverlay();
    G.ui.closeModal();
    G.S.nextEventAt = 1e9;
    G.S.nextContractAt = 1e9;
    G.S.difficulty = 'endless';
    G.S.deadlineS = Infinity;
    G.S.ir += 5000;
    // требование медленно растёт: на 100-й секунде >0 и <1
    G.S.t = 100;
    h.assert(G.engine.requirement() > 0 && G.engine.requirement() < 1, 'требование в бесконечном не растёт: ' + G.engine.requirement());
    // после 10 минут — достигает 100% (а дедлайна нет)
    G.S.t = 700;
    h.assert(G.engine.requirement() === 1, 'требование не достигло 100%: ' + G.engine.requirement());
    // игра не заканчивается по дедлайну
    let guard = 0;
    while (guard < 1200) { G.engine.tick(0.25); guard++; }
    h.assert(G.S.phase === 'prep', 'бесконечный режим закончился: ' + G.S.phase);
  });

  h.test('скорость линии зависит от типа продукта: квадрат разницы цен', function () {
    const g = h.loadGame();
    const G = g.Game;
    G.state.new();
    G.running = true;
    G.ui.finishOverlay();
    G.ui.closeModal();
    G.S.nextEventAt = 1e9;
    G.S.nextContractAt = 1e9;
    G.S.ir += 5000;
    // консервы — эталон (×1)
    h.assert(Math.abs(G.engine.productSpeedMult() - 1) < 1e-9, 'консервы не эталон: ' + G.engine.productSpeedMult());
    // молоко (9 ₽) — быстрее по квадрату отношения
    G.S.productType = g.products()[2]; // Молоко
    const mult = G.engine.productSpeedMult();
    h.assert(Math.abs(mult - Math.pow(14 / 9, 2)) < 1e-9, 'множитель не (14/9)^2: ' + mult);
    h.assert(G.engine.flowRate() > (1 / g.CFG.BASE_SPAWN_S), 'поток с молоком не быстрее');
    // напитки (6 ₽): в ~2.33 раза дешевле → скорость ~5.4 (в пределах потолка 8)
    G.S.productType = g.products()[4];
    h.assert(Math.abs(G.engine.productSpeedMult() - Math.pow(14 / 6, 2)) < 1e-9, 'напитки не в квадрате: ' + G.engine.productSpeedMult());
    h.assert(G.engine.productSpeedMult() <= 8, 'потолок скорости превышен: ' + G.engine.productSpeedMult());
  });

  h.test('«Промаркировано» падает при пролёте продуктов без кода', function () {
    const g = h.loadGame();
    const G = g.Game;
    G.state.new();
    G.running = true;
    G.ui.finishOverlay();
    G.ui.closeModal();
    G.S.nextEventAt = 1e9;
    G.S.nextContractAt = 1e9;
    G.S.ir += 3000;
    // в льготный период сырьё без кодов и наклейки пролетает и продаётся
    let guard = 0;
    while (guard < 150) { G.engine.tick(0.25); guard++; } // ~37 секунд (до конца grace)
    h.assert(G.engine.markRatio() < 0.2, 'без маркировки доля должна падать: ' + (G.engine.markRatio() * 100).toFixed(0) + '%');
  });

  h.test('«Промаркировано» растёт, когда коды наносятся', function () {
    const g = h.loadGame();
    const G = g.Game;
    G.state.new();
    G.running = true;
    G.ui.finishOverlay();
    G.ui.closeModal();
    G.S.nextEventAt = 1e9;
    G.S.nextContractAt = 1e9;
    G.S.ir += 3000;
    G.upgrades.buyPrinter('own');
    G.engine.orderCodes();
    let guard = 0;
    while (G.S.chz.ordering && guard < 300) { G.engine.tick(0.25); guard++; }
    guard = 0;
    while (guard < 460) {
      G.engine.tick(0.25);
      const raw = G.S.boxes.find(b => b.state === 'raw' && b.x <= g.CFG.CLICK_ZONE_MAX && b.x >= 0.05);
      if (raw) G.engine.manualStick(raw);
      guard++;
    }
    h.assert(G.engine.markRatio() > 0.5, 'после наклейки доля не выросла: ' + (G.engine.markRatio() * 100).toFixed(0) + '%');
  });

  h.test('возвраты мыльного DM: проскочивший дефект даёт штрафы', function () {
    const g = h.loadGame();
    const G = g.Game;
    G.state.new();
    G.running = true;
    G.ui.finishOverlay();
    G.ui.closeModal();
    G.S.nextEventAt = 1e9;
    G.S.nextContractAt = 1e9;
    G.S.ir += 5000;
    const p0 = g.products()[0];
    // 40 «проскочивших» дефектных кодов → возвраты покупателей
    G.S.pending = Array.from({ length: 40 }, () => ({ product: p0, code: g.genDM(), icon: p0.icon, grade: { name: 'обычный', mult: 1 }, defect: true }));
    const retBefore = G.S.stats.returns;
    G.engine.manualBatchSend(); // продаёт склад (внутренний sellBatch)
    h.assert(G.S.stats.returns > retBefore, 'ни одного возврата мыльного DM');
    // обычные товары возвращаться не должны
    G.S.pending = Array.from({ length: 20 }, () => ({ product: p0, code: g.genDM(), icon: p0.icon, grade: { name: 'обычный', mult: 1 } }));
    const r2 = G.S.stats.returns;
    G.engine.manualBatchSend();
    h.assert(G.S.stats.returns === r2, 'без дефекта возвратов быть не должно');
  });

  h.test('автозаказ кодов ЧЗ: порог = 100 секунд работы линии', function () {
    const g = h.loadGame();
    const G = g.Game;
    G.state.new();
    G.running = true;
    G.ui.finishOverlay();
    G.ui.closeModal();
    G.S.nextEventAt = 1e9;
    G.S.nextContractAt = 1e9;
    G.S.ir += 5000;
    G.upgrades.buyStage('camera');
    G.upgrades.buyResearch('prod_autoorder');
    // консервы: поток ~0.77 шт/с → порог ~77
    const th1 = G.engine.autoOrderThreshold();
    h.assert(th1 >= 50, 'порог неоправданно мал: ' + th1);
    // «Вторая линия» удваивает поток → порог удваивается
    const ir = G.S.ir;
    G.S.ir = 100000;
    G.upgrades.buyResearch('spd_line2');
    G.S.ir = ir;
    const th2 = G.engine.autoOrderThreshold();
    h.assert(th2 >= th1 * 1.9, 'порог не вырос вместе с потоком: ' + th1 + ' -> ' + th2);
    // автозаказ срабатывает при малом запасе (включая буфер)
    G.S.chz.pool = [];
    G.S.chz.labels = [];
    G.S.chz.buffer = [];
    G.S.chz.ordering = false;
    G.engine.tick(0.25);
    h.assert(G.S.chz.ordering === true, 'автозаказ не запущен при пустом запасе');
  });

  h.test('после введения маркировки немаркированный товар не продаётся вообще', function () {
    const g = h.loadGame();
    let soldAt60 = -1;
    const s = h.runScenario(g, 210, {
      startIr: 3000, clicks: false, noEvents: true, noContracts: true,
      hook: (t, Game) => {
        if (t > 60 && soldAt60 < 0) soldAt60 = Game.S.stats.sold; // всё добежало и продалось в льготный период
      },
    });
    h.assert(soldAt60 >= 0, 'не зафиксирован момент окончания продаж');
    h.assert(s.stats.sold <= soldAt60, 'немаркированный товар продавался после ввода маркировки: ' + s.stats.sold + ' > ' + soldAt60);
  });

  h.test('просроченный продукт уходит в утиль, а не в модуль отбраковки', function () {
    const g = h.loadGame();
    const G = g.Game;
    // продукт с нулевым сроком годности: просрочка наступает мгновенно после маркировки
    h.runScenario(g, 400, {
      startIr: 5000, clicks: true, buyCycle: true, noEvents: true, noContracts: true,
      product: { icon: '🧪', name: 'Скоропорт', months: 0, value: 5 },
    });
    h.assert(G.S.stats.defectsShipped > 0, 'ни один просроченный продукт не утилизирован');
    h.assert(G.S.scrap.every(u => u.scanReason !== 'expired'), 'просрочка попала в модуль отбраковки (должна в утиль)');
  });

  h.test('пресет сложности укорачивает дедлайн (deadlineS работает)', function () {
    const g = h.loadGame();
    const s = h.runScenario(g, 450, {
      startIr: 3000, clicks: true, buyCycle: true, noEvents: true, noContracts: true,
      product: g.products()[0],
    });
    // контрольный сценарий на стандартном дедлайне → в подготовке
    h.assert(s.phase === 'prep', 'контрольный сценарий с обычным дедлайном должен быть в prep к 450: ' + s.phase);

    const g2 = h.loadGame();
    const s2 = h.runScenario(g2, 450, {
      startIr: 3000, clicks: true, buyCycle: true, noEvents: true, noContracts: true,
      product: g2.products()[0],
      deadlineS: 400, // «Хардкор»: Час Ч через 400 секунд
    });
    h.assert(s2.phase === 'post', 'хардкорный дедлайн 400с должен перевести в post к 450: ' + s2.phase);
  });
};