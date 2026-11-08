/* Centro del Asesor — Fase 2: estructura de la biblioteca de productos y sus versiones (costes y condiciones).
   Motor puro, sin DOM y SIN TARIFAS. Aquí no hay ni una cifra de Generali, Badenia ni de ningún otro proveedor: solo la forma de una ficha,
   sus estados y las reglas que impiden presentar como «verificado» algo que no lo está. Los datos reales viven en Firestore
   (colección «productosVersiones», legible solo por asesores aprobados; ver firestore.rules) y nunca en ficheros de este repositorio,
   que son públicos.

   Una ficha = UNA versión de UN producto (las condiciones cambian: cada cambio es otra versión, la anterior pasa a «obsoleto»).
   Estados:  borrador → pendiente_revision → verificado → obsoleto
   Solo una ficha verificada, vigente, no ilustrativa y válida puede alimentar una proyección identificada como específica de un proveedor.
   Cualquier otra cosa se calcula con parámetros genéricos y la pantalla debe decirlo (ver productoResolver).

   Cada coste lleva: tipo, valor, unidad, base de cálculo, periodicidad, meses de aplicación, fuente y estado de verificación. */

var PRODUCTO_ESTADOS=['borrador','pendiente_revision','verificado','obsoleto'];
var PRODUCTO_ESTADOS_ES={borrador:'Borrador',pendiente_revision:'Pendiente de revisión',verificado:'Verificado',obsoleto:'Obsoleto'};
// Transiciones permitidas. «obsoleto» es final; una ficha verificada no se edita: se crea otra versión (solo puede pasar a obsoleto).
var PRODUCTO_TRANSICIONES={borrador:['pendiente_revision'],pendiente_revision:['borrador','verificado'],verificado:['obsoleto'],obsoleto:[]};

// Cada familia tiene su propio mecanismo económico: NO se mezclan en una misma fórmula ni se presentan como equivalentes.
var PRODUCTO_FAMILIAS={
  VA:        {nombre:'Vermögensaufbau (ahorro en fondos)',            mecanismo:'fondos',               finalidad:'ahorro flexible'},
  VAESP:     {nombre:'Ahorro en fondos con protección',               mecanismo:'fondos_con_proteccion',finalidad:'ahorro con protección'},
  BASISRENTE:{nombre:'Basisrente (Rürup)',                            mecanismo:'renta',                finalidad:'jubilación'},
  BAUSPAR:   {nombre:'Bausparvertrag',                                mecanismo:'bauspar',              finalidad:'vivienda'},
  OTRO:      {nombre:'Otro producto (requiere definir su mecanismo)', mecanismo:'otro',                 finalidad:'por definir'}
};
var PRODUCTO_TIPOS_COSTE=['abschlusskosten','vertriebskosten','verwaltungskosten','fondskosten','risikobeitrag','zuzahlung','fondswechsel','teilentnahme','otro'];
var PRODUCTO_TIPOS_COSTE_ES={abschlusskosten:'Costes de contratación (Abschlusskosten)',vertriebskosten:'Costes de distribución (Vertriebskosten)',
  verwaltungskosten:'Costes de administración (Verwaltungskosten)',fondskosten:'Gastos de los fondos (Fondskosten)',risikobeitrag:'Primas de riesgo (Risikobeiträge)',
  zuzahlung:'Costes en aportaciones extra (Zuzahlungen)',fondswechsel:'Costes de cambio de fondos (Fondswechsel)',teilentnahme:'Costes de retiradas parciales (Teilentnahmen)',otro:'Otro coste contractual'};
var PRODUCTO_UNIDADES=['pct','permille','eur'];                    // % · ‰ · euros
var PRODUCTO_BASES=['prima_bruta','prima_anual','suma_aportada','capital_acumulado','suma_asegurada','operacion','fijo'];
var PRODUCTO_BASES_ES={prima_bruta:'cada prima bruta',prima_anual:'la prima anual',suma_aportada:'la suma total aportada',capital_acumulado:'el capital acumulado',
  suma_asegurada:'la suma asegurada',operacion:'el importe de la operación',fijo:'importe fijo'};
var PRODUCTO_PERIODICIDADES=['unica','mensual','anual','por_operacion'];
var PRODUCTO_PERIODICIDADES_ES={unica:'una sola vez',mensual:'cada mes',anual:'cada año',por_operacion:'en cada operación'};
var PRODUCTO_ESTADOS_COSTE=['pendiente','verificado'];

var _fechaRE=/^\d{4}-\d{2}-\d{2}$/;
function _esFecha(s){ if(typeof s!=='string'||!_fechaRE.test(s)) return false; var d=new Date(s+'T00:00:00Z'); return !isNaN(d.getTime())&&d.toISOString().slice(0,10)===s; }
function _txt(x){ return typeof x==='string'?x.trim():''; }
function _num(x){ return (typeof x==='number'&&isFinite(x))?x:null; }

// Una ficha nueva no inventa nada: sin costes, sin fuente, sin verificar.
function productoNueva(o){
  o=o||{};
  return {productoId:_txt(o.productoId),familia:o.familia||'OTRO',proveedor:_txt(o.proveedor),nombre:_txt(o.nombre),version:_txt(o.version),
    estado:'borrador',ilustrativo:!!o.ilustrativo,vigenteDesde:o.vigenteDesde||'',vigenteHasta:o.vigenteHasta||null,
    fuente:{documento:'',referencia:'',fecha:''},costes:[],notas:'',verificadoPor:'',verificadoEn:''};
}
function productoCosteNuevo(o){
  o=o||{};
  return {id:_txt(o.id),tipo:o.tipo||'otro',concepto:_txt(o.concepto),valor:(o.valor==null?null:o.valor),unidad:o.unidad||'pct',base:o.base||'prima_bruta',
    periodicidad:o.periodicidad||'mensual',desdeMes:o.desdeMes==null?1:o.desdeMes,hastaMes:o.hastaMes==null?null:o.hastaMes,
    fuente:{documento:_txt(o.fuente&&o.fuente.documento),referencia:_txt(o.fuente&&o.fuente.referencia)},estado:o.estado||'pendiente'};
}

// Valida la FORMA de una ficha (lo que se comprueba siempre) y devuelve la lista de errores en español; vacía = correcta.
// Si la ficha está «verificada» exige además todo lo que justifica esa palabra.
function productoValidar(f){
  var e=[]; if(!f||typeof f!=='object') return ['La ficha no existe.'];
  if(_txt(f.productoId).length<2) e.push('Falta el identificador del producto.');
  if(!PRODUCTO_FAMILIAS[f.familia]) e.push('La familia del producto no es válida.');
  if(!_txt(f.proveedor)) e.push('Falta el proveedor.');
  if(!_txt(f.nombre)) e.push('Falta el nombre del producto.');
  if(!_txt(f.version)) e.push('Falta la versión contractual.');
  if(PRODUCTO_ESTADOS.indexOf(f.estado)<0) e.push('El estado de la ficha no es válido.');
  if(!_esFecha(f.vigenteDesde)) e.push('Falta la fecha desde la que rige (AAAA-MM-DD).');
  if(f.vigenteHasta!=null&&!_esFecha(f.vigenteHasta)) e.push('La fecha de fin de vigencia no es válida (AAAA-MM-DD).');
  if(_esFecha(f.vigenteDesde)&&_esFecha(f.vigenteHasta)&&f.vigenteHasta<f.vigenteDesde) e.push('La vigencia termina antes de empezar.');
  if(!Array.isArray(f.costes)) { e.push('La lista de costes no es válida.'); return e; }
  if(f.costes.length>60) e.push('Demasiados conceptos de coste (máximo 60).');
  var ids={};
  f.costes.forEach(function(c,i){
    var n='Coste '+(i+1)+(c&&c.concepto?' («'+c.concepto+'»)':'')+': ';
    if(!c||typeof c!=='object'){ e.push(n+'no es válido.'); return; }
    if(!_txt(c.id)) e.push(n+'falta el identificador.'); else if(ids[c.id]) e.push(n+'el identificador está repetido.'); else ids[c.id]=1;
    if(PRODUCTO_TIPOS_COSTE.indexOf(c.tipo)<0) e.push(n+'el tipo no es válido.');
    if(PRODUCTO_UNIDADES.indexOf(c.unidad)<0) e.push(n+'la unidad no es válida.');
    if(PRODUCTO_BASES.indexOf(c.base)<0) e.push(n+'la base de cálculo no es válida.');
    if(PRODUCTO_PERIODICIDADES.indexOf(c.periodicidad)<0) e.push(n+'la periodicidad no es válida.');
    var v=_num(c.valor);
    if(v===null||v<0) e.push(n+'el valor debe ser un número no negativo.');
    else if(c.unidad==='pct'&&v>100) e.push(n+'un porcentaje no puede superar el 100 %.');
    else if(c.unidad==='permille'&&v>1000) e.push(n+'un valor en ‰ no puede superar 1000.');
    if(c.unidad==='eur'&&c.base!=='fijo'&&c.base!=='operacion'&&c.base!=='prima_bruta') e.push(n+'un importe en euros solo es coherente con base fija, por operación o por prima.');
    if((c.unidad==='pct'||c.unidad==='permille')&&c.base==='fijo') e.push(n+'un importe fijo no puede ser un porcentaje.');
    if(!(Number.isInteger(c.desdeMes)&&c.desdeMes>=1)) e.push(n+'el mes de inicio debe ser un entero desde 1.');
    if(c.hastaMes!=null&&!(Number.isInteger(c.hastaMes)&&c.hastaMes>=c.desdeMes)) e.push(n+'el mes de fin no puede ser anterior al de inicio.');
    if(PRODUCTO_ESTADOS_COSTE.indexOf(c.estado)<0) e.push(n+'el estado del coste no es válido.');
  });
  if(f.estado==='verificado') productoRequisitosVerificado(f).forEach(function(x){ e.push(x); });
  return e;
}
// Lo que tiene que cumplir una ficha para llamarse «verificada». Se usa también para decir qué falta antes de poder verificarla.
function productoRequisitosVerificado(f){
  var e=[]; if(!f) return ['La ficha no existe.'];
  if(f.ilustrativo) e.push('Una ficha ilustrativa (importes de ejemplo) no puede verificarse.');
  if(!f.fuente||!_txt(f.fuente.documento)) e.push('Falta el documento fuente de la ficha.');
  if(!f.fuente||!_esFecha(f.fuente.fecha)) e.push('Falta la fecha del documento fuente (AAAA-MM-DD).');
  if(!_txt(f.verificadoPor)) e.push('Falta quién verifica la ficha.');
  if(!_txt(f.verificadoEn)) e.push('Falta cuándo se verifica la ficha.');
  if(!Array.isArray(f.costes)||!f.costes.length) e.push('Una ficha verificada necesita al menos un concepto de coste.');
  (f.costes||[]).forEach(function(c,i){
    var n='Coste '+(i+1)+(c&&c.concepto?' («'+c.concepto+'»)':'')+': ';
    if(!c) return;
    if(c.estado!=='verificado') e.push(n+'no está verificado.');
    if(!_txt(c.fuente&&c.fuente.documento)) e.push(n+'falta su fuente documental.');
  });
  return e;
}
// Cambio de estado: aplica la transición solo si está permitida y, para verificar, si se cumplen todos los requisitos. Devuelve {ok, errores}.
function productoCambiarEstado(f,nuevo,quien,ahora){
  if(PRODUCTO_ESTADOS.indexOf(nuevo)<0) return {ok:false,errores:['Estado desconocido.']};
  if((PRODUCTO_TRANSICIONES[f.estado]||[]).indexOf(nuevo)<0) return {ok:false,errores:['No se puede pasar de «'+PRODUCTO_ESTADOS_ES[f.estado]+'» a «'+PRODUCTO_ESTADOS_ES[nuevo]+'».']};
  if(nuevo==='verificado'){
    var prueba=JSON.parse(JSON.stringify(f)); prueba.estado='verificado'; prueba.verificadoPor=_txt(quien); prueba.verificadoEn=ahora||'';
    var err=productoValidar(prueba); if(err.length) return {ok:false,errores:err};
    f.verificadoPor=prueba.verificadoPor; f.verificadoEn=prueba.verificadoEn;
  }
  f.estado=nuevo; return {ok:true,errores:[]};
}
// ¿Está vigente en esa fecha (AAAA-MM-DD)? Una ficha obsoleta nunca lo está.
function productoVigente(f,hoy){
  if(!f||f.estado==='obsoleto'||!_esFecha(f.vigenteDesde)||!_esFecha(hoy)) return false;
  return f.vigenteDesde<=hoy&&(f.vigenteHasta==null||f.vigenteHasta>=hoy);
}
// ¿Puede esta ficha alimentar una proyección identificada como del proveedor? Solo si es verificada, vigente, no ilustrativa y válida.
function productoUsable(f,hoy){
  if(!f) return {ok:false,motivo:'sin_ficha'};
  if(f.ilustrativo) return {ok:false,motivo:'ilustrativa'};
  if(f.estado!=='verificado') return {ok:false,motivo:'no_verificada'};
  if(!productoVigente(f,hoy)) return {ok:false,motivo:'no_vigente'};
  if(productoValidar(f).length) return {ok:false,motivo:'invalida'};
  return {ok:true,motivo:''};
}
// Adaptador de costes: dado el conjunto de fichas y un producto, decide con qué se puede calcular y cómo debe etiquetarse el resultado.
//   modo 'verificado'  → hay una versión verificada y vigente: se usan sus costes y se puede decir «con las condiciones de X».
//   modo 'ilustrativo' → solo hay fichas de ejemplo o sin verificar: se puede mostrar un cálculo, pero NUNCA atribuido al proveedor.
//   modo 'generico'    → no hay ficha: parámetros genéricos del modelo.
// Entre varias versiones verificadas y vigentes gana la que rige desde más reciente.
function productoResolver(fichas,productoId,hoy){
  var propias=(fichas||[]).filter(function(f){ return f&&f.productoId===productoId; });
  var ok=propias.filter(function(f){ return productoUsable(f,hoy).ok; }).sort(function(a,b){ return a.vigenteDesde<b.vigenteDesde?1:a.vigenteDesde>b.vigenteDesde?-1:0; });
  if(ok.length) return {modo:'verificado',ficha:ok[0],costes:JSON.parse(JSON.stringify(ok[0].costes)),atribuible:true,aviso:''};
  if(propias.length){
    var motivo=propias.some(function(f){ return f.ilustrativo; })?'Hay solo fichas con importes de ejemplo.':'Ninguna versión está verificada y vigente.';
    return {modo:'ilustrativo',ficha:null,costes:[],atribuible:false,aviso:motivo+' El cálculo no puede presentarse como del proveedor.'};
  }
  return {modo:'generico',ficha:null,costes:[],atribuible:false,aviso:'No hay ficha de este producto: se usan parámetros genéricos del modelo.'};
}
// Etiqueta corta que debe acompañar a cualquier cifra que salga de un producto.
function productoEtiqueta(res){
  if(res.modo==='verificado'){ var f=res.ficha; return 'Con las condiciones verificadas de '+f.proveedor+' · '+f.nombre+' (versión '+f.version+', fuente: '+f.fuente.documento+')'; }
  return 'Orientativo: no usa condiciones verificadas de ningún proveedor';
}
// ¿Pueden compararse dos productos como alternativas equivalentes? Solo si comparten mecanismo económico; si no, se explica por qué no.
function productoComparables(famA,famB){
  var a=PRODUCTO_FAMILIAS[famA], b=PRODUCTO_FAMILIAS[famB];
  if(!a||!b) return {ok:false,motivo:'Familia desconocida.'};
  if(a.mecanismo!=='otro'&&a.mecanismo===b.mecanismo) return {ok:true,motivo:''};
  return {ok:false,motivo:'«'+a.nombre+'» ('+a.finalidad+') y «'+b.nombre+'» ('+b.finalidad+') tienen mecanismos y finalidades distintos: no se presentan como equivalentes.'};
}
// Descripción en lenguaje llano de un coste, para el asesor y para «Explicar al cliente». No oculta nada: incluye valor, base, periodicidad y meses.
function productoDescribirCoste(c){
  var v=_num(c.valor); if(v===null) return (PRODUCTO_TIPOS_COSTE_ES[c.tipo]||c.tipo)+': valor por determinar.';
  var num=String(v).replace('.',','), val=c.unidad==='pct'?num+' %':c.unidad==='permille'?num+' ‰':num+' €';
  var base=c.unidad==='eur'&&c.base==='fijo'?'':' de '+(PRODUCTO_BASES_ES[c.base]||c.base);
  var cuando=c.hastaMes==null?'desde el mes '+c.desdeMes:'del mes '+c.desdeMes+' al '+c.hastaMes;
  return (PRODUCTO_TIPOS_COSTE_ES[c.tipo]||c.tipo)+': '+val+base+', '+(PRODUCTO_PERIODICIDADES_ES[c.periodicidad]||c.periodicidad)+', '+cuando
    +(c.estado==='verificado'?'':' (pendiente de verificar)')+'.';
}

if(typeof module!=='undefined'&&module.exports){ module.exports={PRODUCTO_ESTADOS,PRODUCTO_ESTADOS_ES,PRODUCTO_TRANSICIONES,PRODUCTO_FAMILIAS,PRODUCTO_TIPOS_COSTE,PRODUCTO_UNIDADES,PRODUCTO_BASES,
  PRODUCTO_PERIODICIDADES,productoNueva,productoCosteNuevo,productoValidar,productoRequisitosVerificado,productoCambiarEstado,productoVigente,productoUsable,productoResolver,
  productoEtiqueta,productoComparables,productoDescribirCoste}; }
