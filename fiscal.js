/* Perfil fiscal para el proyecto inmobiliario — Fase 2 (exploratoria) de la especificación del módulo fiscal.
   Motor puro, sin DOM: modelo de datos con estados por campo, reutilización de datos del análisis financiero SOLO con permiso registrado,
   cuestionario de cuatro preguntas, nivel de datos y lista de pendientes.

   ESTA FASE NO CALCULA NINGÚN IMPUESTO. No hay tarifas, tipos, AfA ni reglas fiscales aquí: eso va en un registro versionado y verificado
   por ejercicio (Fase 3) y exige validación de un Steuerberater. Lo único «fiscal» es qué datos hacen falta y cómo se guardan.

   Estados de un campo (nunca se mezclan «no existe», «desconocido» y «cero»):
     desconocido   no se sabe: value = null (cero es un valor distinto: value = 0 y estado proporcionado)
     no_aplica     no corresponde a este caso (p. ej. pareja en un hogar de una persona)
     proporcionado hay un valor, dicho por el asesor o traído del análisis, todavía sin confirmar
     confirmado    el valor se ha revisado y confirmado expresamente
   Cada campo guarda además fuente, ejercicio, fechas, confianza y el historial de valores (el original no se sobrescribe en silencio). */

var FISCAL_VERSION=1;
var FISCAL_FINALIDAD='simulacion_fiscal_inmobiliaria';
var FISCAL_ESTADOS=['desconocido','no_aplica','proporcionado','confirmado'];
var FISCAL_FUENTES=['manual','analisis_financiero','steuerbescheid','nómina','otra'];
var FISCAL_CONFIANZAS=['high','medium','low','unknown'];

// Nombres de los 16 Bundesländer (solo nombres: sin tipos ni porcentajes).
var FISCAL_BUNDESLAENDER=['Baden-Württemberg','Bayern','Berlin','Brandenburg','Bremen','Hamburg','Hessen','Mecklenburg-Vorpommern','Niedersachsen',
  'Nordrhein-Westfalen','Rheinland-Pfalz','Saarland','Sachsen','Sachsen-Anhalt','Schleswig-Holstein','Thüringen'];
var FISCAL_STATUS_CIVIL=['single','married','registered_partnership','divorced','widowed','other'];
var FISCAL_STATUS_CIVIL_ES={single:'Soltero/a',married:'Casado/a',registered_partnership:'Pareja de hecho',divorced:'Divorciado/a',widowed:'Viudo/a',other:'Otro'};
var FISCAL_USOS=['owner_occupied','rented_out','mixed_use','temporary_vacant_or_future_rental','other'];
var FISCAL_USOS_ES={owner_occupied:'Vivir en ella (Eigennutzung)',rented_out:'Alquilarla a terceros (Vermietung)',mixed_use:'Vivir en una parte y alquilar otra (Mischnutzung)',
  temporary_vacant_or_future_rental:'Vacía temporalmente o para alquilar más adelante',other:'Otro uso (requiere revisión)'};
var FISCAL_MODOS_DOC=['steuerbescheid','zve','sin_documento','continuar_sin'];
var FISCAL_MODOS_DOC_ES={steuerbescheid:'Sí, puedo introducir los datos principales del Steuerbescheid',zve:'Conozco mi zu versteuerndes Einkommen',
  sin_documento:'No lo tengo; usar mis datos de ingresos para una primera estimación',continuar_sin:'Prefiero continuar sin incorporar documentos'};
var FISCAL_CLASES=['I','II','III','IV','V','VI'];

// Definición de los campos. paso 1..4 = pregunta principal; tipo: num | int | pct | enum | year. 'cuando' decide si el campo se muestra.
// impacto: qué cambia en la precisión si falta (se enseña en la lista de pendientes).
var FISCAL_CAMPOS=[
  {k:'tax_year',paso:1,tipo:'year',label:'Ejercicio fiscal de estos datos',ayuda:'Año al que corresponden los ingresos que indicas (p. ej. el último año completo).',impacto:'Sin ejercicio no se puede aplicar la normativa correcta.'},
  {k:'gross_salary_primary',paso:1,tipo:'num',label:'Salario bruto anual del cliente',unidad:'€',ayuda:'Bruto, no renta imponible: la base imponible real se calcula aparte.',impacto:'Es el ingreso de partida de la estimación.'},
  {k:'gross_salary_partner',paso:1,tipo:'num',label:'Salario bruto anual de la pareja',unidad:'€',cuando:'hayPareja',ayuda:'Solo si hay pareja que aporta ingresos.',impacto:'Necesario para la tributación conjunta.'},
  {k:'other_income_household',paso:1,tipo:'num',label:'Otros ingresos relevantes del hogar (al año)',unidad:'€',opcional:true,ayuda:'Opcional. Alquileres, autónomo u otros; se clasificarán más adelante.',impacto:'Pueden cambiar el resultado de forma material.'},
  {k:'marital_status',paso:2,tipo:'enum',label:'Estado civil',opciones:FISCAL_STATUS_CIVIL,etiquetas:FISCAL_STATUS_CIVIL_ES,impacto:'Condiciona si se modela declaración individual o conjunta.'},
  {k:'filing_mode',paso:2,tipo:'enum',label:'¿Cómo presentas la declaración?',cuando:'hayPareja',opciones:['individual','joint','not_sure'],
    etiquetas:{individual:'Individual',joint:'Conjunta (Zusammenveranlagung)',not_sure:'No estoy seguro/a'},ayuda:'Estar casado/a no implica automáticamente declaración conjunta.',impacto:'Cambia la tarifa aplicable.'},
  {k:'tax_class_primary',paso:2,tipo:'enum',label:'Steuerklasse del cliente',opciones:FISCAL_CLASES,opcional:true,ayuda:'Solo informa de la retención mensual; no es el impuesto anual ni un tipo impositivo.',impacto:'Dato auxiliar de retención.'},
  {k:'tax_class_partner',paso:2,tipo:'enum',label:'Steuerklasse de la pareja',cuando:'hayPareja',opciones:FISCAL_CLASES,opcional:true,impacto:'Dato auxiliar de retención.'},
  {k:'children_count',paso:2,tipo:'int',label:'Número de hijos',opcional:true,ayuda:'Solo el recuento: los derechos fiscales (Kindergeld, Kinderfreibetrag) se confirman aparte, no se deducen del número.',impacto:'Puede afectar a deducciones y a la Kirchensteuer.'},
  {k:'church_tax_status',paso:2,tipo:'enum',label:'¿Pagas Kirchensteuer?',opciones:['yes','no'],etiquetas:{yes:'Sí',no:'No'},ayuda:'Se pregunta solo porque cambia el cálculo; no se deduce de ningún otro dato.',impacto:'Añade un recargo sobre la cuota.'},
  {k:'federal_state',paso:2,tipo:'enum',label:'Bundesland de residencia fiscal',opciones:FISCAL_BUNDESLAENDER,opcional:true,impacto:'Parámetros que dependen del Land.'},
  {k:'taxes_data_mode',paso:3,tipo:'enum',label:'¿Qué datos fiscales tienes?',opciones:FISCAL_MODOS_DOC,etiquetas:FISCAL_MODOS_DOC_ES,impacto:'Con un Steuerbescheid la estimación es mucho más fiable que solo con el bruto.'},
  {k:'taxable_income',paso:3,tipo:'num',label:'zu versteuerndes Einkommen (renta imponible)',unidad:'€',cuando:'pideZve',ayuda:'Del último Steuerbescheid. No es el salario bruto.',impacto:'Punto de partida mejor que el bruto.'},
  {k:'assessed_income_tax',paso:3,tipo:'num',label:'Einkommensteuer festgesetzt',unidad:'€',cuando:'pideBescheid',opcional:true,impacto:'Permite contrastar la estimación con el último impuesto real.'},
  {k:'tax_assessment_year',paso:3,tipo:'year',label:'Ejercicio del Steuerbescheid',cuando:'pideZve',impacto:'Un Bescheid anterior no predice exactamente el año siguiente.'},
  {k:'property_use',paso:4,tipo:'enum',label:'¿Cómo vas a usar la vivienda?',opciones:FISCAL_USOS,etiquetas:FISCAL_USOS_ES,impacto:'Activa solo las reglas fiscales que corresponden al uso real.'},
  {k:'own_use_pct',paso:4,tipo:'pct',label:'% de la vivienda para uso propio',unidad:'%',cuando:'esMixto',ayuda:'Por superficie; el reparto fiscal definitivo se revisará con un especialista.',impacto:'Reparto de ingresos y gastos.'},
  {k:'rent_net_cold_monthly',paso:4,tipo:'num',label:'Alquiler neto frío esperado (al mes)',unidad:'€',cuando:'hayAlquiler',opcional:true,impacto:'Ingreso de alquiler.'},
  {k:'ownership_primary_pct',paso:4,tipo:'pct',label:'% de titularidad del cliente',unidad:'%',opcional:true,ayuda:'Se confirma siempre: puede ser distinta de la situación familiar.',impacto:'Atribución de ingresos y gastos entre titulares.'}
];
var FISCAL_CAMPOS_POR_CLAVE={}; FISCAL_CAMPOS.forEach(function(c){ FISCAL_CAMPOS_POR_CLAVE[c.k]=c; });
var FISCAL_PASOS=[
  {n:1,titulo:'Ingresos del hogar y año fiscal',pregunta:'¿Cuáles fueron los ingresos brutos tuyos y, si corresponde, de tu pareja en el último ejercicio fiscal?'},
  {n:2,titulo:'Situación familiar y tributaria',pregunta:'¿Cuál es tu situación familiar y cómo presentas normalmente tu declaración?'},
  {n:3,titulo:'Datos fiscales disponibles',pregunta:'¿Tienes tu último Einkommensteuerbescheid o conoces tu renta imponible?'},
  {n:4,titulo:'Uso previsto de la vivienda',pregunta:'¿Cómo vas a utilizar la vivienda?'}
];

function fiscalAhora(ahora){ return ahora||new Date().toISOString(); }
function fiscalNum(v){ if(v===null||v===undefined||v==='') return null; var n=(typeof v==='number')?v:parseFloat(String(v).replace(',','.')); return isFinite(n)?n:null; }

// Un campo vacío: desconocido, sin valor.
function fiscalCampoVacio(){ return {value:null,estado:'desconocido',fuente:null,fuenteRef:null,ejercicio:null,capturadoEn:null,confirmadoEn:null,confianza:'unknown',esEstimacion:false,versiones:[]}; }

function defaultFiscal(){
  return {version:FISCAL_VERSION,creadoEn:null,paso:0,revisado:false,permiso:null,campos:{}};
}
// Garantiza la forma del perfil (migración defensiva; no inventa valores). Devuelve rec.fiscal.
function normalizeFiscal(rec){
  var esObj=function(x){ return !!x&&typeof x==='object'&&!Array.isArray(x); };
  if(!esObj(rec.fiscal)) rec.fiscal=defaultFiscal();
  var f=rec.fiscal;
  if(!esObj(f.campos)) f.campos={};
  if(typeof f.paso!=='number'||f.paso<0||f.paso>5) f.paso=0;
  if(f.permiso!==null&&!esObj(f.permiso)) f.permiso=null;
  FISCAL_CAMPOS.forEach(function(c){
    var x=f.campos[c.k];
    if(!esObj(x)){ f.campos[c.k]=fiscalCampoVacio(); return; }
    if(FISCAL_ESTADOS.indexOf(x.estado)<0) x.estado='desconocido';
    if(x.estado==='desconocido'||x.estado==='no_aplica') x.value=(x.value===undefined)?null:x.value;
    if(x.value===undefined) x.value=null;
    // Coherencia: un estado «con valor» sin valor es desconocido; un valor presente nunca queda como desconocido.
    if((x.estado==='proporcionado'||x.estado==='confirmado')&&x.value===null) x.estado='desconocido';
    if(x.estado==='desconocido'&&x.value!==null) x.estado='proporcionado';
    if(FISCAL_CONFIANZAS.indexOf(x.confianza)<0) x.confianza='unknown';
    if(!Array.isArray(x.versiones)) x.versiones=[];
    ['fuente','fuenteRef','ejercicio','capturadoEn','confirmadoEn'].forEach(function(k){ if(x[k]===undefined) x[k]=null; });
    x.esEstimacion=!!x.esEstimacion;
  });
  return f;
}

// ---------- Validación ----------
// Devuelve {ok, valor, error}: valor ya normalizado (número entero, porcentaje, texto del enum…). Vacío = desconocido (valor null).
function fiscalValidar(clave,crudo){
  var c=FISCAL_CAMPOS_POR_CLAVE[clave]; if(!c) return {ok:false,valor:null,error:'Campo desconocido'};
  if(crudo===null||crudo===undefined||crudo==='') return {ok:true,valor:null,error:null};
  if(c.tipo==='enum'){ return (c.opciones.indexOf(crudo)>=0)?{ok:true,valor:crudo,error:null}:{ok:false,valor:null,error:'Valor no permitido'}; }
  var n=fiscalNum(crudo); if(n===null) return {ok:false,valor:null,error:'Escribe un número'};
  if(c.tipo==='year'){ n=Math.round(n); return (n>=2000&&n<=2100)?{ok:true,valor:n,error:null}:{ok:false,valor:null,error:'Año no válido'}; }
  if(c.tipo==='int'){ n=Math.round(n); return (n>=0&&n<=20)?{ok:true,valor:n,error:null}:{ok:false,valor:null,error:'Entre 0 y 20'}; }
  if(c.tipo==='pct') return (n>=0&&n<=100)?{ok:true,valor:Math.round(n*100)/100,error:null}:{ok:false,valor:null,error:'Entre 0 y 100'};
  return (n>=0&&n<=1e9)?{ok:true,valor:Math.round(n*100)/100,error:null}:{ok:false,valor:null,error:'No puede ser negativo'};
}

// ---------- Escritura de campos (siempre con historial) ----------
function fiscalGuardarVersion(x,motivo,ahora){
  x.versiones.push({value:x.value,estado:x.estado,fuente:x.fuente,en:fiscalAhora(ahora),motivo:motivo});
  if(x.versiones.length>12) x.versiones.splice(0,x.versiones.length-12);
}
// Fija un valor dicho por el asesor (manual por defecto). Vacío → desconocido. No confirma: confirmar es un paso aparte.
function fiscalFijar(f,clave,crudo,fuente,ahora){
  var v=fiscalValidar(clave,crudo); if(!v.ok) return v;
  var x=f.campos[clave]||(f.campos[clave]=fiscalCampoVacio());
  if(x.value===v.valor&&x.estado!=='desconocido'&&x.estado!=='no_aplica') return v;           // sin cambio: no se toca nada (ni se pierde la confirmación)
  if(x.value!==null||x.estado!=='desconocido') fiscalGuardarVersion(x,'cambio manual',ahora);
  x.value=v.valor; x.confirmadoEn=null;
  if(v.valor===null){ x.estado='desconocido'; x.fuente=null; x.fuenteRef=null; x.confianza='unknown'; x.capturadoEn=null; x.esEstimacion=false; }
  else{ x.estado='proporcionado'; x.fuente=fuente||'manual'; x.fuenteRef=null; x.capturadoEn=fiscalAhora(ahora); x.confianza=(x.fuente==='steuerbescheid')?'high':'medium'; x.esEstimacion=false; }
  return v;
}
// «No lo sé» / «No aplica»: estados explícitos, distintos de cero.
function fiscalMarcar(f,clave,estado,ahora){
  if(estado!=='desconocido'&&estado!=='no_aplica') return false;
  var x=f.campos[clave]||(f.campos[clave]=fiscalCampoVacio());
  if(x.estado===estado&&x.value===null) return true;
  if(x.value!==null||x.estado!=='desconocido') fiscalGuardarVersion(x,'marcado '+estado,ahora);
  x.value=null; x.estado=estado; x.fuente=null; x.fuenteRef=null; x.confianza='unknown'; x.capturadoEn=fiscalAhora(ahora); x.confirmadoEn=null; x.esEstimacion=false;
  return true;
}
// Confirma un valor ya presente (no se puede confirmar un campo sin valor).
function fiscalConfirmar(f,clave,ahora){
  var x=f.campos[clave]; if(!x||x.value===null||x.estado==='desconocido') return false;
  if(x.estado==='confirmado') return true;
  x.estado='confirmado'; x.confirmadoEn=fiscalAhora(ahora); if(x.confianza==='unknown'||x.confianza==='low') x.confianza='medium';
  return true;
}

// ---------- Visibilidad condicional ----------
function fiscalHayPareja(f){
  var ms=f.campos.marital_status;
  if(!ms||ms.value===null) return true;                    // si no se sabe, se pregunta
  return ms.value==='married'||ms.value==='registered_partnership';
}
function fiscalCampoVisible(f,clave){
  var c=FISCAL_CAMPOS_POR_CLAVE[clave]; if(!c) return false;
  if(!c.cuando) return true;
  var modo=f.campos.taxes_data_mode&&f.campos.taxes_data_mode.value, uso=f.campos.property_use&&f.campos.property_use.value;
  switch(c.cuando){
    case 'hayPareja': return fiscalHayPareja(f);
    case 'pideZve': return modo==='steuerbescheid'||modo==='zve';
    case 'pideBescheid': return modo==='steuerbescheid';
    case 'esMixto': return uso==='mixed_use';
    case 'hayAlquiler': return uso==='rented_out'||uso==='mixed_use'||uso==='temporary_vacant_or_future_rental';
    default: return true;
  }
}
function fiscalCamposDelPaso(f,paso){ return FISCAL_CAMPOS.filter(function(c){ return c.paso===paso&&fiscalCampoVisible(f,c.k); }); }

// ---------- Permiso de reutilización (base jurídica) ----------
// El permiso lo REGISTRA el asesor (no lo da el sistema): finalidad, fecha y quién. No sustituye el texto legal ni el consentimiento de la
// organización; solo deja constancia y es la condición técnica para precargar datos del análisis.
var FISCAL_ALCANCE_IMPORTACION=['gross_salary_primary','gross_salary_partner','marital_status','children_count','church_tax_status'];
function fiscalOtorgarPermiso(f,por,ahora){
  f.permiso={finalidad:FISCAL_FINALIDAD,otorgadoEn:fiscalAhora(ahora),registradoPor:por||'asesor',alcance:FISCAL_ALCANCE_IMPORTACION.slice(),revocadoEn:null};
  return f.permiso;
}
function fiscalRevocarPermiso(f,ahora){ if(f.permiso&&!f.permiso.revocadoEn) f.permiso.revocadoEn=fiscalAhora(ahora); return f.permiso; }
function fiscalPermisoVigente(f){ return !!(f.permiso&&f.permiso.finalidad===FISCAL_FINALIDAD&&!f.permiso.revocadoEn); }

// ---------- Datos del análisis financiero (solo lectura; sin permiso no se toca nada) ----------
function fiscalMapaEstadoCivil(txt){
  var m={'Soltero/a':'single','Casado/a':'married','Pareja de hecho':'registered_partnership','Divorciado/a':'divorced','Viudo/a':'widowed'};
  return m[txt]||null;
}
// Candidatos que el análisis podría aportar, con el motivo cuando no se puede aportar. NO modifica nada. Solo los campos de la matriz de
// recuperación: nunca nombre, fecha de nacimiento, Steuer-ID, gastos ni ahorros.
function fiscalCandidatosAnalisis(rec){
  var d=(rec&&rec.data)||{}, fl=d.fields||{}, out=[], omitidos=[];
  function num(k){ var v=parseFloat(fl[k]); return v>0?v:null; }
  var capt=(rec&&rec.savedAt)||null;
  function anual(letra){ var m=num('gross:salarioBruto_'+letra), p=parseFloat(fl['gross:numPagas_'+letra])||12; return m?Math.round(m*p*100)/100:null; }
  var a=anual('A'), b=anual('B');
  if(a!==null) out.push({k:'gross_salary_primary',value:a,fuente:'analisis_financiero',fuenteRef:'gross:salarioBruto_A × gross:numPagas_A (el análisis guarda el bruto mensual)',capturadoEn:capt,confianza:'medium'});
  else omitidos.push({k:'gross_salary_primary',motivo:'El análisis no tiene sueldo bruto de la persona A.'});
  if(b!==null) out.push({k:'gross_salary_partner',value:b,fuente:'analisis_financiero',fuenteRef:'gross:salarioBruto_B × gross:numPagas_B',capturadoEn:capt,confianza:'medium'});
  else omitidos.push({k:'gross_salary_partner',motivo:'El análisis no tiene sueldo bruto de la persona B.'});
  var ec=fiscalMapaEstadoCivil(fl['pers:estadoCivil_A']);
  if(ec) out.push({k:'marital_status',value:ec,fuente:'analisis_financiero',fuenteRef:'pers:estadoCivil_A',capturadoEn:capt,confianza:'medium'});
  else omitidos.push({k:'marital_status',motivo:'El análisis no tiene estado civil.'});
  var hijos=Array.isArray(d.children)?d.children.length:0;
  if(hijos>0) out.push({k:'children_count',value:hijos,fuente:'analisis_financiero',fuenteRef:'hijos registrados en el análisis',capturadoEn:capt,confianza:'medium'});
  else omitidos.push({k:'children_count',motivo:'Sin hijos registrados: el análisis no distingue «ninguno» de «no contestado».'});
  if(fl['sit:tieneKirchensteuer']===true) out.push({k:'church_tax_status',value:'yes',fuente:'analisis_financiero',fuenteRef:'sit:tieneKirchensteuer',capturadoEn:capt,confianza:'medium'});
  else omitidos.push({k:'church_tax_status',motivo:'Casilla sin marcar: el análisis no distingue «no» de «no contestado».'});
  return {candidatos:out,omitidos:omitidos};
}
// ¿Hay algo aprovechable? (solo un recuento: sirve para decir «hay datos» sin mostrarlos ni importarlos).
function fiscalDisponibleEnAnalisis(rec){ return fiscalCandidatosAnalisis(rec).candidatos.length; }

// Importa del análisis SOLO con permiso vigente, solo lo del alcance y sin pisar lo que el asesor ya escribió o confirmó. Los importados
// quedan como «proporcionado» (sin confirmar) y con su fuente: la pantalla de revisión los pide confirmar.
function fiscalImportar(f,rec,ahora){
  if(!fiscalPermisoVigente(f)) return {bloqueado:true,motivo:'Falta el permiso de reutilización para esta finalidad.',importados:[],omitidos:[]};
  var r=fiscalCandidatosAnalisis(rec), importados=[], omitidos=r.omitidos.slice();
  r.candidatos.forEach(function(c){
    if(f.permiso.alcance.indexOf(c.k)<0){ omitidos.push({k:c.k,motivo:'Fuera del alcance del permiso.'}); return; }
    var x=f.campos[c.k]||(f.campos[c.k]=fiscalCampoVacio());
    if((x.estado==='proporcionado'||x.estado==='confirmado')&&x.fuente!=='analisis_financiero'){ omitidos.push({k:c.k,motivo:'Ya introducido a mano: no se sobrescribe.'}); return; }
    if(x.value===c.value&&x.fuente==='analisis_financiero') return;                      // ya importado y sin cambios
    // AOR-TAX-006: un valor ya CONFIRMADO por el asesor no se sustituye en silencio aunque viniera del análisis; para cambiarlo hay que editarlo a mano.
    if(x.estado==='confirmado'){ omitidos.push({k:c.k,motivo:'Ya confirmado: no se sobrescribe (edítalo a mano si cambió).'}); return; }
    if(x.value!==null||x.estado!=='desconocido') fiscalGuardarVersion(x,'importación del análisis',ahora);
    x.value=c.value; x.estado='proporcionado'; x.fuente=c.fuente; x.fuenteRef=c.fuenteRef; x.capturadoEn=c.capturadoEn||fiscalAhora(ahora);
    x.confirmadoEn=null; x.confianza=c.confianza; x.esEstimacion=false; x.ejercicio=null;     // el análisis no guarda el ejercicio: hay que confirmarlo
    importados.push(c.k);
  });
  return {bloqueado:false,importados:importados,omitidos:omitidos};
}

// ---------- Nivel de datos, pendientes y resumen ----------
function fiscalConocido(f,k){ var x=f.campos[k]; return !!x&&x.value!==null&&(x.estado==='proporcionado'||x.estado==='confirmado'); }
// Pendientes que pueden cambiar materialmente una estimación posterior (opcionales aparte).
function fiscalPendientes(f){
  var out=[];
  FISCAL_CAMPOS.forEach(function(c){
    if(!fiscalCampoVisible(f,c.k)) return;
    var x=f.campos[c.k]||fiscalCampoVacio();
    if(x.estado==='no_aplica') return;
    if(x.estado==='desconocido') out.push({k:c.k,label:c.label,impacto:c.impacto||'',tipo:'falta',opcional:!!c.opcional});
    else if(x.estado==='proporcionado') out.push({k:c.k,label:c.label,impacto:'Pendiente de confirmar.',tipo:'sin_confirmar',opcional:!!c.opcional});
    else if(x.estado==='confirmado'&&x.fuente==='analisis_financiero'&&x.ejercicio===null&&c.k.indexOf('gross_')===0) out.push({k:c.k,label:c.label,impacto:'Falta confirmar a qué ejercicio corresponde.',tipo:'sin_ejercicio',opcional:false});
  });
  return out;
}
// Niveles de la especificación (§21), solo en cuanto a DATOS (todavía no hay cálculo): 0 insuficiente, 1 básico, 2 detallado. El nivel 3 es de revisión
// por un especialista y no se puede conceder desde aquí.
function fiscalNivel(f){
  var basico=fiscalConocido(f,'gross_salary_primary')&&fiscalConocido(f,'marital_status')&&fiscalConocido(f,'tax_year');
  var detallado=basico&&fiscalConocido(f,'taxable_income')&&fiscalConocido(f,'tax_assessment_year')&&fiscalConocido(f,'property_use')&&fiscalConocido(f,'ownership_primary_pct');
  var nivel=detallado?2:(basico?1:0);
  var etiquetas=['Datos insuficientes','Nivel 1 · datos básicos','Nivel 2 · datos fiscales más completos'];
  var motivos=[
    'Faltan al menos el ingreso bruto, el estado civil y el ejercicio fiscal.',
    'Hay ingresos y situación familiar, pero no la renta imponible de un Steuerbescheid: cualquier estimación sería preliminar y de baja fiabilidad.',
    'Hay datos fiscales y del inmueble; la estimación seguiría dependiendo de hipótesis futuras y de la revisión de un especialista.'];
  return {nivel:nivel,etiqueta:etiquetas[nivel],motivo:motivos[nivel],especialista:false};
}
function fiscalPasoCompleto(f,paso){
  return fiscalCamposDelPaso(f,paso).filter(function(c){ return !c.opcional; }).every(function(c){ var s=(f.campos[c.k]||{}).estado; return s&&s!=='desconocido'; });
}
function fiscalResumen(f){
  var filas=[];
  FISCAL_CAMPOS.forEach(function(c){
    if(!fiscalCampoVisible(f,c.k)) return;
    var x=f.campos[c.k]||fiscalCampoVacio();
    filas.push({k:c.k,paso:c.paso,tipo:c.tipo,label:c.label,unidad:c.unidad||'',value:x.value,estado:x.estado,fuente:x.fuente,ejercicio:x.ejercicio,capturadoEn:x.capturadoEn,confirmadoEn:x.confirmadoEn,confianza:x.confianza,esEstimacion:x.esEstimacion,
      etiquetaValor:fiscalEtiquetaValor(c,x.value)});
  });
  return filas;
}
function fiscalEtiquetaValor(c,v){
  if(v===null||v===undefined) return null;
  if(c.tipo==='enum') return (c.etiquetas&&c.etiquetas[v])||String(v);
  return String(v);
}
// Confirma de una vez todos los campos que tienen valor (lo que hace el botón «Confirmar perfil»); los desconocidos se quedan como están.
function fiscalConfirmarTodo(f,ahora){
  var n=0; FISCAL_CAMPOS.forEach(function(c){ if(fiscalCampoVisible(f,c.k)&&fiscalConfirmar(f,c.k,ahora)&&f.campos[c.k].estado==='confirmado') n++; });
  f.revisado=true; return n;
}

if(typeof module!=='undefined'&&module.exports){ module.exports={ FISCAL_CAMPOS, FISCAL_PASOS, FISCAL_FINALIDAD, FISCAL_ALCANCE_IMPORTACION, FISCAL_BUNDESLAENDER, defaultFiscal, normalizeFiscal, fiscalValidar,
  fiscalFijar, fiscalMarcar, fiscalConfirmar, fiscalConfirmarTodo, fiscalCampoVisible, fiscalCamposDelPaso, fiscalOtorgarPermiso, fiscalRevocarPermiso, fiscalPermisoVigente,
  fiscalCandidatosAnalisis, fiscalDisponibleEnAnalisis, fiscalImportar, fiscalPendientes, fiscalNivel, fiscalPasoCompleto, fiscalResumen, fiscalMapaEstadoCivil, fiscalHayPareja }; }
