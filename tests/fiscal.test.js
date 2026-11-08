// Pruebas del perfil fiscal (Fase 2, exploratoria): sin impuestos, solo datos, estados, permisos e importación. `node tests/fiscal.test.js`.
const assert = require('assert');
const F = require('../fiscal.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message); } }
const nuevo = () => { const rec = {}; F.normalizeFiscal(rec); return rec; };
const T0 = '2026-11-08T10:00:00.000Z', T1 = '2026-11-08T11:00:00.000Z';
// Registro de ejemplo con lo que guarda el análisis (claves tal como las genera keyOf: gross:, pers:, sit:)
const analisis = () => ({ id: 'c1', savedAt: '2026-10-01T09:00:00.000Z', data: { fields: {
  'gross:salarioBruto_A': '4000', 'gross:numPagas_A': '13', 'gross:salarioBruto_B': '2500', 'gross:numPagas_B': '12', 'pers:estadoCivil_A': 'Casado/a',
  'pers:steuerId_A': '12345678901', 'pers:nombre_A': 'Ana', 'pers:fechaNacimiento_A': '1985-03-02', 'sit:tieneKirchensteuer': false, 'exp:super': '600', 'sit:ahorroLiquido': '20000' },
  children: [{ fechaNacimiento: '2015-01-01' }, { fechaNacimiento: '2018-05-05' }] } });

console.log('\nModelo de datos y estados');
test('un perfil nuevo no inventa nada: todos los campos desconocidos y sin valor', () => {
  const f = nuevo().fiscal; assert.strictEqual(Object.keys(f.campos).length, F.FISCAL_CAMPOS.length);
  Object.values(f.campos).forEach((c) => { assert.strictEqual(c.estado, 'desconocido'); assert.strictEqual(c.value, null); });
});
test('cero, desconocido y no aplica son tres cosas distintas', () => {
  const f = nuevo().fiscal;
  F.fiscalFijar(f, 'other_income_household', '0', 'manual', T0); assert.strictEqual(f.campos.other_income_household.value, 0); assert.strictEqual(f.campos.other_income_household.estado, 'proporcionado');
  F.fiscalMarcar(f, 'tax_class_primary', 'no_aplica', T0); assert.strictEqual(f.campos.tax_class_primary.estado, 'no_aplica'); assert.strictEqual(f.campos.tax_class_primary.value, null);
  assert.strictEqual(f.campos.children_count.estado, 'desconocido');
  F.fiscalFijar(f, 'other_income_household', '', 'manual', T1); assert.strictEqual(f.campos.other_income_household.estado, 'desconocido'); assert.strictEqual(f.campos.other_income_household.value, null);
});
test('validación: rangos, tipos y enums; un valor inválido no cambia el campo', () => {
  const f = nuevo().fiscal;
  assert.strictEqual(F.fiscalFijar(f, 'gross_salary_primary', '-5', 'manual', T0).ok, false);
  assert.strictEqual(F.fiscalFijar(f, 'gross_salary_primary', 'abc', 'manual', T0).ok, false);
  assert.strictEqual(F.fiscalFijar(f, 'own_use_pct', '120', 'manual', T0).ok, false);
  assert.strictEqual(F.fiscalFijar(f, 'tax_year', '1999', 'manual', T0).ok, false);
  assert.strictEqual(F.fiscalFijar(f, 'children_count', '25', 'manual', T0).ok, false);
  assert.strictEqual(F.fiscalFijar(f, 'marital_status', 'robot', 'manual', T0).ok, false);
  assert.strictEqual(F.fiscalFijar(f, 'gross_salary_primary', '45.000,5'.replace('.', ''), 'manual', T0).ok, true); // 45000,5 con coma decimal
  assert.strictEqual(f.campos.gross_salary_primary.value, 45000.5); assert.strictEqual(f.campos.tax_year.estado, 'desconocido');
});
test('cada cambio guarda la versión anterior; repetir el mismo valor no borra la confirmación', () => {
  const f = nuevo().fiscal;
  F.fiscalFijar(f, 'gross_salary_primary', 50000, 'manual', T0); F.fiscalConfirmar(f, 'gross_salary_primary', T0);
  F.fiscalFijar(f, 'gross_salary_primary', 50000, 'manual', T1); assert.strictEqual(f.campos.gross_salary_primary.estado, 'confirmado'); // sin cambio
  F.fiscalFijar(f, 'gross_salary_primary', 52000, 'manual', T1);
  const c = f.campos.gross_salary_primary; assert.strictEqual(c.estado, 'proporcionado'); assert.strictEqual(c.confirmadoEn, null);
  assert.strictEqual(c.versiones.length, 1); assert.strictEqual(c.versiones[0].value, 50000);
});
test('no se puede confirmar un campo sin valor', () => {
  const f = nuevo().fiscal; assert.strictEqual(F.fiscalConfirmar(f, 'gross_salary_primary', T0), false); assert.strictEqual(f.campos.gross_salary_primary.estado, 'desconocido');
});
test('normalizar repara estados incoherentes y es idempotente', () => {
  const rec = { fiscal: { campos: { tax_year: { estado: 'confirmado', value: null }, marital_status: { estado: 'desconocido', value: 'single' }, gross_salary_primary: 'basura' }, paso: 99 } };
  F.normalizeFiscal(rec); const f = rec.fiscal;
  assert.strictEqual(f.campos.tax_year.estado, 'desconocido'); assert.strictEqual(f.campos.marital_status.estado, 'proporcionado'); assert.strictEqual(f.campos.gross_salary_primary.estado, 'desconocido'); assert.strictEqual(f.paso, 0);
  const copia = JSON.parse(JSON.stringify(f)); F.normalizeFiscal(rec); assert.deepStrictEqual(rec.fiscal, copia);
});

console.log('\nCuestionario: cuatro preguntas y campos condicionales');
test('hay exactamente cuatro pasos y cada campo pertenece a uno', () => {
  assert.strictEqual(F.FISCAL_PASOS.length, 4); F.FISCAL_CAMPOS.forEach((c) => assert(c.paso >= 1 && c.paso <= 4, c.k));
});
test('la pareja solo se pregunta si hay pareja o se desconoce el estado civil', () => {
  const f = nuevo().fiscal; assert.strictEqual(F.fiscalCampoVisible(f, 'gross_salary_partner'), true); // desconocido: se pregunta
  F.fiscalFijar(f, 'marital_status', 'single', 'manual', T0); assert.strictEqual(F.fiscalCampoVisible(f, 'gross_salary_partner'), false); assert.strictEqual(F.fiscalCampoVisible(f, 'filing_mode'), false);
  F.fiscalFijar(f, 'marital_status', 'registered_partnership', 'manual', T0); assert.strictEqual(F.fiscalCampoVisible(f, 'filing_mode'), true);
});
test('los datos del Steuerbescheid y del alquiler solo aparecen cuando corresponde', () => {
  const f = nuevo().fiscal;
  assert.strictEqual(F.fiscalCampoVisible(f, 'taxable_income'), false); assert.strictEqual(F.fiscalCampoVisible(f, 'rent_net_cold_monthly'), false);
  F.fiscalFijar(f, 'taxes_data_mode', 'zve', 'manual', T0); assert.strictEqual(F.fiscalCampoVisible(f, 'taxable_income'), true); assert.strictEqual(F.fiscalCampoVisible(f, 'assessed_income_tax'), false);
  F.fiscalFijar(f, 'taxes_data_mode', 'steuerbescheid', 'manual', T0); assert.strictEqual(F.fiscalCampoVisible(f, 'assessed_income_tax'), true);
  F.fiscalFijar(f, 'taxes_data_mode', 'continuar_sin', 'manual', T0); assert.strictEqual(F.fiscalCampoVisible(f, 'taxable_income'), false);
  F.fiscalFijar(f, 'property_use', 'owner_occupied', 'manual', T0); assert.strictEqual(F.fiscalCampoVisible(f, 'rent_net_cold_monthly'), false); assert.strictEqual(F.fiscalCampoVisible(f, 'own_use_pct'), false);
  F.fiscalFijar(f, 'property_use', 'mixed_use', 'manual', T0); assert.strictEqual(F.fiscalCampoVisible(f, 'own_use_pct'), true); assert.strictEqual(F.fiscalCampoVisible(f, 'rent_net_cold_monthly'), true);
});

console.log('\nReutilización del análisis: solo con permiso');
test('sin permiso no se importa nada y el perfil queda intacto', () => {
  const rec = nuevo(), antes = JSON.stringify(rec.fiscal), r = F.fiscalImportar(rec.fiscal, analisis(), T0);
  assert.strictEqual(r.bloqueado, true); assert.deepStrictEqual(r.importados, []); assert.strictEqual(JSON.stringify(rec.fiscal), antes);
});
test('leer los candidatos no modifica el registro del análisis (solo lectura)', () => {
  const a = analisis(), antes = JSON.stringify(a); F.fiscalCandidatosAnalisis(a); F.fiscalDisponibleEnAnalisis(a); assert.strictEqual(JSON.stringify(a), antes);
});
test('con permiso importa solo lo de la matriz, anualiza el bruto y deja todo sin confirmar', () => {
  const rec = nuevo(); F.fiscalOtorgarPermiso(rec.fiscal, 'asesor', T0); const r = F.fiscalImportar(rec.fiscal, analisis(), T1), f = rec.fiscal;
  assert.deepStrictEqual(r.importados.sort(), ['children_count', 'gross_salary_partner', 'gross_salary_primary', 'marital_status']);
  assert.strictEqual(f.campos.gross_salary_primary.value, 4000 * 13); assert.strictEqual(f.campos.gross_salary_partner.value, 2500 * 12);
  assert.strictEqual(f.campos.marital_status.value, 'married'); assert.strictEqual(f.campos.children_count.value, 2);
  ['gross_salary_primary', 'gross_salary_partner', 'marital_status', 'children_count'].forEach((k) => {
    const c = f.campos[k]; assert.strictEqual(c.estado, 'proporcionado'); assert.strictEqual(c.fuente, 'analisis_financiero'); assert.strictEqual(c.confirmadoEn, null); assert.strictEqual(c.ejercicio, null); assert(c.fuenteRef);
  });
});
test('no importa Steuer-ID, nombre, nacimiento, gastos ni ahorros: ningún campo del perfil los recibe', () => {
  const rec = nuevo(); F.fiscalOtorgarPermiso(rec.fiscal, 'asesor', T0); F.fiscalImportar(rec.fiscal, analisis(), T1);
  const texto = JSON.stringify(rec.fiscal); ['12345678901', '1985-03-02', '"Ana"'].forEach((s) => assert.strictEqual(texto.indexOf(s), -1, 'aparece ' + s));
  assert.strictEqual(Object.keys(rec.fiscal.campos).some((k) => /steuer_?id|name|birth|expense|saving/i.test(k)), false);
});
test('lo que no se puede distinguir no se importa: casilla de Kirchensteuer sin marcar y ausencia de hijos', () => {
  const rec = nuevo(); F.fiscalOtorgarPermiso(rec.fiscal, 'asesor', T0); const a = analisis(); a.data.children = [];
  const r = F.fiscalImportar(rec.fiscal, a, T1);
  assert.strictEqual(rec.fiscal.campos.church_tax_status.estado, 'desconocido'); assert.strictEqual(rec.fiscal.campos.children_count.estado, 'desconocido');
  assert(r.omitidos.some((o) => o.k === 'church_tax_status' && /no distingue/.test(o.motivo))); assert(r.omitidos.some((o) => o.k === 'children_count'));
  a.data.fields['sit:tieneKirchensteuer'] = true; F.fiscalImportar(rec.fiscal, a, T1); assert.strictEqual(rec.fiscal.campos.church_tax_status.value, 'yes');
});
test('no pisa lo escrito a mano ni lo confirmado; sí actualiza lo que vino del análisis y conserva el original', () => {
  const rec = nuevo(), f = rec.fiscal; F.fiscalOtorgarPermiso(f, 'asesor', T0);
  F.fiscalFijar(f, 'gross_salary_primary', 61000, 'manual', T0); F.fiscalConfirmar(f, 'gross_salary_primary', T0);
  const r = F.fiscalImportar(f, analisis(), T1);
  assert.strictEqual(f.campos.gross_salary_primary.value, 61000); assert(r.omitidos.some((o) => o.k === 'gross_salary_primary' && /a mano/.test(o.motivo)));
  const a = analisis(); F.fiscalImportar(f, a, T1); a.data.fields['gross:salarioBruto_B'] = '3000'; F.fiscalImportar(f, a, T1);
  assert.strictEqual(f.campos.gross_salary_partner.value, 36000); assert.strictEqual(f.campos.gross_salary_partner.versiones[0].value, 30000);
});
test('revocar el permiso detiene nuevas importaciones', () => {
  const rec = nuevo(); F.fiscalOtorgarPermiso(rec.fiscal, 'asesor', T0); F.fiscalRevocarPermiso(rec.fiscal, T1);
  assert.strictEqual(F.fiscalPermisoVigente(rec.fiscal), false); assert.strictEqual(F.fiscalImportar(rec.fiscal, analisis(), T1).bloqueado, true);
});
test('el permiso registra finalidad, fecha, quién y alcance', () => {
  const rec = nuevo(), p = F.fiscalOtorgarPermiso(rec.fiscal, 'asesor', T0);
  assert.strictEqual(p.finalidad, F.FISCAL_FINALIDAD); assert.strictEqual(p.otorgadoEn, T0); assert.strictEqual(p.registradoPor, 'asesor'); assert.deepStrictEqual(p.alcance, F.FISCAL_ALCANCE_IMPORTACION);
});

console.log('\nNivel de datos, pendientes y revisión');
test('el nivel depende de los datos, nunca llega a 3 desde aquí y no hay cifras fiscales', () => {
  const f = nuevo().fiscal; assert.strictEqual(F.fiscalNivel(f).nivel, 0);
  F.fiscalFijar(f, 'gross_salary_primary', 60000, 'manual', T0); F.fiscalFijar(f, 'marital_status', 'single', 'manual', T0); F.fiscalFijar(f, 'tax_year', 2025, 'manual', T0);
  assert.strictEqual(F.fiscalNivel(f).nivel, 1);
  F.fiscalFijar(f, 'taxes_data_mode', 'zve', 'manual', T0); F.fiscalFijar(f, 'taxable_income', 41000, 'manual', T0); F.fiscalFijar(f, 'tax_assessment_year', 2025, 'manual', T0);
  F.fiscalFijar(f, 'property_use', 'owner_occupied', 'manual', T0); F.fiscalFijar(f, 'ownership_primary_pct', 100, 'manual', T0);
  const n = F.fiscalNivel(f); assert.strictEqual(n.nivel, 2); assert.strictEqual(n.especialista, false);
  assert.strictEqual(Object.keys(F).some((k) => /(^|_)calc|calcul|impuesto|tarifa|steuersatz|einkommensteuer/i.test(k)), false); // esta fase no calcula impuestos
});
test('los pendientes separan lo que falta, lo que no está confirmado y el ejercicio de lo importado', () => {
  const rec = nuevo(), f = rec.fiscal; F.fiscalOtorgarPermiso(f, 'asesor', T0); F.fiscalImportar(f, analisis(), T1);
  let p = F.fiscalPendientes(f);
  assert(p.some((x) => x.k === 'gross_salary_primary' && x.tipo === 'sin_confirmar')); assert(p.some((x) => x.k === 'tax_year' && x.tipo === 'falta'));
  F.fiscalConfirmar(f, 'gross_salary_primary', T1); p = F.fiscalPendientes(f);
  assert(p.some((x) => x.k === 'gross_salary_primary' && x.tipo === 'sin_ejercicio')); // confirmado, pero el análisis no trae el ejercicio
  F.fiscalMarcar(f, 'tax_class_primary', 'no_aplica', T1); assert.strictEqual(F.fiscalPendientes(f).some((x) => x.k === 'tax_class_primary'), false);
});
test('un paso se da por completo solo con los campos no opcionales conocidos (o marcados como no aplica)', () => {
  const f = nuevo().fiscal; F.fiscalFijar(f, 'marital_status', 'single', 'manual', T0);
  assert.strictEqual(F.fiscalPasoCompleto(f, 1), false); F.fiscalFijar(f, 'tax_year', 2025, 'manual', T0); F.fiscalFijar(f, 'gross_salary_primary', 40000, 'manual', T0);
  assert.strictEqual(F.fiscalPasoCompleto(f, 1), true);
});
test('confirmar todo marca como confirmado lo que tiene valor y deja los desconocidos como están', () => {
  const f = nuevo().fiscal; F.fiscalFijar(f, 'gross_salary_primary', 40000, 'manual', T0);
  const n = F.fiscalConfirmarTodo(f, T1); assert.strictEqual(n, 1); assert.strictEqual(f.campos.gross_salary_primary.estado, 'confirmado'); assert.strictEqual(f.campos.tax_year.estado, 'desconocido'); assert.strictEqual(f.revisado, true);
});
test('el resumen de revisión muestra fuente, estado y confianza de cada campo visible', () => {
  const rec = nuevo(), f = rec.fiscal; F.fiscalOtorgarPermiso(f, 'asesor', T0); F.fiscalImportar(f, analisis(), T1);
  const fila = F.fiscalResumen(f).filter((r) => r.k === 'marital_status')[0];
  assert.strictEqual(fila.etiquetaValor, 'Casado/a'); assert.strictEqual(fila.fuente, 'analisis_financiero'); assert.strictEqual(fila.estado, 'proporcionado'); assert.strictEqual(fila.confianza, 'medium');
});

console.log('\n' + passed + ' correctas, ' + failed + ' fallidas');
process.exit(failed ? 1 : 0);
