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

console.log('\nContenido profesional, lista de control y guardado');
const completa = () => { const f = verificable(); const d = f.detalle;
  Object.assign(d.identificacion, { nombreContractual: 'N', aseguradora: 'A', codigoTarifa: 'T-1' }); Object.assign(d.funcionamiento, { garantias: 'g', exclusiones: 'e' });
  Object.assign(d.fiscalidad, { normativa: 'EStG', normativaVigencia: '2026-01-01' }); d.evaluacion.alternativas = 'alt';
  Object.assign(d.argumentacion, { nivel1: 'a', nivel2: 'b', nivel3: 'c' }); d.documentos.push({ tipo: 'Tarifunterlagen', titulo: 'Doc de ejemplo', referencia: '', fecha: '' });
  Object.assign(d.revision, { fecha: '2026-11-01', por: 'Admin' }); return f; };
test('una ficha vacía no cumple ningún punto de la lista de control; una completa los cumple todos', () => {
  const v = P.productoChecklist(P.productoNueva(), HOY); assert.strictEqual(v.listo, false); assert.strictEqual(v.total, 11); assert.strictEqual(v.items.filter((i) => i.ok).length, 0);
  const c = P.productoChecklist(completa(), HOY); assert.strictEqual(c.listo, true, c.items.filter((i) => !i.ok).map((i) => i.k).join(','));
});
test('cada punto de la lista falla por separado cuando falta lo suyo (costes sin fuente, vigencia vencida, fiscalidad sin fecha…)', () => {
  const falla = (mut, k) => { const f = completa(); mut(f); const i = P.productoChecklist(f, HOY).items.find((x) => x.k === k); assert.strictEqual(i.ok, false, k); };
  falla((f) => { f.costes[0].estado = 'pendiente'; }, 'costes'); falla((f) => { f.costes[0].fuente.documento = ''; }, 'costes'); falla((f) => { f.costes = []; }, 'costes');
  falla((f) => { f.vigenteHasta = '2026-01-31'; }, 'vigente'); falla((f) => { f.detalle.fiscalidad.normativaVigencia = ''; }, 'fiscalidad');
  falla((f) => { f.detalle.funcionamiento.exclusiones = '  '; }, 'exclusiones'); falla((f) => { f.detalle.argumentacion.nivel3 = ''; }, 'explicacion');
  falla((f) => { f.detalle.documentos = []; }, 'fuentes'); falla((f) => { f.detalle.revision.por = ''; }, 'revision'); falla((f) => { f.detalle.identificacion.codigoTarifa = ''; }, 'codigo');
});
test('verificar con la lista exigida bloquea una ficha incompleta y dice qué falta; la completa pasa', () => {
  const inc = verificable(); P.productoCambiarEstado(inc, 'pendiente_revision', 'a', 't');
  const r = P.productoCambiarEstado(inc, 'verificado', 'a', 't', { exigirChecklist: true, hoy: HOY }); assert.strictEqual(r.ok, false); assert(r.errores.some((x) => /lista de control/.test(x))); assert.strictEqual(inc.estado, 'pendiente_revision');
  const ok = completa(); P.productoCambiarEstado(ok, 'pendiente_revision', 'a', 't');
  const r2 = P.productoCambiarEstado(ok, 'verificado', 'a', 't', { exigirChecklist: true, hoy: HOY }); assert.strictEqual(r2.ok, true, r2.errores.join('|'));
});
test('normalizar completa una ficha antigua sin tocar lo que tiene y descarta valores que no son texto', () => {
  const f = P.productoNormalizar({ productoId: 'x', detalle: { funcionamiento: { garantias: 'ok', objetivo: 5 } , documentos: [null, { tipo: 'Otro', titulo: 'T' }] } });
  assert.strictEqual(f.detalle.funcionamiento.garantias, 'ok'); assert.strictEqual(f.detalle.funcionamiento.objetivo, ''); assert.strictEqual(f.detalle.documentos.length, 1);
  assert.strictEqual(P.productoNormalizar({}).detalle.identificacion.codigoTarifa, '');
});
test('la validación revisa el contenido: fechas mal escritas, textos que no lo son y tamaños desmedidos', () => {
  const f = ficha(); f.detalle.fiscalidad.normativaVigencia = '01/01/2026'; assert(P.productoValidar(f).some((x) => /fecha/.test(x)));
  const g = ficha(); g.detalle.funcionamiento.garantias = 'x'.repeat(8001); assert(P.productoValidar(g).some((x) => /demasiado largo/.test(x)));
  const h = ficha(); h.detalle.funcionamiento.garantias = 7; assert(P.productoValidar(h).some((x) => /debe ser texto/.test(x)));
  assert.deepStrictEqual(P.productoValidar(ficha()), []);
});
test('identificador del documento: minúsculas, sin acentos ni «/», y vacío si falta producto o versión', () => {
  assert.strictEqual(P.productoDocId({ productoId: 'Generali VA', version: '2026/Q1 é' }), 'generali-va_2026-q1-e'); assert.strictEqual(P.productoDocId({ productoId: 'x', version: '' }), '');
  assert.strictEqual(P.productoDocId({ productoId: '../x', version: '1' }).includes('/'), false);
});
test('lo que se guarda lleva SOLO las claves permitidas por las reglas y es estable (guardar dos veces da lo mismo)', () => {
  const reglas2 = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
  const lista = /request\.resource\.data\.keys\(\)\.hasOnly\(\[\s*'productoId'([\s\S]*?)\]\)/.exec(reglas2); assert(lista, 'no se encuentra la lista de claves');
  const permitidas = ("'productoId'" + lista[1]).match(/'([A-Za-z]+)'/g).map((x) => x.replace(/'/g, ''));
  const g = P.productoParaGuardar(Object.assign(completa(), { _createdAt: 1, id: 'x', _updated: 'z', extra: 1 }));
  Object.keys(g).forEach((k) => assert(permitidas.includes(k), 'clave no permitida por las reglas: ' + k));
  permitidas.filter((k) => !['createdAt', 'updatedAt'].includes(k)).forEach((k) => assert(k in g, 'falta la clave ' + k));
  assert.deepStrictEqual(P.productoParaGuardar(g), g);
});
test('la ficha verificada que pasa a obsoleta conserva exactamente costes, fuente y contenido (lo que exige la regla)', () => {
  const f = completa(); P.productoCambiarEstado(f, 'pendiente_revision', 'a', 't'); P.productoCambiarEstado(f, 'verificado', 'a', 't');
  const antes = P.productoParaGuardar(f); P.productoCambiarEstado(f, 'obsoleto', 'a', 't'); const despues = P.productoParaGuardar(f);
  assert.deepStrictEqual(despues.costes, antes.costes); assert.deepStrictEqual(despues.fuente, antes.fuente); assert.deepStrictEqual(despues.detalle, antes.detalle); assert.strictEqual(despues.estado, 'obsoleto');
});
test('las reglas incluyen el contenido profesional (detalle) y lo congelan en una ficha verificada', () => {
  const r = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
  assert(/'detalle'/.test(r)); assert(/detalle is map/.test(r)); assert(/detalle == resource\.data\.detalle/.test(r));
});

test('importar nunca verifica: entra como borrador, sin verificador, con costes pendientes y solo con las claves de contenido', () => {
  const raw = { productoId: 'imp-1', familia: 'VA', proveedor: 'P', nombre: 'N', version: '1', vigenteDesde: '2026-01-01', estado: 'verificado', verificadoPor: 'yo', verificadoEn: 'hoy',
    costes: [Object.assign(coste(), { estado: 'verificado' })], hackeo: 1, detalle: { funcionamiento: { objetivo: 'o', garantias: 5 } } };
  const f = P.productoDesdeImportacion(raw);
  assert.strictEqual(f.estado, 'borrador'); assert.strictEqual(f.verificadoPor, ''); assert.strictEqual(f.verificadoEn, ''); assert.strictEqual(f.costes[0].estado, 'pendiente');
  assert(!('hackeo' in f)); assert.strictEqual(f.detalle.funcionamiento.objetivo, 'o'); assert.strictEqual(f.detalle.funcionamiento.garantias, '');
  assert.strictEqual(P.productoDesdeImportacion(null).estado, 'borrador'); assert(P.productoValidar(P.productoDesdeImportacion([])).length > 0);
});
test('las familias de productos.js coinciden con las que acepta la regla de Firestore', () => {
  const r = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
  const m = /familia in \[([^\]]*)\]/.exec(r); assert(m); const enRegla = m[1].match(/'([A-Z_]+)'/g).map((x) => x.replace(/'/g, '')).sort();
  assert.deepStrictEqual(Object.keys(P.PRODUCTO_FAMILIAS).sort(), enRegla);
});
console.log('\nExplicar al cliente');
const x0 = (f) => P.productoExplicarCliente(f, HOY), txt = (f) => P.productoExplicarTexto(x0(f));
test('cada tipo de coste tiene su explicación en lenguaje llano y cualquier otro cae en «otro coste»; todas avisan de que el importe depende del contrato', () => {
  P.PRODUCTO_TIPOS_COSTE.forEach((t) => { assert(P.PRODUCTO_COSTE_LLANO[t] && P.PRODUCTO_COSTE_LLANO[t].t && P.PRODUCTO_COSTE_LLANO[t].d.length > 20, t); const e = P.productoExplicarCoste(coste({ tipo: t })); assert(/dependen del contrato concreto/.test(e.texto), t); assert(!/Abschluss|Vertriebs|Verwaltung|Fondskosten|Risikobeitr/.test(e.titulo), 'el título debe ir en lenguaje llano: ' + e.titulo); });
  assert.strictEqual(P.productoExplicarCoste(coste({ tipo: 'inventado' })).titulo, 'Otro coste del contrato');
});
test('el importe de cada coste sale tal como está cargado (valor, base, periodicidad y meses) y no se añade ninguna otra cifra', () => {
  const e = P.productoExplicarCoste(coste({ valor: 1.5, desdeMes: 1, hastaMes: 60 }));
  assert(/1,5 % de cada prima bruta, cada mes, del mes 1 al 60/.test(e.texto), e.texto);
  assert(/12 €, cada año, desde el mes 1/.test(P.productoExplicarCoste(coste({ unidad: 'eur', base: 'fijo', valor: 12, periodicidad: 'anual' })).texto));
  const cifras = (t) => (t.match(/\d+(?:,\d+)?/g) || []).sort().join('|');
  assert.strictEqual(cifras(P.productoExplicarCoste(coste({ valor: 1.5, desdeMes: 1, hastaMes: 60, concepto: 'X' })).texto), ['1,5', '1', '60'].sort().join('|'), 'solo las cifras de la ficha');
  assert(/por determinar/.test(P.productoExplicarCoste(coste({ valor: null })).texto));
});
test('todos los costes cargados aparecen en la explicación (ninguno se oculta) y los no verificados lo dicen; sin costes se dice que faltan', () => {
  const f = ficha({ costes: [coste({ id: 'a', tipo: 'abschlusskosten', valor: 2 }), coste({ id: 'b', tipo: 'risikobeitrag', valor: 3, estado: 'verificado', fuente: { documento: 'Doc', referencia: '' } }), coste({ id: 'c', tipo: 'fondskosten', valor: 0.5 })] });
  const x = x0(f); assert.strictEqual(x.costes.length, 3); assert.deepStrictEqual(x.costes.map((c) => c.verificado), [false, true, false]);
  assert.strictEqual(x.costes.filter((c) => /no está verificado y puede cambiar/.test(c.texto)).length, 2); assert(/Doc/.test(txt(f)));
  const s = x0(ficha({ costes: [] })); assert.strictEqual(s.sinCostes, true); assert(/Todavía no hay costes cargados/.test(P.productoExplicarTexto(s)));
});
test('aviso de uso: ficha verificada y vigente → con sus condiciones verificadas; borrador/pendiente/obsoleta → versión de trabajo, no entregar; ilustrativa → importes de ejemplo', () => {
  const v = completa(); P.productoCambiarEstado(v, 'pendiente_revision', 'a', 't'); P.productoCambiarEstado(v, 'verificado', 'a', 't');
  const xv = x0(v); assert.strictEqual(xv.usable, true); assert(/condiciones verificadas de Proveedor de ejemplo/.test(xv.avisoUso));
  const b = x0(ficha()); assert.strictEqual(b.usable, false); assert(/ATENCIÓN/.test(b.avisoUso) && /no debe entregarse al cliente/.test(b.avisoUso) && /Borrador/.test(b.avisoUso));
  assert(/EJEMPLO/.test(x0(ficha({ ilustrativo: true })).avisoUso)); const o = completa(); P.productoCambiarEstado(o, 'pendiente_revision', 'a', 't'); P.productoCambiarEstado(o, 'verificado', 'a', 't'); P.productoCambiarEstado(o, 'obsoleto', 'a', 't');
  assert.strictEqual(x0(o).usable, false); assert(/Obsoleto/.test(x0(o).avisoUso));
  assert(/ATENCIÓN/.test(txt(ficha())), 'el aviso viaja dentro del texto copiado');
});
test('limitaciones, exclusiones y garantías nunca se omiten: si están escritas salen tal cual y si faltan se dice que faltan', () => {
  const f = completa(); f.detalle.funcionamiento.exclusiones = 'No cubre X.'; f.detalle.evaluacion.limitaciones = 'Tiene la limitación Y.'; f.detalle.funcionamiento.garantias = 'Garantiza Z según contrato.';
  const t = txt(f); assert(/No cubre X\./.test(t) && /limitación Y/.test(t) && /Garantiza Z según contrato/.test(t));
  const vacia = x0(ficha()); ['Garantías', 'Exclusiones', 'Lo que debes tener en cuenta', 'Impuestos'].forEach((n) => { const b = vacia.bloques.find((y) => y.titulo === n); assert(b && b.pendiente && b.texto === P.PRODUCTO_PENDIENTE_CLIENTE, n); });
});
test('siempre incluye los avisos generales: orientativo, no garantizado, la documentación contractual manda y no es una recomendación; la fiscalidad dice que depende de la situación personal', () => {
  const t = txt(ficha()); assert(/no constituyen una oferta/.test(t) && /no están garantizados/.test(t) && /documentación contractual/.test(t) && /no es una recomendación personalizada/.test(t));
  const f = completa(); f.detalle.fiscalidad.aportaciones = 'Deducibles dentro del límite.'; assert(/Depende de tu situación personal/.test(txt(f)) && /vigente a 2026-01-01/.test(txt(f)));
});
test('la explicación es reproducible, no modifica la ficha y las fuentes y documentos que existen se listan', () => {
  const f = completa(), copia = JSON.stringify(f); assert.strictEqual(txt(f), txt(f)); assert.strictEqual(JSON.stringify(f), copia);
  assert(/Tarifunterlagen — Doc de ejemplo/.test(txt(f)));
});
test('solo texto: lo que haya escrito el admin se devuelve como texto sin interpretar (el escape lo hace la pantalla); la función no devuelve HTML propio', () => {
  const f = completa(); f.detalle.argumentacion.nivel1 = '<script>alert(1)</script>'; const x = x0(f); assert.strictEqual(x.bloques[0].texto, '<script>alert(1)</script>');
  const centro = fs.readFileSync(path.join(__dirname, '..', 'centro.js'), 'utf8'); assert(/function panelExplicar/.test(centro) && /esc\(b\.texto\)/.test(centro) && /esc\(x\.avisoUso\)/.test(centro), 'la pantalla debe escapar el texto de la ficha');
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
