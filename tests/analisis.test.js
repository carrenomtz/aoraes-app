// Pruebas de cálculos de analisis.html (pensión pública, Besteuerungsanteil, edad de jubilación, Zugangsfaktor, Riester) y de vsp.html (precio con bonos y recargos).
// Los cálculos viven dentro de las páginas: se extraen tramos de script y se ejecutan aislados, con referencias independientes (anualidades en forma cerrada,
// la tarifa del impuesto escrita aparte, calendarios legales a mano). `node tests/analisis.test.js`.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const leer = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const tramo = (h, desde, hasta) => { const a = h.indexOf(desde), b = h.indexOf(hasta, a); assert(a > 0 && b > a, 'no se encuentra el tramo «' + desde.slice(0, 40) + '…»'); return h.slice(a, b); };
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message); } }
const near = (a, b, t, m) => assert(Math.abs(a - b) <= t, (m || '') + ' esperado ' + b + ' obtenido ' + a);
const IMP = require('../impuesto.js');
const T = (x) => { x = Math.floor(x); if (x <= 12348) return 0; if (x <= 17799) { const y = (x - 12348) / 10000; return (914.51 * y + 1400) * y; }
  if (x <= 69878) { const z = (x - 17799) / 10000; return (173.10 * z + 2397) * z + 1034.87; } if (x <= 277825) return 0.42 * x - 11135.63; return 0.45 * x - 19470.38; };
const Tley = (x) => Math.floor(T(x));

// ---------- Análisis: pensión pública y ayudas ----------
const A = leer('analisis.html');
const ctxA = { Math, Date, Number, String, parseFloat, parseInt, Object, Array, AORAES_IMPUESTO: IMP }; vm.createContext(ctxA);
vm.runInContext('var einkommensteuer2026=function(z){return AORAES_IMPUESTO.cuota(z);};\n' + tramo(A, 'function fvAnnuity(pmt,r,n)', '/* ---------- field config ---------- */')
  + '\nthis.fvAnnuity=fvAnnuity; this.pmtToFV=pmtToFV; this.GV=AORAES_GERMANY_VALUES; this.bst=besteuerungsanteilForYear; this.netPension=netStatePensionAnnual; this.regAge=getRegularRetirementAge; this.regDate=regularRetirementDate; this.acceso=computeAccessFactor; this.monthsBetween=monthsBetween;', ctxA);

console.log('\nAnálisis · finanzas básicas y pensión pública');
test('fvAnnuity = valor futuro de una anualidad (forma cerrada), con tasa 0, y pmtToFV es su inversa', () => {
  const r = 0.005, n = 360; near(ctxA.fvAnnuity(300, r, n), 300 * (Math.pow(1 + r, n) - 1) / r, 1e-6); near(ctxA.fvAnnuity(300, 0, 12), 3600, 1e-9);
  [[100000, 0.004, 240], [50000, 0, 120], [250000, 0.006, 360]].forEach(([fv, rr, nn]) => near(ctxA.fvAnnuity(ctxA.pmtToFV(fv, rr, nn), rr, nn), fv, 1e-6));
  assert.strictEqual(ctxA.fvAnnuity(300, 0.005, 0), 0); assert.strictEqual(ctxA.pmtToFV(1000, 0.005, 0), 0);
});
test('Besteuerungsanteil: 50 % hasta 2005, +2 pp al año hasta 80 % en 2020, +1 pp hasta 82 % en 2022, +0,5 pp al año y 100 % en 2058 (igual que Jubilación)', () => {
  [[2005, .5], [2006, .52], [2020, .8], [2021, .81], [2022, .82], [2023, .825], [2040, .91], [2057, .995], [2058, 1], [2070, 1]].forEach(([y, v]) => near(ctxA.bst(y), v, 1e-12, 'año ' + y));
  for (let y = 2000; y < 2070; y++) assert(ctxA.bst(y + 1) >= ctxA.bst(y) - 1e-12 && ctxA.bst(y) <= 1);
});
test('valores legales de referencia 2026: límites de la Basisrente, Beitragsbemessungsgrenze y Rentenwert (revisar cada año)', () => {
  const g = ctxA.GV; assert.strictEqual(g.referenceYear, 2026); assert.strictEqual(g.basisPensionLimitSingle, 30826); assert.strictEqual(g.basisPensionLimitJoint, 61652);
  assert.strictEqual(g.generalPensionContributionCeiling, 101400); assert.strictEqual(g.currentPensionValue, 42.52); assert.strictEqual(g.oldAgePensionTypeFactor, 1);
});
test('pensión pública neta: bruto − impuesto sobre (Besteuerungsanteil × bruto − 102 €) − 11,9 % de seguro médico y de cuidados; cálculo a mano con la tarifa independiente', () => {
  const bruto = 24000, anio = 2046, ba = 0.82 + 0.005 * (anio - 2022), zve = bruto * ba - 102;
  near(ctxA.netPension(bruto, anio), bruto - Tley(zve) - bruto * 0.119, 1e-9);
  assert.strictEqual(ctxA.netPension(0, 2046), 0); assert.strictEqual(ctxA.netPension(-100, 2046), 0); assert.strictEqual(ctxA.netPension(NaN, 2046), 0);
});
test('la pensión neta nunca supera la bruta, crece con la bruta y baja al aumentar el Besteuerungsanteil (jubilarse más tarde tributa más)', () => {
  let prev = 0; [6000, 12000, 24000, 48000, 90000].forEach((b) => { const n = ctxA.netPension(b, 2046); assert(n <= b && n > prev); prev = n; });
  assert(ctxA.netPension(24000, 2060) < ctxA.netPension(24000, 2030));
});

console.log('\nAnálisis · edad de jubilación y Zugangsfaktor');
test('Regelaltersgrenze (§235 SGB VI): 65 años hasta 1946, +1 mes por año de 1947 a 1958 (66 años en 1958), +2 meses por año de 1959 a 1963, 67 desde 1964', () => {
  const edad = (y) => { const r = ctxA.regAge(new Date(y, 5, 15)); return r.years * 12 + r.months; };
  assert.strictEqual(edad(1946), 65 * 12);
  for (let y = 1947; y <= 1958; y++) assert.strictEqual(edad(y), 65 * 12 + (y - 1946), 'nacido en ' + y);
  [[1959, 14], [1960, 16], [1961, 18], [1962, 20], [1963, 22]].forEach(([y, m]) => assert.strictEqual(edad(y), 66 * 12 + (m - 12), 'nacido en ' + y));
  assert.strictEqual(edad(1964), 67 * 12); assert.strictEqual(edad(1990), 67 * 12);
});
test('la fecha de jubilación ordinaria es el cumpleaños + la edad ordinaria; nacido en 1990 el 15-06 → 15-06-2057', () => {
  const d = ctxA.regDate(new Date(1990, 5, 15)); assert.strictEqual(d.getFullYear(), 2057); assert.strictEqual(d.getMonth(), 5); assert.strictEqual(d.getDate(), 15);
});
test('Zugangsfaktor (§77 SGB VI): 1 en la fecha ordinaria; −0,3 % por mes de adelanto con tope de 14,4 % (48 meses); +0,5 % por mes de retraso', () => {
  const reg = new Date(2057, 5, 15), mas = (m) => new Date(2057, 5 + m, 15);
  near(ctxA.acceso(reg, reg), 1, 1e-12); near(ctxA.acceso(mas(-12), reg), 1 - 0.036, 1e-12); near(ctxA.acceso(mas(-48), reg), 1 - 0.144, 1e-12); near(ctxA.acceso(mas(-60), reg), 1 - 0.144, 1e-12, 'tope');
  near(ctxA.acceso(mas(12), reg), 1.06, 1e-12); near(ctxA.acceso(mas(1), reg), 1.005, 1e-12);
});

// ---------- Análisis: Riester ----------
const cfg = { campos: {}, hijos: [] };
const ctxR = { Math, parseFloat, parseInt, String, Object, Array, AORAES_IMPUESTO: IMP,
  document: { querySelector: (sel) => { const m = /data-(gross|pers|sit)="([^"]+)"/.exec(sel); if (!m) return null; const v = cfg.campos[m[1] + ':' + m[2]]; return v === undefined ? null : (typeof v === 'boolean' ? { checked: v } : { value: String(v) }); } },
  getChildrenData: () => cfg.hijos };
vm.createContext(ctxR);
vm.runInContext('function grossFieldRawTop(key){ var el=document.querySelector(\'[data-gross="\'+key+\'"]\'); return (el && String(el.value).trim()!==\'\') ? parseFloat(el.value) : null; }\n'
  + tramo(A, 'var RIESTER_GRUNDZULAGE=175', '  function recalcS5(){') + '\nthis.zulageMes=riesterZulageMonthly; this.ahorroRiester=riesterTaxSaving; this.K={G:RIESTER_GRUNDZULAGE,KN:RIESTER_KINDERZULAGE_NEW,KO:RIESTER_KINDERZULAGE_OLD,S:RIESTER_SOCKELBETRAG,H:RIESTER_HOECHSTBETRAG};', ctxR);
const reset = () => { cfg.campos = {}; cfg.hijos = []; };

console.log('\nAnálisis · Riester (Zulage y ahorro fiscal)');
test('importes legales: Grundzulage 175 €, Kinderzulage 300 € (nacidos desde 2008) y 185 € (antes), Sockelbetrag 60 €, Höchstbetrag 2.100 €', () => {
  const k = ctxR.K; assert.deepStrictEqual([k.G, k.KN, k.KO, k.S, k.H], [175, 300, 185, 60, 2100]);
});
test('el guion oficial: 30.000 € brutos → mínimo propio de 1.025 €/año; aportando eso se cobra la Zulage completa (175 €) y la ventaja fiscal con y sin deducción', () => {
  reset(); cfg.campos['gross:salarioBruto_A'] = 2500; cfg.campos['gross:numPagas_A'] = 12;
  const minimo = 1025, anual = minimo, mensual = ctxR.zulageMes('A', anual), zve = 30000 * 0.78, ded = Math.min(2100, anual + 175);
  const saving = Tley(zve) - Tley(zve - ded); near(mensual * 12, 175 + Math.max(0, saving - 175), 1e-9);
  near(ctxR.zulageMes('A', 0), 175 * 0 / 12 + 0, 1e-9, 'sin aportación no hay Zulage'); assert(ctxR.zulageMes('A', minimo / 2) < mensual, 'aportar menos que el mínimo recorta el fomento');
});
test('sin sueldo o con titular «Ambos»/desconocido no se inventa fomento; con hijos la Zulage suma 300 € (2008 en adelante) o 185 € (antes)', () => {
  reset(); assert.strictEqual(ctxR.zulageMes('Ambos', 1200), 0); assert.strictEqual(ctxR.zulageMes('C', 1200), 0);
  reset(); cfg.campos['gross:salarioBruto_A'] = 2500; const sin = ctxR.zulageMes('A', 1200);
  cfg.hijos = [{ fechaNacimiento: '2015-03-01' }, { fechaNacimiento: '2004-01-01' }]; assert(ctxR.zulageMes('A', 2200) > sin, 'con hijos hay más fomento');
});
test('el ahorro fiscal del Riester es la cuota con y sin la deducción (no tipo marginal × aportación); con Kirchensteuer, +9 %; casados: splitting sobre el zvE conjunto', () => {
  reset(); cfg.campos['gross:salarioBruto_A'] = 5000; cfg.campos['gross:numPagas_A'] = 12;
  const zve = 60000 * 0.78; near(ctxR.ahorroRiester('A', 2100), Tley(zve) - Tley(zve - 2100), 1e-9);
  assert(ctxR.ahorroRiester('A', 2100) < 2100 * IMP.tipoMarginal(zve) + 1, 'nunca más que deducción × tipo marginal');
  cfg.campos['sit:tieneKirchensteuer'] = true; near(ctxR.ahorroRiester('A', 2100), (Tley(zve) - Tley(zve - 2100)) * 1.09, 1e-9); cfg.campos['sit:tieneKirchensteuer'] = false;
  cfg.campos['pers:estadoCivil_A'] = 'Casado/a'; cfg.campos['gross:salarioBruto_B'] = 3000; cfg.campos['gross:numPagas_B'] = 12;
  const zc = (60000 + 36000) * 0.78; near(ctxR.ahorroRiester('A', 2100), 2 * Tley(zc / 2) - 2 * Tley((zc - 2100) / 2), 1e-9);
});

// ---------- Análisis: lo que entrega la ficha al panel (aoraesGetClient) ----------
const hijos = { fechas: [] }, campos = { '#m_cliente': 'Ana López', '#m_fecha_nac': '1988-12-01' };
const HOY = new Date(2026, 10, 8), DateFija = class extends Date { constructor(...a) { if (a.length) super(...a); else super(HOY.getTime()); } };
const ctxG = { Math, Number, String, parseFloat, isNaN, Date: DateFija, window: {},
  document: { querySelector: (sel) => (sel in campos ? { value: campos[sel] } : null), querySelectorAll: (sel) => (sel.indexOf('child-block') >= 0 ? hijos.fechas.map((f) => ({ value: f })) : []) } };
vm.createContext(ctxG);
vm.runInContext(tramo(A, 'window.aoraesGetClient = function () {', '};\n</script>') + '};', ctxG);
console.log('\nAnálisis · datos que entrega la ficha');
test('aoraesGetClient entrega las EDADES de los hijos en años cumplidos (hoy 8-11-2026) y nada más sobre ellos: ni nombres ni fechas de nacimiento', () => {
  hijos.fechas = ['2024-11-09', '2024-11-08', '2015-03-01', '2000-01-01', '', 'basura', '2090-01-01'];
  const c = ctxG.window.aoraesGetClient(); assert.deepStrictEqual(Array.from(c.childrenAges).sort((x, y) => x - y), [1, 2, 11, 26]);   // un día antes de cumplir 2 → 1
  assert.strictEqual(c.name, 'Ana López'); assert.strictEqual(c.age, 37);
  assert(!JSON.stringify(c).includes('2024-11') && !JSON.stringify(c).includes('2015-03') && !JSON.stringify(c).includes('2000-01'), 'no deben salir fechas de nacimiento de los hijos');
});
test('sin hijos escritos la lista va vacía, y sin nombre de cliente la ficha no se entrega', () => {
  hijos.fechas = []; assert.deepStrictEqual(Array.from(ctxG.window.aoraesGetClient().childrenAges), []);
  campos['#m_cliente'] = ''; assert.strictEqual(ctxG.window.aoraesGetClient(), null); campos['#m_cliente'] = 'Ana López';
});

// ---------- Seguros patrimoniales (VSP) ----------
const V = leer('vsp.html');
const estado = { ramos: {}, freq: 'mensual', years: '5' };
const RK = ['haftpflicht', 'hausrat', 'glas', 'wohngebaude', 'rechtsschutz', 'gesundheit', 'unfall'];
const ctxV = { Math, parseFloat, R: {}, RAMO_KEYS: RK, $: (id) => ({ value: id === 'v-payment-freq' ? estado.freq : estado.years }) }; vm.createContext(ctxV);
vm.runInContext(tramo(V, 'function calcPricing(){', 'function updateTotal(){') + '\nthis.calcPricing=calcPricing;', ctxV);
const poner = (activos, prima) => { RK.forEach((k) => { ctxV.R[k] = { active: activos.includes(k), premium: activos.includes(k) ? prima : 0 }; }); };

console.log('\nSeguros patrimoniales · precio con bonos y recargos');
test('Kundenbonus por número de ramos activos: 0–2 → 0 %, 3 → 10 %, 4 → 15 %, 5 → 20 %, 6 o más → 25 %', () => {
  const por = (n) => { poner(RK.slice(0, n), 100); return ctxV.calcPricing().kundenbonusPct; };
  assert.deepStrictEqual([0, 1, 2, 3, 4, 5, 6, 7].map(por), [0, 0, 0, 10, 15, 20, 25, 25]);
});
test('Zahlungsbonus: anual 5 %, semestral 2 %, mensual 0 %; recargo del 10 % si el contrato dura menos de 5 años', () => {
  poner(RK.slice(0, 3), 100); estado.freq = 'anual'; estado.years = '5'; assert.strictEqual(ctxV.calcPricing().paymentBonusPct, 5);
  estado.freq = 'semestral'; assert.strictEqual(ctxV.calcPricing().paymentBonusPct, 2); estado.freq = 'mensual'; assert.strictEqual(ctxV.calcPricing().paymentBonusPct, 0);
  estado.years = '3'; assert.strictEqual(ctxV.calcPricing().surchargePct, 10); estado.years = '5'; assert.strictEqual(ctxV.calcPricing().surchargePct, 0); estado.years = '10'; assert.strictEqual(ctxV.calcPricing().surchargePct, 0);
});
test('total = subtotal × (1 − (Kundenbonus + Zahlungsbonus)/100 + recargo/100); cálculo a mano con 4 ramos de 100 €, pago anual y 3 años: 400 × (1 − 0,20 + 0,10) = 360 €', () => {
  poner(RK.slice(0, 4), 100); estado.freq = 'anual'; estado.years = '3'; const p = ctxV.calcPricing();
  assert.strictEqual(p.subtotal, 400); assert.strictEqual(p.kundenbonusPct, 15); near(p.total, 400 * (1 - 0.20 + 0.10), 1e-9); near(p.total, 360, 1e-9);
});
test('sin ramos activos el total es 0, el total nunca es negativo y las primas no activas no cuentan', () => {
  estado.freq = 'anual'; estado.years = '5'; poner([], 100); const p = ctxV.calcPricing(); assert.strictEqual(p.subtotal, 0); assert.strictEqual(p.total, 0);
  ctxV.R.hausrat = { active: false, premium: 999 }; ctxV.R.glas = { active: true, premium: 50 }; assert.strictEqual(ctxV.calcPricing().subtotal, 50);
  RK.forEach((k) => { ctxV.R[k] = { active: true, premium: 100 }; }); assert(ctxV.calcPricing().total >= 0);
});
test('hallazgo a verificar con el tarifario oficial: los bonos se SUMAN entre sí (Kundenbonus + Zahlungsbonus), no se aplican en cadena; documentado para que un cambio sea consciente', () => {
  poner(RK.slice(0, 6), 100); estado.freq = 'anual'; estado.years = '5'; const p = ctxV.calcPricing();
  near(p.total, 600 * (1 - 0.30), 1e-9, 'aditivo: 25 % + 5 % = 30 %'); assert(Math.abs(p.total - 600 * 0.75 * 0.95) > 1, 'la versión en cadena daría otra cifra (427,5 €)');
});

console.log('\n' + passed + ' correctas, ' + failed + ' fallidas'); process.exit(failed ? 1 : 0);
