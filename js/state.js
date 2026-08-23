/* ================================================================
   state.js — состояние игры, сохранение в localStorage
   Глобальное пространство имён: window.Game
   ================================================================ */

const Game = window.Game = {};

const SAVE_KEY = 'dmg_save_v1';

function defaultState() {
  return {
    v: CFG.VERSION,
    t: 0,                    // секунды с начала партии
    ir: CFG.START_CAPITAL,   // инновационные рубли
    zsh: 0,                  // золотые шестерёнки (донат, пока не активен)
    phase: 'prep',           // 'prep' | 'post' | 'over' | 'won'

    // оборудование (стадии)
    equip: {
      printer: 'none',
      camera: 'none',
      rejector: 'none',
      server: 'none',
    },
    research: [],            // id купленных апгрейдов
    printerWear: 0,

    // производство
    lines: 1,
    spawnAcc: 0,
    boxes: [],               // живые боксы на ленте
    manualCd: 0,             // кулдаун ручной маркировки
    manualRegCd: 0,          // кулдаун ручной передачи
    manualScanCd: 0,         // кулдаун ручного сканирования
    serviceBusy: 0,          // сек до конца обслуживания принтера

    // статистика партии
    difficulty: 'standard',  // сложность: easy | standard | hard (задаёт бюджет и темп)
    deadlineS: null,         // индивидуальный дедлайн (зависит от сложности)
    auditS: null,            // индивидуальный момент аудита
    health: { printer: 1, camera: 1, rejector: 1, server: 1 }, // здоровье модулей (0–1)
    stickerAcc: 0,           // «руки» нанятого наклейщика (готовые к наклейке этикетки)
    upgradeLevels: {},       // уровни прокачиваемых улучшений (id → 1..10)
    warehouseMax: CFG.WAREHOUSE_MAX, // вместимость склада
    printerModes: { typography: false, own: false }, // купленные режимы маркировки
    batch: { no: 1, qty: CFG.BATCH_INIT_QTY, start: { produced: 0, marked: 0, registered: 0, earned: 0 } }, // производственная партия
    stats: {
      produced: 0, marked: 0, registered: 0,
      defectsCaught: 0, defectsShipped: 0, unregistered: 0,
      sold: 0, streak: 0, events: 0, fines: 0, badStreak: 0, returns: 0,
      markLog: [],           // последние завершённые продукты: {m:1|0} — был ли код DM
      totalEarned: 0,        // всего заработано за партию (для итогов)
      shipLog: [],           // последние отгрузки: {reg:0|1, t}
    },

    // активные временные эффекты: {id, until, data}
    effects: [],

    // события
    nextEventAt: CFG.EVENT_FIRST_AT_S,

    // контрольные точки
    deadlineDone: false,     // проверено ли условие Часа Ч
    auditDone: false,
    graceDone: false,        // льготный период закончился (обязательная маркировка введена)

    // Честный знак: коды, этикетки, отчёты партиями
    chz: {
      pool: [],              // заказанные коды ЧЗ (не напечатаны)
      labels: [],            // этикетки на установленном рулоне (тратятся наклейкой)
      buffer: [],            // буферный рулон (наполняет принтер; ставится на место пустого)
      ordering: false,       // идёт генерация заказа
      orderDoneAt: 0,        // игровое время завершения генерации
      printAcc: 0,           // аккумулятор печати этикеток
    },
    sentCodes: [],           // коды, уже отправленные в ЧЗ (для проверки дублей)
    productType: null,       // единственный тип продукта завода (выбирается на старте)
    contracts: [],           // активные контракты заказчиков
    contractSeq: 0,
    nextContractAt: CFG.CONTRACT_FIRST_AT,
    frustration: 0,          // брак подряд — сотрудники злятся
    strike: false,           // оператор остановил производство из-за брака
    pending: [],             // продукты, ждущие отправки отчёта партией
    scrap: [],               // брак-лоток (можно вернуть на линию)
    batchTimer: 0,           // таймер автоотправки отчётов
    batchNo: 0,              // номер последней отправленной партии
    batchSendCd: 0,          // кулдаун ручной отправки партии

    // служебные счётчики
    boxSeq: 0,
    pauseUntil: 0,           // до какого игрового времени стоит линия
    saveAcc: 0,
    cCheckAcc: 0,
    camBudget: 0,             // бюджет считывания камеры: X кодов в секунду
    negTimer: 0,             // сколько секунд баланс в минусе (до банкротства)

    // состояние интерфейса (не сохраняется смысл, но удобно держать вместе)
    ui: { banner: '', bannerUntil: 0 },
  };
}

function saveGame() {
  try {
    // копируем только данные: живые боксы и DOM-ссылки в сейв не попадают
    const copy = Object.assign({}, Game.S);
    copy.boxes = undefined;
    copy.ui = undefined;
    localStorage.setItem(SAVE_KEY, JSON.stringify(copy));
  } catch (e) { /* localStorage недоступен — играем без сохранений */ }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || !s.equip) return null;
    // подмешиваем дефолты, чтобы новые поля не ломали старые сейвы
    const d = defaultState();
    for (const k of Object.keys(d)) if (s[k] === undefined) s[k] = d[k];
    for (const k of Object.keys(d.stats)) if (s.stats[k] === undefined) s.stats[k] = d.stats[k];
    // старые сейвы: купленный режим принтера отмечаем как владение
    if (s.equip.printer !== 'none') {
      s.printerModes = s.printerModes || { typography: false, own: false };
      if (s.equip.printer === 'typography' || s.equip.printer === 'own') s.printerModes[s.equip.printer] = true;
    }
    s.t = Math.min(s.t, CFG.AUDIT_AT_S + 3600);
    s.effects = s.effects || [];
    s.research = s.research || [];
    s.boxes = [];
    return s;
  } catch (e) {
    return null;
  }
}

function resetSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* noop */ }
}

function newGame() {
  Game.S = defaultState();
  Game.S.boxes = [];
  resetSave();
}

Game.state = {
  default: defaultState,
  new: newGame,
  save: saveGame,
  load: loadGame,
  reset: resetSave,
};