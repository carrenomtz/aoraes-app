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
  assert.match(p.cards,/<div class="inm-res-line total"><span>Coste total si compras hoy<\/span>/);
  assert.match(p.cards,/Pago total al mes mientras ahorras/);
  assert.match(p.frase,/mientras ahorras, pagas en total/);
  // el coste con puente es mayor que el coste sin puente
  const con=+p.cards.match(/Coste total si compras hoy<\/span><b>([\d.]+)/)[1].replace(/\./g,''), sin=Math.round(p.rEst.costeTotal);
  assert.ok(con>sin+20000,`${con} vs ${sin}`);
});
test('Con puente, el 40 % no aparece más caro que el 50 % por omitir el puente',()=>{
  const c=ctx(), a=render(c,'a'), b=render(c,'b');
  const n=h=>+h.cards.match(/Coste total si compras hoy<\/span><b>([\d.]+)/)[1].replace(/\./g,'');
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
  assert.match(sl.find(s=>s.t==='Comparación').h,/Coste total si compras hoy/);
});
