// Pruebas del modelo de Plan Futuro (plan-futuro.html): rango de escenarios, coberturas y valor real. `node tests/plan-futuro.test.js`.
// El modelo vive dentro de la página, así que se extrae el tramo de script entre «const THIS_YEAR» y «function countUp» y se ejecuta aislado.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const html = fs.readFileSync(path.join(__dirname, '..', 'plan-futuro.html'), 'utf8');
const ini = html.indexOf('const THIS_YEAR='), fin = html.indexOf('function countUp(');
assert(ini > 0 && fin > ini, 'no se encuentra el modelo en plan-futuro.html');
const codigo = html.slice(ini, fin).replace('const THIS_YEAR=new Date().getFullYear();', 'const THIS_YEAR=2026;')
  .replace(/^const \$=.*$/m, '').replace(/^const eur=.*$/m, '').replace(/^const eurc=.*$/m, '');
const ctx = { Math, Intl, HC: { school: 'real' } }; vm.createContext(ctx);
vm.runInContext(codigo + '\nthis.S=S; this.C=C; this.calcPlan=calcPlan; this.withCfg=withCfg; this.deflate=deflate; this.firstMonth=firstMonth; this.SCENARIOS=SCENARIOS;', ctx);
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message); } }
const base = () => Object.assign(ctx.S, { childAge: 2, monthly: 75, ret: 6, capital0: 1000, targetYear: 2042, dyn: 0, extraYear: 0, payerAge: 35, real: false, infl: 2 });
const sinCob = () => Object.assign(ctx.C, { vs: 'none', kiz: 0, bu: 'none', buRent: 500 });
const cap = () => Math.round(ctx.calcPlan().capital);
const near = (a, b, t) => assert(Math.abs(a - b) <= t, 'esperado ' + b + ' obtenido ' + a);

test('caso de la captura: 2 años, 75 €/mes, 1.000 € extra, 6 %, 16 años → 24.056 €', () => {
  base(); sinCob(); const p = ctx.calcPlan();
  assert.strictEqual(Math.round(p.capital), 24056); assert.strictEqual(Math.round(p.contributed + p.extraPaid), 15400); assert.strictEqual(Math.round(p.growth), 8656);
});
test('rango de escenarios: crece con la rentabilidad y con 0 % queda por debajo de lo aportado', () => {
  base(); sinCob();
  const por = (r) => ctx.withCfg({ ret: r }, cap);
  assert.deepStrictEqual([0, 2, 4, 6, 8].map(por), [13912, 16547, 19863, 24056, 29385]);
  assert(por(0) < 15400, 'con 0 % el capital es menor que lo aportado');
});
test('withCfg calcula con otro escenario y otras coberturas y restaura SIEMPRE lo elegido (incluso si falla)', () => {
  base(); sinCob();
  ctx.withCfg({ ret: 2, C: { bu: 'option' } }, () => { assert.strictEqual(ctx.S.ret, 2); assert.strictEqual(ctx.C.bu, 'option'); });
  assert.strictEqual(ctx.S.ret, 6); assert.strictEqual(ctx.C.bu, 'none');
  assert.throws(() => ctx.withCfg({ ret: 8, C: { vs: 'both' } }, () => { throw new Error('x'); }));
  assert.strictEqual(ctx.S.ret, 6); assert.strictEqual(ctx.C.vs, 'none');
});
test('las coberturas restan capital: cuanto más cubren, menos ahorro', () => {
  base(); sinCob(); const sin = cap();
  const con = (c) => ctx.withCfg({ C: c }, cap);
  assert.strictEqual(con({ bu: 'option' }), 22683); assert.strictEqual(con({ vs: 'death' }), 23730);
  assert.strictEqual(con({ bu: 'option', vs: 'death' }), 22358); assert.strictEqual(con({ bu: 'option', vs: 'death', kiz: 500 }), 18930);
  assert(con({ bu: 'option' }) < sin && con({ bu: 'option', vs: 'death' }) < con({ bu: 'option' }));
});
test('valor real: deflacta el capital con la inflación supuesta y no toca nada en euros nominales', () => {
  base(); sinCob(); const nominal = ctx.calcPlan().capital;
  assert.strictEqual(ctx.deflate(nominal, 16), nominal);                                 // por defecto, euros nominales
  ctx.S.real = true;
  near(ctx.deflate(nominal, 16), nominal / Math.pow(1.02, 16), 0.001); assert.strictEqual(Math.round(ctx.deflate(nominal, 16)), 17523);
  ctx.S.infl = 0; assert.strictEqual(ctx.deflate(nominal, 16), nominal);                 // sin inflación no cambia
  ctx.S.infl = 3; assert(ctx.deflate(nominal, 16) < 17523); assert.strictEqual(ctx.deflate(nominal, 0), nominal);   // año 0: sin efecto
  ctx.S.real = false; assert.strictEqual(Math.round(ctx.calcPlan().capital), Math.round(nominal)); // el cálculo base no depende del interruptor
});
test('horizontes cortos: con 6 % a 3 años el capital apenas supera lo aportado (los costes de entrada pesan)', () => {
  base(); sinCob(); ctx.S.targetYear = 2029; const p = ctx.calcPlan();
  assert(Math.abs(p.growth) < 50, 'crecimiento ' + p.growth); assert.strictEqual(Math.round(p.capital), 3707);
});

console.log('\nSprint 1 · regresión del motor (sección 12 del prompt maestro): casos límite y comprobación cruzada');
const sim = (o) => { base(); sinCob(); Object.assign(ctx.S, { capital0: 0 }, o); return ctx.calcPlan(); };   // sin capital inicial salvo que se indique
// Fórmula cerrada independiente (sin coberturas): saldo bruto antes del ajuste por costes. Aportaciones al FINAL de cada mes, 2,5 % de coste de entrada los 60 primeros meses.
function brutoCerrado(o) {
  const r = (o.ret != null ? o.ret : 6) / 100 / 12, g = 1 + r, n = (o.targetYear - 2026) * 12, M = o.monthly != null ? o.monthly : 75, c0 = o.capital0 || 0, e = o.extraYear || 0, d = (o.dyn || 0) / 100;
  let total = c0 * Math.pow(g, n);
  for (let k = 0; k < n; k++) {                                   // suma directa de cada aportación, capitalizada hasta el final
    const cuota = M * Math.pow(1 + d, Math.floor(k / 12)), neta = cuota * (k < 60 ? 0.975 : 1);
    total += neta * Math.pow(g, n - 1 - k);
    if (e > 0 && k % 12 === 11) total += e * Math.pow(g, n - 1 - k);
  }
  return total;
}
test('comprobación cruzada: el modelo coincide con la fórmula independiente en una rejilla de casos (con cuota creciente y extras)', () => {
  [{ capital0: 0 }, { capital0: 27000 }, { monthly: 0 }, { ret: 0 }, { ret: 2 }, { ret: 8 }, { ret: -2 }, { extraYear: 500 }, { dyn: 3 }, { capital0: 5000, extraYear: 1000, dyn: 2, ret: 4 }, { targetYear: 2031 }, { targetYear: 2060 }]
    .forEach((o) => { const p = sim(o), esperado = brutoCerrado(Object.assign({ targetYear: 2042 }, o)); near(p.raw, esperado, 0.01 + Math.abs(esperado) * 1e-9); });
});
test('el ejemplo de la sección 3.8 (27.000 € iniciales, 75 €/mes, 16 años, 6 %) sale del modelo y se desglosa: 94.176 € brutos menos el ajuste del 9 %', () => {
  const p = sim({ capital0: 27000 });
  assert.strictEqual(Math.round(p.raw), 94176); assert.strictEqual(+(p.h * 100).toFixed(1), 9.0); assert.strictEqual(Math.round(p.capital), 85701); assert.strictEqual(Math.round(p.contributed + p.extraPaid), 41400);
  // no es una constante: cambiar un dato cambia el resultado
  assert.notStrictEqual(Math.round(sim({ capital0: 27000, monthly: 100 }).capital), 85701);
});
test('aportación inicial cero y aportación mensual cero: el capital es cero (no negativo ni inventado)', () => {
  assert.strictEqual(sim({ capital0: 0, monthly: 0 }).capital, 0);
  const solo = sim({ capital0: 10000, monthly: 0 }); near(solo.raw, 10000 * Math.pow(1 + 0.06 / 12, 192), 0.01); assert.strictEqual(solo.contributed, 0);
});
test('rentabilidad cero y negativa: queda por debajo de lo aportado y nunca es negativo', () => {
  const cero = sim({ ret: 0 }), neg = sim({ ret: -3 });
  assert(cero.capital < cero.contributed && cero.capital > 0); assert(neg.capital < cero.capital && neg.capital >= 0);
  near(cero.raw, 75 * 60 * 0.975 + 75 * 132, 0.001);
});
test('el capital aportado es la suma exacta de lo pagado: inicial + mensualidades + extras (y con cuota creciente)', () => {
  const p = sim({ capital0: 2000, extraYear: 500 }); assert.strictEqual(p.contributed, 75 * 192); assert.strictEqual(p.extraPaid, 2000 + 500 * 16);
  const q = sim({ dyn: 3 }); let suma = 0; for (let k = 0; k < 192; k++) suma += 75 * Math.pow(1.03, Math.floor(k / 12)); near(q.contributed, suma, 0.001);
});
test('horizontes de 4, 5 y más años: el capital crece con el tiempo y la simulación procesa siempre desde el primer mes', () => {
  const y = (a) => sim({ targetYear: 2026 + a }).capital; assert(y(4) < y(5) && y(5) < y(6) && y(6) < y(16));
  near(sim({ targetYear: 2031 }).raw, brutoCerrado({ targetYear: 2031 }), 0.01);        // 5 años: incluye los 4 primeros (no se parte de cero en el año 5)
});
test('los escenarios son coherentes: a más rentabilidad, más capital, con los mismos aportes', () => {
  const v = [0, 2, 4, 6, 8].map((r) => sim({ ret: r }).capital); for (let i = 1; i < v.length; i++) assert(v[i] > v[i - 1]);
  [0, 2, 4, 6, 8].forEach((r) => assert.strictEqual(sim({ ret: r }).contributed, sim({}).contributed));
});
test('las coberturas se descuentan una sola vez: la suma de ahorro invertido y primas es la aportación total', () => {
  base(); Object.assign(ctx.C, { vs: 'both', kiz: 500, bu: 'option', buRent: 500 });
  const p = ctx.calcPlan(), s = ctx.simulate(16); sinCob();
  near(s.invested + s.riskTotal, s.contributed, 0.001); assert(s.riskTotal > 0 && s.invested < s.contributed);
});
test('hallazgo conocido (bajo): con horizonte 0 el ajuste por costes se aplica igualmente a un capital inicial sin plazo', () => {
  const p = sim({ capital0: 1000, targetYear: 2026 }); assert.strictEqual(Math.round(p.capital), 910);    // 1.000 × (1 − 9 %). La pantalla exige al menos 2 años, así que no es visible.
});
console.log('\n' + passed + ' correctas, ' + failed + ' fallidas');
process.exit(failed ? 1 : 0);
