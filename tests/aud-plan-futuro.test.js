/* AOR-FUT-001..005 — plan-futuro.html: simulate() y secuencias se ejecutan extraídos del HTML. La calibración es DENTRO de muestra (se ajustó con estas mismas cifras). */
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path');
const M=require('../mathcore.js'), src=fs.readFileSync(path.join(__dirname,'..','plan-futuro.html'),'utf8');
const near=(a,b,t=1e-9)=>assert.ok(Math.abs(a-b)<=t,`${a} ≠ ${b}`), has=re=>assert.ok(re.test(src),'no encontrado: '+re);
function ex(n){ const i=src.indexOf('function '+n+'('); assert.ok(i>=0,n); let d=0,j=src.indexOf('{',i); for(;j<src.length;j++){ if(src[j]==='{')d++; else if(src[j]==='}'){d--; if(!d)break;} } return src.slice(i,j+1); }
const HAIRCUT=src.match(/const HAIRCUT=(\[\[.*?\]\]);/)[1];
function motor(S,cubiertas){
  const cov=cubiertas||{kiz:0,bu:0}, C={bu:'none',vs:'none',kiz:0};
  const cod=`const HAIRCUT=${HAIRCUT};`+ex('interp')+';const haircut=years=>interp(HAIRCUT,years);'+ex('simulate')+';return {simulate,haircut,interp};';
  return new Function('S','childCovers','vsMonths','vsPctOf','C',cod)(S,()=>cov,()=>0,()=>0,C);
}
const base=o=>Object.assign({ret:6,dyn:0,monthly:50,capital0:0,childAge:1,payerAge:35,extraYear:0},o);

test('FUT-001: reproduce las 3 ilustraciones oficiales al 6 % (niño 1/6/12 años, 50 €/mes hasta los 67) con error ≤ 0,2 % — calibración dentro de muestra',()=>{
  [[1,66,486391],[6,61,349005],[12,55,233626]].forEach(([edad,años,oficial])=>{
    const c=motor(base({childAge:edad})).simulate(años).capital; assert.ok(Math.abs(c-oficial)/oficial<0.002,`${edad}: ${c} vs ${oficial}`);
  });
});
test('FUT-001: ejemplo documentado 27.000 € + 75 €/mes, 16 años, 6 % = 85.701 € (94.176 € brutos −9 %)',()=>{
  const d=motor(base({monthly:75,capital0:27000,childAge:2})).simulate(16); near(d.raw,94176,1); near(d.h,0.09); near(d.capital,85701,1);
});
test('FUT-001: tabla de recorte [0,9 %]…[55,9 %]…[61,6,3 %]…[66,3,9 %] interpolada; sin coste sobre capital inicial ni extras (solo 2,5 % sobre la inversión de los 60 primeros meses)',()=>{
  has(/const HAIRCUT=\[\[0,0\.09\],\[55,0\.09\],\[61,0\.063\],\[66,0\.039\]\];/); has(/ALPHA=0\.025, ZM=60/); has(/c=c\*\(1\+rm\(k\)\)\+inv\*\(k<ZM\?1-ALPHA:1\)/);
  const h=motor(base()).haircut; near(h(10),0.09); near(h(58),(0.09+0.063)/2); near(h(61),0.063); near(h(66),0.039); near(h(80),0.039);
});
test('FUT-001: el modelo es una calibración, no costes contractuales — a 2/4/8 % el recorte se EXTRAPOLA (sin ilustraciones oficiales)',()=>{
  const m=motor(base({childAge:6})); [2,4,8].forEach(r=>{ const mm=motor(base({childAge:6,ret:r})); const d=mm.simulate(61); near(d.capital,d.raw*(1-0.063),1e-6); });
  has(/Calibrado con ilustraciones oficiales al 6 % de varios plazos y edades/);
});
test('FUT-003: orden mensual — aportación al FINAL de cada mes; 1, 12, 13, 60 y 61 meses; r=0; extra al fin de cada año',()=>{
  const m=motor(base({ret:0,monthly:100,childAge:0}));
  near(m.simulate(1/12).raw,100*0.975,1e-9);                               // 1 mes: 100 − 2,5 % de entrada, sin interés
  near(m.simulate(1).raw,12*100*0.975,1e-9);
  near(m.simulate(5).raw,60*100*0.975,1e-9); near(m.simulate(61/12).raw,60*100*0.975+100,1e-9); // el mes 61 ya no paga entrada
  near(motor(base({ret:0,monthly:0,extraYear:1000,childAge:0})).simulate(3).raw,3000,1e-9);
  near(motor(base({ret:6,monthly:100,childAge:0})).simulate(5).raw,M.fvAnualidad(97.5,0.005,60),1e-6); // coincide con el núcleo (nominal/12, fin de mes)
});
test('FUT-002: coberturas — sin tablas se calculan a coste 0 y el motor avisa (coversUnpriced); nunca inventa un precio; un coste mayor que la cuota deja inversión 0, no negativa',()=>{
  has(/const coverCostMissing=\(\)=>coverSelected\(\)&&!coverTables\(\);/); has(/coversUnpriced:coverCostMissing\(\)/); has(/const inv=Math\.max\(0,M-risk\);/);
  const sin=motor(base({childAge:0,ret:0,monthly:100}),{kiz:0,bu:0}).simulate(1).raw, caro=motor(base({childAge:0,ret:0,monthly:100}),{kiz:500,bu:0}).simulate(1).raw;
  assert.equal(caro,0); assert.ok(sin>0);
  has(/AORAES_COSTES_COBERTURAS/);   // las tablas internas no están en el fichero público
  assert.ok(!/\[\s*\[\s*0\s*,\s*\d+(\.\d+)?\s*\]\s*,\s*\[\s*1\s*,\s*\d/.test(src.slice(src.indexOf('const coverTables'),src.indexOf('const coverTables')+400)));
});
test('FUT-004: riesgo de secuencia — la media geométrica de la secuencia con caída = la del escenario (solo cambia el ORDEN)',()=>{
  const S={ret:6}; const effRet=()=>(Math.pow(1+S.ret/1200,12)-1)*100;
  const seqCrash=new Function('effRet',ex('seqCrash')+'; return seqCrash;')(effRet), seqMean=new Function('effRet',ex('seqMean')+'; return seqMean;')(effRet);
  for(const N of [2,5,18,40]) for(const pos of ['start','mid','end']) for(const caida of [10,30,50,99]){
    const a=seqCrash(N,pos,caida); assert.equal(a.length,N); near(seqMean(a,N),effRet(),1e-6);
  }
  assert.deepEqual(seqCrash(1,'end',30),[effRet()]);                                  // plazo 1 año: N−1 = 0 evitado
  assert.deepEqual(seqCrash(10,'end',0),Array(10).fill(effRet()));                    // caída 0 = plana
  near(seqCrash(5,'start',99)[0],-99);                                                // −99 % admitido (factor 0,01 > 0)
  assert.ok(seqCrash(5,'mid',20).every(x=>x>-100));
});
test('FUT-004 (corrige Bloque 1): el escenario plano y las secuencias del propio código SÍ usan la misma convención (effRet convierte nominal→efectivo); solo una secuencia escrita a mano «6, 6, 6…» es 6 % efectivo',()=>{
  has(/const effRet=\(\)=>\(Math\.pow\(1\+S\.ret\/1200,12\)-1\)\*100;/);
  const S=base({childAge:6}), m=motor(S); const e=(Math.pow(1+S.ret/1200,12)-1)*100;
  near(m.simulate(20).raw,m.simulate(20,Array(20).fill(e)).raw,1e-6);                 // secuencia generada por el código: idéntica al escenario plano
  assert.ok(m.simulate(20).raw>m.simulate(20,Array(20).fill(6)).raw);                 // una secuencia tecleada «6» (efectivo) rinde menos que el «6 %» nominal
});
test('FUT-004: horizonte por año de calendario; capital negativo imposible; plazo 0 no rompe',()=>{
  has(/const years=Math\.max\(0,S\.targetYear-THIS_YEAR\);/); assert.equal(motor(base()).simulate(0).capital,0);
  assert.ok(motor(base({ret:2,childAge:0})).simulate(0.5).capital>=0);
});
test('FUT-005: reglas de salud de menores — triage orientativo con aviso; se revisan con AVB y underwriting vigentes (la privacidad se audita en el Bloque 6)',()=>{
  const pm=fs.readFileSync(path.join(__dirname,'..','preguntas-medicas.html'),'utf8');
  assert.ok(/orientativ|no (es|constituye|sustituye)|aseguradora|no vinculante|sin valor/i.test(pm),'debe existir un aviso de que no es una decisión de la aseguradora');
});
