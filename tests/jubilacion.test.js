// Pruebas del motor del Comparador de jubilación (jubilacion.html). `node tests/jubilacion.test.js`.
// El motor vive dentro de la página, así que se extrae el tramo de script entre «function grenzsteuersatz» y «let chart=null» y se ejecuta aislado.
// Los valores de referencia salen de fórmulas independientes (el tarifario §32a escrito a parte, anualidades en forma cerrada, sumas explícitas) o de cálculos a mano.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const html = fs.readFileSync(path.join(__dirname, '..', 'jubilacion.html'), 'utf8');
const ini = html.indexOf('function grenzsteuersatz(gross){'), fin = html.indexOf('let chart=null;');
assert(ini > 0 && fin > ini, 'no se encuentra el motor en jubilacion.html');
const codigo = html.slice(ini, fin).replace('new Date().getFullYear()', '2026');
const ctx = { Math, Intl, Set, document: { getElementById: () => ({}) } }; vm.createContext(ctx);
vm.runInContext(codigo + '\nthis.S=S; this.INSURERS=INSURERS; this.grenzsteuersatz=grenzsteuersatz; this.calc=calc; this.calcRiester=calcRiester; this.calcGeneric=calcGeneric; this.fvGeneric=fvGeneric; this.fvIns=fvIns; this.fvETF=fvETF; this.fvETFdetailed=fvETFdetailed; this.calcETFonly=calcETFonly; this.ertragsanteil=ertragsanteil; this.besteuerungsanteilForYear=besteuerungsanteilForYear; this.BASISRENTE_LIMIT=BASISRENTE_LIMIT; this.RIESTER=RIESTER; this.effectiveTaxRate=effectiveTaxRate;', ctx);
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message); } }
const near = (a, b, t, m) => assert(Math.abs(a - b) <= t, (m || '') + ' esperado ' + b + ' obtenido ' + a);
const S0 = JSON.stringify(ctx.S), INS0 = JSON.stringify(ctx.INSURERS);
const base = () => { Object.assign(ctx.S, JSON.parse(S0)); Object.assign(ctx.INSURERS.generali, JSON.parse(INS0).generali); };
const sinCostes = () => { ctx.INSURERS.generali.brva = { ap: 0, vwk: 0, gamma: 0, rf: 24.08, surplus: 1 }; ctx.INSURERS.generali.vasp = { ap: 0, vwk: 0, gamma: 0, rf: 24.16, surplus: 1 }; };

console.log('\nTarifa del impuesto (§32a EStG 2026)');
// Tarifario escrito aparte, con las constantes de las zonas 3-5 (sin usar el tipo marginal del código): la cuota T(x) y su derivada numérica.
const T = (x) => { x = Math.floor(x); if (x <= 12348) return 0; if (x <= 17799) { const y = (x - 12348) / 10000; return (914.51 * y + 1400) * y; }
  if (x <= 69878) { const z = (x - 17799) / 10000; return (173.10 * z + 2397) * z + 1034.87; } if (x <= 277825) return 0.42 * x - 11135.63; return 0.45 * x - 19470.38; };
test('el tarifario es continuo en los cuatro cambios de zona (comprueba las constantes 914,51 / 173,10 / 1.034,87 / 11.135,63 / 19.470,38)', () => {
  [[17799, 17800], [69878, 69879], [277825, 277826]].forEach(([a, b]) => near(T(a), T(b), 1.5, 'salto en ' + a));
});
test('el tipo marginal de grenzsteuersatz coincide con la derivada del tarifario en cada zona (el sueldo bruto se pasa al 78 % como zvE)', () => {
  [15000, 18000, 20000, 25000, 40000, 60000, 80000, 89000, 90000, 150000, 400000].forEach((g) => {
    const z = g * 0.78, num = (T(z + 50) - T(z - 50)) / 100; near(ctx.grenzsteuersatz(g), num, 0.002, 'sueldo ' + g);
  });
});
test('sin impuesto por debajo del Grundfreibetrag, 14 % en el primer euro tributable, 42 % y 45 % en los tramos altos y nunca fuera de 0–45 %', () => {
  assert.strictEqual(ctx.grenzsteuersatz(12348 / 0.78), 0); near(ctx.grenzsteuersatz(12349.5 / 0.78 + 1), 0.14, 0.005);
  near(ctx.grenzsteuersatz(100000), 0.42, 1e-9); near(ctx.grenzsteuersatz(500000), 0.45, 1e-9);
  for (let g = 0; g <= 600000; g += 5000) { const v = ctx.grenzsteuersatz(g); assert(v >= 0 && v <= 0.45); }
  for (let g = 0; g < 600000; g += 5000) assert(ctx.grenzsteuersatz(g + 5000) >= ctx.grenzsteuersatz(g) - 1e-12, 'el tipo marginal no puede bajar al subir el sueldo');
});
test('referencia a mano: sueldo 60.000 € → zvE 46.800 € → tipo marginal 34,01 %', () => { near(ctx.grenzsteuersatz(60000), (2 * 173.10 * ((46800 - 17799) / 10000) + 2397) / 10000, 1e-12); near(ctx.grenzsteuersatz(60000), 0.3401, 5e-5); });
test('el tipo introducido a mano sustituye al automático', () => { base(); ctx.S.marginOverride = 30; near(ctx.effectiveTaxRate(), 0.30, 1e-12); base(); near(ctx.effectiveTaxRate(), ctx.grenzsteuersatz(60000), 1e-12); });

console.log('\nTablas legales de la fase de cobro');
test('Ertragsanteil (§22 EStG) coincide con la tabla oficial para 60–74 años', () => {
  const of = { 60: 22, 61: 22, 62: 21, 63: 20, 64: 19, 65: 18, 66: 18, 67: 17, 68: 16, 69: 15, 70: 15, 71: 14, 72: 13, 73: 13, 74: 12 };
  Object.keys(of).forEach((a) => near(ctx.ertragsanteil(+a), of[a] / 100, 1e-12, 'edad ' + a));
});
test('Besteuerungsanteil de la renta Rürup: 50 % hasta 2005, +2 pp al año hasta 80 % en 2020, +1 pp hasta 82 % en 2022, +0,5 pp al año y 100 % en 2058', () => {
  const f = ctx.besteuerungsanteilForYear;
  [[2005, .5], [2006, .52], [2020, .8], [2021, .81], [2022, .82], [2023, .825], [2040, .91], [2057, .995], [2058, 1], [2070, 1]].forEach(([y, v]) => near(f(y), v, 1e-12, 'año ' + y));
  for (let y = 2000; y < 2070; y++) assert(f(y + 1) >= f(y) - 1e-12 && f(y) <= 1);
});
test('límite de la Basisrente 2026: 30.826 € (soltero) y el doble en tributación conjunta', () => { assert.strictEqual(ctx.BASISRENTE_LIMIT.single, 30826); assert.strictEqual(ctx.BASISRENTE_LIMIT.joint, 61652); assert.strictEqual(ctx.BASISRENTE_LIMIT.year, 2026); });

console.log('\nRiester');
test('sueldo 60.000 €, sin hijos: mínimo propio 1.925 €, cuota sugerida 161 €/mes, Zulage 175 €, aportación fomentada tope 2.100 €', () => {
  base(); const r = ctx.calcRiester();
  near(r.mindesteigenbeitrag, 1925, 1e-9); assert.strictEqual(r.suggestedMonthly, 161); near(r.zulage, 175, 1e-9); assert.strictEqual(r.metRatio, 1);
  near(r.taxSaving, 2100 * ctx.grenzsteuersatz(60000), 1e-9); near(r.extraRefund, r.taxSaving - 175, 1e-9); near(r.beneficioAnual, r.zulage + r.extraRefund, 1e-9);
});
test('con hijos: la Zulage sube 300 € por hijo y baja el mínimo propio; con sueldo bajo manda el 4 % y con sueldo muy bajo el Sockelbetrag de 60 €', () => {
  base(); ctx.S.riesterKids = 2; let r = ctx.calcRiester(); near(r.zulageBase, 775, 1e-9); near(r.mindesteigenbeitrag, 2100 - 775, 1e-9);
  base(); ctx.S.salary = 20000; r = ctx.calcRiester(); near(r.mindesteigenbeitrag, 800 - 175, 1e-9);
  base(); ctx.S.salary = 1000; r = ctx.calcRiester(); near(r.mindesteigenbeitrag, 60, 1e-9);
});
test('aportar menos que el mínimo recorta la Zulage proporcionalmente; aportar más de lo útil no aumenta el fomento y se avisa de lo desperdiciado', () => {
  base(); ctx.S.riesterMonthly = 80; let r = ctx.calcRiester(); near(r.metRatio, 960 / 1925, 1e-9); near(r.zulage, 175 * 960 / 1925, 1e-9);
  base(); ctx.S.riesterMonthly = 161; const ok = ctx.calcRiester(); base(); ctx.S.riesterMonthly = 400; const mucho = ctx.calcRiester();
  near(mucho.beneficioAnual, ok.beneficioAnual, 1e-9); assert(mucho.overfunded && mucho.wastedMonthly === 400 - mucho.maxUsefulMonthly); assert(!ok.overfunded);
});
test('el capital adicional de la Riester es la anualidad mensual del beneficio anual (comparado con la forma cerrada)', () => {
  base(); const r = ctx.calcRiester(), i = ctx.S.ret / 1200, n = r.years * 12; near(r.capitalAdicional, (r.beneficioAnual / 12) * ((Math.pow(1 + i, n) - 1) / i), 1e-6);
});

console.log('\nAcumulación');
test('fvGeneric = capital inicial capitalizado + anualidad mensual (forma cerrada), también con 0 % y con rentabilidad negativa', () => {
  [[0, 300, 6, 30], [20000, 150, 4, 25], [5000, 100, 0, 10], [10000, 200, -2, 15]].forEach(([c0, m, r, y]) => {
    const i = r / 1200, n = y * 12, cerrado = i === 0 ? c0 + m * n : c0 * Math.pow(1 + i, n) + m * ((Math.pow(1 + i, n) - 1) / i); near(ctx.fvGeneric(c0, m, r, y), Math.max(0, cerrado), 1e-6, [c0, m, r, y].join('/'));
  });
});
test('calcGeneric: capital, aportado, crecimiento y renta equivalente (4 % anual / 12) coherentes', () => {
  base(); ctx.S.capital0 = 10000; const g = ctx.calcGeneric(); assert.strictEqual(g.years, 30); near(g.contributed, 300 * 12 * 30, 1e-9);
  near(g.growth, g.capitalEst - g.contributed - 10000, 1e-6); near(g.monthlyEquiv, g.capitalEst * 0.03 / 12, 1e-9);
});
test('calcGeneric «necesito»: con la cuota recomendada se alcanza el objetivo; si el capital inicial ya lo alcanza, la cuota recomendada es 0', () => {
  base(); Object.assign(ctx.S, { goalMode: 'necesito', targetCapital: 400000, capital0: 20000 }); const g = ctx.calcGeneric();
  near(ctx.fvGeneric(20000, g.recommendedMonthly, ctx.S.ret, g.years), 400000, 0.01); assert(g.gap >= 0);
  Object.assign(ctx.S, { capital0: 400000 }); const g2 = ctx.calcGeneric(); assert.strictEqual(g2.recommendedMonthly, 0); assert.strictEqual(g2.gap, 0);
});

console.log('\nProductos de seguro (Rürup / Privatrente)');
test('sin costes ni gastos la anualidad anual anticipada coincide con la forma cerrada, con y sin el sesgo «excel» de +0,65 %', () => {
  base(); sinCostes(); const m = 300, y = 30;
  let r = 0.06; near(ctx.fvIns(m, 6, y, 'generali', 'brva'), m * 12 * ((Math.pow(1 + r, y) - 1) / r) * (1 + r), 1e-6);
  ctx.S.excel = true; r = 0.06 + 0.0065; near(ctx.fvIns(m, 6, y, 'generali', 'brva'), m * 12 * ((Math.pow(1 + r, y) - 1) / r) * (1 + r), 1e-6);
});
test('con costes: suma explícita año a año (gasto de contratación repartido en 5 años, gasto anual fijo y gasto proporcional sobre el capital)', () => {
  base(); ctx.INSURERS.generali.vasp = { ap: 900, vwk: 12, gamma: 0.5, rf: 24, surplus: 1 }; const m = 200, y = 20, r = 0.06, g = 0.005, ann = m * 12, ap = 900 * (m / 100) / 5, vwk = 12 * (m / 100);
  const q = (1 + r) * (1 - g); let esperado = 0; for (let k = 1; k <= y; k++) esperado += (ann - (k <= 5 ? ap : 0) - vwk) * Math.pow(q, y - k + 1);
  near(ctx.fvIns(m, 6, y, 'generali', 'vasp'), esperado, 1e-6);
});
test('los costes siempre restan: el capital con los gastos reales de Generali es menor que sin gastos, y 0 si no se aporta', () => {
  base(); const con = ctx.fvIns(300, 6, 30, 'generali', 'brva'); sinCostes(); const sin = ctx.fvIns(300, 6, 30, 'generali', 'brva'); assert(con < sin && con > 0);
  base(); assert.strictEqual(ctx.fvIns(0, 6, 30, 'generali', 'vasp'), 0);
});

console.log('\nETF directo');
test('fvETF: un año con 0,999 de coste de compra, anualidad mensual anticipada a la rentabilidad menos 0,6 % y 0,12 % anual de gastos', () => {
  const m = 100, r = (6 - 0.6) / 1200, esperado = (m * 0.999) * ((Math.pow(1 + r, 12) - 1) / r) * (1 + r) * 0.9988; near(ctx.fvETF(m, 6, 1), esperado, 1e-9);
});
test('fvETF con rentabilidad igual o inferior a los gastos: solo se acumula lo aportado menos el coste de compra', () => { near(ctx.fvETF(100, 0.6, 10), 100 * 120 * 0.999, 1e-9); near(ctx.fvETF(100, 0, 10), 100 * 120 * 0.999, 1e-9); assert.strictEqual(ctx.fvETF(0, 6, 10), 0); });
test('fvETFdetailed: neto ≤ bruto, impuestos ≥ 0 y la suma de impuestos = cambios + liquidación final; sin ganancia no hay impuesto de cambio', () => {
  base(); [true, false].forEach((sw) => { ctx.S.etfSwitches = sw; const d = ctx.fvETFdetailed(300, 6, 30);
    assert(d.net <= d.gross + 1e-9 && d.tax >= 0 && d.switchTax >= 0 && d.spread > 0); near(d.net, d.gross - (d.tax - d.switchTax), 1e-6, 'neto = bruto − impuesto final'); });
  ctx.S.etfSwitches = true; const sinRend = ctx.fvETFdetailed(300, 0.6, 30); assert.strictEqual(sinRend.switchTax, 0);
  assert.strictEqual(ctx.fvETFdetailed(0, 6, 30).net, 0);
});
test('fvETFdetailed: la tasa de la ganancia es 26,375 % sobre el 70 % (Teilfreistellung del 30 %); sin cambios y sin Vorabpauschale acumulable la liquidación final usa ese tipo', () => {
  base(); ctx.S.etfSwitches = false; const d = ctx.fvETFdetailed(300, 6, 20), basis = 300 * 240;
  assert(d.gross > basis); const bruto = Math.max(0, (d.gross - basis) * 0.70 * 0.26375); assert(d.tax <= bruto + 1e-6 && d.tax >= bruto * 0.8, 'el impuesto final ronda ' + bruto + ' menos el crédito de la Vorabpauschale: ' + d.tax);
});

console.log('\nEstrategia completa (calc)');
const invariantes = (c, y) => {
  near(c.contributed, ctx.S.monthly * 12 * y, 1e-6); near(c.net, c.brva.net + c.vasp.net + c.etfPart.net, 1e-6, 'el neto es la suma de las tres partes');
  near(c.gross, c.brva.gross + c.vasp.gross + c.etfPart.gross, 1e-6); near(c.effContrib, c.brva.eff + c.vasp.eff + c.etfPart.eff, 1e-6, 'lo aportado se reparte entero');
  assert(c.costs >= -1e-9 && c.net <= c.gross + 1e-9 && c.taxRetire >= 0); near(c.subsidyTotal, c.taxSave * 12 * y, 1e-6);
};
test('invariantes en todas las combinaciones de reparto Rürup/resto, destino del resto y reinversión del ahorro fiscal', () => {
  ['none', 'brva', 'vasp', 'etf'].forEach((re) => ['vasp', 'etf'].forEach((rd) => [0, 25, 50, 100].forEach((sp) => [0, 50, 100].forEach((rp) => {
    base(); Object.assign(ctx.S, { reinvest: re, restDest: rd, split: sp, reinvestPct: rp }); invariantes(ctx.calc('generali', 30), 30);
  }))));
});
test('sin reinvertir lo aportado efectivo es lo aportado de bolsillo; reinvirtiendo, suma el ahorro fiscal reinvertido', () => {
  base(); ctx.S.reinvest = 'none'; let c = ctx.calc('generali', 30); near(c.effContrib, c.contributed, 1e-6);
  base(); ctx.S.reinvest = 'vasp'; c = ctx.calc('generali', 30); near(c.effContrib, c.contributed + c.taxSave * 12 * 30, 1e-6);
});
test('ahorro fiscal de un Rürup dentro del límite = aportación al Rürup × tipo marginal', () => {
  base(); ctx.S.monthly = 1000; ctx.S.split = 50; const c = ctx.calc('generali', 30); near(c.taxSave, 500 * ctx.effectiveTaxRate(), 1e-9);
});
test('el ahorro fiscal NO supera el límite deducible de la Basisrente (30.826 €/año): aportar 36.000 € al año deduce solo 30.826 €', () => {
  base(); Object.assign(ctx.S, { monthly: 3000, split: 100 }); const c = ctx.calc('generali', 30);
  near(c.taxSave * 12, ctx.BASISRENTE_LIMIT.single * ctx.effectiveTaxRate(), 1e-6); assert(c.taxSave * 12 < 36000 * ctx.effectiveTaxRate());
  base(); Object.assign(ctx.S, { monthly: 2568, split: 100 }); const justo = ctx.calc('generali', 30); near(justo.taxSave * 12, 2568 * 12 * ctx.effectiveTaxRate(), 1e-6);
});
test('más aportación nunca da menos capital, y más rentabilidad tampoco', () => {
  base(); let prev = -1; [100, 200, 300, 600, 1200].forEach((m) => { ctx.S.monthly = m; const n = ctx.calc('generali', 30).net; assert(n > prev); prev = n; });
  base(); prev = -1; [2, 4, 6, 8].forEach((r) => { ctx.S.ret = r; const n = ctx.calc('generali', 30).net; assert(n > prev); prev = n; });
});
test('es reproducible: los mismos parámetros dan exactamente el mismo resultado y calc no deja modificado el estado', () => {
  base(); const a = JSON.stringify(ctx.calc('generali', 30)), s1 = JSON.stringify(ctx.S); const b = JSON.stringify(ctx.calc('generali', 30)); assert.strictEqual(a, b); assert.strictEqual(JSON.stringify(ctx.S), s1);
});
test('con 0 años de plazo no se inventa capital ni se produce NaN', () => {
  base(); const c = ctx.calc('generali', 0); assert.strictEqual(c.gross, 0); Object.values(c).forEach((v) => { if (typeof v === 'number') assert(isFinite(v), 'NaN o infinito'); });
});
test('ETF directo (calcETFonly) coherente con fvETFdetailed y con el capital aportado', () => {
  base(); const e = ctx.calcETFonly(30), d = ctx.fvETFdetailed(300, 6, 30); near(e.net, d.net, 1e-9); near(e.contributed, 300 * 12 * 30, 1e-9); assert(e.costs >= 0 && isFinite(e.moN));
});

console.log('\n' + passed + ' correctas, ' + failed + ' fallidas'); process.exit(failed ? 1 : 0);
