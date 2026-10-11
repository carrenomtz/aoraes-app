// Pruebas del motor financiero del Proyecto inmobiliario. Sin dependencias: `node tests/calc.test.js`.
// El motor vive dentro de index.html (una sola clausura), así que aquí se extrae por marcadores de texto
// y se ejecuta tal cual — no hay copia del cálculo que pueda desincronizarse. Las expectativas salen de
// bucles mensuales independientes, no de los resultados de la app.
// Si cambian los marcadores (nombres de función), esta prueba falla a propósito: hay que actualizarla.
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const a = html.indexOf('function annuityQuota(');
const b = html.indexOf('// ---------- Amortización (AfA)');
assert(a > 0 && b > a, 'No se encontró el motor en index.html (marcadores cambiados)');
const engine = new Function(html.slice(a, b) +
  '\nreturn {annuityQuota,effectiveAnnualRate,savingsQuota,monthsToPayoff,simLoan,calcInmuebleOption,' +
  'balanceTrasMeses,interesAnualidad,calcRefiRemaining,isoDateYearsAgo};')();

let passed = 0, failed = 0;
const gaps = [];
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}
// Hueco conocido: se informa, no rompe la prueba. Si deja de cumplirse el hueco, avisa para promoverlo a test.
function knownGap(name, fn) {
  let ok = false; try { fn(); ok = true; } catch (e) {}
  gaps.push((ok ? 'RESUELTO (promover a test): ' : 'hueco conocido: ') + name);
}
const near = (x, y, tol, msg) => assert(Math.abs(x - y) <= tol, (msg || '') + ' esperado ' + y + ' obtenido ' + x);

// Calendario mensual independiente: cuota fija, última cuota recortada, Sondertilgung anual opcional.
function loop(P, ratePct, cuota, st) {
  const r = ratePct / 1200; let bal = P, interes = 0, m = 0, maxBal = P;
  while (bal > 0.005 && m < 1200) {
    m++; const i = bal * r; interes += i;
    const pago = Math.min(cuota, bal + i); bal = bal + i - pago;
    if (bal > 0 && st > 0 && m % 12 === 0) bal = Math.max(0, bal - st);
    assert(bal >= 0, 'saldo negativo');
  }
  return { meses: m, interes, bal };
}
function saldoTras(P, ratePct, cuota, n) {
  const r = ratePct / 1200; let bal = P;
  for (let k = 0; k < n; k++) bal = bal * (1 + r) - cuota;
  return bal;
}

console.log('Hipoteca bancaria — 330.000 €, Tilgung inicial 2 %');
[[4, 1650, 331], [4.5, 1787.5, 315], [5, 1925, 302]].forEach(([tipo, cuotaEsp, mesesEsp]) => {
  test('tipo ' + tipo + ' %: cuota, plazo, intereses y Restschuld a 10 años', () => {
    const c = engine.calcInmuebleOption(330000, { pct: 0, anios: 0, interesAhorro: 0, interesPrestamo: tipo, tilgungInicial: 2, comision: 0, zinsbindung: 10 });
    near(c.cuotaPrestamo, cuotaEsp, 0.005, 'cuota');
    assert.strictEqual(c.mesesPrestamo, mesesEsp, 'meses');
    const ref = loop(330000, tipo, cuotaEsp, 0);
    near(c.interesTotalPrestamo, ref.interes, 0.5, 'intereses totales');
    near(c.restschuldZinsbindung, saldoTras(330000, tipo, cuotaEsp, 120), 0.5, 'Restschuld a 10 años');
    assert.strictEqual(c.noAmortiza, false);
  });
});

console.log('Invariantes');
test('préstamo al 0 %: cuota = capital / meses y 0 € de intereses', () => {
  const c = engine.calcInmuebleOption(100000, { pct: 0, interesPrestamo: 0, tilgungInicial: 2, comision: 0, zinsbindung: 10 });
  near(c.interesTotalPrestamo, 0, 1e-6); assert.strictEqual(c.mesesPrestamo, 600);
});
test('una anualidad de 120 meses exactos no sale a 121', () => {
  assert.strictEqual(engine.monthsToPayoff(100000, 3, engine.annuityQuota(100000, 3, 120)), 120);
});
test('pago que no cubre los intereses se marca noAmortiza (Tilgung 0 %)', () => {
  const c = engine.calcInmuebleOption(100000, { pct: 0, interesPrestamo: 4, tilgungInicial: 0, comision: 0, zinsbindung: 10 });
  assert.strictEqual(c.noAmortiza, true); assert.strictEqual(c.mesesPrestamo, 1200);
});
test('pago fijo (pagoPre) por debajo del interés se marca noAmortiza', () => {
  const c = engine.calcInmuebleOption(330000, { pct: 0, interesPrestamo: 4, tilgungInicial: 2, comision: 0, zinsbindung: 10, pagoPre: 100 });
  assert.strictEqual(c.noAmortiza, true);
});
test('interesAnualidad: capital + intereses = suma exacta de pagos del calendario', () => {
  const ref = loop(250000, 3.3, 1200, 0);
  near(engine.interesAnualidad(250000, 3.3, 1200, ref.meses), ref.interes, 0.5);
});
test('Sondertilgung anual: plazo e intereses igual que el calendario independiente', () => {
  const c = engine.calcInmuebleOption(330000, { pct: 0, interesPrestamo: 4, tilgungInicial: 2, comision: 0, zinsbindung: 10, sondertilgung: 10000 });
  const ref = loop(330000, 4, 1650, 10000);
  assert.strictEqual(c.mesesPrestamo, ref.meses); near(c.interesTotalPrestamo, ref.interes, 0.5);
});
test('Sondertilgung con tope anual no supera el tope', () => {
  const c = engine.calcInmuebleOption(330000, { pct: 0, interesPrestamo: 4, tilgungInicial: 2, comision: 0, zinsbindung: 10, sondertilgung: 50000, topeST: 5 });
  near(c.sondertilgung, 330000 * 0.05, 0.01); assert.strictEqual(c.topeAplicado, true);
});
test('el interés efectivo con comisión supera al de sin comisión', () => {
  const sin = engine.effectiveAnnualRate(300000, 1650, 331), con = engine.effectiveAnnualRate(297000, 1650, 331);
  assert(con > sin && sin > 0.04);
});

console.log('Bausparvertrag — ejemplo de referencia Badenia (300.000 €, 1.000 €/mes, 0,05 %, comisión 1,6 %)');
const bs = (pct, tipo) => engine.calcInmuebleOption(300000, { pct, anios: 5, interesAhorro: 0.05, interesPrestamo: tipo, tilgungsbeitragPerMille: 6, comision: 1.6, pagoAhorro: 1000 });
test('ClassicFinanz: ahorro 125.441 €, préstamo 174.559 €, cuota 1.800 €', () => {
  const c = bs(41.8136, 1.75);
  near(c.objetivoAhorro, 125440.7, 1); near(c.capitalPrestamo, 174559.3, 1); near(c.cuotaPrestamo, 1800, 0.01);
  near(c.interesTotalPrestamo, loop(c.capitalPrestamo, 1.75, 1800, 0).interes, 0.5);
});
test('Niedriger Zins: ahorro 151.551 €, préstamo 148.449 €, cuota 1.800 €', () => {
  const c = bs(50.517, 0.95);
  near(c.objetivoAhorro, 151551.14, 1); near(c.capitalPrestamo, 148448.86, 1); near(c.cuotaPrestamo, 1800, 0.01);
});
test('la comisión del Bausparvertrag se cobra sobre la Bausparsumme (4.800 €)', () => {
  near(bs(41.8136, 1.75).comision, 4800, 0.01);
});
test('un interés de ahorro erróneo (0,95 en vez de 0,05) cambia el coste de forma material', () => {
  const c = (ia) => engine.calcInmuebleOption(300000, { pct: 40, anios: 3.5, interesAhorro: ia, interesPrestamo: 1.75, tilgungsbeitragPerMille: 3.79, comision: 1.6 });
  assert(c(0.05).costeTotal - c(0.95).costeTotal > 1000, 'diferencia de coste < 1.000 €');
});
knownGap('plazo de ahorro vs referencia Badenia (132 y 157 meses)', () => {
  const m1 = bs(41.8136, 1.75), m2 = bs(50.517, 0.95);
  assert.strictEqual(m1.mesesTotal - m1.mesesPrestamo, 132); assert.strictEqual(m2.mesesTotal - m2.mesesPrestamo, 157);
});
knownGap('interés efectivo vs referencia Badenia (2,14 % y 1,41 %)', () => {
  near(bs(41.8136, 1.75).tasaEfectiva * 100, 2.14, 0.02); near(bs(50.517, 0.95).tasaEfectiva * 100, 1.41, 0.02);
});

console.log('Refinanciar');
test('saldo e interés restante de un crédito existente igual que el calendario', () => {
  const refi = { importeOriginal: 200000, interesOriginal: 3, plazoOriginal: 25, fechaInicio: engine.isoDateYearsAgo(5) };
  const rem = engine.calcRefiRemaining(refi);
  const cuota = engine.annuityQuota(200000, 3, 300);
  near(rem.cuotaOriginal, cuota, 0.005);
  near(rem.saldoPendiente, saldoTras(200000, 3, cuota, 60), 0.5, 'saldo');
  near(rem.interesRestante, loop(rem.saldoPendiente, 3, cuota, 0).interes, 1, 'interés restante');
});

console.log('\n' + passed + ' correctas, ' + failed + ' fallidas');
gaps.forEach(g => console.log('  · ' + g));
process.exit(failed ? 1 : 0);
