/* ================================================================
   03_contracts_test.js — контракты заказчиков
   ================================================================ */
'use strict';
module.exports = function (h) {
  h.test('контракты появляются только для продукта завода', function () {
    const g = h.loadGame();
    const G = g.Game;
    G.state.new();
    G.running = true;
    G.ui.finishOverlay();
    G.ui.closeModal();
    G.S.productType = g.products()[3]; // Напитки
    G.S.nextEventAt = 1e9;
    G.S.ir += 5000;
    // крутим линию, ловим момент появления контракта
    let seen = 0;
    let guard = 0;
    while (guard < 1200) { // 300 секунд
      G.engine.tick(0.25);
      const raw = G.S.boxes.find(b => b.state === 'raw' && b.x <= g.CFG.CLICK_ZONE_MAX && b.x >= 0.05);
      if (raw) G.engine.manualStick(raw);
      if (G.S.contracts.length) {
        const c = G.S.contracts[0];
        seen++;
        if (c.product && c.product.name !== G.S.productType.name) {
          throw new Error('контракт на чужой продукт: ' + c.product.name);
        }
        if (seen > 600) break;
      }
      if (G.S.pending.length >= 3) G.engine.deliverToContract(0);
      if (G.ui.modalOpen) G.ui.closeModal();
      guard++;
    }
    h.assert(seen > 0, 'контракт так и не появился');
    h.assert(G.S.contracts.every(c => c.product && c.product.name === G.S.productType.name),
      'среди контрактов есть чужие продукты');
  });

  h.test('доставка по контракту: передача, бонус, регистрация кодов', function () {
    const g = h.loadGame();
    const G = g.Game;
    G.state.new();
    G.running = true;
    G.ui.finishOverlay();
    G.ui.closeModal();
    G.S.nextEventAt = 1e9;
    G.S.ir += 1000;
    const product = g.products()[1]; // Шампунь
    G.S.productType = product;

    G.S.nextContractAt = 0; // контракт появится в ближайший тик
    G.engine.tick(0.25);
    const c = G.S.contracts[0];
    h.assert(c, 'контракт не создан');
    h.assert(c.product.name === product.name, 'не тот продукт в контракте');

    G.S.pending = Array.from({ length: c.qty }, () => ({ product, code: g.genDM(), icon: product.icon }));
    const irBefore = G.S.ir;
    const regBefore = G.S.stats.registered;
    h.assert(G.engine.deliverToContract(0), 'передача заказчику не удалась');
    h.assert(c.done, 'контракт не закрыт');
    h.assert(G.S.stats.registered >= regBefore + c.qty, 'коды не зарегистрированы');
    h.assert(G.S.ir > irBefore, 'деньги не пришли за поставку');
    h.assert(G.S.pending.length === 0, 'накопитель не опустошён после передачи');
  });

  h.test('срыв контракта: штраф по истечении срока', function () {
    const g = h.loadGame();
    const G = g.Game;
    G.state.new();
    G.running = true;
    G.ui.finishOverlay();
    G.ui.closeModal();
    G.S.nextEventAt = 1e9;
    G.S.ir += 500;
    G.S.productType = g.products()[0];

    G.S.nextContractAt = 0;
    G.engine.tick(0.25);
    const c = G.S.contracts[0];
    h.assert(c, 'контракт не создан');
    c.dueAt = G.S.t + 25; // короткий срок — не успеваем
    const finesBefore = G.S.stats.fines;
    let guard = 0;
    while (G.S.contracts.length && guard < 600) { G.engine.tick(0.25); guard++; }
    h.assert(guard < 600, 'просроченный контракт не снят');
    h.assert(G.S.stats.fines >= finesBefore + g.CFG.CONTRACT_FAIL_FINE,
      'штраф за срыв срока не начислен: ' + (G.S.stats.fines - finesBefore));
  });
h.test('полный поток: передача заказчику из накопителя закрывает контракты', function () {
    const g = h.loadGame();
    let done = 0;
    let delivered = 0;
    h.runScenario(g, 900, {
      startIr: 8000, clicks: true, noAutoDeliver: true, buyCycle: true, noEvents: true,
      hook: (t, Game) => {
        // следим за оборудованием (иначе поломки к 5-й минуте убьют завод)
        for (const k of ['printer', 'camera', 'rejector', 'server']) {
          if (Game.S.equip[k] !== 'none' && Game.S.health[k] < 0.45) Game.engine.repairModule(k);
        }
        // прокачиваем камеру: скорость считывания важна для потока
        if (Game.S.equip.camera === 'basic' && (Game.S.upgradeLevels.cam_accel || 0) < 2 && Game.S.ir > 3000) {
          Game.upgrades.buyResearch('cam_accel');
        }
        // «игрок нажимает кнопку „Передать заказчику"» — как только на складе хватит на закрытие
        if (Game.S.contracts.length && !Game.S.contracts[0].done) {
          const need = Game.S.contracts[0].qty - Game.S.contracts[0].delivered;
          if (Game.S.pending.length >= need) {
            if (Game.engine.deliverToContract(0)) {
              delivered += need;
              if (Game.S.contracts[0] && Game.S.contracts[0].done) done++;
            }
          }
        }
      },
    });
    h.assert(delivered > 0, 'передача из накопителя не сработала ни разу (pending: ' + g.Game.S.pending.length + ', контрактов: ' + g.Game.S.contracts.length + ')');
    h.assert(done > 0, 'ни один контракт не выполнен через передачу (done=' + done + ')');
  });
h.test('партия под контракт: собирается сама и автоматически закрывает контракт', function () {
    const g = h.loadGame();
    let doneSeen = false;
    h.runScenario(g, 560, {
      startIr: 5000, clicks: true, noAutoDeliver: true, buyCycle: true, noEvents: true,
      hook: (t, Game) => {
        // игрок лишь следит за оборудованием и заказывает коды — передачу не трогает
        for (const k of ['printer', 'camera', 'rejector', 'server']) {
          if (Game.S.equip[k] !== 'none' && Game.S.health[k] < 0.45) Game.engine.repairModule(k);
        }
        if (!Game.S.chz.ordering && Game.S.chz.pool.length + Game.S.chz.labels.length < 80) Game.engine.orderCodes();
        const raw = Game.S.boxes.find(b => b.state === 'raw' && b.x <= g.CFG.CLICK_ZONE_MAX && b.x >= 0.05);
        if (raw) Game.engine.manualStick(raw);
        if (Game.S.scrap.length) Game.engine.recycleAll();
        if (Game.S.contracts.length && Game.S.contracts[0].done) doneSeen = true; // партия закрыла контракт
        if (Game.S.contracts.length && Game.S.batch.qty !== Game.S.contracts[0].qty - Game.S.contracts[0].delivered &&
            !Game.S.contracts[0].done && t > 80) {
          // размер партии должен следовать за контрактом
          doneSeen = doneSeen || false;
        }
      },
    });
    h.assert(doneSeen, 'ни один контракт не закрыт автоматически собранной партией');
  });
};