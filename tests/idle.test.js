// Pruebas del cierre de sesión por inactividad (idle.js). Sin dependencias: `node tests/idle.test.js`.
const path = require('path');
const assert = require('assert');
const { createIdleGuard } = require(path.join(__dirname, '..', 'idle.js'));

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}

const MIN = 60 * 1000, SEC = 1000;
function make() {
  const clock = { t: 1000000 };
  const g = createIdleGuard({ idleMs: 30 * MIN, warnMs: 60 * SEC, now: () => clock.t });
  return { g, clock, advance: (ms) => { clock.t += ms; } };
}

test('activa mientras no se llega al límite', () => {
  const { g, advance } = make();
  advance(29 * MIN + 59 * SEC);
  assert.deepStrictEqual(g.tick(true), { state: 'active', left: 0 });
});

test('a los 30 minutos sin actividad avisa con 60 segundos', () => {
  const { g, advance } = make();
  advance(30 * MIN);
  assert.deepStrictEqual(g.tick(true), { state: 'warn', left: 60 });
});

test('la cuenta atrás baja y al llegar a 0 expira', () => {
  const { g, advance } = make();
  advance(30 * MIN); g.tick(true);
  advance(20 * SEC);
  assert.deepStrictEqual(g.tick(true), { state: 'warn', left: 40 });
  advance(40 * SEC);
  assert.deepStrictEqual(g.tick(true), { state: 'expired', left: 0 });
});

test('la actividad reinicia la cuenta antes del aviso', () => {
  const { g, advance } = make();
  advance(25 * MIN); g.touch();
  advance(25 * MIN);
  assert.strictEqual(g.tick(true).state, 'active');
  advance(5 * MIN);
  assert.strictEqual(g.tick(true).state, 'warn');
});

test('durante el aviso la actividad NO lo cancela: hay que pulsar Seguir conectado', () => {
  const { g, advance } = make();
  advance(30 * MIN); g.tick(true);
  advance(10 * SEC); g.touch();
  assert.deepStrictEqual(g.tick(true), { state: 'warn', left: 50 });
});

test('Seguir conectado reinicia todo', () => {
  const { g, advance } = make();
  advance(30 * MIN); g.tick(true);
  advance(30 * SEC); g.stay();
  assert.strictEqual(g.tick(true).state, 'active');
  advance(29 * MIN);
  assert.strictEqual(g.tick(true).state, 'active');
});

test('ordenador suspendido: al volver, pasado también el aviso, expira directamente', () => {
  const { g, advance } = make();
  advance(2 * 60 * MIN);
  assert.deepStrictEqual(g.tick(true), { state: 'expired', left: 0 });
});

test('si vuelve justo dentro del tiempo de aviso, muestra el aviso y no cierra de golpe', () => {
  const { g, advance } = make();
  advance(30 * MIN + 30 * SEC);
  assert.deepStrictEqual(g.tick(true), { state: 'warn', left: 60 });
});

test('una sesión expirada no se revive con actividad', () => {
  const { g, advance } = make();
  advance(2 * 60 * MIN); g.tick(true);
  g.touch();
  assert.strictEqual(g.tick(true).state, 'expired');
});

test('sin sesión iniciada nunca avisa y reinicia la cuenta', () => {
  const { g, advance } = make();
  advance(3 * 60 * MIN);
  assert.deepStrictEqual(g.tick(false), { state: 'active', left: 0 });
  // al iniciar sesión después, empieza de cero
  advance(29 * MIN);
  assert.strictEqual(g.tick(true).state, 'active');
});

test('tras expirar y cerrar sesión, una sesión nueva empieza de cero', () => {
  const { g, advance } = make();
  advance(2 * 60 * MIN); assert.strictEqual(g.tick(true).state, 'expired');
  g.tick(false); // el panel ya cerró sesión
  advance(10 * MIN);
  assert.strictEqual(g.tick(true).state, 'active');
});

console.log('\n' + passed + ' ok, ' + failed + ' fallos');
process.exit(failed ? 1 : 0);
