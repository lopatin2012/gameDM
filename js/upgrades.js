/* ================================================================
   upgrades.js — покупка оборудования и дерево прокачки
   ================================================================ */

Game.upgrades = (function () {
  const S = () => Game.S;
  const E = Game.engine;

  const STAGES = {
    printer: PRINTER_STAGES,
    camera: CAMERA_STAGES,
    rejector: REJECTOR_STAGES,
    server: SERVER_STAGES,
  };

  function nextStage(kind) {
    const list = STAGES[kind];
    const cur = S().equip[kind];
    const idx = list.findIndex(s => s.id === cur);
    return idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null;
  }

  function currentStage(kind) {
    return STAGES[kind].find(s => s.id === S().equip[kind]);
  }

  function buyStage(kind) {
    const s = S();
    // режимы маркировки: покупка по одному, переключение — кнопками
    if (kind === 'printer') {
      if (!s.printerModes.typography) return buyPrinter('typography');
      if (!s.printerModes.own) return buyPrinter('own');
      return; // оба куплены — переключаться только кнопками в карточке
    }
    const next = nextStage(kind);
    if (!next) return;
    const cost = E.costFor(kind);
    if (!E.canAfford(cost)) {
      Game.ui.log('Не хватает ₽ на «' + next.label + '» (' + fmt(cost) + ' ₽).', 'bad');
      return;
    }
    s.ir -= cost;
    s.equip[kind] = next.id;
    Game.ui.log('✅ Установлено: ' + next.label + ' (−' + fmt(cost) + ' ₽).', 'good');

    // этапные анонсы по смыслу исходного плана
    if (kind === 'camera') Game.ui.stage('Этап 1 · Внедрение сканера');
    if (kind === 'server') Game.ui.stage('Этап 4 · Интеграция с Честным знаком');
    Game.state.save();
  }

  /* покупка/переключение режима маркировки: типография ↔ свой принтер */
  function buyPrinter(mode) {
    const s = S();
    const st = PRINTER_STAGES.find(x => x.id === mode);
    if (!st || mode === 'none') return false;
    if (s.printerModes[mode]) {
      // режим уже куплен — переключаемся на него
      if (s.equip.printer === mode) return true;
      s.equip.printer = mode;
      Game.ui.log('🔄 Режим маркировки: переключено на «' + st.label + '».', 'good');
      Game.state.save();
      return true;
    }
    if (!E.canAfford(st.cost)) {
      Game.ui.log('Не хватает ₽ на «' + st.label + '» (' + fmt(st.cost) + ' ₽).', 'bad');
      return false;
    }
    s.ir -= st.cost;
    s.printerModes[mode] = true;
    s.equip.printer = mode;
    Game.ui.log('✅ Установлено: ' + st.label + ' (−' + fmt(st.cost) + ' ₽).', 'good');
    Game.state.save();
    return true;
  }

  /* --- предикаты требований --- */
  const PREREQS = {
    null: () => true,
    camera_installed: () => S().equip.camera !== 'none',
    printer_installed: () => S().equip.printer !== 'none',
    printer_own: () => S().equip.printer === 'own',
    server_installed: () => S().equip.server !== 'none',
    rejector_installed: () => S().equip.rejector !== 'none',
    prn_applicator: () => S().research.includes('prn_applicator'),
  };

  function prereqOk(id) {
    const u = UPGRADES[id];
    if (!u) return false;
    const fn = PREREQS[u.req] || PREREQS.null;
    return fn();
  }

  function grantResearch(id) {
    if (!UPGRADES[id] || S().research.includes(id)) return;
    S().research.push(id);
    if (id === 'spd_line2') {
      S().lines = 2;
      Game.ui.log('🏭 Вторая линия запущена! Поток удвоен.', 'good');
      Game.ui.stage('Этап 2 · Второй поток');
    }
    Game.state.save();
  }

  /* стоимость исследования: всё в 3 раза дешевле; уровни растут (costPerLevel) */
  function researchCost(u, lv) {
    const third = Math.ceil(u.cost / 3);
    return u.costPerLevel ? third * (lv + 1) : third;
  }

  function buyResearch(id) {
    const s = S();
    const u = UPGRADES[id];
    if (!u) return;
    if (!prereqOk(id)) {
      Game.ui.log('Улучшение «' + u.name + '» пока недоступно.', 'bad');
      return;
    }
    const maxLevels = u.levels || 1;
    const curLevel = s.upgradeLevels[id] || 0;
    if (curLevel >= maxLevels) return; // максимум прокачан
    const cost = researchCost(u, curLevel);
    if (!E.canAfford(cost)) {
      Game.ui.log('Не хватает ₽ на «' + u.name + '» (' + fmt(cost) + ' ₽).', 'bad');
      return;
    }
    s.ir -= cost;
    if (maxLevels > 1) {
      // уровневая прокачка: покупается много раз (до 10/100)
      s.upgradeLevels[id] = curLevel + 1;
      if (!s.research.includes(id)) s.research.push(id);
      Game.ui.log('🔬 «' + u.name + '» → уровень ' + (curLevel + 1) + '/' + maxLevels + ' (−' + fmt(cost) + ' ₽).', 'good');
      Game.state.save();
    } else {
      grantResearch(id);
      Game.ui.log('🔬 Исследовано: ' + u.name + ' (−' + fmt(cost) + ' ₽).', 'good');
    }
  }

  return { buyStage, buyPrinter, buyResearch, researchCost, grantResearch, nextStage, currentStage, prereqOk };
})();