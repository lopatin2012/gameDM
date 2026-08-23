/* ================================================================
   run.js — исполнитель тестов: запускает все tests/*_test.js
   Использование: node tests/run.js
   ================================================================ */

'use strict';
const fs = require('fs');
const path = require('path');
const harness = require('./harness');

const files = fs.readdirSync(__dirname)
  .filter(f => f.endsWith('_test.js'))
  .sort();

let total = 0;
let passedSuites = 0;
const failures = [];
const suiteStats = [];

for (const file of files) {
  const mod = require(path.join(__dirname, file));
  let suitePass = 0;
  let suiteFail = 0;
  const helper = Object.assign({}, harness, {
    test(name, fn) {
      try {
        fn();
        suitePass++;
        console.log('   ✓ ' + name);
      } catch (e) {
        suiteFail++;
        failures.push({ suite: file, name, err: e.message });
        console.log('   ✗ ' + name + '  →  ' + e.message);
      }
      total++;
    },
    assert(cond, msg) {
      if (!cond) throw new Error(msg || 'assertion failed');
    },
  });

  console.log('▶ ' + file);
  try {
    const r = mod(helper);
    if (r && typeof r.then === 'function') {
      throw new Error('тесты должны быть синхронными (модуль вернул Promise)');
    }
  } catch (e) {
    suiteFail++;
    failures.push({ suite: file, name: '(запуск модуля)', err: e.message });
    console.log('   ✗ (запуск модуля): ' + e.message);
  }
  suiteStats.push({ file, pass: suitePass, fail: suiteFail });
  if (suiteFail === 0) passedSuites++;
}

console.log('\n========== ИТОГ ==========');
for (const s of suiteStats) {
  console.log('  ' + s.file + ': ' + s.pass + ' ✓ / ' + s.fail + ' ✗');
}
console.log('Всего тестов: ' + total + ', провалено: ' + failures.length + ' (сюит полностью: ' + passedSuites + '/' + suiteStats.length + ')');
process.exit(failures.length ? 1 : 0);