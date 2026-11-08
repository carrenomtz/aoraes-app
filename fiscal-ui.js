/* Perfil fiscal (Fase 2, exploratoria) — pantalla, eventos y guardado. Usa el motor de fiscal.js (cargado antes).
   Se muestra dentro del Proyecto inmobiliario, en «Opciones avanzadas». NO calcula ningún impuesto: recoge, revisa y confirma datos.
   Patrón de guardado igual que afa.js: el perfil vive en rec.fiscal y se copia al cliente guardado con persistFiscal(). */

var fiscalSaveTimer=null;

function fiscalEsc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(m){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]; }); }
function fiscalFecha(iso){ if(!iso) return ''; var d=new Date(iso); return isNaN(d)?'':d.toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit',year:'numeric'}); }
function fiscalRecActual(){ var rec=(typeof APP_HOST!=='undefined')?APP_HOST.wsRec:null; if(!rec) return null; normalizeFiscal(rec); return rec; }

var FISCAL_ESTADO_ES={desconocido:'Sin dato',no_aplica:'No aplica',proporcionado:'Sin confirmar',confirmado:'Confirmado'};
var FISCAL_FUENTE_ES={manual:'Introducido a mano',analisis_financiero:'Análisis financiero',steuerbescheid:'Steuerbescheid',otra:'Otra fuente'};
var FISCAL_CONFIANZA_ES={high:'Alta',medium:'Media',low:'Baja',unknown:'—'};

function fiscalCampoHTML(f,c){
  var x=f.campos[c.k]||{}, id='fiscal-'+c.k, val=(x.value===null||x.value===undefined)?'':x.value, off=(x.estado==='no_aplica');
  var control;
  if(c.tipo==='enum'){
    control='<select class="inm-inp" id="'+id+'" data-fiscal-campo="'+c.k+'"'+(off?' disabled':'')+'><option value="">—</option>'+
      c.opciones.map(function(o){ return '<option value="'+fiscalEsc(o)+'"'+(String(val)===String(o)?' selected':'')+'>'+fiscalEsc((c.etiquetas&&c.etiquetas[o])||o)+'</option>'; }).join('')+'</select>';
  } else {
    control='<span class="inm-inp-wrap"><input type="number" class="inm-inp" id="'+id+'" data-fiscal-campo="'+c.k+'" value="'+fiscalEsc(val)+'" step="'+(c.tipo==='num'?'100':'1')+'" min="0"'+(c.tipo==='pct'?' max="100"':'')+' placeholder="'+(c.tipo==='year'?'p. ej. 2025':'0')+'"'+(off?' disabled':'')+'>'+(c.unidad?'<span class="inm-suf">'+fiscalEsc(c.unidad)+'</span>':'')+'</span>';
  }
  var estado='<span class="fiscal-est fiscal-est-'+x.estado+'">'+FISCAL_ESTADO_ES[x.estado||'desconocido']+'</span>';
  return '<div class="fiscal-campo"><label class="inm-f" for="'+id+'"><span>'+fiscalEsc(c.label)+(c.opcional?' <em class="inm-eff-hint">· opcional</em>':'')+'</span>'+control+'</label>'+
    (c.ayuda?'<p class="inm-curve-note fiscal-ayuda"><span>'+fiscalEsc(c.ayuda)+'</span></p>':'')+
    '<div class="fiscal-acc">'+estado+
      '<button type="button" class="fiscal-mini" data-fiscal-act="unknown" data-k="'+c.k+'">No lo sé</button>'+
      ((c.opcional||c.cuando==='hayPareja')?'<button type="button" class="fiscal-mini" data-fiscal-act="na" data-k="'+c.k+'">No aplica</button>':'')+
      '<span class="fiscal-err" id="fiscal-err-'+c.k+'" role="alert"></span></div></div>';
}

function fiscalEntradaHTML(rec,f){
  var disp=fiscalDisponibleEnAnalisis(rec), vig=fiscalPermisoVigente(f), h='';
  h+='<h4 class="fiscal-h">Tu perfil fiscal para el proyecto inmobiliario</h4>'+
    '<p class="fiscal-sub">Vamos a recoger y revisar los datos fiscales que harán falta para estimar cómo podría influir esta vivienda en los impuestos, la liquidez y el patrimonio. Primero revisamos lo que ya tenemos, para no preguntar lo mismo dos veces.</p>'+
    '<p class="inm-curve-note fiscal-aviso"><span>Esta versión solo recoge y revisa datos: todavía no calcula impuestos ni da ahorros fiscales.</span></p>';
  if(!disp){
    h+='<p class="inm-curve-note"><span>El análisis financiero de este cliente no tiene datos aprovechables para el perfil fiscal. Responde las cuatro preguntas.</span></p>';
  } else if(!vig){
    h+='<div class="fiscal-permiso"><p><b>Hay datos aprovechables en el análisis financiero</b> <span>(</span><b>'+disp+'</b> <span>campos).</span></p>'+
      '<p class="inm-curve-note"><span>No se usan automáticamente: se necesita registrar que el cliente permite reutilizarlos para esta simulación fiscal. Solo se traerían ingresos brutos, estado civil, hijos y Kirchensteuer; nunca nombre, Steuer-ID, fecha de nacimiento, gastos ni ahorros.</span></p>'+
      '<button type="button" class="inm-sug-btn" data-fiscal-act="permiso-on">Registrar el permiso del cliente y traer los datos</button> '+
      '<button type="button" class="fiscal-mini" data-fiscal-act="sin-importar">Prefiero responder yo</button></div>';
  } else {
    h+='<div class="fiscal-permiso"><p><span>Permiso de reutilización registrado el</span> <b>'+fiscalEsc(fiscalFecha(f.permiso.otorgadoEn))+'</b><span> para la finalidad «simulación fiscal inmobiliaria».</span></p>'+
      '<button type="button" class="inm-sug-btn" data-fiscal-act="importar">Traer o actualizar los datos del análisis</button> '+
      '<button type="button" class="fiscal-mini" data-fiscal-act="permiso-off">Revocar el permiso</button></div>';
  }
  h+='<div class="fiscal-nav"><button type="button" class="inm-sug-btn" data-fiscal-act="ir" data-paso="1">Empezar · paso 1 de 4</button>'+
    ((f.paso>0||Object.keys(f.campos).some(function(k){ return f.campos[k].estado!=='desconocido'; }))?' <button type="button" class="fiscal-mini" data-fiscal-act="ir" data-paso="5">Ver la revisión del perfil</button>':'')+'</div>';
  return h;
}

function fiscalPasoHTML(f,paso){
  var p=FISCAL_PASOS[paso-1], campos=fiscalCamposDelPaso(f,paso);
  var h='<div class="fiscal-prog" role="progressbar" aria-valuemin="1" aria-valuemax="4" aria-valuenow="'+paso+'"><span>Paso '+paso+' de 4</span><i style="width:'+(paso*25)+'%"></i></div>'+
    '<h4 class="fiscal-h">'+fiscalEsc(p.titulo)+'</h4><p class="fiscal-sub">'+fiscalEsc(p.pregunta)+'</p>'+
    '<div class="fiscal-campos">'+campos.map(function(c){ return fiscalCampoHTML(f,c); }).join('')+'</div>';
  if(paso===3) h+='<p class="inm-curve-note"><span>No hace falta subir ningún documento: puedes escribir las cifras a mano o continuar sin ellas. Un Steuerbescheid anterior no predice exactamente el impuesto del año siguiente.</span></p>';
  h+='<div class="fiscal-nav">'+(paso>1?'<button type="button" class="fiscal-mini" data-fiscal-act="ir" data-paso="'+(paso-1)+'">Atrás</button> ':'<button type="button" class="fiscal-mini" data-fiscal-act="ir" data-paso="0">Inicio</button> ')+
    (paso<4?'<button type="button" class="inm-sug-btn" data-fiscal-act="ir" data-paso="'+(paso+1)+'">Siguiente</button>':'<button type="button" class="inm-sug-btn" data-fiscal-act="ir" data-paso="5">Revisar el perfil</button>')+'</div>';
  return h;
}

function fiscalRevisionHTML(f){
  var filas=fiscalResumen(f), nv=fiscalNivel(f), pend=fiscalPendientes(f).filter(function(x){ return !x.opcional||x.tipo!=='falta'; });
  var rows=filas.map(function(r){
    var val=(r.etiquetaValor===null)?'<span class="fiscal-nulo">'+(r.estado==='no_aplica'?'No aplica':'Sin dato')+'</span>':fiscalEsc((typeof r.value==='number'&&(r.tipo==='num'||r.tipo==='pct'))?r.value.toLocaleString('de-DE',{maximumFractionDigits:2}):r.etiquetaValor)+(r.unidad?' '+fiscalEsc(r.unidad):'');
    var origen=r.fuente?fiscalEsc(FISCAL_FUENTE_ES[r.fuente]||r.fuente)+(r.ejercicio?' · '+fiscalEsc(r.ejercicio):'')+(r.capturadoEn?' · '+fiscalEsc(fiscalFecha(r.capturadoEn)):''):'—';
    var acc=(r.estado==='proporcionado')?'<button type="button" class="fiscal-mini" data-fiscal-act="confirmar" data-k="'+r.k+'">Confirmar</button>':'';
    return '<tr><td>'+fiscalEsc(r.label)+'</td><td class="fiscal-val">'+val+'</td><td>'+origen+'</td><td><span class="fiscal-est fiscal-est-'+r.estado+'">'+FISCAL_ESTADO_ES[r.estado]+'</span> <small>'+FISCAL_CONFIANZA_ES[r.confianza]+'</small></td><td>'+acc+'</td></tr>';
  }).join('');
  var h='<h4 class="fiscal-h">Revisa tu perfil</h4>'+
    '<div class="inm-fin fiscal-nivel"><div class="inm-res-line"><span>Nivel de datos</span><b>'+fiscalEsc(nv.etiqueta)+'</b></div><p class="inm-curve-note"><span>'+fiscalEsc(nv.motivo)+'</span></p></div>'+
    '<table class="inm-tabla fiscal-tabla"><thead><tr><th>Dato</th><th>Valor</th><th>Fuente</th><th>Estado y confianza</th><th></th></tr></thead><tbody>'+rows+'</tbody></table>';
  if(pend.length) h+='<div class="fiscal-pend"><h5>Pendiente</h5><ul>'+pend.map(function(x){ return '<li><b>'+fiscalEsc(x.label)+'</b> <span>— '+fiscalEsc(x.impacto)+'</span></li>'; }).join('')+'</ul></div>';
  h+='<p class="inm-curve-note"><span>El cálculo fiscal todavía no está disponible en esta versión: esto es un perfil de datos, no una estimación ni asesoramiento fiscal. La Steuerklasse no determina por sí sola el impuesto anual. Antes de actuar, confirma el tratamiento con un Steuerberater.</span></p>'+
    '<div class="fiscal-nav"><button type="button" class="inm-sug-btn" data-fiscal-act="confirmar-todo">Confirmar perfil</button> <button type="button" class="fiscal-mini" data-fiscal-act="ir" data-paso="1">Editar datos</button> <button type="button" class="fiscal-mini" data-fiscal-act="ir" data-paso="0">Inicio</button></div>';
  return h;
}

function fiscalCuerpoHTML(rec){
  var f=rec.fiscal, paso=f.paso||0;
  var msg=f._aviso?'<p class="inm-curve-note fiscal-msg" role="status"><span>'+fiscalEsc(f._aviso)+'</span></p>':'';
  var cuerpo=(paso===0)?fiscalEntradaHTML(rec,f):(paso>=1&&paso<=4)?fiscalPasoHTML(f,paso):fiscalRevisionHTML(f);
  return msg+cuerpo;
}
function fiscalCardHTML(rec){
  if(!rec) return '';
  normalizeFiscal(rec);
  return '<details class="inm-gastos-det inm-fiscal inm-adv" id="fiscal-card"'+(rec.fiscal.paso>0?' open':'')+'><summary>Perfil fiscal (exploratorio)</summary><div id="fiscal-body">'+fiscalCuerpoHTML(rec)+'</div></details>';
}
function fiscalRender(){
  var rec=fiscalRecActual(), el=document.getElementById('fiscal-body'); if(!rec||!el) return;
  el.innerHTML=fiscalCuerpoHTML(rec); delete rec.fiscal._aviso;
}

// ---------- Guardado (mismo patrón que persistAfa) ----------
function persistFiscal(){
  if(!APP_HOST.wsId||!APP_HOST.wsRec||!APP_HOST.wsRec.fiscal) return;
  var arr=APP_HOST.readLocalClientsRaw();
  for(var i=0;i<arr.length;i++){
    if(arr[i].id===APP_HOST.wsId){ var copia=JSON.parse(JSON.stringify(APP_HOST.wsRec.fiscal)); delete copia._aviso; arr[i].fiscal=copia; arr[i].savedAt=new Date().toISOString(); break; }
  }
  try{ localStorage.setItem(APP_HOST.CLIENTS_KEY,JSON.stringify(arr)); }catch(e){ console.error('AORAES: fallo al guardar el perfil fiscal'); }
  APP_HOST.writeClientFile(APP_HOST.wsId);
}
function scheduleFiscalSave(){ if(fiscalSaveTimer) clearTimeout(fiscalSaveTimer); fiscalSaveTimer=setTimeout(persistFiscal,500); }
function flushFiscalSave(){ if(fiscalSaveTimer){ clearTimeout(fiscalSaveTimer); fiscalSaveTimer=null; persistFiscal(); } }
window.addEventListener('beforeunload',flushFiscalSave);
window.addEventListener('pagehide',flushFiscalSave);
document.addEventListener('visibilitychange',function(){ if(document.visibilityState==='hidden') flushFiscalSave(); });

// ---------- Eventos: los llama inmuebleOnClick / inmuebleOnInput antes de sus propias ramas ----------
function fiscalOnClick(e){
  var b=e.target.closest&&e.target.closest('[data-fiscal-act]'); if(!b) return false;
  var rec=fiscalRecActual(); if(!rec) return true;
  var f=rec.fiscal, act=b.getAttribute('data-fiscal-act'), k=b.getAttribute('data-k');
  if(act==='ir'){ f.paso=parseInt(b.getAttribute('data-paso'),10)||0; }
  else if(act==='unknown'){ fiscalMarcar(f,k,'desconocido'); }
  else if(act==='na'){ fiscalMarcar(f,k,'no_aplica'); }
  else if(act==='confirmar'){ fiscalConfirmar(f,k); }
  else if(act==='confirmar-todo'){ var n=fiscalConfirmarTodo(f); f._aviso=n+' datos confirmados. Los que siguen sin dato quedan pendientes.'; }
  else if(act==='permiso-on'){
    fiscalOtorgarPermiso(f,'asesor'); var r=fiscalImportar(f,rec);
    f._aviso=r.importados.length+' datos traídos del análisis; quedan sin confirmar.'+(r.omitidos.length?' No se pudo traer: '+r.omitidos.map(function(o){ return (FISCAL_CAMPOS.filter(function(c){ return c.k===o.k; })[0]||{}).label; }).join(', ')+'.':'');
  }
  else if(act==='importar'){
    var r2=fiscalImportar(f,rec); f._aviso=r2.bloqueado?r2.motivo:(r2.importados.length+' datos actualizados desde el análisis; quedan sin confirmar.');
  }
  else if(act==='permiso-off'){ fiscalRevocarPermiso(f); f._aviso='Permiso revocado: no se traerán más datos. Lo ya importado sigue en el perfil y puedes corregirlo o borrarlo.'; }
  else if(act==='sin-importar'){ f._aviso='Sin importar: responde las preguntas a mano.'; f.paso=1; }
  else return false;
  fiscalRender(); scheduleFiscalSave();
  return true;
}
function fiscalOnInput(e){
  var t=e.target, k=t.getAttribute&&t.getAttribute('data-fiscal-campo'); if(!k) return false;
  var rec=fiscalRecActual(); if(!rec) return true;
  var v=fiscalFijar(rec.fiscal,k,t.value,'manual'), er=document.getElementById('fiscal-err-'+k);
  if(er) er.textContent=v.ok?'':v.error;
  var bad=t.closest('.fiscal-campo'), est=bad&&bad.querySelector('.fiscal-est');
  if(est){ var s=rec.fiscal.campos[k].estado; est.className='fiscal-est fiscal-est-'+s; est.textContent=FISCAL_ESTADO_ES[s]; }
  scheduleFiscalSave();
  if(t.tagName==='SELECT'&&v.ok) fiscalRender();      // un desplegable puede mostrar u ocultar otros campos; en números no se redibuja para no perder el cursor
  return true;
}
