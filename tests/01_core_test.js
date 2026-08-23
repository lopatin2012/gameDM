/* ================================================================
   01_core_test.js — базовые сценарии: победа, сохранение, поражения
   ================================================================ */
'use strict';
module.exports = function (h) {
  h.test('успешный игрок: победа, единый тип, даты, коды, движение, грация', function () {
    const g = h.loadGame();
    const seenTops = new Set();
    const s = h.runScenario(g, 960, {
      startIr: 3000, clicks: true, buyCycle: true,
      hook: (t, Game, CFG) => {
        // дисциплинированный игрок следит за здоровьем оборудования
        for (const k of ['printer', 'camera', 'rejector', 'server']) {
          if (Game.S.equip[k] !== 'none' && Game.S.health[k] < 0.45) Game.engine.repairModule(k);
        }
        if (t % 5 < 0.3) {
          const mv = Game.S.boxes.find(b => b.x > 0.35);
          if (mv) {
            const expected = (mv.x * 100).toFixed(2);
            if (!mv.el.style.left.includes(expected)) throw new Error('коробка не движется: left=' + mv.el.style.left);
          }
          const live = Game.S.boxes.filter(b => b.code);
          const codes = live.map(b => b.code);
          if (new Set(codes).size !== codes.length) throw new Error('дубли кодов DM на ленте');
          if (codes.some(c => !c || !c.startsWith('(01)0'))) throw new Error('невалидный код DM');
          const names = new Set(Game.S.boxes.map(b => b.product.name));
          if (names.size > 1) throw new Error('на ленте смешаны продукты: ' + [...names].join(', '));
          if (Game.S.boxes.some(b => !b.prodDate || !b.expDate)) throw new Error('нет дат маркировки/годности');
          Game.S.boxes.forEach(b => seenTops.add(b.top));
        }
        if (t < CFG.GRACE_S - 5 && Game.engine.requirement() !== 0) throw new Error('требование ЧЗ > 0 в льготный период');
        if (t > CFG.GRACE_S + 15 && Game.engine.requirement() <= 0) throw new Error('требование ЧЗ не растёт после грации');
      },
    });
    h.assert(s.phase === 'won', 'ожидалась победа, фаза: ' + s.phase);
    h.assert(seenTops.size >= 3, 'мало вертикальных позиций на ленте: ' + seenTops.size);
    h.assert(s.stats.fines < 300, 'слишком много штрафов у успешного игрока: ' + s.stats.fines);
  });

  h.test('сохранение и загрузка', function () {
    const g = h.loadGame();
    h.runScenario(g, 960, { startIr: 3000, clicks: true, buyCycle: true });
    g.Game.state.save();
    const saved = g.ctx.localStorage.getItem('dmg_save_v1');
    h.assert(saved && saved.length > 200, 'сейв не записан (bytes=' + (saved ? saved.length : 0) + ')');
    const loaded = g.Game.state.load();
    h.assert(loaded && loaded.t >= 900 && loaded.equip.server === 'basic', 'загрузка повреждена');
    h.assert(loaded && typeof loaded.stats.registered === 'number', 'потеряны поля stats');
  });

  h.test('стартовый рендер интерфейса не бросает исключений (все панели и деревья)', function () {
    const g = h.loadGame();
    const G = g.Game;
    G.state.new();
    G.running = true;
    G.ui.finishOverlay();
    G.ui.closeModal();
    G.S.ir += 2000;
    // именно этот путь выполняет main.js при старте
    G.ui.refreshAll();
    for (const k of ['printer', 'camera', 'rejector', 'server', 'shop']) G.ui.selectEq(k);
    G.ui.refreshAll();
    // немного живого игрового времени + кадры UI
    for (let i = 0; i < 120; i++) G.engine.tick(0.25);
    for (let i = 0; i < 12; i++) G.ui.frame(0.25, i * 250);
    h.assert(true, 'рендер панелей и кадры прошли без исключений');
  });

  h.test('нерадивый игрок: Game Over по дедлайну', function () {
    const g = h.loadGame();
    const s = h.runScenario(g, 640, { startIr: 5000, clicks: false });
    h.assert(s.phase === 'over', 'ожидался Game Over к 640 с, фаза: ' + s.phase);
  });

  h.test('минус: 10 секунд на исправление, потом банкрот; лента пустая', function () {
    const g = h.loadGame();
    const s = h.runScenario(g, 6, { startIr: -900, noEvents: true }); // −500 ИР с первой секунды
    h.assert(s.phase !== 'over', 'банкротство случилось раньше 10 секунд, фаза: ' + s.phase);
    h.assert(Math.round(s.negTimer) >= 5, 'таймер исправления не тикает: ' + Math.round(s.negTimer));
  });

  h.test('вернулись в плюс за 10 секунд — банкротство отменяется', function () {
    const g = h.loadGame();
    const G = g.Game;
    G.state.new();
    G.running = true;
    G.ui.finishOverlay();
    G.ui.closeModal();
    G.S.nextEventAt = 1e9;
    G.S.nextContractAt = 1e9;
    G.S.ir = -300;
    // 8 секунд в минусе — ещё можно исправиться
    let guard = 0;
    while (guard < 32) { G.engine.tick(0.25); guard++; }
    h.assert(G.S.phase !== 'over', 'банкрот до конца отсчёта');
    // вышли в плюс — таймер сброшен
    G.S.ir = 500;
    guard = 0;
    while (guard < 20) { G.engine.tick(0.25); guard++; }
    h.assert(G.S.phase !== 'over' && G.S.negTimer === 0, 'после возврата в плюс таймер не сброшен');
    // снова в минус и держим 10+ секунд — банкрот (фаза post: доходов нет, минус не выправится)
    G.S.phase = 'post';
    G.S.ir = -100;
    guard = 0;
    while (guard < 56 && G.S.phase !== 'over') { G.engine.tick(0.25); guard++; }
    h.assert(G.S.phase === 'over', 'банкротство не наступило после 10 секунд минуса');
    h.assert(G.S.boxes.length === 0, 'после проигрыша продукция осталась на конвейере: ' + G.S.boxes.length);
  });
};