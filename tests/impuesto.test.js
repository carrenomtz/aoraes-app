// Pruebas de impuesto.js (§32a EStG 2026), la única copia de la tarifa del impuesto sobre la renta que usan Jubilación y Análisis. `node tests/impuesto.test.js`.
// La tarifa de referencia está escrita aparte, tal como la publica la ley (cuota por zonas), y sirve para contrastar la cuota, el tipo marginal y los ahorros.
const fs = require('fs'), path = require('path'), assert = require('assert');
const I = require('../impuesto.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message); } }
const near = (a, b, t, m) => assert(Math.abs(a - b) <= t, (m || '') + ' esperado ' + b + ' obtenido ' + a);
const T = (x) => { x = Math.floor(x); if (x <= 12348) return 0; if (x <= 17799) { const y = (x - 12348) / 10000; return (914.51 * y + 1400) * y; }
  if (x <= 69878) { const z = (x - 17799) / 10000; return (173.10 * z + 2397) * z + 1034.87; } if (x <= 277825) return 0.42 * x - 11135.63; return 0.45 * x - 19470.38; };
const Tley = (x) => Math.floor(T(x));

console.log('\nCuota y tipo marginal');
test('año y mínimo exento: 2026 y Grundfreibetrag de 12.348 €', () => { assert.strictEqual(I.ANIO, 2026); assert.strictEqual(I.GRUNDFREIBETRAG, 12348); assert.strictEqual(I.cuota(12348), 0); assert.strictEqual(I.cuota(0), 0); assert.strictEqual(I.cuota(-500), 0); });
test('la cuota coincide con la tarifa de la ley en todas las zonas y en los límites de zona (redondeada hacia abajo a euros enteros)', () => {
  [12349, 15000, 17799, 17800, 30000, 46800, 60000, 69878, 69879, 100000, 277825, 277826, 400000].forEach((x) => assert.strictEqual(I.cuota(x), Tley(x), 'zvE ' + x));
  assert.strictEqual(I.cuota(46800.9), I.cuota(46800), 'el zvE se redondea hacia abajo');
});
test('la tarifa es continua en los cuatro cambios de zona (comprueba las constantes de cada zona)', () => { [[17799, 17800], [69878, 69879], [277825, 277826]].forEach(([a, b]) => assert(Math.abs(I.cuota(a) - I.cuota(b)) <= 2, 'salto en ' + a)); });
test('la cuota nunca baja al subir el zvE y nunca supera el 45 % del zvE', () => { let prev = 0; for (let x = 0; x <= 600000; x += 997) { const c = I.cuota(x); assert(c >= prev && c <= 0.45 * x + 1); prev = c; } });
test('tipo marginal = derivada de la tarifa en cada zona; 14 % en el primer euro tributable, 42 % y 45 % arriba, nunca fuera de 0–45 %', () => {
  [13000, 15000, 17000, 20000, 40000, 60000, 69000, 80000, 150000, 300000].forEach((x) => near(I.tipoMarginal(x), (T(x + 50) - T(x - 50)) / 100, 0.002, 'zvE ' + x));
  near(I.tipoMarginal(12349), 0.14, 0.001); assert.strictEqual(I.tipoMarginal(12348), 0); near(I.tipoMarginal(100000), 0.42, 1e-12); near(I.tipoMarginal(300000), 0.45, 1e-12);
  for (let x = 0; x < 600000; x += 1000) assert(I.tipoMarginal(x + 1000) >= I.tipoMarginal(x) - 1e-12);
});

console.log('\nAhorro por deducción');
test('ahorroPorDeduccion = cuota sin la deducción − cuota con ella; 0 sin deducción; nunca mayor que la cuota total ni negativo', () => {
  [20000, 46800, 70200, 117000].forEach((z) => [0, 100, 2100, 12000, 30826, 1e7].forEach((d) => {
    const a = I.ahorroPorDeduccion(z, d); assert.strictEqual(a, Math.max(0, Tley(z) - Tley(Math.max(0, z - d))), 'zvE ' + z + ' deducción ' + d); assert(a >= 0 && a <= I.cuota(z));
  }));
  assert.strictEqual(I.ahorroPorDeduccion(46800, -50), 0);
});
test('con la progresividad el ahorro por euro baja al crecer la deducción, y se iguala al tipo marginal si todo cae en un solo tramo', () => {
  const z = 46800, m = I.tipoMarginal(z); assert(I.ahorroPorDeduccion(z, 12000) / 12000 < I.ahorroPorDeduccion(z, 1200) / 1200 && I.ahorroPorDeduccion(z, 1200) / 1200 < m + 0.001);
  near(I.ahorroPorDeduccion(150000, 30000) / 30000, 0.42, 1e-3);                  // zvE alto: todo en el tramo del 42 %
  near(I.ahorroPorDeduccion(300000, 20000) / 20000, 0.45, 1e-3);                  // todo en el tramo del 45 %
});
test('tributación conjunta: ahorro = 2 × (cuota de la mitad sin la deducción − con ella); con deducción 0 no ahorra; el splitting baja el ahorro de una deducción pequeña', () => {
  const z = 117000, d = 6000; assert.strictEqual(I.ahorroPorDeduccionConjunta(z, d), 2 * Tley(z / 2) - 2 * Tley((z - d) / 2)); assert.strictEqual(I.ahorroPorDeduccionConjunta(z, 0), 0);
  assert(I.ahorroPorDeduccionConjunta(z, d) <= I.ahorroPorDeduccion(z, d), 'con splitting la deducción cae en tramos más bajos');
});

console.log('\nUna sola copia');
test('ninguna página redefine la tarifa: Jubilación y Análisis usan impuesto.js (no quedan las constantes 914,51 / 173,10 ni las fórmulas)', () => {
  ['jubilacion.html', 'analisis.html'].forEach((f) => {
    const h = fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), codigo = h.replace(/<script[^>]*src=[^>]*><\/script>/g, '');
    assert(!/914\.51|173\.10|11135\.63|19470\.38/.test(codigo), f + ' lleva una copia de la tarifa');
    assert(/<script src="\.\/impuesto\.js\?v=[0-9a-f]{8}"><\/script>/.test(h), f + ' no carga impuesto.js con versión');
  });
});
console.log('\n' + passed + ' correctas, ' + failed + ' fallidas'); process.exit(failed ? 1 : 0);
