// Pruebas de la lógica de contactos (leads.js): historial, siguiente acción, "no contactar", unión y copia. Sin dependencias: `node tests/leads.test.js`.
// Solo datos sintéticos; ningún contacto real.
const path = require('path');
const assert = require('assert');
const L = require(process.env.LEADS || path.join(__dirname, '..', 'leads.js'));

let passed = 0, failed = 0;
const pending = [];
function test(name, fn) {
  const ok = () => { passed++; console.log('  ok   ' + name); };
  const ko = (e) => { failed++; console.log('  FAIL ' + name + '\n       ' + e.message); };
  try { const r = fn(); if (r && typeof r.then === 'function') pending.push(r.then(ok, ko)); else ok(); } catch (e) { ko(e); }
}

const TODAY = '2026-10-15';

test('leadActionState: vencida, hoy, futura y valores inválidos', () => {
  assert.strictEqual(L.leadActionState('2026-10-14', TODAY), 'overdue');
  assert.strictEqual(L.leadActionState('2026-10-15', TODAY), 'today');
  assert.strictEqual(L.leadActionState('2026-10-16', TODAY), 'future');
  assert.strictEqual(L.leadActionState('', TODAY), '');
  assert.strictEqual(L.leadActionState(undefined, TODAY), '');
  assert.strictEqual(L.leadActionState('mañana', TODAY), '');
  assert.strictEqual(L.leadActionState('15/10/2026', TODAY), '');
});

test('leadMatchesView: "hoy" incluye vencidas y de hoy, no futuras', () => {
  assert.ok(L.leadMatchesView({ nextActionAt: '2026-10-01' }, 'hoy', TODAY));
  assert.ok(L.leadMatchesView({ nextActionAt: TODAY }, 'hoy', TODAY));
  assert.ok(!L.leadMatchesView({ nextActionAt: '2026-10-20' }, 'hoy', TODAY));
  assert.ok(!L.leadMatchesView({}, 'hoy', TODAY));
});

test('leadMatchesView: un "no contactar" nunca es tarea pendiente, pero sí sale en su vista', () => {
  const dnc = { doNotContact: true, nextActionAt: '2026-10-01' };
  assert.ok(!L.leadMatchesView(dnc, 'hoy', TODAY));
  assert.ok(!L.leadMatchesView(dnc, 'sin_accion', TODAY));
  assert.ok(L.leadMatchesView(dnc, 'no_contactar', TODAY));
  assert.ok(!L.leadMatchesView({}, 'no_contactar', TODAY));
});

test('leadMatchesView: convertidos y "no interesa" no cuentan como sin siguiente acción', () => {
  assert.ok(L.leadMatchesView({ status: 'nuevo' }, 'sin_accion', TODAY));
  assert.ok(L.leadMatchesView({}, 'sin_accion', TODAY));
  assert.ok(!L.leadMatchesView({ status: 'convertido' }, 'sin_accion', TODAY));
  assert.ok(!L.leadMatchesView({ status: 'no_interesa' }, 'sin_accion', TODAY));
  assert.ok(!L.leadMatchesView({ status: 'contactado', nextActionAt: '2026-10-20' }, 'sin_accion', TODAY));
  assert.ok(L.leadMatchesView({ doNotContact: true }, 'todos', TODAY), 'la vista "todos" no filtra nada');
});

test('leadHistoryAppend: conserva lo anterior, no muta y respeta el tope', () => {
  const base = [{ at: '1', type: 'status' }];
  const out = L.leadHistoryAppend(base, [{ at: '2', type: 'next' }]);
  assert.strictEqual(out.length, 2);
  assert.strictEqual(base.length, 1, 'no muta la lista original');
  assert.deepStrictEqual(L.leadHistoryAppend(undefined, [{ at: '1' }]).length, 1);
  const big = Array.from({ length: L.LEAD_HISTORY_MAX }, (_, i) => ({ at: String(i) }));
  const trimmed = L.leadHistoryAppend(big, [{ at: 'nuevo' }]);
  assert.strictEqual(trimmed.length, L.LEAD_HISTORY_MAX);
  assert.strictEqual(trimmed[trimmed.length - 1].at, 'nuevo', 'lo último se conserva');
  assert.strictEqual(trimmed[0].at, '1', 'se descarta lo más antiguo');
});

test('leadHistoryNeedsTrim: avisa justo al pasar el tope', () => {
  const near = Array.from({ length: L.LEAD_HISTORY_MAX - 1 }, () => ({}));
  assert.ok(!L.leadHistoryNeedsTrim(near, 1));
  assert.ok(L.leadHistoryNeedsTrim(near, 2));
  assert.ok(!L.leadHistoryNeedsTrim(undefined, 1));
});

test('leadMergeMeta: "no contactar" gana si cualquiera del grupo lo tenía', () => {
  const m = L.leadMergeMeta([{ id: 'a' }, { id: 'b', doNotContact: true, dncReason: 'Pidió no recibir llamadas', dncAt: '2026-10-10T08:00:00.000Z' }, { id: 'c' }]);
  assert.strictEqual(m.doNotContact, true);
  assert.strictEqual(m.dncReason, 'Pidió no recibir llamadas');
  assert.strictEqual(m.dncAt, '2026-10-10T08:00:00.000Z');
});

test('leadMergeMeta: sin ninguna marca no inventa campos', () => {
  const m = L.leadMergeMeta([{ id: 'a' }, { id: 'b' }]);
  assert.deepStrictEqual(Object.keys(m), []);
});

test('leadMergeMeta: historial unido y ordenado por fecha; orígenes distintos conservados; próxima acción = la más cercana', () => {
  const m = L.leadMergeMeta([
    { source: 'Excel A', nextAction: 'Llamar', nextActionAt: '2026-10-20', history: [{ at: '2026-10-05T10:00:00Z', type: 'import' }, { at: '2026-10-07T10:00:00Z', type: 'status' }] },
    { source: 'Excel B', nextAction: 'Escribir', nextActionAt: '2026-10-18', history: [{ at: '2026-10-06T10:00:00Z', type: 'import' }] },
    { source: 'Excel A' },
  ]);
  assert.deepStrictEqual(m.history.map(e => e.at), ['2026-10-05T10:00:00Z', '2026-10-06T10:00:00Z', '2026-10-07T10:00:00Z']);
  assert.strictEqual(m.source, 'Excel A · Excel B');
  assert.strictEqual(m.nextActionAt, '2026-10-18');
  assert.strictEqual(m.nextAction, 'Escribir');
});

test('leadHistoryText: textos legibles para cada tipo', () => {
  const ctx = { status: { nuevo: 'Nuevo', contactado: 'Contactado' }, who: u => ({ u1: 'Ana' }[u]) };
  assert.strictEqual(L.leadHistoryText({ type: 'status', from: 'nuevo', to: 'contactado' }, ctx), 'Estado: Nuevo → Contactado');
  assert.strictEqual(L.leadHistoryText({ type: 'assign', from: 'pool', to: 'u1' }, ctx), 'Movido de la bolsa sin asignar a Ana');
  assert.strictEqual(L.leadHistoryText({ type: 'assign', from: 'u1', to: 'u9' }, ctx), 'Movido de Ana a otro asesor');
  assert.strictEqual(L.leadHistoryText({ type: 'dnc', to: true, note: 'Lo pidió' }, ctx), 'Marcado como NO CONTACTAR: Lo pidió');
  assert.strictEqual(L.leadHistoryText({ type: 'dnc', to: false }, ctx), 'Quitada la marca de no contactar');
  assert.strictEqual(L.leadHistoryText({ type: 'import', note: 'lista.xlsx' }, ctx), 'Importado desde lista.xlsx');
  assert.strictEqual(L.leadHistoryText({ type: 'next', to: 'Llamar', note: '2026-10-20' }, ctx), 'Siguiente acción: Llamar (2026-10-20)');
  assert.strictEqual(L.leadHistoryText({ type: 'next', to: '', note: '' }, ctx), 'Siguiente acción quitada');
  assert.strictEqual(L.leadHistoryText({ type: 'raro' }, ctx), 'raro');
});

test('leadExportRow: convierte Timestamp a ISO y no pierde ningún campo', () => {
  const ts = { toDate: () => new Date('2026-10-01T12:00:00Z') };
  const doc = { id: 'x1', name: 'Ana Prueba', phone: '+49 151 000', lastContactAt: ts, status: 'nuevo', extra: 'rara', history: [{ at: '1' }] };
  const row = L.leadExportRow(doc, 'asesor', 'u1', 'ana@test');
  assert.strictEqual(row.lastContactAt, '2026-10-01T12:00:00.000Z');
  assert.strictEqual(row.extra, 'rara', 'un campo desconocido también viaja en la copia');
  assert.strictEqual(row._scope, 'asesor');
  assert.strictEqual(row._ownerUid, 'u1');
  assert.deepStrictEqual(row.history, [{ at: '1' }]);
  assert.doesNotThrow(() => JSON.stringify(row));
});

test('leadsToCsv: cabecera, comillas, saltos de línea y fórmulas neutralizadas', () => {
  const rows = [
    { _scope: 'bolsa', id: 'a', name: 'Ana "la jefa"', phone: '+49 151 000', notes: 'línea1\nlínea2; punto y coma', doNotContact: true, history: [1, 2] },
    { _scope: 'asesor', id: 'b', name: '=SUMA(1;2)', phone: '', history: [] },
  ];
  const csv = L.leadsToCsv(rows);
  const lines = csv.split('\r\n');
  assert.strictEqual(lines[0], L.LEAD_CSV_COLUMNS.join(';'));
  assert.ok(csv.includes('"Ana ""la jefa"""'), 'comillas escapadas');
  assert.ok(csv.includes("'+49 151 000"), 'teléfono con + no se evalúa como fórmula');
  assert.ok(csv.includes("'=SUMA(1;2)") || csv.includes('"\'=SUMA(1;2)"'), 'fórmula neutralizada');
  assert.ok(csv.includes('"línea1\nlínea2; punto y coma"'), 'saltos y ; dentro de comillas');
  assert.ok(/;sí;/.test(csv), 'doNotContact se ve como "sí"');
  // 1 cabecera + 2 filas (los saltos de línea del campo notas van entre comillas, así que contamos filas con el separador \r\n)
  assert.strictEqual(lines.length, 3);
});

// ---- Resumen del equipo y vista "sin tocar" ----
const iso = (daysAgo) => new Date(new Date(TODAY + 'T12:00:00').getTime() - daysAgo * 86400000).toISOString();

test('leadIsStale: más de 14 días sin tocar, usa importedAt si no hay último contacto y sin fechas cuenta como sin tocar', () => {
  assert.ok(!L.leadIsStale({ lastContactAt: iso(3) }, TODAY));
  assert.ok(L.leadIsStale({ lastContactAt: iso(30) }, TODAY));
  assert.ok(!L.leadIsStale({ importedAt: iso(2) }, TODAY), 'recién importado no está estancado');
  assert.ok(L.leadIsStale({ importedAt: iso(40) }, TODAY));
  assert.ok(L.leadIsStale({}, TODAY));
  assert.ok(!L.leadIsStale({ lastContactAt: { toDate: () => new Date(iso(1)) } }, TODAY), 'acepta Timestamp');
  assert.ok(!L.leadIsStale({ lastContactAt: 'texto raro', importedAt: iso(1) }, TODAY), 'fecha ilegible: cae a importedAt');
  assert.ok(L.leadIsStale({ lastContactAt: iso(10) }, TODAY, 7), 'umbral configurable');
});

test('leadMatchesView "sin_tocar": solo abiertos', () => {
  assert.ok(L.leadMatchesView({ status: 'contactado', lastContactAt: iso(30) }, 'sin_tocar', TODAY));
  assert.ok(!L.leadMatchesView({ status: 'convertido', lastContactAt: iso(30) }, 'sin_tocar', TODAY));
  assert.ok(!L.leadMatchesView({ status: 'nuevo', doNotContact: true, lastContactAt: iso(30) }, 'sin_tocar', TODAY));
  assert.ok(!L.leadMatchesView({ status: 'nuevo', lastContactAt: iso(2) }, 'sin_tocar', TODAY));
});

const R = (o) => Object.assign({ _scope: 'asesor', _ownerUid: 'u1', _ownerLabel: 'Ana', status: 'nuevo', importedAt: iso(1) }, o);
const ROWS = [
  R({ id: 1 }),                                                              // abierto, sin acción
  R({ id: 2, nextActionAt: '2026-10-10', nextAction: 'Llamar' }),             // vencida
  R({ id: 3, nextActionAt: TODAY }),                                          // hoy
  R({ id: 4, status: 'convertido' }),                                         // cerrado: no cuenta como abierto
  R({ id: 5, doNotContact: true, nextActionAt: '2026-10-01' }),               // no contactar: nunca tarea
  R({ id: 6, importedAt: iso(60), source: 'Excel A' }),                       // sin tocar
  R({ id: 7, _ownerUid: 'u2', _ownerLabel: 'Beto', status: 'contactado', source: 'Excel A', nextActionAt: '2026-11-01', lastContactAt: iso(2) }),
  R({ id: 8, _scope: 'bolsa', _ownerUid: '', _ownerLabel: 'Sin asignar', importedAt: iso(1) }),
];
const SUM = L.leadsSummary(ROWS, TODAY, { nuevo: 'Nuevo', contactado: 'Contactado', convertido: 'Convertido' });

test('leadsSummary: totales coinciden con la suma de grupos y con los datos', () => {
  assert.strictEqual(SUM.totals.total, ROWS.length);
  assert.strictEqual(SUM.groups.reduce((a, g) => a + g.total, 0), ROWS.length);
  ['open', 'vencidas', 'hoy', 'sinAccion', 'sinTocar', 'noContactar'].forEach(k =>
    assert.strictEqual(SUM.groups.reduce((a, g) => a + g[k], 0), SUM.totals[k], 'suma de ' + k));
});

test('leadsSummary: definiciones (abierto, vencida, hoy, sin acción, sin tocar, no contactar)', () => {
  const ana = SUM.groups.find(g => g.key === 'u1');
  assert.strictEqual(ana.total, 6);
  assert.strictEqual(ana.open, 4, 'ids 1,2,3,6: ni convertido ni no contactar');
  assert.strictEqual(ana.vencidas, 1, 'el no contactar con fecha vencida NO cuenta');
  assert.strictEqual(ana.hoy, 1);
  assert.strictEqual(ana.sinAccion, 2, 'ids 1 y 6');
  assert.strictEqual(ana.sinTocar, 1, 'id 6');
  assert.strictEqual(ana.noContactar, 1);
});

test('leadsSummary: la bolsa va primero, el resto por contactos abiertos', () => {
  assert.strictEqual(SUM.groups[0].key, 'pool');
  assert.strictEqual(SUM.groups[0].label, 'Sin asignar (bolsa)');
  assert.deepStrictEqual(SUM.groups.map(g => g.key), ['pool', 'u1', 'u2']);
});

test('leadsSummary: orígenes y estados con etiqueta', () => {
  assert.deepStrictEqual(SUM.bySource.find(x => x.key === 'Excel A').count, 2);
  assert.strictEqual(SUM.bySource.find(x => x.key === 'Sin origen').count, 6);
  assert.strictEqual(SUM.byStatus.find(x => x.key === 'convertido').label, 'Convertido');
  assert.strictEqual(SUM.byStatus.reduce((a, x) => a + x.count, 0), ROWS.length);
});

test('leadsSummary: sin datos no revienta', () => {
  const e = L.leadsSummary([], TODAY, {});
  assert.strictEqual(e.totals.total, 0);
  assert.deepStrictEqual(e.groups, []);
});

// ---- Lista de supresión ----
test('leadSuppressionKeys: correo en minúsculas y teléfono solo con dígitos (sin "+" ni "00")', () => {
  assert.deepStrictEqual(L.leadSuppressionKeys({ email: ' Ana@Test.COM ', phone: '+34 600-000 001' }).map(k => k.key), ['e:ana@test.com', 'p:34600000001']);
  assert.deepStrictEqual(L.leadSuppressionKeys({ phone: '0034 600 000 001' }).map(k => k.key), ['p:34600000001']);
});

test('leadSuppressionKeys: ignora correos y teléfonos inválidos o demasiado cortos', () => {
  assert.deepStrictEqual(L.leadSuppressionKeys({ email: 'sin-arroba', phone: '123' }), []);
  assert.deepStrictEqual(L.leadSuppressionKeys({}), []);
  assert.deepStrictEqual(L.leadSuppressionKeys(null), []);
});

test('leadSuppressionIds: huella SHA-256 de 64 caracteres, estable y sin el dato en claro', async () => {
  const a = await L.leadSuppressionIds({ email: 'Ana@Test.com', phone: '+49 151 000' + '0001' });
  const b = await L.leadSuppressionIds({ email: 'ana@test.com ', phone: '0049 151 0000001' });
  assert.strictEqual(a.length, 2);
  assert.deepStrictEqual(a, b, 'mismo contacto escrito distinto -> mismas huellas');
  a.forEach(x => { assert.ok(/^[0-9a-f]{64}$/.test(x.id)); assert.ok(!x.id.includes('ana')); });
  assert.deepStrictEqual(a.map(x => x.kind), ['email', 'phone']);
  const other = await L.leadSuppressionIds({ email: 'otra@test.com' });
  assert.notStrictEqual(other[0].id, a[0].id);
  // SHA-256("e:ana@test.com") calculado de forma independiente
  assert.strictEqual(a[0].id, require('crypto').createHash('sha256').update('e:ana@test.com').digest('hex'));
});

Promise.all(pending).then(() => {
  console.log('\n' + passed + ' ok, ' + failed + ' fallos');
  process.exit(failed ? 1 : 0);
});
