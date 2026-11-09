/* Bloque 3 — fiscalidad y pensión. Oráculos: texto de §32a y §7 EStG (leído de gesetze-im-internet.de el 09-11-2026) y aritmética independiente. */
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path');
const root=path.join(__dirname,'..'), T=require('../impuesto.js'), calc=require('../calc.js');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const ana=read('analisis.html'), jub=read('jubilacion.html'), afaSrc=read('afa.js');
const near=(a,b,t=1e-9)=>assert.ok(Math.abs(a-b)<=t,`${a} ≠ ${b}`);
const has=(src,re)=>assert.ok(re.test(src),'no encontrado: '+re);
function bloque(src,inicio){ const i=src.indexOf(inicio); assert.ok(i>=0,inicio); let d=0,j=src.indexOf('{',i); for(;j<src.length;j++){ if(src[j]==='{')d++; else if(src[j]==='}'){d--; if(!d)break;} } return src.slice(i,j+1); }
const fn=(src,n)=>bloque(src,'function '+n+'(');

// ================= AOR-TAX-001: §32a EStG 2026 (texto legal) =================
// Implementación independiente, transcrita de la ley: y,z,x = zvE redondeado a euros enteros hacia abajo; cuota redondeada hacia abajo.
function ley32a(zve){
  const x=Math.floor(zve);
  if(x<=12348) return 0;
  if(x<=17799){ const y=(x-12348)/10000; return Math.floor((914.51*y+1400)*y); }
  if(x<=69878){ const z=(x-17799)/10000; return Math.floor((173.10*z+2397)*z+1034.87); }
  if(x<=277825) return Math.floor(0.42*x-11135.63);
  return Math.floor(0.45*x-19470.38);
}
test('TAX-001: cuota() == §32a 2026 en las fronteras exactas de cada zona',()=>{
  [0,1,12347,12348,12349,12350,17798,17799,17800,17801,69877,69878,69879,69880,277824,277825,277826,277827,1e6].forEach(z=>assert.equal(T.cuota(z),ley32a(z),'zvE '+z));
  assert.equal(T.GRUNDFREIBETRAG,12348); assert.equal(T.ANIO,2026);
});
test('TAX-001: barrido 0–400.000 € (paso 137) coincide con la ley; redondeo de zvE hacia abajo',()=>{
  for(let z=0;z<=400000;z+=137) assert.equal(T.cuota(z),ley32a(z),'zvE '+z);
  assert.equal(T.cuota(17799.99),T.cuota(17799)); assert.equal(T.cuota(12348.99),0);
});
test('TAX-001: entradas inválidas -> cuota 0 y marginal 0 (sin NaN)',()=>{ [NaN,-5,undefined,null].forEach(z=>{ assert.equal(T.cuota(z),0); assert.ok(isFinite(T.tipoMarginal(z))); }); });
test('TAX-001/§12.1-5: ahorro por deducción nunca negativo, nunca > cuota, y menor que deducción × marginal al cruzar tramos',()=>{
  for(const z of [0,10000,12349,30000,50000,69878,100000,300000]) for(const d of [0,1,500,5000,30826,1e6]){
    const a=T.ahorroPorDeduccion(z,d); assert.ok(a>=0&&a<=T.cuota(z)+1e-9,`z=${z} d=${d}`);
  }
  assert.ok(T.ahorroPorDeduccion(50000,10000)<10000*T.tipoMarginal(50000));
});
test('TAX-001: Ehegattensplitting = 2 × cuota(zvE/2) ; igual que soltero con la mitad',()=>{
  near(T.ahorroPorDeduccionConjunta(100000,0),0);
  const sin=2*T.cuota(50000), con=2*T.cuota(45000); near(T.ahorroPorDeduccionConjunta(100000,10000),sin-con);
});

// ================= AOR-TAX-003: Kirchensteuer por Bundesland =================
test('TAX-003: tasa de Kirchensteuer por Bundesland (8 % Baden-Württemberg y Bayern, 9 % resto); no afiliado 0; desconocido -> null',()=>{
  assert.equal(T.kirchensteuerSatz('Bayern'),0.08); assert.equal(T.kirchensteuerSatz('Baden-Württemberg'),0.08);
  ['Berlin','Hamburg','Nordrhein-Westfalen','Sachsen','Thüringen','Bremen'].forEach(b=>assert.equal(T.kirchensteuerSatz(b),0.09,b));
  assert.equal(T.kirchensteuerSatz('Bayern',false),0); assert.equal(T.kirchensteuerSatz('Berlin',false),0);
  assert.equal(T.kirchensteuerSatz(''),null); assert.equal(T.kirchensteuerSatz('Narnia'),null); assert.equal(T.kirchensteuerSatz(undefined),null);
});
test('TAX-003 (hallazgo): renderTaxEstimate aplica 9 % fijo a todos, sin Soli, y 0,78 × bruto como zvE',()=>{
  const r=bloque(ana,'function renderTaxEstimate(');
  assert.ok(/tax\*=1\.09; marginal\*=1\.09;/.test(r)); assert.ok(/var zve=grossHousehold\*0\.78;/.test(r)); assert.ok(!/solidari|soli/i.test(r.replace(/Solidaritätszuschlag/g,'')) || true);
  assert.ok(!/0\.055|Solidarit/.test(r.replace(/\/\/.*$/gm,'').replace(/<b>.*?<\/b>/g,'').split('wEl.innerHTML')[0]),'no hay cálculo de Soli');
  has(jub,/AORAES_IMPUESTO\.tipoMarginal\(gross\*0\.78\)/); has(jub,/AORAES_IMPUESTO\.ahorroPorDeduccion\(S\.salary\*0\.78,ded\)/);
});

// ================= AOR-TAX-004/005: AfA (§7 EStG) =================
function cargarAfa(){ const src=fn(afaSrc,'calcAfa'); return new Function(src+'; return calcAfa;')(); }
const calcAfa=cargarAfa();
const base={precioCompra:200000,itpPct:6,notarioPct:1.5,registroPct:0.5,otrosGastos:0,valorSuelo:0,sueloPendiente:false,valorCocina:0,afaEstandarPct:2,tieneGutachten:false,restnutzungsdauerGutachten:30};
test('TAX-004: los gastos de adquisición se reparten entre suelo y edificio (solo el edificio se amortiza)',()=>{
  // precio 200.000, Nebenkosten 8 % = 16.000, suelo 40.000 (20 %): edificio = (200.000+16.000) × 80 % = 172.800 (antes: 176.000)
  const c=calcAfa(Object.assign({},base,{valorSuelo:40000}));
  near(c.nebenkosten,16000); near(c.baseAmortizable,172800,1e-6); near(c.perdidaEstandarAnual,172800*0.02,1e-6);
});
test('TAX-004: sin suelo / suelo pendiente / sin cocina conserva el cálculo anterior (precio + Nebenkosten)',()=>{
  near(calcAfa(Object.assign({},base)).baseAmortizable,216000);
  near(calcAfa(Object.assign({},base,{valorSuelo:40000,sueloPendiente:true})).baseAmortizable,216000);
  near(calcAfa(Object.assign({},base,{valorSuelo:40000,valorCocina:5000})).baseAmortizable,172800-5000,1e-6);
});
test('TAX-004: casos límite — suelo mayor que el precio, precio 0, sin NaN, base nunca negativa',()=>{
  assert.equal(calcAfa(Object.assign({},base,{valorSuelo:500000})).baseAmortizable,0);
  const c0=calcAfa(Object.assign({},base,{precioCompra:0,valorSuelo:10})); assert.equal(c0.baseAmortizable,0); assert.ok(isFinite(c0.perdidaEstandarAnual));
  assert.equal(calcAfa(Object.assign({},base,{valorCocina:1e9})).baseAmortizable,0);
});
test('TAX-004: propiedad al 50 % — la base es del inmueble completo (el reparto por titular no está modelado)',()=>{
  assert.ok(!/ownership_primary|titularidad/.test(fn(afaSrc,'calcAfa')));
});
test('TAX-005: Gutachten — %=100/vida útil; vida útil 0 no divide; AfA efectiva nunca por debajo de la legal (§7 Abs.4 S.2: solo si la vida real es MÁS CORTA)',()=>{
  const g=(rnd,std=2)=>calcAfa(Object.assign({},base,{valorSuelo:0,tieneGutachten:true,restnutzungsdauerGutachten:rnd,afaEstandarPct:std}));
  near(g(25).pctGutachten,4); near(g(25).pctEfectivo,4);                 // 25 años < 50: vale el Gutachten
  near(g(60).pctGutachten,100/60); near(g(60).pctEfectivo,2);            // 60 años > 50: manda el 2 % legal
  near(g(50).pctEfectivo,2); near(g(33,3).pctEfectivo,100/33);           // 3 % -> umbral 33 años
  near(g(40,2.5).pctEfectivo,2.5); near(g(30,2.5).pctEfectivo,100/30);   // 2,5 % -> umbral 40 años
  assert.equal(g(0).pctGutachten,null); assert.equal(g(0).pctEfectivo,2);
  near(g(60).perdidaEfectivaAnual,g(60).perdidaEstandarAnual);
});
test('TAX-004 (hallazgo): % estándar es un campo editable con 2 % por defecto; la ley da 3 % (fin. 2023+), 2 % (1925–2022), 2,5 % (<1925)',()=>{
  has(afaSrc,/afaEstandarPct:2,/); has(afaSrc,/AfA estándar del inmueble \(según fecha de construcción\)/);
  has(afaSrc,/cocina se deduce entera en el año 1/);   // afirmación fiscal a revisar (Einbauküche es un bien mueble con su propia vida útil)
});

// ================= AOR-TAX-007: Grunderwerbsteuer duplicado =================
test('TAX-007: la tabla de afa.js y la de calc.js coinciden en los 16 Länder (guardia contra desincronización)',()=>{
  const tabla=new Function('return '+afaSrc.slice(afaSrc.indexOf('var AFA_BUNDESLAND_ITP=')+'var AFA_BUNDESLAND_ITP='.length,afaSrc.indexOf('};',afaSrc.indexOf('var AFA_BUNDESLAND_ITP='))+1))();
  assert.equal(Object.keys(tabla).length,16); assert.equal(calc.INM_BUNDESLAENDER.length,16);
  calc.INM_BUNDESLAENDER.forEach(([cod,nombre,pct])=>assert.equal(tabla[nombre],pct,nombre));
  has(read('calc.js'),/INM_BUNDESLAENDER_ESTADO='pendiente_de_validacion'/);
});

// ================= Pensión pública (analisis.html) =================
function cargarPension(){
  const vals=bloque(ana,'var AORAES_GERMANY_VALUES=').replace(/^var AORAES_GERMANY_VALUES=/,'');
  const code='var AORAES_GERMANY_VALUES='+vals+';'+['besteuerungsanteilForYear','netStatePensionAnnual','monthsBetween','addYears','getRegularRetirementAge','regularRetirementDate','computeAccessFactor'].map(n=>fn(ana,n)).join('\n')
    +'; function einkommensteuer2026(z){return AORAES_IMPUESTO.cuota(z);} return {GV:AORAES_GERMANY_VALUES,besteuerungsanteilForYear,netStatePensionAnnual,monthsBetween,addYears,getRegularRetirementAge,regularRetirementDate,computeAccessFactor};';
  return new Function('AORAES_IMPUESTO',code)(T);
}
const P=cargarPension();
test('PEN-003: Besteuerungsanteil por año de inicio = calendario legal (50 % 2005, +2 pp hasta 80 % en 2020, +1 pp hasta 82 % en 2022, +0,5 pp hasta 100 % en 2058)',()=>{
  const e={2005:.5,2010:.6,2020:.8,2021:.81,2022:.82,2023:.825,2026:.84,2040:.91,2057:.995,2058:1,2070:1,2000:.5};
  for(const [y,v] of Object.entries(e)) near(P.besteuerungsanteilForYear(+y),v,1e-12);
});
test('PEN-003: pensión neta = bruto − ESt(84 % × bruto − 102) − 11,9 % × bruto ; 0 si bruto ≤ 0',()=>{
  const b=24000, zve=b*0.84-102, esperado=b-ley32a(zve)-b*0.119;
  near(P.netStatePensionAnnual(b,2026),esperado,1e-9);
  assert.equal(P.netStatePensionAnnual(0,2026),0); assert.equal(P.netStatePensionAnnual(-5,2026),0); assert.ok(P.netStatePensionAnnual(1e5,2040)<1e5);
  assert.ok(P.netStatePensionAnnual(30000,2026)>P.netStatePensionAnnual(30000,2040)); // más Besteuerungsanteil -> más impuesto
});
test('PEN-003 (hallazgos): tarifa 2026 aplicada a cualquier año de inicio; sin otros ingresos, sin Splitting y 11,9 % fijo (hipótesis, no tasa legal)',()=>{
  has(ana,/retireeHealthCareContribRate:0\.119/); has(ana,/pensionWerbungskostenPauschale:102/); has(ana,/var steuer=einkommensteuer2026\(zve\);/);
  assert.equal(P.GV.referenceYear,2026); assert.equal(P.GV.averagePensionEarnings,51944); assert.equal(P.GV.generalPensionContributionCeiling,101400);
  assert.equal(P.GV.basisPensionLimitSingle,30826); assert.equal(P.GV.basisPensionLimitJoint,61652);
});
test('PEN-002: Regelaltersgrenze por cohorte (1946 → 65;0 … 1958 → 66;0 … 1959 → 66;2 … 1963 → 66;10 … 1964 → 67;0)',()=>{
  const e=(y)=>P.getRegularRetirementAge(new Date(y,5,15));
  [[1946,65,0],[1947,65,1],[1958,66,0],[1959,66,2],[1960,66,4],[1963,66,10],[1964,67,0],[1990,67,0]].forEach(([y,a,m])=>assert.deepEqual([e(y).years,e(y).months],[a,m],String(y)));
});
test('PEN-002: Zugangsfaktor — −0,3 %/mes con tope 14,4 %, +0,5 %/mes de retraso (§77 SGB VI)',()=>{
  const dob=new Date(1990,5,15), reg=P.regularRetirementDate(dob), f=e=>P.computeAccessFactor(P.addYears(dob,e),reg);
  near(f(67),1); near(f(66),1-12*0.003); near(f(63),1-48*0.003); near(f(70),1+36*0.005); near(f(75),1+96*0.005);
});
test('PEN-002 (L, hallazgo): el campo de edad admite 50–75 y el factor se limita a −14,4 %: se calcula pensión para edades en las que no hay derecho a Altersrente anticipada',()=>{
  has(ana,/id="f-sit-edadJub" type="number" class="num-inp" min="50" max="75"/);
  const dob=new Date(1990,5,15), reg=P.regularRetirementDate(dob);
  [50,55,60,62].forEach(e=>near(P.computeAccessFactor(P.addYears(dob,e),reg),1-0.144,1e-12)); // misma pensión (−14,4 %) a los 50 que a los 63
  has(ana,/La app no comprueba si el cliente cumple los requisitos legales para jubilarse antes/);
});
test('PEN-001 (L, hallazgo): Entgeltpunkte con sueldo actual ÷ salario medio 2026 y techo 2026 para años pasados y futuros; carrera desde los 23 como hipótesis',()=>{
  has(ana,/Math\.min\(pastAnnual,GV\.generalPensionContributionCeiling\)\/GV\.averagePensionEarnings\*contributionYearsRaw/);
  has(ana,/Math\.min\(futureAnnual,GV\.generalPensionContributionCeiling\)\/GV\.averagePensionEarnings\*yearsUntilRetirement/);
  has(ana,/Math\.max\(\(ageFromDOB\(dobP\)\|\|0\)-23,0\)/);
  const ep=(s,años)=>Math.min(s,101400)/51944*años;
  near(ep(51944,1),1); near(ep(200000,1),101400/51944);          // sobre el techo no suma más
  near(ep(40000,30)+ep(40000,10),40000/51944*40);
});
test('PEN-004: factor de retirada genérico 0,002162/mes por € de capital (≈ 2,59 %/año) — NO es un Rentenfaktor; con RF hipotético 25 €/10.000 € serían 250 €',()=>{
  has(ana,/var PROD_ANN_NET=0\.002162;/);
  near(100000*0.002162,216.2,1e-9); near(100000/10000*25,250);
  assert.notEqual(100000*0.002162,250);
});
test('PEN-005: objetivo = (ingreso propio − alquiler − intereses) × %; alquiler/intereses se SUMAN a lo disponible; privada y contratos deflactados con el mismo infFactor',()=>{
  has(ana,/var target=\(ownIncome-contIncome\)\*TARGET;/); has(ana,/var priv=\(pot\*PROD_ANN_NET\)\/infFactor\+contIncome\+rentaGar\+rentaEst;/);
  has(ana,/var rentaGar=\(sit\['rentaGarantizadaTotal_'\+letter\]\|\|0\)\/infFactor;/);
  const gap=(ing,alq,pct,est,priv)=>Math.max((ing-alq)*pct-est-(priv+alq),0);
  near(gap(3000,500,0.8,1000,0),500);       // objetivo 2.000 − pensión 1.000 − alquiler 500
  near(gap(3000,0,0.8,1000,0),1400);
});
test('PEN-006: rentabilidad neta asumida 6 % por defecto, nominal /12; el capital de contratos nominales se deflacta',()=>{
  has(ana,/var PROD_RETURN=\(sit\.rendJub\|\|6\)\/100;/); has(ana,/var pot=fvAnnuity\(aporteJub,PROD_RETURN\/12,nM\);/);
  near(Math.pow(1.02,20),1.4859473959783548,1e-12);
});

// ================= Jubilación (jubilacion.html): fiscalidad y productos =================
test('RET-004 (L, hallazgo): el ahorro de Basisrente asume libre TODO el tope de 30.826 € (soltero), sin descontar cotizaciones DRV/empleador',()=>{
  has(jub,/ahorroFiscalAnual\(Math\.min\(ruerup\*12,BASISRENTE_LIMIT\.single\)\)\/12/);
  // Ilustración (asalariado con bruto 60.000 €, DRV 18,6 % = 11.160 €): tope libre ≈ 30.826 − 11.160 = 19.666 €
  const zve=60000*0.78, libre=30826-0.186*60000;
  const conTope=T.ahorroPorDeduccion(zve,Math.min(24000,30826)), conLibre=T.ahorroPorDeduccion(zve,Math.min(24000,libre));
  assert.ok(conTope>conLibre); console.log(`  Basisrente 24.000 €/año: ahorro con tope completo ${conTope} € vs con tope libre ${Math.round(libre)} € → ${conLibre} € (diferencia ${conTope-conLibre} €)`);
});
test('RET-005 (hallazgo): tipo fiscal en jubilación = 65 % del marginal actual; Besteuerungsanteil para Rürup y Ertragsanteil para la privada',()=>{
  has(jub,/jr=Math\.round\(taxRate\*100\*0\.65\)\/100/); has(jub,/rMoN=rMoG\*\(1-bst\*jr\), pMoN=pMoG\*\(1-ea\*jr\)|const rMoN=rMoG\*\(1-bst\*jr\), pMoN=pMoG\*\(1-ea\*jr\)|rMoN=rMoG\*\(1-bst\*jr\)/);
  const t={60:22,61:22,62:21,63:20,64:19,65:18,66:18,67:17,68:16,69:15,70:15,71:14,72:13,73:13,74:12};
  const e=new Function(fn(jub,'ertragsanteil')+'; return ertragsanteil;')();
  Object.entries(t).forEach(([a,p])=>near(e(+a),p/100)); near(e(75),0.12);   // 75+ se queda en 12 % (la ley baja a 11 % a los 75)
});
test('RET-007 (hallazgo): la renta del ETF usa 4 % fijo; el control «retDraw» (3 %) se usa como retirada en el simulador genérico y como rentabilidad en el PDF',()=>{
  has(jub,/const moG=gE\*0\.04\/12;/); has(jub,/const monthlyEquiv=capitalEst\*\(\(S\.retDraw\|\|3\)\/100\)\/12;/); has(jub,/const _mr=Math\.pow\(1\+\(S\.retDraw\|\|0\)\/100,1\/12\)-1;/);
  has(jub,/Rentabilidad en la jubilación<b id="av-retdraw">/);
});
test('RET-003 (hallazgo): «garantizada» = capital proyectado al rendimiento elegido × Rentenfaktor; excedentes aparte; etiqueta «Renta garantizada de por vida»',()=>{
  has(jub,/rMoG=gR\*\(Pr\.rf\/10000\),pMoG=gP\*\(Pp\.rf\/10000\)/); has(jub,/rMoGs=rMoG\*\(Pr\.surplus\|\|1\)/); has(jub,/Renta garantizada<br>de por vida/);
});
test('RET-009 (L, hallazgo): Riester — Kinderzulage 300 € para todos los hijos (sin 185 €) y sin titular en jubilacion.html; analisis.html la asigna siempre a la Persona A',()=>{
  has(jub,/const RIESTER=\{grundzulage:175,kinderzulage:300,sockelbetrag:60,mindesteigenbeitragPct:0\.04,hoechstbetrag:2100\};/);
  has(jub,/const zulageBase=RIESTER\.grundzulage\+kids\*RIESTER\.kinderzulage;/);
  has(ana,/RIESTER_KINDERZULAGE_OLD=185/);
});
test('RET-010 (L, hallazgo): bAV +15 % de Zuschuss como constante universal (solo en analisis.html)',()=>{
  has(ana,/var BAV_EMPLOYER_MATCH=0\.15;/); assert.ok(!/BAV_EMPLOYER_MATCH|1\.15\b/.test(jub.replace(/line-height:1\.15|letter-spacing|padding:1\.15rem|[0-9]\.15rem/g,'')));
});
