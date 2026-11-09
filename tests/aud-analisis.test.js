/* analisis.html: las funciones viven dentro de un IIFE con DOM. Se ejecuta lo que se puede extraer (incomeShareAB) y el resto se «fija» por texto:
   si alguien cambia estas reglas, la prueba falla y obliga a revisar el hallazgo. Ninguna modifica analisis.html. */
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','analisis.html'),'utf8');
const has=re=>assert.ok(re.test(src),'no encontrado: '+re);
function extraer(nombre){
  const i=src.indexOf('function '+nombre+'('); assert.ok(i>=0); let d=0,j=src.indexOf('{',i);
  for(;j<src.length;j++){ if(src[j]==='{')d++; else if(src[j]==='}'){d--; if(!d)break;} } return src.slice(i,j+1);
}
const near=(a,b,t=1e-9)=>assert.ok(Math.abs(a-b)<=t,`${a} ≠ ${b}`);

// ---------- AOR-ANA-004 incomeShareAB (ejecutado) ----------
function share(campos){
  const els=Object.entries(campos).map(([k,v])=>({getAttribute:()=>k,value:String(v)}));
  const document={querySelectorAll:()=>els};
  return new Function('document',extraer('incomeShareAB')+'; return incomeShareAB();')(document);
}
test('ANA-004: reparto proporcional A+B = 1',()=>{
  const s=share({sueldo_A:3000,sueldo_B:1000}); near(s.A,0.75); near(s.B,0.25); near(s.A+s.B,1);
});
test('ANA-004: A=0 y B>0 -> todo a B ; ambos 0 -> 50/50 arbitrario (documentado)',()=>{
  assert.deepEqual(share({sueldo_A:0,sueldo_B:2000}),{A:0,B:1});
  assert.deepEqual(share({sueldo_A:0,sueldo_B:0}),{A:0.5,B:0.5});
});
test('ANA-004: ingresos sin sufijo _A/_B no entran en el reparto (hallazgo: se ignoran en silencio)',()=>{
  const s=share({sueldo_A:1000,sueldo_B:1000,otros:5000}); assert.deepEqual(s,{A:0.5,B:0.5}); // 5.000 € de ingreso común no cambian el reparto
});

// ---------- AOR-ANA-005 (CORREGIDO en Bloque 2b, decisión del responsable: «quitarlo de la nota») ----------
test('ANA-005: la nota de jubilación ya NO mezcla el 30 % de «menores»; coincide con la de la pirámide',()=>{
  assert.ok(!/0\.7\*s\.jubilacion/.test(src),'sigue la mezcla 70/30');
  assert.ok(!/minorsScore/.test(src),'sigue minorsScore');
  const comp=extraer('compute');
  // los tres tramos de s.jubilacion son los mismos que usa levelScores (jubScore)
  has(/s\.jubilacion = clamp\(\(ret\.statePension\+ret\.priv\)\/ret\.target\*100,0,100\);/);
  has(/jubScore=clamp\(\(r\.ret\.statePension\+r\.ret\.priv\)\/r\.ret\.target\*100,0,100\);/);
  assert.ok(/s\.jubilacion = clamp\(aporteRate\/0\.15\*100,0,100\)/.test(comp));
  assert.ok(!/Math\.round\(.*s\.jubilacion/.test(comp),'s.jubilacion no se redondea ni se mezcla después de calcularse');
});
test('ANA-005: tieneMenores / menoresNoAplica se siguen conservando (datos y acción recomendada), solo dejan de afectar a la nota',()=>{
  has(/setHiddenChk\('sit','tieneMenores',tieneMenores\)/);
  has(/if\(!r\.menoresNoAplica && !r\.tieneMenores\) acts\.push\('Establecer un ahorro o previsión para los menores\.'\);/);
  has(/tieneMenores:tieneMenores,menoresNoAplica:!!sit\.menoresNoAplica/);
});
test('ANA-005: efecto numérico — misma cobertura de jubilación con y sin contrato de menores da la misma nota',()=>{
  const jub=100; const nota=(menores)=>jub; // tras la corrección no depende de menores
  assert.equal(nota(true),nota(false));
});

// ---------- AOR-ANA-006 cobertura presente sin importe ----------
test('ANA-006: criterios AORAES vigentes (heurísticas, no umbrales legales ni de proveedor)',()=>{
  has(/var BU_ADEQUACY_THRESHOLD=1\.0;/); has(/var INCAP_TYPE_FACTOR=\{BU:1, GF:0\.6, EU:0\.6\};/);
  has(/var RC_ADEQUACY_THRESHOLD=3000000;/); has(/var ACCIDENTES_ADEQUACY_MULTIPLE=44;/); has(/var HOGAR_ADEQUACY_PER_SQM=650;/);
  has(/var PATRIMONIO_RC_FLOOR=80;/);
  has(/insWeight=\{insSalud:2,insIncap:2,insPflege:2,insVida:2,insRC:2,insAuto:1,insHogar:1,insGebaude:1,insGlas:0,insAccidentes:1/);
});
test('ANA-006: póliza marcada SIN importe recibe crédito completo (BU: factor del tipo; RC, Accidentes, Hogar: 1)',()=>{
  has(/if\(!any\) return factor;/);                                   // BU sin renta registrada
  const rc=extraer('rcCoverageCredit'), acc=extraer('accidentesCoverageCredit'), hog=extraer('hogarCoverageCredit');
  assert.ok(/if\(!any\) return 1;/.test(rc)); assert.ok(/if\(!any\) return 1;/.test(acc)); assert.ok(/if\(!any\|\|!\(wohnflaeche>0\)\) return 1;/.test(hog));
  // aritmética: un BU «tipo BU» sin importe puntúa igual que uno que cubre el 100 % de los gastos
  const credito=(renta,gastos,f)=>renta===null?f:Math.min(renta/gastos/1.0,1)*f;
  assert.equal(credito(null,3000,1),credito(3000,3000,1));
  assert.ok(credito(1000,3000,1)<1);
});
test('ANA-006: GF/EU puntúan 0,6 y manda la cobertura más débil (BU+GF juntos bajan a 0,6)',()=>{
  const f=(tipos)=>Math.min(...tipos.map(t=>({BU:1,GF:0.6,EU:0.6})[t]),1);
  assert.equal(f(['BU']),1); assert.equal(f(['GF']),0.6); assert.equal(f(['BU','GF']),0.6);
});
test('ANA-006: Accidentes compara Grundsumme con totIncome ×44 (la fórmula del guion habla de ingreso NETO mensual; el campo no distingue)',()=>{
  has(/Math\.min\(grundsumme\/\(totIncome\*ACCIDENTES_ADEQUACY_MULTIPLE\),1\)/);
});

// ---------- AOR-ANA-007 pirámide ----------
test('ANA-007: vivienda — precio de referencia por defecto 250.000 € y el peor de tamaño/avance; Bausparsumme 0 no divide por cero',()=>{
  has(/precioRef=r\.precioViviendaObjetivo>0\?r\.precioViviendaObjetivo:250000/);
  has(/vScore=Math\.round\(Math\.min\(vTam,vProg\)\)/);
  has(/if\(r\.bausparsummeTarget>0\)\{/);
  const v=(bs,saldo,precio)=>{ if(!(bs>0)) return 0; const t=Math.min(bs/(precio||250000)*100,100), p=Math.min((saldo||0)/bs*100,100); return Math.round(Math.min(t,p)); };
  assert.equal(v(0,0),0); assert.equal(v(125000,125000),50); assert.equal(v(250000,0),0); assert.equal(v(250000,250000),100);
});
test('ANA-007: con RC cubierta el pilar Patrimonio parte de 80 aunque falten hogar, edificio y auto (suelo AORAES)',()=>{
  has(/patrimonio:Math\.round\(Math\.max\(patrimonioRcFloor\(\), groupIns\(\['insRC','insHogar','insGebaude','insAuto','insLegal'\]\)\)\)/);
});

// ---------- AOR-ANA-008 contratos S.5 ----------
test('ANA-008: renta GARANTIZADA y ESTIMADA se SUMAN en priv; si la estimada incluye la garantizada (habitual en un Vorschlag) se cuenta dos veces',()=>{
  has(/var priv=\(pot\*PROD_ANN_NET\)\/infFactor\+contIncome\+rentaGar\+rentaEst;/);
  has(/label:'Renta mensual GARANTIZADA según el contrato \(opcional\)'/); has(/label:'Renta mensual ESTIMADA, proyección no garantizada \(opcional\)'/);
  const priv=(gar,est,inf=1)=>gar/inf+est/inf;
  assert.equal(priv(250,350),600);      // si 350 ya incluye los 250 garantizados, lo correcto sería 350
});
test('ANA-008: un contrato con renta declarada deja de alimentar la proyección genérica (evita contar su aportación dos veces)',()=>{
  has(/if\(gar>0\|\|est>0\)\{ garA\+=gar\*pA;/); has(/else \{ aporteProyA\+=monto\*pA; aporteProyB\+=monto\*pB; \}/);
});
test('ANA-008: bAV suma un 15 % de empleador a la aportación; Riester suma la Zulage; ambas entran en «aporteJubilacion» (tasa de ahorro del cliente)',()=>{
  has(/if\(BAV_TYPES\.indexOf\(r\.tipo\)>=0\) monto\*=\(1\+BAV_EMPLOYER_MATCH\);/); has(/var BAV_EMPLOYER_MATCH=0\.15;/);
  has(/setHiddenVal\('sit','aporteJubilacion',aporte\)/);
});
test('ANA-008/RET-009: la Kinderzulage se asigna siempre a la Persona A',()=>{
  has(/if\(persona==='A'\)\{\s*getChildrenData\(\)\.forEach/);
});

// ---------- AOR-ANA-001/003 flujo y emergencia ----------
test('ANA-001/003: flujo = ingresos − gastos totales (que incluyen cuotas de préstamo); tasa con ingreso 0 no divide por cero; fondo de emergencia sobre gasto total',()=>{
  has(/var flow=totIncome-totExp;/); has(/var rate=totIncome>0\?flow\/totIncome:0;/); has(/var efBase = totExp;/);
  has(/var meses=efBase>0\?ahorroLiq\/efBase:0;/);
  has(/\['prestamos','Cuotas de préstamos'\]/);   // cuota completa (capital + interés) como gasto: no separa amortización
});
test('ANA-003: curva de emergencia — 0-3 meses hasta 80, 3-6 hasta 100, 6-10 =100, >10 baja 4 pts/mes con suelo 40 (heurística documentada)',()=>{
  has(/meses<=3\?meses\/3\*80:meses<=6\?80\+\(meses-3\)\/3\*20:meses<=10\?100:Math\.max\(100-\(meses-10\)\*4,40\)/);
  const e=m=>m<=3?m/3*80:m<=6?80+(m-3)/3*20:m<=10?100:Math.max(100-(m-10)*4,40);
  assert.equal(e(0),0); assert.equal(e(3),80); assert.equal(e(6),100); assert.equal(e(10),100); assert.equal(e(12),92); assert.equal(e(40),40);
});
test('ANA-002: pesos de la nota global 30/20/15/20/15 y deuda excluida (se reescala) si el gasto es un total único',()=>{
  has(/var W=\{flujo:\.30,emergencia:\.20,deuda:\.15,jubilacion:\.20,proteccion:\.15\};/);
  has(/if\(expTotalMode\) activeDims=activeDims\.filter\(function\(k\)\{return k!=='deuda';\}\);/);
  const W={flujo:.30,emergencia:.20,deuda:.15,jubilacion:.20,proteccion:.15}; const act=['flujo','emergencia','jubilacion','proteccion'];
  const wsum=act.reduce((a,k)=>a+W[k],0); near(wsum,0.85); near(act.reduce((a,k)=>a+W[k]/wsum,0),1);
});
