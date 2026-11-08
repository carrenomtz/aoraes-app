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
console.log('\n' + passed + ' correctas, ' + failed + ' fallidas');
process.exit(failed ? 1 : 0);
