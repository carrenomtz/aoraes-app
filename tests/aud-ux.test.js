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
