/* Amortización (AfA) para inmuebles ya comprados — datos, cálculo, pantalla, informe y guardado.
   Script clásico cargado ANTES del script principal de index.html (las funciones quedan como globales). Lo que necesita del resto de la
   app (cliente abierto y almacenamiento) lo recibe por APP_HOST, que define index.html: wsRec, wsId, CLIENTS_KEY, readLocalClientsRaw(),
   writeClientFile(id). Los eventos del módulo (afaOnClick / afaOnInput) los llama index.html desde sus listeners compartidos. */

var afaSaveTimer=null;

// ---------- Amortización (AfA) para inmuebles ya comprados ----------
// Tasas de Grunderwerbsteuer por Bundesland — verificadas en finanz-tools.de y rechenbar.de
// (sept. 2026). Se guardan solo como valor de partida editable (ver itpPct en defaultAfa):
// cambian por ley estatal (el último cambio fue Bremen, 01.07.2025), así que nunca deben
// tratarse como una verdad fija dentro de la app.
var AFA_BUNDESLAND_ITP={
  'Baden-Württemberg':5.0,'Bayern':3.5,'Berlin':6.0,'Brandenburg':6.5,'Bremen':5.5,
  'Hamburg':5.5,'Hessen':6.0,'Mecklenburg-Vorpommern':6.0,'Niedersachsen':5.0,
  'Nordrhein-Westfalen':6.5,'Rheinland-Pfalz':5.0,'Saarland':6.5,'Sachsen':5.5,
  'Sachsen-Anhalt':5.0,'Schleswig-Holstein':6.5,'Thüringen':5.0
};

function defaultAfa(){
  return {
    bundesland:'Berlin', itpPct:AFA_BUNDESLAND_ITP['Berlin'],
    // notarioPct/registroPct: gastos habituales de notaría y registro de la propiedad en
    // Alemania, como % del precio de compra (igual que itpPct) — no importes fijos, porque
    // ambos escalan con el precio del inmueble.
    precioCompra:200000, notarioPct:1.5, registroPct:0.5, otrosGastos:0,
    valorSuelo:0, sueloPendiente:false, valorCocina:0,
    // Dos escenarios SEPARADOS, nunca uno "reemplazando por defecto" al otro:
    // - afaEstandarPct: la AfA legal normal del inmueble (depende de la fecha de construcción;
    //   2% es el caso más habitual para vivienda, pero el asesor lo puede ajustar).
    // - tieneGutachten + restnutzungsdauerGutachten: solo si existe un Restnutzungsdauergutachten
    //   real, que fija una vida útil restante DISTINTA — el % de ese escenario se deriva de esa
    //   vida útil (100/años), nunca se asume "Gutachten = más AfA" de entrada.
    afaEstandarPct:2, tieneGutachten:false, restnutzungsdauerGutachten:30,
    hipotecaInteresesAnual:0,
    docs:{kaufvertrag:false, gutachten:false, itpRecibo:false, notarioFactura:false, registroFactura:false, hipotecaInforme:false}
  };
}

// Fórmulas: Nebenkosten = precio × (ITP% + notaría% + registro%) + otros; Base amortizable
// (= valor del Gebäude a efectos de AfA) = precio + Nebenkosten - suelo - cocina — el suelo
// (Grund und Boden) NUNCA se amortiza y la cocina se deduce entera en el año 1, no dentro del
// %/año continuo. La AfA en sí se calcula SIEMPRE sobre esa base, en dos escenarios independientes:
//  - Estándar: el % legal normal del inmueble (afaEstandarPct), sin tocar el Gutachten.
//  - Gutachten: SOLO si tieneGutachten=true, % = 100/restnutzungsdauerGutachten — puede salir
//    mayor O menor que el estándar (una vida útil restante más larga da un % menor), así que
//    nunca se asume que el Gutachten siempre "suma" AfA.
function calcAfa(afa){
  var notarioRegistroPct=(afa.notarioPct||0)+(afa.registroPct||0);
  var nebenkosten=(afa.precioCompra||0)*(((afa.itpPct||0)+notarioRegistroPct)/100)+(afa.otrosGastos||0);
  var notarioRegistro=(afa.precioCompra||0)*(notarioRegistroPct/100);
  var sueloEfectivo=afa.sueloPendiente?0:(afa.valorSuelo||0);
  var baseAmortizable=Math.max(0,(afa.precioCompra||0)+nebenkosten-sueloEfectivo-(afa.valorCocina||0));
  var pctEstandar=afa.afaEstandarPct||0;
  var perdidaEstandarAnual=baseAmortizable*pctEstandar/100;
  var pctGutachten=null, perdidaGutachtenAnual=null, diferenciaAnual=null;
  if(afa.tieneGutachten && afa.restnutzungsdauerGutachten>0){
    pctGutachten=100/afa.restnutzungsdauerGutachten;
    perdidaGutachtenAnual=baseAmortizable*pctGutachten/100;
    diferenciaAnual=perdidaGutachtenAnual-perdidaEstandarAnual;
  }
  // "Efectivo" = lo que realmente aplica para la declaración: el Gutachten manda si existe,
  // porque sustituye la vida útil (no se suma al estándar).
  var pctEfectivo=(afa.tieneGutachten&&pctGutachten!=null)?pctGutachten:pctEstandar;
  var perdidaEfectivaAnual=(afa.tieneGutachten&&perdidaGutachtenAnual!=null)?perdidaGutachtenAnual:perdidaEstandarAnual;
  return {nebenkosten:nebenkosten, notarioRegistro:notarioRegistro, sueloEfectivo:sueloEfectivo, baseAmortizable:baseAmortizable,
    pctEstandar:pctEstandar, perdidaEstandarAnual:perdidaEstandarAnual,
    pctGutachten:pctGutachten, perdidaGutachtenAnual:perdidaGutachtenAnual, diferenciaAnual:diferenciaAnual,
    pctEfectivo:pctEfectivo, perdidaEfectivaAnual:perdidaEfectivaAnual};
}

function normalizeAfa(rec){
  if(!rec.afa) rec.afa=defaultAfa();
  var afa=rec.afa, def=defaultAfa();
  if(!afa.bundesland) afa.bundesland=def.bundesland;
  if(afa.itpPct==null) afa.itpPct=AFA_BUNDESLAND_ITP[afa.bundesland]||def.itpPct;
  if(afa.notarioPct==null) afa.notarioPct=def.notarioPct;
  if(afa.registroPct==null) afa.registroPct=def.registroPct;
  if(afa.afaEstandarPct==null) afa.afaEstandarPct=def.afaEstandarPct;
  if(afa.tieneGutachten==null) afa.tieneGutachten=def.tieneGutachten;
  if(afa.restnutzungsdauerGutachten==null) afa.restnutzungsdauerGutachten=def.restnutzungsdauerGutachten;
  if(!afa.docs) afa.docs=def.docs;
  ['kaufvertrag','gutachten','itpRecibo','notarioFactura','registroFactura','hipotecaInforme'].forEach(function(k){ if(afa.docs[k]==null) afa.docs[k]=false; });
  return afa;
}

// ---------- Amortización (AfA): render, guardado y salidas (informe imprimible + texto para
// el Steuerberater) — mismo patrón que Proyecto inmobiliario, ver comentarios en defaultAfa/
// normalizeAfa/calcAfa más arriba para las fórmulas y el porqué de cada campo. ----------
function afaResultsHTML(afa){
  var c=calcAfa(afa);
  var cards='<div class="inm-res-card"><h5>Base amortizable (Gebäudewert)</h5>'+
      '<div class="inm-res-line"><span>Nebenkosten (ITP + notaría + registro + otros)</span><b>'+eur(c.nebenkosten)+'</b></div>'+
      '<div class="inm-res-line"><span>Valor del suelo (Grund und Boden, no amortizable)</span><b>'+(afa.sueloPendiente?'Pendiente — Steuerberater':eur(c.sueloEfectivo))+'</b></div>'+
      (afa.valorCocina>0?'<div class="inm-res-line"><span>Cocina — deducción íntegra año 1</span><b>'+eur(afa.valorCocina)+'</b></div>':'')+
      '<div class="inm-res-line total"><span>Base amortizable</span><b>'+eur(c.baseAmortizable)+'</b></div>'+
    '</div>'+
    '<div class="inm-res-card"><h5>AfA estándar (sin Gutachten)</h5>'+
      '<div class="inm-res-line"><span>% AfA legal</span><b>'+c.pctEstandar.toFixed(2).replace('.',',')+'%</b></div>'+
      '<div class="inm-res-line total"><span>AfA anual estándar</span><b>'+eur(c.perdidaEstandarAnual)+'</b></div>'+
    '</div>';
  if(afa.tieneGutachten && c.pctGutachten!=null){
    cards+='<div class="inm-res-card"><h5>AfA según Restnutzungsdauergutachten</h5>'+
      '<div class="inm-res-line"><span>Vida útil restante (Gutachten)</span><b>'+afa.restnutzungsdauerGutachten+' años</b></div>'+
      '<div class="inm-res-line"><span>% AfA según Gutachten</span><b>'+c.pctGutachten.toFixed(2).replace('.',',')+'%</b></div>'+
      '<div class="inm-res-line total"><span>AfA anual según Gutachten</span><b>'+eur(c.perdidaGutachtenAnual)+'</b></div>'+
      '<div class="inm-res-line '+(c.diferenciaAnual>=0?'save pos':'save neg')+'"><span>'+(c.diferenciaAnual>=0?'Gasto fiscal deducible adicional':'Gasto fiscal deducible menor')+' vs. estándar</span><b>'+eur(Math.abs(c.diferenciaAnual))+'</b></div>'+
      '<div class="inm-note" style="margin:8px 0 0">Esta diferencia es gasto fiscal deducible adicional, no ahorro fiscal directo — el ahorro real depende del tipo impositivo del cliente y se calcula aparte.</div>'+
    '</div>';
  }
  if(afa.hipotecaInteresesAnual>0){
    cards+='<div class="inm-res-card"><h5>Gasto corriente (no AfA)</h5>'+
      '<div class="inm-res-line"><span>Intereses de hipoteca (anual)</span><b>'+eur(afa.hipotecaInteresesAnual)+'</b></div>'+
      '<div class="inm-note" style="margin:8px 0 0">Gasto corriente deducible cada año — no forma parte de la base amortizable AfA.</div>'+
    '</div>';
  }
  return cards;
}

function afaBundeslandOptions(selected){
  return Object.keys(AFA_BUNDESLAND_ITP).sort().map(function(bl){
    return '<option value="'+esc(bl)+'"'+(bl===selected?' selected':'')+'>'+esc(bl)+'</option>';
  }).join('');
}

function afaField(key,label,val,step,suffix,extra){
  return '<label class="inm-f"><span>'+esc(label)+'</span><span class="inm-inp-wrap"><input type="number" class="inm-inp" data-afa-field="'+key+'" value="'+val+'" step="'+step+'" '+(extra||'')+'><span class="inm-suf">'+suffix+'</span></span></label>';
}

var AFA_DOC_LABELS={
  kaufvertrag:'Contrato de compraventa (Kaufvertrag)',
  gutachten:'Informe de durabilidad (Gutachten)',
  itpRecibo:'Recibo del impuesto de transmisiones (Grunderwerbsteuer)',
  notarioFactura:'Factura de notaría',
  registroFactura:'Factura del registro de la propiedad',
  hipotecaInforme:'Informe anual de intereses de la hipoteca'
};

function afaBlock(rec){
  var afa=normalizeAfa(rec);
  var docsHtml=Object.keys(AFA_DOC_LABELS).map(function(k){
    return '<label class="afa-doc-row"><input type="checkbox" data-afa-doc="'+k+'"'+(afa.docs[k]?' checked':'')+'> '+esc(AFA_DOC_LABELS[k])+'</label>';
  }).join('');
  return '<div class="ws-card"><h3>Amortización (AfA)</h3>'+
    '<p class="ws-lead">Calcula la base amortizable y la pérdida ficticia anual (AfA) de un inmueble que el cliente ya tiene, y prepara el expediente para el asesor fiscal.</p>'+
    '<label class="inm-f"><span>Bundesland</span><span class="inm-inp-wrap"><select class="inm-inp" data-afa-field="bundesland" style="padding:9px 11px">'+afaBundeslandOptions(afa.bundesland)+'</select></span></label>'+
    afaField('itpPct','Grunderwerbsteuer',afa.itpPct,'0.1','%','min="0" max="10"')+
    afaField('precioCompra','Precio de compra (Kaufvertrag)',afa.precioCompra,'1000','€','min="0"')+
    afaField('notarioPct','Notaría',afa.notarioPct,'0.1','%','min="0" max="5"')+
    afaField('registroPct','Registro de la propiedad',afa.registroPct,'0.1','%','min="0" max="5"')+
    afaField('otrosGastos','Otros gastos de adquisición',afa.otrosGastos,'50','€','min="0"')+
    afaField('valorSuelo','Valor del suelo (Bodenwert, del Gutachten)',afa.valorSuelo,'1000','€','min="0"'+(afa.sueloPendiente?' disabled':''))+
    '<label class="afa-check"><input type="checkbox" data-afa-check="sueloPendiente"'+(afa.sueloPendiente?' checked':'')+'> Que lo calcule el Steuerberater — el Gutachten no especifica el valor del suelo.</label>'+
    afaField('valorCocina','Cocina (Einbauküche) — deducción íntegra año 1',afa.valorCocina,'100','€','min="0"')+
    afaField('afaEstandarPct','AfA estándar del inmueble (según fecha de construcción)',afa.afaEstandarPct,'0.1','%','min="0" max="10"')+
    '<label class="afa-check"><input type="checkbox" data-afa-check="tieneGutachten"'+(afa.tieneGutachten?' checked':'')+'> Existe un Restnutzungsdauergutachten (informe de vida útil restante).</label>'+
    '<p class="inm-note" style="margin:-4px 0 14px">Un Restnutzungsdauergutachten puede acreditar una vida útil real del edificio más corta que la estándar. Eso puede dar una AfA anual más alta — pero también podría dar una más baja si el informe acredita una vida útil más larga. El cálculo se aplica siempre solo sobre la parte amortizable del edificio, nunca sobre el suelo.</p>'+
    (afa.tieneGutachten?afaField('restnutzungsdauerGutachten','Vida útil restante según el Gutachten',afa.restnutzungsdauerGutachten,'1','años','min="1" max="100"'):'')+
    afaField('hipotecaInteresesAnual','Intereses de hipoteca (informe anual)',afa.hipotecaInteresesAnual,'50','€','min="0"')+
    '<div id="afa-results-wrap" class="inm-results">'+afaResultsHTML(afa)+'</div>'+
    '<div class="afa-strategy-card"><h4>Cómo presentarlo ante Hacienda</h4><p>Prioriza la Declaración Consolidada (anual) sobre la Notificación Previa (Lohnsteuerermäßigung) mensual: al integrarse en la declaración de la renta, la presión de plazos de cierre de la administración favorece la aceptación del Gutachten. La notificación mensual deja el expediente en manos de un único funcionario con tiempo para cuestionarlo — mayor riesgo de auditoría.</p></div>'+
    '<div class="afa-docs-card"><h4>Checklist de documentos</h4>'+docsHtml+'</div>'+
    '<div class="afa-actions"><button type="button" class="ws-cta" id="afa-print-btn">🖨 Imprimir informe</button><button type="button" class="ws-cta ghost" id="afa-copy-btn">📋 Copiar texto para el Steuerberater</button><span class="afa-copy-ok" id="afa-copy-ok" hidden>¡Copiado!</span></div>'+
  '</div>';
}

function refreshAfaResults(){
  if(!APP_HOST.wsRec||!APP_HOST.wsRec.afa) return;
  var el=document.getElementById('afa-results-wrap'); if(!el) return;
  el.innerHTML=afaResultsHTML(APP_HOST.wsRec.afa);
}

function persistAfa(){
  if(!APP_HOST.wsId||!APP_HOST.wsRec||!APP_HOST.wsRec.afa) return;
  var arr=APP_HOST.readLocalClientsRaw();
  for(var i=0;i<arr.length;i++){
    if(arr[i].id===APP_HOST.wsId){ arr[i].afa=APP_HOST.wsRec.afa; arr[i].savedAt=new Date().toISOString(); break; }
  }
  try{ localStorage.setItem(APP_HOST.CLIENTS_KEY,JSON.stringify(arr)); }catch(e){ console.error('AORAES: fallo al guardar la amortización AfA',e); }
  APP_HOST.writeClientFile(APP_HOST.wsId);
}

function scheduleAfaSave(){
  if(afaSaveTimer) clearTimeout(afaSaveTimer);
  afaSaveTimer=setTimeout(persistAfa,500);
}

function flushAfaSave(){
  if(afaSaveTimer){ clearTimeout(afaSaveTimer); afaSaveTimer=null; persistAfa(); }
}

if(typeof window!=='undefined') window.addEventListener('beforeunload',flushAfaSave);

// Informe imprimible: overlay de pantalla completa oculto por defecto (#afa-informe, ver CSS
// @media print) — se rellena solo con datos, sin los inputs editables, para que el PDF/impreso
// sea un documento presentable, con la marca de AORAES, no una captura del formulario.
function buildAfaInforme(rec){
  var afa=normalizeAfa(rec), c=calcAfa(afa);
  var docsHtml=Object.keys(AFA_DOC_LABELS).map(function(k){
    return '<div class="afa-inf-row"><span>'+esc(AFA_DOC_LABELS[k])+'</span><b>'+(afa.docs[k]?'✓':'✕')+'</b></div>';
  }).join('');
  return '<div class="afa-inf-brand"><img src="./logo-icon-gold.png" alt=""><div><div style="font-family:\'Fraunces\',serif;font-size:15px;color:var(--navy)">AORAES</div><span>Departamento Español</span></div></div>'+
    '<div class="afa-inf-title">Informe de amortización (AfA)</div>'+
    '<div class="afa-inf-sub">'+esc(rec.name||'Cliente')+' · '+new Date().toLocaleDateString('es-DE')+'</div>'+
    '<div class="afa-inf-sec"><h4>Datos del inmueble</h4>'+
      '<div class="afa-inf-row"><span>Bundesland</span><b>'+esc(afa.bundesland)+' ('+afa.itpPct+'% Grunderwerbsteuer)</b></div>'+
      '<div class="afa-inf-row"><span>Precio de compra</span><b>'+eur(afa.precioCompra)+'</b></div>'+
      '<div class="afa-inf-row"><span>Notaría + registro + otros</span><b>'+eur(c.notarioRegistro+(afa.otrosGastos||0))+'</b></div>'+
      '<div class="afa-inf-row"><span>Valor del suelo</span><b>'+(afa.sueloPendiente?'Pendiente (Steuerberater)':eur(c.sueloEfectivo))+'</b></div>'+
      (afa.valorCocina>0?('<div class="afa-inf-row"><span>Cocina (deducción año 1)</span><b>'+eur(afa.valorCocina)+'</b></div>'):'')+
    '</div>'+
    '<div class="afa-inf-sec"><h4>Cálculo de la amortización</h4>'+
      '<div class="afa-inf-row"><span>Nebenkosten</span><b>'+eur(c.nebenkosten)+'</b></div>'+
      '<div class="afa-inf-row total"><span>Base amortizable (Gebäudewert)</span><b>'+eur(c.baseAmortizable)+'</b></div>'+
    '</div>'+
    '<div class="afa-inf-sec"><h4>AfA estándar (sin Gutachten)</h4>'+
      '<div class="afa-inf-row"><span>% AfA legal</span><b>'+c.pctEstandar.toFixed(2).replace('.',',')+'%</b></div>'+
      '<div class="afa-inf-row total"><span>AfA anual estándar</span><b>'+eur(c.perdidaEstandarAnual)+'</b></div>'+
    '</div>'+
    (afa.tieneGutachten&&c.pctGutachten!=null?(
    '<div class="afa-inf-sec"><h4>AfA según Restnutzungsdauergutachten</h4>'+
      '<div class="afa-inf-row"><span>Vida útil restante (Gutachten)</span><b>'+afa.restnutzungsdauerGutachten+' años</b></div>'+
      '<div class="afa-inf-row"><span>% AfA según Gutachten</span><b>'+c.pctGutachten.toFixed(2).replace('.',',')+'%</b></div>'+
      '<div class="afa-inf-row total"><span>AfA anual según Gutachten</span><b>'+eur(c.perdidaGutachtenAnual)+'</b></div>'+
      '<div class="afa-inf-row"><span>'+(c.diferenciaAnual>=0?'Gasto fiscal deducible adicional':'Gasto fiscal deducible menor')+' vs. estándar</span><b>'+eur(Math.abs(c.diferenciaAnual))+'</b></div>'+
    '</div>'
    ):'')+
    (afa.hipotecaInteresesAnual>0?('<div class="afa-inf-sec"><h4>Gasto corriente (no AfA)</h4><div class="afa-inf-row"><span>Intereses de hipoteca (anual)</span><b>'+eur(afa.hipotecaInteresesAnual)+'</b></div></div>'):'')+
    '<div class="afa-inf-sec"><h4>Checklist de documentos</h4>'+docsHtml+'</div>';
}

// Texto plano para copiar y pegar en el correo real al Steuerberater — nunca mailto: (no puede
// adjuntar archivos por seguridad del navegador), así que el asesor pega esto y adjunta a mano
// los documentos marcados en el checklist.
function buildAfaSteuerberaterText(rec){
  var afa=normalizeAfa(rec), c=calcAfa(afa);
  var keys=Object.keys(AFA_DOC_LABELS);
  var adjuntos=keys.filter(function(k){return afa.docs[k];}).map(function(k){return '- '+AFA_DOC_LABELS[k];});
  var faltan=keys.filter(function(k){return !afa.docs[k];}).map(function(k){return '- '+AFA_DOC_LABELS[k];});
  var lines=[];
  lines.push('Estimados Seseman/Rosa,');
  lines.push('');
  lines.push('Les remitimos el expediente de amortización (AfA) de nuestro cliente '+(rec.name||'')+' para su inclusión en la declaración anual de la renta.');
  lines.push('');
  lines.push('Datos del inmueble:');
  lines.push('- Bundesland: '+afa.bundesland+' (Grunderwerbsteuer '+afa.itpPct+'%)');
  lines.push('- Precio de compra: '+eur(afa.precioCompra));
  lines.push('- Nebenkosten (ITP + notaría + registro + otros): '+eur(c.nebenkosten));
  lines.push('- Valor del suelo: '+(afa.sueloPendiente?'pendiente de cálculo por su parte':eur(c.sueloEfectivo)));
  if(afa.valorCocina>0) lines.push('- Cocina (deducción íntegra año 1): '+eur(afa.valorCocina));
  lines.push('- Base amortizable (Gebäudewert): '+eur(c.baseAmortizable));
  lines.push('- AfA estándar: '+c.pctEstandar.toFixed(2).replace('.',',')+'% anual → '+eur(c.perdidaEstandarAnual));
  if(afa.tieneGutachten && c.pctGutachten!=null){
    lines.push('- Restnutzungsdauergutachten: '+afa.restnutzungsdauerGutachten+' años → '+c.pctGutachten.toFixed(2).replace('.',',')+'% anual → '+eur(c.perdidaGutachtenAnual));
    lines.push('- Gasto fiscal deducible '+(c.diferenciaAnual>=0?'adicional':'menor')+' vs. estándar: '+eur(Math.abs(c.diferenciaAnual))+' (no es ahorro fiscal directo, depende del tipo impositivo del cliente)');
  }
  if(afa.hipotecaInteresesAnual>0) lines.push('- Intereses de hipoteca (gasto corriente anual): '+eur(afa.hipotecaInteresesAnual));
  lines.push('');
  lines.push('Recomendamos tramitarlo mediante la declaración anual consolidada, no mediante notificación previa mensual, para minimizar el riesgo de auditoría del Gutachten.');
  lines.push('');
  lines.push('Adjuntamos:');
  lines=lines.concat(adjuntos.length?adjuntos:['(pendiente de adjuntar documentación)']);
  if(faltan.length){
    lines.push('');
    lines.push('Aún pendientes de recibir:');
    lines=lines.concat(faltan);
  }
  lines.push('');
  lines.push('Un saludo,');
  return lines.join('\n');
}

// Eventos de la pantalla de AfA: index.html los llama antes de sus propias ramas; si devuelven true, ya está atendido.
function afaOnClick(e){
  var afaDoc=e.target.closest('[data-afa-doc]');
      if(afaDoc){
        if(!APP_HOST.wsRec) return true;
        normalizeAfa(APP_HOST.wsRec).docs[afaDoc.getAttribute('data-afa-doc')]=afaDoc.checked;
        scheduleAfaSave();
        return true;
      }
      var afaChk=e.target.closest('[data-afa-check]');
      if(afaChk){
        if(!APP_HOST.wsRec) return true;
        var afaC=normalizeAfa(APP_HOST.wsRec); afaC[afaChk.getAttribute('data-afa-check')]=afaChk.checked;
        var secAfaC=document.getElementById('sec-afa'); if(secAfaC) secAfaC.innerHTML=afaBlock(APP_HOST.wsRec);
        scheduleAfaSave();
        return true;
      }
      var afaPrint=e.target.closest('#afa-print-btn');
      if(afaPrint){
        if(!APP_HOST.wsRec) return true;
        document.getElementById('afa-inf-body').innerHTML=buildAfaInforme(APP_HOST.wsRec);
        document.getElementById('afa-informe').classList.remove('inm');
        document.getElementById('afa-informe').classList.add('on');
        window.print();
        return true;
      }
      var afaCopy=e.target.closest('#afa-copy-btn');
      if(afaCopy){
        if(!APP_HOST.wsRec) return true;
        var afaTxt=buildAfaSteuerberaterText(APP_HOST.wsRec);
        var afaOk=document.getElementById('afa-copy-ok');
        (navigator.clipboard&&navigator.clipboard.writeText?navigator.clipboard.writeText(afaTxt):Promise.reject()).then(function(){
          if(afaOk){ afaOk.hidden=false; setTimeout(function(){afaOk.hidden=true;},2200); }
        }).catch(function(){
          // Fallback si el navegador bloquea el portapapeles moderno (p. ej. sin HTTPS o permiso
          // denegado): un textarea temporal + execCommand('copy'), soportado en todos lados.
          var ta=document.createElement('textarea'); ta.value=afaTxt; ta.style.position='fixed'; ta.style.opacity='0';
          document.body.appendChild(ta); ta.select();
          try{ document.execCommand('copy'); if(afaOk){ afaOk.hidden=false; setTimeout(function(){afaOk.hidden=true;},2200); } }catch(e2){}
          document.body.removeChild(ta);
        });
        return true;
      }
  return false;
}
function afaOnInput(e){
  var t=e.target;
  var afaKey=t.getAttribute('data-afa-field');
      if(afaKey&&APP_HOST.wsRec){
        var afa=normalizeAfa(APP_HOST.wsRec);
        if(afaKey==='bundesland'){
          afa.bundesland=t.value;
          afa.itpPct=AFA_BUNDESLAND_ITP[t.value]||afa.itpPct;
          var secAfaB=document.getElementById('sec-afa'); if(secAfaB) secAfaB.innerHTML=afaBlock(APP_HOST.wsRec);
        } else {
          var afaVal=parseFloat(t.value); afa[afaKey]=isNaN(afaVal)?0:afaVal;
          refreshAfaResults();
        }
        scheduleAfaSave();
      }
  return false;
}

if(typeof module!=='undefined'&&module.exports){ module.exports={ AFA_BUNDESLAND_ITP, defaultAfa, calcAfa, normalizeAfa }; }
