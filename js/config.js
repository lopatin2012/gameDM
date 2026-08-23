/* ================================================================
   config.js — ВСЕ крутилки баланса и статичные данные игры
   ================================================================ */

const CFG = {
  VERSION: '0.1.0',

  /* --- время --- */
  DEADLINE_S: 600,        // Час Ч: 10 минут реального времени
  AUDIT_AT_S: 900,        // аудит через 5 минут после дедлайна (итого 15 мин)
  RETURN_BAD_CHANCE: 0.5, // шанс ВОЗВРАТА продукта с мыльным DM, проскочившего камеру (штраф = цена)
  EVENT_EVERY_S: 30,      // событие каждые 30 секунд
  EVENT_FIRST_AT_S: 22,   // первое событие
  SAVE_EVERY_S: 10,       // автосохранение
  GRACE_S: 45,            // льготный период: до этого момента продукция продаётся без DM без штрафов

  /* --- экономика --- */
  START_CAPITAL: 400,     // стартовый капитал ₽
  BANKRUPT_AT: -1200,     // ниже этой отметки — банкротство
  BASE_SPAWN_S: 1.3,      // бокс каждые 1.3 с на одну линию
  BOX_VALUE: 10,          // стоимость хорошего бокса, ₽
  UNREGISTERED_RATIO: 0.5,// непереданный в ЧЗ бокс продаётся с дисконтом 50%
  DEFECT_RETURN: 15,      // рекламация за брак, доехавший до конца (₽ минус; резерв)
  TYPO_MARK_FEE: 1,       // типография снимает 1 ₽ с каждого промаркированного бокса
  MANUAL_STICK_CD_S: 0.32,  // ручная наклейка этикетки: клик в 0.32 с
  CLICK_ZONE_MAX: 0.36,     // наклеить этикетку можно, пока продукт не прошёл 36% ленты
  SCAN_ZONE_MIN: 0.42,      // зона сканирования — 42%–60% ленты
  SCAN_ZONE_MAX: 0.60,
  BANKRUPT_GRACE_S: 10,   // сколько секунд можно быть в минусе, чтобы исправиться
  STREAK_MAX: 10,         // серия без брака (множитель до 1.8)
  STREAK_MULT_STEP: 0.08,
  AUTO_SHIP_BONUS: 0.2,   // +20% цена с «Автоматизацией отгрузки»

  /* --- Честный знак: коды, этикетки, отчёты партиями --- */
  ORDER_CODE_GEN_S: 15,     // генерация заказа кодов в ЧЗ
  ORDER_CODE_BATCH: 200,    // кодов в одном заказе
  POOL_MAX: 400,            // максимум заказанных кодов (одновременно один заказ)
  ROLL_MAX: 90,             // этикеток в рулоне (базовый, без «принтера-аппликатора»)
  PRINT_RATE_TYPO: 1.2,     // этикеток/с (типография — код сразу на продукт)
  PRINT_RATE_OWN: 3.6,      // этикеток/с (свой принтер) — печать в 2 раза быстрее
  FASTPRINT_MULT: 2,        // «Скоростная печать»: ×2
  TAPE_MULT: 1.5,           // «Ускоренная подача в рулон»: +50%
  STICKER_STOP_AT: 15,      // рулон меньше этого числа — линия стоит, ждём печать
  STICKER_BASE_RATE: 0.5,   // человек клеит базово 0.5 шт/с
  STICKER_SKILL_STEP: 0.25, // «Навык наклейщика»: +0.25 шт/с за уровень
  APPLICATOR_ROLL: 200,     // «Принтер-аппликатор»: рулон сразу 200
  APPLICATOR_STEP: 134,     // каждый уровень «Ёмкости рулона»: +134 (200→334→468→600)
  APPLICATOR_MAX: 600,      // потолок рулона (3 улучшения размера)
  AUTO_ORDER_THRESHOLD: 40, // автозаказ при суммарном запасе ниже
  SCAN_ERR_HUMAN: 0.33,     // человек со сканером ошибается в 33% случаев
  SCAN_ERR_CAMERA: 0.15,    // камера базовая
  SCAN_ERR_CAMERA_SOFT: 0.02, // камера + ПО «Чёткость»
  BATCH_MAX: 8,             // автоотправка при накоплении N продуктов
  BATCH_TIMER_S: 12,        // или по таймеру
  WAREHOUSE_MAX: 40,        // вместимость склада (хранилище готовой продукции)
  FOREIGN_CODE_CHANCE: 0.03,// шанс наклеить «код чужого продукта» при наклейке
  SCAN_RETRY_X: 0.38,       // точка перепроверки (плавно возвращаемся к сканеру)
  STICK_RETRY_X: 0.02,      // точка переклейки (перед зоной наклейки)
  POOL_GTIN: '0463',        // GTIN предприятия (все коды одного продукта)

  /* --- контракты заказчиков --- */
  CONTRACT_FIRST_AT: 60,    // первый контракт появляется
  CONTRACT_COOLDOWN_S: 45,  // пауза между контрактами
  CONTRACT_QTY_MIN: 5,
  CONTRACT_QTY_MAX: 12,
  CONTRACT_DUE_MIN_S: 180,  // срок выполнения: 3–5 игровых дней (успеваем накопить)
  CONTRACT_DUE_MAX_S: 300,
  CONTRACT_REWARD_MULT: 1.5,// бонус к базовой цене за своевременное выполнение
  CONTRACT_FAIL_FINE: 30,   // штраф за срыв срока

  /* --- производство --- */
  TURBO_MULT: 1.5,        // турбо-конвейер: +50% к потоку
  TURBO_MISS: 0.05,       // но 5% кодов теряется без буфера памяти
  WEAR_PER_S: 0.012,      // износ собственного принтера в секунду (0..1)
  WEAR_THERMO_MULT: 1.5,  // термотрансфер ускоряет износ
  WEAR_AUTO_CLEAN_AT: 0.55,  // автоочистка сбрасывает износ на этом уровне
  SERVICE_COST: 30,       // обслуживание принтера
  SERVICE_PAUSE_S: 2,     // пауза линии при обслуживании
  DEFECT_TYPOGRAPHY: 0.05,    // брак типографии 5%
  DEFECT_OWN_BASE: 0.02,      // базовый брак своего принтера
  DEFECT_WEAR_K: 0.35,        // брак растёт с износом: base + wear * K
  CAMERA_CATCH_BASIC: 0.85,   // камера ловит 85% брака
  CAMERA_CATCH_SOFT: 1.0,     // с ПО «Чёткость» — 100%
  LINE2_COST: 3000,
  WIDE_LENS_COVERS: 2,        // широкий объектив покрывает обе линии

  /* --- штраф «Проверка партии» --- */
  COMPLIANCE_CHECK_EVERY_S: 20,
  COMPLIANCE_WINDOW: 25,      // последние 25 отгрузок
  PREP_FINE: 80,              // базовый штраф проверки, ₽

  /* --- терпение оператора --- */
  STRIKE_AT: 15,              // при таком числе брака подряд оператор останавливает производство

  /* --- аудит --- */
  AUDIT_SHARE_REQ: 0.9,       // победа при доле регистрации >= 90%

  /* --- производственная партия --- */
  BATCH_INIT_QTY: 50,         // стартовый размер партии
  BATCH_MIN_QTY: 10,          // минимум
  BATCH_MAX_QTY: 100,         // потолок (лимит растёт с производительностью)

  /* --- камера: пропуск кода --- */
  CAM_MISS_BASE: 0.02,        // базовый шанс «не прочитать»
  CAM_MISS_STEP: 0.0018,      // снижение за каждый уровень модельного ряда
  CAM_SPEED_BASE: 2,          // камера считывает 2 кода в секунду (улучшения ускоряют)
};

/* --- стадии оборудования (покупаются по порядку, стадия.id хранится в состоянии) --- */

const PRINTER_STAGES = [
  { id: 'none', label: 'Нет печати кода', icon: '🖨️', desc: 'Продукт без кода. До обязательной маркировки это нормально; после — брак. Наклейка вручную невозможна без печати.', cost: 0 },
  { id: 'typography', label: 'Типография: код сразу на продукт', icon: '🖨️',
    desc: 'Подрядчик печатает DM прямо на продукт на линии — проклеивать не нужно. Каждый код в 3 раза дороже (3 ₽/шт), брак 5%.',
    cost: 150 },
  { id: 'own', label: 'Свой принтер этикеток', icon: '🛠️',
    desc: 'Печать этикеток на рулон стоит копейки (0 ₽/шт). Оператор клеит их сам, но медленно — не все продукты успевают получить код. «Наклейщик» ускоряет.',
    cost: 800 },
];

const CAMERA_STAGES = [
  { id: 'none', label: 'Нет проверки кода', icon: '📷',
    desc: 'Коды не проверяются: контракты и отчёты недоступны, продукция уходит на рынок с дисконтом −50%.',
    cost: 0 },
  { id: 'basic', label: 'Камера проверки DM', icon: '📷',
    desc: 'Проверяет каждый код: качество печати, дубли, чужие коды. Открывает контракты и полную цену.',
    cost: 800 },
];

const REJECTOR_STAGES = [
  { id: 'none', label: 'Брак-лоток ручной', icon: '🗑️', desc: 'Брак копится в лотке — возвращайте на переклейку вручную.', cost: 0 },
  { id: 'basic', label: 'Отбраковщик', icon: '🗑️',
    desc: 'Автоматически возвращает брак на переклейку. С апгрейдами — до 2 раз и с учётом причин.',
    cost: 500 },
];

const SERVER_STAGES = [
  { id: 'none', label: 'Нет сервера ЧЗ', icon: '🌐', desc: 'Отчёты отправляются только вручную (кнопка «Отправить партию»).', cost: 0 },
  { id: 'basic', label: 'Сервер ОФД / Маркировка', icon: '🌐',
    desc: 'Отчёты уходят в Честный знак партиями автоматически: каждые ' + CFG.BATCH_MAX + ' единиц или раз в ' + CFG.BATCH_TIMER_S + ' секунд.',
    cost: 1500 },
];

/* --- дерево прокачки (research) ---
   eq: к какому оборудованию относится ветка: printer | camera | rejector | server | shop
   req: строка — проверяется предикатом из upgrades.js */

const UPGRADES = {
  /* МАРК₽ОВКА (печать этикеток) */
  prn_laser: { eq: 'printer', name: 'Лазерная гравировка', cost: 4500,
    desc: 'Вечная печать: принтер не изнашивается, брак минимальный.', req: 'printer_own' },
  prn_autoclean: { eq: 'printer', name: 'Автоочистка', cost: 1000,
    desc: 'Здоровье принтера не опускается ниже 30% — ремонтируйте реже.', req: 'printer_installed' },
  prn_tape: { eq: 'printer', name: 'Ускоренная подача в рулон', cost: 900,
    desc: 'Скорость печати этикеток в рулон выше на 50%.', req: 'printer_own' },
  prn_swap: { eq: 'printer', name: 'Автозамена рулона', cost: 1200,
    desc: 'Установка рулона из буфера приходит мгновенно, без ручной возни. Если буфер пуст — ждём печать.', req: 'printer_own' },
  prn_applicator: { eq: 'printer', name: 'Принтер-аппликатор', cost: 2500,
    desc: 'Принтер клеит этикетки сам со скоростью печати, а рулон сразу 200 (вместо 90).', req: 'printer_own' },
  prn_rollsize: { eq: 'printer', name: 'Ёмкость рулона', cost: 900, levels: 3,
    desc: '+133 этикетки в рулоне за уровень. Максимум — 600.', req: 'prn_applicator' },
  prn_accel: { eq: 'printer', name: 'Принтер: модельный ряд', model: 'PrintMark', cost: 700, levels: 20,
    desc: '+25% к скорости печати этикеток за модель (до 20 моделей).', req: 'printer_installed' },
  prn_quality: { eq: 'printer', name: 'Качество печати', cost: 600, levels: 20,
    desc: 'Шанс брака печати меньше на 0.1% за уровень (до 20).', req: 'printer_installed' },
  prod_fastprint: { eq: 'printer', name: 'Скоростная печать этикеток', cost: 1200,
    desc: 'Печать этикеток ещё в 2 раза быстрее (поверх модельного ряда).', req: 'printer_installed' },
  sticker_skill: { eq: 'printer', name: 'Навык наклейщика (человек)', cost: 100, costPerLevel: true, levels: 100,
    desc: 'Каждый уровень = +0.25 наклейки DM в секунду (освоение рабочего).', req: 'printer_installed' },

  /* ПРОВЕРКА (камера) */
  cam_software: { eq: 'camera', name: 'Чёткость распознавания', cost: 600,
    desc: 'Камера ловит и смазанные коды (брак печати — в лоток автоматически).', req: 'camera_installed' },
  cam_night: { eq: 'camera', name: 'Ночной режим', cost: 600,
    desc: 'Иммунитет к событию «Проблемы с освещением».', req: 'camera_installed' },
  cam_wide: { eq: 'camera', name: 'Широкий объектив', cost: 1500,
    desc: 'Покрывает обе линии — вторая линия тоже проверяется.', req: 'camera_installed' },
  sw_antinoise: { eq: 'camera', name: 'Анти-шум', cost: 500,
    desc: 'Иммунитет к «Бликам на упаковке».', req: 'camera_installed' },
  sw_buffer: { eq: 'camera', name: 'Буфер памяти сканера', cost: 600,
    desc: 'Турбо-конвейер больше не теряет коды при проверке.', req: 'camera_installed' },
  sw_gpu: { eq: 'camera', name: 'Аппаратное ускорение (GPU)', cost: 1000,
    desc: 'Иммунитет к «Тяжёлому ПО»: лента не замедляется.', req: 'camera_installed' },
  cam_accel: { eq: 'camera', name: 'Камера: модельный ряд', model: 'ReaderDM', cost: 800, levels: 10,
    desc: '+20% к скорости считывания кодов в секунду и −0.18% пропуска за модель.', req: 'camera_installed' },
  cam_light: { eq: 'camera', name: 'Промышленное освещение', cost: 1500,
    desc: 'Вспышка камеры отключается за счёт постоянной подсветки, а скорость сканирования растёт на 25% (пропусков меньше).', req: 'camera_installed' },

  /* ОТБРАКОВКА (отбраковщик) */
  rej_duo: { eq: 'rejector', name: 'Двухступенчатая отбраковка', cost: 700,
    desc: 'Брак возвращается на переклейку до 2 раз и пропуски брака падают на −2%.', req: 'rejector_installed' },
  rej_order: { eq: 'rejector', name: 'Учёт брака', cost: 500,
    desc: 'Оператор видит причины брака и злится вдвое медленнее.', req: 'rejector_installed' },
  rej_accel: { eq: 'rejector', name: 'Отбраковщик: модельный ряд', model: 'RejectX', cost: 600, levels: 10,
    desc: 'Оператор злится на 5% медленнее за модель, а пропуски брака падают на −0.5% за модель.', req: 'rejector_installed' },

  /* ОТЧЁТЫ (сервер) */
  sw_offline: { eq: 'server', name: 'Офлайн-режим', cost: 1200,
    desc: 'Иммунитет к «Интернет-сбою»: сервер живёт в офлайне.', req: 'server_installed' },
  spd_autoship: { eq: 'server', name: 'Автоматизация отгрузки', cost: 800,
    desc: '+20% к цене каждого проданного продукта.', req: null },
  srv_fast: { eq: 'server', name: 'Быстрые отчёты', cost: 900,
    desc: 'Автоотправка отчётов раз в 6 секунд вместо 12.', req: 'server_installed' },

  /* ЦЕХ (общее) */
  prod_autoorder: { eq: 'shop', name: 'Автозаказ кодов ЧЗ', cost: 400,
    desc: 'Заказы кодов уходят заранее: порог = запас на 100 секунд работы линии (1 шт/с → 100, 2 шт/с → 200).', req: null },
  spd_turbo: { eq: 'shop', name: 'Турбо-конвейер', cost: 1500,
    desc: '+50% к потоку. Без буфера камера теряет 5% кодов.', req: null },
  spd_accel: { eq: 'shop', name: 'Разгон конвейера', cost: 1200, levels: 10,
    desc: '+20% к потоку продукции за уровень.', req: null },
  spd_line2: { eq: 'shop', name: 'Вторая линия', cost: 3000,
    desc: 'Второй поток. Без широкого объектива вторая линия не проверяется — прибыль теряется.', req: null },
  quality_grade: { eq: 'shop', name: 'Качество продукта', cost: 1000, levels: 10,
    desc: 'Чем выше уровень, тем чаще на линии выпадают дорогие сорта (премиум ×1.3, люкс ×1.7, элитный ×2.2).', req: null },
  wh_capacity: { eq: 'shop', name: 'Склад: расширение', cost: 1200, levels: 10,
    desc: '+30 мест на складе готовой продукции за уровень.', req: null },
  wh_climate: { eq: 'shop', name: 'Климат-контроль склада', cost: 1000, levels: 10,
    desc: 'Удачных продаж больше: шанс рекламации падает на 1% за уровень.', req: null },
  wh_trade: { eq: 'shop', name: 'Отгрузка без потерь', cost: 900, levels: 10,
    desc: '+2% к цене продаж со склада за уровень (меньше потерь при отгрузке).', req: null },
  prod_support: { eq: 'shop', name: 'Сервисная служба', cost: 1500,
    desc: 'Оборудование изнашивается в 2 раза медленнее.', req: null },
};

/* --- виды продукции (по конвейеру — только один тип; от типа зависит доход) --- */
const PRODUCTS = [
  { icon: '🥫', name: 'Консервы', months: 36, value: 14 },
  { icon: '🧴', name: 'Шампунь', months: 24, value: 12 },
  { icon: '🥛', name: 'Молоко', months: 1, value: 9 },
  { icon: '🧃', name: 'Соки', months: 9, value: 8 },
  { icon: '🥤', name: 'Напитки', months: 6, value: 6 },
];

/* эталонная цена для скорости линии: дешевле продукт → быстрее линия/нанесение/сканирование */
const BASE_PRODUCT_VALUE = 14;

/* --- сложность партии: бюджет, темп и множитель рекордов --- */
const DIFFICULTY = {
  easy: { label: '🟢 Лёгкий', budget: 700, deadlineMult: 1.2, fineMult: 0.6, scoreMult: 0.7 },
  standard: { label: '⚪ Стандарт', budget: 400, deadlineMult: 1.0, fineMult: 1.0, scoreMult: 1 },
  hard: { label: '🔴 Хардкор', budget: 150, deadlineMult: 0.8, fineMult: 1.5, scoreMult: 3 },
  endless: { label: '∞ Бесконечный', budget: 500, deadlineMult: Infinity, fineMult: 1, scoreMult: 1.5 },
};

/* --- здоровье и ремонт оборудования --- */
const WEAR_RATE = 0.003,       // износ модуля в секунду (100% за ~330 с)
      REPAIR_COST = { printer: 120, camera: 200, rejector: 120, server: 300 },
      STICKER_RATE = 0.55,     // запасной параметр (не используется — см. навык наклейщика)
      BASE_STICKER_RATE = 0.35,// запасной параметр (не используется)
      STICKER_BUFFER = 1.2;    // минимум «рук» наклейщика (вместимость растёт со скоростью)

/* --- названия в UI --- */
const STREAK_LABEL = 'Наценка'; // множитель цены за серию без брака

/* ================================================================
   Реалистичный DataMatrix: рисуем на canvas.
   Структура как у настоящего символа:
   – сплошные чёрные линии слева и снизу (Finder pattern «L»);
   – пунктирные «Clock track» сверху и справа;
   – ячейки данных внутри (детерминированный узор от строки кода).
   ================================================================ */
function renderDataMatrix(canvas, code, blurred, damaged) {
  const size = canvas.width;
  if (!size || typeof canvas.getContext !== 'function') return;
  // модулей по стороне: мелкий глиф — крупнее ячейки (чётче), крупный — детальнее
  const n = Math.max(12, Math.min(22, Math.round(size / 2.2)));
  const quiet = 1;         // «тихое» белое поле
  const cell = size / (n + quiet * 2);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  // псевдослучайные данные, стабильные для одной строки кода
  let h = 2166136261;
  const str = String(code || '');
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(h ^ str.charCodeAt(i), 16777619)) >>> 0;
  }
  function rnd() {
    h = (Math.imul(h ^ (h >>> 15), 2246822507)) >>> 0;
    h ^= h >>> 13;
    return (h >>> 0) / 4294967296;
  }

  const cells = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      let black;
      if (c === 0 || r === n - 1) black = true;        // Finder «L»
      else if (r === 0) black = (c % 2 === 0);         // Clock сверху
      else if (c === n - 1) black = (r % 2 === 0);     // Clock справа
      else black = rnd() < 0.45;                       // данные
      if (black) cells.push({ x: (quiet + c) * cell, y: (quiet + r) * cell });
    }
  }
  // ЧЁТКИЙ код — камера его видит
  ctx.fillStyle = '#000000';
  cells.forEach(cl => ctx.fillRect(cl.x, cl.y, Math.ceil(cell), Math.ceil(cell)));

  // СМАЗАННЫЙ код — камера его НЕ прочитает (брак печати)
  if (blurred) {
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#222222';
    const dx = cell * 0.6, dy = cell * 0.25;
    cells.forEach(cl => ctx.fillRect(cl.x + dx, cl.y + dy, Math.ceil(cell), Math.ceil(cell)));
    ctx.globalAlpha = 0.25;
    cells.forEach(cl => ctx.fillRect(cl.x - dx * 0.6, cl.y + dy * 0.4, Math.ceil(cell), Math.ceil(cell)));
    // грязные полосы-мазки по коду
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#444444';
    for (let i = 0; i < 5; i++) {
      const ax = rnd(), ay = rnd();
      ctx.fillRect(ax * size, ay * size, cell * 3, Math.max(1.2, cell * 0.5));
    }
    ctx.globalAlpha = 1;
  }

  // ПОВРЕЖДЁННЫЙ код — затёртые ячейки и царапины (после повторной переклейки)
  if (damaged) {
    ctx.fillStyle = '#ffffff';
    const holes = Math.max(2, Math.floor(cells.length * 0.08));
    for (let i = 0; i < holes; i++) {
      const c = cells[Math.floor(rnd() * cells.length)];
      ctx.fillRect(c.x, c.y, Math.ceil(cell), Math.ceil(cell));
      if (i % 3 === 0) ctx.fillRect(c.x + cell * 0.3, c.y + cell * 0.3, Math.ceil(cell * 0.4), Math.ceil(cell * 0.4));
    }
    ctx.fillStyle = 'rgba(170,170,170,.5)';
    for (let i = 0; i < 4; i++) {
      const y = rnd() * size;
      ctx.fillRect(rnd() * size, y, size * (0.15 + rnd() * 0.3), Math.max(1, cell * 0.35));
    }
    ctx.fillStyle = '#000000';
  }
}

/* --- причины брака (показываются в модуле отбраковки и паспорте) --- */
const BRAK_REASONS = {
  scan: 'ошибка сканера — перепроверьте',
  quality: 'плохое качество кода',
  missing: 'отсутствие кода',
  foreign: 'код другого продукта',
  dup: 'дубль кода DM',
  expired: 'истёк срок годности — в утиль',
};

/* --- утилиты (общие для всех модулей) --- */
function fmt(n) {
  n = Math.round(n);
  return n.toLocaleString('ru-RU');
}
/* рубль с правильным склонением: 1 рубль · 2 рубля · 5 рублей */
function rub(n) {
  const a = Math.abs(Math.round(n));
  const u = a % 10, h = a % 100;
  if (u === 1 && h !== 11) return a.toLocaleString('ru-RU') + ' рубль';
  if (u >= 2 && u <= 4 && (h < 12 || h > 14)) return a.toLocaleString('ru-RU') + ' рубля';
  return a.toLocaleString('ru-RU') + ' рублей';
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function rand(min, max) { return min + Math.random() * (max - min); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/* --- уникальный код DataMatrix для каждой единицы продукции --- */
/* Формат по мотивам GS1: (01)GTIN(21)серийный номер */
function genDataMatrix() {
  const digits = () => Math.floor(Math.random() * 10);
  const gtin = CFG.POOL_GTIN + Array.from({ length: 10 }, digits).join('');
  const sym = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
  const serial = Array.from({ length: 10 }, () => sym[Math.floor(Math.random() * sym.length)]).join('');
  return '(01)' + gtin + '(21)' + serial;
}

/* дата маркировки и срок годности: 1 игровая минута = 1 день */
function labelDates(gameSeconds, product) {
  const daysPassed = Math.floor(gameSeconds / 60);
  const month = 1 + Math.floor(daysPassed / 28);
  const day = 15 + (daysPassed % 28);
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  const expMonthsTotal = (month - 1) + product.months;
  const expMonth = (expMonthsTotal % 12) + 1;
  const expYear = 25 + Math.floor(expMonthsTotal / 12);
  return {
    prodDate: dd + '.' + mm + '.25',
    expDate: dd + '.' + String(expMonth).padStart(2, '0') + '.' + String(expYear).padStart(2, '0'),
  };
}