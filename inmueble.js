/* Proyecto inmobiliario — pantalla (Comprar y Refinanciar), presentación, informe A4, guardado y eventos.
   Los cálculos viven en calc.js; esto solo pinta y reacciona. Se carga como script clásico ANTES del script principal de index.html:
   las funciones quedan como globales y el script principal las llama (inmuebleBlock, refreshInmuebleResults, presOpen, ...).
   Lo que necesita del resto de la app (cliente abierto, almacenamiento) lo recibe por APP_HOST, que define index.html:
   APP_HOST.wsRec / wsId (el cliente abierto), CLIENTS_KEY, readLocalClientsRaw(), writeClientFile(id). */
var inmSaveTimer=null;

function inmuebleOptField(opt,key,label,val,step,suffix,extra){
  return '<label class="inm-f"><span>'+esc(label)+'</span><span class="inm-inp-wrap"><input type="number" class="inm-inp" data-inm-opt="'+opt+'" data-inm-field="'+key+'" value="'+val+'" step="'+step+'" '+(extra||'')+'><span class="inm-suf">'+suffix+'</span></span></label>';
}

// Botones de valores típicos para rellenar un campo numérico de un toque, en vez de tener que
// escribirlo — el campo objetivo se lee de data-inm-quickfield, así sirve para cualquier campo
// (interesPrestamo, tilgungInicial, tilgungsbeitragPerMille), no solo para el tipo del banco.
function inmuebleQuickButtons(field,values,unit){
  return '<div class="inm-quick">'+values.map(function(v){return '<button type="button" data-inm-quickfield="'+field+'" data-inm-quickval="'+v+'">'+String(v).replace('.',',')+unit+'</button>';}).join('')+'</div>';
}

// Solo el precio/plazo del ahorro y el tipo del préstamo se ven a simple vista — son los
// datos que un cliente sin idea de inmuebles reconoce al momento. El resto (Tilgung/
// Tilgungsbeitrag, comisión, Zinsbindung, interés del ahorro) ya trae puesto el valor
// estándar que usaría un banco/Bausparkasse por defecto, y queda oculto en "Opciones
// avanzadas" — ahí sigue disponible por si hay que ajustar uno a una oferta real concreta.
function inmuebleOptionCard(opt,title,cfg,note,bausparsumme,inmCtx){
  var basic='', advanced='';
  var withAhorro=(opt==='a'||opt==='b'||opt==='refiA'||opt==='refiB');
  var withAnios=(opt==='a'||opt==='b');
  if(opt==='refiA'||opt==='refiB'){
    // El ritmo de ahorro mensual es de lo primero que el cliente quiere ajustar (puede no llegar a la cuota calculada y
    // compensarlo con Sondertilgung), así que va visible también en modo simple.
    basic+=inmuebleOptField(opt,'pagoAhorro','Pago mensual de ahorro (0 = calculado; fija cuánto se ahorra hasta la refinanciación)',cfg.pagoAhorro||0,'50','€/mes','min="0"');
    advanced+=inmuebleOptField(opt,'pagoPrestamo','Pago mensual del préstamo (0 = calculado; fija el plazo)',cfg.pagoPrestamo||0,'50','€/mes','min="0"');
  }
  if(withAnios){
    basic+=inmuebleOptField(opt,'pagoAhorro','Pago mensual de ahorro (0 = calculado; fija los años de ahorro)',cfg.pagoAhorro||0,'50','€/mes','min="0"');
    advanced+=inmuebleOptField(opt,'pagoPrestamo','Pago mensual del préstamo (0 = calculado; fija el plazo)',cfg.pagoPrestamo||0,'50','€/mes','min="0"');
  }
  if(withAhorro){
    basic+='<div class="inm-adv">'+inmuebleOptField(opt,'pct','% ahorrado',cfg.pct,'1','%','min="0" max="100"');
    if(withAnios) basic+=inmuebleOptField(opt,'anios','Años de ahorro (mínimo '+String(BAUSPAR_MIN_ANIOS).replace('.',',')+')',cfg.anios,'0.1','años','min="3.6" max="40"');
    // Lo básico que se ve sin abrir "Opciones avanzadas": cuánto dura el ahorro (mínimo real,
    // normalmente 3,5 años) y cuánto dura el préstamo — este último SÍ lo elige el cliente, así
    // que va aquí, no escondido. Por debajo se sigue guardando como Tilgungsbeitrag fijo en ‰;
    // ver bausparPlazoActual() y el manejador de data-inm-plazo más abajo.
    basic+='<label class="inm-f"><span>Plazo del préstamo</span><span class="inm-inp-wrap"><input type="number" class="inm-inp" data-inm-opt="'+opt+'" data-inm-plazo="1" value="'+bausparPlazoActual(bausparsumme,cfg)+'" step="0.5" min="1" max="40"><span class="inm-suf">años</span></span></label></div>';
    advanced+=inmuebleOptField(opt,'sonderAhorro','Sonderzahlung anual durante el ahorro (0 = ninguna)',cfg.sonderAhorro||0,'500','€/año','min="0"');
    advanced+=inmuebleOptField(opt,'interesAhorro','Interés del ahorro',cfg.interesAhorro,'0.01','%','min="0" max="20"');
    // Aviso: el Guthabenzins de un Bausparvertrag ronda el 0,05 %; más de 0,5 % suele ser el interés del préstamo escrito en el campo equivocado.
    advanced+='<div class="inm-warn inm-warn-ahorro"'+((cfg.interesAhorro>0.5)?'':' hidden')+'><span>Un interés del ahorro superior al 0,5 % es poco habitual en un Bausparvertrag.</span> <span>¿Lo has confundido con el interés del préstamo?</span><div class="inm-quick"><span>Valor habitual</span><button type="button" data-inm-quickfield="interesAhorro" data-inm-quickval="0.05">0,05 %</button></div></div>';
  }
  basic+=(withAhorro?'<div class="inm-adv">':'')+inmuebleOptField(opt,'interesPrestamo','Interés del préstamo',cfg.interesPrestamo,'0.01','%','min="0" max="20"')+(withAhorro?'</div>':'');
  if(opt==='banco'||opt==='refiBanco'){
    basic+=inmuebleQuickButtons('interesPrestamo',[2,3,4,4.2,5],'%');
    // Plazo y Zinsbindung del banco, a la vista: es lo primero que se ajusta con el cliente ("¿a 30 años?"). El plazo se guarda como la
    // Tilgung inicial equivalente (ver tilgungParaPlazo) y se mantiene al cambiar el interés mientras no se toque la Tilgung a mano.
    basic+='<label class="inm-f"><span>Plazo del préstamo</span><span class="inm-inp-wrap"><input type="number" class="inm-inp" data-inm-opt="'+opt+'" data-inm-bankplazo="1" value="'+bancoPlazoActual(cfg)+'" step="1" min="5" max="40"><span class="inm-suf">años</span></span></label>';
    basic+=inmuebleOptField(opt,'zinsbindung','Vigencia del tipo (Zinsbindung)',cfg.zinsbindung,'1','años','min="1" max="40"');
  }
  basic+=inmuebleOptField(opt,'sondertilgung','Sondertilgung anual',cfg.sondertilgung||0,'500','€/año','min="0"');
  // La Tilgung/Tilgungsbeitrag salió de "Opciones avanzadas" a pedido explícito — el valor por
  // defecto (el mismo que ya traía cada campo) sigue usándose en el cálculo tal cual, solo que
  // ya no se ve ni se puede tocar desde aquí; confundía más de lo que ayudaba a explicar.
  advanced+=inmuebleOptField(opt,'topeST','Tope anual de Sondertilgung (0 = sin tope)',cfg.topeST||0,'0.5','% del préstamo','min="0" max="100"');
  advanced+=inmuebleOptField(opt,'comision','Comisión de apertura',cfg.comision,'0.1','%','min="0" max="10"');
  if(opt==='banco'||opt==='refiBanco'){
    advanced+='<label class="inm-f"><span>Líneas de banco en la gráfica (tipos en %, separados por espacios; vacío = ninguna)</span><span class="inm-inp-wrap"><input type="text" class="inm-inp" id="inm-curva-tipos" inputmode="decimal" value="'+esc(inmuebleCurvaTipos(inmCtx).map(function(x){ return String(x).replace('.',','); }).join('; '))+'" placeholder="3; 4; 5"></span></label>';
  }
  if(opt==='banco'){
    advanced+=inmuebleOptField(opt,'marcaAnios','Línea dorada del gráfico (años; 0 = ninguna)',cfg.marcaAnios==null?10:cfg.marcaAnios,'1','años','min="0" max="40"');
  }
  if(opt==='banco'||opt==='refiBanco'){
    advanced+=inmuebleOptField(opt,'pagoPre','Pago mensual antes de la Zinsbindung (0 = calculado)',cfg.pagoPre||0,'50','€/mes','min="0"');
  }
  return '<div class="inm-card" data-inm-card="'+opt+'"><h4>'+esc(title)+'</h4>'+(note?'<p class="inm-note inm-adv">'+esc(note)+'</p>':'')+basic+
    '<details class="inm-advanced inm-adv"><summary>Más opciones</summary>'+advanced+'</details></div>';
}

function inmuebleModeToggle(modo){
  return '<div class="inm-mode" role="tablist" aria-label="Modo del proyecto inmobiliario">'+
    ['compra:Comprar','refi:Refinanciar'].map(function(p){var a=p.split(':');var on=(a[0]===modo);return '<button type="button" data-inm-mode="'+a[0]+'"'+(on?' class="active"':'')+' aria-pressed="'+(on?'true':'false')+'">'+a[1]+'</button>';}).join('')+
  '</div>';
}

// Nombre único para cada estrategia, usado en el selector, la tarjeta de entrada y la de
// resultado — antes decían "clásica"/"acelerada" en unos sitios y el % en otros, y la propia
// "acelerada" tenía MÁS años que la "clásica" (5 contra 3,5): confundía porque el nombre
// prometía velocidad que el dato no cumplía. El % ahorrado es lo único que de verdad define
// cada estrategia — los años son solo un dato editable, no una promesa del nombre.
// En Comprar, cada estrategia tiene su propio cfg.anios (editable). En Refinanciar, refi.a/refi.b
// no tienen "anios" propio — los años de ahorro son los que quedan hasta la fecha de
// refinanciación, calculados aparte — así que aquí se puede forzar con aniosOverride en vez de
// leer un campo que en refi simplemente no existe (por eso salía "undefined años").
function inmuebleEstNombre(cfg){
  return (cfg.pct||0)+'% ahorro';
}

// Una sola estrategia Bausparvertrag a la vez frente al banco (no las dos fusionadas): deja
// sitio a la tarjeta para la línea de tiempo y el resto de detalle.
function inmuebleStrategyToggle(activeKey,opts){
  return '<div class="inm-strategy" role="tablist" aria-label="Estrategia Bausparvertrag a comparar">'+
    opts.map(function(o){var on=(o.key===activeKey);return '<button type="button" data-inm-strategy="'+o.key+'"'+(on?' class="active"':'')+' aria-pressed="'+(on?'true':'false')+'">'+esc(o.label)+'</button>';}).join('')+
  '</div>';
}

function inmuebleRefiCurrentCard(refi){
  return '<div class="inm-card"><h4>Tu crédito actual</h4><p class="inm-note">Cuéntanos del crédito que el cliente ya tiene.</p>'+
    inmuebleOptField('refiActual','importeOriginal','¿Cuánto pidió prestado originalmente?',refi.importeOriginal,'1000','€','min="0"')+
    inmuebleOptField('refiActual','interesOriginal','¿Qué tasa de interés le dieron?',refi.interesOriginal,'0.01','%','min="0" max="20"')+
    inmuebleOptField('refiActual','plazoOriginal','¿A cuántos años lo pidió?',refi.plazoOriginal,'1','años','min="1" max="40"')+
    '<div class="inm-adv">'+inmuebleOptField('refiActual','cuotaActual','Cuota mensual actual (0 = calculada)',refi.cuotaActual||0,'50','€/mes','min="0"')+
    inmuebleOptField('refiActual','saldoHoy','Saldo pendiente hoy (0 = calculado)',refi.saldoHoy||0,'1000','€','min="0"')+'</div>'+
    '<label class="inm-f"><span>¿Cuándo empezó el crédito?</span><input type="date" class="inm-inp" id="inm-refi-fecha-inicio" value="'+esc(refi.fechaInicio||'')+'"></label>'+
    '<label class="inm-f inm-adv"><span>¿Cuándo planea refinanciar?</span><input type="date" class="inm-inp" id="inm-refi-fecha-objetivo" value="'+esc(refi.fechaRefi||'')+'"></label>'+
    '<div id="inm-refi-saldo-wrap">'+inmuebleRefiSaldoHTML(refi)+'</div>'+
  '</div>';
}

function inmuebleRefiSaldoHTML(refi){
  var rem=calcRefiRemaining(refi);
  var fr=fechaRefiEfectiva(refi);
  var mesesHastaRefi=mesesEntreFechas(todayISO(),fr);
  var saldoAtRefi=saldoEnFecha(refi,fr);
  return '<div class="ws-field"><span class="k">Saldo pendiente hoy</span><span class="v">'+eur(rem.saldoPendiente)+'</span></div>'+
    '<div class="ws-field"><span class="k">Años hasta refinanciar</span><span class="v">'+fmtAnos(mesesHastaRefi)+'</span></div>'+
    '<div class="ws-field"><span class="k">Saldo estimado en esa fecha</span><span class="v">'+eur(saldoAtRefi)+'</span></div>';
}

// La barra de tiempo, no solo el número: el mismo objetivo que la comparación de precio —
// que el cliente lo vea de un vistazo, sin tener que leer las cifras. "risk" marca el banco
// directo porque su certeza de tipo durante TODO el plazo es el caso favorable, no lo habitual
// (ver aviso de Zinsbindung/Anschlussfinanzierung en la cabecera del bloque).
// esperaMeses: en Refinanciar, los meses que aún quedan pagando el crédito ACTUAL antes de que
// arranque siquiera la nueva opción — sin sumarlos aquí, la barra y el total "hasta terminar de
// pagar" contradecían a la frase de cabecera (inmuebleFraseRefi), que sí los cuenta.
function inmuebleTimeRow(r,maxMeses,isBanco,esperaMeses){
  esperaMeses=esperaMeses||0;
  var totalConEspera=esperaMeses+r.mesesTotal;
  var pctWidth=maxMeses>0?Math.max(4,Math.round(totalConEspera/maxMeses*100)):0;
  var detalle=(r.mesesAhorro>0)
    ?(fmtAnos(r.mesesAhorro)+' de ahorro + '+fmtAnos(r.mesesPrestamo)+' de préstamo')
    :(fmtAnos(r.mesesPrestamo)+' de préstamo');
  if(esperaMeses>0) detalle=fmtAnos(esperaMeses)+' de espera + '+detalle;
  return '<div class="inm-time"><div class="inm-time-lab"><span>Tiempo total hasta terminar de pagar</span><b>'+fmtAnos(totalConEspera)+'</b></div>'+
    '<div class="inm-time-bar'+(isBanco?' risk':'')+'"><span style="width:'+pctWidth+'%"></span></div>'+
    '<div class="inm-time-lab"><span>'+detalle+'</span></div></div>';
}

// Cuántos años del plazo del préstamo tienen el tipo REALMENTE garantizado. En un Bausparvertrag
// es todo el plazo: el tipo se pacta hoy con la Bausparkasse para toda la Darlehensphase (así lo
// dice el propio Lernskript: "Zinssicherungskonto... sichert langfristig niedrige Zinsen"). En un
// banco directo, tal como se modela aquí con una cuota constante todo el plazo, solo está
// garantizado durante la Zinsbindung que el asesor indique — el resto es el caso favorable, no
// lo habitual: pasada la Zinsbindung, el saldo (Restschuld) se refinancia al tipo que haya
// entonces (Anschlussfinanzierung), y la cuota puede subir.
function inmuebleCertRow(r,zinsbindungAnios,isBanco){
  var totalAnios=r.mesesPrestamo/12;
  var certAnios=isBanco?Math.min(zinsbindungAnios||0,totalAnios):totalAnios;
  var pctCert=totalAnios>0?Math.max(0,Math.min(100,Math.round(certAnios/totalAnios*100))):100;
  var nota=isBanco
    ?(pctCert>=100
      ?'La Zinsbindung indicada cubre todo el plazo del préstamo — caso favorable, confírmalo con la oferta real del banco.'
      :'Tras la Zinsbindung, el saldo pendiente se refinancia (Anschlussfinanzierung) al tipo que haya en ese momento — la cuota puede subir.')
    :'Tipo pactado hoy con la Bausparkasse para toda la fase de préstamo, no depende del mercado en ese momento.';
  return '<div class="inm-cert"><div class="inm-cert-lab"><span>Tipo garantizado</span><b>'+fmtAnos(certAnios*12)+' de '+fmtAnos(totalAnios*12)+'</b></div>'+
    '<div class="inm-cert-bar"><span class="cert" style="width:'+pctCert+'%"></span><span class="uncert" style="width:'+(100-pctCert)+'%"></span></div>'+
    '<div class="inm-cert-note">'+nota+'</div></div>';
}

// extra (opcional): {zuteilung: mes de la Zuteilung, ahorro:{hasta:mes, total:€, base:'precio'|'banco'}} — marca el ahorro acumulado (zona
// sombreada entre la línea de arriba y la del Bausparvertrag hasta la Zuteilung) y dibuja la línea de la Zuteilung.
function inmuebleCurvaSVG(precio,ptsEst,ptsBanco,mesesAhorroEst,mesesZinsbindung,extra){
  var W=600,H=232,padL=44,padR=10,padT=20,padB=24;
  var maxMeses=Math.max(ptsEst[ptsEst.length-1].meses,ptsBanco[ptsBanco.length-1].meses,1);
  var escAct=(extra&&extra.escenarios||[]).filter(function(e){ return e.activo; });
  escAct.forEach(function(e){ maxMeses=Math.max(maxMeses,e.pts[e.pts.length-1].meses); });
  var maxY=Math.max(precio,1);
  var colorBanco='var(--gold-deep)';
  function px(m){ return padL+(m/maxMeses)*(W-padL-padR); }
  function py(v){ return padT+(1-(v/maxY))*(H-padT-padB); }
  function path(pts){ return pts.map(function(p,i){ return (i===0?'M':'L')+px(p.meses).toFixed(1)+','+py(p.pendiente).toFixed(1); }).join(' '); }
  var valorEn=inmuebleValorEn;
  var gridY=[0,0.25,0.5,0.75,1].map(function(f){
    var v=maxY*f, yy=py(v);
    return '<line x1="'+padL+'" y1="'+yy.toFixed(1)+'" x2="'+(W-padR)+'" y2="'+yy.toFixed(1)+'" stroke="var(--line-soft)" stroke-width="1"/>'+
      '<text x="'+(padL-6)+'" y="'+(yy+3).toFixed(1)+'" font-size="9" fill="var(--faint)" text-anchor="end">'+Math.round(v/1000)+'k</text>';
  }).join('');
  var maxAnios=Math.ceil(maxMeses/12), stepAnios=maxAnios<=10?2:(maxAnios<=20?5:10), gridX='';
  for(var a=0;a<=maxAnios;a+=stepAnios){
    var xx=px(a*12);
    gridX+='<line x1="'+xx.toFixed(1)+'" y1="'+padT+'" x2="'+xx.toFixed(1)+'" y2="'+(H-padB)+'" stroke="var(--line-soft)" stroke-width="1"/>'+
      '<text x="'+xx.toFixed(1)+'" y="'+(H-padB+13)+'" font-size="9" fill="var(--faint)" text-anchor="middle">'+a+'</text>';
  }
  var marca=(mesesAhorroEst>0 && mesesAhorroEst<maxMeses)?'<line x1="'+px(mesesAhorroEst).toFixed(1)+'" y1="'+padT+'" x2="'+px(mesesAhorroEst).toFixed(1)+'" y2="'+(H-padB)+'" stroke="var(--gold)" stroke-width="1" stroke-dasharray="3,3"/>':'';
  // Marca aparte (distinto color/trazo que la Zuteilung) para la Zinsbindung del banco directo —
  // el momento real en que un banco tradicional obliga a refinanciar (Anschlussfinanzierung),
  // no cuando termina de pagarse el Bausparvertrag. Sin esto, esa fecha solo aparecía como texto
  // más abajo, y en el gráfico no había forma de "verla" comparada contra ambas curvas.
  var marcaZins=(mesesZinsbindung>0 && mesesZinsbindung<maxMeses)
    ?'<line x1="'+px(mesesZinsbindung).toFixed(1)+'" y1="'+padT+'" x2="'+px(mesesZinsbindung).toFixed(1)+'" y2="'+(H-padB)+'" stroke="var(--navy-2)" stroke-width="1" stroke-dasharray="2,4"/>'+
      '<text x="'+px(mesesZinsbindung).toFixed(1)+'" y="'+(padT+9).toFixed(1)+'" font-size="9" font-weight="700" fill="var(--navy-2)" text-anchor="middle">Zinsbindung</text>'
    :'';
  // Franja "ya lo tienes pagado": desde que el Bausparvertrag llega a cero hasta el final del
  // banco, el hueco entre las dos líneas es la ventaja ya conseguida — se sombrea en dorado
  // suave bajo la curva del banco, no se resalta la del banco como si fuera el problema.
  var finEst=ptsEst[ptsEst.length-1].meses, area='', callout='';
  if(finEst<maxMeses-1){
    var yBase=py(0);
    var poly=[px(finEst).toFixed(1)+','+yBase.toFixed(1)];
    ptsBanco.filter(function(p){return p.meses>=finEst;}).forEach(function(p){ poly.push(px(p.meses).toFixed(1)+','+py(p.pendiente).toFixed(1)); });
    poly.push(px(maxMeses).toFixed(1)+','+yBase.toFixed(1));
    area='<polygon points="'+poly.join(' ')+'" fill="var(--gold)" fill-opacity="0.13"/>';
    var yBancoAhi=valorEn(ptsBanco,finEst);
    callout='<circle cx="'+px(finEst).toFixed(1)+'" cy="'+yBase.toFixed(1)+'" r="3.5" fill="var(--navy)"/>'+
      '<text x="'+px(finEst).toFixed(1)+'" y="'+(yBase-8).toFixed(1)+'" font-size="10" font-weight="700" fill="var(--navy)" text-anchor="middle">Pagado ('+fmtAnos(finEst)+')</text>'+
      '<circle cx="'+px(finEst).toFixed(1)+'" cy="'+py(yBancoAhi).toFixed(1)+'" r="3.5" fill="'+colorBanco+'"/>'+
      // eur() usa Intl.NumberFormat, que en es-ES separa el número del símbolo con un espacio
      // de NO separación (U+00A0) — un .replace(' €','') con espacio normal no lo detecta y
      // dejaba el símbolo duplicado ("112.356 € € aún"). \s sí cubre el NBSP.
      '<text x="'+px(finEst).toFixed(1)+'" y="'+(py(yBancoAhi)-8).toFixed(1)+'" font-size="10" font-weight="700" fill="'+colorBanco+'" text-anchor="middle">'+eur(yBancoAhi).replace(/\s*€/,'')+' € aún</text>';
  }
  var ahorroArea='', zuteil='';
  if(extra && extra.ahorro && extra.ahorro.hasta>0 && extra.ahorro.total>0){
    var hA=extra.ahorro.hasta, poly2=[];
    if(extra.ahorro.base==='banco'){
      ptsBanco.filter(function(p){return p.meses<=hA;}).forEach(function(p){ poly2.push(px(p.meses).toFixed(1)+','+py(p.pendiente).toFixed(1)); });
      poly2.push(px(hA).toFixed(1)+','+py(valorEn(ptsBanco,hA)).toFixed(1));
      poly2.push(px(hA).toFixed(1)+','+py(valorEn(ptsEst,hA)).toFixed(1));
      ptsEst.filter(function(p){return p.meses<hA;}).reverse().forEach(function(p){ poly2.push(px(p.meses).toFixed(1)+','+py(p.pendiente).toFixed(1)); });
    } else {
      poly2.push(px(0).toFixed(1)+','+py(precio).toFixed(1));
      ptsEst.filter(function(p){return p.meses<=hA;}).forEach(function(p){ poly2.push(px(p.meses).toFixed(1)+','+py(p.pendiente).toFixed(1)); });
      poly2.push(px(hA).toFixed(1)+','+py(valorEn(ptsEst,hA)).toFixed(1));
      poly2.push(px(hA).toFixed(1)+','+py(precio).toFixed(1));
    }
    ahorroArea='<polygon points="'+poly2.join(' ')+'" fill="var(--navy)" fill-opacity="0.10"/>'+
      '<text x="'+(px(hA)-9).toFixed(1)+'" y="'+(py(valorEn(ptsEst,hA))+16).toFixed(1)+'" font-size="10" font-weight="700" fill="var(--navy)" text-anchor="end">Ahorrado</text>';
  }
  if(extra && extra.zuteilung>0 && extra.zuteilung<maxMeses){
    var zx=px(extra.zuteilung).toFixed(1);
    zuteil='<line x1="'+zx+'" y1="'+padT+'" x2="'+zx+'" y2="'+(H-padB)+'" stroke="var(--navy)" stroke-opacity="0.55" stroke-width="1" stroke-dasharray="4,3"/>'+
      '<circle cx="'+zx+'" cy="'+py(valorEn(ptsEst,extra.zuteilung)).toFixed(1)+'" r="3.5" fill="var(--navy)"/>'+
      '<text x="'+zx+'" y="'+(padT+9)+'" font-size="9" font-weight="700" fill="var(--navy)" text-anchor="middle">Zuteilung</text>';
    // La etiqueta de la Zinsbindung baja una fila si cae pegada a la de la Zuteilung.
    if(marcaZins && Math.abs(px(mesesZinsbindung)-px(extra.zuteilung))<70) marcaZins=marcaZins.replace('y="'+(padT+9).toFixed(1)+'"','y="'+(padT+21).toFixed(1)+'"');
  }
  var escLineas=escAct.map(function(e){
    var fin=e.pts[e.pts.length-1];
    return '<path d="'+path(e.pts)+'" fill="none" stroke="'+e.color+'" stroke-width="1.8" stroke-dasharray="5,3"/>'+
      '<text x="'+(px(fin.meses)-2).toFixed(1)+'" y="'+(py(0)-6).toFixed(1)+'" font-size="9" font-weight="700" fill="'+e.color+'" text-anchor="end">'+inmuebleFmtPct(e.r)+'</text>';
  }).join('');
  return '<svg viewBox="0 0 '+W+' '+H+'" class="inm-curve-svg" role="img" aria-label="Cuánto queda por pagar, comparado en el tiempo">'+
    area+ahorroArea+gridY+gridX+marca+marcaZins+zuteil+escLineas+
    '<path d="'+path(ptsBanco)+'" fill="none" stroke="'+colorBanco+'" stroke-width="2.5"/>'+
    '<path d="'+path(ptsEst)+'" fill="none" stroke="var(--navy)" stroke-width="2.5"/>'+
    callout+
    '</svg>';
}

// Botones discretos para encender/apagar cada línea de banco (el tooltip da la cuota de ese tipo).
function inmuebleCurvaChips(escen){
  if(!escen.length) return '';
  return '<div class="inm-curve-chips" role="group" aria-label="Escenarios de interés del banco"><span>Banco a</span>'+escen.map(function(e){
    return '<button type="button" class="inm-chip'+(e.activo?'':' off')+'" data-curva-tipo="'+e.r+'" aria-pressed="'+(e.activo?'true':'false')+'" style="--c:'+e.color+'"'+(e.cuota>0?' title="Cuota '+eur(e.cuota)+'/mes"':'')+'><i></i>'+inmuebleFmtPct(e.r)+'</button>';
  }).join('')+'</div>';
}
// Cuadro de hitos: en cada fecha, lo que QUEDA POR PAGAR con el banco y con el Bausparvertrag (las mismas cifras que las líneas de la gráfica).
// No se muestra la cifra ahorrada (en la gráfica solo la zona sombreada "Ahorrado"): una cantidad grande a la vista asusta al cliente.
function inmuebleHitosHTML(rows,nombreBaus,zFin){
  if(!rows.length) return '';
  var hayPost=false;
  var body=rows.map(function(r){
    var post=(zFin>0&&r.m>zFin&&r.banco>0.5); if(post) hayPost=true;
    return '<tr><td>'+r.n+'</td><td>'+fmtAnos(r.m)+'<small>'+inmuebleMesAnio(r.m)+'</small></td><td>'+eur(r.banco)+(post?'*':'')+'</td><td>'+eur(r.baus)+'</td></tr>';
  }).join('');
  return '<h6 class="inm-hitos-tit">Cuánto queda por pagar en cada hito</h6><table class="inm-tabla inm-hitos"><thead><tr><th>Hito</th><th>Cuándo</th><th>Banco</th><th>'+nombreBaus+'</th></tr></thead><tbody>'+body+'</tbody></table>'+
    (hayPost?'<p class="inm-curve-note"><span>* Tras la Zinsbindung el banco refinancia al tipo de ese momento: la cifra supone que el tipo no cambia.</span></p>':'');
}

// Titulares de la comparación. Antes decían "ahorras X € y terminas N años antes", pero esa cifra
// compara pagos mensuales distintos (p. ej. 1.979 €/mes durante el ahorro frente a 917 €/mes
// del banco) y años en los que el cliente aún no es propietario — presentarla como un ahorro
// induce a error. Ahora cada titular dice la diferencia de intereses y comisiones como lo que
// es (nominal), el pago mensual de cada camino y qué NO incluye. Cada variable va en su propio
// <b> para que el texto estático de alrededor siga siendo un nodo traducible por separado.
function inmuebleFraseRefi(etiqueta,euros,mesesDif,cuotaAhorro,certMesesEst,totalMesesEst,certMesesBanco,totalMesesBanco){
  // Cada frase en su <span>: si dos frases compartieran nodo de texto, el traductor no encontraría
  // ninguna de las dos en el diccionario.
  var h='<span>Con '+etiqueta+' pagas <b>'+eur(Math.abs(euros))+'</b> '+(euros>=0?'menos':'más')+' en intereses y comisiones que con el banco (nominal) y terminas de pagar <b>'+fmtAnos(Math.abs(mesesDif))+'</b> '+(mesesDif>=0?'antes.':'después.')+'</span>';
  if(cuotaAhorro>0) h+=' <span>Mientras esperas, pagas además <b>'+eur(cuotaAhorro)+'/mes</b> de ahorro.</span>';
  var certEstTxt=certMesesEst>=totalMesesEst?'todo el plazo':(fmtAnos(certMesesEst)+' de '+fmtAnos(totalMesesEst));
  var certBancoTxt=certMesesBanco>=totalMesesBanco?'todo el plazo':(fmtAnos(certMesesBanco)+' de '+fmtAnos(totalMesesBanco));
  h+=' <span>Tu cuota está garantizada <b>'+certEstTxt+'</b> — con el banco, solo <b>'+certBancoTxt+'</b>.</span>';
  return '<div class="inm-headline">'+h+'<div class="inm-headline-sub">No incluye alquiler, revalorización, impuestos ni lo que rendiría tu ahorro en otra parte.</div></div>';
}

function inmuebleFraseComprar(rEst,rk,igual,custom){
  var h, sub;
  var costeEst=rEst.interesTotalPrestamo+rEst.comision-rEst.interesGanadoAhorro;
  if(igual){
    h='<span>'+(custom?'Con un pago mensual del banco de':'Con el mismo pago mensual de')+' <b>'+eur(rk.cuotaPrestamo)+'/mes</b>, el banco termina en <b>'+fmtAnos(rk.mesesTotal)+'</b> y paga <b>'+eur(rk.interesTotalPrestamo+rk.comision)+'</b> de intereses y comisiones; el Bausparvertrag termina en <b>'+fmtAnos(rEst.mesesTotal)+'</b> y paga <b>'+eur(costeEst)+'</b>';
    h+=(rEst.mesesAhorro>0)?(' en intereses y comisiones, pero durante los primeros <b>'+fmtAnos(rEst.mesesAhorro)+'</b>, todavía no eres propietario.</span>'):' en intereses y comisiones.</span>';
    // Alquiler de equilibrio: ambos caminos terminan pagando el mismo precio, así que la diferencia
    // de desembolso en efectivo (costeTotal) es solo intereses y comisiones. Durante los meses de
    // ahorro el cliente del Bausparvertrag además sigue pagando su alquiler actual.
    var rentaEq=(rEst.mesesAhorro>0)?(rk.costeTotal-rEst.costeTotal)/rEst.mesesAhorro:null;
    if(rentaEq!=null && isFinite(rentaEq) && rentaEq>0){
      sub='Si hoy pagas más de <b>'+eur(rentaEq)+'/mes</b> de alquiler, el banco sale más barato en efectivo; si pagas menos, el Bausparvertrag. Sin contar revalorización, impuestos ni el rendimiento del ahorro.';
    } else if(rentaEq!=null && isFinite(rentaEq)){
      sub='El banco sale más barato en efectivo aun sin alquiler. Sin contar revalorización, impuestos ni el rendimiento del ahorro.';
    } else {
      sub='No incluye alquiler, revalorización, impuestos ni lo que rendiría tu ahorro en otra parte.';
    }
  } else {
    var dif=rk.costeTotal-rEst.costeTotal;
    h='<span>Con el Bausparvertrag pagas <b>'+eur(Math.abs(dif))+'</b> '+(dif>=0?'menos':'más')+' en intereses y comisiones (nominal).</span>';
    h+=(rEst.mesesAhorro>0)
      ?(' <span>Antes de ser propietario ahorras <b>'+eur(rEst.cuotaAhorro)+'/mes</b> durante <b>'+fmtAnos(rEst.mesesAhorro)+'</b>; después pagas <b>'+eur(rEst.cuotaPrestamo)+'/mes</b> con el tipo fijado hoy.</span>')
      :(' <span>Pagas <b>'+eur(rEst.cuotaPrestamo)+'/mes</b> con el tipo fijado hoy.</span>');
    h+=' <span>El banco: <b>'+eur(rk.cuotaPrestamo)+'/mes</b> durante <b>'+fmtAnos(rk.mesesTotal)+'</b>.</span>';
    sub='No incluye alquiler, revalorización, impuestos ni lo que rendiría tu ahorro en otra parte. Con «Mismo pago mensual» comparas en igualdad.';
  }
  return '<div class="inm-headline">'+h+'<div class="inm-headline-sub">'+sub+'</div></div>';
}

// mm/aaaa a N meses desde hoy — numérico a propósito (sin nombres de mes) para que no dependa del
// idioma con el que se dibujó el bloque.
// Modo simple (por defecto) u opciones avanzadas del Proyecto inmobiliario: en simple solo se ven los datos esenciales
// (precio, tipo del banco, opción de Bausparvertrag; en Refinanciar, el crédito actual); fechas, pagos fijos, Sondertilgung y
// el Bausparvertrag detallado quedan automáticos y aparecen al pulsar "Opciones avanzadas". Se recuerda por navegador.
var _inmAdv=false;

try{ _inmAdv=(localStorage.getItem('aoraes_inm_adv')==='1'); }catch(e){}

var _inmInicio='', _presRawPago={};

function inmuebleMesAnio(meses){
  var d=inmuebleInicioDate(_inmInicio); d.setMonth(d.getMonth()+Math.round(meses));
  return ('0'+(d.getMonth()+1)).slice(-2)+'/'+d.getFullYear();
}

function inmuebleCompareToggle(c,efectivo,pagoIgual){
  var hint=(c==='igual')
    ?(efectivo
      ?'El banco paga cada mes lo mismo que la cuota de ahorro del Bausparvertrag, desde el primer día — así se comparan en igualdad.'
      :'El pago mensual del Bausparvertrag no supera al del banco: no hace falta igualarlos.')
    :'Cada opción con sus propios pagos. El Bausparvertrag pide más al mes durante el ahorro; pulsa «Mismo pago mensual» para ver el banco con el mismo esfuerzo mensual.';
  return '<div class="inm-cmp-wrap"><span class="inm-cmp-lab">Cómo comparar</span></div><div class="inm-mode inm-cmp" role="tablist" aria-label="Cómo comparar">'+
    [['real','Cada camino como es'],['igual','Mismo pago mensual']].map(function(p){var on=(p[0]===c);return '<button type="button" data-inm-cmp="'+p[0]+'"'+(on?' class="active"':'')+' aria-pressed="'+(on?'true':'false')+'">'+p[1]+'</button>';}).join('')+
    '</div><p class="inm-eff-note inm-cmp-note">'+hint+'</p>'+
    (c==='igual'?'<label class="inm-f inm-inicio inm-adv"><span>Pago mensual igualado (0 = la cuota de ahorro)</span><span class="inm-inp-wrap"><input type="number" class="inm-inp" id="inm-pago-igual" step="50" min="0" value="'+(pagoIgual||0)+'"><span class="inm-suf">€/mes</span></span></label>':'');
}

function inmuebleRefiResultsHTML(refi,asParts,inm){
  var rem=calcRefiRemaining(refi);
  var fr=fechaRefiEfectiva(refi);
  var mesesHastaRefi=mesesEntreFechas(todayISO(),fr);
  var anosDisponibles=mesesHastaRefi/12;
  var saldoAtRefi=saldoEnFecha(refi,fr);
  var estKey=(refi.estrategia==='refiB')?'refiB':'refiA';
  var estCfg=(estKey==='refiB')?refi.b:refi.a;
  var estTitle='Badenia · '+inmuebleEstNombre(estCfg);
  // Si la fecha de refinanciación cae después de que el crédito original ya se habría
  // terminado de pagar solo, no se sigue pagando cuota en ese tramo — se limita al tiempo
  // que el crédito original realmente sigue vivo.
  var costeMientrasTanto=rem.cuotaOriginal*Math.min(mesesHastaRefi,rem.mesesRestantes);
  var rBanco=calcInmuebleOption(saldoAtRefi,{pct:0,anios:0,interesAhorro:0,interesPrestamo:refi.banco.interesPrestamo,tilgungInicial:refi.banco.tilgungInicial,comision:refi.banco.comision,zinsbindung:refi.banco.zinsbindung,sondertilgung:refi.banco.sondertilgung,topeST:refi.banco.topeST,pagoPre:refi.banco.pagoPre});
  var rEst=calcInmuebleOption(saldoAtRefi,{sinMinimoAhorro:true,pct:estCfg.pct,anios:anosDisponibles,interesAhorro:estCfg.interesAhorro,interesPrestamo:estCfg.interesPrestamo,tilgungsbeitragPerMille:estCfg.tilgungsbeitragPerMille,comision:estCfg.comision,sondertilgung:estCfg.sondertilgung,topeST:estCfg.topeST,sonderAhorro:estCfg.sonderAhorro,pagoAhorro:estCfg.pagoAhorro,pagoPrestamo:estCfg.pagoPrestamo,ahorroPorTiempo:true});
  var costeBancoAbs=costeMientrasTanto+rBanco.costeTotal;
  var costeEstAbs=costeMientrasTanto+rEst.costeTotal;
  var maxMeses=Math.max(mesesHastaRefi+rBanco.mesesTotal,mesesHastaRefi+rEst.mesesTotal,1);
  function baseRow(){
    return '<div class="inm-res-card"><h5>Tu crédito actual</h5>'+
      '<div class="inm-res-line"><span>Cuota actual</span><b>'+eur(rem.cuotaOriginal)+'/mes</b></div>'+
      '<div class="inm-res-line"><span>Interés restante</span><b>'+eur(rem.interesRestante)+'</b></div>'+
      '<div class="inm-res-line total"><span>Coste total restante</span><b>'+eur(rem.costeTotalSeguirIgual)+'</b></div>'+
    '</div>';
  }
  function row(title,r,costeAbs,destacar,isBanco){
    var ahorroVs=rem.costeTotalSeguirIgual-costeAbs;
    return '<div class="inm-res-card"><h5>'+esc(title)+'</h5>'+
      (r.cuotaAhorro>0?'<div class="inm-res-line"><span>Cuota ahorro</span><b>'+eur(r.cuotaAhorro)+'/mes</b></div>':'')+
      (r.cuotaAhorro>0&&r.sonderAhorro>0?'<div class="inm-res-line"><span>Sonderzahlung anual del ahorro</span><b>'+eur(r.sonderAhorro)+'/año</b></div>':'')+
      (r.sonderAhorroTope?'<div class="inm-res-line inm-eff-hint"><span>La Sonderzahlung se ha recortado: por sí sola cubriría casi todo el ahorro.</span></div>':'')+
      '<div class="inm-res-line"><span>Cuota préstamo</span><b>'+eur(r.cuotaPrestamo)+'/mes</b></div>'+
      ((!isBanco&&r.cuotaAhorro>0&&mesesHastaRefi<BAUSPAR_MIN_MESES)?'<div class="inm-res-warn"><span>Faltan menos de '+String(BAUSPAR_MIN_ANIOS).replace('.',',')+' años hasta la refinanciación: el Bausparvertrag no puede activarse antes.</span> <span>Esta comparación solo es realizable con una fecha de refinanciación posterior.</span></div>':'')+
      (r.noAmortiza?'<div class="inm-res-warn"><span>Con este pago el préstamo no se amortiza en menos de 100 años.</span> <span>Los años y los intereses son solo el tope del cálculo.</span></div>':'')+
      '<div class="inm-res-line"><span>Interés pagado</span><b>'+eur(r.interesTotalPrestamo)+'</b></div>'+
      (r.restschuldZinsbindung!=null?'<div class="inm-res-line"><span>Deuda pendiente al fin de la Zinsbindung</span><b>'+eur(r.restschuldZinsbindung)+'</b></div>':'')+
      (r.sondertilgung>0?'<div class="inm-res-line"><span>Con Sondertilgung de '+eur(r.sondertilgung)+'/año, intereses menos</span><b>'+eur(r.ahorroInteresST)+'</b></div><div class="inm-res-line"><span>Y terminas antes</span><b>'+fmtAnos(r.mesesAntesST)+'</b></div>':'')+
      (r.topeAplicado?'<div class="inm-res-line inm-eff-hint"><span>Tope aplicado: como máximo '+eur(r.sondertilgung)+'/año</span></div>':'')+
      (r.tasaEfectiva!=null?'<div class="inm-res-line inm-eff"><span>Interés efectivo del préstamo<span class="inm-eff-hint"> · nominal '+String(r.tasaNominal).replace('.',',')+'%</span></span><b>'+(r.tasaEfectiva*100).toFixed(2).replace('.',',')+'%</b></div>':'')+
      '<div class="inm-res-line total"><span>Coste total</span><b>'+eur(costeAbs)+'</b></div>'+
      '<div class="inm-res-line save"><span>'+(ahorroVs>=0?'Menos intereses y comisiones que seguir igual':'Más intereses y comisiones que seguir igual')+'</span><b>'+eur(Math.abs(ahorroVs))+'</b></div>'+
      inmuebleTimeRow(r,maxMeses,isBanco,mesesHastaRefi)+
      inmuebleCertRow(r,refi.banco.zinsbindung,isBanco)+
    '</div>';
  }
  var ptsBanco=inmuebleCurvaSaldoRefi(rem,refi,mesesHastaRefi,rBanco,refi.banco,false);
  var ptsEst=inmuebleCurvaSaldoRefi(rem,refi,mesesHastaRefi,rEst,estCfg,true);
  var escen=inmuebleCurvaTipos(inm).map(function(r,i){
    var cfgE=Object.assign({},refi.banco,{interesPrestamo:r});
    if(refi.banco.plazoObjetivo>0&&!(refi.banco.pagoPre>0)) cfgE.tilgungInicial=tilgungParaPlazo(r,refi.banco.plazoObjetivo);
    var rrE=calcInmuebleOption(saldoAtRefi,{pct:0,anios:0,interesAhorro:0,interesPrestamo:r,tilgungInicial:cfgE.tilgungInicial,comision:refi.banco.comision,zinsbindung:refi.banco.zinsbindung,sondertilgung:refi.banco.sondertilgung,topeST:refi.banco.topeST,pagoPre:refi.banco.pagoPre});
    return {r:r,color:INM_CURVA_COLORES[i],activo:(((inm&&inm.curvaOff)||[]).indexOf(r)<0),cuota:rrE.cuotaPrestamo,pts:inmuebleCurvaSaldoRefi(rem,refi,mesesHastaRefi,rrE,cfgE,false)};
  });
  var curva='<div class="inm-curve-card"><div class="inm-curve-head"><h5>Cuánto queda por pagar, año a año</h5>'+
    '<div class="inm-curve-legend"><span><i style="background:var(--navy)"></i>'+esc(estTitle)+'</span><span><i style="background:var(--gold-deep)"></i>Refinanciar con banco</span></div></div>'+inmuebleCurvaChips(escen)+
    inmuebleCurvaSVG(rem.saldoPendiente,ptsEst,ptsBanco,mesesHastaRefi,Math.round((refi.banco.zinsbindung||0)*12)+mesesHastaRefi,{escenarios:escen,zuteilung:(rEst.cuotaAhorro>0?mesesHastaRefi:0),ahorro:{hasta:(rEst.cuotaAhorro>0?mesesHastaRefi:0),total:rEst.objetivoAhorro,base:'banco'}})+
    '<p class="inm-curve-note">La línea de puntos dorada marca la fecha de refinanciación. Hasta entonces, las dos siguen pagando el crédito actual — en la opción Badenia, el ahorro corre en paralelo y ya descuenta de lo pendiente. La franja sombreada es lo que ya llevas de ventaja una vez terminas de pagar.</p>'+
    inmuebleHitosHTML(inmuebleHitosRefi(refi,mesesHastaRefi,rEst,rBanco,ptsEst,ptsBanco),'Badenia',mesesHastaRefi+Math.round((refi.banco.zinsbindung||0)*12))+
    '</div>';
  // Tiempo total desde HOY, no solo desde la refinanciación — rNew.mesesTotal no vale tal cual
  // para el banco porque no incluye la espera hasta refinanciar (su fase de ahorro es 0).
  var totalDesdeHoyEst=mesesHastaRefi+rEst.mesesPrestamo, totalDesdeHoyBanco=mesesHastaRefi+rBanco.mesesPrestamo;
  var frase=inmuebleFraseRefi('la opción Badenia',costeBancoAbs-costeEstAbs,totalDesdeHoyBanco-totalDesdeHoyEst,rEst.cuotaAhorro,
    rEst.mesesPrestamo,rEst.mesesPrestamo,Math.min((refi.banco.zinsbindung||0)*12,rBanco.mesesPrestamo),rBanco.mesesPrestamo);
  var cardsR='<div class="inm-results">'+baseRow()+row('Refinanciar con banco',rBanco,costeBancoAbs,false,true)+row(estTitle,rEst,costeEstAbs,false,false)+'</div>';
  var capR=inm?inmuebleCapacidadHTML(inm,saldoAtRefi,[['Tu crédito actual',rem.cuotaOriginal],['Refinanciar con banco',rBanco.cuotaPrestamo],['Badenia · ahorro',rEst.cuotaAhorro],['Badenia · préstamo',rEst.cuotaPrestamo]]):'';
  return asParts?{frase:frase,capacidad:capR,curva:curva,cards:cardsR,rem:rem,fr:fr,rEst:rEst,rBanco:rBanco}:(frase+capR+curva+cardsR);
}

function inmuebleResultsHTML(precio,inm,asParts){
  _inmInicio=inm.inicio||'';
  var estKey=(inm.estrategia==='b')?'b':'a';
  var estCfg=(estKey==='b')?inm.b:inm.a;
  var estTitle='Bausparvertrag · '+inmuebleEstNombre(estCfg);
  var rEst=calcInmuebleOption(precio,estCfg), rk0=calcInmuebleOption(precio,inm.banco);
  // Mismo pago mensual: el banco paga desde el mes 0 lo mismo que la cuota de ahorro. Solo tiene
  // sentido si esa cuota supera la del banco; si no, se deja como estaba.
  var payEq=(inm.pagoIgual>0)?inm.pagoIgual:rEst.cuotaAhorro;
  var igual=(inm.comparar==='igual' && precio>0 && payEq>rk0.cuotaPrestamo+0.5);
  var cfgBanco=inm.banco;
  if(igual) cfgBanco=Object.assign({},inm.banco,{pagoPre:0,tilgungInicial:Math.max(0,payEq*1200/precio-(inm.banco.interesPrestamo||0))});
  var rk=igual?calcInmuebleOption(precio,cfgBanco):rk0;
  var bancoTitle=igual?'Banco directo · mismo pago mensual':'Banco directo';
  var maxMeses=Math.max(rEst.mesesTotal,rk.mesesTotal,1);
  var dif=rk.costeTotal-rEst.costeTotal;
  var marcaMeses=Math.round((inm.banco.marcaAnios==null?10:Math.max(0,inm.banco.marcaAnios))*12);
  function row(title,r,isBanco){
    return '<div class="inm-res-card"><h5>'+esc(title)+'</h5>'+
      (r.cuotaAhorro>0?'<div class="inm-res-line"><span>Cuota ahorro</span><b>'+eur(r.cuotaAhorro)+'/mes</b></div>':'')+
      (r.cuotaAhorro>0&&r.sonderAhorro>0?'<div class="inm-res-line"><span>Sonderzahlung anual del ahorro</span><b>'+eur(r.sonderAhorro)+'/año</b></div>':'')+
      (r.sonderAhorroTope?'<div class="inm-res-line inm-eff-hint"><span>La Sonderzahlung se ha recortado: por sí sola cubriría casi todo el ahorro.</span></div>':'')+
      '<div class="inm-res-line"><span>Cuota préstamo</span><b>'+eur(r.cuotaPrestamo)+'/mes</b></div>'+
      (r.minAhorroAplicado?'<div class="inm-res-line inm-eff-hint"><span>El Bausparvertrag no se puede activar antes de '+String(BAUSPAR_MIN_ANIOS).replace('.',',')+' años: se usa ese mínimo.</span></div>':'')+
      (r.noAmortiza?'<div class="inm-res-warn"><span>Con este pago el préstamo no se amortiza en menos de 100 años.</span> <span>Los años y los intereses son solo el tope del cálculo.</span></div>':'')+
      '<div class="inm-res-line"><span>Interés pagado</span><b>'+eur(r.interesTotalPrestamo)+'</b></div>'+
      (r.restschuldZinsbindung!=null?'<div class="inm-res-line"><span>Deuda pendiente al fin de la Zinsbindung</span><b>'+eur(r.restschuldZinsbindung)+'</b></div>':'')+
      (r.sondertilgung>0?'<div class="inm-res-line"><span>Con Sondertilgung de '+eur(r.sondertilgung)+'/año, intereses menos</span><b>'+eur(r.ahorroInteresST)+'</b></div><div class="inm-res-line"><span>Y terminas antes</span><b>'+fmtAnos(r.mesesAntesST)+'</b></div>':'')+
      (r.topeAplicado?'<div class="inm-res-line inm-eff-hint"><span>Tope aplicado: como máximo '+eur(r.sondertilgung)+'/año</span></div>':'')+
      (r.tasaEfectiva!=null?'<div class="inm-res-line inm-eff"><span>Interés efectivo del préstamo<span class="inm-eff-hint"> · nominal '+String(r.tasaNominal).replace('.',',')+'%</span></span><b>'+(r.tasaEfectiva*100).toFixed(2).replace('.',',')+'%</b></div>':'')+
      '<div class="inm-res-line total"><span>Coste total</span><b>'+eur(r.costeTotal)+'</b></div>'+
      (!isBanco?'<div class="inm-res-line save"><span>'+(dif>=0?'Menos intereses y comisiones que el banco':'Más intereses y comisiones que el banco')+'</span><b>'+eur(Math.abs(dif))+'</b></div>':'')+
      inmuebleTimeRow(r,maxMeses,isBanco)+
      inmuebleCertRow(r,inm.banco.zinsbindung,isBanco)+
      '</div>';
  }
  var ptsEst=inmuebleCurvaSaldo(precio,rEst,estCfg), ptsBanco=inmuebleCurvaSaldo(precio,rk,cfgBanco);
  var escen=inmuebleCurvaTipos(inm).map(function(r,i){
    var cfgE=Object.assign({},cfgBanco,{interesPrestamo:r});
    if(igual) cfgE.tilgungInicial=Math.max(0,payEq*1200/precio-r); else if(cfgBanco.plazoObjetivo>0&&!(cfgBanco.pagoPre>0)) cfgE.tilgungInicial=tilgungParaPlazo(r,cfgBanco.plazoObjetivo);
    var rrE=calcInmuebleOption(precio,cfgE);
    return {r:r,color:INM_CURVA_COLORES[i],activo:((inm.curvaOff||[]).indexOf(r)<0),cuota:rrE.cuotaPrestamo,pts:inmuebleCurvaSaldo(precio,rrE,cfgE)};
  });
  var curva='<div class="inm-curve-card"><div class="inm-curve-head"><h5>Cuánto queda por pagar, año a año</h5>'+
    '<div class="inm-curve-legend"><span><i style="background:var(--navy)"></i>'+esc(estTitle)+'</span><span><i style="background:var(--gold-deep)"></i>'+esc(bancoTitle)+'</span></div></div>'+inmuebleCurvaChips(escen)+
    inmuebleCurvaSVG(precio,ptsEst,ptsBanco,marcaMeses,Math.round((inm.banco.zinsbindung||0)*12),{escenarios:escen,zuteilung:rEst.mesesAhorro,ahorro:{hasta:rEst.mesesAhorro,total:rEst.objetivoAhorro,base:'precio'}})+
    '<p class="inm-curve-note">'+(marcaMeses>0?'La línea de puntos dorada marca los '+(marcaMeses/12)+' años — el plazo al que un banco tradicional suele exigir refinanciación (Anschlussfinanzierung). ':'')+'La franja sombreada es lo que ya llevas de ventaja una vez terminas de pagar.</p>'+
    inmuebleHitosHTML(inmuebleHitosComprar(precio,rEst,rk,ptsEst,ptsBanco,Math.round((inm.banco.zinsbindung||0)*12)),'Bausparvertrag',Math.round((inm.banco.zinsbindung||0)*12))+
    '</div>';
  var parts={frase:inmuebleFraseComprar(rEst,rk,igual,inm.pagoIgual>0),capacidad:inmuebleCapacidadHTML(inm,precio,[['Banco directo',rk.cuotaPrestamo],['Bausparvertrag · ahorro',rEst.cuotaAhorro],['Bausparvertrag · préstamo',rEst.cuotaPrestamo]]),curva:curva,
    cards:'<div class="inm-results">'+row(estTitle,rEst,false)+row(bancoTitle,rk,true)+'</div>',rEst:rEst,rk:rk,estCfg:estCfg};
  return asParts?parts:(parts.frase+parts.capacidad+parts.curva+parts.cards);
}

// Capacidad de pago: regla de la DVAG (la vivienda no debería pasar del 30–35 % del ingreso neto del hogar; préstamo orientativo =
// sueldo neto anual x 8). Solo aparece si el asesor indica el ingreso. Orientativo: no sustituye el análisis de solvencia del banco.
function inmuebleCapacidadHTML(inm,fin,filas){
  var d=inmuebleCapacidadDatos(inm,fin,filas); if(!d) return '';
  var rows=d.filas.map(function(f){ return '<tr><td>'+f.label+'</td><td>'+eur(f.cuota)+'</td><td>'+Math.round(f.pct)+' %</td><td class="cap-'+f.cls+'">'+f.estado+'</td></tr>'; }).join('');
  return '<div class="inm-curve-card inm-cap"><div class="inm-curve-head"><h5>Capacidad de pago</h5></div>'+
    '<div class="inm-res-line cap-extra"><span>Ingreso neto mensual del hogar</span><b>'+eur(d.ingreso)+'</b></div>'+
    '<div class="inm-res-line"><span>Cuota máxima recomendada</span><b>'+eur(d.cuotaMax)+'/mes</b></div>'+
    '<div class="inm-res-line"><span>Préstamo orientativo (sueldo neto anual × 8)</span><b>'+eur(d.orientativo)+'</b></div>'+
    (fin>0?'<div class="inm-res-line cap-extra"><span>Importe a financiar</span><b>'+eur(fin)+(d.finSuperaOrientativo?' · por encima':'')+'</b></div>':'')+
    '<table class="inm-tabla inm-cap-tabla"><thead><tr><th>Cuota mensual</th><th>€/mes</th><th>Del ingreso</th><th>Estado</th></tr></thead><tbody>'+rows+'</tbody></table>'+
    '<p class="inm-curve-note"><span>Regla orientativa: la vivienda no debería pasar del 30–35 % del ingreso neto del hogar, y además de la cuota hay seguros, Grundsteuer y otros gastos.</span> <span>No sustituye el análisis de solvencia del banco.</span></p></div>';
}

function inmuebleFinLine(inm){
  if(!((inm.gastosPct||0)>0||(inm.capitalPropio||0)>0)) return '';
  var fin=inmuebleFin(inm);
  return '<div class="inm-fin"><div class="inm-res-line"><span>Importe a financiar</span><b>'+eur(fin)+'</b></div>'+(fin>0?'':'<p class="inm-curve-note"><span>Con ese capital propio no hay nada que financiar.</span></p>')+'</div>';
}

function inmuebleBlock(rec){
  var inm=normalizeInmueble(rec);
  var body=(inm.modo==='refi')
    ? '<div class="inm-toprow inm-precio-row"><label class="inm-f inm-precio"><span>Ingreso neto mensual del hogar (opcional)</span><span class="inm-inp-wrap"><input type="number" class="inm-inp" id="inm-ingreso" value="'+(inm.ingresoNeto||'')+'" step="100" min="0" placeholder="0"><span class="inm-suf">€</span></span></label></div>'+'<div class="inm-cmp-wrap inm-simple-only"><span class="inm-cmp-lab">Opción de Bausparvertrag</span></div>'+inmuebleStrategyToggle(inm.refi.estrategia,[
        {key:'refiA',label:inmuebleEstNombre(inm.refi.a)},
        {key:'refiB',label:inmuebleEstNombre(inm.refi.b)}
      ])+
      '<div class="inm-grid">'+
        inmuebleRefiCurrentCard(inm.refi)+
        inmuebleOptionCard('refiBanco','Refinanciar con banco',inm.refi.banco,'A tipo de mercado, sobre el saldo pendiente.',undefined,inm)+
        (inm.refi.estrategia==='refiA'
          ?inmuebleOptionCard('refiA','Badenia · '+inmuebleEstNombre(inm.refi.a),inm.refi.a,'Ahorro en paralelo hasta la fecha de refinanciación.',inm.refi.importeOriginal)
          :inmuebleOptionCard('refiB','Badenia · '+inmuebleEstNombre(inm.refi.b),inm.refi.b,'Ahorro en paralelo hasta la fecha de refinanciación.',inm.refi.importeOriginal))+
      '</div>'+
      '<div id="inm-results-wrap">'+inmuebleRefiResultsHTML(inm.refi,false,inm)+'</div>'
    : '<div class="inm-toprow inm-precio-row"><label class="inm-f inm-precio"><span>Precio del inmueble</span><span class="inm-inp-wrap"><input type="number" class="inm-inp" id="inm-precio" value="'+inm.precio+'" step="1000" min="0"><span class="inm-suf">€</span></span></label>'+
      '<label class="inm-f inm-precio"><span>Ingreso neto mensual del hogar (opcional)</span><span class="inm-inp-wrap"><input type="number" class="inm-inp" id="inm-ingreso" value="'+(inm.ingresoNeto||'')+'" step="100" min="0" placeholder="0"><span class="inm-suf">€</span></span></label>'+
      '<label class="inm-f inm-inicio inm-adv"><span>Mes de inicio</span><span class="inm-inp-wrap"><input type="month" class="inm-inp" id="inm-inicio" value="'+(inm.inicio||(function(){var d=new Date();return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2);})())+'"></span></label><label class="inm-f inm-inicio inm-adv"><span>Fecha de refinanciación</span><span class="inm-inp-wrap"><input type="month" class="inm-inp" id="inm-fecha-refi" value="'+inmuebleFechaRefiYM(inm)+'"></span></label></div>'+
      '<div class="inm-toprow inm-adv"><label class="inm-f inm-inicio"><span>Gastos de compra (% del precio · típico 7–12 %)</span><span class="inm-inp-wrap"><input type="number" class="inm-inp" id="inm-gastos" value="'+(inm.gastosPct||0)+'" step="0.5" min="0" max="30"><span class="inm-suf">%</span></span></label>'+
      '<label class="inm-f inm-inicio"><span>Límite de la cuota (% del ingreso)</span><span class="inm-inp-wrap"><input type="number" class="inm-inp" id="inm-ratio" value="'+(inm.ratioMax||35)+'" step="1" min="10" max="60"><span class="inm-suf">%</span></span></label>'+
      '<label class="inm-f inm-inicio"><span>Capital propio</span><span class="inm-inp-wrap"><input type="number" class="inm-inp" id="inm-capital" value="'+(inm.capitalPropio||0)+'" step="1000" min="0"><span class="inm-suf">€</span></span></label></div>'+
      '<div class="inm-cmp-wrap inm-simple-only"><span class="inm-cmp-lab">Opción de Bausparvertrag</span></div>'+inmuebleStrategyToggle(inm.estrategia,[
        {key:'a',label:inmuebleEstNombre(inm.a)},
        {key:'b',label:inmuebleEstNombre(inm.b)}
      ])+
      '<div class="inm-adv">'+inmuebleCompareToggle(inm.comparar,(function(){ var e=(inm.estrategia==='b')?inm.b:inm.a; var pe=(inm.pagoIgual>0)?inm.pagoIgual:calcInmuebleOption(inmuebleFin(inm),e).cuotaAhorro; return inmuebleFin(inm)>0 && pe>calcInmuebleOption(inmuebleFin(inm),inm.banco).cuotaPrestamo+0.5; })(),inm.pagoIgual)+'</div>'+
      '<div class="inm-grid">'+
        (inm.estrategia==='a'
          ?inmuebleOptionCard('a','Bausparvertrag · '+inmuebleEstNombre(inm.a),inm.a,'Los años de ahorro son un supuesto: la asignación (Zuteilung) de la Bausparkasse no está garantizada. Valores de ejemplo — sustituye por la ilustración oficial.',inmuebleFin(inm))
          :inmuebleOptionCard('b','Bausparvertrag · '+inmuebleEstNombre(inm.b),inm.b,'Los años de ahorro son un supuesto: la asignación (Zuteilung) de la Bausparkasse no está garantizada. Valores de ejemplo — sustituye por la ilustración oficial.',inmuebleFin(inm)))+
        inmuebleOptionCard('banco','Banco directo',inm.banco,'Sin fase de ahorro: se financia el 100% desde el inicio. En la práctica alemana el tipo solo suele fijarse (Zinsbindung) durante parte del plazo, no todo — ver aviso más abajo.',undefined,inm)+
      '</div>'+
      '<div id="inm-results-wrap">'+inmuebleFinLine(inm)+inmuebleResultsHTML(inmuebleFin(inm),inm)+'</div>';
  return '<div class="ws-card '+(_inmAdv?'inm-adv-mode':'inm-simple')+'"><h3>Proyecto inmobiliario</h3>'+
    '<div class="inm-toprow">'+inmuebleModeToggle(inm.modo)+'<div class="inm-actions"><button type="button" class="ws-cta inm-print" id="inm-pres-btn">🎬 Presentación</button><button type="button" class="ws-cta ghost inm-print" id="inm-print-btn">🖨 Imprimir informe</button><button type="button" class="ws-cta ghost inm-print inm-adv-btn" id="inm-adv-btn" aria-pressed="'+(_inmAdv?'true':'false')+'"><span class="inm-lab-open">⚙ Opciones avanzadas</span><span class="inm-lab-close">✕ Ocultar opciones avanzadas</span></button></div></div>'+
    '<p class="ws-lead inm-simple-only"><span>'+(inm.modo==='refi'?'Cuéntanos del crédito actual y el tipo del banco: el resto se calcula solo.':'Escribe el precio, el plazo y el tipo del banco, y el ahorro mensual: el resto se calcula solo.')+'</span> <span>Para ajustar fechas, pagos o Sondertilgung, pulsa «Opciones avanzadas».</span></p>'+
    '<p class="ws-lead inm-adv">'+(inm.modo==='refi'
      ?'Compara seguir con el crédito actual, refinanciar con banco a tipo de mercado, o refinanciar con Badenia a un tipo fijo sobre el saldo pendiente. Cálculo orientativo con amortización estándar.'
      :'Compara financiar la compra con un Bausparvertrag (fase de ahorro a interés casi nulo + préstamo a tipo fijo pactado hoy) frente a una hipoteca bancaria directa a tipo de mercado. Cálculo orientativo con amortización estándar; la Bausparkasse asigna el préstamo real según su propio algoritmo colectivo, que puede variar el plazo de ahorro.')+'</p>'+
    '<p class="inm-eff-note inm-adv">El <b>interés efectivo del préstamo</b> mide la fase de préstamo y ya descuenta la comisión de apertura sobre lo que el cliente recibe (en el Bausparvertrag, la parte de la Abschlussgebühr proporcional al préstamo, como en la Modellrechnung de Badenia). Es el mismo método (interés actuarial/IRR) que usa la PAngV alemana, distinto del nominal que se introduce como dato. No sustituye la oferta vinculante con el Effektiver Jahreszins real que dará el banco o la Bausparkasse.</p>'+
    (inm.modo!=='refi'?'<p class="inm-eff-note inm-adv">Una hipoteca bancaria alemana casi nunca fija el tipo para todo el plazo: lo normal es una <b>Zinsbindung</b> de 10-15 años, tras la cual el saldo pendiente (<b>Restschuld</b>) se refinancia al tipo que haya entonces (<b>Anschlussfinanzierung</b>). La certeza de tipo durante todo el plazo que muestra "Banco directo" aquí es el caso favorable — coméntalo con el cliente si su horizonte real es más largo que la Zinsbindung que le ofrecerán.</p>':'')+
    body+
  '</div>';
}

// Informe imprimible del Proyecto inmobiliario: reutiliza el overlay #afa-informe (mismo mecanismo
// y mismo @media print que el informe de AfA). Los resultados se generan con LAS MISMAS funciones que
// la pantalla (inmuebleResultsHTML / inmuebleRefiResultsHTML), así cifras, gráficas y textos
// coinciden exactamente; aquí solo se añade la cabecera de marca, los datos de partida y los
// supuestos y límites. El nombre del cliente solo sale si hay cliente (no en modo genérico).
function inmuebleLimitsHTML(inm){
  var conCostes=!!(inm&&((inm.gastosPct||0)>0||(inm.capitalPropio||0)>0));
  return '<ul>'+
    '<li>Cálculo orientativo con amortización estándar: no es una oferta ni una cotización de ningún banco ni Bausparkasse.</li>'+
    '<li>Los años de ahorro son un supuesto: la asignación (Zuteilung) de la Bausparkasse no está garantizada y puede variar.</li>'+
    '<li>Los tipos de interés son datos introducidos, no pronósticos.</li>'+
    (conCostes?'<li>No incluye alquiler, revalorización, impuestos ni lo que rendiría el ahorro en otra parte; los gastos de compra y el capital propio indicados solo cambian el importe a financiar.</li>':'<li>No incluye alquiler, revalorización, impuestos, gastos de compra ni lo que rendiría el ahorro en otra parte.</li>')+
    '<li>Para decidir hace falta la ilustración oficial (Modellrechnung) y la oferta vinculante con el Effektiver Jahreszins.</li>'+
  '</ul>';
}

function inmuebleBigs(items){
  return '<div class="inm-bigs">'+items.map(function(i){
    var v=(i[2]&&i[2].t==='date')?'<b><input type="date" class="inm-pres-pago inm-pres-date" data-pres-pago="'+i[2].f+'" value="'+esc(i[2].v)+'"></b>':i[2]?'<b><input type="text" inputmode="decimal" class="inm-pres-pago inm-pres-pago-big" data-pres-pago="'+i[2].f+'" value="'+esc(_presRawPago[i[2].f]!=null?_presRawPago[i[2].f]:(i[2].u==='%'?String(Math.round(i[2].v*100)/100).replace('.',','):String(Math.round(i[2].v))))+'"> '+(i[2].u||'€/mes')+'</b>':'<b>'+i[1]+'</b>';
    return '<div class="inm-big">'+v+'<span>'+i[0]+'</span></div>'; }).join('')+'</div>';
}

function inmuebleFmtPct(x){ return String(Math.round((x||0)*100)/100).replace('.',',')+'%'; }

function inmuebleFmtFecha(iso){ var d=iso?new Date(iso+'T00:00:00'):null; return (d&&!isNaN(d.getTime()))?d.toLocaleDateString('es-DE'):'—'; }

// Datos de partida (informe) para Comprar o Refinanciar.
function inmuebleDatosHTML(inm){
  function row(k,v){ return '<div class="afa-inf-row"><span>'+k+'</span><b>'+v+'</b></div>'; }
  var pct=inmuebleFmtPct;
  // Sonderzahlung anual del ahorro: editable en la vista previa; sin valor se oculta al imprimir (clase vacio).
  function rowSonder(cfg){
    if(!(cfg.pct>0)) return '';
    var v=cfg.sonderAhorro||0;
    return '<div class="afa-inf-row inm-inf-opt'+(v>0?'':' vacio')+'"><span>Sonderzahlung anual</span><b><input type="text" inputmode="decimal" class="inm-inf-in" data-inf-sonder="1" value="'+(v>0?String(Math.round(v)):'')+'" placeholder="0"> €/año</b></div>';
  }
  if(inm.modo==='refi'){
    var rf=inm.refi, rem=calcRefiRemaining(rf), estCfg=(rf.estrategia==='refiB')?rf.b:rf.a;
    return '<div class="afa-inf-sec"><h4>Datos de la simulación</h4>'+
      row('Crédito original',eur(rf.importeOriginal))+row('Interés original',pct(rf.interesOriginal))+row('Plazo original',fmtAnos((rf.plazoOriginal||0)*12))+
      row('Fecha de inicio',inmuebleFmtFecha(rf.fechaInicio))+row('Saldo pendiente hoy',eur(rem.saldoPendiente))+row('Fecha de refinanciación',inmuebleFmtFecha(fechaRefiEfectiva(rf)))+
      '</div><div class="afa-inf-sec"><h4>Refinanciar con banco</h4>'+row('Interés del préstamo',pct(rf.banco.interesPrestamo))+row('Vigencia del tipo (Zinsbindung)',fmtAnos((rf.banco.zinsbindung||0)*12))+
      '</div><div class="afa-inf-sec"><h4>Bausparvertrag</h4>'+row('% ahorrado',pct(estCfg.pct))+row('Interés del ahorro',pct(estCfg.interesAhorro))+row('Interés del préstamo',pct(estCfg.interesPrestamo))+row('Comisión de apertura',pct(estCfg.comision))+rowSonder(estCfg)+'</div>';
  }
  var e=(inm.estrategia==='b')?inm.b:inm.a, rE=calcInmuebleOption(inmuebleFin(inm),e);
  return '<div class="afa-inf-sec"><h4>Datos de la simulación</h4>'+row('Precio del inmueble',eur(inm.precio))+((inm.gastosPct||0)>0?row('Gastos de compra',pct(inm.gastosPct)):'')+((inm.capitalPropio||0)>0?row('Capital propio',eur(inm.capitalPropio)):'')+(inmuebleFin(inm)!==inm.precio?row('Importe a financiar',eur(inmuebleFin(inm))):'')+row('Mes de inicio',inmuebleMesAnio(0))+row('Cómo comparar',inm.comparar==='igual'?'Mismo pago mensual':'Cada camino como es')+
    '</div><div class="afa-inf-sec"><h4>Bausparvertrag</h4>'+row('% ahorrado',pct(e.pct))+row('Años de ahorro',fmtAnos(rE.mesesAhorro))+row('Interés del ahorro',pct(e.interesAhorro))+row('Interés del préstamo',pct(e.interesPrestamo))+row('Plazo del préstamo',fmtAnos(rE.mesesPrestamo))+row('Comisión de apertura',pct(e.comision))+rowSonder(e)+
    '</div><div class="afa-inf-sec"><h4>Banco directo</h4>'+row('Interés del préstamo',pct(inm.banco.interesPrestamo))+row('Vigencia del tipo (Zinsbindung)',fmtAnos((inm.banco.zinsbindung||0)*12))+'</div>';
}

// Informe A4: cada hoja es un bloque .inm-page con salto de página propio y sin cortes internos
// (ver CSS); los resultados salen de las mismas funciones que la pantalla.
function buildInmuebleInforme(rec){
  var inm=normalizeInmueble(rec), generic=(rec.id==='aoraes_generic');
  _inmInicio=inm.inicio||'';
  var fecha=new Date().toLocaleDateString('es-DE');
  var P=(inm.modo==='refi')?inmuebleRefiResultsHTML(inm.refi,true,inm):inmuebleResultsHTML(inmuebleFin(inm),inm,true);
  function foot(){ return '<div class="inm-inf-foot"><span>Modelo de cálculo: proyecto inmobiliario</span> <span>v2 · '+fecha+'</span></div>'; }
  function page(inner){ return '<section class="inm-page">'+inner+foot()+'</section>'; }
  var brand='<div class="afa-inf-brand"><img src="./logo-icon-gold.png" alt=""><div><div style="font-family:\'Fraunces\',serif;font-size:15px;color:var(--navy)">AORAES</div><span>Departamento Español</span></div></div>'+
    '<div class="afa-inf-title">Informe del proyecto inmobiliario</div>'+
    '<div class="afa-inf-sub">'+(generic?'<span>Simulación sin cliente</span>':'<span data-no-i18n>'+esc(rec.name||'Cliente')+'</span>')+' · '+fecha+'</div>';
  var limits='<div class="afa-inf-sec inm-inf-limits"><h4>Supuestos y límites</h4>'+inmuebleLimitsHTML(inm)+'</div>';
  var pages;
  if(inm.modo==='refi'){
    pages=[page(brand+'<div class="inm-inf-data">'+inmuebleDatosHTML(inm)+'</div>'+P.frase+limits),
           page('<div class="afa-inf-sec"><h4>Resultados</h4></div>'+P.curva+(P.capacidad||'')),
           page(P.cards)];
  } else {
    pages=[page(brand+'<div class="inm-inf-data">'+inmuebleDatosHTML(inm)+'</div>'+P.frase+limits),
           page('<div class="afa-inf-sec"><h4>Resultados</h4></div>'+P.curva+(P.capacidad||'')),
           page(P.cards)];
  }
  _infRec=rec;
  return '<div class="inm-inf">'+pages.join('')+'</div>';
}

// Diapositivas de la presentación: una idea por pantalla, cifras grandes, mismas funciones.
function buildInmuebleSlides(rec){
  var inm=normalizeInmueble(rec); _inmInicio=inm.inicio||'';
  var limits='<div class="inm-pres-limits">'+inmuebleLimitsHTML(inm)+'</div>';
  var sl=[];
  if(inm.modo==='refi'){
    var P=inmuebleRefiResultsHTML(inm.refi,true,inm), rf=inm.refi;
    sl.push({t:'Tu crédito actual',h:inmuebleBigs([['Saldo pendiente hoy',eur(P.rem.saldoPendiente),{f:'saldoHoy',v:P.rem.saldoPendiente,u:'€'}],['Fecha de refinanciación',inmuebleFmtFecha(fechaRefiEfectiva(rf)),{f:'fechaRefi',v:fechaRefiEfectiva(rf),t:'date'}],['Crédito original',eur(rf.importeOriginal),{f:'importeOriginal',v:rf.importeOriginal,u:'€'}],['Interés original',inmuebleFmtPct(rf.interesOriginal),{f:'interesOriginal',v:rf.interesOriginal,u:'%'}]])});
    var cuotasR=[['Cuota actual',eur(P.rem.cuotaOriginal)+'/mes',{f:'cuotaActual',v:P.rem.cuotaOriginal}]];
    if(P.rEst.cuotaAhorro>0){ cuotasR.push(['Cuota ahorro',eur(P.rEst.cuotaAhorro)+'/mes',{f:'pagoAhorro',v:P.rEst.cuotaAhorro}]); var eCfgR=(rf.estrategia==='refiB')?rf.b:rf.a; cuotasR.push(['Interés del ahorro',inmuebleFmtPct(eCfgR.interesAhorro),{f:'interesAhorro',v:eCfgR.interesAhorro||0,u:'%'}]); cuotasR.push(['Sonderzahlung anual',eur(eCfgR.sonderAhorro||0)+'/año',{f:'sonderAhorro',v:eCfgR.sonderAhorro||0,u:'€/año'}]); }
    cuotasR.push(['Cuota préstamo',eur(P.rEst.cuotaPrestamo)+'/mes',{f:'pagoPrestamo',v:P.rEst.cuotaPrestamo}]);
    cuotasR.push(['Refinanciar con banco',eur(P.rBanco.cuotaPrestamo)+'/mes',{f:'pagoPre',v:P.rBanco.cuotaPrestamo}]);
    sl.push({t:'Tu pago cada mes',h:inmuebleBigs(cuotasR)});
    if(P.capacidad) sl.push({t:'Capacidad de pago',h:P.capacidad});
    sl.push({t:'Cuánto debes con el tiempo',h:P.curva});
    sl.push({t:'Comparación',h:P.frase+P.cards});
    sl.push({t:'Qué tener en cuenta',h:limits});
  } else {
    var Q=inmuebleResultsHTML(inmuebleFin(inm),inm,true), rE=Q.rEst, rk=Q.rk;
    sl.push({t:'La propiedad',h:inmuebleBigs([['Precio del inmueble',eur(inm.precio)],].concat(inmuebleFin(inm)!==inm.precio?[['Importe a financiar',eur(inmuebleFin(inm))]]:[]).concat([['Mes de inicio',inmuebleMesAnio(0)],['Años de ahorro',fmtAnos(rE.mesesAhorro)],['Banco directo',inmuebleFmtPct(inm.banco.interesPrestamo)]]))});
    var cuotas=[]; if(rE.cuotaAhorro>0){ cuotas.push(['Cuota ahorro',eur(rE.cuotaAhorro)+'/mes',{f:'pagoAhorro',v:rE.cuotaAhorro}]); var eCfg=(inm.estrategia==='b')?inm.b:inm.a; cuotas.push(['Interés del ahorro',inmuebleFmtPct(eCfg.interesAhorro),{f:'interesAhorro',v:eCfg.interesAhorro||0,u:'%'}]); cuotas.push(['Sonderzahlung anual',eur(eCfg.sonderAhorro||0)+'/año',{f:'sonderAhorro',v:eCfg.sonderAhorro||0,u:'€/año'}]); } cuotas.push(['Cuota préstamo',eur(rE.cuotaPrestamo)+'/mes',{f:'pagoPrestamo',v:rE.cuotaPrestamo}]); cuotas.push(['Banco directo',eur(rk.cuotaPrestamo)+'/mes',{f:(inm.comparar==='igual'?'pagoIgual':'pagoPre'),v:rk.cuotaPrestamo}]);
    sl.push({t:'Tu pago cada mes',h:inmuebleBigs(cuotas)});
    if(Q.capacidad) sl.push({t:'Capacidad de pago',h:Q.capacidad});
    sl.push({t:'Cuánto debes con el tiempo',h:Q.curva});
    sl.push({t:'Comparación',h:Q.frase+Q.cards});
    sl.push({t:'Qué tener en cuenta',h:limits});
  }
  return sl;
}

var _presSlides=[], _presIdx=0, _presRec=null, _infRec=null;

function presFit(){
  var st=document.getElementById('inm-pres-stage'), inn=document.getElementById('inm-pres-inner'); if(!st||!inn) return;
  inn.style.transform='none'; inn.style.width='1000px';
  var h=inn.offsetHeight, sc=Math.min(st.clientWidth/1000*0.97, st.clientHeight/Math.max(h,1)*0.97, 1.5);
  inn.style.transform='scale('+sc+')';
  inn.style.left=Math.max(0,(st.clientWidth-1000*sc)/2)+'px'; inn.style.top=Math.max(0,(st.clientHeight-h*sc)/2)+'px';
}

function presShow(i){
  if(!_presSlides.length) return;
  _presIdx=Math.max(0,Math.min(_presSlides.length-1,i));
  var sl=_presSlides[_presIdx];
  document.getElementById('inm-pres-title').textContent=sl.t;
  document.getElementById('inm-pres-inner').innerHTML=sl.h;
  document.getElementById('inm-pres-dots').innerHTML=_presSlides.map(function(_,k){ return '<i class="'+(k===_presIdx?'on':'')+'" data-pres-go="'+k+'"></i>'; }).join('');
  document.getElementById('inm-pres-prev').disabled=(_presIdx===0);
  document.getElementById('inm-pres-next').disabled=(_presIdx===_presSlides.length-1);
  presFit(); setTimeout(presFit,80);
}

function presOpen(rec){
  _presRec=rec; _presSlides=buildInmuebleSlides(rec); var ov=document.getElementById('inm-pres'); ov.hidden=false; presShow(0);
}

function presClose(){
  var ov=document.getElementById('inm-pres'); if(ov.hidden) return; ov.hidden=true;
  var secP=document.getElementById('sec-inmueble'); if(secP&&APP_HOST.wsRec) secP.innerHTML=inmuebleBlock(APP_HOST.wsRec);
  try{ if(document.fullscreenElement) document.exitFullscreen(); }catch(e){}
}

function refreshInmuebleResults(){
  if(!APP_HOST.wsRec||!APP_HOST.wsRec.inmueble) return;
  var inm=APP_HOST.wsRec.inmueble;
  var el=document.getElementById('inm-results-wrap'); if(!el) return;
  if(inm.modo==='refi'){
    el.innerHTML=inmuebleRefiResultsHTML(inm.refi,false,inm);
    var sw=document.getElementById('inm-refi-saldo-wrap'); if(sw) sw.innerHTML=inmuebleRefiSaldoHTML(inm.refi);
  } else {
    el.innerHTML=inmuebleFinLine(inm)+inmuebleResultsHTML(inmuebleFin(inm),inm);
  }
}

function persistInmueble(){
  if(!APP_HOST.wsId||!APP_HOST.wsRec||!APP_HOST.wsRec.inmueble) return;
  var arr=APP_HOST.readLocalClientsRaw();
  for(var i=0;i<arr.length;i++){
    if(arr[i].id===APP_HOST.wsId){ arr[i].inmueble=APP_HOST.wsRec.inmueble; arr[i].savedAt=new Date().toISOString(); break; }
  }
  try{ localStorage.setItem(APP_HOST.CLIENTS_KEY,JSON.stringify(arr)); }catch(e){ console.error('AORAES: fallo al guardar el proyecto inmobiliario',e); }
  APP_HOST.writeClientFile(APP_HOST.wsId);
}

function scheduleInmuebleSave(){
  if(inmSaveTimer) clearTimeout(inmSaveTimer);
  inmSaveTimer=setTimeout(persistInmueble,500);
}

// Si se navega fuera del Proyecto inmobiliario (otro cliente, "Volver a la cartera", o se cierra
// la pestaña) antes de que salte scheduleInmuebleSave, el timer pendiente se queda apuntando a un
// wsId/wsRec que para entonces ya cambiaron — el guardado real nunca llega a ejecutarse y la
// edición se pierde en silencio. flushInmuebleSave() fuerza ese guardado ANTES de que wsId/wsRec
// cambien de valor.
function flushInmuebleSave(){
  if(inmSaveTimer){ clearTimeout(inmSaveTimer); inmSaveTimer=null; persistInmueble(); }
}

window.addEventListener('beforeunload',flushInmuebleSave);

// Eventos de clic y de teclado de la pantalla del módulo: index.html los llama antes de sus propias ramas y, si devuelven true, ya está atendido.
function inmuebleOnClick(e){
  var cTipo=e.target.closest('#inm-results-wrap [data-curva-tipo]');
  if(cTipo){
    // Encender/apagar una línea de banco de la gráfica (se guarda en la ficha: la presentación y el informe lo respetan).
    if(!APP_HOST.wsRec||!APP_HOST.wsRec.inmueble) return true;
    inmuebleToggleCurvaTipo(normalizeInmueble(APP_HOST.wsRec),parseFloat(cTipo.getAttribute('data-curva-tipo')));
    refreshInmuebleResults(); scheduleInmuebleSave();
    return true;
  }
  var rt=e.target.closest('[data-inm-quickfield]');
      if(rt){ var card=rt.closest('.inm-card'); var inp=card&&card.querySelector('[data-inm-field="'+rt.getAttribute('data-inm-quickfield')+'"]'); if(inp){ inp.value=rt.getAttribute('data-inm-quickval'); inp.dispatchEvent(new Event('input',{bubbles:true})); } return true; }
      var md=e.target.closest('[data-inm-mode]');
      if(md){
        if(!APP_HOST.wsRec) return true;
        normalizeInmueble(APP_HOST.wsRec).modo=md.getAttribute('data-inm-mode');
        var sec=document.getElementById('sec-inmueble'); if(sec) sec.innerHTML=inmuebleBlock(APP_HOST.wsRec);
        scheduleInmuebleSave();
        return true;
      }
      var cm=e.target.closest('[data-inm-cmp]');
      if(cm){
        if(!APP_HOST.wsRec) return true;
        normalizeInmueble(APP_HOST.wsRec).comparar=(cm.getAttribute('data-inm-cmp')==='igual')?'igual':'real';
        var sec3=document.getElementById('sec-inmueble'); if(sec3) sec3.innerHTML=inmuebleBlock(APP_HOST.wsRec);
        scheduleInmuebleSave();
        return true;
      }
      var st=e.target.closest('[data-inm-strategy]');
      if(st){
        if(!APP_HOST.wsRec) return true;
        var inmSt=normalizeInmueble(APP_HOST.wsRec), key=st.getAttribute('data-inm-strategy');
        if(key==='refiA'||key==='refiB') inmSt.refi.estrategia=key; else inmSt.estrategia=key;
        var sec2=document.getElementById('sec-inmueble'); if(sec2) sec2.innerHTML=inmuebleBlock(APP_HOST.wsRec);
        scheduleInmuebleSave();
        return true;
      }
      var inmAdvBtn=e.target.closest('#inm-adv-btn');
      if(inmAdvBtn){
        var cardAdv=inmAdvBtn.closest('.ws-card'); if(!cardAdv) return true;
        _inmAdv=!cardAdv.classList.contains('inm-adv-mode');
        cardAdv.classList.toggle('inm-adv-mode',_inmAdv); cardAdv.classList.toggle('inm-simple',!_inmAdv);
        inmAdvBtn.setAttribute('aria-pressed',_inmAdv?'true':'false');
        try{ localStorage.setItem('aoraes_inm_adv',_inmAdv?'1':'0'); }catch(err){}
        return true;
      }
      var inmPres=e.target.closest('#inm-pres-btn');
      if(inmPres){
        if(!APP_HOST.wsRec||!APP_HOST.wsRec.inmueble) return true;
        presOpen(APP_HOST.wsRec);
        return true;
      }
      var inmPrint=e.target.closest('#inm-print-btn');
      if(inmPrint){
        if(!APP_HOST.wsRec||!APP_HOST.wsRec.inmueble) return true;
        document.getElementById('afa-inf-body').innerHTML=buildInmuebleInforme(APP_HOST.wsRec);
        document.getElementById('afa-informe').classList.add('on');
        window.print();
        return true;
      }
  return false;
}
function inmuebleOnInput(e){
  var t=e.target;
  if(t.id==='inm-curva-tipos'){
    // Tipos de las líneas de banco de la gráfica: "3; 4; 5" (hasta 4; vacío = ninguna). Lo no interpretable se ignora hasta que haya algo válido.
    if(!APP_HOST.wsRec) return true;
    var lista=inmuebleParseCurvaTipos(t.value);
    if(lista){
      var inmCT=normalizeInmueble(APP_HOST.wsRec); inmCT.curvaTipos=lista;
      inmCT.curvaOff=(inmCT.curvaOff||[]).filter(function(r){ return lista.indexOf(r)>=0; });
      refreshInmuebleResults(); scheduleInmuebleSave();
    }
    return true;
  }
  if(t.id==='inm-precio'){
        if(!APP_HOST.wsRec) return true;
        if(!APP_HOST.wsRec.inmueble) APP_HOST.wsRec.inmueble=defaultInmueble();
        var v=parseFloat(t.value); APP_HOST.wsRec.inmueble.precio=isNaN(v)?0:v;
        refreshInmuebleResults(); scheduleInmuebleSave();
        return true;
      }
      if(t.id==='inm-ingreso'||t.id==='inm-ratio'){
        if(!APP_HOST.wsRec) return true;
        var inmC=normalizeInmueble(APP_HOST.wsRec), vC=parseFloat(t.value);
        if(t.id==='inm-ingreso') inmC.ingresoNeto=(isNaN(vC)||vC<0)?0:vC; else if(vC>=10&&vC<=60) inmC.ratioMax=vC;
        refreshInmuebleResults(); scheduleInmuebleSave();
        return true;
      }
      if(t.id==='inm-gastos'||t.id==='inm-capital'){
        if(!APP_HOST.wsRec) return true;
        var inmG=normalizeInmueble(APP_HOST.wsRec), vG=parseFloat(t.value); vG=(isNaN(vG)||vG<0)?0:vG;
        if(t.id==='inm-gastos') inmG.gastosPct=Math.min(30,vG); else inmG.capitalPropio=vG;
        refreshInmuebleResults(); scheduleInmuebleSave();
        return true;
      }
      if(t.id==='inm-fecha-refi'){
        if(!APP_HOST.wsRec) return true;
        var inmY=normalizeInmueble(APP_HOST.wsRec), mY=/^(\d{4})-(\d{2})$/.exec(t.value), d0=inmuebleInicioDate(inmY.inicio);
        if(mY){
          var meses=(+mY[1]-d0.getFullYear())*12+(+mY[2]-1-d0.getMonth());
          if(meses>=1 && meses<=480){
            inmY.banco.zinsbindung=Math.round(meses/12*100)/100;
            var zi=document.querySelector('[data-inm-opt="banco"][data-inm-field="zinsbindung"]'); if(zi) zi.value=inmY.banco.zinsbindung;
            refreshInmuebleResults(); scheduleInmuebleSave();
          }
        }
        return true;
      }
      if(t.id==='inm-pago-igual'){
        if(!APP_HOST.wsRec) return true;
        var vI=parseFloat(t.value); normalizeInmueble(APP_HOST.wsRec).pagoIgual=(isNaN(vI)||vI<0)?0:vI;
        refreshInmuebleResults(); scheduleInmuebleSave();
        return true;
      }
      if(t.id==='inm-inicio'){
        if(!APP_HOST.wsRec) return true;
        var inmI=normalizeInmueble(APP_HOST.wsRec);
        if(/^\d{4}-\d{2}$/.test(t.value)) inmI.inicio=t.value; else delete inmI.inicio;
        inmuebleSyncFechaRefi(inmI);
        refreshInmuebleResults(); scheduleInmuebleSave();
        return true;
      }
      if(t.id==='inm-refi-fecha-inicio'){
        if(!APP_HOST.wsRec) return true;
        normalizeInmueble(APP_HOST.wsRec).refi.fechaInicio=t.value;
        refreshInmuebleResults(); scheduleInmuebleSave();
        return true;
      }
      if(t.id==='inm-refi-fecha-objetivo'){
        if(!APP_HOST.wsRec) return true;
        normalizeInmueble(APP_HOST.wsRec).refi.fechaRefi=t.value;
        refreshInmuebleResults(); scheduleInmuebleSave();
        return true;
      }
      var optPlazo=t.getAttribute('data-inm-opt');
      if(optPlazo&&t.hasAttribute('data-inm-plazo')&&APP_HOST.wsRec){
        var inmP=normalizeInmueble(APP_HOST.wsRec);
        var cfgP=(optPlazo==='refiA')?inmP.refi.a:(optPlazo==='refiB')?inmP.refi.b:inmP[optPlazo];
        var bausparsummeP=(optPlazo==='refiA'||optPlazo==='refiB')?inmP.refi.importeOriginal:inmuebleFin(inmP);
        var plazoAnios=parseFloat(t.value); plazoAnios=isNaN(plazoAnios)||plazoAnios<=0?1:plazoAnios;
        var capitalPrestamoP=(bausparsummeP||0)*(1-(cfgP.pct||0)/100);
        if(capitalPrestamoP>0 && bausparsummeP>0){
          var quotaPerUnitP=annuityQuota(1,cfgP.interesPrestamo,Math.max(1,Math.round(plazoAnios*12)));
          cfgP.tilgungsbeitragPerMille=Math.ceil(Math.max(0,quotaPerUnitP*capitalPrestamoP/bausparsummeP*1000)*10000-1e-6)/10000;
        }
        refreshInmuebleResults(); scheduleInmuebleSave();
        return true;
      }
      if(t.hasAttribute('data-inm-bankplazo')&&APP_HOST.wsRec){
        // Plazo del banco en años: fija la Tilgung inicial equivalente y anula el pago mensual fijo (si no, el plazo escrito no mandaría).
        var optBP=t.getAttribute('data-inm-opt'), inmBP=normalizeInmueble(APP_HOST.wsRec), cfgBP=(optBP==='refiBanco')?inmBP.refi.banco:inmBP.banco;
        if(String(t.value).trim()===''){ delete cfgBP.plazoObjetivo; cfgBP.tilgungInicial=2; refreshInmuebleResults(); scheduleInmuebleSave(); return true; }
        var anBP=parseFloat(t.value); if(!(anBP>=5&&anBP<=40)) return true;
        cfgBP.plazoObjetivo=anBP; cfgBP.tilgungInicial=tilgungParaPlazo(cfgBP.interesPrestamo,anBP); cfgBP.pagoPre=0;
        refreshInmuebleResults(); scheduleInmuebleSave();
        return true;
      }
      var opt=t.getAttribute('data-inm-opt'), field=t.getAttribute('data-inm-field');
      if(opt&&field&&APP_HOST.wsRec){
        var inm=normalizeInmueble(APP_HOST.wsRec);
        var val=parseFloat(t.value); val=isNaN(val)?0:val;
        if(opt==='refiActual') inm.refi[field]=val;
        else if(opt==='refiBanco') inm.refi.banco[field]=val;
        else if(opt==='refiA') inm.refi.a[field]=val;
        else if(opt==='refiB') inm.refi.b[field]=val;
        else inm[opt][field]=val;
        if(field==='interesPrestamo'&&(opt==='banco'||opt==='refiBanco')){
          // Con un plazo fijado ("a 30 años") la Tilgung se recalcula al cambiar el interés; sin él, el plazo mostrado se actualiza.
          var cfgIP=(opt==='refiBanco')?inm.refi.banco:inm.banco;
          if(cfgIP.plazoObjetivo>0) cfgIP.tilgungInicial=tilgungParaPlazo(val,cfgIP.plazoObjetivo);
          var plzIn=t.closest('.inm-card')&&t.closest('.inm-card').querySelector('[data-inm-bankplazo]'); if(plzIn&&document.activeElement!==plzIn) plzIn.value=bancoPlazoActual(cfgIP);
        }
        if(field==='interesAhorro'){ var wnA=t.closest('.inm-card'); wnA=wnA&&wnA.querySelector('.inm-warn-ahorro'); if(wnA) wnA.hidden=!(val>0.5); }
        if(opt==='banco'&&field==='zinsbindung') inmuebleSyncFechaRefi(inm);
        refreshInmuebleResults(); scheduleInmuebleSave();
        return true;
      }
  return false;
}
// Eventos de la presentación a pantalla completa (se instalan una vez, cuando index.html ya tiene el DOM).
function inmuebleInstallListeners(){
  document.getElementById('inm-pres-close').addEventListener('click', presClose);
    document.getElementById('inm-pres-inner').addEventListener('input', function(e){
      var tt=e.target;
      if(tt.hasAttribute&&tt.hasAttribute('data-pres-pago')&&_presRec){
        // Pago mensual editado en la presentación: se guarda en el mismo campo que Opciones avanzadas
        // (pagoAhorro/pagoPrestamo del Bausparvertrag, pagoPre/pagoIgual del banco); vacío = 0
        // = calculado. Se recalcula en vivo conservando lo tecleado, el foco y el cursor.
        var fP=tt.getAttribute('data-pres-pago');
        if(fP==='fechaRefi'){
          if(/^\d{4}-\d{2}-\d{2}$/.test(tt.value)){
            normalizeInmueble(_presRec).refi.fechaRefi=tt.value;
            var idxF=_presIdx; _presSlides=buildInmuebleSlides(_presRec); presShow(idxF); scheduleInmuebleSave();
          }
          return;
        }
        var rawP=String(tt.value).trim(), vP=(rawP==='')?0:parseFloat(rawP.replace(',','.'));
        _presRawPago[fP]=tt.value;
        if(!isNaN(vP)&&vP>=0&&vP<=((fP==='interesOriginal'||fP==='interesAhorro')?(fP==='interesAhorro'?20:30):1000000)){
          var inmP=normalizeInmueble(_presRec), refiP=(inmP.modo==='refi'), objP;
          if(fP==='pagoAhorro'||fP==='pagoPrestamo'||fP==='interesAhorro'||fP==='sonderAhorro') objP=refiP?((inmP.refi.estrategia==='refiB')?inmP.refi.b:inmP.refi.a):((inmP.estrategia==='b')?inmP.b:inmP.a);
          else if(fP==='pagoIgual') objP=inmP;
          else if(fP==='cuotaActual'||fP==='interesOriginal'||fP==='importeOriginal'||fP==='saldoHoy') objP=inmP.refi;
          else objP=refiP?inmP.refi.banco:inmP.banco;
          objP[fP]=vP;
          var idxP=_presIdx; _presSlides=buildInmuebleSlides(_presRec); presShow(idxP); scheduleInmuebleSave();
          var nP=document.querySelector('#inm-pres-inner [data-pres-pago="'+fP+'"]'); if(nP){ nP.focus(); try{ nP.setSelectionRange(nP.value.length,nP.value.length); }catch(_){} }
        }
        return;
      }
    });
    document.getElementById('inm-pres-inner').addEventListener('focusout', function(e){ if(e.target.hasAttribute&&e.target.hasAttribute('data-pres-pago')) delete _presRawPago[e.target.getAttribute('data-pres-pago')]; });
    document.getElementById('inm-pres-inner').addEventListener('click', function(e){
      var ct=e.target.closest('[data-curva-tipo]');
      if(ct&&_presRec){
        inmuebleToggleCurvaTipo(normalizeInmueble(_presRec),parseFloat(ct.getAttribute('data-curva-tipo')));
        var idxC=_presIdx; _presSlides=buildInmuebleSlides(_presRec); presShow(idxC); scheduleInmuebleSave();
      }
    });
    document.getElementById('afa-inf-body').addEventListener('click', function(e){
      // Encender/apagar una línea de banco en la gráfica de la vista previa del informe.
      var ctI=e.target.closest('[data-curva-tipo]'); if(!ctI||!_infRec) return;
      inmuebleToggleCurvaTipo(normalizeInmueble(_infRec),parseFloat(ctI.getAttribute('data-curva-tipo')));
      document.getElementById('afa-inf-body').innerHTML=buildInmuebleInforme(_infRec); scheduleInmuebleSave();
    });
    document.getElementById('afa-inf-body').addEventListener('input', function(e){
      // Sonderzahlung anual editada en la vista previa del informe: mismo campo que Más opciones; se rehace el informe conservando el foco.
      var ti=e.target; if(!ti.hasAttribute||!ti.hasAttribute('data-inf-sonder')||!_infRec) return;
      var raw=String(ti.value).trim(), vi=(raw==='')?0:parseFloat(raw.replace(',','.'));
      if(isNaN(vi)||vi<0||vi>1000000) return;
      var inmI=normalizeInmueble(_infRec), refiI=(inmI.modo==='refi');
      var cfgI=refiI?((inmI.refi.estrategia==='refiB')?inmI.refi.b:inmI.refi.a):((inmI.estrategia==='b')?inmI.b:inmI.a);
      cfgI.sonderAhorro=vi;
      var bodyI=document.getElementById('afa-inf-body'), posI=ti.selectionStart;
      bodyI.innerHTML=buildInmuebleInforme(_infRec);
      var nI=bodyI.querySelector('[data-inf-sonder]'); if(nI){ nI.value=raw; nI.focus(); try{ nI.setSelectionRange(posI,posI); }catch(_){} }
      var optI=refiI?((inmI.refi.estrategia==='refiB')?'refiB':'refiA'):((inmI.estrategia==='b')?'b':'a');
      var fI=document.querySelector('[data-inm-opt="'+optI+'"][data-inm-field="sonderAhorro"]'); if(fI) fI.value=vi||0;
      refreshInmuebleResults(); scheduleInmuebleSave();
    });
    document.getElementById('inm-pres-prev').addEventListener('click', function(){ presShow(_presIdx-1); });
    document.getElementById('inm-pres-next').addEventListener('click', function(){ presShow(_presIdx+1); });
    document.getElementById('inm-pres-dots').addEventListener('click', function(e){ var d=e.target.closest('[data-pres-go]'); if(d) presShow(+d.getAttribute('data-pres-go')); });
    document.getElementById('inm-pres-fs').addEventListener('click', function(){
      var ov=document.getElementById('inm-pres');
      try{ if(document.fullscreenElement) document.exitFullscreen(); else if(ov.requestFullscreen) ov.requestFullscreen(); }catch(e){}
    });
    document.addEventListener('keydown', function(e){
      var ov=document.getElementById('inm-pres'); if(!ov||ov.hidden) return;
      if(e.key==='ArrowRight'||e.key==='PageDown'||e.key===' '){ e.preventDefault(); presShow(_presIdx+1); }
      else if(e.key==='ArrowLeft'||e.key==='PageUp'){ e.preventDefault(); presShow(_presIdx-1); }
      else if(e.key==='Escape'){ presClose(); }
    });
    window.addEventListener('resize', function(){ var ov=document.getElementById('inm-pres'); if(ov&&!ov.hidden) presFit(); });
    document.addEventListener('fullscreenchange', function(){ var ov=document.getElementById('inm-pres'); if(ov&&!ov.hidden) setTimeout(presFit,120); });
}
