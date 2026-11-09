const test=require('node:test'), assert=require('node:assert/strict');
const N=require('../necesidades.js'), C=N.NEC_CALCULADORAS;
const near=(a,b,t=1e-6)=>assert.ok(Math.abs(a-b)<=t,`${a} ≠ ${b}`);

// ---- AOR-NEC-006 (nuevo, E): los campos son type="text" y la pantalla muestra importes en formato es-ES con punto de millares ----
test('NEC-006: «1.500» y «1.500,50» se leen como importes es/de (1500 y 1500,5), no como 1,5',()=>{
  const bu=v=>C.bu.calcular(Object.assign({gastosFamiliares:'0',obligaciones:'0',ingresosDisponibles:'0'},v));
  assert.equal(bu({gastosFamiliares:'1.500'}).necesidad,1500);
  near(bu({gastosFamiliares:'1.500,50'}).necesidad,1500.5);
  near(bu({gastosFamiliares:'12.345.678,9'}).necesidad,12345678.9);
});
test('NEC-006: formatos que ya funcionaban no cambian',()=>{
  const bu=v=>C.bu.calcular(Object.assign({gastosFamiliares:'0',obligaciones:'0',ingresosDisponibles:'0'},v));
  assert.equal(bu({gastosFamiliares:'1500'}).necesidad,1500);
  near(bu({gastosFamiliares:'1500,5'}).necesidad,1500.5);
  near(bu({gastosFamiliares:'1500.5'}).necesidad,1500.5);   // punto decimal
  near(bu({gastosFamiliares:'0.5'}).necesidad,0.5);         // 0.500 no es «quinientos»
  near(bu({gastosFamiliares:'2.5'}).necesidad,2.5);
  assert.equal(bu({gastosFamiliares:1200}).necesidad,1200); // número ya numérico
});
test('NEC-006: entradas inválidas siguen siendo no válidas',()=>{
  ['abc','-5','1,2,3','1..5','','  ',null,undefined,NaN,Infinity].forEach(x=>assert.equal(C.bu.calcular({gastosFamiliares:x,obligaciones:'0',ingresosDisponibles:'0'}).completo,false,String(x)));
});

// ---- AOR-NEC-005: vacío ≠ 0 ; opcional inválido ----
test('NEC-005: campo obligatorio vacío -> faltan[]; 0 escrito es un dato',()=>{
  const r=C.bu.calcular({gastosFamiliares:'',obligaciones:'0',ingresosDisponibles:'0'});
  assert.deepEqual(r.faltan,['gastosFamiliares']); assert.equal(r.completo,false);
  assert.equal(C.bu.calcular({gastosFamiliares:'0',obligaciones:'0',ingresosDisponibles:'0'}).completo,true);
});
test('NEC-005: un opcional con texto inválido no marca provisional pero ahora queda registrado en invalidos[]',()=>{
  const r=C.bu.calcular({gastosFamiliares:'2000',obligaciones:'500',ingresosDisponibles:'0',rentaAsegurada:'mil'});
  assert.equal(r.completo,true); assert.deepEqual(r.invalidos,['rentaAsegurada']);
  assert.deepEqual(C.bu.calcular({gastosFamiliares:'2000',obligaciones:'500',ingresosDisponibles:'0',rentaAsegurada:''}).invalidos,[]); // vacío no es inválido
});
test('NEC-005: necesidad negativa se trunca a 0 pero se conserva la bruta',()=>{
  const r=C.bu.calcular({gastosFamiliares:'1000',obligaciones:'0',ingresosDisponibles:'3000'});
  assert.equal(r.necesidad,0); assert.equal(r.necesidadBruta,-2000); assert.equal(r.estado,'sin_necesidad');
});

// ---- AOR-NEC-004 Sterbegeld: plazo no indicado ----
test('NEC-004: sin plazo el ahorro equivalente es 0 en el motor (la pantalla lo muestra como «0 € al mes») -> ahora marcado como no calculable',()=>{
  const r=C.sterbegeld.calcular({costesFallecimiento:'8000',reservaDedicada:'0'});
  assert.equal(r.capitalNecesario,8000); assert.equal(r.ahorroMensualEquivalente,0); assert.equal(r.ahorroCalculable,false);
  const ok=C.sterbegeld.calcular({costesFallecimiento:'8000',reservaDedicada:'0',anosPrima:'10',tasaAhorro:'0'});
  near(ok.ahorroMensualEquivalente,8000/120); assert.equal(ok.ahorroCalculable,true);
  assert.equal(C.sterbegeld.calcular({costesFallecimiento:'8000',reservaDedicada:'9000'}).ahorroCalculable,true); // sin necesidad: 0 es correcto
});
test('NEC-004: reserva superior a costes -> capital 0, estado sin fallecimiento cubierto; año 1/20 no indexa costes (limitación documentada)',()=>{
  const r=C.sterbegeld.calcular({costesFallecimiento:'8000',reservaDedicada:'9000',anosPrima:'20'});
  assert.equal(r.capitalNecesario,0);
  // Los costes NO se indexan a la fecha objetivo: 20 años a 3 % los multiplicarían por 1,806. Sigue siendo una limitación de modelo.
  assert.equal(C.sterbegeld.calcular({costesFallecimiento:'8000',reservaDedicada:'0',anosPrima:'20'}).costesTotales,8000);
});

// ---- AOR-NEC-002 Risikoleben ----
test('NEC-002: valor presente de déficit; tasa 0 = suma simple; horizonte 0 solo gastos únicos',()=>{
  const base={hipoteca:'0',otrasDeudas:'0',gastoMensualSupervivientes:'3000',ingresoMensualSupervivientes:'1000'};
  assert.equal(C.risikoleben.calcular(Object.assign({anosACubrir:'10'},base)).necesidadesFuturas,2000*120);
  assert.equal(C.risikoleben.calcular(Object.assign({anosACubrir:'0',gastosUnicos:'5000'},base)).necesidadesFuturas,5000);
  assert.ok(C.risikoleben.calcular(Object.assign({anosACubrir:'10',tasaDescuentoReal:'3'},base)).necesidadesFuturas<240000);
});
test('NEC-002 (doble conteo): hipoteca pendiente se suma ENTERA y además una cuota hipotecaria incluida en el gasto de supervivientes se descuenta años: el motor no puede detectarlo',()=>{
  const base={otrasDeudas:'0',gastoMensualSupervivientes:'3000',ingresoMensualSupervivientes:'0',anosACubrir:'10'};
  const sinCuota=C.risikoleben.calcular(Object.assign({hipoteca:'150000'},base)).capitalNecesario;
  // mismo hogar, pero el asesor incluyó 800 €/mes de cuota en el gasto: 96.000 € extra que el motor no distingue
  const conCuota=C.risikoleben.calcular(Object.assign({hipoteca:'150000'},base,{gastoMensualSupervivientes:'3800'})).capitalNecesario;
  assert.equal(conCuota-sinCuota,800*120);
});
test('NEC-002: recursos superiores -> estado superior y capital 0',()=>{
  const r=C.risikoleben.calcular({hipoteca:'0',otrasDeudas:'0',gastoMensualSupervivientes:'1000',ingresoMensualSupervivientes:'0',anosACubrir:'1',segurosExistentes:'100000'});
  assert.equal(r.capitalNecesario,0);
});

// ---- AOR-NEC-003 Pflege ----
test('NEC-003: brecha = coste − prestación pública − ingresos − contratada; sin coste inferior a prestación',()=>{
  const r=C.pflege.calcular({costeCuidados:'3000',prestacionPublica:'1000',ingresosDisponibles:'800',prestacionContratada:'500',mesesDeCuidado:'36'});
  assert.equal(r.brechaSinSeguro,1200); assert.equal(r.brechaConSeguro,700); assert.equal(r.reservaConSeguro,700*36);
  const c=C.pflege.calcular({costeCuidados:'900',prestacionPublica:'1000',ingresosDisponibles:'0'}); assert.equal(c.brechaSinSeguro,0);
});

// ---- AOR-NEC-001 BU ----
test('NEC-001: BU — estados insuficiente / suficiente / superior; obligaciones duplicadas no se detectan',()=>{
  const b={gastosFamiliares:'2500',obligaciones:'500',ahorroNecesario:'0',ingresosDisponibles:'0'};
  assert.equal(C.bu.calcular(Object.assign({rentaAsegurada:'1000'},b)).estado,'insuficiente');
  assert.equal(C.bu.calcular(Object.assign({rentaAsegurada:'3000'},b)).estado,'suficiente');
  assert.equal(C.bu.calcular(Object.assign({rentaAsegurada:'4000'},b)).estado,'superior');
  // Si el asesor ya metió la cuota de 500 € en «gastos familiares» y la repite en «obligaciones», el motor suma 3.500 € sin avisar:
  assert.equal(C.bu.calcular(Object.assign({},b,{gastosFamiliares:'3000'})).necesidad,3500);
});
