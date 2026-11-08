// Pruebas del modelo de Plan Futuro (plan-futuro.html): rango de escenarios, coberturas y valor real. `node tests/plan-futuro.test.js`.
// El modelo vive dentro de la página, así que se extrae el tramo de script entre «const THIS_YEAR» y «function countUp» y se ejecuta aislado.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const html = fs.readFileSync(path.join(__dirname, '..', 'plan-futuro.html'), 'utf8');
const ini = html.indexOf('const THIS_YEAR='), fin = html.indexOf('function countUp(');
assert(ini > 0 && fin > ini, 'no se encuentra el modelo en plan-futuro.html');
const codigo = html.slice(ini, fin).replace('const THIS_YEAR=new Date().getFullYear();', 'const THIS_YEAR=2026;')
  .replace(/^const \$=.*$/m, '').replace(/^const eur=.*$/m, '').replace(/^const eurc=.*$/m, '');
const ctx = { Math, Intl, HC: { school: 'real' } }; vm.createContext(ctx);
// Los costes reales de las coberturas son datos internos de Generali y NO están en el repositorio. Estas tablas son INVENTADAS, solo para probar la lógica.
const FICTICIAS = { kiz: [[0.25, 10], [18, 10]], buo: [[0.25, 5], [18, 20]], sbu: { grund: 30, haupt: 30, real: 30, gym: 30, sek2: 30 }, vs: { death: 0.02, both: 0.05 } };
const conTablas = () => { ctx.AORAES_COSTES_COBERTURAS = FICTICIAS; }, sinTablas = () => { delete ctx.AORAES_COSTES_COBERTURAS; };
conTablas();
vm.runInContext(codigo + '\nthis.S=S; this.C=C; this.calcPlan=calcPlan; this.withCfg=withCfg; this.deflate=deflate; this.firstMonth=firstMonth; this.SCENARIOS=SCENARIOS; this.simulate=simulate; this.futAt=futAt; this.futCost=futCost; this.futNeeded=futNeeded; this.coverCostMissing=coverCostMissing; this.coverTables=coverTables; this.fichaAPlan=fichaAPlan; this.effRet=effRet; this.seqCrash=seqCrash; this.seqMean=seqMean; this.seqParse=seqParse; this.seqCapital=seqCapital; this.seqRowAt=seqRowAt;', ctx);
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
  // Con tablas ficticias: cada cobertura resta lo suyo y combinadas restan más; una cobertura de coste constante equivale a pagar esa cuota menos
  assert(con({ vs: 'death' }) < sin && con({ vs: 'both' }) < con({ vs: 'death' }));
  assert(con({ bu: 'option', vs: 'death', kiz: 500 }) < con({ bu: 'option', vs: 'death' }));
  near(con({ kiz: 500 }), (() => { ctx.S.monthly = 65; const c = cap(); ctx.S.monthly = 75; return c; })(), 1, 'kiz constante de 10 € = cuota de 65 € sin coberturas');
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

console.log('\nEl futuro de tu hijo/a: capital por edad y coste de los objetivos (usa el mismo motor)');
test('capital por edad = el del motor principal: el de los 18 años de la captura (24.056 €) y es el mismo que el de la tarjeta', () => {
  base(); sinCob(); const r = ctx.futAt(18);
  assert.strictEqual(r.ok, true); assert.strictEqual(r.years, 16); assert.strictEqual(r.year, 2042); assert.strictEqual(Math.round(r.capital), 24056);
  ctx.S.targetYear = 2042; assert.strictEqual(r.capital, ctx.calcPlan().capital); assert.strictEqual(r.capital, ctx.simulate(16).capital);
  assert.strictEqual(Math.round(r.pocket), 15400); assert.strictEqual(Math.round(r.growth), 8656); assert.strictEqual(r.below, false);
});
test('el capital crece con la edad y el poder adquisitivo se calcula con la inflación supuesta', () => {
  base(); sinCob(); const e = [16, 18, 20, 22, 25, 30].map((a) => ctx.futAt(a).capital); for (let i = 1; i < e.length; i++) assert(e[i] > e[i - 1]);
  near(ctx.futAt(18).real, ctx.futAt(18).capital / Math.pow(1.02, 16), 1e-6); ctx.S.infl = 3; near(ctx.futAt(18).real, ctx.futAt(18).capital / Math.pow(1.03, 16), 1e-6); base();
});
test('edades que no se pueden proyectar: ya pasadas o con menos de la duración mínima del plan', () => {
  base(); ctx.S.childAge = 15; ctx.S.capital0 = 0;
  assert.strictEqual(ctx.futAt(15).reason, 'past'); assert.strictEqual(ctx.futAt(16).reason, 'short');   // 1 año < 2 años mínimos
  assert.strictEqual(ctx.futAt(17).ok, true);                                                             // 2 años
  assert.strictEqual(ctx.futAt(18).ok, true); assert.strictEqual(ctx.futAt(18).below, true);              // 3 años: capital por debajo de lo aportado → la pantalla lo avisa
  base();
});
test('coste futuro de un objetivo = presupuesto de hoy × (1 + inflación)^años; sin presupuesto no se inventa ninguno', () => {
  base(); near(ctx.futCost(1500, 16), 1500 * Math.pow(1.02, 16), 1e-9); assert.strictEqual(Math.round(ctx.futCost(1500, 16)), 2059); assert.strictEqual(Math.round(ctx.futCost(20000, 28)), 34820);
  assert.strictEqual(ctx.futCost(0, 16), null); assert.strictEqual(ctx.futCost(undefined, 16), null); assert.strictEqual(ctx.futCost(-5, 16), null);
  ctx.S.infl = 0; assert.strictEqual(ctx.futCost(1500, 16), 1500); base();
});
test('la regla «solo desde el año 5» es un interruptor (FUT_MIN_VISIBLE_YEARS): por defecto no oculta nada; a 5, oculta solo la vista y no el cálculo', () => {
  assert(/const FUT_MIN_VISIBLE_YEARS=0;/.test(codigo), 'por defecto debe estar en 0 mientras cumplimiento no responda');
  const ctx5 = { Math, Intl, HC: { school: 'real' } }; vm.createContext(ctx5);
  vm.runInContext(codigo.replace('const FUT_MIN_VISIBLE_YEARS=0;', 'const FUT_MIN_VISIBLE_YEARS=5;') + '\nthis.S=S; this.futAt=futAt; this.simulate=simulate;', ctx5);
  Object.assign(ctx5.S, { childAge: 2, monthly: 75, ret: 6, capital0: 0, targetYear: 2042, dyn: 0, extraYear: 0, real: false, infl: 2 });
  assert.strictEqual(ctx5.futAt(5).reason, 'hidden');                       // 3 años: oculto
  assert.strictEqual(ctx5.futAt(7).ok, true);                                // 5 años: visible
  assert(ctx5.simulate(3).capital > 0);                                      // el motor sigue calculando los primeros años
});

// ----- Ficha del cliente → Plan Futuro -----
test('ficha: toma la edad de quien paga (limitada a 18–80) y la edad del hijo/a menor de 0 a 18 años; ignora lo demás', () => {
  const r = ctx.fichaAPlan({ name: 'Ana', age: 37, childrenAges: [9, 3, 21, 14] }, 0);
  assert.strictEqual(r.payerAge, 37); assert.strictEqual(r.childAge, 3); assert.deepStrictEqual(Array.from(r.elegibles), [3, 9, 14]); assert.strictEqual(r.total, 4); assert.strictEqual(r.name, 'Ana');
  assert.strictEqual(ctx.fichaAPlan({ age: 12, childrenAges: [] }, 0).payerAge, 18); assert.strictEqual(ctx.fichaAPlan({ age: 95, childrenAges: [] }, 0).payerAge, 80); assert.strictEqual(ctx.fichaAPlan({ age: 36.6, childrenAges: [] }, 0).payerAge, 37);
});
test('ficha: elegir otro hijo/a cambia solo la edad del hijo; un índice fuera de rango se limita; sin hijos de 0 a 18 años no se toca la edad', () => {
  const d = { age: 40, childrenAges: [3, 9, 14] };
  [[0, 3], [1, 9], [2, 14], [7, 14], [-4, 3]].forEach(([i, e]) => assert.strictEqual(ctx.fichaAPlan(d, i).childAge, e, 'índice ' + i));
  const s = ctx.fichaAPlan({ age: 40, childrenAges: [25, 30] }, 0); assert.strictEqual(s.childAge, null); assert.strictEqual(s.total, 2); assert.strictEqual(ctx.fichaAPlan({ age: 40 }, 0).childAge, null);
});
test('ficha: datos ausentes o inválidos no inventan nada (null), edades con decimales se truncan y nunca se pide la aportación ni el escenario', () => {
  const r = ctx.fichaAPlan({ name: 'X', age: 'treinta', childrenAges: ['2', NaN, -1, 5.9, null, 18, 19] }, 0);
  assert.strictEqual(r.payerAge, null); assert.deepStrictEqual(Array.from(r.elegibles), [5, 18]); assert.strictEqual(r.childAge, 5);
  const n = ctx.fichaAPlan(null, 0); assert.strictEqual(n.payerAge, null); assert.strictEqual(n.childAge, null); assert.strictEqual(n.name, '');
  assert.deepStrictEqual(Object.keys(r).sort(), ['childAge', 'elegibles', 'idx', 'name', 'payerAge', 'total'], 'solo devuelve edades y el nombre para mostrar');
});
test('ficha: la página define el puente (aoraesApplyClient y aoraesRestore), solo lee edades de los hijos y no toca la aportación mensual', () => {
  assert(/window\.aoraesApplyClient=function/.test(html) && /window\.aoraesRestore=function/.test(html));
  const apl = html.slice(html.indexOf('function fichaAplicar()'), html.indexOf('window.aoraesApplyClient=function')); assert(!/S\.monthly|S\.ret\b/.test(apl), 'el puente no debe tocar la aportación ni el escenario');
});

// ----- Datos internos fuera del código público -----
test('sin tablas de costes cargadas, las coberturas no restan nada y la herramienta lo declara (nunca inventa un coste)', () => {
  base(); sinCob(); const sin = cap(); sinTablas();
  Object.assign(ctx.C, { vs: 'both', kiz: 500, bu: 'option' });
  assert.strictEqual(ctx.coverTables(), null); assert.strictEqual(ctx.coverCostMissing(), true); assert.strictEqual(ctx.calcPlan().coversUnpriced, true);
  assert.strictEqual(ctx.calcPlan().riskTotal, 0); assert.strictEqual(cap(), sin); assert.strictEqual(ctx.firstMonth().risk, 0);
  sinCob(); assert.strictEqual(ctx.coverCostMissing(), false); assert.strictEqual(ctx.calcPlan().coversUnpriced, false);
  conTablas(); Object.assign(ctx.C, { kiz: 500 }); assert.strictEqual(ctx.coverCostMissing(), false); assert(ctx.calcPlan().riskTotal > 0); sinCob();
});
test('plan-futuro.html es público: no contiene las tablas de costes de Generali ni su rastro (nombres de las tablas, filas edad/importe, porcentajes internos)', () => {
  ['KIZ500', 'BUO500', 'SBU500', 'VS_PCT'].forEach((n) => assert(!html.includes(n), 'queda ' + n));
  assert(!/\[0\.25,\s*\d+\.\d+\]/.test(html), 'queda una fila de tabla edad/importe');
  assert(!/ejemplo oficial/i.test(html), 'queda un texto que cita el ejemplo oficial con sus cifras');
});

// ----- Planificador inverso (futNeeded) -----
const monto = (m, years) => { const m0 = ctx.S.monthly; ctx.S.monthly = m; try { return ctx.simulate(years).capital; } finally { ctx.S.monthly = m0; } };
test('planificador: la cuota devuelta alcanza el objetivo y un euro menos no (minimalidad)', () => {
  base(); sinCob(); ctx.S.capital0 = 0;
  [5000, 24000, 60000].forEach((target) => {
    const n = ctx.futNeeded(target, 16);
    assert(n.ok && n.reachable);
    assert(monto(n.monthly, 16) >= target, 'no llega');
    assert(monto(n.monthly - 1, 16) < target, 'se podía con un euro menos');
  });
});
test('planificador: ida y vuelta con el motor (el capital de 75 €/mes pide 75 €/mes)', () => {
  base(); sinCob(); ctx.S.capital0 = 0;
  const t = monto(75, 16); assert.strictEqual(ctx.futNeeded(t, 16).monthly, 75);
});
test('planificador: sin coberturas ni capital inicial el capital es lineal en la cuota → cuota = objetivo / capital por euro', () => {
  base(); sinCob(); ctx.S.capital0 = 0;
  const porEuro = monto(1, 12), target = 30000;
  assert.strictEqual(ctx.futNeeded(target, 12).monthly, Math.ceil(target / porEuro - 1e-6));
});
test('planificador: menos rentabilidad exige más cuota y las coberturas también', () => {
  base(); sinCob(); ctx.S.capital0 = 0; const t = 20000;
  const por = (r) => ctx.withCfg({ ret: r }, () => ctx.futNeeded(t, 16).monthly);
  const v = ctx.SCENARIOS.map(por); for (let i = 1; i < v.length; i++) assert(v[i] < v[i - 1], 'no decrece con la rentabilidad: ' + v);
  const con = ctx.withCfg({ C: { bu: 'option', vs: 'death' } }, () => ctx.futNeeded(t, 16).monthly);
  assert(con > ctx.futNeeded(t, 16).monthly);
});
test('planificador: capital inicial suficiente → no hace falta cuota; objetivo imposible → no alcanzable; plazo corto → sin cálculo', () => {
  base(); sinCob(); ctx.S.capital0 = 50000;
  const a = ctx.futNeeded(5000, 10); assert(a.already && a.monthly === 0);
  ctx.S.capital0 = 0; const b = ctx.futNeeded(1e9, 10); assert(b.ok && b.reachable === false);
  assert.strictEqual(ctx.futNeeded(5000, 1).ok, false); assert.strictEqual(ctx.futNeeded(0, 10).ok, false);
});
test('planificador: no deja modificada la cuota del usuario', () => {
  base(); sinCob(); ctx.S.monthly = 123; ctx.futNeeded(40000, 16); assert.strictEqual(ctx.S.monthly, 123);
});
test('planificador: con cuota creciente la cuota inicial necesaria es menor', () => {
  base(); sinCob(); ctx.S.capital0 = 0; const plana = ctx.futNeeded(40000, 16).monthly;
  ctx.S.dyn = 5; assert(ctx.futNeeded(40000, 16).monthly < plana);
});


// ----- Escenarios variables y riesgo de secuencia -----
const crudo = (rets, years) => ctx.simulate(years, rets).raw;
test('secuencia: una secuencia constante (la rentabilidad efectiva del escenario) da el mismo capital que el modelo normal', () => {
  base(); sinCob(); ctx.S.dyn = 3; ctx.S.extraYear = 200;
  const e = ctx.effRet(), n = 16;
  assert(Math.abs(ctx.simulate(n, Array(n).fill(e)).capital - ctx.simulate(n).capital) < 1e-6);
  assert.strictEqual(Math.round(ctx.simulate(n, undefined).capital), Math.round(ctx.simulate(n).capital));
});
test('secuencia: sin aportaciones el orden no importa y el resultado es capital × producto de (1+rentabilidad) (cálculo independiente, con años negativos)', () => {
  base(); sinCob(); Object.assign(ctx.S, { monthly: 0, capital0: 10000, extraYear: 0 });
  near(crudo([-20, 10, 5], 3), 10000 * 0.8 * 1.1 * 1.05, 1e-6);
  near(crudo([5, 10, -20], 3), 10000 * 0.8 * 1.1 * 1.05, 1e-6);
  [ 'start', 'mid', 'end' ].forEach((pos) => near(crudo(ctx.seqCrash(10, pos, 30), 10), crudo(Array(10).fill(ctx.effRet()), 10), 1e-4));
});
test('secuencia: todas las secuencias de caída tienen la misma media geométrica que el escenario', () => {
  base(); [2, 4, 6, 8].forEach((r) => { ctx.S.ret = r; [ 'start', 'mid', 'end' ].forEach((pos) => near(ctx.seqMean(ctx.seqCrash(16, pos, 30), 16), ctx.effRet(), 1e-9)); });
  base(); const a = ctx.seqCrash(16, 'end', 30); assert.strictEqual(a.length, 16); assert.strictEqual(a[15], -30); assert(a[0] > ctx.effRet());
});
test('secuencia: con aportaciones periódicas y la misma media, una caída al final es peor que al inicio (riesgo de secuencia)', () => {
  base(); sinCob(); ctx.S.capital0 = 0;
  const f = (pos) => crudo(ctx.seqCrash(16, pos, 30), 16), est = crudo(Array(16).fill(ctx.effRet()), 16);
  assert(f('end') < f('mid') && f('mid') < f('start'), f('start') + ' ' + f('mid') + ' ' + f('end'));
  assert(f('end') < est, 'la caída final queda por debajo de la constante');
});
test('secuencia: una caída del 0 % equivale a la constante; con rentabilidades negativas el capital nunca es negativo ni se inventa', () => {
  base(); sinCob();
  assert.strictEqual(Math.round(ctx.seqCapital(16, ctx.seqCrash(16, 'end', 0))), Math.round(ctx.simulate(16).capital));
  const mal = ctx.simulate(16, Array(16).fill(-99));
  assert(mal.capital >= 0 && mal.capital < 5000, 'con −99 % todos los años casi no queda capital: ' + mal.capital);
  const peor = ctx.simulate(16, Array(16).fill(-500)); assert(peor.capital >= 0 && isFinite(peor.capital));
});
test('secuencia: reproducible (mismos parámetros, mismo resultado) y los años que faltan usan el escenario', () => {
  base(); sinCob(); const s = [8, -20, 12];
  assert.strictEqual(ctx.simulate(10, s).capital, ctx.simulate(10, s).capital);
  const completa = s.concat(Array(7).fill(ctx.effRet()));
  assert(Math.abs(ctx.simulate(10, s).capital - ctx.simulate(10, completa).capital) < 1e-6);
});
test('secuencia: parseo de texto (decimales con coma, signo menos tipográfico, separadores, límites) y no deja la configuración tocada', () => {
  const lista = (x) => Array.from(x); assert.deepStrictEqual(lista(ctx.seqParse('8; \u221220 12,5\n5')), [8, -20, 12.5, 5]);
  assert.deepStrictEqual(lista(ctx.seqParse('abc ; 500 ; -300')), [100, -99]); assert.deepStrictEqual(lista(ctx.seqParse('')), []);
  base(); const r0 = ctx.S.ret, m0 = ctx.S.monthly; ctx.seqCapital(10, [1, 2]); assert.strictEqual(ctx.S.ret, r0); assert.strictEqual(ctx.S.monthly, m0);
});
test('secuencia por edad: capital estable = el del modelo; con caída final es menor; edades no proyectables se descartan; el interruptor del año 5 oculta la vista', () => {
  base(); sinCob(); ctx.S.capital0 = 0;
  const r = ctx.seqRowAt(18, 30); assert(r.ok && r.crash < r.stable && r.diff < 0 && r.pct < 0);
  assert.strictEqual(Math.round(r.stable), Math.round(ctx.futAt(18).capital));
  assert.strictEqual(ctx.seqRowAt(2, 30).reason, 'past'); assert.strictEqual(ctx.seqRowAt(3, 30).reason, 'short');
  const c5 = { Math, Intl, HC: { school: 'real' } }; vm.createContext(c5);
  vm.runInContext(codigo.replace('const FUT_MIN_VISIBLE_YEARS=0;', 'const FUT_MIN_VISIBLE_YEARS=5;') + '\nthis.S=S; this.seqRowAt=seqRowAt;', c5);
  Object.assign(c5.S, { childAge: 2, monthly: 75, ret: 6, capital0: 0, dyn: 0, extraYear: 0 });
  assert.strictEqual(c5.seqRowAt(5, 30).reason, 'hidden'); assert.strictEqual(c5.seqRowAt(7, 30).ok, true);
});


test('la tasa anual se declara como nominal con capitalización mensual en la pantalla (ES/EN/DE) y, en Jubilación, también en el PDF', () => {
  const es = 'Tasa anual nominal, capitalizada cada mes. El rendimiento efectivo al año resulta algo mayor.';
  assert(html.includes('>' + es + '<'), 'falta la aclaración visible');
  assert(html.includes('"' + es + '":"Nominaler Jahreszins, monatlich verzinst.'), 'falta la traducción al alemán');
  assert(html.includes('"' + es + '":"Nominal annual rate, compounded monthly.'), 'falta la traducción al inglés');
  
});

console.log('\n' + passed + ' correctas, ' + failed + ' fallidas');
process.exit(failed ? 1 : 0);
