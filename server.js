/**
 * Простой node-сервер для игры «Честный знак: DM».
 *
 * Запуск:  node server.js            (или npm start)
 * Открыть: http://localhost:8080
 *
 * Что умеет:
 *  - раздаёт статику игры (index.html, css/, js/);
 *  - хранит рекорды в data/records.json (API /api/records).
 * API:
 *  GET    /api/records — список рекордов (топ-12 по счёту)
 *  POST   /api/records — сохранить список (body: JSON-массив)
 *  DELETE /api/records — очистить рекорды
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 8080;
const PORT_RETRY_MAX = 20; // на столько портов вперёд ищем свободный
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const RECORDS_FILE = path.join(DATA_DIR, 'records.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.md': 'text/plain; charset=utf-8',
};

/* ---------- рекорды ---------- */

function readRecords() {
  try {
    const raw = fs.readFileSync(RECORDS_FILE, 'utf8');
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}

function writeRecords(list) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const top = (Array.isArray(list) ? list : [])
    .slice(0, 12)
    .sort((a, b) => (b.score || 0) - (a.score || 0));
  fs.writeFileSync(RECORDS_FILE, JSON.stringify(top, null, 2), 'utf8');
  return top;
}

function handleApi(req, res, body) {
  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(readRecords()));
    return;
  }
  if (req.method === 'POST') {
    let list;
    try { list = JSON.parse(body || '[]'); } catch (e) { list = []; }
    const top = writeRecords(list);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(top));
    return;
  }
  if (req.method === 'DELETE') {
    writeRecords([]);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end('[]');
    return;
  }
  res.writeHead(405).end('Method Not Allowed');
}

/* ---------- статика ---------- */

function safeResolve(urlPath) {
  let clean = decodeURIComponent(urlPath.split('?')[0]);
  if (clean === '/' || clean === '') clean = '/index.html';
  const target = path.normalize(path.join(ROOT, clean));
  if (!target.startsWith(ROOT + path.sep) && target !== ROOT) return null; // защита от выхода из каталога
  return target;
}

function handleRequest(req, res) {
  const urlPath = req.url || '/';

  if (urlPath.startsWith('/api/records')) {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => handleApi(req, res, body));
    return;
  }

  const file = safeResolve(urlPath);
  if (!file) { res.writeHead(403).end('Forbidden'); return; }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404: ' + urlPath);
      return;
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

/* поднимаем сервер; если порт занят — ищем свободный дальше */
function startAt(port) {
  const app = http.createServer(handleRequest);
  app.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && port < PORT + PORT_RETRY_MAX) {
      console.log('  ⚠️ Порт ' + port + ' уже занят — пробую ' + (port + 1) + ' …');
      startAt(port + 1);
      return;
    }
    console.error('  ❌ Не удалось поднять сервер:', err.message);
    if (err.code === 'EADDRINUSE') {
      console.error('     Порты от ' + PORT + ' до ' + (PORT + PORT_RETRY_MAX) + ' заняты.');
      console.error('     Задайте другой стартовый порт:  $env:PORT=9090 ; node server.js');
    }
    process.exit(1);
  });
  app.listen(port, () => {
    console.log('');
    console.log('  🏭 Игра «Честный знак: DM» запущена');
    console.log('  → http://localhost:' + port);
    console.log('  Рекорды: ' + RECORDS_FILE);
    console.log('');
    if (port !== PORT) console.log('  (порт ' + PORT + ' был занят — используем ' + port + ')');
    console.log('');
  });
}
startAt(PORT);