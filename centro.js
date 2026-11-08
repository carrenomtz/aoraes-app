/* Centro del asesor — pantalla de la biblioteca de productos (lectura para asesores aprobados; carga y verificación solo para el admin).
   Usa productos.js (estructura, estados, adaptador) y window.AORAES_CLOUD (Firestore, colección «productosVersiones»). SIN DATOS: no trae ninguna tarifa;
   lo que se ve viene de lo que el admin cargue en Firestore, y la seguridad la dan las reglas del servidor, no esta pantalla.
   Expone window.renderCentro(), que index.html llama al abrir «Centro del asesor». */
(function(){
  var CEN={fichas:[],cargado:false,cargando:false,error:'',sel:null,edit:null,editNueva:false,errores:[],aviso:'',fam:'',est:'',guardando:false};
  var $=function(id){ return document.getElementById(id); };
  var esc=function(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
  var cloud=function(){ return window.AORAES_CLOUD||null; };
  var esAdmin=function(){ var c=cloud(); return !!(c&&c.isAdminUser&&c.isAdminUser()); };
  var hoy=function(){ return new Date().toISOString().slice(0,10); };
  var quien=function(){ var c=cloud(), p=c&&c.profile; return (p&&(p.fullName||p.email))||'admin'; };
  var copia=function(o){ return JSON.parse(JSON.stringify(o)); };
  var ES=PRODUCTO_ESTADOS_ES;
  var fechaTxt=function(x){ return x&&x.toDate?x.toDate().toISOString().slice(0,10):''; };

  function preparar(d){
    var f=Object.assign({},d); f._createdAt=d.createdAt; delete f.createdAt; delete f.updatedAt; f._updated=fechaTxt(d.updatedAt);
    return productoNormalizar(f);
  }
  function cargar(forzar){
    if(CEN.cargando||(CEN.cargado&&!forzar)) return Promise.resolve();
    var c=cloud(); if(!c||!c.listProductosVersiones){ CEN.error='La conexión con la nube todavía no está lista. Vuelve a intentarlo en unos segundos.'; return Promise.resolve(); }
    CEN.cargando=true; CEN.error=''; dibujar();
    return c.listProductosVersiones().then(function(arr){ CEN.fichas=arr.map(preparar); CEN.cargado=true; })
      .catch(function(e){ CEN.error=(e&&e.code==='permission-denied')?'Tu cuenta no tiene permiso para ver la biblioteca (solo asesores aprobados).':'No se pudo cargar la biblioteca: '+((e&&e.message)||e); })
      .then(function(){ CEN.cargando=false; dibujar(); });
  }

  /* ---------- vistas ---------- */
  function insignia(f){
    var t='<span class="cen-b cen-b-'+esc(f.estado)+'">'+esc(ES[f.estado]||f.estado)+'</span>';
    if(f.ilustrativo) t+=' <span class="cen-b cen-b-ilus" title="Importes de ejemplo, no son tarifas oficiales">Ilustrativa</span>';
    return t;
  }
  function vistaLista(){
    var adm=esAdmin(), h='';
    var fams='<option value="">Todas las familias</option>'+Object.keys(PRODUCTO_FAMILIAS).map(function(k){ return '<option value="'+k+'"'+(CEN.fam===k?' selected':'')+'>'+esc(PRODUCTO_FAMILIAS[k].nombre)+'</option>'; }).join('');
    var ests='<option value="">Todos los estados</option>'+PRODUCTO_ESTADOS.filter(function(e){ return adm||e!=='borrador'; }).map(function(k){ return '<option value="'+k+'"'+(CEN.est===k?' selected':'')+'>'+esc(ES[k])+'</option>'; }).join('');
    h+='<div class="cen-bar"><select data-cen-filtro="fam" aria-label="Filtrar por familia">'+fams+'</select><select data-cen-filtro="est" aria-label="Filtrar por estado">'+ests+'</select>'
      +'<button type="button" class="cen-btn" data-cen="refrescar">↻ Actualizar</button>'+(adm?'<button type="button" class="cen-btn cen-btn-gold" data-cen="nueva">+ Nueva ficha</button>':'')+'</div>';
    var lista=CEN.fichas.filter(function(f){ return (adm||f.estado!=='borrador')&&(!CEN.fam||f.familia===CEN.fam)&&(!CEN.est||f.estado===CEN.est); })
      .sort(function(a,b){ return (a.proveedor+a.nombre).localeCompare(b.proveedor+b.nombre)||(a.vigenteDesde<b.vigenteDesde?1:-1); });
    if(CEN.cargando&&!CEN.cargado) return h+'<p class="cen-vacio">Cargando la biblioteca…</p>';
    if(CEN.error) return h+'<p class="cen-error">'+esc(CEN.error)+'</p>';
    if(!lista.length) return h+'<div class="cen-vacio"><b>'+(CEN.fichas.length?'Ninguna ficha coincide con el filtro.':'Todavía no hay fichas en la biblioteca.')+'</b><br>'
      +(adm&&!CEN.fichas.length?'Crea la primera con «Nueva ficha». Una ficha solo puede llamarse verificada cuando tiene su fuente documental.':(CEN.fichas.length?'':'Las fichas las carga y verifica el administrador a partir de la documentación contractual.'))+'</div>';
    h+='<div class="pool-table-wrap"><table class="pool-table cen-tbl"><thead><tr><th scope="col">Producto</th><th scope="col">Familia</th><th scope="col">Versión</th><th scope="col">Vigencia</th><th scope="col">Estado</th><th scope="col">Lista de control</th></tr></thead><tbody>';
    lista.forEach(function(f){
      var cl=productoChecklist(f,hoy());
      h+='<tr class="cen-fila" tabindex="0" role="button" data-cen="abrir" data-id="'+esc(f.id)+'"><td><b>'+esc(f.nombre)+'</b><br><span class="cen-sub">'+esc(f.proveedor)+'</span></td><td>'+esc((PRODUCTO_FAMILIAS[f.familia]||{}).nombre||f.familia)+'</td><td>'+esc(f.version)+'</td>'
        +'<td>'+esc(f.vigenteDesde)+(f.vigenteHasta?' → '+esc(f.vigenteHasta):' →')+'</td><td>'+insignia(f)+'</td><td><span class="cen-prog" title="'+cl.ok+' de '+cl.total+'"><i style="width:'+Math.round(cl.ok/cl.total*100)+'%"></i></span> '+cl.ok+'/'+cl.total+'</td></tr>';
    });
    return h+'</tbody></table></div>';
  }
  function texto(v){ return v?'<div class="cen-txt">'+esc(v)+'</div>':'<div class="cen-pend">— pendiente de documentar</div>'; }
  function vistaDetalle(f){
    var adm=esAdmin(), res=productoResolver([f],f.productoId,hoy()), us=productoUsable(f,hoy()), cl=productoChecklist(f,hoy()), d=f.detalle, h='';
    h+='<div class="cen-bar"><button type="button" class="cen-btn" data-cen="volver">← Volver a la lista</button>';
    if(adm&&(f.estado==='borrador'||f.estado==='pendiente_revision')) h+='<button type="button" class="cen-btn" data-cen="editar" data-id="'+esc(f.id)+'">✎ Editar</button>';
    if(adm) (PRODUCTO_TRANSICIONES[f.estado]||[]).forEach(function(n){ h+='<button type="button" class="cen-btn'+(n==='verificado'?' cen-btn-gold':'')+'" data-cen="estado" data-id="'+esc(f.id)+'" data-nuevo="'+n+'">'+({pendiente_revision:'Enviar a revisión',borrador:'Volver a borrador',verificado:'✔ Verificar',obsoleto:'Marcar como obsoleta'})[n]+'</button>'; });
    h+='</div>';
    if(CEN.aviso) h+='<p class="cen-aviso" role="status">'+esc(CEN.aviso)+'</p>';
    if(CEN.errores.length) h+='<div class="cen-error" role="alert"><b>No se pudo completar:</b><ul>'+CEN.errores.map(function(e){ return '<li>'+esc(e)+'</li>'; }).join('')+'</ul></div>';
    h+='<div class="cen-card"><div class="cen-eyebrow">'+esc((PRODUCTO_FAMILIAS[f.familia]||{}).nombre||f.familia)+' · '+esc(f.proveedor)+'</div><h2>'+esc(f.nombre)+'</h2>'
      +'<p>'+insignia(f)+' <span class="cen-sub">Versión '+esc(f.version)+' · vigente desde '+esc(f.vigenteDesde)+(f.vigenteHasta?' hasta '+esc(f.vigenteHasta):'')+'</span></p>'
      +'<p class="'+(us.ok?'cen-ok':'cen-aviso')+'"><b>'+(us.ok?'Utilizable en proyecciones del proveedor.':'No utilizable como tarifa oficial')+'</b> '+esc(productoEtiqueta(res))+(us.ok?'':'. '+esc(res.aviso))+'</p>'
      +'<p class="cen-sub">Fuente: '+(f.fuente.documento?esc(f.fuente.documento)+(f.fuente.referencia?' · '+esc(f.fuente.referencia):'')+(f.fuente.fecha?' · '+esc(f.fuente.fecha):''):'sin documento fuente')
      +(f.verificadoPor?' · verificada por '+esc(f.verificadoPor)+' el '+esc(String(f.verificadoEn).slice(0,10)):'')+'</p>'+(f.notas?'<div class="cen-txt">'+esc(f.notas)+'</div>':'')+'</div>';
    // lista de control
    h+='<div class="cen-card"><h3>Lista de control antes de publicar <span class="cen-sub">('+cl.ok+' de '+cl.total+')</span></h3><ul class="cen-check">'
      +cl.items.map(function(i){ return '<li class="'+(i.ok?'ok':'no')+'"><span aria-hidden="true">'+(i.ok?'✔':'○')+'</span> '+esc(i.etiqueta)+'</li>'; }).join('')+'</ul></div>';
    // costes
    h+='<div class="cen-card"><h3>C · Costes</h3>';
    if(!f.costes.length) h+='<div class="cen-pend">— sin conceptos de coste cargados</div>';
    else h+='<ul class="cen-costes">'+f.costes.map(function(c){ return '<li><span class="cen-b cen-b-'+(c.estado==='verificado'?'verificado':'borrador')+'">'+(c.estado==='verificado'?'Verificado':'Pendiente')+'</span> '+esc(productoDescribirCoste(c))
      +'<div class="cen-sub">'+esc(c.concepto)+(c.fuente&&c.fuente.documento?' · fuente: '+esc(c.fuente.documento)+(c.fuente.referencia?' ('+esc(c.fuente.referencia)+')':''):' · sin fuente')+'</div></li>'; }).join('')+'</ul>';
    h+='</div>';
    // secciones
    PRODUCTO_SECCIONES.forEach(function(sec){
      h+='<div class="cen-card"><h3>'+esc(sec.titulo)+'</h3><dl class="cen-dl">'+sec.campos.map(function(c){ return '<dt>'+esc(c.l)+'</dt><dd>'+texto(d[sec.k][c.k])+'</dd>'; }).join('')+'</dl></div>';
    });
    h+='<div class="cen-card"><h3>F · Documentación</h3>'+(d.documentos.length?'<ul class="cen-costes">'+d.documentos.map(function(x){ return '<li><b>'+esc(x.tipo)+'</b> — '+esc(x.titulo)+(x.referencia?' · '+esc(x.referencia):'')+(x.fecha?' · '+esc(x.fecha):'')+'</li>'; }).join('')+'</ul>':'<div class="cen-pend">— sin documentos registrados</div>')+'</div>';
    return h;
  }

  /* ---------- formulario (solo admin) ---------- */
  function opts(lista,sel,etq){ return lista.map(function(k){ return '<option value="'+esc(k)+'"'+(k===sel?' selected':'')+'>'+esc(etq?etq[k]||k:k)+'</option>'; }).join(''); }
  function vistaForm(){
    var f=CEN.edit, nueva=CEN.editNueva, h='';
    h+='<div class="cen-bar"><button type="button" class="cen-btn" data-cen="cancelar">← Cancelar</button><button type="button" class="cen-btn cen-btn-gold" data-cen="guardar"'+(CEN.guardando?' disabled':'')+'>'+(CEN.guardando?'Guardando…':'Guardar')+'</button></div>';
    if(CEN.errores.length) h+='<div class="cen-error" role="alert"><b>Revisa estos puntos:</b><ul>'+CEN.errores.map(function(e){ return '<li>'+esc(e)+'</li>'; }).join('')+'</ul></div>';
    var inp=function(ruta,etq,val,tipo,ro){ return '<label class="cen-f"><span>'+esc(etq)+'</span><input type="'+(tipo||'text')+'" data-e="'+ruta+'" value="'+esc(val)+'"'+(ro?' readonly':'')+'></label>'; };
    h+='<div class="cen-card"><h3>'+(nueva?'Nueva ficha':'Editar ficha')+'</h3><p class="cen-sub">Escribe solo lo que figure en la documentación contractual. Lo que no sepas, déjalo vacío: quedará marcado como pendiente.</p><div class="cen-grid">'
      +inp('top:productoId','Identificador del producto (p. ej. un nombre corto)',f.productoId,'text',!nueva)
      +'<label class="cen-f"><span>Familia</span><select data-e="top:familia">'+opts(Object.keys(PRODUCTO_FAMILIAS),f.familia,Object.keys(PRODUCTO_FAMILIAS).reduce(function(o,k){ o[k]=PRODUCTO_FAMILIAS[k].nombre; return o; },{}))+'</select></label>'
      +inp('top:proveedor','Proveedor',f.proveedor)+inp('top:nombre','Nombre del producto',f.nombre)+inp('top:version','Versión contractual (p. ej. 2026-03)',f.version,'text',!nueva)
      +inp('top:vigenteDesde','Rige desde',f.vigenteDesde,'date')+inp('top:vigenteHasta','Rige hasta (vacío = sin fin)',f.vigenteHasta||'','date')
      +'<label class="cen-f cen-chk"><input type="checkbox" data-e="top:ilustrativo"'+(f.ilustrativo?' checked':'')+'> <span>Ficha ilustrativa (importes de ejemplo, nunca verificable)</span></label>'
      +inp('fu:documento','Documento fuente de la ficha',f.fuente.documento)+inp('fu:referencia','Referencia (página, artículo…)',f.fuente.referencia)+inp('fu:fecha','Fecha del documento',f.fuente.fecha,'date')
      +'</div><label class="cen-f"><span>Notas internas</span><textarea rows="2" data-e="top:notas">'+esc(f.notas)+'</textarea></label></div>';
    // costes
    h+='<div class="cen-card"><h3>C · Costes</h3>';
    f.costes.forEach(function(c,i){
      h+='<div class="cen-costerow"><div class="cen-grid cen-grid-c">'
        +'<label class="cen-f"><span>Tipo</span><select data-ec="'+i+':tipo">'+opts(PRODUCTO_TIPOS_COSTE,c.tipo,PRODUCTO_TIPOS_COSTE_ES)+'</select></label>'
        +'<label class="cen-f"><span>Concepto (nombre en el documento)</span><input type="text" data-ec="'+i+':concepto" value="'+esc(c.concepto)+'"></label>'
        +'<label class="cen-f"><span>Valor</span><input type="number" step="any" min="0" data-ec="'+i+':valor" value="'+(c.valor==null?'':esc(c.valor))+'"></label>'
        +'<label class="cen-f"><span>Unidad</span><select data-ec="'+i+':unidad">'+opts(PRODUCTO_UNIDADES,c.unidad,{pct:'% (porcentaje)',permille:'‰ (por mil)',eur:'€ (euros)'})+'</select></label>'
        +'<label class="cen-f"><span>Base de cálculo</span><select data-ec="'+i+':base">'+opts(PRODUCTO_BASES,c.base,PRODUCTO_BASES_ES)+'</select></label>'
        +'<label class="cen-f"><span>Periodicidad</span><select data-ec="'+i+':periodicidad">'+opts(PRODUCTO_PERIODICIDADES,c.periodicidad,PRODUCTO_PERIODICIDADES_ES)+'</select></label>'
        +'<label class="cen-f"><span>Desde el mes</span><input type="number" min="1" step="1" data-ec="'+i+':desdeMes" value="'+esc(c.desdeMes)+'"></label>'
        +'<label class="cen-f"><span>Hasta el mes (vacío = toda la vida)</span><input type="number" min="1" step="1" data-ec="'+i+':hastaMes" value="'+(c.hastaMes==null?'':esc(c.hastaMes))+'"></label>'
        +'<label class="cen-f"><span>Documento fuente del coste</span><input type="text" data-ec="'+i+':fdoc" value="'+esc(c.fuente&&c.fuente.documento)+'"></label>'
        +'<label class="cen-f"><span>Referencia</span><input type="text" data-ec="'+i+':fref" value="'+esc(c.fuente&&c.fuente.referencia)+'"></label>'
        +'<label class="cen-f"><span>Estado del coste</span><select data-ec="'+i+':estado">'+opts(PRODUCTO_ESTADOS_COSTE,c.estado,{pendiente:'Pendiente de verificar',verificado:'Verificado con su fuente'})+'</select></label>'
        +'</div><button type="button" class="cen-btn cen-btn-x" data-cen="quitar-coste" data-i="'+i+'">Quitar este coste</button></div>';
    });
    h+='<button type="button" class="cen-btn" data-cen="añadir-coste">+ Añadir coste</button></div>';
    // secciones
    PRODUCTO_SECCIONES.forEach(function(sec){
      h+='<div class="cen-card"><h3>'+esc(sec.titulo)+'</h3><div class="cen-grid">'+sec.campos.map(function(c){
        var v=f.detalle[sec.k][c.k]; return c.t==='l'?'<label class="cen-f cen-wide"><span>'+esc(c.l)+'</span><textarea rows="3" data-ed="'+sec.k+'.'+c.k+'">'+esc(v)+'</textarea></label>'
          :'<label class="cen-f"><span>'+esc(c.l)+'</span><input type="'+(c.t==='f'?'date':'text')+'" data-ed="'+sec.k+'.'+c.k+'" value="'+esc(v)+'"></label>'; }).join('')+'</div></div>';
    });
    h+='<div class="cen-card"><h3>F · Documentación</h3>';
    f.detalle.documentos.forEach(function(x,i){
      h+='<div class="cen-grid cen-grid-c"><label class="cen-f"><span>Tipo</span><select data-edoc="'+i+':tipo"><option value="">—</option>'+opts(PRODUCTO_TIPOS_DOC,x.tipo)+'</select></label>'
        +'<label class="cen-f"><span>Título</span><input type="text" data-edoc="'+i+':titulo" value="'+esc(x.titulo)+'"></label>'
        +'<label class="cen-f"><span>Referencia</span><input type="text" data-edoc="'+i+':referencia" value="'+esc(x.referencia)+'"></label>'
        +'<label class="cen-f"><span>Fecha</span><input type="date" data-edoc="'+i+':fecha" value="'+esc(x.fecha)+'"></label>'
        +'<button type="button" class="cen-btn cen-btn-x" data-cen="quitar-doc" data-i="'+i+'">Quitar</button></div>';
    });
    return h+'<button type="button" class="cen-btn" data-cen="añadir-doc">+ Añadir documento</button></div>';
  }

  function dibujar(){
    var body=$('centro-body'); if(!body) return;
    var h;
    if(CEN.edit) h=vistaForm();
    else { var f=CEN.sel&&CEN.fichas.filter(function(x){ return x.id===CEN.sel; })[0]; h=f?vistaDetalle(f):vistaLista(); }
    body.innerHTML=h;
  }

  /* ---------- acciones ---------- */
  function buscar(id){ return CEN.fichas.filter(function(x){ return x.id===id; })[0]; }
  function persistir(f,fin){
    var c=cloud(); if(!c||!c.saveProductoVersion){ CEN.errores=['La conexión con la nube no está lista.']; dibujar(); return; }
    CEN.guardando=true; dibujar();
    c.saveProductoVersion(productoDocId(f),productoParaGuardar(f),f._createdAt).then(function(){ CEN.guardando=false; CEN.errores=[]; return cargar(true); })
      .then(function(){ fin&&fin(); })
      .catch(function(e){ CEN.guardando=false; CEN.errores=[(e&&e.code==='permission-denied')?'El servidor ha rechazado el guardado (permiso o regla). Si la ficha ya estaba verificada, solo puede pasar a obsoleta.':'No se pudo guardar: '+((e&&e.message)||e)]; dibujar(); });
  }
  function nuevaFicha(){ CEN.edit=productoNueva({familia:'VA',vigenteDesde:hoy()}); CEN.editNueva=true; CEN.errores=[]; CEN.aviso=''; dibujar(); window.scrollTo(0,0); }
  function guardar(){
    var f=CEN.edit, err=productoValidar(f), id=productoDocId(f);
    if(!id) err.push('Hace falta un identificador y una versión con letras o cifras.');
    if(CEN.editNueva&&id&&buscar(id)) err.push('Ya existe esa versión de ese producto. Cambia la versión o edita la existente.');
    if(f.estado!=='borrador'&&f.estado!=='pendiente_revision') err.push('Solo se pueden editar fichas en borrador o pendientes de revisión.');
    if(err.length){ CEN.errores=err; dibujar(); window.scrollTo(0,0); return; }
    persistir(f,function(){ CEN.aviso='Ficha guardada.'; CEN.sel=id; CEN.edit=null; CEN.editNueva=false; dibujar(); });
  }
  function cambiarEstado(id,nuevo){
    var orig=buscar(id); if(!orig) return; var f=copia(orig); f._createdAt=orig._createdAt;
    var txt={verificado:'Vas a marcar la ficha como VERIFICADA: a partir de ahí su contenido no se podrá editar y las proyecciones podrán atribuirse al proveedor. ¿Confirmas que todo coincide con la documentación?',obsoleto:'Vas a marcar la ficha como OBSOLETA. No se podrá volver a usar ni editar. ¿Continuar?'}[nuevo];
    if(txt&&!window.confirm(txt)) return;
    var r=productoCambiarEstado(f,nuevo,quien(),new Date().toISOString(),{exigirChecklist:nuevo==='verificado',hoy:hoy()});
    if(!r.ok){ CEN.errores=r.errores; CEN.aviso=''; dibujar(); window.scrollTo(0,0); return; }
    CEN.errores=[]; persistir(f,function(){ CEN.aviso='Estado actualizado: '+ES[nuevo]+'.'; dibujar(); });
  }
  function fijar(ruta,v){ var f=CEN.edit; if(!f) return; var p=ruta.split('.'); var o=f.detalle; for(var i=0;i<p.length-1;i++) o=o[p[i]]; o[p[p.length-1]]=v; }
  function alEditar(e){
    var t=e.target, f=CEN.edit; if(!f||!t.getAttribute) return;
    var v=t.type==='checkbox'?t.checked:t.value, a;
    if((a=t.getAttribute('data-e'))){ var k=a.split(':'); if(k[0]==='top'){ f[k[1]]=(k[1]==='vigenteHasta')?(v||null):v; } else if(k[0]==='fu'){ f.fuente[k[1]]=v; } return; }
    if((a=t.getAttribute('data-ec'))){ var q=a.split(':'), c=f.costes[+q[0]]; if(!c) return;
      if(q[1]==='valor') c.valor=v===''?null:parseFloat(v); else if(q[1]==='desdeMes') c.desdeMes=v===''?null:parseInt(v,10); else if(q[1]==='hastaMes') c.hastaMes=v===''?null:parseInt(v,10);
      else if(q[1]==='fdoc'){ c.fuente=c.fuente||{}; c.fuente.documento=v; } else if(q[1]==='fref'){ c.fuente=c.fuente||{}; c.fuente.referencia=v; } else c[q[1]]=v; return; }
    if((a=t.getAttribute('data-ed'))){ fijar(a,v); return; }
    if((a=t.getAttribute('data-edoc'))){ var z=a.split(':'), dd=f.detalle.documentos[+z[0]]; if(dd) dd[z[1]]=v; }
  }

  function alClic(e){
    var b=e.target.closest&&e.target.closest('[data-cen]'); if(!b) return; var a=b.getAttribute('data-cen'), id=b.getAttribute('data-id');
    if(a==='abrir'){ CEN.sel=id; CEN.errores=[]; CEN.aviso=''; dibujar(); window.scrollTo(0,0); }
    else if(a==='volver'){ CEN.sel=null; CEN.errores=[]; CEN.aviso=''; dibujar(); }
    else if(a==='refrescar'){ cargar(true); }
    else if(a==='nueva'){ nuevaFicha(); }
    else if(a==='editar'){ var o=buscar(id); if(o){ CEN.edit=copia(o); CEN.edit._createdAt=o._createdAt; CEN.editNueva=false; CEN.errores=[]; CEN.aviso=''; dibujar(); window.scrollTo(0,0); } }
    else if(a==='cancelar'){ CEN.edit=null; CEN.editNueva=false; CEN.errores=[]; dibujar(); }
    else if(a==='guardar'){ guardar(); }
    else if(a==='estado'){ cambiarEstado(id,b.getAttribute('data-nuevo')); }
    else if(a==='añadir-coste'){ var n=CEN.edit.costes.length+1; while(CEN.edit.costes.some(function(c){ return c.id==='c'+n; })) n++; CEN.edit.costes.push(productoCosteNuevo({id:'c'+n})); dibujar(); }
    else if(a==='quitar-coste'){ CEN.edit.costes.splice(+b.getAttribute('data-i'),1); dibujar(); }
    else if(a==='añadir-doc'){ CEN.edit.detalle.documentos.push({tipo:'',titulo:'',referencia:'',fecha:''}); dibujar(); }
    else if(a==='quitar-doc'){ CEN.edit.detalle.documentos.splice(+b.getAttribute('data-i'),1); dibujar(); }
  }
  function alFiltrar(e){ var k=e.target.getAttribute&&e.target.getAttribute('data-cen-filtro'); if(!k) return; CEN[k]=e.target.value; dibujar(); }

  var enlazado=false;
  window.renderCentro=function(){
    var root=$('centro'); if(!root) return;
    if(!enlazado){ enlazado=true;
      root.addEventListener('click',alClic); root.addEventListener('input',alEditar); root.addEventListener('change',function(e){ alEditar(e); alFiltrar(e); });
      root.addEventListener('keydown',function(e){ if((e.key==='Enter'||e.key===' ')&&e.target.getAttribute&&e.target.getAttribute('data-cen')==='abrir'){ e.preventDefault(); alClic(e); } });
    }
    var adm=esAdmin(); var nota=$('centro-nota'); if(nota) nota.textContent=adm?'Eres administrador: puedes cargar fichas, enviarlas a revisión, verificarlas y marcarlas como obsoletas.':'Consulta de costes y condiciones. Solo se atribuyen cifras a un proveedor cuando la ficha está verificada, vigente y con fuente.';
    dibujar(); cargar(false);
  };
})();
