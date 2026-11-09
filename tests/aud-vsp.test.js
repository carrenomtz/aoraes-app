/* AOR-VSP-001..003 — vsp.html calcPricing() se ejecuta extraído. La matriz de elegibilidad de VSP 2021 es un FIXTURE de prueba, no una regla vigente:
   fuente = Generali Wissen, «Zusatzvereinbarungen zur Vermögenssicherungspolice und Young & Home», generación VSP 2021, p. 258 y 261 (consulta del 09-11-2026, citada en el documento de auditoría). */
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','vsp.html'),'utf8');
const near=(a,b,t=1e-9)=>assert.ok(Math.abs(a-b)<=t,`${a} ≠ ${b}`), has=re=>assert.ok(re.test(src),'no encontrado: '+re);
function ex(n){ const i=src.indexOf('function '+n+'('); assert.ok(i>=0,n); let d=0,j=src.indexOf('{',i); for(;j<src.length;j++){ if(src[j]==='{')d++; else if(src[j]==='}'){d--; if(!d)break;} } return src.slice(i,j+1); }
const RAMO_KEYS=['haftpflicht','hausrat','glas','wohngebaude','rechtsschutz','gesundheit','unfall'];
function precio(activos,primas,freq='mensual',años='5'){
  const R={}; RAMO_KEYS.concat(['kfz']).forEach(k=>R[k]={active:false,premium:0}); activos.forEach((k,i)=>{ R[k].active=true; R[k].premium=primas[i]||0; });
  const $=id=>({value:id==='v-payment-freq'?freq:años});
  return new Function('R','RAMO_KEYS','$',ex('calcPricing')+'; return calcPricing();')(R,RAMO_KEYS,$);
}
// ---- Matriz de la VSP 2021 (FIXTURE, pendiente de validación para 2026) ----
const M2021={haftpflicht:{cuenta:true,bonus:true},hausrat:{cuenta:true,bonus:true},glas:{cuenta:true,bonus:true},wohngebaude:{cuenta:true,bonus:true},unfall:{cuenta:true,bonus:true},
  rechtsschutz:{cuenta:false,bonus:false},gesundheit:{cuenta:false,bonus:false}};
const nivel=n=>n>=6?25:n>=5?20:n>=4?15:n>=3?10:0;
function precioPorMatriz(activos,primas,m=M2021){
  const el=activos.filter(k=>m[k]&&m[k].cuenta); const base=activos.reduce((s,k,i)=>s+(m[k]&&m[k].bonus?(primas[i]||0):0),0), sub=primas.reduce((a,b)=>a+(b||0),0);
  return {n:el.length,pct:nivel(el.length),subtotal:sub,baseBonus:base,total:sub-base*nivel(el.length)/100};
}

test('VSP-001: comportamiento actual — porcentaje por nº de ramos activos 3/4/5/6 → 10/15/20/25 %, pago anual 5 %, semestral 2 %, duración <5 años +10 %; Kfz fuera',()=>{
  const k=['haftpflicht','hausrat','glas','wohngebaude','unfall','rechtsschutz'];
  [[2,0],[3,10],[4,15],[5,20],[6,25]].forEach(([n,p])=>assert.equal(precio(k.slice(0,n),Array(n).fill(10)).kundenbonusPct,p,String(n)));
  assert.equal(precio(['haftpflicht'],[10],'anual').paymentBonusPct,5); assert.equal(precio(['haftpflicht'],[10],'semestral').paymentBonusPct,2); assert.equal(precio(['haftpflicht'],[10],'mensual').paymentBonusPct,0);
  assert.equal(precio(['haftpflicht'],[10],'mensual','3').surchargePct,10); assert.equal(precio(['haftpflicht'],[10],'mensual','5').surchargePct,0); assert.equal(precio(['haftpflicht'],[10],'mensual','').surchargePct,0);
  has(/var RAMO_KEYS=\['haftpflicht','hausrat','glas','wohngebaude','rechtsschutz','gesundheit','unfall'\];/); has(/Kfz no es un ramo de la VSP/);
});
test('VSP-001: total = subtotal × (1 − (bonus+pago)/100 + recargo/100), nunca negativo, prima 0 -> 0',()=>{
  const p=precio(['haftpflicht','hausrat','glas'],[10,20,30],'anual','3'); near(p.total,60*(1-(10+5)/100+10/100)); assert.equal(precio(['haftpflicht'],[0]).total,0);
  assert.ok(precio(['haftpflicht','hausrat','glas','wohngebaude','unfall','rechtsschutz'],[1,1,1,1,1,1],'anual').total>=0);
});
test('VSP-001 (hallazgo C): RECHTSSCHUTZ y GESUNDHEIT cuentan para el nivel en el código, pero NO en la VSP 2021 (y el propio vsp.html lista solo Haftpflicht/Hausrat/Glas/Wohngebäude/Unfall para el Kundenbonus del Kfz)',()=>{
  has(/KFZ_KUNDENBONUS_RAMOS=\['haftpflicht','hausrat','glas','wohngebaude','unfall'\]/);
  const activos=['haftpflicht','hausrat','rechtsschutz'], primas=[10,10,10];
  const hoy=precio(activos,primas), ref=precioPorMatriz(activos,primas);
  assert.equal(hoy.kundenbonusPct,10); assert.equal(ref.pct,0);                     // 3 ramos activos pero solo 2 cuentan
  near(hoy.total,27); near(ref.total,30);                                           // 3 € de descuento que la matriz 2021 no concede
});
test('VSP-001 (hallazgo C): el descuento se aplica a TODA la prima, incluidos ramos que no lo reciben; ejemplo §12.1-6 — dos primas de 100, solo una elegible, 10 % ⇒ 190 €, no 180 €',()=>{
  const m={a:{cuenta:true,bonus:true},b:{cuenta:true,bonus:true},c:{cuenta:true,bonus:true},d:{cuenta:false,bonus:false}};
  // 3 ramos que cuentan, pero la base sobre la que se concede el bonus es solo la de los que lo reciben
  const parcial={a:{cuenta:true,bonus:true},b:{cuenta:true,bonus:false},c:{cuenta:true,bonus:false}};
  near(precioPorMatriz(['a','b','c'],[100,0,0],parcial).total,90);
  near(100+100-100*0.10,190); assert.notEqual(190,180);
  // el código actual descontaría ambas primas
  near(precio(['haftpflicht','hausrat','glas'],[100,100,0]).total,200*0.9);
});
test('VSP-001: Photovoltaik Plus (recibe bonus sin contar) y contratos que cuentan sin bonus no están modelados — no existe ningún campo de elegibilidad por contrato',()=>{
  assert.ok(!/countsTowardTier|receivesKundenbonus/.test(src));
  has(/Kundenbonus\/Zahlungsbonus\/Laufzeitzuschlag: reglas reales del tarifario PK 700 de Generali/);   // el código cita otra fuente (PK 700, guía VSP §22-23), sin generación ni fecha
});
test('VSP-002: la prima por ramo la escribe el asesor; no se registra periodicidad (solo «Prima mensual»), si incluye impuestos, si ya lleva el bonus ni la generación tarifaria',()=>{
  has(/data-prem="haftpflicht"|data-prem="'\+k|data-prem="gesundheit"/); has(/La prima la introduce el asesor a partir de la tarificación real de Generali — la app no calcula precios/);
  assert.ok(!/premiumNeta|incluyeBonus|generacionTarifa|premiumFreq/.test(src));
  // riesgo: una prima ya neta de bonus se descuenta otra vez
  near(precio(['haftpflicht','hausrat','glas'],[90,90,90]).total,270*0.9);
});
test('VSP-003: presets Básico/Medio/Pro y checkboxes — franquicias, ZÜRS, Elementar y límites no se validan contra condiciones (aviso de que no es oferta)',()=>{
  has(/Básico|basico/i); has(/Optimal|XXL/); has(/prop-disclaimer/);
});
