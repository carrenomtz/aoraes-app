// Comprar hoy con Bausparvertrag: el coste principal de la tarjeta debe incluir el préstamo puente (sin él, el Bausparvertrag parecía
// más barato y el orden 40 % / 50 % se invertía), y el titular debe dar el pago mensual real durante el ahorro (ahorro + puente).
const test=require('node:test'), assert=require('node:assert'), fs=require('fs'), path=require('path'), vm=require('vm');
const root=path.join(__dirname,'..');
function ctx(){
  const c={console,Intl,Math,Date,JSON,Object,Array,String,Number,isFinite,isNaN,parseFloat,parseInt,
    eur:v=>Math.round(v).toLocaleString('de-DE')+' €', esc:x=>String(x), pct:v=>v+' %',
    window:{addEventListener(){}}, document:{addEventListener(){},querySelector(){return null},querySelectorAll(){return []},getElementById(){return null}}, localStorage:{getItem:()=>null,setItem:()=>{}}};
  vm.createContext(c);
  vm.runInContext(fs.readFileSync(path.join(root,'calc.js'),'utf8'),c);
  vm.runInContext(fs.readFileSync(path.join(root,'inmueble.js'),'utf8'),c);
  return c;
}
function render(c,estrategia,ingreso){
  return vm.runInContext(`(function(){var inm=defaultInmueble(); inm.precio=200000; inm.gastosPct=10; inm.capitalPropio=40000; inm.estrategia='${estrategia}';
    ${ingreso?'inm.ingresoNeto='+ingreso+';':''}
    var rec={inmueble:inm}; normalizeInmueble(rec); inm=rec.inmueble; return inmuebleResultsHTML(inmuebleFin(inm),inm,true);})()`,c);
}
test('Comprar hoy: el coste principal del Bausparvertrag incluye el puente',()=>{
  const c=ctx(), p=render(c,'a');
  assert.match(p.cards,/<div class="inm-res-line total"><span>Total que pagas por la vivienda<\/span>/);
  assert.match(p.cards,/Precio \+ gastos de compra<\/span><b>220\.000/);
  assert.match(p.cards,/Pago total al mes mientras ahorras/);
  assert.match(p.frase,/mientras ahorras, pagas en total/);
  // el coste con puente es mayor que el coste sin puente
  // total = precio + gastos + intereses y comisiones (con puente): siempre mayor que lo que cuesta la vivienda
  const tot=+p.cards.match(/Total que pagas por la vivienda<\/span><b>([\d.]+)/)[1].replace(/\./g,'');
  assert.ok(tot>220000+20000,`${tot}`);
});
test('Con puente, el 40 % no aparece más caro que el 50 % por omitir el puente',()=>{
  const c=ctx(), a=render(c,'a'), b=render(c,'b');
  const n=h=>+h.cards.match(/Total que pagas por la vivienda<\/span><b>([\d.]+)/)[1].replace(/\./g,'');
  assert.ok(n(a)<n(b),`40 %: ${n(a)} · 50 %: ${n(b)}`);
});
test('Un ingreso mensual irreal muestra un aviso',()=>{
  const c=ctx(), p=render(c,'a',400000);
  assert.match(p.capacidad,/Revisa el ingreso mensual/);
  const q=render(c,'a',4000);
  assert.doesNotMatch(q.capacidad||'',/Revisa el ingreso mensual/);
});
test('Roadmap para el cliente: etapas del Bausparvertrag y del banco, y deuda del banco al terminar el Bausparvertrag',()=>{
  const c=ctx(), p=render(c,'a');
  assert.match(p.roadmap,/Tu camino, paso a paso/);
  assert.match(p.roadmap,/Compras y ahorras/);
  assert.match(p.roadmap,/ahorro \+ intereses del puente/);
  assert.match(p.roadmap,/Asignación del contrato/);
  assert.match(p.roadmap,/Fin del tipo fijo/);
  assert.match(p.roadmap,/con el banco aún deberías/);
});
test('Refinanciar y Comprar y refinanciar dan la carga total mientras se espera (crédito + ahorro)',()=>{
  const c=ctx();
  for(const comb of [false,true]){
    const p=vm.runInContext(`(function(){var inm=defaultInmueble(); inm.modo='refi'; inm.refi.compraNueva=${comb};
      var rec={inmueble:inm}; normalizeInmueble(rec); inm=rec.inmueble; return inmuebleRefiResultsHTML(inm.refi,true,inm);})()`,c);
    assert.match(p.frase,/En total, hasta refinanciar:/);
    const tot=+p.frase.match(/hasta refinanciar:<\/span> <b>([\d.]+)/)[1].replace(/\./g,'');
    assert.ok(Math.abs(tot-(p.rem.cuotaOriginal+p.rEst.cuotaAhorro))<2,`${tot}`);
  }
});
test('Un Bausparvertrag sin ahorro muestra aviso',()=>{
  const c=ctx();
  const p=vm.runInContext(`(function(){var inm=defaultInmueble(); inm.precio=200000; inm.a.pct=0;
    var rec={inmueble:inm}; normalizeInmueble(rec); inm=rec.inmueble; return inmuebleResultsHTML(inmuebleFin(inm),inm,true);})()`,c);
  assert.match(p.cards,/Sin ahorro, este cálculo no es válido/);
});
test('La presentación incluye el roadmap y la comparación con el coste con puente',()=>{
  const c=ctx();
  const sl=vm.runInContext(`(function(){var inm=defaultInmueble(); inm.precio=200000; inm.gastosPct=10; inm.capitalPropio=40000; return buildInmuebleSlides({inmueble:inm});})()`,c);
  const t=sl.map(s=>s.t);
  assert.ok(t.indexOf('Tu camino, paso a paso')>=0 && t.indexOf('Tu camino, paso a paso')<t.indexOf('Cuánto debes con el tiempo'), t.join(' | '));
  assert.match(sl.find(s=>s.t==='Comparación').h,/puente incluido/);
});
function renderCfg(c,js){
  return vm.runInContext(`(function(){var inm=defaultInmueble(); ${js}; var rec={inmueble:inm}; normalizeInmueble(rec); inm=rec.inmueble; return inmuebleResultsHTML(inmuebleFin(inm),inm,true);})()`,c);
}
test('Bausparvertrag parcial: B cubre una parte, el banco el resto, y los totales suman las dos deudas',()=>{
  const c=ctx();
  const p=renderCfg(c,"inm.precio=300000; inm.gastosPct=10; inm.capitalPropio=60000; inm.a.bausparsumme=110000; inm.banco.interesPrestamo=4");
  assert.match(p.cards,/Préstamo del banco para el resto<\/span><b>160\.000/);
  assert.match(p.roadmap,/banco para el resto/);
  // B = 110.000: ahorro 40 % = 44.000
  assert.strictEqual(Math.round(p.rEst.objetivoAhorro),44000);
  const tot=+p.cards.match(/Total que pagas por la vivienda<\/span><b>([\d.]+)/)[1].replace(/\./g,'');
  assert.ok(tot>330000,`${tot}`);
});
test('Tipo propio del puente: un puente más caro sube los intereses',()=>{
  const c=ctx();
  const n=h=>+h.cards.match(/Intereses y comisiones \(puente incluido\)\*<\/span><b>([\d.]+)/)[1].replace(/\./g,'');
  const a=renderCfg(c,"inm.precio=200000; inm.banco.interesPrestamo=4");
  const b=renderCfg(c,"inm.precio=200000; inm.banco.interesPrestamo=4; inm.a.interesPuente=5");
  assert.ok(n(b)>n(a),`${n(a)} vs ${n(b)}`);
});
test('Tipo supuesto al renovar: cambia la cuota tras el tipo fijo y los intereses del banco',()=>{
  const c=ctx();
  const a=renderCfg(c,"inm.precio=200000; inm.banco.interesPrestamo=4");
  const b=renderCfg(c,"inm.precio=200000; inm.banco.interesPrestamo=4; inm.banco.tipoRenovacion=6");
  assert.match(b.cards,/Cuota tras renovar al tipo supuesto/);
  assert.match(b.roadmap,/la cuota pasa a/);
  const n=h=>[...h.cards.matchAll(/Total que pagas por la vivienda<\/span><b>([\d.]+)/g)].pop()[1].replace(/\./g,'');
  assert.ok(+n(b)>+n(a));
});
test('Roadmap en Refinanciar',()=>{
  const c=ctx();
  const p=vm.runInContext(`(function(){var inm=defaultInmueble(); inm.modo='refi'; var rec={inmueble:inm}; normalizeInmueble(rec); inm=rec.inmueble; return inmuebleRefiResultsHTML(inm.refi,true,inm);})()`,c);
  assert.match(p.roadmap,/Refinanciación con Badenia/);
  assert.match(p.roadmap,/crédito \+ ahorro/);
});
test('Aportación inicial: adelanta el ahorro mínimo; la asignación nunca antes del mínimo; sin cuota sigue habiendo puente',()=>{
  const c=ctx(), C=vm.runInContext('({calcInmuebleOption,BAUSPAR_MIN_MESES})',c);
  const base={pct:40,anios:3.6,interesAhorro:0,interesPrestamo:1.75,tilgungsbeitragPerMille:5.5,comision:0};
  // 110.000 €, 40 % = 44.000 €: 500 €/mes sin aportación → 88 meses; con 20.000 € iniciales → 48 meses
  let r=C.calcInmuebleOption(110000,Object.assign({},base,{pagoAhorro:500}));
  assert.strictEqual(r.mesesObjetivo,88); assert.strictEqual(r.mesesAhorro,88);
  r=C.calcInmuebleOption(110000,Object.assign({},base,{pagoAhorro:500,aportacionInicial:20000}));
  assert.strictEqual(r.mesesObjetivo,48); assert.strictEqual(r.aportacionInicial,20000);
  // con 30.000 € + 500 €/mes se reuniría en 28 meses, pero la asignación espera al mínimo y basta una cuota menor
  r=C.calcInmuebleOption(110000,Object.assign({},base,{pagoAhorro:500,aportacionInicial:30000}));
  assert.strictEqual(r.mesesConPagoPedido,28); assert.strictEqual(r.mesesAhorro,C.BAUSPAR_MIN_MESES); assert.ok(r.cuotaAhorro<500);
  // todo el ahorro mínimo de golpe: sin cuota mensual, asignación al mínimo
  r=C.calcInmuebleOption(110000,Object.assign({},base,{aportacionInicial:44000}));
  assert.ok(r.cuotaAhorro<1); assert.strictEqual(r.mesesAhorro,C.BAUSPAR_MIN_MESES); assert.strictEqual(r.mesesObjetivo,0);
  const p=renderCfg(c,"inm.precio=200000; inm.banco.interesPrestamo=4; inm.a.aportacionInicial=90000");
  assert.match(p.cards,/Intereses del puente hasta la asignación|puente incluido/);
  assert.match(p.cards,/Ahorro mínimo reunido<\/span><b>desde el inicio/);
});
