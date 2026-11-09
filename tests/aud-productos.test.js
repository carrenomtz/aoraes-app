/* AOR-CAT-001/002/003 — catálogo de productos (productos.js se ejecuta de verdad) */
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path');
const P=require('../productos.js'), root=path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const HOY='2026-11-09';
function ficha(o={}){
  const f=P.productoNueva(Object.assign({productoId:'basis-x',familia:'BASISRENTE',proveedor:'Prov',nombre:'Basis X',version:'2026-01',vigenteDesde:'2026-01-01'},o));
  f.fuente={documento:'Vorschlag 2026-01',referencia:'p.3',fecha:'2026-01-15'};
  f.costes=[P.productoCosteNuevo({id:'c1',tipo:'abschlusskosten',concepto:'Abschluss',valor:2.5,unidad:'pct',base:'prima_bruta',estado:'verificado',fuente:{documento:'PIB'}})];
  return f;
}
const verificar=(f,quien='Revisor')=>{ const r=P.productoCambiarEstado(f,'pendiente_revision'); assert.ok(r.ok); const v=P.productoCambiarEstado(f,'verificado',quien,'2026-02-01'); return v; };

test('CAT-001: una ficha nueva no inventa nada (sin costes, sin fuente, borrador) y no es utilizable',()=>{
  const f=P.productoNueva({productoId:'x1',familia:'VA',proveedor:'P',nombre:'N',version:'1',vigenteDesde:'2026-01-01'});
  assert.equal(f.estado,'borrador'); assert.equal(f.costes.length,0); assert.equal(P.productoUsable(f,HOY).ok,false);
});
test('CAT-001: verificar exige fuente, costes verificados con documento, verificador y que no sea ilustrativa',()=>{
  const sin=ficha(); sin.fuente.documento=''; P.productoCambiarEstado(sin,'pendiente_revision'); assert.equal(P.productoCambiarEstado(sin,'verificado','R','2026-02-01').ok,false);
  const sinCoste=ficha(); sinCoste.costes=[]; P.productoCambiarEstado(sinCoste,'pendiente_revision'); assert.equal(P.productoCambiarEstado(sinCoste,'verificado','R','2026-02-01').ok,false);
  const costePend=ficha(); costePend.costes[0].estado='pendiente'; P.productoCambiarEstado(costePend,'pendiente_revision'); assert.equal(P.productoCambiarEstado(costePend,'verificado','R','2026-02-01').ok,false);
  const ilus=ficha({ilustrativo:true}); P.productoCambiarEstado(ilus,'pendiente_revision'); assert.equal(P.productoCambiarEstado(ilus,'verificado','R','2026-02-01').ok,false);
  const sinQuien=ficha(); P.productoCambiarEstado(sinQuien,'pendiente_revision'); assert.equal(P.productoCambiarEstado(sinQuien,'verificado','','2026-02-01').ok,false);
  const ok=ficha(); assert.ok(verificar(ok).ok); assert.equal(ok.estado,'verificado');
});
test('CAT-001: transiciones — no se salta de borrador a verificado; verificado solo pasa a obsoleto; obsoleto es final',()=>{
  const f=ficha(); assert.equal(P.productoCambiarEstado(f,'verificado','R','2026-02-01').ok,false);
  verificar(f); assert.equal(P.productoCambiarEstado(f,'borrador').ok,false); assert.equal(P.productoCambiarEstado(f,'pendiente_revision').ok,false);
  assert.ok(P.productoCambiarEstado(f,'obsoleto').ok); assert.equal(P.productoCambiarEstado(f,'verificado','R','2026-02-01').ok,false);
});
test('CAT-001: utilizable solo si verificada + vigente + no ilustrativa + válida (obsoleta, fuera de vigencia, futura)',()=>{
  const f=ficha(); verificar(f); assert.deepEqual(P.productoUsable(f,HOY),{ok:true,motivo:''});
  assert.equal(P.productoUsable(f,'2025-12-31').motivo,'no_vigente');           // aún no rige
  const caduca=ficha({vigenteHasta:'2026-06-30'}); verificar(caduca); assert.equal(P.productoUsable(caduca,HOY).motivo,'no_vigente');
  assert.equal(P.productoUsable(caduca,'2026-06-30').ok,true);                   // el último día sigue vigente
  const obs=ficha(); verificar(obs); P.productoCambiarEstado(obs,'obsoleto'); assert.equal(P.productoUsable(obs,HOY).ok,false);
  assert.equal(P.productoUsable(null,HOY).motivo,'sin_ficha'); assert.equal(P.productoUsable(ficha(),HOY).motivo,'no_verificada');
});
test('CAT-001: la fuente de la ficha no se puede quitar tras verificar (validación del módulo)',()=>{
  const f=ficha(); verificar(f); f.fuente.documento=''; assert.ok(P.productoValidar(f).length>0); assert.equal(P.productoUsable(f,HOY).motivo,'invalida');
});
test('CAT-002: productoResolver — verificado/ilustrativo/genérico y etiqueta; entre varias versiones vigentes gana la más reciente',()=>{
  const a=ficha({version:'2025-01',vigenteDesde:'2025-01-01'}); verificar(a); const b=ficha({version:'2026-01',vigenteDesde:'2026-01-01'}); verificar(b);
  const r=P.productoResolver([a,b],'basis-x',HOY); assert.equal(r.modo,'verificado'); assert.equal(r.ficha.version,'2026-01'); assert.equal(r.atribuible,true);
  assert.match(P.productoEtiqueta(r),/condiciones verificadas de Prov/);
  const borr=ficha(); const ri=P.productoResolver([borr],'basis-x',HOY); assert.equal(ri.modo,'ilustrativo'); assert.equal(ri.atribuible,false); assert.equal(ri.costes.length,0);
  const rg=P.productoResolver([],'basis-x',HOY); assert.equal(rg.modo,'generico'); assert.equal(rg.atribuible,false);
  assert.match(P.productoEtiqueta(rg),/^Orientativo/);
  assert.equal(P.productoResolver([a,b],'otro-id',HOY).modo,'generico');            // producto inexistente: nunca la ficha de otro
});
test('CAT-002: se puede pedir una VERSIÓN contractual concreta (contrato firmado con una generación anterior)',()=>{
  const a=ficha({version:'2025-01',vigenteDesde:'2025-01-01',vigenteHasta:'2025-12-31'}); verificar(a); const b=ficha({version:'2026-01',vigenteDesde:'2026-01-01'}); verificar(b);
  assert.equal(P.productoResolver([a,b],'basis-x',HOY,{version:'2026-01'}).ficha.version,'2026-01');
  assert.equal(P.productoResolver([a,b],'basis-x','2025-06-01',{version:'2025-01'}).ficha.version,'2025-01');
  // la versión pedida no es utilizable (caducada hoy): NO se cae silenciosamente a la versión nueva
  const r=P.productoResolver([a,b],'basis-x',HOY,{version:'2025-01'}); assert.equal(r.atribuible,false); assert.notEqual(r.modo,'verificado');
  // sin opts el comportamiento es el de siempre
  assert.equal(P.productoResolver([a,b],'basis-x',HOY).ficha.version,'2026-01');
});
test('CAT-002 (hallazgo): ningún motor de cálculo consulta el catálogo; usan cifras fijas del código',()=>{
  for(const f of ['jubilacion.html','plan-futuro.html','vsp.html','analisis.html','inmueble.js','calc.js']) assert.ok(!/productoResolver|productoUsable|AORAES_PRODUCTOS/.test(read(f)),f);
});
test('CAT-003: familias con mecanismos distintos no son comparables (Basisrente≠Riester≠bAV≠Bauspar≠ETF); la misma familia sí; OTRO nunca',()=>{
  const c=(a,b)=>P.productoComparables(a,b).ok;
  assert.equal(c('BASISRENTE','BASISRENTE'),true); assert.equal(c('RIESTER','RIESTER'),true);
  [['BASISRENTE','RIESTER'],['BASISRENTE','BAV'],['VA','BASISRENTE'],['BAUSPAR','INVERSION'],['PROTECCION','VA'],['OTRO','OTRO'],['VA','NOEXISTE']].forEach(([a,b])=>assert.equal(c(a,b),false,a+'/'+b));
});
