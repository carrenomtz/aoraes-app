// Pruebas de la lógica de contactos (leads.js): historial, siguiente acción, "no contactar", unión y copia. Sin dependencias: `node tests/leads.test.js`.
// Solo datos sintéticos; ningún contacto real.
const path = require('path');
const assert = require('assert');
const L = require(process.env.LEADS || path.join(__dirname, '..', 'leads.js'));

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message); }
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

console.log('\n' + passed + ' ok, ' + failed + ' fallos');
process.exit(failed ? 1 : 0);
