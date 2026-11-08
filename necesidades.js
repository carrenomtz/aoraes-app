/* Calculadoras de necesidad de protección (BU, Risikoleben, Pflege, Sterbegeld) — motor puro, sin DOM y SIN TARIFAS.
   Estiman cuánto dinero haría falta y lo comparan con lo que ya hay o se propone. No dicen qué producto contratar, no deciden la aceptación de un
   riesgo y no sustituyen la definición contractual del siniestro (la que manda). Los importes los escribe el asesor con el cliente: aquí no hay ninguna
   cifra legal ni de proveedor (por ejemplo, la prestación pública por Pflegegrad se introduce a mano, de la tabla oficial vigente).

   Un campo vacío («no se sabe») NO es lo mismo que cero: un campo obligatorio sin dato deja el resultado como PROVISIONAL y lo dice (faltan[]);
   un 0 escrito es un dato. Los campos opcionales cuentan como 0 si no se escriben y no marcan el resultado como provisional.

   Fórmulas (las del manual del Centro Profesional):
     BU          necesidad mensual = gastos familiares + obligaciones + ahorro necesario − ingresos disponibles durante el siniestro
     Risikoleben capital necesario = obligaciones pendientes + necesidades futuras de supervivientes − recursos disponibles
     Pflege      brecha mensual = coste de los cuidados − prestación pública − ingresos disponibles − prestación contratada
     Sterbegeld  capital necesario = costes de fallecimiento − reserva dedicada */

var NEC_ESTADOS={sin_necesidad:'Sin necesidad económica',insuficiente:'Cobertura insuficiente',suficiente:'Cobertura suficiente',superior:'Cobertura superior a la necesidad'};

function _necNum(x){ if(x===null||x===undefined||x==='') return null; var n=(typeof x==='number')?x:parseFloat(String(x).replace(',','.')); return (isFinite(n)&&n>=0)?n:null; }
// Lee los campos de una calculadora: valores (opcionales sin dato = 0), faltan (obligatorios sin dato o inválidos) y completo.
function necLeer(campos,v){
  v=v||{}; var valores={}, faltan=[];
  campos.forEach(function(c){
    var n=_necNum(v[c.k]);
    if(n===null){ if(c.opcional){ valores[c.k]=0; } else { valores[c.k]=0; faltan.push(c.k); } } else valores[c.k]=n;
  });
  return {valores:valores,faltan:faltan,completo:faltan.length===0};
}
// Valor actual de una renta mensual constante `m` durante `anos` años con una tasa real anual `tasaPct` (0 = suma simple, sin descontar).
function necValorActualRenta(m,anos,tasaPct){
  var n=Math.round(anos*12); if(!(m>0)||!(n>0)) return 0;
  var i=(tasaPct||0)/100, j=Math.pow(1+i,1/12)-1;
  return Math.abs(j)<1e-12 ? m*n : m*(1-Math.pow(1+j,-n))/j;
}
// Aportación mensual (a fin de mes) para acumular `objetivo` en `anos` años con una tasa nominal anual / 12 (misma convención que las demás herramientas).
function necAhorroMensualParaObjetivo(objetivo,anos,tasaNominalPct){
  var n=Math.round(anos*12); if(!(objetivo>0)||!(n>0)) return 0;
  var r=(tasaNominalPct||0)/100/12; return Math.abs(r)<1e-12 ? objetivo/n : objetivo*r/(Math.pow(1+r,n)-1);
}
function _estado(necesidad,cubierto){
  if(!(necesidad>0)) return 'sin_necesidad';
  if(cubierto+1e-9<necesidad) return 'insuficiente';
  return cubierto>necesidad*1.25+1e-9 ? 'superior' : 'suficiente';
}

var NEC_CALCULADORAS={
  bu:{
    titulo:'Berufsunfähigkeit (BU)', unidad:'€ al mes',
    formula:'Necesidad mensual = gastos familiares + obligaciones + ahorro necesario − ingresos disponibles durante el siniestro',
    aviso:'La renta asegurada solo se cobra si se cumple la definición contractual de incapacidad profesional, y la aceptación depende de la evaluación de salud. Este cálculo no decide ninguna de las dos cosas.',
    campos:[
      {k:'gastosFamiliares',l:'Gastos familiares',ayuda:'Gasto mensual del hogar que seguiría existiendo'},
      {k:'obligaciones',l:'Obligaciones',ayuda:'Cuotas de hipoteca, préstamos y otras deudas'},
      {k:'ahorroNecesario',l:'Ahorro necesario',ayuda:'Lo que habría que seguir ahorrando (jubilación, etc.)',opcional:true},
      {k:'ingresosDisponibles',l:'Ingresos disponibles durante el siniestro',ayuda:'Pareja, pensión por incapacidad pública, otros; 0 si no hay'},
      {k:'rentaAsegurada',l:'Renta asegurada (existente o propuesta)',ayuda:'Renta mensual de BU ya contratada o que se estudia',opcional:true}
    ],
    calcular:function(v){
      var r=necLeer(NEC_CALCULADORAS.bu.campos,v), x=r.valores;
      var bruta=x.gastosFamiliares+x.obligaciones+x.ahorroNecesario-x.ingresosDisponibles, necesidad=Math.max(0,bruta);
      var brecha=Math.max(0,necesidad-x.rentaAsegurada), exceso=Math.max(0,x.rentaAsegurada-necesidad);
      return {necesidadBruta:bruta,necesidad:necesidad,rentaAsegurada:x.rentaAsegurada,brecha:brecha,exceso:exceso,
        cobertura:necesidad>0?x.rentaAsegurada/necesidad:null,estado:_estado(necesidad,x.rentaAsegurada),faltan:r.faltan,completo:r.completo};
    }
  },
  risikoleben:{
    titulo:'Risikolebensversicherung', unidad:'€',
    formula:'Capital necesario = obligaciones pendientes + necesidades futuras de supervivientes − recursos disponibles',
    aviso:'Orientativo: depende de quién sobrevive, de cuántos años hay que cubrir y de lo que el hogar ya tiene. No decide la aceptación del riesgo ni la suma asegurada final.',
    campos:[
      {k:'hipoteca',l:'Hipoteca pendiente',ayuda:'Capital que queda por pagar; 0 si no hay'},
      {k:'otrasDeudas',l:'Otras deudas',ayuda:'Préstamos, tarjetas; 0 si no hay'},
      {k:'gastoMensualSupervivientes',l:'Gasto mensual de los supervivientes',ayuda:'Lo que el hogar necesitaría cada mes'},
      {k:'ingresoMensualSupervivientes',l:'Ingreso mensual de los supervivientes',ayuda:'Sueldo de la pareja, pensión de viudedad…; 0 si no hay'},
      {k:'anosACubrir',l:'Años que hay que cubrir',ayuda:'Por ejemplo hasta la independencia de los hijos'},
      {k:'tasaDescuentoReal',l:'Tasa real de descuento (% anual)',ayuda:'0 = suma simple, sin descontar (lo prudente)',opcional:true},
      {k:'gastosUnicos',l:'Gastos únicos futuros',ayuda:'Estudios de los hijos, etc.',opcional:true},
      {k:'ahorrosLiquidos',l:'Ahorros líquidos',ayuda:'Dinero disponible hoy',opcional:true},
      {k:'segurosExistentes',l:'Seguros de vida existentes (suma asegurada)',ayuda:'Risikoleben, Kapitallebensversicherung con cobertura…',opcional:true},
      {k:'otrosRecursos',l:'Otros recursos',ayuda:'Inversiones, inmuebles que se podrían vender…',opcional:true}
    ],
    calcular:function(v){
      var r=necLeer(NEC_CALCULADORAS.risikoleben.campos,v), x=r.valores;
      var neto=Math.max(0,x.gastoMensualSupervivientes-x.ingresoMensualSupervivientes);
      var futuras=necValorActualRenta(neto,x.anosACubrir,x.tasaDescuentoReal)+x.gastosUnicos;
      var obligaciones=x.hipoteca+x.otrasDeudas, recursos=x.ahorrosLiquidos+x.segurosExistentes+x.otrosRecursos;
      var bruto=obligaciones+futuras-recursos, necesario=Math.max(0,bruto);
      return {obligaciones:obligaciones,necesidadesFuturas:futuras,recursos:recursos,capitalBruto:bruto,capitalNecesario:necesario,
        cubiertoPorSeguros:x.segurosExistentes,estado:_estado(obligaciones+futuras,recursos),faltan:r.faltan,completo:r.completo};
    }
  },
  pflege:{
    titulo:'Pflegeabsicherung', unidad:'€ al mes',
    formula:'Brecha mensual = coste de los cuidados − prestación pública − ingresos disponibles − prestación contratada',
    aviso:'La prestación pública depende del Pflegegrad reconocido: escríbela de la tabla oficial vigente, aquí no hay cifras legales. Distingue el seguro obligatorio, el complementario y los módulos de otros contratos. La prestación real depende de las condiciones del contrato.',
    campos:[
      {k:'costeCuidados',l:'Coste mensual de los cuidados',ayuda:'Residencia (parte a cargo del residente) o cuidados en casa'},
      {k:'prestacionPublica',l:'Prestación pública mensual',ayuda:'Pflegegeld o prestaciones en especie del Pflegegrad (tabla oficial)'},
      {k:'ingresosDisponibles',l:'Ingresos mensuales disponibles',ayuda:'Pensión neta, alquileres…; 0 si no hay'},
      {k:'prestacionContratada',l:'Prestación contratada o propuesta (al mes)',ayuda:'Pflegetagegeld, renta de cuidados…',opcional:true},
      {k:'mesesDeCuidado',l:'Duración prevista (meses)',ayuda:'Para calcular la reserva total; 0 = no calcular',opcional:true}
    ],
    calcular:function(v){
      var r=necLeer(NEC_CALCULADORAS.pflege.campos,v), x=r.valores;
      var sin=Math.max(0,x.costeCuidados-x.prestacionPublica-x.ingresosDisponibles), con=Math.max(0,sin-x.prestacionContratada);
      return {brechaSinSeguro:sin,brechaConSeguro:con,exceso:Math.max(0,x.prestacionContratada-sin),
        reservaSinSeguro:sin*x.mesesDeCuidado,reservaConSeguro:con*x.mesesDeCuidado,estado:_estado(sin,x.prestacionContratada),faltan:r.faltan,completo:r.completo};
    }
  },
  sterbegeld:{
    titulo:'Sterbegeldversicherung', unidad:'€',
    formula:'Capital necesario = costes de fallecimiento − reserva dedicada',
    aviso:'Compara una cobertura aseguradora con acumular una reserva propia: no son lo mismo (la cobertura existe desde el primer día; la reserva se construye con el tiempo y es disponible para cualquier uso). No se declara ninguna mejor.',
    campos:[
      {k:'costesFallecimiento',l:'Costes de fallecimiento estimados',ayuda:'Entierro o incineración, lápida, trámites, flores…'},
      {k:'otrosGastos',l:'Otros gastos',ayuda:'Deudas menores, última voluntad…',opcional:true},
      {k:'reservaDedicada',l:'Reserva ya dedicada',ayuda:'Ahorro apartado para este fin; 0 si no hay'},
      {k:'primaMensual',l:'Prima mensual del seguro (si se estudia)',ayuda:'Para comparar con ahorrar',opcional:true},
      {k:'anosPrima',l:'Años de prima / de ahorro',ayuda:'Plazo para comparar',opcional:true},
      {k:'tasaAhorro',l:'Rentabilidad nominal anual del ahorro (%)',ayuda:'0 si se guarda sin invertir',opcional:true}
    ],
    calcular:function(v){
      var r=necLeer(NEC_CALCULADORAS.sterbegeld.campos,v), x=r.valores;
      var total=x.costesFallecimiento+x.otrosGastos, bruto=total-x.reservaDedicada, necesario=Math.max(0,bruto);
      var ahorro=necAhorroMensualParaObjetivo(necesario,x.anosPrima,x.tasaAhorro), primaTotal=x.primaMensual*12*x.anosPrima;
      return {costesTotales:total,capitalBruto:bruto,capitalNecesario:necesario,reservaDedicada:x.reservaDedicada,
        ahorroMensualEquivalente:ahorro,primaTotal:primaTotal,ahorroTotal:ahorro*12*x.anosPrima,
        estado:_estado(total,x.reservaDedicada),faltan:r.faltan,completo:r.completo};
    }
  }
};

if(typeof module!=='undefined'&&module.exports){ module.exports={NEC_CALCULADORAS,NEC_ESTADOS,necLeer,necValorActualRenta,necAhorroMensualParaObjetivo}; }
