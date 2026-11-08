// Pruebas de las calculadoras de necesidad (BU, Risikoleben, Pflege, Sterbegeld). `node tests/necesidades.test.js`.
// Referencias independientes: las fórmulas del manual hechas a mano y anualidades en forma cerrada. Todas las cifras son inventadas.
const assert = require('assert'), fs = require('fs'), path = require('path');
const N = require('../necesidades.js'), C = N.NEC_CALCULADORAS;
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message); } }
const near = (a, b, t, m) => assert(Math.abs(a - b) <= t, (m || '') + ' esperado ' + b + ' obtenido ' + a);

console.log('\nLectura de datos (vacío ≠ cero)');
test('un campo obligatorio vacío, nulo o inválido deja el resultado provisional y lo nombra; un 0 escrito es un dato; los opcionales cuentan como 0 sin avisar', () => {
  const l = (v) => N.necLeer(C.bu.campos, v);
  const a = l({ gastosFamiliares: 2000, obligaciones: 0, ingresosDisponibles: 0 }); assert.strictEqual(a.completo, true); assert.deepStrictEqual(a.faltan, []); assert.strictEqual(a.valores.ahorroNecesario, 0);
  const b = l({ gastosFamiliares: 2000, obligaciones: '', ingresosDisponibles: null }); assert.strictEqual(b.completo, false); assert.deepStrictEqual(b.faltan, ['obligaciones', 'ingresosDisponibles']);
  assert.deepStrictEqual(l({ gastosFamiliares: -5, obligaciones: 'abc', ingresosDisponibles: NaN }).faltan, ['gastosFamiliares', 'obligaciones', 'ingresosDisponibles']);
  assert.strictEqual(l({ gastosFamiliares: '1.500,5'.replace('.', ''), obligaciones: '300,50', ingresosDisponibles: 0 }).valores.obligaciones, 300.5, 'coma decimal');
  assert.strictEqual(l({}).completo, false); assert.strictEqual(l(null).completo, false);
});

console.log('\nBU');
test('necesidad = gastos + obligaciones + ahorro − ingresos; brecha frente a la renta asegurada (a mano: 2.400 + 700 + 300 − 1.100 = 2.300; con 1.500 asegurados faltan 800)', () => {
  const r = C.bu.calcular({ gastosFamiliares: 2400, obligaciones: 700, ahorroNecesario: 300, ingresosDisponibles: 1100, rentaAsegurada: 1500 });
  assert.strictEqual(r.necesidad, 2300); assert.strictEqual(r.brecha, 800); assert.strictEqual(r.exceso, 0); near(r.cobertura, 1500 / 2300, 1e-12); assert.strictEqual(r.estado, 'insuficiente'); assert.strictEqual(r.completo, true);
});
test('estados: sin necesidad si los ingresos cubren todo, insuficiente por debajo, suficiente al llegar y superior si pasa de un 25 % extra; el exceso se calcula aparte', () => {
  const b = { gastosFamiliares: 2000, obligaciones: 0, ingresosDisponibles: 0 };
  assert.strictEqual(C.bu.calcular({ gastosFamiliares: 1000, obligaciones: 0, ingresosDisponibles: 1500 }).estado, 'sin_necesidad');
  assert.strictEqual(C.bu.calcular(Object.assign({ rentaAsegurada: 1999 }, b)).estado, 'insuficiente'); assert.strictEqual(C.bu.calcular(Object.assign({ rentaAsegurada: 2000 }, b)).estado, 'suficiente');
  assert.strictEqual(C.bu.calcular(Object.assign({ rentaAsegurada: 2500 }, b)).estado, 'suficiente'); const sup = C.bu.calcular(Object.assign({ rentaAsegurada: 2600 }, b)); assert.strictEqual(sup.estado, 'superior'); assert.strictEqual(sup.exceso, 600);
});
test('ingresos mayores que los gastos: necesidad 0 (no negativa) pero la bruta conserva el signo; cobertura nula cuando no hay necesidad', () => {
  const r = C.bu.calcular({ gastosFamiliares: 1000, obligaciones: 200, ingresosDisponibles: 2000 }); assert.strictEqual(r.necesidad, 0); assert.strictEqual(r.necesidadBruta, -800); assert.strictEqual(r.cobertura, null); assert.strictEqual(r.brecha, 0);
});

console.log('\nRisikoleben');
test('sin descuento: capital = hipoteca + deudas + (gasto − ingreso) × 12 × años + gastos únicos − recursos (a mano: 250.000 + 10.000 + 1.500×12×15 + 20.000 − 60.000 = 490.000)', () => {
  const r = C.risikoleben.calcular({ hipoteca: 250000, otrasDeudas: 10000, gastoMensualSupervivientes: 3000, ingresoMensualSupervivientes: 1500, anosACubrir: 15, gastosUnicos: 20000, ahorrosLiquidos: 20000, segurosExistentes: 30000, otrosRecursos: 10000 });
  assert.strictEqual(r.necesidadesFuturas, 1500 * 12 * 15 + 20000); assert.strictEqual(r.capitalNecesario, 490000); assert.strictEqual(r.obligaciones, 260000); assert.strictEqual(r.recursos, 60000); assert.strictEqual(r.estado, 'insuficiente'); assert.strictEqual(r.completo, true);
});
test('con tasa real de descuento: valor actual de la renta mensual = m × (1 − (1+j)^−n)/j con j = (1+i)^(1/12) − 1; descontar siempre da menos que la suma simple', () => {
  const m = 1500, anos = 15, i = 0.02, j = Math.pow(1 + i, 1 / 12) - 1, n = anos * 12;
  near(N.necValorActualRenta(m, anos, 2), m * (1 - Math.pow(1 + j, -n)) / j, 1e-6); near(N.necValorActualRenta(m, anos, 0), m * n, 1e-9); assert(N.necValorActualRenta(m, anos, 2) < m * n);
  assert(N.necValorActualRenta(m, anos, 5) < N.necValorActualRenta(m, anos, 2)); assert.strictEqual(N.necValorActualRenta(0, 10, 2), 0); assert.strictEqual(N.necValorActualRenta(100, 0, 2), 0);
});
test('si el ingreso de los supervivientes supera su gasto no hay necesidad futura; los recursos grandes dejan el capital en 0 sin negativos y lo marcan como cubierto', () => {
  const r = C.risikoleben.calcular({ hipoteca: 100000, otrasDeudas: 0, gastoMensualSupervivientes: 2000, ingresoMensualSupervivientes: 2500, anosACubrir: 10, ahorrosLiquidos: 500000 });
  assert.strictEqual(r.necesidadesFuturas, 0); assert.strictEqual(r.capitalNecesario, 0); assert(r.capitalBruto < 0); assert.notStrictEqual(r.estado, 'insuficiente');
});
test('datos obligatorios sin escribir (p. ej. años a cubrir) dejan el resultado provisional', () => {
  const r = C.risikoleben.calcular({ hipoteca: 100000, otrasDeudas: 0, gastoMensualSupervivientes: 2000, ingresoMensualSupervivientes: 0 }); assert.strictEqual(r.completo, false); assert.deepStrictEqual(r.faltan, ['anosACubrir']);
});

console.log('\nPflege');
test('brecha = coste − prestación pública − ingresos; con la prestación contratada baja; la reserva = brecha × meses (a mano: 4.500 − 1.200 − 1.600 = 1.700; con 1.000 contratados quedan 700)', () => {
  const r = C.pflege.calcular({ costeCuidados: 4500, prestacionPublica: 1200, ingresosDisponibles: 1600, prestacionContratada: 1000, mesesDeCuidado: 36 });
  assert.strictEqual(r.brechaSinSeguro, 1700); assert.strictEqual(r.brechaConSeguro, 700); assert.strictEqual(r.reservaSinSeguro, 1700 * 36); assert.strictEqual(r.reservaConSeguro, 700 * 36); assert.strictEqual(r.exceso, 0); assert.strictEqual(r.estado, 'insuficiente');
});
test('si lo público y los ingresos ya cubren el coste no hay brecha; una prestación contratada de más aparece como exceso, nunca como brecha negativa; sin meses no hay reserva', () => {
  const a = C.pflege.calcular({ costeCuidados: 2000, prestacionPublica: 1500, ingresosDisponibles: 1000 }); assert.strictEqual(a.brechaSinSeguro, 0); assert.strictEqual(a.estado, 'sin_necesidad'); assert.strictEqual(a.reservaSinSeguro, 0);
  const b = C.pflege.calcular({ costeCuidados: 3000, prestacionPublica: 1000, ingresosDisponibles: 500, prestacionContratada: 2000 }); assert.strictEqual(b.brechaConSeguro, 0); assert.strictEqual(b.exceso, 500);
});
test('la prestación pública no tiene valor por defecto: sin escribirla el resultado es provisional (no se inventa ninguna cifra legal)', () => {
  const r = C.pflege.calcular({ costeCuidados: 3000, ingresosDisponibles: 800 }); assert.strictEqual(r.completo, false); assert.deepStrictEqual(r.faltan, ['prestacionPublica']);
});

console.log('\nSterbegeld');
test('capital = costes + otros − reserva (a mano: 9.000 + 1.000 − 2.500 = 7.500); ahorrar 7.500 en 10 años al 0 % son 62,50 €/mes; con rentabilidad es menos y coincide con la anualidad en forma cerrada', () => {
  const r = C.sterbegeld.calcular({ costesFallecimiento: 9000, otrosGastos: 1000, reservaDedicada: 2500, primaMensual: 40, anosPrima: 10, tasaAhorro: 0 });
  assert.strictEqual(r.capitalNecesario, 7500); near(r.ahorroMensualEquivalente, 62.5, 1e-9); assert.strictEqual(r.primaTotal, 4800);
  const i = 0.03 / 12, n = 120; near(N.necAhorroMensualParaObjetivo(7500, 10, 3), 7500 * i / (Math.pow(1 + i, n) - 1), 1e-9); assert(N.necAhorroMensualParaObjetivo(7500, 10, 3) < 62.5);
  near(N.necAhorroMensualParaObjetivo(7500, 10, 3) * (Math.pow(1 + i, n) - 1) / i, 7500, 1e-6, 'acumulando esa cuota se alcanza el objetivo');
});
test('con la reserva ya suficiente la necesidad es 0 y no se pide ahorro; sin plazo no se calcula ahorro ni se divide por cero', () => {
  const r = C.sterbegeld.calcular({ costesFallecimiento: 8000, reservaDedicada: 9000, anosPrima: 10 }); assert.strictEqual(r.capitalNecesario, 0); assert.strictEqual(r.ahorroMensualEquivalente, 0);
  const s = C.sterbegeld.calcular({ costesFallecimiento: 8000, reservaDedicada: 0 }); assert.strictEqual(s.ahorroMensualEquivalente, 0); assert(isFinite(s.primaTotal));
  assert.strictEqual(N.necAhorroMensualParaObjetivo(5000, 0, 3), 0);
});

console.log('\nCoherencia general');
test('ningún resultado numérico es NaN o infinito con entradas vacías, extremas o hostiles', () => {
  const hostiles = [{}, null, { a: 1 }, { gastosFamiliares: 1e12, obligaciones: 1e12, ingresosDisponibles: 0 }, { hipoteca: 'x', anosACubrir: -3, tasaDescuentoReal: 1000 }, { costeCuidados: Infinity, prestacionPublica: NaN }, { anosPrima: 1e6, costesFallecimiento: 1e9 }];
  Object.keys(C).forEach((k) => hostiles.forEach((h) => { const r = C[k].calcular(h); Object.values(r).forEach((x) => { if (typeof x === 'number') assert(isFinite(x), k + ' devuelve ' + x + ' con ' + JSON.stringify(h)); }); }));
});
test('cada calculadora declara su fórmula, su aviso y campos con etiqueta; los resultados son reproducibles y no modifican la entrada', () => {
  Object.keys(C).forEach((k) => { const c = C[k]; assert(c.titulo && c.formula && c.aviso && c.unidad && c.campos.length >= 4, k); c.campos.forEach((f) => assert(f.k && f.l && f.ayuda, k + ' campo sin etiqueta')); });
  const v = { gastosFamiliares: 2000, obligaciones: 500, ingresosDisponibles: 300, rentaAsegurada: 1000 }, copia = JSON.stringify(v); assert.deepStrictEqual(C.bu.calcular(v), C.bu.calcular(v)); assert.strictEqual(JSON.stringify(v), copia);
});
test('el módulo no incluye tarifas ni cifras legales: ningún porcentaje con decimales ni importe de prestación escrito en el código, y avisa de que no decide aceptación ni producto', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'necesidades.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert(!/\d+[.,]\d+\s*%/.test(src)); assert(!/pflegegrad\s*[1-5]\s*[:=]/i.test(src));
  assert(/no decide la aceptación/i.test(C.risikoleben.aviso) && /no decide ninguna de las dos/.test(C.bu.aviso));
});
console.log('\n' + passed + ' correctas, ' + failed + ' fallidas'); process.exit(failed ? 1 : 0);
