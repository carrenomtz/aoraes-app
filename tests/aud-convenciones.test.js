/* Caracterización (no corrección): contrasta los motores EXISTENTES con el núcleo mathcore.js.
   Cada prueba documenta el comportamiento actual y, donde difiere, lo cuantifica. Ninguna modifica código de producción. */
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path');
const M=require('../mathcore.js'), calc=require('../calc.js'), nec=require('../necesidades.js');
const root=path.join(__dirname,'..');
const near=(a,b,t=1e-6)=>assert.ok(Math.abs(a-b)<=t,`${a} ≠ ${b}`);

// Extrae `function nombre(...){...}` del texto de un HTML por conteo de llaves.
function extraer(src,nombre){
  const i=src.indexOf('function '+nombre+'('); assert.ok(i>=0,'no encontrada '+nombre);
  let d=0,j=src.indexOf('{',i); const ini=j;
  for(;j<src.length;j++){ if(src[j]==='{')d++; else if(src[j]==='}'){d--; if(!d)break;} }
  return src.slice(i,j+1);
}
const jub=fs.readFileSync(path.join(root,'jubilacion.html'),'utf8');
const pf=fs.readFileSync(path.join(root,'plan-futuro.html'),'utf8');
function cargarJub(S){
  const code=['fvETF','fvETFdetailed','noCostFV','noCostFVm'].map(n=>extraer(jub,n)).join('\n');
  return new Function('S',code+'; return {fvETF,fvETFdetailed,noCostFV,noCostFVm};')(S);
}

// ---------- calc.js (Badenia / préstamos) : CONFORME ----------
test('calc.js balanceTrasMeses == núcleo.saldoPrestamo',()=>{
  for(const [P,tipo,A,t] of [[180000,4.2,880.5,120],[100000,0,500,50],[100000,3,200,60],[50000,3,5000,100]])
    near(calc.balanceTrasMeses(P,tipo,A,t),M.saldoPrestamo(P,tipo/100/12,A,t),1e-6);
});
test('calc.js savingsQuota == aportación que, capitalizada a fin de mes, alcanza el objetivo',()=>{
  const q=calc.savingsQuota(50000,1.5,120); near(M.fvAnualidad(q,0.015/12,120,'fin'),50000,1e-6);
});
test('calc.js monthsToPayoff coherente con núcleo.amortizacion (cuota 880,50, 4,2 %)',()=>{
  const a=M.amortizacion(180000,0.042/12,880.5); const n=calc.monthsToPayoff(180000,4.2,880.5);
  assert.ok(Math.abs(n-a.meses)<=1,`${n} vs ${a.meses}`);
});
test('calc.js: cuota que no cubre el interés devuelve el tope de 1200 meses (no amortiza)',()=>{
  assert.equal(calc.monthsToPayoff(100000,6,400),1200); assert.equal(M.amortizacion(100000,0.005,400).amortiza,false);
});
test('calc.js ahorroSaldoEn con r=0 y con Sonderzahlung',()=>{
  near(calc.ahorroSaldoEn(100,0,0,24),2400); near(calc.ahorroSaldoEn(100,1200,0,24),2400+2400);
});

// ---------- necesidades.js : CONFORME ----------
test('necesidades.js necValorActualRenta == VP con tasa real EFECTIVA convertida',()=>{
  near(nec.necValorActualRenta(1000,10,2),M.vpAnualidad(1000,M.mensualDesdeEfectiva(0.02),120,'fin'),1e-6);
  near(nec.necValorActualRenta(1000,10,0),120000);
});
test('necesidades.js necAhorroMensualParaObjetivo == inversa del FV con tipo NOMINAL/12',()=>{
  const p=nec.necAhorroMensualParaObjetivo(100000,15,4); near(M.fvAnualidad(p,0.04/12,180,'fin'),100000,1e-6);
  near(nec.necAhorroMensualParaObjetivo(1200,1,0),100);
});
test('necesidades.js mezcla convenciones (efectiva para rentas, nominal para ahorro) — documentado en el propio código',()=>{
  // Mismo 4 % «real»: la renta lo trata como efectivo, el ahorro como nominal. Diferencia de tipo mensual:
  const dif=M.mensualDesdeEfectiva(0.04)-M.mensualDesdeNominal(0.04);
  assert.ok(dif<0 && Math.abs(dif)<1e-4); // el efectivo da un mensual algo MENOR (≈ −0,006 pp): efecto pequeño, pero real
});

// ---------- jubilacion.html : DIFERENCIAS CUANTIFICADAS ----------
test('AOR-MAT-001/RET-011: noCostFV (anual, efectivo, aportación al INICIO de año) vs noCostFVm (mensual, nominal/12, fin de mes)',()=>{
  const J=cargarJub({excel:false,etfSwitches:true});
  const anual=J.noCostFV(300,6,30), mensual=J.noCostFVm(300,6,30);
  // Referencia con el núcleo, cada una con SU convención:
  const refAnual=300*12*((1.06**30-1)/0.06)*1.06;                       // 12·P al inicio de cada año, 6 % efectivo
  near(anual,refAnual,1e-4);
  near(mensual,M.fvAnualidad(300,0.06/12,360,'fin'),1e-4);
  // Diferencia entre las dos «referencias sin costes» para la MISMA entrada (300 €/mes, 6 %, 30 años):
  const difPct=(anual-mensual)/mensual*100;
  console.log(`  noCostFV=${anual.toFixed(0)}  noCostFVm=${mensual.toFixed(0)}  diferencia=${difPct.toFixed(2)} %`);
  assert.ok(anual>mensual); // la base del seguro es mayor: aportación adelantada + 6 % efectivo frente a 6,17 % efectivo con aportación mensual
});
test('AOR-MAT-001: fvETF aporta al INICIO de mes y fvETFdetailed al FINAL (misma entrada, distinto momento)',()=>{
  const J=cargarJub({excel:false,etfSwitches:false});
  // Aísla el momento de aportación: años=1 -> sin switches ni Vorabpauschale relevante comparable. Reproducimos la fórmula de cada una con el núcleo.
  const r=(6-0.6)/100/12, mN=300*0.999;
  const finMes=M.fvAnualidad(mN,r,12,'fin'), iniMes=M.fvAnualidad(mN,r,12,'inicio');
  near(J.fvETF(300,6,1),iniMes*0.9988,1e-6);                              // fvETF: inicio de mes, ×0,9988
  const d=J.fvETFdetailed(300,6,1); near(d.gross,finMes-finMes*0.0012*0.26375,1e-6); // detailed: fin de mes, menos Vorabpauschale
  assert.ok(iniMes>finMes);
});
test('AOR-MAT-001 (latente): fvETF con r<=0 ignora rentabilidades negativas — inalcanzable desde la UI (slider mínimo 3 %)',()=>{
  const J=cargarJub({excel:false,etfSwitches:false});
  assert.equal(J.fvETF(100,0.3,10),100*120*0.999);   // rate−0,6 = −0,3 % -> trata como 0 %
  assert.equal(J.fvETF(100,0.0,10),100*120*0.999);   // mismo resultado con −0,6 %: una caída no reduce nada
  assert.ok(/id="a-ret"[^>]*min="3"/.test(jub));     // la UI impide llegar aquí
});

// ---------- plan-futuro.html : tipo del escenario (nominal/12) vs tipos anuales (efectivos) ----------
test('AOR-FUT-004/MAT-001: simulate(): S.ret se trata como NOMINAL/12 pero rets[] como EFECTIVO anual',()=>{
  const src=extraer(pf,'simulate');
  const S={ret:6,dyn:0,monthly:200,capital0:0,childAge:0,payerAge:35,extraYear:0};
  const mk=S2=>new Function('S','childCovers','vsMonths','vsPctOf','haircut','C',src+'; return simulate;')
    (S2,()=>({bu:0,kiz:0}),()=>0,()=>0,()=>0,{bu:'none',vs:'none',kiz:0});
  const simulate=mk(S);
  const plano=simulate(20).raw, conRets=simulate(20,Array(20).fill(6)).raw;
  // Oráculo con el núcleo: 200 €/mes, 2,5 % de coste de entrada los primeros 60 meses, aportación a fin de mes.
  const orac=r=>M.fvAnualidad(200*0.975,r,60)*Math.pow(1+r,180)+M.fvAnualidad(200,r,180);
  near(plano,orac(0.06/12),1e-6);                      // escenario: nominal/12
  near(conRets,orac(M.mensualDesdeEfectiva(0.06)),1e-6); // rets[]: efectivo anual
  assert.ok(plano>conRets,'el «6 %» del escenario rinde más que un «6 %» anual explícito');
  console.log(`  6 % escenario (nominal/12): ${plano.toFixed(0)}  |  6 % efectivo por año: ${conRets.toFixed(0)}  |  diferencia ${((plano-conRets)/conRets*100).toFixed(2)} %`);
});
