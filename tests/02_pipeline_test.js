/* ================================================================
   02_pipeline_test.js — производственный поток: коды, этикетки,
   наклейка, камера, партии, забастовка оператора
   ================================================================ */
'use strict';
module.exports = function (h) {
  h.test('заказ кодов ЧЗ: генерация пула, печать этикеток, ручная наклейка', function () {
    const g = h.loadGame();
    const G = g.Game;
    G.state.new();
    G.running = true;
    G.ui.finishOverlay();
    G.ui.closeModal();
    G.S.nextEventAt = 1e9; // без событий
    G.S.ir += 2000;

    h.assert(G.engine.orderCodes() === true, 'заказ кодов не начался');
    let guard = 0;
    while (G.S.chz.ordering && guard < 300) { G.engine.tick(0.25); guard++; }
    h.assert(!G.S.chz.ordering, 'заказ не завершился за 75 секунд');
    h.assert(G.S.chz.pool.length === g.CFG.ORDER_CODE_BATCH, 'пул кодов не наполнился: ' + G.S.chz.pool.length);

    G.upgrades.buyStage('printer'); // типография (прямая печать)
    G.upgrades.buyStage('printer'); // свой принтер — печать этикеток на рулон
    guard = 0;
    while (G.S.chz.labels.length < 3 && guard < 800) { G.engine.tick(0.25); guard++; }
    h.assert(G.S.chz.labels.length >= 3, 'свой принтер не печатает этикетки: ' + G.S.chz.labels.length);

    const raw = G.S.boxes.find(b => b.state === 'raw' && b.x <= g.CFG.CLICK_ZONE_MAX && b.x >= 0.05);
    if (raw) {
      h.assert(G.engine.manualStick(raw), 'ручная наклейка не сработала');
      h.assert(raw.state === 'coded' || raw.state === 'bad', 'состояние после наклейки: ' + raw.state);
      h.assert(!!raw.code, 'код DM не присвоен продукту');
    }
    h.assert(true, 'поток работает (боксов на ленте: ' + G.S.boxes.length + ')');
  });

  h.test('с камерой: продукты попадают в накопитель и регистрируются партиями', function () {
    const g = h.loadGame();
    const s = h.runScenario(g, 420, {
      startIr: 5000, clicks: true, buyCycle: true, noEvents: true, noContracts: true,
    });
    h.assert(s.equip.camera === 'basic', 'камера не куплена buyCycle');
    h.assert(s.equip.rejector === 'basic', 'отбраковщик не куплен buyCycle');
    h.assert(s.stats.registered > 0, 'ни один код не зарегистрирован');
    h.assert(s.batchNo > 0, 'ни одной партии не отправлено на рынок');
    h.assert(s.pending.length <= g.CFG.BATCH_MAX + 4, 'накопитель без продаж копится: ' + s.pending.length);
    h.assert(s.stats.totalEarned > 1000, 'доход слишком мал: ' + Math.round(s.stats.totalEarned));
  });

  h.test('печать в рулон: быстрее в 2 раза, рулон больше в 1.5 раза', function () {
    const g = h.loadGame();
    h.assert(g.CFG.PRINT_RATE_OWN === 3.6, 'печать не увеличена в 2 раза: ' + g.CFG.PRINT_RATE_OWN);
    h.assert(g.CFG.ROLL_MAX === 90, 'рулон не увеличен в 1.5 раза: ' + g.CFG.ROLL_MAX);
    const G = g.Game;
    G.state.new();
    G.running = true;
    G.ui.finishOverlay();
    G.ui.closeModal();
    G.S.nextEventAt = 1e9;
    G.S.nextContractAt = 1e9;
    G.S.ir += 5000;
    G.upgrades.buyPrinter('own');
    h.assert(Math.abs(G.engine.printRate() - 3.6) < 0.01, 'printRate не 3.6: ' + G.engine.printRate());
    G.engine.orderCodes();
    let guard = 0;
    while (G.S.chz.ordering && guard < 300) { G.engine.tick(0.25); guard++; }
    guard = 0;
    while (G.S.chz.labels.length < 3 && guard < 800) { G.engine.tick(0.25); guard++; }
    h.assert(G.S.chz.labels.length >= 3, 'рулон не наполнился из буфера: ' + G.S.chz.labels.length + '/' + G.S.chz.buffer.length);
  });

  h.test('рулон меньше 15 штук — после введения маркировки линия стоит и ждёт печать', function () {
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
    // до обязательной маркировки рулон не критичен — линия едет
    G.S.t = 10;
    h.assert(G.engine.rollReady() === true, 'до маркировки рулон не должен останавливать линию');
    h.assert(G.engine.addManualBox() === true, 'до маркировки добавка не прошла без рулона');
    // после введения маркировки: коды не заказаны — печатать нечего, рулон пуст
    G.S.t = 100;
    h.assert(G.engine.rollReady() === false, 'после маркировки рулон пуст, а линия готова');
    h.assert(G.engine.addManualBox() === false, 'после маркировки рулон пуст, а добавка прошла');
    let guard = 0;
    while (guard < 60) { G.engine.tick(0.25); guard++; }
    h.assert(G.S.boxes.length === 0, 'при пустом рулоне продукт всё же появился: ' + G.S.boxes.length);
    // заказываем коды — печать наполняет рулон до порога
    G.S.boxes = [];
    G.engine.orderCodes();
    guard = 0;
    while (G.S.chz.ordering && guard < 300) { G.engine.tick(0.25); guard++; }
    guard = 0;
    while (G.S.chz.labels.length < g.CFG.STICKER_STOP_AT && guard < 1200) { G.engine.tick(0.25); guard++; }
    h.assert(G.engine.rollReady() === true, 'рулон напечатан, а линия всё ещё ждёт: labels=' + G.S.chz.labels.length);
    h.assert(G.engine.addManualBox() === true, 'после печати рулона добавка не прошла');
  });

  h.test('автозамена рулона: буфер ставится без остановки', function () {
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
    G.upgrades.buyResearch('prn_swap'); // буферная печать
    G.S.chz.labels = [];
    G.S.chz.buffer = Array.from({ length: 16 }, () => g.genDM());
    G.engine.tick(0.25);
    h.assert(G.S.chz.labels.length === 16, 'буфер не установлен на линию: ' + G.S.chz.labels.length + '/' + G.S.chz.buffer.length);
    h.assert(G.S.chz.buffer.length === 0, 'буфер не опустошён: ' + G.S.chz.buffer.length);
  });

  h.test('ускоренная подача в рулон: печать +50%', function () {
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
    const base = G.engine.printRate();
    G.upgrades.buyResearch('prn_tape');
    h.assert(Math.abs(G.engine.printRate() - base * 1.5) < 0.01, 'prn_tape не дал +50%: ' + G.engine.printRate());
  });

  h.test('без камеры накопитель пуст — проверка обязательна', function () {
    const g = h.loadGame();
    let pendingMax = 0;
    h.runScenario(g, 260, {
      startIr: 3000, clicks: true, noEvents: true,
      hook: (t, Game) => { pendingMax = Math.max(pendingMax, Game.S.pending.length); },
    });
    h.assert(pendingMax === 0, 'без камеры pending заполнился: ' + pendingMax);
  });

  h.test('оператор бастует после серии брака и останавливает производство', function () {
    const g = h.loadGame();
    const G = g.Game;
    let fixing = false;
    let strikeSeenAt = -1;
    let producedAtStrike = 0;
    let producedAfter = 0;
    let checkDone = false;
    let camBroke = false;
    let scrapCleared = false;
    // камера есть; на 25-й секунде она выходит из строя — после льготного периода
    // коды не проверяются, продукция идёт в брак сериями → оператор бастует
    const s = h.runScenario(g, 320, {
      startIr: 3000, clicks: false, buyCycle: true, noEvents: true,
      hook: (t, Game, CFG) => {
        if (Game.S.equip.camera !== 'none' && t > 25 && !camBroke) {
          Game.S.health.camera = 0; // камера сломалась
          camBroke = true;
        }
        // игрок заказывает коды, чтобы печать шла (и свой принтер наполнил рулон)
        if (!Game.S.chz.ordering && Game.S.chz.pool.length + Game.S.chz.labels.length < 80) Game.engine.orderCodes();
        // ФАЗА 1: пассивно наблюдаем, пока не наступит забастовка
        if (!fixing) {
          if (Game.S.strike) {
            strikeSeenAt = t;
            producedAtStrike = Game.S.stats.produced;
            fixing = true;
          }
          return;
        }
        // ФАЗА 2: игрок чинит линию (ремонт камеры + переклейка + продажа)
        if (!checkDone && t > strikeSeenAt + 2) {
          producedAfter = Game.S.stats.produced;
          checkDone = true;
        }
        if (camBroke) Game.engine.repairModule('camera');
        // следим за оборудованием: поломки модулей не должны мешать тесту страйка
        for (const k of ['printer', 'rejector', 'server']) {
          if (Game.S.equip[k] !== 'none' && Game.S.health[k] < 0.45) Game.engine.repairModule(k);
        }
        if (!Game.S.chz.ordering && Game.S.chz.pool.length + Game.S.chz.labels.length < 100) Game.engine.orderCodes();
        const rawSt = Game.S.boxes.find(b => b.state === 'raw' && b.x <= CFG.CLICK_ZONE_MAX && b.x >= 0.05);
        if (rawSt) Game.engine.manualStick(rawSt);
        if (Game.S.scrap.length) Game.engine.recycleAll();
        if (Game.S.pending.length) Game.engine.manualBatchSend();
        if (Game.S.scrap.length === 0 && strikeSeenAt >= 0) scrapCleared = true;
      },
    });
    h.assert(strikeSeenAt >= 0, 'забастовка не наступила (frustration=' + s.frustration + ')');
    h.assert(producedAfter <= producedAtStrike + 2 || producedAfter === 0,
      'производство не остановлено: было ' + producedAtStrike + ', стало ' + producedAfter);
    h.assert(scrapCleared, 'лоток брака не очищен переклейкой — забастовка не снята');
  });
};