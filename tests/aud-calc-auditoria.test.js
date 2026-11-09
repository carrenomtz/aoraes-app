/* Bloque 5 — Proyecto inmobiliario y Badenia (calc.js). Complementa tests/calc.test.js del repositorio (que ya reconcilia una Modellrechnung real de Badenia);
   aquí solo lo que esa suite no cubre. Oráculos: bucles mensuales propios y mathcore.js. NINGÚN parámetro de Badenia queda validado por estas pruebas. */
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path');
const E=require('../calc.js'), M=require('../mathcore.js'), root=path.join(__dirname,'..');
const near=(a,b,t=1e-6)=>assert.ok(Math.abs(a-b)<=t,`${a} ≠ ${b}`);
function bucle(P,tipoPct,cuota){ const r=tipoPct/1200; let b=P,int=0,n=0,ult=0; while(b>0.005&&n<1200){ n++; const i=b*r, pago=Math.min(cuota,b+i); int+=i; b=b+i-pago; ult=pago; } return {meses:n,interes:int,ultima:ult,saldo:b}; }
const banco=(P,t,til,extra={})=>E.calcInmuebleOption(P,Object.assign({pct:0,anios:0,interesAhorro:0,interesPrestamo:t,tilgungInicial:til,comision:0,zinsbindung:10},extra));

// ---------- IMM-003 banco directo ----------
test('IMM-003: 180.000 € a 4,2 % + 1,67 % de Tilgung ⇒ cuota inicial 880,50 €/mes (no 881: el redondeo cambia los intereses)',()=>{
  const c=banco(180000,4.2,1.67); near(c.cuotaPrestamo,880.5,1e-9);
  const ex=bucle(180000,4.2,880.5); assert.equal(c.mesesPrestamo,ex.meses); near(c.interesTotalPrestamo,ex.interes,1); near(ex.ultima,c.ultimaCuota||ex.ultima,1);
  const r881=bucle(180000,4.2,881); assert.ok(Math.abs(r881.interes-ex.interes)>100,'usar 881 en vez de 880,50 cambia los intereses en >100 €'); // origen de la «diferencia» del script suelto
});
test('IMM-003: tipo 0 ⇒ cuota = capital×Tilgung/12 e intereses 0; la última cuota nunca supera la fija; saldo final 0',()=>{
  const c=banco(120000,0,2); near(c.cuotaPrestamo,200); assert.equal(c.interesTotalPrestamo,0); assert.equal(c.mesesPrestamo,600);
  const d=banco(180000,4.2,1.67); const ex=bucle(180000,4.2,d.cuotaPrestamo); assert.ok(ex.ultima<=d.cuotaPrestamo+1e-9); assert.ok(ex.saldo<=0.005);
});
test('IMM-003: cuota que no cubre el interés ⇒ noAmortiza (tope 1200 meses), nunca un plazo inventado',()=>{
  const c=E.calcInmuebleOption(100000,{pct:0,interesPrestamo:6,tilgungInicial:0,pagoPre:400,comision:0}); assert.equal(c.noAmortiza,true); assert.equal(c.mesesPrestamo,1200);
  assert.equal(M.amortizacion(100000,0.005,400).amortiza,false);
});
test('IMM-003: Sondertilgung mayor que el saldo no deja saldo negativo; un préstamo ya pagado (capital 0) no genera cuota fantasma',()=>{
  const c=banco(50000,4,2,{sondertilgung:1e7}); assert.ok(c.saldos.every(s=>s>=0)); assert.ok(c.mesesPrestamo<=12);
  const z=E.calcInmuebleOption(100000,{pct:100,anios:5,interesAhorro:0,interesPrestamo:2,tilgungsbeitragPerMille:6,comision:0}); assert.equal(z.capitalPrestamo,0); assert.equal(z.cuotaPrestamo,0); assert.equal(z.mesesPrestamo,0);
});
test('IMM-003: «interés efectivo» = TIR del capital neto de la comisión de apertura frente a las cuotas, compuesta a 12 meses; NO incluye otros costes obligatorios (no es un Effektiver Jahreszins PAngV completo)',()=>{
  const sin=banco(180000,3.5,2); near(sin.tasaEfectiva*100,(Math.pow(1+0.035/12,12)-1)*100,0.001);   // 3,56 %
  const con=banco(180000,3.5,2,{comision:1}); assert.ok(con.tasaEfectiva>sin.tasaEfectiva);
  const flujos=[-(180000-1800)]; const ex=bucle(180000,3.5,con.cuotaPrestamo); for(let i=0;i<ex.meses-1;i++) flujos.push(con.cuotaPrestamo); flujos.push(ex.ultima);
  near((Math.pow(1+M.tir(flujos),12)-1)*100,con.tasaEfectiva*100,0.001);
  const fuente=fs.readFileSync(path.join(root,'calc.js'),'utf8'); assert.ok(/Effektiver Jahreszins/.test(fuente)); assert.ok(!/Kontoführung|Schätzgeb|Grundschuld/i.test(fuente.slice(fuente.indexOf('function effectiveAnnualRate'),fuente.indexOf('function savingsQuota'))));
});

// ---------- IMM-006 puente (Vorausdarlehen) ----------
test('IMM-006: puente = capital × tipo/12 × meses de ahorro, solo intereses sobre toda la financiación; 180.000 € a 4,2 % cuestan 630 €/mes',()=>{
  near(E.inmuebleCostePuente(180000,4.2,1),630); near(E.inmuebleCostePuente(180000,4.2,43),27090); near(E.inmuebleCostePuente(180000,4.2,43+6)-E.inmuebleCostePuente(180000,4.2,43),6*630);
  assert.equal(E.inmuebleCostePuente(180000,4.2,0),0); assert.equal(E.inmuebleCostePuente(0,4.2,43),0); assert.equal(E.inmuebleCostePuente(-5,-1,-3),0);
  near(E.inmuebleCostePuente(180000,0,43),0);                // tipo variable/0 no se modela: el puente no varía con el tiempo
});
test('IMM-006 (hallazgo C): el puente no modela comisiones, seguros, tipo variable, retraso de asignación ni falta de Anschlussfinanzierung; la asignación se supone en la fecha estimada',()=>{
  const f=fs.readFileSync(path.join(root,'calc.js'),'utf8'); const b=f.slice(f.indexOf('// Puente hasta la asignación'),f.indexOf('function isoDateYearsAgo'));
  assert.ok(/no está garantizada/.test(b)); assert.ok(!/comision|seguro|variable|retraso/i.test(b.replace(/\/\/.*$/gm,'')));
  const inm=fs.readFileSync(path.join(root,'inmueble.js'),'utf8'); assert.ok(/Hipótesis: para comprar hoy, un banco adelanta la financiación/.test(inm));
});

// ---------- IMM-004/005/008 Bauspar ----------
test('IMM-005 (hallazgo C): la Bausparsumme es SIEMPRE el precio — el ‰ del Tilgungsbeitrag y la Abschlussgebühr se aplican sobre el precio; no existe una Bausparsumme independiente',()=>{
  const cfg={pct:40,anios:4,interesAhorro:0.05,interesPrestamo:1.75,tilgungsbeitragPerMille:6,comision:1.6};
  const a=E.calcInmuebleOption(300000,cfg); near(a.cuotaPrestamo,300000*6/1000); near(a.comision,300000*1.6/100);
  assert.ok(!/bausparsumme/i.test(JSON.stringify(Object.keys(cfg))));
  const b=E.calcInmuebleOption(300000,Object.assign({},cfg,{pct:60})); near(b.cuotaPrestamo,1800);      // la cuota NO baja al aportar más ahorro: depende del precio, no del préstamo
});
test('IMM-004: mínimo de ahorro 3,6 años (43 meses); llegar al objetivo no equivale a Zuteilung (Bewertungszahl, Mindestsparguthaben y Regelsparbeitrag no existen en el motor)',()=>{
  assert.equal(E.BAUSPAR_MIN_MESES,43);
  const c=E.calcInmuebleOption(200000,{pct:40,anios:1,interesAhorro:0.05,interesPrestamo:1.75,tilgungsbeitragPerMille:6,comision:1.6}); assert.equal(c.mesesAhorro,43); assert.equal(c.minAhorroAplicado,true);
  const f=fs.readFileSync(path.join(root,'calc.js'),'utf8'); assert.ok(!/Bewertungszahl|Mindestsparguthaben|Regelsparbeitrag/.test(f.replace(/\/\/.*$/gm,'').replace(/\/\*[\s\S]*?\*\//g,'')));
});
test('IMM-008 (hallazgo C): parámetros por defecto de las tarjetas Bausparvertrag = valores de EJEMPLO (1,75 / 0,95 % préstamo, 0,05 % ahorro, 1,6 % comisión, 3,6/5 años, 40/50 %); la pantalla lo avisa',()=>{
  const d=E.defaultInmueble(); assert.deepEqual([d.a.interesPrestamo,d.b.interesPrestamo,d.a.interesAhorro,d.a.comision,d.a.anios,d.b.anios,d.a.pct,d.b.pct],[1.75,0.95,0.05,1.6,3.6,5,40,50]);
  assert.match(fs.readFileSync(path.join(root,'inmueble.js'),'utf8'),/Valores de ejemplo — sustituye por la ilustración oficial/);
  assert.equal(d.a.tilgungsbeitragPerMille,undefined);   // el ‰ no es un dato del contrato: se deriva de un plazo por defecto de 10 años
  assert.equal(d.a.plazoPrestamo,10);
});

// ---------- IMM-001/002 fondos y capacidad ----------
test('IMM-001: porcentaje global o desglose, nunca los dos; sin comisión de agencia no se inventa; reforma suma al coste',()=>{
  const glob=E.inmuebleNecesidadFondos({precio:200000,gastosPct:10,capitalPropio:20000}); assert.equal(glob.gastos,20000); assert.equal(glob.financiacionNecesaria,200000);
  const desg=E.inmuebleNecesidadFondos({precio:200000,gastosPct:10,gastos:{impuesto:{modo:'pct',v:6},notario:{modo:'pct',v:1.5},grundbuch:{modo:'pct',v:0.5},makler:{modo:'pct',v:0},reformas:{modo:'eur',v:15000}},capitalPropio:20000});
  assert.equal(desg.gastos,16000+15000); assert.equal(desg.financiacionNecesaria,200000+31000-20000);          // el 10 % global NO se suma además
});
test('IMM-001 (aclaración): con reserva mayor que el capital, el «capital utilizable» es negativo y la FINANCIACIÓN LO SUMA (coste 110.000 + déficit 2.000 = 112.000). El comentario del código dice «la financiación lo trata como 0»: es el comentario el que no coincide; la fórmula sigue la especificación y la suite del repo la fija',()=>{
  const r=E.inmuebleNecesidadFondos({precio:100000,gastosPct:10,capitalPropio:10000,reserva:12000});
  assert.equal(r.capital.valor,-2000); assert.equal(r.sinFondosSuficientes,true); assert.equal(r.financiacionNecesaria,112000);
  assert.equal(E.inmuebleCapitalNivel({precio:100000,capitalPropio:10000,reserva:12000}).pct,0);       // el semáforo y la pantalla muestran 0 € utilizables
  const f=fs.readFileSync(path.join(root,'calc.js'),'utf8'); assert.ok(/la financiación lo trata como 0/.test(f));
});
test('IMM-002: cuota máxima = el menor de ingresos×%, residual y deseado; ingresos variables reconocidos al 50 %; ratio 35 % por defecto; los costes de propietario restan del residual',()=>{
  const inm={ingresoNeto:4000,ingresoVariable:1000,flujo:{gastos:2000},reservaMensual:100,hausgeld:150,precio:240000};
  const c=E.inmuebleCuotaMaxModelo(inm); near(c.ingresosReconocidos,3500); near(c.limitePorIngresos,1225); near(c.costesPropietario.total,150+240000*0.01/12);
  near(c.presupuestoResidual,3500-2000-100-c.costesPropietario.total,0.01); assert.equal(c.limitante,'residual'); assert.equal(E.inmuebleCuotaMaxModelo({ingresoNeto:0}),null);
  assert.equal(E.inmuebleCuotaMaxModelo(Object.assign({},inm,{presupuestoDeseado:300})).limitante,'deseado');
});
test('IMM-002 (hallazgo R): el motor no valida signos; la protección está en la capa de entrada (INM_LIMITES). gastos del hogar negativos inflarían la cuota máxima si llegaran al motor',()=>{
  assert.deepEqual(E.inmuebleLimitar('reserva',-50),{v:0,recortado:true}); assert.deepEqual(E.inmuebleLimitar('ingresoNeto',-1),{v:0,recortado:true});
  const base={ingresoNeto:3000,flujo:{gastos:1000},precio:1};
  assert.ok(E.inmuebleCuotaMaxModelo(Object.assign({},base,{flujo:{gastos:-500}})).presupuestoResidual>E.inmuebleCuotaMaxModelo(base).presupuestoResidual);
  assert.equal(E.INM_LIMITES.ratioMax,undefined);          // el ratio máximo no tiene límite declarado
});
test('IMM-001/TAX-007: Grunderwerbsteuer por Land marcada «pendiente_de_validacion» y solo se aplica al pulsar «Usar estimación típica»; 16 Länder',()=>{
  assert.equal(E.INM_BUNDESLAENDER.length,16); const f=fs.readFileSync(path.join(root,'calc.js'),'utf8'); assert.ok(/INM_BUNDESLAENDER_ESTADO='pendiente_de_validacion'/.test(f));
  assert.equal(E.inmuebleGastosTipicos('BY').impuesto.v,3.5); assert.equal(E.inmuebleGastosTipicos('XX').impuesto.v,0);
});
