const test=require('node:test'), assert=require('node:assert/strict');
const M=require('../mathcore.js');
const near=(a,b,t=1e-9)=>assert.ok(Math.abs(a-b)<=t,`${a} ≠ ${b}`);

// ---- Ejemplos aritméticos independientes del §12.1 ----
test('§12.1-1 préstamo inicial: 180000*(0.042+0.0167)/12 = 880.50',()=>{ near(180000*(0.042+0.0167)/12,880.5,1e-9); });
test('§12.1-2 Rentenfaktor hipotético: 100000/10000*25 = 250',()=>{ near(100000/10000*25,250); });
test('§12.1-3 FV con interés cero: 100€ × 240 meses = 24000',()=>{ assert.equal(M.fvAnualidad(100,0,240),24000); });
test('§12.1-4 deflactación: 12100/1.1^2 = 10000',()=>{ near(M.deflactar(12100,0.1,2),10000,1e-9); });

// ---- Conversión de tipos ----
test('efectivo -> mensual -> efectivo es identidad',()=>{ near(Math.pow(1+M.mensualDesdeEfectiva(0.06),12)-1,0.06); });
test('nominal 6 % = 0,5 % mensual = 6,1678 % efectivo (no son lo mismo)',()=>{
  near(M.mensualDesdeNominal(0.06),0.005); near(M.efectivaDesdeNominal(0.06),0.0616778119,1e-9);
  assert.ok(Math.abs(M.mensualDesdeEfectiva(0.06)-M.mensualDesdeNominal(0.06))>1e-5);
});
test('tipos inválidos -> null, nunca 0',()=>{
  [NaN,Infinity,-1,-2].forEach(x=>assert.equal(M.mensualDesdeEfectiva(x),null));
  assert.equal(M.mensualDesdeNominal(-12),null); assert.equal(M.mensualDesdeNominal(NaN),null);
  assert.notEqual(M.mensualDesdeEfectiva(-0.5),null); // tipo negativo válido
});

// ---- Valor futuro ----
test('FV fin vs inicio: inicio = fin × (1+r)',()=>{ const r=0.005; near(M.fvAnualidad(100,r,120,'inicio'),M.fvAnualidad(100,r,120,'fin')*(1+r)); });
test('FV 1 mes y 12 meses',()=>{ assert.ok(M.igualesEUR(M.fvAnualidad(100,0.005,1),100)); near(M.fvAnualidad(100,0.005,12),100*((1.005**12-1)/0.005)); });
test('FV con capital inicial',()=>{ near(M.fvTotal(1000,0,0.005,12),1000*1.005**12); near(M.fvTotal(1000,100,0,12),2200); });
test('FV con tipo negativo válido y plazo 0',()=>{ assert.ok(M.fvAnualidad(100,-0.002,60)<6000); assert.equal(M.fvAnualidad(100,0.005,0),0); });
test('FV datos inválidos -> null',()=>{ assert.equal(M.fvAnualidad(100,0.005,-1),null); assert.equal(M.fvAnualidad(100,0.005,1.5),null); assert.equal(M.fvAnualidad(NaN,0.005,12),null); assert.equal(M.fvAnualidad(100,-1,12),null); });
test('propiedad: más aportación no reduce el capital (r>=0)',()=>{ for(const r of [0,0.002,0.01]) assert.ok(M.fvAnualidad(101,r,100)>=M.fvAnualidad(100,r,100)); });
test('VP y FV son coherentes: FV = VP·(1+r)^n',()=>{ near(M.fvAnualidad(100,0.004,200),M.vpAnualidad(100,0.004,200)*1.004**200,1e-6); });

// ---- Inflación ----
test('inflación cero y inflar/deflactar inversas',()=>{ assert.equal(M.deflactar(500,0,10),500); near(M.deflactar(M.inflar(500,0.02,7),0.02,7),500); });

// ---- Préstamos ----
test('cuota/saldo: el saldo tras n cuotas es 0',()=>{ const L=180000,r=0.042/12,n=300,A=M.cuotaPrestamo(L,r,n); near(M.saldoPrestamo(L,r,A,n),0,1e-6); });
test('saldo: r=0, saldo cero, préstamo ya pagado, nunca negativo',()=>{
  assert.equal(M.saldoPrestamo(1200,0,100,6),600); assert.equal(M.saldoPrestamo(0,0.003,100,6),0); assert.equal(M.saldoPrestamo(1000,0.003,2000,5),0);
});
test('propiedad: cuota mayor -> saldo no mayor',()=>{ assert.ok(M.saldoPrestamo(100000,0.003,600,60)<=M.saldoPrestamo(100000,0.003,500,60)); });
test('amortización: cuota insuficiente no amortiza; exacta amortiza con última cuota ajustada',()=>{
  assert.equal(M.amortizacion(100000,0.005,400).amortiza,false);
  const a=M.amortizacion(1000,0,300); assert.deepEqual([a.amortiza,a.meses,a.ultimaCuota],[true,4,100]);
  const b=M.amortizacion(180000,0.042/12,880.5); assert.ok(b.amortiza&&b.ultimaCuota<=880.5+1e-9);
  assert.deepEqual(M.amortizacion(0,0.005,100),{amortiza:true,meses:0,ultimaCuota:0});
});

// ---- TIR ----
test('TIR: préstamo con cuota constante recupera el tipo mensual',()=>{
  const L=100000,r=0.004,n=120,A=M.cuotaPrestamo(L,r,n), fl=[-L]; for(let i=0;i<n;i++) fl.push(A); near(M.tir(fl),r,1e-8);
});
test('TIR sin cambio de signo -> null',()=>{ assert.equal(M.tir([100,100,100]),null); assert.equal(M.tir([1]),null); });

// ---- Redondeo y traza ----
test('redondeo de presentación y tolerancia monetaria',()=>{ assert.equal(M.redondearEUR(1.005),1.01); assert.equal(M.redondearEUR(NaN),null); assert.ok(M.igualesEUR(0.1+0.2,0.3)); assert.ok(!M.igualesEUR(1,1.01)); });
test('traza: solo claves de la lista blanca, moneda EUR por defecto, inmutable',()=>{
  const t=M.crearTraza({motor:'x',nombreCliente:'NO',steuerId:'NO',fuentes:['a']});
  assert.deepEqual(Object.keys(t).sort(),['fuentes','moneda','motor']); assert.ok(Object.isFrozen(t));
});
