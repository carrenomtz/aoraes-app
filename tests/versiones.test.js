// Comprueba que las versiones (?v=) de index.html coinciden con el contenido real de cada archivo. Sin dependencias: `node tests/versiones.test.js`.
// Si falla: `node scripts/versiones.js` las recalcula, y se vuelve a subir index.html junto con los archivos cambiados.
const assert = require('assert');
const v = require('../scripts/versiones.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message); } }

test('index.html carga archivos propios con ?v= y todos existen', () => {
  const r = v.revisar(); assert(r.length >= 6, 'se esperaban al menos 6 archivos con versión, hay ' + r.length);
  r.forEach((x) => assert(x.existe, x.archivo + ' no existe'));
});
test('cada versión de index.html es la huella actual de su archivo (si falla: node scripts/versiones.js)', () => {
  const mal = v.revisar().filter((x) => x.puesta !== x.actual).map((x) => x.archivo + ' (' + x.puesta + ' ≠ ' + x.actual + ')');
  assert.deepStrictEqual(mal, []);
});
test('la revisión detecta una versión desactualizada y no inventa errores', () => {
  const falso = '<script src="./calc.js?v=00000000"></script><script src="./leads.js?v=' + v.huella('leads.js') + '"></script>';
  const r = v.revisar(falso);
  assert.strictEqual(r.length, 2); assert.strictEqual(r[0].puesta !== r[0].actual, true); assert.strictEqual(r[1].puesta, r[1].actual);
});
console.log('\n' + passed + ' correctas, ' + failed + ' fallidas');
process.exit(failed ? 1 : 0);
