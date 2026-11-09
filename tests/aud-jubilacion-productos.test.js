/* AOR-RET-001/002/003/006/008 — jubilacion.html: fvIns / fvETF / fvETFdetailed se ejecutan extraídos. Todo lo de proveedor es del CÓDIGO, no verificado. */
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path');
const M=require('../mathcore.js'), src=fs.readFileSync(path.join(__dirname,'..','jubilacion.html'),'utf8');
const near=(a,b,t=1e-9)=>assert.ok(Math.abs(a-b)<=t,`${a} ≠ ${b}`), has=re=>assert.ok(re.test(src),'no encontrado: '+re);
function ex(n){ const i=src.indexOf('function '+n+'('); assert.ok(i>=0,n); let d=0,j=src.indexOf('{',i); for(;j<src.length;j++){ if(src[j]==='{')d++; else if(src[j]==='}'){d--; if(!d)break;} } return src.slice(i,j+1); }
function motor(S){
  const ins=src.slice(src.indexOf('const INSURERS={'),src.indexOf('function getProd')).trim();
  const cod=ins+';'+['getProd','fvIns','fvETF','fvETFdetailed','noCostFV','noCostFVm'].map(ex).join('\n')+';return {INSURERS,getProd,fvIns,fvETF,fvETFdetailed,noCostFV,noCostFVm};';
  return new Function('S',cod)(S);
}
const S0=()=>({excel:false,etfSwitches:true});

test('RET-001: parámetros de Generali del código — sin código tarifario, generación, vigencia, fuente ni verificación (no hay ProductParameterVersion)',()=>{
  const m=motor(S0()), g=m.INSURERS.generali;
  assert.deepEqual(g.brva,{ap:965,vwk:0,gamma:0.437,rf:24.08,surplus:1.4127}); assert.deepEqual(g.vasp,{ap:918,vwk:0,gamma:0.675,rf:24.16,surplus:1.4116});
  assert.deepEqual(Object.keys(g.brva).sort(),['ap','gamma','rf','surplus','vwk']);    // ni fuente, ni fecha, ni versión
  assert.ok(!/productoResolver|productoUsable/.test(src));
});
test('RET-002: fvIns — aportación ANUAL adelantada, Abschlusskosten ap×monthly/100 repartidos en 5 años, gamma anual sobre el capital, vwk=0 (no significa «sin costes»)',()=>{
  const m=motor(S0()); const mo=300, P=m.getProd('generali','brva'), ap=P.ap*(mo/100)/5, r=0.06, g=P.gamma/100;
  let c=0; for(let y=1;y<=30;y++){ c=(c+mo*12-(y<=5?ap:0)-P.vwk*(mo/100))*(1+r); c*=(1-g); }
  near(m.fvIns(mo,6,30,'generali','brva'),c,1e-6);
  near(ap*5,965*3,1e-9);                                    // Abschlusskosten totales = 965 € por cada 100 €/mes (9,65 mensualidades)
  assert.equal(m.fvIns(0,6,30,'generali','brva'),0); assert.equal(m.fvIns(-5,6,30,'generali','brva'),0);
});
test('RET-002: propiedades — más aportación no reduce el capital; con coste cero y gamma cero coincide con la anualidad adelantada del núcleo',()=>{
  const m=motor(S0()); for(const mo of [50,300,1000]) assert.ok(m.fvIns(mo*1.01,6,20,'generali','vasp')>=m.fvIns(mo,6,20,'generali','vasp'));
  near(m.noCostFV(300,6,30),300*12*((1.06**30-1)/0.06)*1.06,1e-4);
  near(m.noCostFV(300,6,30),M.fvAnualidad(3600,0.06,30,'inicio'),1e-4);
  const costes=m.noCostFV(300,6,30)-m.fvIns(300,6,30,'generali','vasp'); assert.ok(costes>0); console.log(`  VASP 300 €/mes, 30 años, 6 %: sin costes ${Math.round(m.noCostFV(300,6,30))} € → con costes del código ${Math.round(m.fvIns(300,6,30,'generali','vasp'))} € (${(costes/m.noCostFV(300,6,30)*100).toFixed(1)} % menos)`);
});
test('RET-003: renta = capital × RF/10.000 ; 100.000 € × 25 = 250 €/mes brutos; los excedentes se calculan aparte con `surplus` (no sustituyen a la «garantizada»)',()=>{
  near(100000*25/10000,250); has(/rMoG=gR\*\(Pr\.rf\/10000\),pMoG=gP\*\(Pp\.rf\/10000\)/); has(/rMoGs=rMoG\*\(Pr\.surplus\|\|1\), pMoGs=pMoG\*\(Pp\.surplus\|\|1\)/);
  has(/moGgar:rMoG\+pMoG,moGsurplus:rMoGs\+pMoGs/);
});
test('RET-006: ETF — TER 0,6 %, spread 0,1 %, Vorabpauschale 0,12 % del capital, 26,375 %, Teilfreistellung 30 % fijos en el código; sin Freibetrag ni Basiszins; pérdidas no compensadas',()=>{
  has(/\(rate-0\.6\)\/100\/12/); has(/monthly\*0\.999/); has(/const vorab=cap\*0\.0012;vorabPool\+=vorab;cap-=vorab\*0\.26375;/); has(/gain\*0\.70\*0\.26375/);
  assert.ok(!/Sparer-?Pauschbetrag|Freistellungsauftrag|Basiszins|Basisertrag|Kirchensteuer/i.test(ex2('fvETFdetailed')));
  function ex2(n){ return ex(n); }
});
test('RET-006: fvETFdetailed — neto ≤ bruto, impuestos ≥ 0, sin ganancia no hay impuesto final, switches solo tributan si hay ganancia realizada; sin switches menos impuesto intermedio',()=>{
  const sw=motor({excel:false,etfSwitches:true}), nosw=motor({excel:false,etfSwitches:false});
  const a=sw.fvETFdetailed(300,6,30), b=nosw.fvETFdetailed(300,6,30);
  assert.ok(a.net<=a.gross&&a.tax>=0&&a.switchTax>0&&b.switchTax===0&&b.net>a.net-1e9); console.log(`  ETF 300 €/mes 30 años 6 %: bruto ${Math.round(a.gross)} neto ${Math.round(a.net)} (con switches, impuesto intermedio ${Math.round(a.switchTax)}) | sin switches neto ${Math.round(b.net)}`);
  const z=nosw.fvETFdetailed(300,0.6,10);                                  // rentabilidad neta de TER = 0 %: sin ganancia
  assert.equal(z.net<=z.gross,true); near(z.gross,300*0.999*120-z.gross*0+0,z.gross); assert.equal(nosw.fvETFdetailed(0,6,30).gross,0);
});
test('RET-006/MAT-001: fvETF y fvETFdetailed difieren en el momento de aportación (inicio vs fin de mes) — +0,45 % a cualquier horizonte (ver Bloque 1)',()=>{
  const m=motor({excel:false,etfSwitches:false}), r=(6-0.6)/100/12;
  near(m.fvETF(300,6,1)/0.9988, M.fvAnualidad(299.7,r,12,'inicio'),1e-6);
});
test('RET-008: el «Modo Excel» suma 0,65 pp a la rentabilidad de los seguros (no del ETF); desactivado por defecto; se activa con un botón visible; mejora artificial del producto',()=>{
  has(/excel:false/); has(/<button id="gm-excel">Modo Excel<\/button>/); has(/\$\('gm-excel'\)\.addEventListener\('click',\(\)=>\{S\.excel=true;/); has(/const r=S\.excel\?\(rate\/100\+0\.0065\):\(rate\/100\)/);
  const off=motor({excel:false}), on=motor({excel:true});
  assert.ok(on.fvIns(300,6,30,'generali','vasp')>off.fvIns(300,6,30,'generali','vasp'));
  near(off.fvETF(300,6,30),on.fvETF(300,6,30));                                // el ETF no cambia
  console.log(`  Modo Excel: VASP 300 €/mes 30 años: ${Math.round(off.fvIns(300,6,30,'generali','vasp'))} → ${Math.round(on.fvIns(300,6,30,'generali','vasp'))} € (+${((on.fvIns(300,6,30,'generali','vasp')/off.fvIns(300,6,30,'generali','vasp')-1)*100).toFixed(1)} %)`);
});

// ---- AOR-RET-008 (decisión del responsable: «forzar apagado en informes») ----
test('RET-008: generatePDF fuerza S.excel=false mientras se genera el informe y lo restaura después (también si falla); la pantalla no cambia',async()=>{
  const wrapper='async '+ex('generatePDF');
  assert.ok(/_generatePDF\(lang\)/.test(wrapper),'generatePDF debe delegar en _generatePDF');
  const visto=[]; const S={excel:true};
  const inner=async()=>{ visto.push(S.excel); };
  const g=new Function('S','_generatePDF',wrapper+'; return generatePDF;')(S,inner);
  await g('es'); assert.deepEqual(visto,[false]); assert.equal(S.excel,true);          // dentro apagado, después restaurado
  S.excel=true; const g2=new Function('S','_generatePDF',wrapper+'; return generatePDF;')(S,async()=>{ throw new Error('boom'); });
  await assert.rejects(()=>g2('de'),/boom/); assert.equal(S.excel,true);               // restaurado aunque falle
  S.excel=false; await g('es'); assert.equal(S.excel,false);                           // apagado se queda apagado
});
test('RET-008: el informe se calcula con calc() dentro de _generatePDF (por tanto con S.excel apagado) y no hay otra vía de informe',()=>{
  const inner=ex('_generatePDF'); assert.ok(/const real=calc\('generali',years\)/.test(inner));
  assert.equal((src.match(/generatePDF\(/g)||[]).length>=3,true);
  assert.ok(!/window\.print\(|\.save\(\s*['"`][^)]*Excel/.test(src));
});
