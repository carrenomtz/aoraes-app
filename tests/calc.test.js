// Pruebas del motor financiero del Proyecto inmobiliario. Sin dependencias: `node tests/calc.test.js`.
// El motor vive dentro de index.html (una sola clausura), así que aquí se extrae por marcadores de texto
// y se ejecuta tal cual — no hay copia del cálculo que pueda desincronizarse. Las expectativas salen de
// bucles mensuales independientes, no de los resultados de la app.
// Si cambian los marcadores (nombres de función), esta prueba falla a propósito: hay que actualizarla.
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(process.env.IDX || path.join(__dirname, '..', 'index.html'), 'utf8');
const a = html.indexOf('function annuityQuota(');
const b = html.indexOf('// ---------- Amortización (AfA)');
assert(a > 0 && b > a, 'No se encontró el motor en index.html (marcadores cambiados)');
const f1 = html.indexOf('function inmuebleFin('), f2 = html.indexOf('function inmuebleFinLine(');
assert(f1 > 0 && f2 > f1, 'No se encontró inmuebleFin en index.html');
const engine = new Function(html.slice(a, b) + html.slice(f1, f2) +
  '\nreturn {annuityQuota,effectiveAnnualRate,savingsQuota,monthsToPayoff,simLoan,calcInmuebleOption,' +
  'balanceTrasMeses,interesAnualidad,calcRefiRemaining,isoDateYearsAgo,inmuebleFin};')();

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

// Referencia: folleto ImmoSmart de la DVAG (2026): 100.000 € a 3,34 %, Tilgung 1/2/3 % -> 44a2m/29a7m/22a7m e intereses
// 90.996 / 57.233 / 42.234 €. El folleto cuenta un mes más que la app (los pagos + el mes de la entrega); los intereses coinciden.
[[1, 44 * 12 + 2, 90996], [2, 29 * 12 + 7, 57233], [3, 22 * 12 + 7, 42234]].forEach(([t, mesesFolleto, interesFolleto]) => {
  test('folleto ImmoSmart: Tilgung ' + t + ' % a 3,34 % (plazo ±1 mes, intereses ±10 €)', () => {
    const c = engine.calcInmuebleOption(100000, { pct: 0, interesPrestamo: 3.34, tilgungInicial: t, comision: 0, zinsbindung: 10 });
    assert(Math.abs(c.mesesPrestamo - mesesFolleto) <= 1, 'meses ' + c.mesesPrestamo + ' vs ' + mesesFolleto);
    near(c.interesTotalPrestamo, interesFolleto, 10, 'intereses');
  });
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
// Referencia: Modellrechnung de Badenia (ImmoStart, 300.000 €, inicio 30.10.2026). El plazo de ahorro del contrato son
// 130 / 156 pagos mensuales (la "Zuteilung" cae en el mes siguiente al último pago) y el préstamo dura 105 / 86 meses.
test('plazo de ahorro y de préstamo igual que la Modellrechnung (130+105 y 156+86 meses)', () => {
  const m1 = bs(41.8136, 1.75), m2 = bs(50.517, 0.95);
  assert.strictEqual(m1.mesesTotal - m1.mesesPrestamo, 130); assert.strictEqual(m1.mesesPrestamo, 105);
  assert.strictEqual(m2.mesesTotal - m2.mesesPrestamo, 156); assert.strictEqual(m2.mesesPrestamo, 86);
});
test('interés efectivo del Bausparvertrag coincide con el de la Modellrechnung (2,14 % y 1,41 %, ±0,02)', () => {
  near(bs(41.8136, 1.75).tasaEfectiva * 100, 2.14, 0.02, 'Classic'); near(bs(50.517, 0.95).tasaEfectiva * 100, 1.41, 0.02, 'Niedriger Zins');
});
test('intereses de la fase de préstamo dentro del 1,5 % de los del contrato (13.932,23 € en ClassicFinanz)', () => {
  // El contrato abona intereses por año natural; la app los calcula mes a mes (~1 % menos).
  near(bs(41.8136, 1.75).interesTotalPrestamo, 13932.23, 13932.23 * 0.015);
});
test('interés efectivo del banco sin comisión = nominal anualizado (4 % → 4,074 %)', () => {
  const c = engine.calcInmuebleOption(330000, { pct: 0, interesPrestamo: 4, tilgungInicial: 2, comision: 0, zinsbindung: 10 });
  near(c.tasaEfectiva * 100, (Math.pow(1 + 0.04 / 12, 12) - 1) * 100, 0.001);
});

console.log('Importe a financiar (precio + gastos de compra - capital propio)')
test('sin gastos ni capital propio el importe a financiar es el precio (comportamiento de siempre)', () => {
  assert.strictEqual(engine.inmuebleFin({ precio: 300000 }), 300000);
});
test('300.000 € + 10 % de gastos - 30.000 € de capital propio = 300.000 €; 330.000 € financiando los gastos', () => {
  assert.strictEqual(engine.inmuebleFin({ precio: 300000, gastosPct: 10, capitalPropio: 30000 }), 300000);
  assert.strictEqual(engine.inmuebleFin({ precio: 300000, gastosPct: 10, capitalPropio: 0 }), 330000);
});
test('si el capital propio cubre todo, no hay nada que financiar y no salen valores negativos', () => {
  assert.strictEqual(engine.inmuebleFin({ precio: 300000, gastosPct: 10, capitalPropio: 400000 }), 0);
  const c = engine.calcInmuebleOption(0, { pct: 0, interesPrestamo: 4, tilgungInicial: 2, comision: 0, zinsbindung: 10 });
  assert.strictEqual(c.cuotaPrestamo, 0); assert.strictEqual(c.noAmortiza, false);
});

console.log('Cubrir la deuda pendiente de la Zinsbindung con un Bausparvertrag')
test('Bausparsumme = deuda pendiente: el ahorro mensual alcanza el % elegido + comisión en los años de la Zinsbindung', () => {
  const R = engine.calcInmuebleOption(330000, { pct: 0, interesPrestamo: 4, tilgungInicial: 2, comision: 0, zinsbindung: 10 }).restschuldZinsbindung;
  const cfg = { pct: 40, interesAhorro: 0.05, interesPrestamo: 1.75, tilgungsbeitragPerMille: 3.79, comision: 1.6 };
  const h = engine.calcInmuebleOption(R, Object.assign({}, cfg, { anios: 10, pagoAhorro: 0, pagoPrestamo: 0, sondertilgung: 0, topeST: 0 }));
  let bal = 0; const r = 0.0005 / 12; for (let k = 0; k < 120; k++) bal = bal * (1 + r) + h.cuotaAhorro;
  near(bal, R * 0.4 + R * 0.016, 0.01, 'ahorro acumulado');
  near(h.capitalPrestamo, R * 0.6, 0.01, 'préstamo'); near(h.cuotaPrestamo, R * 3.79 / 1000, 0.01, 'cuota del préstamo');
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
