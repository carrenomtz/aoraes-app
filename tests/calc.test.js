// Pruebas del motor financiero del Proyecto inmobiliario. Sin dependencias: `node tests/calc.test.js`.
// Las expectativas salen de bucles mensuales independientes, no de los resultados de la app.
const path = require('path');
const assert = require('assert');
// El motor es calc.js (funciones puras, sin DOM): se carga tal cual, sin copias ni extracciones de texto.
const engine = require(process.env.CALC || path.join(__dirname, '..', 'calc.js'));
const afaMod = require(process.env.AFA || path.join(__dirname, '..', 'afa.js'));

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

console.log('Plazo del banco')
test('tilgungParaPlazo: un plazo de 30 años a 4 % da la Tilgung inicial que amortiza justo a los 30 años', () => {
  const tg = (function(){ const q = engine.annuityQuota(1, 4, 360); return Math.round(Math.max(0, q * 12 * 100 - 4) * 100) / 100; })();
  const c = engine.calcInmuebleOption(300000, { pct: 0, interesPrestamo: 4, tilgungInicial: tg, comision: 0, zinsbindung: 10 });
  assert(Math.abs(c.mesesPrestamo - 360) <= 1, 'meses ' + c.mesesPrestamo);
});

console.log('Capacidad de pago')
test('sin ingreso indicado no hay datos; con ingreso: cuota máxima (ingreso × límite) y préstamo orientativo (ingreso × 12 × 8)', () => {
  const filas = [['Banco directo', 917], ['Bausparvertrag · ahorro', 1979], ['Bausparvertrag · préstamo', 1091]];
  assert.strictEqual(engine.inmuebleCapacidadDatos({ ingresoNeto: 0, ratioMax: 35 }, 200000, filas), null);
  const d = engine.inmuebleCapacidadDatos({ ingresoNeto: 4200, ratioMax: 35 }, 200000, filas);
  near(d.cuotaMax, 1470, 0.001); near(d.orientativo, 403200, 0.001); assert.strictEqual(d.finSuperaOrientativo, false);
  assert.strictEqual(engine.inmuebleCapacidadDatos({ ingresoNeto: 1000, ratioMax: 35 }, 200000, filas).finSuperaOrientativo, true);
});
test('semáforo: ≤30 % del ingreso dentro, hasta el límite ajustado, por encima del límite marcado', () => {
  const d = engine.inmuebleCapacidadDatos({ ingresoNeto: 4200, ratioMax: 35 }, 200000, [['Banco directo', 917], ['Bausparvertrag · ahorro', 1979], ['Bausparvertrag · préstamo', 1091]]);
  assert.deepStrictEqual(d.filas.map(f => [Math.round(f.pct), f.cls, f.estado]), [[22, 'ok', 'Dentro'], [47, 'hi', 'Por encima'], [26, 'ok', 'Dentro']]);
  const j = engine.inmuebleCapacidadDatos({ ingresoNeto: 3000, ratioMax: 35 }, 0, [['Banco directo', 0], ['Bausparvertrag · préstamo', 990]]);
  assert.deepStrictEqual(j.filas.map(f => [Math.round(f.pct), f.cls, f.estado]), [[33, 'mid', 'Ajustado']]);
});

console.log('Tiempo mínimo de ahorro del Bausparvertrag (3,6 años)')
const bsMin = (extra) => engine.calcInmuebleOption(300000, Object.assign({ pct: 40, anios: 5, interesAhorro: 0.05, interesPrestamo: 1.75, tilgungsbeitragPerMille: 6, comision: 1.6 }, extra));
const mesesAh = (c) => c.mesesTotal - c.mesesPrestamo;
test('años de ahorro por debajo del mínimo se suben a 3,6 años (43 meses) y se avisa', () => {
  const c = bsMin({ anios: 2 }); assert.strictEqual(mesesAh(c), 43); assert.strictEqual(c.minAhorroAplicado, true);
  near(c.cuotaAhorro, engine.savingsQuota(120000 + 300000 * 0.016, 0.05, 43), 0.01, 'cuota para 43 meses');
});
test('3,6 años o más no se tocan', () => {
  const c = bsMin({ anios: 3.6 }); assert.strictEqual(mesesAh(c), 43); assert.strictEqual(c.minAhorroAplicado, false);
  assert.strictEqual(mesesAh(bsMin({ anios: 5 })), 60);
});
test('un pago de ahorro tan alto que alcanzaría el objetivo antes del mínimo: el ahorro dura el mínimo y la cuota baja a la necesaria', () => {
  const c = bsMin({ pagoAhorro: 5000 }); assert.strictEqual(mesesAh(c), 43); assert.strictEqual(c.minAhorroAplicado, true); assert(c.cuotaAhorro < 5000, 'cuota ' + c.cuotaAhorro);
  const d = bsMin({ pagoAhorro: 1000 }); assert.strictEqual(d.minAhorroAplicado, false); assert(mesesAh(d) > 100);
});
test('Refinanciar (sinMinimoAhorro) no recalcula: se avisa en pantalla, el cálculo queda como estaba', () => {
  assert.strictEqual(mesesAh(bsMin({ anios: 2, sinMinimoAhorro: true })), 24);
});

console.log('Gráfica: hitos y escenarios de interés')
test('hitos de Comprar: asignación con lo ahorrado, fin del tipo fijo con la deuda del banco y pagos finales a 0', () => {
  const precio = 300000;
  const est = { pct: 40, anios: 5, interesAhorro: 0.05, interesPrestamo: 1.75, tilgungsbeitragPerMille: 6, comision: 1.6 };
  const bk = { pct: 0, interesPrestamo: 4, tilgungInicial: 2, comision: 0, zinsbindung: 10 };
  const rEst = engine.calcInmuebleOption(precio, est), rk = engine.calcInmuebleOption(precio, bk);
  const ptsE = engine.inmuebleCurvaSaldo(precio, rEst, est), ptsB = engine.inmuebleCurvaSaldo(precio, rk, bk);
  const rows = engine.inmuebleHitosComprar(precio, rEst, rk, ptsE, ptsB, 120);
  assert.deepStrictEqual(rows.map(r => r.n), ['Asignación del Bausparvertrag', 'Fin del tipo fijo', 'Bausparvertrag pagado', 'Banco pagado']);
  near(rows[0].m, rEst.mesesAhorro, 0); near(rows[0].ahorro, rEst.objetivoAhorro, 1, 'ahorrado en la Zuteilung');
  near(rows[0].baus, precio - rEst.objetivoAhorro, 1, 'deuda del Bausparvertrag en la Zuteilung');
  near(rows[1].banco, rk.restschuldZinsbindung, 1, 'deuda del banco al fin de la Zinsbindung');
  assert.strictEqual(rows[2].baus, 0); assert.strictEqual(rows[3].banco, 0); assert.strictEqual(rows[3].baus, 0);
  assert(rows.every((r, i) => i === 0 || r.m >= rows[i - 1].m), 'hitos ordenados en el tiempo');
});
console.log('Amortización (AfA)')
test('AfA estándar: Nebenkosten = precio × (ITP + notaría + registro) y base = precio + Nebenkosten − suelo − cocina', () => {
  // 300.000 € en Berlín (ITP 6 %) + 1,5 % notaría + 0,5 % registro = 8 % = 24.000 €; suelo 60.000 €, cocina 5.000 € -> base 259.000 €
  const a = Object.assign(afaMod.defaultAfa(), { precioCompra: 300000, valorSuelo: 60000, valorCocina: 5000, afaEstandarPct: 2 });
  const c = afaMod.calcAfa(a);
  near(c.nebenkosten, 24000, 0.001); near(c.baseAmortizable, 259000, 0.001);
  near(c.perdidaEstandarAnual, 5180, 0.001); assert.strictEqual(c.pctGutachten, null);
  near(c.perdidaEfectivaAnual, c.perdidaEstandarAnual, 0.001);
});
test('AfA con Gutachten: % = 100 / años restantes (puede ser menor o mayor que el estándar) y manda sobre el estándar', () => {
  const base = Object.assign(afaMod.defaultAfa(), { precioCompra: 300000, valorSuelo: 60000, valorCocina: 5000, afaEstandarPct: 2, tieneGutachten: true });
  const corto = afaMod.calcAfa(Object.assign({}, base, { restnutzungsdauerGutachten: 30 }));
  near(corto.pctGutachten, 100 / 30, 1e-9); near(corto.perdidaGutachtenAnual, 259000 / 30, 0.001);
  near(corto.diferenciaAnual, 259000 / 30 - 5180, 0.001); near(corto.perdidaEfectivaAnual, corto.perdidaGutachtenAnual, 0.001);
  const largo = afaMod.calcAfa(Object.assign({}, base, { restnutzungsdauerGutachten: 60 }));
  assert(largo.diferenciaAnual < 0, 'una vida útil más larga da MENOS AfA que el estándar');
});
test('el suelo pendiente no se descuenta (se muestra como pendiente) y el suelo nunca entra en la base si está informado', () => {
  const a = Object.assign(afaMod.defaultAfa(), { precioCompra: 300000, valorSuelo: 60000, sueloPendiente: true });
  const c = afaMod.calcAfa(a); near(c.sueloEfectivo, 0, 0.001); near(c.baseAmortizable, 324000, 0.001);
});
test('normalizeAfa rellena una ficha vacía con los valores por defecto y toma el ITP del estado federal', () => {
  const rec = {}; const a = afaMod.normalizeAfa(rec);
  assert.strictEqual(a.bundesland, 'Berlin'); near(a.itpPct, afaMod.AFA_BUNDESLAND_ITP['Berlin'], 0);
  const r2 = { afa: { bundesland: 'Bayern' } }; near(afaMod.normalizeAfa(r2).itpPct, afaMod.AFA_BUNDESLAND_ITP['Bayern'], 0);
});

console.log('Líneas de la gráfica (otras cuotas mensuales)');
test('sin lista, salen 2 líneas alrededor de la cuota actual (×0,8 / ×1,25, a 10 €); la lista propia (hasta 4) manda', () => {
  assert.deepStrictEqual(engine.inmuebleCurvaCuotas({}, 1000), [800, 1250]);
  assert.deepStrictEqual(engine.inmuebleCurvaCuotas({}, 0), []);
  assert.deepStrictEqual(engine.inmuebleCurvaCuotas({ curvaCuotas: { banco: [700, 900, 1100, 1300, 1500] } }, 1000), [700, 900, 1100, 1300]);
  assert.deepStrictEqual(engine.inmuebleCurvaCuotas({ curvaCuotas: { banco: [] } }, 1000), []);
  assert.deepStrictEqual(engine.inmuebleCurvaCuotas({ curvaCuotas: { banco: [900, 'x', -5, 900] } }, 1000), [900]);
});
test('cada modo (banco / bauspar) tiene su propia lista', () => {
  const inm = { curvaModo: 'bauspar', curvaCuotas: { banco: [700], bauspar: [1200, 1500] } };
  assert.strictEqual(engine.inmuebleCurvaModo(inm), 'bauspar');
  assert.deepStrictEqual(engine.inmuebleCurvaCuotas(inm, 1000), [1200, 1500]);
  assert.deepStrictEqual(engine.inmuebleCurvaCuotas({ curvaModo: 'bauspar' }, 1000), [750, 1250]);
  assert.strictEqual(engine.inmuebleCurvaModo({}), 'banco');
  assert.strictEqual(engine.inmuebleCurvaModo({ curvaModo: 'otro' }), 'banco');
});
test('el texto "800; 1000" o "800 1.200" se interpreta; la coma es decimal; vacío = automáticas (null); basura = no interpretable (undefined)', () => {
  assert.deepStrictEqual(engine.inmuebleParseCurvaCuotas('800; 1000; 1200'), [800, 1000, 1200]);
  assert.deepStrictEqual(engine.inmuebleParseCurvaCuotas('800 1.200'), [800, 1200]);
  assert.deepStrictEqual(engine.inmuebleParseCurvaCuotas('950,5 1000'), [950.5, 1000]);
  assert.strictEqual(engine.inmuebleParseCurvaCuotas(''), null);
  assert.strictEqual(engine.inmuebleParseCurvaCuotas('abc'), undefined);
  assert.deepStrictEqual(engine.inmuebleParseCurvaCuotas('1 2 3 4 5 6'), [1, 2, 3, 4]);
  assert.deepStrictEqual(engine.inmuebleParseCurvaCuotas('900 900'), [900]);
});
test('cambiar de modo apaga ninguna línea y apagar/encender una cuota funciona', () => {
  const inm = { curvaOff: [800] };
  engine.inmuebleSetCurvaModo(inm, 'bauspar'); assert.strictEqual(inm.curvaModo, 'bauspar'); assert.deepStrictEqual(inm.curvaOff, []);
  engine.inmuebleToggleCurvaTipo(inm, 1200); assert.deepStrictEqual(inm.curvaOff, [1200]);
  engine.inmuebleToggleCurvaTipo(inm, 1500); assert.deepStrictEqual(inm.curvaOff, [1200, 1500]);
  engine.inmuebleToggleCurvaTipo(inm, 1200); assert.deepStrictEqual(inm.curvaOff, [1500]);
});
test('plazo del Bauspar: salen 2 líneas alrededor del plazo actual (×0,5 / ×1,5, años enteros, máx. 40) y la ‰ pedida da ese plazo', () => {
  assert.deepStrictEqual(engine.inmuebleCurvaCuotas({ curvaModo: 'plazo' }, 10), [5, 15]);
  assert.deepStrictEqual(engine.inmuebleCurvaCuotas({ curvaModo: 'plazo' }, 2), [1, 3]);
  assert.deepStrictEqual(engine.inmuebleCurvaCuotas({ curvaModo: 'plazo', curvaCuotas: { plazo: [5, 60, 12] } }, 10), [5, 12]);
  assert.strictEqual(engine.inmuebleCurvaModo({ curvaModo: 'plazo' }), 'plazo');
  const inm = {}; engine.inmuebleSetCurvaModo(inm, 'plazo'); assert.strictEqual(inm.curvaModo, 'plazo');
  const cfg = { pct: 40, anios: 5, interesAhorro: 0.05, interesPrestamo: 1.75, tilgungsbeitragPerMille: 6, comision: 1.6 };
  const r0 = engine.calcInmuebleOption(200000, cfg);
  [5, 8, 15].forEach(y => {
    const pm = engine.tilgungsbeitragParaPlazo(200000, r0.capitalPrestamo, cfg.interesPrestamo, y);
    const r = engine.calcInmuebleOption(200000, Object.assign({}, cfg, { tilgungsbeitragPerMille: pm }));
    near(r.mesesPrestamo / 12, y, 0.1, 'plazo pedido ' + y);
  });
  const corto = engine.calcInmuebleOption(200000, Object.assign({}, cfg, { tilgungsbeitragPerMille: engine.tilgungsbeitragParaPlazo(200000, r0.capitalPrestamo, cfg.interesPrestamo, 5) }));
  assert.ok(corto.cuotaPrestamo > r0.cuotaPrestamo, 'menos años = cuota mayor');
});
test('las líneas del banco no bajan de la cuota con un 1 % de Tilgung inicial (el mínimo real de un banco)', () => {
  const cap = 200000, i = 5, minC = Math.ceil(cap * (i + 1) / 1200 / 10) * 10;      // 1.000 €/mes
  const base = engine.annuityQuota(cap, i, 360);                                  // cuota a 30 años (≈ 1.074)
  const l = engine.inmuebleCuotasBancoRealistas([860, Math.round(base * 1.25 / 10) * 10], cap, i, base);
  assert.strictEqual(minC, 1000);
  assert.strictEqual(l[0], 1000, 'los 860 € (casi 70 años) se suben al mínimo');
  assert.strictEqual(l[1], Math.round(base * 1.25 / 10) * 10, 'la agresiva queda como estaba');
  const r = engine.calcInmuebleOption(cap, { pct: 0, anios: 0, interesAhorro: 0, interesPrestamo: i, tilgungInicial: 2, comision: 0, zinsbindung: 10, pagoPre: l[0] });
  assert.ok(r.mesesPrestamo / 12 < 40, 'con ese mínimo termina en menos de 40 años: ' + (r.mesesPrestamo / 12).toFixed(1));
  assert.deepStrictEqual(engine.inmuebleCuotasBancoRealistas([minC, minC - 50, minC + 1000], cap, i, minC + 1000), [minC], 'sin duplicados y sin repetir la línea principal');
});
test('banco: pagar más al mes termina antes (pagoPre); una cuota que no cubre el interés no amortiza', () => {
  const base = { pct: 0, anios: 0, interesAhorro: 0, interesPrestamo: 4, tilgungInicial: 2, comision: 0, zinsbindung: 10 };
  const r0 = engine.calcInmuebleOption(300000, base);
  const rMas = engine.calcInmuebleOption(300000, Object.assign({}, base, { pagoPre: r0.cuotaPrestamo * 1.25 }));
  const rMenos = engine.calcInmuebleOption(300000, Object.assign({}, base, { pagoPre: r0.cuotaPrestamo * 0.8 }));
  assert.ok(rMas.mesesPrestamo < r0.mesesPrestamo && r0.mesesPrestamo < rMenos.mesesPrestamo, 'más cuota = menos meses');
  assert.ok(engine.calcInmuebleOption(300000, Object.assign({}, base, { pagoPre: 900 })).noAmortiza, '900 € no cubre el interés de 1.000 €/mes');
});
test('bauspar: una cuota de ahorro menor alarga el ahorro, y nunca baja del mínimo de 3,6 años', () => {
  const cfg = { pct: 40, anios: 5, interesAhorro: 0.05, interesPrestamo: 1.75, tilgungsbeitragPerMille: 6, comision: 1.6 };
  const r0 = engine.calcInmuebleOption(200000, cfg);
  const rMenos = engine.calcInmuebleOption(200000, Object.assign({}, cfg, { pagoAhorro: r0.cuotaAhorro * 0.8 }));
  const rMas = engine.calcInmuebleOption(200000, Object.assign({}, cfg, { pagoAhorro: r0.cuotaAhorro * 3 }));
  assert.ok(rMenos.mesesAhorro > r0.mesesAhorro, 'menos cuota = más meses de ahorro');
  assert.ok(rMas.mesesAhorro >= engine.BAUSPAR_MIN_MESES, 'no baja del mínimo');
});

console.log('Margen mensual y cuota sugerida');
test('la ficha da el margen mensual: ingresos netos menos gastos sin el alquiler/hipoteca; con gastos totales no se puede separar', () => {
  const rec = { data: { expMode: 'cat', fields: { 'inc:salarioNeto_A': '3000', 'inc:alquiler_A': '400', 'exp:alquilerHipoteca': '900', 'exp:super': '500', 'exp:ocio': '300' } } };
  const d = engine.inmuebleDatosCliente(rec);
  assert.deepStrictEqual(d.flujo, { ingresoTotal: 3400, gastos: 800, libre: 2600, gastosTotales: 1700, libreHoy: 1700, liquido: 0 });
  const rt = { data: { expMode: 'total', fields: { 'inc:salarioNeto_A': '3000', 'exptotal:': '2200' } } };
  assert.strictEqual(engine.inmuebleDatosCliente(rt).flujo.libre, 800);
  assert.strictEqual(engine.inmuebleDatosCliente({ data: { fields: { 'inc:salarioNeto_A': '3000' } } }).flujo, null);
});
test('cuota sugerida = lo que sobra sin pasar del límite de cuota (a 10 €); sin margen = 0; sin ficha = null', () => {
  const rec = { data: { fields: { 'inc:salarioNeto_A': '3200', 'exp:super': '1000' } } };
  const inm = engine.normalizeInmueble(rec);
  assert.deepStrictEqual(engine.inmuebleCuotaSugerida(inm), { libre: 2200, tope: 1120, restar: 0 });
  assert.strictEqual(engine.inmuebleCuotaSugerida(inm, 500).tope, 620, 'se descuenta la cuota que ya se paga al banco');
  assert.strictEqual(engine.inmuebleCuotaSugerida(inm, 5000).tope, 0);
  inm.ratioMax = 80; assert.strictEqual(engine.inmuebleCuotaSugerida(inm).tope, 2200);
  const sin = engine.normalizeInmueble({ data: { fields: { 'inc:salarioNeto_A': '1000', 'exp:super': '1200' } } });
  assert.strictEqual(engine.inmuebleCuotaSugerida(sin).tope, 0);
  assert.strictEqual(engine.inmuebleCuotaSugerida(engine.normalizeInmueble({})), null);
});

console.log('Sonderzahlung en la fase de ahorro');
const sonderBase = { pct: 40, anios: 5, interesAhorro: 1, comision: 1.6, tilgungsbeitragPerMille: 6, interesPrestamo: 2 };
function simAhorro(cuota, sonder, rate, meses) { // simulación independiente mes a mes
  let b = 0; for (let m = 1; m <= meses; m++) { b *= 1 + rate / 1200; b += cuota; if (sonder > 0 && m % 12 === 0) b += sonder; } return b;
}
test('cuota derivada: con Sonderzahlung anual se llega al objetivo y la cuota baja', () => {
  const r0 = engine.calcInmuebleOption(300000, sonderBase);
  const r1 = engine.calcInmuebleOption(300000, Object.assign({}, sonderBase, { sonderAhorro: 2000 }));
  assert(r1.cuotaAhorro < r0.cuotaAhorro, 'la cuota no baja');
  near(simAhorro(r1.cuotaAhorro, 2000, 1, 60), r1.objetivoAhorro + 300000 * 0.016, 0.5, 'ahorro final');
  near(r0.sonderAhorro, 0, 1e-9); near(r1.sonderAhorro, 2000, 1e-9);
  near(r1.interesGanadoAhorro, simAhorro(r1.cuotaAhorro, 2000, 1, 60) - (r1.cuotaAhorro * 60 + 2000 * 5), 0.5, 'interés ganado');
});
test('sin Sonderzahlung el resultado no cambia', () => {
  const a = engine.calcInmuebleOption(300000, sonderBase), b = engine.calcInmuebleOption(300000, Object.assign({}, sonderBase, { sonderAhorro: 0 }));
  near(a.cuotaAhorro, b.cuotaAhorro, 1e-9); near(a.costeTotal, b.costeTotal, 1e-6);
});
test('pago mensual fijado: la Sonderzahlung acorta el ahorro', () => {
  const cfg = Object.assign({}, sonderBase, { pagoAhorro: 1500 });
  const r0 = engine.calcInmuebleOption(300000, cfg), r1 = engine.calcInmuebleOption(300000, Object.assign({}, cfg, { sonderAhorro: 4000 }));
  assert(r1.mesesAhorro < r0.mesesAhorro, 'no se acorta: ' + r1.mesesAhorro + ' vs ' + r0.mesesAhorro);
  const obj = 120000 + 300000 * 0.016; // objetivo + comisión
  assert(simAhorro(1500, 4000, 1, r1.mesesAhorro - 1) < obj - 0.5, 'ya se llegaba un mes antes');
  assert(simAhorro(1500, 4000, 1, r1.mesesAhorro) >= obj - 0.5, 'no se llega en el mes indicado');
});
test('Sonderzahlung desmedida: se recorta y la cuota no llega a 0', () => {
  const r = engine.calcInmuebleOption(300000, Object.assign({}, sonderBase, { sonderAhorro: 100000 }));
  assert(r.cuotaAhorro > 0, 'cuota 0'); assert(r.sonderAhorroTope === true, 'sin aviso'); assert(r.sonderAhorro < 100000, 'no recortada');
  near(simAhorro(r.cuotaAhorro, r.sonderAhorro, 1, 60), r.objetivoAhorro + 300000 * 0.016, 0.5, 'ahorro final');
});
test('Refinanciar (pago fijo, tiempo fijo): el ahorro acumulado incluye la Sonderzahlung', () => {
  const cfg = Object.assign({}, sonderBase, { sinMinimoAhorro: true, anios: 4, pagoAhorro: 800, ahorroPorTiempo: true, sonderAhorro: 3000 });
  const r = engine.calcInmuebleOption(250000, cfg);
  near(r.objetivoAhorro, Math.min(250000, simAhorro(800, 3000, 1, 48) - 250000 * 0.016), 0.5, 'ahorro acumulado');
});
test('la curva de saldo usa el ahorro con Sonderzahlung', () => {
  const cfg = Object.assign({}, sonderBase, { sonderAhorro: 2000 });
  const r = engine.calcInmuebleOption(300000, cfg), pts = engine.inmuebleCurvaSaldo(300000, r, cfg);
  const p24 = pts.find(p => p.meses === 24);
  assert(p24, 'sin punto en el mes 24');
  near(p24.pendiente, 300000 - simAhorro(r.cuotaAhorro, 2000, 1, 24), 1, 'saldo mes 24');
});

console.log('Recargo de interés por Sondertilgung');
const recBase = { pct: 0, anios: 0, interesAhorro: 0, interesPrestamo: 4, tilgungInicial: 2, comision: 0, zinsbindung: 10 };
test('sin Sondertilgung el recargo no se aplica', () => {
  const a = engine.calcInmuebleOption(300000, recBase), b = engine.calcInmuebleOption(300000, Object.assign({}, recBase, { recargoST: 0.3 }));
  near(a.cuotaPrestamo, b.cuotaPrestamo, 1e-9); near(a.costeTotal, b.costeTotal, 1e-6);
  assert(!b.recargoST, 'recargo sin Sondertilgung');
});
test('con Sondertilgung y recargo: cuota y plazo con el interés + recargo, simulados mes a mes', () => {
  const cfg = Object.assign({}, recBase, { sondertilgung: 6000, recargoST: 0.3 });
  const r = engine.calcInmuebleOption(300000, cfg);
  near(r.cuotaPrestamo, 300000 * (4.3 + 2) / 1200, 1e-6, 'cuota');
  const sim = loop(300000, 4.3, r.cuotaPrestamo, 6000);
  near(r.mesesPrestamo, sim.meses, 0, 'meses'); near(r.interesTotalPrestamo, sim.interes, 1, 'intereses');
  assert.strictEqual(r.recargoST, 0.3);
});
test('el beneficio de la Sondertilgung descuenta el recargo (frente a no contratarla)', () => {
  const cfg = Object.assign({}, recBase, { sondertilgung: 6000, recargoST: 0.3 });
  const con = engine.calcInmuebleOption(300000, cfg), base = engine.calcInmuebleOption(300000, recBase);
  near(con.ahorroInteresST, base.interesTotalPrestamo - con.interesTotalPrestamo, 1, 'ahorro neto');
  assert(con.ahorroInteresST < engine.calcInmuebleOption(300000, Object.assign({}, recBase, { sondertilgung: 6000 })).ahorroInteresST, 'con recargo debe ahorrar menos que sin recargo');
});
test('un recargo enorme con poca Sondertilgung se marca como que cuesta más de lo que ahorra', () => {
  const r = engine.calcInmuebleOption(300000, Object.assign({}, recBase, { sondertilgung: 500, recargoST: 2 }));
  assert.strictEqual(r.recargoSuperaAhorro, true); near(r.ahorroInteresST, 0, 1e-9);
});
test('el recargo no afecta al Bausparvertrag', () => {
  const bs = { pct: 40, anios: 4, interesAhorro: 0.05, interesPrestamo: 1.75, tilgungsbeitragPerMille: 6, comision: 1.6, sondertilgung: 3000 };
  const a = engine.calcInmuebleOption(300000, bs), b = engine.calcInmuebleOption(300000, Object.assign({}, bs, { recargoST: 0.5 }));
  near(a.cuotaPrestamo, b.cuotaPrestamo, 1e-9); near(a.interesTotalPrestamo, b.interesTotalPrestamo, 1e-6);
});

console.log('Límites de entrada y traducciones');
test('inmuebleLimitar: recorta negativos y excesos, vacío = 0 sin recorte', () => {
  assert.deepStrictEqual(engine.inmuebleLimitar('interesPrestamo', -3), { v: 0, recortado: true });
  assert.deepStrictEqual(engine.inmuebleLimitar('interesPrestamo', '4,5'.replace(',', '.')), { v: 4.5, recortado: false });
  assert.deepStrictEqual(engine.inmuebleLimitar('interesAhorro', 30), { v: 20, recortado: true });
  assert.deepStrictEqual(engine.inmuebleLimitar('precio', ''), { v: 0, recortado: false });
  assert.deepStrictEqual(engine.inmuebleLimitar('precio', 5e9), { v: 1e8, recortado: true });
  assert.deepStrictEqual(engine.inmuebleLimitar('campoDesconocido', -7), { v: -7, recortado: false });
});
test('normalizeInmueble repone al límite los valores guardados fuera de rango y es idempotente', () => {
  const d = engine.defaultInmueble(); d.precio = 5e9; Object.assign(d.banco, { interesPrestamo: -3, zinsbindung: -4, sondertilgung: -1000 }); Object.assign(d.a, { interesAhorro: 30, comision: 99 });
  const rec = { inmueble: d };
  const inm = engine.normalizeInmueble(rec);
  assert.strictEqual(inm.precio, 1e8); assert.strictEqual(inm.banco.interesPrestamo, 0); assert.strictEqual(inm.banco.zinsbindung, 0);
  assert.strictEqual(inm.banco.sondertilgung, 0); assert.strictEqual(inm.a.interesAhorro, 20); assert.strictEqual(inm.a.comision, 10);
  const j = JSON.stringify(inm); assert.strictEqual(JSON.stringify(engine.normalizeInmueble({ inmueble: JSON.parse(j) })), j);
});
test('con valores válidos normalizeInmueble no cambia nada', () => {
  const inm = engine.normalizeInmueble({ inmueble: null }), j = JSON.stringify(inm);
  assert.strictEqual(JSON.stringify(engine.normalizeInmueble({ inmueble: JSON.parse(j) })), j);
  assert.strictEqual(inm.banco.interesPrestamo, 3.5);
});
// Traducciones: el traductor de la app sustituye cada número del texto por {n} antes de buscar la clave, así que una clave con un
// dígito escrito ("(0 = calculado)") nunca casa y el texto se queda en español. Esta prueba lo impide.
const i18nSrc = require('fs').readFileSync(process.env.I18N || path.join(__dirname, '..', 'i18n.js'), 'utf8');
const dicts = new Function(i18nSrc + ';return {EN:SHELL_I18N_EN,DE:SHELL_I18N_DE};')();
const NUMRE = /\d+(?:[.,\/:]\d+)*/g;
test('ninguna clave del diccionario EN/DE lleva dígitos escritos (usar {0}, {1})', () => {
  for (const [n, map] of Object.entries(dicts)) {
    const malas = Object.keys(map).filter(k => /\d/.test(k.replace(/\{\d\}/g, '')));
    assert.deepStrictEqual(malas, [], n + ': claves con dígitos escritos');
  }
});
test('los textos del Proyecto inmobiliario con números se traducen (EN y DE)', () => {
  const textos = ['Pago mensual de ahorro (0 = calculado; fija los años de ahorro)', 'Tope anual de amortización extra (0 = sin tope)',
    'Gastos de compra (% del precio · típico 7–12 %)', 'Pago extra anual durante el ahorro (Sonderzahlung; 0 = ninguno)',
    'Un interés del ahorro superior al 0,5 % es poco habitual en un Bausparvertrag.', 'Con este pago el préstamo no se amortiza en menos de 100 años.', 'Banco'];
  for (const [n, map] of Object.entries(dicts)) for (const t of textos) {
    const nums = []; const tpl = t.replace(NUMRE, m => { nums.push(m); return '{' + (nums.length - 1) + '}'; });
    assert(Object.prototype.hasOwnProperty.call(map, tpl), n + ' sin traducción: ' + t);
  }
});

console.log('Coherencia entre duración, gráfica y hitos');
// La duración total desde hoy sale de inmuebleMesesDesdeHoy; el final de cada curva y la fila "pagado" de los hitos tienen que coincidir
// con ella. (Un error de este tipo, sumar dos veces el ahorro en Refinanciar, llegó a mostrarse: ahora lo vigila esta prueba.)
const rr = (a, b) => a + Math.random() * (b - a), ri = (a, b) => Math.floor(rr(a, b + 1));
test('Comprar: la duración de cada opción coincide con el final de su curva y con su fila "pagado" de los hitos', () => {
  for (let i = 0; i < 400; i++) {
    const precio = ri(80000, 900000);
    const est = { pct: ri(10, 100), anios: rr(3.6, 12), interesAhorro: rr(0, 0.5), interesPrestamo: rr(0.8, 4), tilgungsbeitragPerMille: rr(4, 10), comision: 1.6, sondertilgung: Math.random() < 0.3 ? ri(0, 8000) : 0, sonderAhorro: Math.random() < 0.3 ? ri(0, 6000) : 0, pagoAhorro: Math.random() < 0.3 ? ri(300, 3000) : 0 };
    const bank = { pct: 0, anios: 0, interesAhorro: 0, interesPrestamo: rr(1.5, 6), tilgungInicial: rr(1, 4), comision: 0, zinsbindung: ri(5, 25), sondertilgung: Math.random() < 0.3 ? ri(0, 8000) : 0, recargoST: rr(0, 0.4) };
    const rEst = engine.calcInmuebleOption(precio, est), rk = engine.calcInmuebleOption(precio, bank);
    if (rEst.noAmortiza || rk.noAmortiza) continue;
    const pe = engine.inmuebleCurvaSaldo(precio, rEst, est), pb = engine.inmuebleCurvaSaldo(precio, rk, bank);
    const rows = engine.inmuebleHitosComprar(precio, rEst, rk, pe, pb, Math.round(bank.zinsbindung * 12));
    const tEst = engine.inmuebleMesesDesdeHoy(rEst, 0), tBanco = engine.inmuebleMesesDesdeHoy(rk, 0);
    assert.strictEqual(pe[pe.length - 1].meses, tEst, 'fin de la curva del Bausparvertrag');
    assert.strictEqual(pb[pb.length - 1].meses, tBanco, 'fin de la curva del banco');
    assert.strictEqual(rows.find(r => r.n === 'Bausparvertrag pagado').m, tEst, 'hito Bausparvertrag pagado');
    assert.strictEqual(rows.find(r => r.n === 'Banco pagado').m, tBanco, 'hito Banco pagado');
    assert.strictEqual(tEst, rEst.mesesTotal); assert.strictEqual(tEst, (rEst.mesesTotal - rEst.mesesPrestamo) + rEst.mesesPrestamo);
  }
});
test('Refinanciar: la duración desde hoy (espera + préstamo, con el ahorro en paralelo) coincide con la curva y los hitos', () => {
  let casos = 0;
  for (let i = 0; i < 400; i++) {
    const refi = { importeOriginal: ri(100000, 500000), interesOriginal: rr(1, 6), plazoOriginal: ri(15, 35), fechaInicio: engine.isoDateYearsAgo(ri(1, 12)), fechaRefi: engine.isoDateYearsAgo(-ri(1, 10)), saldoHoy: 0,
      banco: { interesPrestamo: rr(1.5, 6), tilgungInicial: rr(1, 4), comision: 0, zinsbindung: ri(5, 20), sondertilgung: 0, recargoST: 0, topeST: 0, pagoPre: 0 },
      a: { pct: ri(10, 100), interesAhorro: rr(0, 0.5), interesPrestamo: rr(0.8, 4), tilgungsbeitragPerMille: rr(4, 10), comision: 1.6, sondertilgung: 0, topeST: 0, sonderAhorro: 0, pagoAhorro: 0, pagoPrestamo: 0 } };
    const rem = engine.calcRefiRemaining(refi), fr = engine.fechaRefiEfectiva(refi), espera = engine.mesesEntreFechas(engine.todayISO(), fr), saldo = engine.saldoEnFecha(refi, fr);
    if (!(espera > 0) || !(saldo > 1000)) continue;
    const rBanco = engine.calcInmuebleOption(saldo, { pct: 0, anios: 0, interesAhorro: 0, interesPrestamo: refi.banco.interesPrestamo, tilgungInicial: refi.banco.tilgungInicial, comision: 0, zinsbindung: refi.banco.zinsbindung });
    const rEst = engine.calcInmuebleOption(saldo, Object.assign({ sinMinimoAhorro: true, anios: espera / 12, ahorroPorTiempo: true }, refi.a));
    if (rBanco.noAmortiza || rEst.noAmortiza) continue;
    const pb = engine.inmuebleCurvaSaldoRefi(rem, refi, espera, rBanco, refi.banco, false), pe = engine.inmuebleCurvaSaldoRefi(rem, refi, espera, rEst, refi.a, true);
    const rows = engine.inmuebleHitosRefi(refi, espera, rEst, rBanco, pe, pb);
    const tEst = engine.inmuebleMesesDesdeHoy(rEst, espera), tBanco = engine.inmuebleMesesDesdeHoy(rBanco, espera);
    assert.strictEqual(tBanco, espera + rBanco.mesesPrestamo, 'banco: espera + préstamo');
    assert.strictEqual(tEst, espera + rEst.mesesPrestamo, 'Badenia: el ahorro corre en paralelo durante la espera, no se suma aparte');
    assert.strictEqual(pe[pe.length - 1].meses, tEst, 'fin de la curva de Badenia'); assert.strictEqual(pb[pb.length - 1].meses, tBanco, 'fin de la curva del banco');
    assert.strictEqual(rows.find(r => r.n === 'Badenia pagada').m, tEst, 'hito Badenia pagada'); assert.strictEqual(rows.find(r => r.n === 'Banco pagado').m, tBanco, 'hito Banco pagado');
    casos++;
  }
  assert(casos > 100, 'pocos casos válidos: ' + casos);
});

console.log('Formato de importes');
const utilSrc = require('fs').readFileSync(process.env.UTIL || path.join(__dirname, '..', 'util.js'), 'utf8');
const { eur: eurFmt } = new Function(utilSrc + ';return {eur:eur};')();
test('eur(): punto de millares siempre (también 1.090), espacio de no separación y negativos', () => {
  assert.strictEqual(eurFmt(1090), '1.090\u00a0€'); assert.strictEqual(eurFmt(1000), '1.000\u00a0€'); assert.strictEqual(eurFmt(999), '999\u00a0€');
  assert.strictEqual(eurFmt(10902), '10.902\u00a0€'); assert.strictEqual(eurFmt(1234567), '1.234.567\u00a0€');
  assert.strictEqual(eurFmt(-1090), '-1.090\u00a0€'); assert.strictEqual(eurFmt(999.5), '1.000\u00a0€');
  assert.strictEqual(eurFmt(null), '—'); assert.strictEqual(eurFmt(NaN), '—');
});

console.log('Registros mal formados y campos huérfanos');
test('normalizeInmueble no rompe con registros mal formados y devuelve algo utilizable', () => {
  const malos = [{}, { inmueble: null }, { inmueble: 'x' }, { inmueble: 5 }, { inmueble: [] },
    { inmueble: { precio: 'abc', a: null, b: 7, banco: 5, refi: 'z' } },
    { inmueble: { modo: 'zzz', curvaTipos: 'x', curvaOff: 5, refi: { a: 3, b: null, banco: [] } } }];
  for (const rec of malos) {
    const inm = engine.normalizeInmueble(rec);
    const r = engine.calcInmuebleOption(engine.inmuebleFin(inm), inm.a), rb = engine.calcInmuebleOption(engine.inmuebleFin(inm), inm.banco);
    assert(isFinite(r.costeTotal) && isFinite(rb.costeTotal), 'cálculo no finito tras normalizar ' + JSON.stringify(rec));
    const j = JSON.stringify(inm); assert.strictEqual(JSON.stringify(engine.normalizeInmueble({ inmueble: JSON.parse(j) })), j, 'no idempotente');
  }
});
test('los campos huérfanos de los escenarios quitados se limpian', () => {
  const d = engine.defaultInmueble();
  Object.assign(d.banco, { numEscenarios: 3, tipoPost1: 3, tipoPost2: 4, tipoPost3: 6, pagoPost: 0, nombrePost1: 'x' });
  Object.assign(d.refi.banco, { numEscenarios: 2, tipoPost1: 2.5 }); d.numEscenarios = 3;
  const inm = engine.normalizeInmueble({ inmueble: d });
  const mal = k => /^(numEscenarios|tipoPost\d*|nombrePost\d*|pagoPost)$/.test(k);
  [inm, inm.banco, inm.refi, inm.refi.banco].forEach(o => assert.deepStrictEqual(Object.keys(o).filter(mal), [], 'quedan campos huérfanos'));
  assert.strictEqual(inm.banco.interesPrestamo, 3.5);
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

console.log('\nDatos de la ficha del cliente');
test('el Proyecto inmobiliario trae el neto del hogar y el precio objetivo de la ficha', () => {
  const rec = { data: { fields: { 'inc:salarioNeto_A': '2000', 'inc:salarioNeto_B': '1200', 'inc:autonomoNeto_B': '300', 'inc:alquiler_A': '500', 'sit:precioViviendaObjetivo': '350000' } } };
  const inm = engine.normalizeInmueble(rec);
  assert.strictEqual(inm.ingresoNeto, 3500);
  assert.strictEqual(inm.precio, 350000);
});
test('lo que el asesor cambia a mano no se pisa, y un cambio posterior en la ficha sí se sigue', () => {
  const rec = { data: { fields: { 'inc:salarioNeto_A': '3000', 'sit:precioViviendaObjetivo': '300000' } } };
  engine.normalizeInmueble(rec);
  rec.inmueble.precio = 420000;                                   // el asesor lo cambia a mano
  rec.data.fields['sit:precioViviendaObjetivo'] = '310000';      // la ficha cambia
  rec.data.fields['inc:salarioNeto_A'] = '3200';
  const inm = engine.normalizeInmueble(rec);
  assert.strictEqual(inm.precio, 420000);
  assert.strictEqual(inm.ingresoNeto, 3200);
});
test('un ingreso ya escrito a mano, o una ficha sin esos datos, se quedan como están', () => {
  const r1 = { inmueble: Object.assign(engine.defaultInmueble(), { ingresoNeto: 2500 }), data: { fields: { 'inc:salarioNeto_A': '4000' } } };
  assert.strictEqual(engine.normalizeInmueble(r1).ingresoNeto, 2500);
  const r2 = { data: { fields: {} } };
  const inm = engine.normalizeInmueble(r2);
  assert.strictEqual(inm.precio, engine.defaultInmueble().precio);
  assert.strictEqual(inm.ingresoNeto, 0);
  assert.strictEqual(engine.normalizeInmueble({}).ingresoNeto, 0);
});

console.log('\nComprar y refinanciar');
test('el crédito de la compra se deriva del importe a financiar y del banco; al refinanciar sigue la fecha de inicio + Zinsbindung', () => {
  const rec = { data: { fields: {} }, inmueble: engine.defaultInmueble() };
  rec.inmueble.precio = 300000; rec.inmueble.gastosPct = 10; rec.inmueble.capitalPropio = 50000;
  rec.inmueble.modo = 'refi'; rec.inmueble.refi.compraNueva = true;
  rec.inmueble.banco.interesPrestamo = 4; rec.inmueble.banco.tilgungInicial = 2; rec.inmueble.banco.zinsbindung = 10;
  const inm = engine.normalizeInmueble(rec), rf = inm.refi;
  assert.strictEqual(rf.importeOriginal, 280000);
  assert.strictEqual(rf.interesOriginal, 4);
  near(rf.cuotaActual, 280000 * (4 + 2) / 1200, 0.01, 'cuota = capital × (interés + Tilgung) / 12');
  assert.strictEqual(rf.saldoHoy, 0);
  const rem = engine.calcRefiRemaining(rf);
  near(rem.saldoPendiente, 280000, 0.5, 'hoy se debe todo el importe');
  assert.strictEqual(rf.fechaRefi.slice(0, 7), engine.inmuebleFechaRefiYM(inm));
});
test('refinanciar con banco mantiene la cuota que ya se paga, salvo que se cambie el plazo o el pago', () => {
  const rec = { inmueble: engine.defaultInmueble() }; rec.inmueble.modo = 'refi'; rec.inmueble.refi.compraNueva = true;
  let rf = engine.normalizeInmueble(rec).refi;
  const saldo = engine.saldoEnFecha(rf, rf.fechaRefi);
  const r = engine.calcInmuebleOption(saldo, Object.assign({ pct: 0, anios: 0, interesAhorro: 0 }, rf.banco));
  near(r.cuotaPrestamo, rf.cuotaActual, rf.cuotaActual * 0.002, 'misma cuota tras refinanciar');
  rec.inmueble.refi.mantenerCuota = false; rec.inmueble.refi.banco.tilgungInicial = 2;
  rf = engine.normalizeInmueble(rec).refi;
  assert.strictEqual(rf.banco.tilgungInicial, 2, 'ya no se recalcula');
});
test('al volver a Refinanciar se recuperan los datos del crédito que había antes', () => {
  const rec = { inmueble: engine.defaultInmueble() }; rec.inmueble.modo = 'refi';
  rec.inmueble.refi.importeOriginal = 123456; rec.inmueble.refi.interesOriginal = 2.5; rec.inmueble.refi.banco.tilgungInicial = 3;
  engine.normalizeInmueble(rec);
  rec.inmueble.refi.compraNueva = true;
  assert.notStrictEqual(engine.normalizeInmueble(rec).refi.importeOriginal, 123456);
  rec.inmueble.refi.compraNueva = false;
  const rf = engine.normalizeInmueble(rec).refi;
  assert.strictEqual(rf.importeOriginal, 123456); assert.strictEqual(rf.interesOriginal, 2.5); assert.strictEqual(rf.banco.tilgungInicial, 3);
  assert.strictEqual(rf.antes, undefined);
});
test('si no es compra nueva, el crédito actual escrito a mano no se toca', () => {
  const rec = { inmueble: engine.defaultInmueble() }; rec.inmueble.modo = 'refi';
  rec.inmueble.refi.importeOriginal = 123456; rec.inmueble.refi.interesOriginal = 2.5;
  const rf = engine.normalizeInmueble(rec).refi;
  assert.strictEqual(rf.importeOriginal, 123456); assert.strictEqual(rf.interesOriginal, 2.5);
});
test('cambiar precio o interés recalcula el crédito derivado en la siguiente carga', () => {
  const rec = { inmueble: engine.defaultInmueble() }; rec.inmueble.modo = 'refi'; rec.inmueble.refi.compraNueva = true;
  engine.normalizeInmueble(rec);
  rec.inmueble.precio = 400000; rec.inmueble.banco.interesPrestamo = 3;
  const rf = engine.normalizeInmueble(rec).refi;
  assert.strictEqual(rf.importeOriginal, 400000); assert.strictEqual(rf.interesOriginal, 3);
});

console.log('\nHitos: cada cifra contra una simulación mes a mes');
// Simulaciones independientes (bucle mes a mes, sin usar curvas ni interpolación) de lo que queda por pagar en el mes m.
function simPrestamo(cap, rate, pay, n) { let b = cap; for (let i = 0; i < n; i++) { b = b * (1 + rate / 1200) - pay; if (b < 0) b = 0; } return b; }
function simAhorroAcum(cuota, sonder, rate, n) { let b = 0; for (let i = 1; i <= n; i++) { b = b * (1 + rate / 1200) + cuota; if (sonder > 0 && i % 12 === 0) b += sonder; } return b; }
test('Comprar: las cifras de cada hito (Bausparvertrag y banco) coinciden con una simulación independiente, también en meses sueltos', () => {
  let casos = 0;
  for (let i = 0; i < 300; i++) {
    const precio = ri(80000, 900000);
    const est = { pct: ri(10, 100), anios: rr(3.6, 12), interesAhorro: rr(0, 0.5), interesPrestamo: rr(0.8, 4), tilgungsbeitragPerMille: rr(4, 10), comision: 1.6, sondertilgung: 0, sonderAhorro: Math.random() < 0.3 ? ri(0, 4000) : 0, pagoAhorro: Math.random() < 0.3 ? ri(300, 3000) : 0 };
    const bank = { pct: 0, anios: 0, interesAhorro: 0, interesPrestamo: rr(1.5, 6), tilgungInicial: rr(1, 4), comision: 0, zinsbindung: ri(5, 25), sondertilgung: 0, recargoST: 0, pagoPre: Math.random() < 0.3 ? ri(500, 3000) : 0 };
    const rEst = engine.calcInmuebleOption(precio, est), rk = engine.calcInmuebleOption(precio, bank);
    if (rEst.noAmortiza || rk.noAmortiza) continue;
    const pe = engine.inmuebleCurvaSaldo(precio, rEst, est), pb = engine.inmuebleCurvaSaldo(precio, rk, bank);
    const rows = engine.inmuebleHitosComprar(precio, rEst, rk, pe, pb, Math.round(bank.zinsbindung * 12));
    rows.forEach(r => {
      const m = r.m;
      const esperadoBanco = m >= rk.mesesTotal ? 0 : simPrestamo(precio, bank.interesPrestamo, rk.cuotaPrestamo, m);
      let esperadoBaus;
      if (m >= rEst.mesesTotal) esperadoBaus = 0;
      else if (rEst.mesesAhorro > 0 && m <= rEst.mesesAhorro) esperadoBaus = precio - Math.min(simAhorroAcum(rEst.cuotaAhorro, rEst.sonderAhorro, est.interesAhorro, m), rEst.objetivoAhorro);
      else esperadoBaus = simPrestamo(rEst.capitalPrestamo, est.interesPrestamo, rEst.cuotaPrestamo, m - rEst.mesesAhorro);
      near(r.banco, esperadoBanco, 0.5, 'banco en el hito "' + r.n + '" (mes ' + m + ')');
      near(r.baus, esperadoBaus, 0.5, 'Bausparvertrag en el hito "' + r.n + '" (mes ' + m + ')');
    });
    casos++;
  }
  assert.ok(casos > 100, 'casos comprobados: ' + casos);
});
test('la asignación del Bausparvertrag deja exactamente precio − ahorro objetivo, aunque caiga entre dos puntos de la rejilla de 3 meses', () => {
  const cfg = { pct: 40, anios: 3.6, interesAhorro: 0.05, interesPrestamo: 1.75, tilgungsbeitragPerMille: 5.4539, comision: 1.6 };
  const r = engine.calcInmuebleOption(100000, cfg);
  assert.strictEqual(r.mesesAhorro, 43);
  const pts = engine.inmuebleCurvaSaldo(100000, r, cfg);
  near(engine.inmuebleValorEn(pts, 43), 60000, 0.01, 'pendiente al asignar');
  assert.ok(pts.some(p => p.meses === 43), 'la rejilla incluye el mes de la asignación');
  assert.strictEqual(pts[pts.length - 1].meses, r.mesesTotal);
});
test('Refinanciar: las cifras de cada hito coinciden con una simulación independiente (crédito actual, ahorro en paralelo y préstamo nuevo)', () => {
  let casos = 0;
  for (let i = 0; i < 300; i++) {
    const refi = { importeOriginal: ri(100000, 500000), interesOriginal: rr(1, 6), plazoOriginal: ri(15, 35), fechaInicio: engine.isoDateYearsAgo(ri(1, 12)), fechaRefi: engine.isoDateYearsAgo(-ri(1, 10)), saldoHoy: 0,
      banco: { interesPrestamo: rr(1.5, 6), tilgungInicial: rr(1, 4), comision: 0, zinsbindung: ri(5, 20), sondertilgung: 0, recargoST: 0, topeST: 0, pagoPre: 0 },
      a: { pct: ri(10, 100), interesAhorro: rr(0, 0.5), interesPrestamo: rr(0.8, 4), tilgungsbeitragPerMille: rr(4, 10), comision: 1.6, sondertilgung: 0, topeST: 0, sonderAhorro: 0, pagoAhorro: 0, pagoPrestamo: 0 } };
    const rem = engine.calcRefiRemaining(refi), fr = engine.fechaRefiEfectiva(refi), espera = engine.mesesEntreFechas(engine.todayISO(), fr), saldo = engine.saldoEnFecha(refi, fr);
    if (!(espera > 0) || !(saldo > 1000)) continue;
    const rBanco = engine.calcInmuebleOption(saldo, { pct: 0, anios: 0, interesAhorro: 0, interesPrestamo: refi.banco.interesPrestamo, tilgungInicial: refi.banco.tilgungInicial, comision: 0, zinsbindung: refi.banco.zinsbindung });
    const rEst = engine.calcInmuebleOption(saldo, Object.assign({ sinMinimoAhorro: true, anios: espera / 12, ahorroPorTiempo: true }, refi.a));
    if (rBanco.noAmortiza || rEst.noAmortiza) continue;
    const pb = engine.inmuebleCurvaSaldoRefi(rem, refi, espera, rBanco, refi.banco, false), pe = engine.inmuebleCurvaSaldoRefi(rem, refi, espera, rEst, refi.a, true);
    const rows = engine.inmuebleHitosRefi(refi, espera, rEst, rBanco, pe, pb);
    const finEst = engine.inmuebleMesesDesdeHoy(rEst, espera), finBanco = engine.inmuebleMesesDesdeHoy(rBanco, espera);
    const credito = t => simPrestamo(rem.saldoPendiente, refi.interesOriginal, rem.cuotaOriginal, Math.min(t, rem.mesesRestantes));
    rows.forEach(r => {
      const m = r.m;
      const eb = m >= finBanco ? 0 : (m <= espera ? credito(m) : simPrestamo(rBanco.capitalPrestamo, refi.banco.interesPrestamo, rBanco.cuotaPrestamo, m - espera));
      const ee = m >= finEst ? 0 : (m <= espera ? credito(m) - Math.min(simAhorroAcum(rEst.cuotaAhorro, rEst.sonderAhorro, refi.a.interesAhorro, m), rEst.objetivoAhorro) : simPrestamo(rEst.capitalPrestamo, refi.a.interesPrestamo, rEst.cuotaPrestamo, m - espera));
      near(r.banco, eb, 0.5, 'banco en "' + r.n + '" (mes ' + m + ')');
      near(r.baus, Math.max(0, ee), 0.5, 'Badenia en "' + r.n + '" (mes ' + m + ')');
    });
    casos++;
  }
  assert.ok(casos > 50, 'casos comprobados: ' + casos);
});

console.log('\nSemáforo del capital propio');
test('menos del 10 % rojo, de 10 % a menos de 15 % amarillo, 15 % o más verde; sin precio no hay semáforo', () => {
  const n = (precio, capitalPropio) => engine.inmuebleCapitalNivel({ precio, capitalPropio }).nivel;
  assert.strictEqual(n(200000, 0), 'rojo');
  assert.strictEqual(n(200000, 19999), 'rojo');
  assert.strictEqual(n(200000, 20000), 'amarillo');
  assert.strictEqual(n(200000, 29999), 'amarillo');
  assert.strictEqual(n(200000, 30000), 'verde');
  assert.strictEqual(n(200000, 80000), 'verde');
  assert.strictEqual(n(0, 50000), '');
  near(engine.inmuebleCapitalNivel({ precio: 250000, capitalPropio: 20000 }).pct, 8, 1e-9);
});

console.log('\nPropuesta según la ficha: capital propio y cuándo empezar');
const fichaCapital = { data: { expMode: 'cat', fields: { 'inc:salarioNeto_A': '3000', 'inc:salarioNeto_B': '1500', 'exp:alquilerHipoteca': '900', 'exp:super': '600', 'exp:ocio': '300', 'sit:ahorroLiquido_A': '20000', 'sit:ahorroLiquido_B': '5000', 'sit:tagesgeldSaldo': '12000', 'sit:precioViviendaObjetivo': '300000' } } };
test('capital propio propuesto = ahorro líquido (cuenta + Tagesgeld) menos 6 meses de gastos totales, a múltiplos de 100 €', () => {
  const d = engine.inmuebleDatosCliente(fichaCapital);
  assert.strictEqual(d.flujo.liquido, 37000);
  assert.strictEqual(d.flujo.gastosTotales, 1800);
  assert.strictEqual(d.capital, 26200, '37.000 − 6 × 1.800 = 26.200');
  const inm = engine.normalizeInmueble(JSON.parse(JSON.stringify(fichaCapital)));
  assert.strictEqual(inm.capitalPropio, 26200); assert.strictEqual(inm.precio, 300000);
});
test('el capital propio a mano no se pisa; con menos ahorro que la reserva se propone 0', () => {
  const rec = JSON.parse(JSON.stringify(fichaCapital));
  engine.normalizeInmueble(rec); rec.inmueble.capitalPropio = 50000; rec.data.fields['sit:ahorroLiquido_A'] = '30000';
  assert.strictEqual(engine.normalizeInmueble(rec).capitalPropio, 50000);
  const pobre = JSON.parse(JSON.stringify(fichaCapital)); pobre.data.fields['sit:ahorroLiquido_A'] = '1000'; pobre.data.fields['sit:ahorroLiquido_B'] = '0'; pobre.data.fields['sit:tagesgeldSaldo'] = '0';
  assert.strictEqual(engine.inmuebleDatosCliente(pobre).capital, 0);
});
test('cuándo empezar: meses para reunir el 10 % y el 20 % del precio ahorrando lo que sobra cada mes (con el alquiler aún pagado)', () => {
  const inm = engine.normalizeInmueble(JSON.parse(JSON.stringify(fichaCapital)));      // capital 26.200 · sobra 4.500 − 1.800 = 2.700/mes
  const c = engine.inmuebleCuandoComprar(inm);
  assert.strictEqual(c.ahorroMes, 2700);
  assert.deepStrictEqual(c.metas.map(m => [m.pct, m.meta, m.faltan, m.meses]), [[10, 30000, 3800, 2], [20, 60000, 33800, 13]]);
  inm.capitalPropio = 70000;
  assert.deepStrictEqual(engine.inmuebleCuandoComprar(inm).metas.map(m => m.meses), [0, 0]);
  const sinMargen = engine.normalizeInmueble({ data: { fields: { 'inc:salarioNeto_A': '1000', 'exp:super': '1500' } } });
  assert.strictEqual(engine.inmuebleCuandoComprar(sinMargen).metas[1].meses, null);
  assert.strictEqual(engine.inmuebleCuandoComprar(engine.normalizeInmueble({})), null);
});

console.log('\n' + passed + ' correctas, ' + failed + ' fallidas');
gaps.forEach(g => console.log('  · ' + g));
process.exit(failed ? 1 : 0);
