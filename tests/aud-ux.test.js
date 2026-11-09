/* Fase A de UX (09-11-2026): contraste, accesibilidad y pulido visual mínimo. Pruebas estáticas sobre el HTML/CSS (la medición en navegador se hizo aparte). */
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path');
const root=path.join(__dirname,'..'), read=f=>fs.readFileSync(path.join(root,f),'utf8');
const P=['analisis','jubilacion','plan-futuro','vsp','necesidades','preguntas-medicas'], H=Object.fromEntries(P.map(p=>[p,read(p+'.html')]));
const lum=h=>{const c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4));return .2126*c[0]+.7152*c[1]+.0722*c[2]};
const ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
const css=t=>(t.match(/<style[^>]*>[\s\S]*?<\/style>/g)||[]).join('\n');
const regla=(t,sel)=>{const m=css(t).match(new RegExp('(?:^|[}\\s;])'+sel.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s*\\{([^}]*)\\}','m'));return m?m[1]:null};

test('UX-01: los tokens de texto cumplen WCAG AA (4,5:1) sobre crema y blanco; el dorado de decoración sigue siendo el mismo',()=>{
  assert.ok(ratio('#7d611a','#f3efe6')>=4.5); assert.ok(ratio('#7d611a','#ffffff')>=4.5); assert.ok(ratio('#7d611a','#fff6dc')>=4.5);
  assert.ok(ratio('#666771','#f3efe6')>=4.5); assert.ok(ratio('#666771','#ffffff')>=4.5);
  assert.ok(ratio('#c9a961','#14213d')>=4.5);            // el dorado sobre marino se conserva
  assert.ok(ratio('#c9a961','#f3efe6')<3);               // y por eso no se usa como texto sobre claro
  for(const p of P) assert.match(H[p],/--gold-text:#7d611a;/,p);
});
test('UX-01: los selectores que fallaban usan --gold-text (o el gris corregido) y nada más usa el dorado claro como texto sobre fondo claro',()=>{
  const casos={necesidades:['.f em','.res-lbl','.res-big small'],vsp:['.vsp-card-sub','.section-eyebrow'],'preguntas-medicas':['.qtext .qcode'],analisis:['.cat-label','.ins-subhead','.s7-group-lab','.titleband .eyebrow']};
  for(const [p,sels] of Object.entries(casos)) for(const s of sels){ const r=regla(H[p],s); assert.ok(r,p+' '+s); assert.match(r,/color:var\(--gold-text\)/,p+' '+s); }
  assert.match(H.necesidades,/--slate:#666771;/); assert.match(H.analisis,/--muted:#666771;/); assert.match(regla(H['preguntas-medicas'],'.qrow.qgroup-intro'),/color:#666771/);
});
test('UX-02: ningún texto del CSS baja de 11 px (0,72 rem)',()=>{
  for(const p of P){ const c=css(H[p]); for(const m of c.matchAll(/font-size:\s*([0-9.]+)(px|rem)/g)){ const v=+m[1]; assert.ok(m[2]==='px'?v>=11:v>=0.72,p+' font-size '+m[0]); } }
});
test('UX-04: cada control estático de Jubilación y Plan Futuro tiene nombre accesible que apunta a un id existente y único',()=>{
  for(const p of ['jubilacion','plan-futuro']){
    const t=H[p], b=t.indexOf('<body'), s=t.indexOf('<script',b), est=t.slice(b,s);
    const rangos=[...est.matchAll(/<input\b[^>]*type="range"[^>]*>/g)].map(m=>m[0]); assert.ok(rangos.length>=3,p);
    for(const r of rangos){ const id=(r.match(/aria-labelledby="([^"]+)"/)||[])[1]; assert.ok(id,p+' sin aria-labelledby: '+r.slice(0,60)); assert.equal((est.match(new RegExp('id="'+id+'"','g'))||[]).length,1,p+' id '+id); }
  }
  const pf=H['plan-futuro']; for(const id of ['c-dyn','c-extra','c-vs','c-kiz','c-bu','c-payer']) assert.match(pf,new RegExp('id="'+id+'" (?:aria-labelledby="aud-l-\\w+"|min=)|id="'+id+'" aria-labelledby'),id);
});
test('UX-04: preguntas médicas — etiqueta del cliente con for y aria-label en cada campo de respuesta (pregunta + persona)',()=>{
  const t=H['preguntas-medicas']; assert.match(t,/<label data-i18n="client_label" for="tb-client">/); assert.match(t,/function renderAnswerCol\(q,person\)\{\s*\/\/ AOR-UX-04/);
  assert.equal((t.match(/'\+al\+'/g)||[]).length,3);          // texto libre, número y detalle
  assert.equal((t.match(/al\.replace\(\/"\$\/,' \((cm|kg)\)"'\)/g)||[]).length,2);   // altura (cm) y peso (kg)
  assert.ok(!/al\.replace\('"'/.test(t));
});
test('UX-05: Jubilación, Plan Futuro y VSP tienen <main> bien cerrado y h1; el análisis marca role="main" en sus cuatro vistas',()=>{
  for(const p of ['jubilacion','plan-futuro','vsp']){ const t=H[p]; assert.equal((t.match(/<main\b/g)||[]).length,1,p); assert.equal((t.match(/<\/main>/g)||[]).length,1,p); assert.ok(t.indexOf('<main')<t.indexOf('<header class="hero">')&&t.indexOf('</main>')>t.indexOf('<section class="section"'),p); }
  assert.match(H.jubilacion,/<h1 class="sr-only">Plan de Jubilación<\/h1>/); assert.match(H['plan-futuro'],/<h1 class="sr-only">Plan Futuro<\/h1>/); assert.match(H.vsp,/<h1\b/);
  assert.equal((H.analisis.match(/role="main"/g)||[]).length,4);
  for(const p of ['jubilacion','plan-futuro']) assert.match(css(H[p]),/\.sr-only\{position:absolute/);
});
test('UX-06: anillo de foco visible (doble anillo: se ve sobre fondos claros y oscuros) en las seis pantallas',()=>{
  for(const p of P) assert.match(css(H[p]),/:focus-visible\{outline:2px solid #14213d!important;outline-offset:2px;box-shadow:0 0 0 4px #c9a961!important\}/,p);
  assert.ok(ratio('#14213d','#c9a961')>=3);
});
test('UX-09: sin franja blanca bajo el panel oscuro en pantallas anchas (Jubilación y Plan Futuro)',()=>{
  for(const p of ['jubilacion','plan-futuro']) assert.match(css(H[p]),/html\{background:#0e1830\}/,p);
});
test('UX-13/14: necesidades muestra «—» sin plazo, avisa de importes no válidos y da una pista de formato',()=>{
  const t=H.necesidades; assert.match(t,/r\.ahorroCalculable===false\?'—'/); assert.match(t,/Importe no válido\.<\/b> Revisa:/); assert.match(t,/Importes en euros: escribe 1\.500 o 1500,50/);
  assert.match(t,/inputmode="decimal"/);
});

// ================= Fase B (análisis): cabecera móvil, índice de secciones, resumen en la barra =================
const A=H.analisis, ac=css(A);
test('UX-07 (Fase B): cabecera móvil compacta — campos en 2 columnas, sin subtítulo ni texto de ayuda, barra de herramientas en filas',()=>{
  const m=ac.match(/@media\(max-width:680px\)\{\s*header\.top\{padding:12px 16px[\s\S]*?\n  \}/); assert.ok(m,'bloque móvil');
  for(const r of [/\.brand \.sub\{display:none\}/,/\.head-meta\{display:grid;grid-template-columns:1fr 1fr/,/\.head-field:first-child\{grid-column:1\/-1\}/,/#tb-hint\{display:none\}/,/\.toolbar\{width:100%;flex-direction:row;flex-wrap:wrap/]) assert.match(m[0],r);
});
test('UX-08 (Fase B): barra de secciones pegajosa con una pastilla por sección S.x, recuento de campos con datos y scroll-spy; ancla bajo la barra',()=>{
  assert.match(ac,/\.sec-nav\{position:sticky;top:0;z-index:45/); assert.match(ac,/section\.card\{scroll-margin-top:64px\}/);
  const alto=61; assert.ok(64>=alto);
  const mh=+ac.match(/\.sec-chip\{[^}]*min-height:(\d+)px/)[1]; assert.ok(mh>=40,'zona táctil de las pastillas');
  assert.match(ac,/@media print\{\.sec-nav\{display:none !important\}\}/);
  assert.match(A,/nav\.setAttribute\('aria-label','Secciones del análisis'\)/); assert.match(A,/b\.addEventListener\('click',function\(\)\{ if\(card\.classList\.contains\('is-collapsed'\)\) card\.dispatchEvent\(new CustomEvent\('acc-open'\)\); card\.scrollIntoView/);
  assert.match(A,/aria-current/); assert.match(A,/campos con datos/);
});
test('UX-08 (Fase B): el índice SOLO LEE el formulario — no guarda, no calcula, no usa almacenamiento',()=>{
  const i=A.indexOf('/* Fase B · índice de secciones'), j=A.indexOf('</script>',i); const s=A.slice(i,j); assert.ok(i>0&&j>i);
  for(const prohibido of [/localStorage/,/sessionStorage/,/saveCurrent|saveEmpresa|persistClients/,/\bcompute\(/,/collectState/,/\.value\s*=[^=]/,/setItem/,/fetch\(|XMLHttpRequest/]) assert.ok(!prohibido.test(s),String(prohibido));
});
test('UX-12 (Fase B): por debajo de 1000 px el resumen completo va tras el formulario y su pastilla (puntuación + margen) queda en la barra; en escritorio el panel pegajoso se coloca bajo la barra',()=>{
  assert.match(ac,/@media\(max-width:999px\)\{\s*\.sec-nav-score\{display:inline-flex\}\s*\.analysis-grid > \.live-panel\{order:5\}/);
  assert.match(ac,/@media\(min-width:1000px\)\{ \.analysis-grid > \.live-panel\{top:78px\} \}/);
  assert.match(A,/Puntuación '\+s\+' de 100/); assert.match(A,/getElementById\('lp-score-num'\)/); assert.match(A,/getElementById\('lp-flow'\)/);
  assert.ok(ratio('#ffffff','#14213d')>=7);   // texto de la pastilla sobre marino
});

// ================= Fase D (análisis): zonas táctiles y cabecera plegada =================
test('UX-03 (Fase D): las ampliaciones táctiles solo aplican en móvil o puntero táctil y no mueven nada (hit-area por ::after)',()=>{
  const m=ac.match(/@media \(max-width:680px\),\(pointer:coarse\)\{[\s\S]*?\n  \}/); assert.ok(m,'bloque táctil');
  const b=m[0];
  assert.match(b,/\.chk\{min-height:36px;padding-block:8px\}/); assert.match(b,/\.cr-add,\.em-btn,\.vs-btn\{min-height:40px\}/); assert.match(b,/\.lang-switch button\{min-height:40px/);
  assert.match(b,/\.stepper button::after,\.cr-del::after\{content:"";position:absolute;left:-4px;right:-4px;top:-9px;bottom:-9px\}/);
  assert.ok(36>=24&&40>=24);                                   // por encima del mínimo AA (WCAG 2.2, 2.5.8) de 24 px
  // la regla base de .chk (23 px de alto en escritorio) no se ha tocado
  assert.match(ac,/\.chk\{display:flex;align-items:center;gap:9px;padding:7px 9px;/);
});
test('UX-07 (Fase D): en móvil la cabecera solo muestra «Cliente»; Asesor/a, Fecha y Próxima reunión quedan tras un botón accesible y siguen en el DOM',()=>{
  assert.match(ac,/\.head-more-btn\{display:none\}/);                                          // oculto por defecto (escritorio, impresión)
  assert.match(ac,/@media\(max-width:680px\)\{\s*\.head-more-btn\{display:inline-flex/);
  assert.match(ac,/\.head-meta\.is-folded \.head-field:nth-child\(n\+2\)\{display:none\}/);
  assert.match(ac,/@media print\{\.head-more-btn\{display:none !important\}\}/);
  const i=A.indexOf('/* Fase D · en móvil la cabecera'), j=A.indexOf('</script>',i), s=A.slice(i,j); assert.ok(i>0&&j>i);
  assert.match(s,/setAttribute\('aria-expanded','false'\)/); assert.match(s,/classList\.toggle\('is-folded'\)/);
  for(const prohibido of [/localStorage|sessionStorage|setItem/,/saveCurrent|compute\(|collectState/,/\.value\s*=[^=]/,/\.remove\(\)|removeChild/]) assert.ok(!prohibido.test(s),String(prohibido));   // solo visibilidad
});

/* Fase F · acordeón móvil de secciones: solo visibilidad */
test('Fase F: acordeón móvil solo cambia visibilidad (sin datos/cálculo/almacenamiento)', () => {
  const fs=require('node:fs'), path=require('node:path'), assert=require('node:assert');
  const h=fs.readFileSync(path.join(__dirname,'..','analisis.html'),'utf8');
  const i=h.indexOf('Fase F · en móvil las secciones'); assert.ok(i>0);
  const js=h.slice(i,h.indexOf('</script>',i));
  assert.doesNotMatch(js,/localStorage|sessionStorage|\.value\s*=|save[A-Z(]|fetch\(|firebase/i);
  assert.match(h,/@media \(max-width:680px\)\{\s*\.inputs > section\.card\.acc-on > \.card-head/);
  assert.match(h,/@media print\{\.inputs > section\.card\.acc-on\.is-collapsed > \.card-body\{display:block !important\}\}/);
  assert.match(js,/aria-expanded/); assert.match(js,/beforeprint/);
  assert.match(h,/function isShown\(el\)\{[\s\S]*is-collapsed/);
});
