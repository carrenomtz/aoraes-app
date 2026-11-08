// Pruebas de la biblioteca de productos del Centro del Asesor (estructura, estados y adaptador). `node tests/productos.test.js`.
// TODAS las cifras de este fichero son inventadas para probar la lógica: no son tarifas de ningún proveedor.
const assert = require('assert'), fs = require('fs'), path = require('path');
const P = require('../productos.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message); } }
const HOY = '2026-11-08';
const coste = (o) => Object.assign(P.productoCosteNuevo({ id: 'c1', tipo: 'verwaltungskosten', concepto: 'Ejemplo', valor: 1.5, unidad: 'pct', base: 'prima_bruta', periodicidad: 'mensual', desdeMes: 1 }), o || {});
const ficha = (o) => Object.assign(P.productoNueva({ productoId: 'ejemplo-va', familia: 'VA', proveedor: 'Proveedor de ejemplo', nombre: 'Producto de ejemplo', version: '2026-01', vigenteDesde: '2026-01-01' }), { costes: [coste()] }, o || {});
const verificable = (o) => { const f = ficha(o); f.fuente = { documento: 'Documento de ejemplo', referencia: 'p. 3', fecha: '2026-01-10' }; f.costes.forEach((c) => { c.estado = 'verificado'; c.fuente = { documento: 'Documento de ejemplo', referencia: 'p. 3' }; }); return f; };

console.log('\nForma de la ficha');
test('una ficha nueva no inventa nada: borrador, sin costes, sin fuente, sin verificar; y la validación pide lo que falta', () => {
  const f = P.productoNueva(); assert.strictEqual(f.estado, 'borrador'); assert.deepStrictEqual(f.costes, []); assert.strictEqual(f.fuente.documento, ''); assert.strictEqual(f.verificadoPor, '');
  assert(P.productoValidar(f).length >= 4);
});
test('una ficha completa en borrador es válida', () => { assert.deepStrictEqual(P.productoValidar(ficha()), []); });
test('cada coste exige tipo, unidad, base, periodicidad y valor coherentes', () => {
  const malos = [{ valor: -1 }, { valor: null }, { valor: 101 }, { unidad: 'permille', valor: 1001 }, { tipo: 'inventado' }, { unidad: 'xx' }, { base: 'yy' }, { periodicidad: 'zz' },
    { desdeMes: 0 }, { desdeMes: 12, hastaMes: 6 }, { desdeMes: 1.5 }, { unidad: 'pct', base: 'fijo' }, { unidad: 'eur', base: 'capital_acumulado', valor: 5 }, { id: '' }, { estado: 'tal' }];
  malos.forEach((m) => assert(P.productoValidar(ficha({ costes: [coste(m)] })).length > 0, 'debería rechazar ' + JSON.stringify(m)));
  assert.deepStrictEqual(P.productoValidar(ficha({ costes: [coste({ unidad: 'eur', base: 'fijo', valor: 12, periodicidad: 'anual' })] })), []);
  assert.deepStrictEqual(P.productoValidar(ficha({ costes: [coste({ valor: 0 })] })), [], 'un coste de 0 es válido y distinto de «sin dato»');
});
test('identificadores de coste repetidos, fechas imposibles y vigencia invertida se rechazan', () => {
  assert(P.productoValidar(ficha({ costes: [coste(), coste()] })).some((x) => /repetido/.test(x)));
  assert(P.productoValidar(ficha({ vigenteDesde: '2026-02-30' })).length > 0);
  assert(P.productoValidar(ficha({ vigenteHasta: '2025-12-31' })).some((x) => /termina antes/.test(x)));
  assert.deepStrictEqual(P.productoValidar(ficha({ vigenteHasta: '2027-12-31' })), []);
  assert(P.productoValidar(ficha({ familia: 'NOEXISTE' })).length > 0);
});

console.log('\nEstados y verificación');
test('verificar exige fuente de la ficha, fuente y verificación de CADA coste, quién y cuándo', () => {
  const f = ficha(); const r = P.productoCambiarEstado(f, 'verificado', 'admin', 'x');
  assert.strictEqual(r.ok, false);                                         // desde borrador no se salta la revisión
  P.productoCambiarEstado(f, 'pendiente_revision', 'admin', 'x');
  const r2 = P.productoCambiarEstado(f, 'verificado', 'admin', '2026-11-08T10:00:00Z');
  assert.strictEqual(r2.ok, false); assert(r2.errores.some((x) => /documento fuente/.test(x))); assert(r2.errores.some((x) => /no está verificado/.test(x)));
  assert.strictEqual(f.estado, 'pendiente_revision', 'si falla no cambia nada');
  assert.strictEqual(f.verificadoPor, '');
});
test('una ficha completa recorre borrador → pendiente → verificado → obsoleto y no vuelve atrás', () => {
  const f = verificable();
  assert.strictEqual(P.productoCambiarEstado(f, 'pendiente_revision', 'a', 't').ok, true);
  const v = P.productoCambiarEstado(f, 'verificado', 'carlos', '2026-11-08T10:00:00Z');
  assert.strictEqual(v.ok, true, v.errores.join('|')); assert.strictEqual(f.verificadoPor, 'carlos'); assert.deepStrictEqual(P.productoValidar(f), []);
  assert.strictEqual(P.productoCambiarEstado(f, 'borrador', 'a', 't').ok, false);
  assert.strictEqual(P.productoCambiarEstado(f, 'obsoleto', 'a', 't').ok, true);
  ['borrador', 'pendiente_revision', 'verificado'].forEach((e) => assert.strictEqual(P.productoCambiarEstado(f, e, 'a', 't').ok, false));
  assert.strictEqual(P.productoCambiarEstado(f, 'inventado', 'a', 't').ok, false);
});
test('una ficha ilustrativa nunca puede verificarse', () => {
  const f = verificable({ ilustrativo: true }); P.productoCambiarEstado(f, 'pendiente_revision', 'a', 't');
  const r = P.productoCambiarEstado(f, 'verificado', 'a', 't'); assert.strictEqual(r.ok, false); assert(r.errores.some((x) => /ilustrativa/.test(x)));
});
test('una ficha marcada «verificado» a mano, sin sus requisitos, se detecta como inválida', () => {
  const f = ficha({ estado: 'verificado' }); assert(P.productoValidar(f).length > 0);
  assert.strictEqual(P.productoUsable(f, HOY).ok, false);
});

console.log('\nVigencia y adaptador de costes');
test('vigencia: desde y hasta inclusive; obsoleta nunca', () => {
  const f = ficha({ vigenteDesde: '2026-01-01', vigenteHasta: '2026-12-31' });
  assert(P.productoVigente(f, '2026-01-01') && P.productoVigente(f, '2026-12-31')); assert(!P.productoVigente(f, '2025-12-31') && !P.productoVigente(f, '2027-01-01'));
  assert(!P.productoVigente(Object.assign(ficha(), { estado: 'obsoleto' }), HOY)); assert(P.productoVigente(ficha({ vigenteHasta: null }), '2099-01-01'));
});
test('solo es utilizable una ficha verificada, vigente, no ilustrativa y válida (y se dice por qué no)', () => {
  const v = verificable(); P.productoCambiarEstado(v, 'pendiente_revision', 'a', 't'); P.productoCambiarEstado(v, 'verificado', 'a', 't');
  assert.strictEqual(P.productoUsable(v, HOY).ok, true);
  assert.strictEqual(P.productoUsable(Object.assign({}, v, { vigenteHasta: '2026-06-30' }), HOY).motivo, 'no_vigente');
  assert.strictEqual(P.productoUsable(ficha(), HOY).motivo, 'no_verificada');
  assert.strictEqual(P.productoUsable(Object.assign({}, v, { ilustrativo: true }), HOY).motivo, 'ilustrativa');
  assert.strictEqual(P.productoUsable(null, HOY).motivo, 'sin_ficha');
});
test('adaptador: sin ficha → genérico; solo borradores o ilustrativas → ilustrativo y no atribuible; verificada vigente → verificado', () => {
  assert.strictEqual(P.productoResolver([], 'ejemplo-va', HOY).modo, 'generico');
  assert.strictEqual(P.productoResolver([ficha()], 'otro-producto', HOY).modo, 'generico');
  const r1 = P.productoResolver([ficha()], 'ejemplo-va', HOY); assert.strictEqual(r1.modo, 'ilustrativo'); assert.strictEqual(r1.atribuible, false); assert.deepStrictEqual(r1.costes, []);
  const r2 = P.productoResolver([ficha({ ilustrativo: true })], 'ejemplo-va', HOY); assert.strictEqual(r2.modo, 'ilustrativo'); assert(/ejemplo/.test(r2.aviso));
  const v = verificable(); P.productoCambiarEstado(v, 'pendiente_revision', 'a', 't'); P.productoCambiarEstado(v, 'verificado', 'a', 't');
  const r3 = P.productoResolver([ficha(), v], 'ejemplo-va', HOY); assert.strictEqual(r3.modo, 'verificado'); assert.strictEqual(r3.atribuible, true); assert.strictEqual(r3.costes.length, 1);
});
test('adaptador: entre varias versiones verificadas gana la vigente más reciente; una versión caducada se ignora', () => {
  const mk = (ver, desde, hasta, valor) => { const f = verificable({ version: ver, vigenteDesde: desde, vigenteHasta: hasta }); f.costes[0].valor = valor; P.productoCambiarEstado(f, 'pendiente_revision', 'a', 't'); P.productoCambiarEstado(f, 'verificado', 'a', 't'); return f; };
  const a = mk('2025', '2025-01-01', null, 1), b = mk('2026', '2026-06-01', null, 2), c = mk('2027', '2027-01-01', null, 3), d = mk('2024', '2024-01-01', '2024-12-31', 9);
  const r = P.productoResolver([a, d, c, b], 'ejemplo-va', HOY);
  assert.strictEqual(r.ficha.version, '2026'); assert.strictEqual(r.costes[0].valor, 2);
});
test('el adaptador no entrega la lista de costes original (no se puede alterar la ficha desde fuera)', () => {
  const v = verificable(); P.productoCambiarEstado(v, 'pendiente_revision', 'a', 't'); P.productoCambiarEstado(v, 'verificado', 'a', 't');
  const r = P.productoResolver([v], 'ejemplo-va', HOY); r.costes.pop(); assert.strictEqual(v.costes.length, 1);
});
test('la etiqueta solo atribuye cifras al proveedor cuando las condiciones están verificadas', () => {
  const v = verificable(); P.productoCambiarEstado(v, 'pendiente_revision', 'a', 't'); P.productoCambiarEstado(v, 'verificado', 'a', 't');
  assert(/verificadas de Proveedor de ejemplo/.test(P.productoEtiqueta(P.productoResolver([v], 'ejemplo-va', HOY))));
  ['ilustrativo', 'generico'].forEach((m) => { const e = P.productoEtiqueta({ modo: m }); assert(/Orientativo/.test(e) && !/Proveedor/.test(e)); });
});

console.log('\nComparación y explicación');
test('no se comparan como equivalentes productos con mecanismos distintos (renta, bauspar, fondos)', () => {
  assert.strictEqual(P.productoComparables('VA', 'VA').ok, true); assert.strictEqual(P.productoComparables('VA', 'VAESP').ok, false);
  assert.strictEqual(P.productoComparables('BASISRENTE', 'VA').ok, false); assert.strictEqual(P.productoComparables('BAUSPAR', 'BASISRENTE').ok, false);
  assert(/no se presentan como equivalentes/.test(P.productoComparables('BASISRENTE', 'VA').motivo)); assert.strictEqual(P.productoComparables('OTRO', 'OTRO').ok, false);
  assert.strictEqual(P.productoComparables('VA', 'NOEXISTE').ok, false);
});
test('descripción de un coste en lenguaje llano: valor, base, periodicidad, meses y si está pendiente', () => {
  const t = P.productoDescribirCoste(coste({ valor: 1.5, desdeMes: 1, hastaMes: 60 }));
  assert(/1,5 %/.test(t) && /cada prima bruta/.test(t) && /cada mes/.test(t) && /del mes 1 al 60/.test(t) && /pendiente de verificar/.test(t), t);
  assert(!/pendiente/.test(P.productoDescribirCoste(coste({ estado: 'verificado' }))));
  assert(/12 €/.test(P.productoDescribirCoste(coste({ unidad: 'eur', base: 'fijo', valor: 12, periodicidad: 'anual' }))));
  assert(/por determinar/.test(P.productoDescribirCoste(coste({ valor: null }))));
});

console.log('\nSeguridad de la biblioteca');
const reglas = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
const bloque = reglas.slice(reglas.indexOf('match /productosVersiones/{versionId}'));
test('las reglas de Firestore: lectura solo asesores aprobados o admin; escritura solo admin; nunca se borra; sin acceso público', () => {
  assert(bloque.length > 50, 'no está el bloque de productosVersiones');
  assert(/allow get, list: if isAdmin\(\) \|\| isAdvisor\(\);/.test(bloque));
  assert(/allow create: if isAdmin\(\)/.test(bloque) && /allow update: if isAdmin\(\)/.test(bloque) && /allow delete: if false;/.test(bloque));
  assert(!/if true/.test(bloque) && !/allow read:/.test(bloque));
  assert(/estado in \['borrador', 'pendiente_revision'\]/.test(bloque), 'una ficha no puede nacer verificada');
  assert(/ilustrativo == false/.test(reglas), 'la regla impide verificar una ilustrativa');
  assert(/resource\.data\.estado != 'obsoleto'/.test(bloque) && /costes == resource\.data\.costes/.test(bloque), 'obsoleta no se toca; verificada solo pasa a obsoleta');
});
test('las reglas de Firestore siguen con llaves y paréntesis equilibrados', () => {
  const codigo = reglas.replace(/\/\/.*$/gm, '');
  ['{}', '()', '[]'].forEach((p) => assert.strictEqual(codigo.split(p[0]).length, codigo.split(p[1]).length, 'desequilibrio en ' + p));
});
test('el módulo no incluye tarifas: ningún porcentaje ni importe de producto escrito en el código', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'productos.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert(!/\d+[.,]\d+\s*%/.test(src), 'hay un porcentaje con decimales en el código');
  assert(!/(generali|badenia)\s*[:=]/i.test(src), 'hay datos atribuidos a un proveedor concreto');
});
console.log('\n' + passed + ' correctas, ' + failed + ' fallidas'); process.exit(failed ? 1 : 0);
