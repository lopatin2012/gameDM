/* ================================================================
   events.js — генератор случайных событий с активным выбором
   Каждые 30 секунд. Часть событий «гасится» апгрейдами (иммунитеты).
   ================================================================ */

Game.events = (function () {
  const S = () => Game.S;
  const E = Game.engine;

  /* choice: { label, cost?, req?, run(state, box?) } — run возвращает строку-итог */

  const EVENTS = [
    {
      id: 'inspector', icon: '🕴️', weight: 8,
      name: 'Проверка инспектора',
      text: () => 'В цех зашёл инспектор и требует журнал учёта операций с маркировкой.',
      // инспектор не приходит, пока маркировка ещё внедряется (фаза подготовки)
      prereq: () => S().phase !== 'prep',
      choices: [
        {
          label: 'Показать журнал',
          req: () => S().equip.server !== 'none',
          run: () => {
            if (S().equip.server === 'none') {
              S().ir -= 600;
              S().stats.fines += 600;
              return 'Журнала нет! Штраф удвоен: −600 ₽.';
            }
            return 'Инспектор доволен: журнал в полном порядке.';
          },
        },
        {
          label: 'Откупиться',
          cost: 100,
          run: () => 'Инспектор ушёл, прихватив скромный «сувенир» (−100 ₽).',
        },
        {
          label: 'Сослаться на бумаги (штраф потом)',
          run: () => {
            S().ir -= 150;
            S().stats.fines += 150;
            return 'Инспектор ушёл, но выписал штраф: −150 ₽.';
          },
        },
      ],
    },

    {
      id: 'colorfail', icon: '🎨', weight: 7,
      name: 'Сбой цветопередачи',
      text: () => 'Принтер начал смазывать краску — коды превращаются в кашу.',
      prereq: () => S().equip.printer === 'own',
      choices: [
        {
          label: 'Почистить головку (линия встанет на 4 с)',
          run: () => { E.pause(4); S().printerWear = 0; return 'Головка чистая, износ сброшен.'; },
        },
        {
          label: 'Игнорировать',
          run: () => { E.addEffect('defect_up', 20); return 'Брак +25% на ближайшие 20 секунд!'; },
        },
      ],
    },

    {
      id: 'salecam', icon: '🏷️', weight: 6, kind: 'notice',
      name: 'Акция у поставщиков',
      prereq: () => S().equip.camera === 'none',
      apply: () => { E.addEffect('sale_camera', 60); },
      notice: () => 'Поставщики объявили скидку 20% на камеры — 60 секунд!',
    },

    {
      id: 'heavypo', icon: '🐌', weight: 7,
      name: 'Медленное ПО камеры',
      text: () => 'Обновление прошивки камеры жрёт ресурсы — линия замедляется.',
      // до обязательной маркировки контроль не ведётся — событие не имеет смысла
      prereq: () => E.requirement() > 0 && S().equip.camera !== 'none' && !E.hasResearch('sw_gpu'),
      choices: [
        {
          label: 'Купить GPU сейчас',
          cost: 1000,
          run: () => { Game.upgrades.grantResearch('sw_gpu'); return 'Аппаратное ускорение установлено.'; },
        },
        {
          label: 'Терпеть 20 с',
          run: () => { E.addEffect('slow', 20); return 'Линия замедлена на 30% в течение 20 с.'; },
        },
      ],
    },

    {
      id: 'netdown', icon: '📡', weight: 7,
      name: 'Интернет-сбой',
      text: () => 'Пропал интернет — данные не уходят в Честный знак!',
      prereq: () => S().equip.server !== 'none' && !E.hasResearch('sw_offline'),
      choices: [
        {
          label: 'Перезагрузить роутер (линия встанет на 3 с)',
          run: () => { E.pause(3); return 'Роутер перезагружен, связь восстановлена.'; },
        },
        {
          label: 'Игнорировать 12 с',
          run: () => { E.addEffect('server_down', 12); return '12 секунд боксы будут продаваться с дисконтом!'; },
        },
      ],
    },

    {
      id: 'quality', icon: '🏅', weight: 5, kind: 'notice',
      name: 'Премия за качество',
      prereq: () => S().stats.streak >= 3,
      apply: () => { S().ir += 150; },
      notice: () => 'Заказчик отметил стабильное качество партии — премия +150 ₽.',
    },

    {
      id: 'reelbreak', icon: '🧻', weight: 6,
      name: 'Порвалась лента этикеток',
      text: () => 'Рулон термоэтикеток оборвался: во время протяжки часть напечатанных кодов ушла в отходы, печать встала.',
      prereq: () => S().equip.printer === 'own',
      choices: [
        {
          label: 'Починить (80 ₽)',
          cost: 80,
          run: () => {
            // протяжка уничтожила часть напечатанных кодов
            const s = S();
            const lost = Math.floor(s.chz.labels.length * 0.4) + Math.floor(s.chz.buffer.length * 0.4);
            s.chz.labels = s.chz.labels.slice(0, Math.floor(s.chz.labels.length * 0.6));
            s.chz.buffer = s.chz.buffer.slice(0, Math.floor(s.chz.buffer.length * 0.6));
            if (lost > 0) Game.ui.log('🧻 Протяжка уничтожила ' + lost + ' этикеток с кодами.', 'bad');
            return 'Лента заправлена, печать этикеток продолжается (−' + lost + ' этикеток).';
          },
        },
        {
          label: 'Терпеть 15 с',
          run: () => {
            const s = S();
            const lost = Math.floor(s.chz.labels.length * 0.4) + Math.floor(s.chz.buffer.length * 0.4);
            s.chz.labels = s.chz.labels.slice(0, Math.floor(s.chz.labels.length * 0.6));
            s.chz.buffer = s.chz.buffer.slice(0, Math.floor(s.chz.buffer.length * 0.6));
            E.addEffect('print_off', 15);
            if (lost > 0) Game.ui.log('🧻 Протяжка уничтожила ' + lost + ' этикеток с кодами.', 'bad');
            return 'Протяжка съела ' + lost + ' этикеток, и 15 секунд они не печатаются!';
          },
        },
      ],
    },

    {
      id: 'contract', icon: '🤝', weight: 5,
      name: 'Новый контракт',
      text: () => 'Сеть магазинов предлагает контракт: выкупает продукцию на 50% дороже в течение 30 секунд.',
      prereq: () => true,
      choices: [
        {
          label: 'Подписать (+50% к цене на 30 с)',
          run: () => { E.addEffect('profit_x15', 30); return 'Контракт подписан: цена ×1.5 на 30 секунд.'; },
        },
        {
          label: 'Отказаться',
          run: () => 'Вы отказались от контракта — возможная прибыль упущена.',
        },
      ],
    },

    {
      id: 'subbotnik', icon: '⚡', weight: 5, kind: 'notice',
      name: 'Субботник на производстве',
      prereq: () => true,
      apply: () => { E.addEffect('speed_up', 20); },
      notice: () => 'Рабочие вышли в выходной — поток +25% на 20 секунд.',
    },

    {
      id: 'glare', icon: '☀️', weight: 6,
      name: 'Блики на упаковке',
      text: () => 'Солнце бьёт в камеру — половину кодов она не читает.',
      prereq: () => E.requirement() > 0 && S().equip.camera !== 'none' && !E.hasResearch('sw_antinoise'),
      choices: [
        {
          label: 'Купить Анти-шум (500 ₽)',
          cost: 500,
          run: () => { Game.upgrades.grantResearch('sw_antinoise'); return 'Блики больше не страшны.'; },
        },
        {
          label: 'Терпеть 20 с',
          run: () => { E.addEffect('camera_half', 20); return 'Камера видит вполсилы 20 секунд.'; },
        },
      ],
    },

    {
      id: 'darkness', icon: '🌑', weight: 6,
      name: 'Проблемы с освещением',
      text: () => 'Погасла подсветка зоны контроля — камера ослепла.',
      prereq: () => E.requirement() > 0 && S().equip.camera !== 'none' && !E.hasResearch('cam_night'),
      choices: [
        {
          label: 'Купить Ночной режим (600 ₽)',
          cost: 600,
          run: () => { Game.upgrades.grantResearch('cam_night'); return 'Теперь тьма не помеха.'; },
        },
        {
          label: 'Терпеть 20 с',
          run: () => { E.addEffect('camera_off', 20); return 'Камера отключена на 20 секунд!' ; },
        },
      ],
    },
  ];

  function trigger() {
    const eligible = EVENTS.filter(ev => ev.prereq() && !ev.autoSkip);
    if (!eligible.length) return;

    const total = eligible.reduce((a, ev) => a + ev.weight, 0);
    let roll = Math.random() * total;
    let ev = eligible[0];
    for (const e of eligible) {
      roll -= e.weight;
      if (roll <= 0) { ev = e; break; }
    }

    const s = S();
    s.stats.events++;

    // независимые от игрока события — просто уведомление, игра не прерывается
    if (ev.kind === 'notice') {
      if (ev.apply) ev.apply();
      Game.ui.toast(ev.icon, ev.name + ': ' + (ev.notice ? ev.notice() : ''));
      return;
    }

    Game.ui.openEvent(ev);
  }

  function choose(ev, idx) {
    const ch = ev.choices[idx];
    if (!ch) return;
    const cost = ch.cost || 0;
    // бесплатный вариант доступен всегда, даже при отрицательном балансе
    if (cost > 0 && cost > S().ir) {
      Game.ui.log('Не хватает ₽ на этот вариант.', 'bad');
      return;
    }
    if (ch.req && !ch.req()) {
      Game.ui.log('Условие не выполнено — выберите другое.', 'bad');
      return;
    }
    S().ir -= cost;
    const msg = ch.run();
    Game.ui.closeModal();
    Game.ui.log('⚡ ' + ev.name + ': ' + msg, 'info');
    Game.state.save();
  }

  return { trigger, choose, EVENTS };
})();