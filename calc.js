/* Motor de cálculo del Proyecto inmobiliario (Comprar y Refinanciar).
   Solo funciones puras: sin DOM, sin estado de la app, sin localStorage. Se carga como script clásico (las funciones quedan como
   globales para index.html) y también con require('./calc.js') en las pruebas (tests/calc.test.js). Todo lo que pinta pantalla
   (HTML, gráficos, eventos) sigue en index.html. */

function fmtISODate(s){ var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s); return m?(m[3]+'/'+m[2]+'/'+m[1]):s; }

/* ---------- Proyecto inmobiliario: Bausparvertrag vs. banco directo ----------
   Cálculo orientativo con amortización estándar (anualidad francesa). La asignación real
   del préstamo en un Bausparvertrag depende del algoritmo colectivo interno de la
   Bausparkasse (Zuteilung) — con su Regelsparbeitrag fijo en ‰ de la Bausparsumme y su
   Tilgungsbeitrag decreciente en vez de una cuota constante — así que esto no replica ese
   mecanismo interno; es un modelo genérico de amortización para comparar escenarios. */
function annuityQuota(principal,annualRatePct,months){
  var r=(annualRatePct||0)/100/12;
  if(months<=0) return 0;
  if(Math.abs(r)<1e-9) return principal/months;
  return principal*r/(1-Math.pow(1+r,-months));
}

// Un Bausparvertrag no se puede activar (Zuteilung) antes de un tiempo mínimo de ahorro: 3,6 años. Ningún cálculo de Comprar baja de ahí
// (ni por los años escritos ni por un pago de ahorro alto); en Refinanciar no se recalcula, se avisa (cfg.sinMinimoAhorro).
var BAUSPAR_MIN_ANIOS=3.6, BAUSPAR_MIN_MESES=Math.round(BAUSPAR_MIN_ANIOS*12);

// Interés efectivo anual del préstamo (Effektiver Jahreszins, el que exige declarar la
// PAngV alemana junto al nominal): la tasa que iguala lo que el cliente REALMENTE recibe
// (el capital menos la comisión de apertura, que se descuenta como un Disagio/
// Bearbeitungsgebühr) con el valor presente de las cuotas que paga — el mismo método
// actuarial (IRR) que exige la normativa, no una aproximación distinta.
// annuityQuota ya trata el nominal como Nominalzins alemán (tipo anual / 12 = tipo mensual,
// sin componer); al recomponer ese mismo tipo mensual en un efectivo anual compuesto, incluso
// SIN comisión el efectivo sale un pelín por encima del nominal (p. ej. 3,50% → 3,56%) — no es
// un error de este cálculo, es la misma diferencia estructural nominal/efectivo que aparece en
// cualquier oferta bancaria real. Con comisión, la diferencia crece más.
// lastPayment (opcional): la última cuota real, menor que la fija; sin ella, con cuota constante, el efectivo
// salía hasta ~0,02 pt por encima (4,09 % en vez de 4,07 % a 4 % nominal).
function effectiveAnnualRate(netDisbursed,payment,months,lastPayment){
  if(!(netDisbursed>0) || !(payment>0) || months<=0) return null;
  function npv(monthlyRate){
    var pv=netDisbursed;
    for(var t=1;t<=months;t++) pv-=((t===months&&lastPayment>0)?lastPayment:payment)/Math.pow(1+monthlyRate,t);
    return pv;
  }
  var lo=-0.9/12, hi=2/12, flo=npv(lo), fhi=npv(hi);
  if(flo*fhi>0) return null; // caso degenerado: no hay raíz en el rango de seguridad
  var mid=0;
  for(var i=0;i<80;i++){
    mid=(lo+hi)/2;
    var fm=npv(mid);
    if(Math.abs(fm)<1e-6) break;
    if((flo<0)===(fm<0)){ lo=mid; flo=fm; } else { hi=mid; }
  }
  return Math.pow(1+mid,12)-1; // anualización compuesta, la misma convención que la Anlage zu §6 PAngV
}

function savingsQuota(target,annualRatePct,months){
  var r=(annualRatePct||0)/100/12;
  if(months<=0) return 0;
  if(Math.abs(r)<1e-9) return target/months;
  return target*r/(Math.pow(1+r,months)-1);
}

// Sonderzahlung anual en la fase de ahorro del Bausparvertrag: un pago extra al final de cada año
// de ahorro (mes 12, 24, ...), además de la cuota mensual. Mismo convenio que la cuota: el pago se
// hace a fin de mes y genera interés desde el mes siguiente.
function sonderAhorroFV(sonder,annualRatePct,months){
  var r=(annualRatePct||0)/100/12, fv=0;
  if(!(sonder>0)) return 0;
  for(var k=12;k<=months;k+=12) fv+=sonder*Math.pow(1+r,months-k);
  return fv;
}
// Saldo ahorrado tras t meses con cuota mensual y Sonderzahlung anual (sin tope ni comisión).
function ahorroSaldoEn(cuota,sonder,annualRatePct,t){
  var r=(annualRatePct||0)/100/12, base=(Math.abs(r)<1e-9)?cuota*t:cuota*((Math.pow(1+r,t)-1)/r);
  return base+sonderAhorroFV(sonder,annualRatePct,t);
}
// Cuota mensual para juntar `target` en `months` meses con una Sonderzahlung anual. Si la Sonderzahlung
// por sí sola ya cubriría el 90 % del objetivo, se recorta proporcionalmente (la cuota nunca llega a 0)
// y se devuelve la Sonderzahlung realmente aplicada.
function ahorroCuotaConSonder(target,sonder,annualRatePct,months){
  var S=Math.max(0,sonder||0), fv=sonderAhorroFV(S,annualRatePct,months), tope=target*0.9;
  if(fv>tope && fv>0){ S=S*tope/fv; fv=tope; }
  return {cuota:savingsQuota(Math.max(0,target-fv),annualRatePct,months),sonder:S,aportado:S*Math.floor(months/12)};
}

// Meses hasta amortizar del todo un préstamo con cuota FIJA conocida (en vez de fijar el
// plazo y derivar la cuota, como hace annuityQuota): la fórmula inversa de una anualidad,
// N = -ln(1 - P·r/M) / ln(1+r). Necesaria porque, tanto en un préstamo bancario alemán
// (cuota = capital·(Sollzins+Tilgung inicial)/12) como en la fase de préstamo de un
// Bausparvertrag (cuota = Tilgungsbeitrag fijo en ‰ de la Bausparsumme), la cuota mensual es
// el dato que se fija de entrada — el plazo es la consecuencia, nunca al revés.
function monthsToPayoff(principal,annualRatePct,payment){
  if(!(principal>0)||!(payment>0)) return 0;
  var r=(annualRatePct||0)/100/12;
  if(Math.abs(r)<1e-9) return Math.ceil(principal/payment);
  // 1200 meses (100 años) de margen de seguridad — muy por encima de cualquier caso real (el
  // peor caso alemán habitual, Tilgung inicial muy baja con tipo alto, tarda 50-60 años), para
  // no truncar plazos genuinos. Si la cuota no cubre ni el interés, jamás se amortiza.
  if(payment<=principal*r) return 1200;
  // - 1e-7: con una anualidad exacta (p. ej. 120 meses) el logaritmo puede salir 120,0000000001 por
  // ruido de coma flotante y el ceil lo subía a 121 — un préstamo "a 10 años" salía a 10,1.
  return Math.min(1200,Math.ceil(-Math.log(1-(principal*r)/payment)/Math.log(1+r)-1e-7));
}

// Préstamo mensual con cuota fija y un pago extra a capital cada 12 meses (contando desde 'offset').
// Devuelve meses hasta liquidar (tope maxM), intereses y el saldo al final de cada mes.
function simLoan(P,ratePct,cuota,st,offset,maxM){
  var r=(ratePct||0)/100/12, bal=P, interes=0, saldos=[], m=0;
  while(bal>0.005 && m<maxM){
    m++;
    var int_=bal*r, pago=Math.min(cuota,bal+int_);
    interes+=int_; bal=bal+int_-pago;
    if(bal>0 && st>0 && ((offset||0)+m)%12===0) bal=Math.max(0,bal-st);
    if(pago<=int_+1e-9 && bal>0 && (st<=0)) { saldos.push(bal); break; }
    saldos.push(bal);
  }
  return {meses:m,interes:interes,saldos:saldos,bal:bal};
}

// Zinsaufschlag (recargo de interés) que muchos bancos cobran por permitir la Sondertilgung: puntos porcentuales sobre el interés del
// préstamo, solo si hay Sondertilgung. Campo opcional recargoST (por defecto 0 = el comportamiento de siempre).
function inmuebleRecargoST(cfg){ return (cfg&&(cfg.sondertilgung||0)>0)?Math.max(0,Math.min(5,cfg.recargoST||0)):0; }

function calcInmuebleOption(precio,cfg){
  precio=precio||0;
  var pct=Math.max(0,Math.min(100,cfg.pct||0));
  var objetivoAhorro=precio*pct/100;
  var capitalPrestamo=precio-objetivoAhorro;
  var mesesAhorro=Math.max(0,Math.round((cfg.anios||0)*12));
  var esBausparvertrag=(cfg.tilgungsbeitragPerMille!=null);
  // Banco con Sondertilgung: el interés aplicado a todo el préstamo (cuota, plazo, intereses, Restschuld) incluye el recargo.
  var cfgOrig=cfg, recargoST=(!esBausparvertrag&&capitalPrestamo>0)?inmuebleRecargoST(cfg):0;
  if(recargoST>0) cfg=Object.assign({},cfg,{interesPrestamo:(cfg.interesPrestamo||0)+recargoST});
  var minAhorroAplicado=false;
  if(esBausparvertrag && pct>0 && !cfg.sinMinimoAhorro && mesesAhorro<BAUSPAR_MIN_MESES){ mesesAhorro=BAUSPAR_MIN_MESES; minAhorroAplicado=true; }
  // La Abschlussgebühr de un Bausparvertrag se cobra sobre la Bausparsumme (aquí, precio) y se
  // descuenta de golpe contra los primeros ahorros, no al final contra el préstamo — así lo
  // hacen las Bausparkassen reales (confirmado contra un extracto de amortización real: el
  // Saldo del primer año ya sale negativo por la comisión). La cuota de ahorro necesaria sube
  // en consecuencia: tiene que cubrir el objetivo de ahorro Y la comisión, ya que esta se resta
  // del Guthaben nada más pagarla, antes de que pueda generar interés.
  var comisionAhorro=esBausparvertrag?precio*(cfg.comision||0)/100:0;
  var sonderAhorro=(esBausparvertrag&&pct>0)?Math.max(0,cfg.sonderAhorro||0):0, sonderPedida=sonderAhorro;
  var sc1=(pct>0&&mesesAhorro>0)?ahorroCuotaConSonder(objetivoAhorro+comisionAhorro,sonderAhorro,cfg.interesAhorro,mesesAhorro):{cuota:0,sonder:0,aportado:0};
  var cuotaAhorro=sc1.cuota; sonderAhorro=sc1.sonder;
  var interesGanadoAhorro=(pct>0&&mesesAhorro>0)?Math.max(0,objetivoAhorro+comisionAhorro-cuotaAhorro*mesesAhorro-sc1.aportado):0;
  // Refinanciar: el tiempo de ahorro es fijo (hasta la fecha de refinanciación), así que con un pago
  // fijado lo que cambia es CUÁNTO se ahorra (neto de la comisión, tope = el saldo) y, por tanto, el
  // préstamo que queda.
  if(esBausparvertrag && cfg.pagoAhorro>0 && cfg.ahorroPorTiempo && pct>0 && mesesAhorro>0){
    sonderAhorro=sonderPedida;
    var fvR=ahorroSaldoEn(cfg.pagoAhorro,sonderAhorro,cfg.interesAhorro,mesesAhorro), aportR=cfg.pagoAhorro*mesesAhorro+sonderAhorro*Math.floor(mesesAhorro/12);
    objetivoAhorro=Math.min(precio,Math.max(0,fvR-comisionAhorro)); capitalPrestamo=precio-objetivoAhorro;
    cuotaAhorro=cfg.pagoAhorro; interesGanadoAhorro=Math.max(0,fvR-aportR);
  }
  // Pago mensual de ahorro fijado por el asesor (solo Bausparvertrag): en vez de derivarlo del plazo,
  // se simula cuánto tarda en juntarse objetivo+comisión con ese pago (último pago recortado) —
  // el plazo de ahorro pasa a ser el resultado.
  if(esBausparvertrag && cfg.pagoAhorro>0 && pct>0 && objetivoAhorro>0 && !cfg.ahorroPorTiempo){
    var Ta=objetivoAhorro+comisionAhorro, rA=(cfg.interesAhorro||0)/100/12, balA=0, nA=0, contribA=0;
    sonderAhorro=sonderPedida;
    while(balA<Ta-0.005 && nA<1200){
      nA++; balA=balA*(1+rA); var pA=Math.min(cfg.pagoAhorro,Ta-balA); balA+=pA; contribA+=pA;
      if(sonderAhorro>0 && nA%12===0 && balA<Ta-0.005){ var sA=Math.min(sonderAhorro,Ta-balA); balA+=sA; contribA+=sA; }
    }
    mesesAhorro=nA; cuotaAhorro=cfg.pagoAhorro; interesGanadoAhorro=Math.max(0,Ta-contribA);
    if(!cfg.sinMinimoAhorro && nA<BAUSPAR_MIN_MESES){
      // Con ese pago se llegaría al objetivo antes del mínimo: el ahorro dura el mínimo y la cuota necesaria es la de ese plazo.
      var scM=ahorroCuotaConSonder(Ta,sonderPedida,cfg.interesAhorro,BAUSPAR_MIN_MESES);
      mesesAhorro=BAUSPAR_MIN_MESES; cuotaAhorro=scM.cuota; sonderAhorro=scM.sonder; interesGanadoAhorro=Math.max(0,Ta-cuotaAhorro*BAUSPAR_MIN_MESES-scM.aportado); minAhorroAplicado=true;
    }
  }
  // Bausparvertrag (a/b/refiA/refiB): el Tilgungsbeitrag es un ‰ fijo de la Bausparsumme
  // (aquí, precio), independiente del tipo pactado — así lo hacen las Bausparkassen reales
  // (p. ej. Badenia: 6‰ típico). Banco directo: la cuota alemana estándar es
  // capital·(Sollzins + Tilgung inicial)/12 — no se fija un plazo, se fija la Tilgung.
  // Si el 100% se cubre con ahorro (capitalPrestamo=0) no hay fase de préstamo — sin esta
  // guarda, el Tilgungsbeitrag del Bausparvertrag (que se calcula sobre precio, no sobre el
  // capital prestado) seguía generando una cuota "de préstamo" fantasma de un mes sobre una
  // deuda de 0 €, contada íntegra como interés.
  var cuotaPrestamo=(capitalPrestamo<=0)?0:(esBausparvertrag
    ? ((cfg.pagoPrestamo>0)?cfg.pagoPrestamo:precio*(cfg.tilgungsbeitragPerMille||0)/1000)
    : ((cfg.pagoPre>0)?cfg.pagoPre:capitalPrestamo*(((cfg.interesPrestamo||0)+(cfg.tilgungInicial||0))/100)/12));
  var mesesPrestamo=(capitalPrestamo<=0)?0:Math.max(1,monthsToPayoff(capitalPrestamo,cfg.interesPrestamo,cuotaPrestamo));
  // Si monthsToPayoff aplica su tope de seguridad (1200 meses = más de 100 años o nunca), el préstamo no se
  // amortiza con esta cuota: res.noAmortiza lo marca y los resultados lo avisan.
  var interesTotalPrestamo=interesAnualidad(capitalPrestamo,cfg.interesPrestamo,cuotaPrestamo,mesesPrestamo);
  // Banco directo: la comisión (Bearbeitungsgebühr) sigue siendo un % del PRÉSTAMO realmente
  // desembolsado (capitalPrestamo) — reduce lo que el cliente recibe en mano aunque devuelva el
  // capital completo. En Bausparvertrag ya se ha cobrado en la fase de ahorro (comisionAhorro,
  // arriba), así que aquí no vuelve a restarse del préstamo.
  var comisionPrestamo=esBausparvertrag?0:capitalPrestamo*(cfg.comision||0)/100;
  var comision=esBausparvertrag?comisionAhorro:comisionPrestamo;
  var costeTotal=precio+interesTotalPrestamo+comision-interesGanadoAhorro;
  // Bausparvertrag: se descuenta la parte de la Abschlussgebühr proporcional al préstamo (comisión × préstamo / Bausparsumme), como
  // hace la Modellrechnung de Badenia ("(anteilige) Abschlussgebühr": reproduce su 2,14 % / 1,41 % del ejemplo de 300.000 €).
  var comisionEfectiva=esBausparvertrag?(precio>0?comisionAhorro*capitalPrestamo/precio:0):comisionPrestamo;
  var ultimaCuota=(mesesPrestamo>=1&&mesesPrestamo<1200)?balanceTrasMeses(capitalPrestamo,cfg.interesPrestamo,cuotaPrestamo,mesesPrestamo-1)*(1+(cfg.interesPrestamo||0)/1200):0;
  var tasaEfectiva=effectiveAnnualRate(capitalPrestamo-comisionEfectiva,cuotaPrestamo,mesesPrestamo,ultimaCuota);
  // Duración real de cada camino hasta terminar de pagar del todo: ahorro (si lo hay) + el
  // plazo del préstamo que sigue después — la comparación de tiempo que pide verse tan clara
  // como la de precio (p. ej. "3,5 + 10 años" frente a "30 años").
  var mesesAhorroEfectivo=(pct>0)?mesesAhorro:0;
  var mesesTotal=mesesAhorroEfectivo+mesesPrestamo;
  // Restschuld al final de la Zinsbindung: el dato que cualquier calculadora bancaria alemana
  // real muestra siempre (lo vimos en ehyp.de) — cuánta deuda queda sin pagar cuando se acaba
  // el tipo fijo, y hay que refinanciar (Anschlussfinanzierung) al tipo que haya entonces. Solo
  // tiene sentido en Banco directo: en un Bausparvertrag el tipo está fijado para TODA la
  // Darlehensphase, así que no hay Zinsbindung que se acabe antes de terminar de pagar.
  var restschuldZinsbindung=(!esBausparvertrag&&cfg.zinsbindung!=null)
    ?balanceTrasMeses(capitalPrestamo,cfg.interesPrestamo,cuotaPrestamo,Math.min(mesesPrestamo,Math.round((cfg.zinsbindung||0)*12)))
    :null;
  var res={sonderAhorro:sonderAhorro,sonderAhorroTope:(sonderAhorro<sonderPedida-0.5),minAhorroAplicado:minAhorroAplicado,noAmortiza:(capitalPrestamo>0&&mesesPrestamo>=1200),objetivoAhorro:objetivoAhorro,capitalPrestamo:capitalPrestamo,cuotaAhorro:cuotaAhorro,cuotaPrestamo:cuotaPrestamo,interesTotalPrestamo:interesTotalPrestamo,interesGanadoAhorro:interesGanadoAhorro,comision:comision,costeTotal:costeTotal,tasaEfectiva:tasaEfectiva,tasaNominal:cfg.interesPrestamo||0,mesesAhorro:mesesAhorroEfectivo,mesesPrestamo:mesesPrestamo,mesesTotal:mesesTotal,restschuldZinsbindung:restschuldZinsbindung};
  // Sondertilgung anual (banco y fase de préstamo del Bausparvertrag): un pago extra a capital cada 12 meses, con la cuota
  // mensual constante. Sin fórmula cerrada, así que se simula mes a mes y se sobrescribe plazo,
  // intereses, coste y Restschuld; se guarda también cuánto se ahorra frente a no hacerla.
  var stPedida=(capitalPrestamo>0)?Math.max(0,cfg.sondertilgung||0):0;
  // Tope anual (% del préstamo, típico 5 %): el contrato limita cuánto se puede amortizar de más al año.
  var tope=Math.max(0,cfg.topeST||0), st=(tope>0)?Math.min(stPedida,capitalPrestamo*tope/100):stPedida;
  if(st>0 && cuotaPrestamo>0){
    var zM=Math.round((cfg.zinsbindung||0)*12);
    var sm=simLoan(capitalPrestamo,cfg.interesPrestamo,cuotaPrestamo,st,0,1200);
    res.sondertilgung=st; res.topeAplicado=(st<stPedida-0.5); res.saldos=sm.saldos;
    res.ahorroInteresST=Math.max(0,res.interesTotalPrestamo-sm.interes); res.mesesAntesST=Math.max(0,res.mesesPrestamo-sm.meses);
    if(recargoST>0){
      // Frente a no contratar la opción (tipo base, sin Sondertilgung): el beneficio real descuenta el recargo.
      var base=calcInmuebleOption(precio,Object.assign({},cfgOrig,{sondertilgung:0}));
      var netoI=base.interesTotalPrestamo-sm.interes;
      res.recargoST=recargoST; res.recargoSuperaAhorro=(netoI<0);
      res.ahorroInteresST=Math.max(0,netoI); res.mesesAntesST=Math.max(0,base.mesesPrestamo-sm.meses);
    }
    res.interesTotalPrestamo=sm.interes; res.mesesPrestamo=sm.meses; res.mesesTotal=mesesAhorroEfectivo+sm.meses;
    res.costeTotal=precio+sm.interes+comision-interesGanadoAhorro; res.tasaEfectiva=null;
    if(!esBausparvertrag&&cfg.zinsbindung!=null) res.restschuldZinsbindung=(zM>=sm.meses)?0:sm.saldos[zM-1];
  }
  return res;
}

function isoDateYearsAgo(years){
  var d=new Date(); d.setFullYear(d.getFullYear()-years);
  var m=('0'+(d.getMonth()+1)).slice(-2), day=('0'+d.getDate()).slice(-2);
  return d.getFullYear()+'-'+m+'-'+day;
}

function todayISO(){ return isoDateYearsAgo(0); }

function mesesEntreFechas(fechaAISO,fechaBISO){
  var a=fechaAISO?new Date(fechaAISO+'T00:00:00'):null, b=fechaBISO?new Date(fechaBISO+'T00:00:00'):null;
  if(!a||isNaN(a.getTime())||!b||isNaN(b.getTime())) return 0;
  return Math.max(0,(b.getFullYear()-a.getFullYear())*12+(b.getMonth()-a.getMonth()));
}

// Intereses totales de un préstamo con cuota fija: la última cuota es menor (solo salda lo que queda), así que
// cuota*meses - capital los sobrestimaba hasta casi una cuota. Con 1200 meses (tope) no amortiza: fórmula simple.
function interesAnualidad(P,annualRatePct,cuota,n){
  if(!(P>0)||!(n>0)) return 0;
  if(n>=1200) return Math.max(0,cuota*n-(P-balanceTrasMeses(P,annualRatePct,cuota,n)));
  var r=(annualRatePct||0)/100/12, ult=balanceTrasMeses(P,annualRatePct,cuota,n-1)*(1+r);
  return Math.max(0,cuota*(n-1)+ult-P);
}

function balanceTrasMeses(P,annualRatePct,cuota,mesesTranscurridos){
  var r=(annualRatePct||0)/100/12;
  return Math.abs(r)<1e-9
    ? Math.max(0,P-cuota*mesesTranscurridos)
    : Math.max(0,P*Math.pow(1+r,mesesTranscurridos)-cuota*((Math.pow(1+r,mesesTranscurridos)-1)/r));
}

function calcRefiRemaining(refi){
  var P=refi.importeOriginal||0;
  var totalMeses=Math.max(1,Math.round((refi.plazoOriginal||0)*12));
  // cuotaActual (opcional): la cuota real que paga hoy el cliente; si se fija, el plazo restante es
  // el que resulta de esa cuota y no el del plazo original.
  var fija=(refi.cuotaActual>0);
  var cuotaOriginal=fija?refi.cuotaActual:annuityQuota(P,refi.interesOriginal,totalMeses);
  var elapsedMeses=fija?mesesEntreFechas(refi.fechaInicio,todayISO()):Math.min(totalMeses,mesesEntreFechas(refi.fechaInicio,todayISO()));
  var saldoPendiente=balanceTrasMeses(P,refi.interesOriginal,cuotaOriginal,elapsedMeses);
  var mesesRestantes=fija?(saldoPendiente>0.5?monthsToPayoff(saldoPendiente,refi.interesOriginal,cuotaOriginal):0):Math.max(0,totalMeses-elapsedMeses);
  // saldoHoy (opcional): el saldo real que consta hoy en el banco; manda sobre el calculado y de ahí
  // en adelante todo se proyecta con la cuota (plazo restante = el que resulta de ese saldo).
  if(refi.saldoHoy>0){ saldoPendiente=refi.saldoHoy; mesesRestantes=monthsToPayoff(saldoPendiente,refi.interesOriginal,cuotaOriginal); }
  var interesRestante=interesAnualidad(saldoPendiente,refi.interesOriginal,cuotaOriginal,mesesRestantes);
  var costeTotalSeguirIgual=saldoPendiente+interesRestante;
  return {cuotaOriginal:cuotaOriginal,totalMeses:totalMeses,elapsedMeses:elapsedMeses,mesesRestantes:mesesRestantes,saldoPendiente:saldoPendiente,interesRestante:interesRestante,costeTotalSeguirIgual:costeTotalSeguirIgual};
}

function saldoEnFecha(refi,fechaISO){
  var P=refi.importeOriginal||0;
  var totalMeses=Math.max(1,Math.round((refi.plazoOriginal||0)*12));
  var cuotaOriginal=(refi.cuotaActual>0)?refi.cuotaActual:annuityQuota(P,refi.interesOriginal,totalMeses);
  if(refi.saldoHoy>0) return balanceTrasMeses(refi.saldoHoy,refi.interesOriginal,cuotaOriginal,mesesEntreFechas(todayISO(),fechaISO));
  var elapsed=(refi.cuotaActual>0)?mesesEntreFechas(refi.fechaInicio,fechaISO):Math.min(totalMeses,mesesEntreFechas(refi.fechaInicio,fechaISO));
  return balanceTrasMeses(P,refi.interesOriginal,cuotaOriginal,elapsed);
}

function defaultInmueble(){
  return {
    modo:'compra',
    precio:200000,
    // plazoPrestamo (no tilgungsbeitragPerMille) es lo que se fija aquí: la migración de abajo
    // (migrateBausparTilgungsbeitrag) deriva el ‰ correspondiente a este plazo la primera vez
    // que se carga — así el plazo por defecto es siempre 10 años, sin importar precio/interés,
    // en vez de un ‰ fijo que da un plazo distinto según el escenario.
    a:{pct:40,anios:3.6,interesAhorro:0.05,interesPrestamo:1.75,plazoPrestamo:10,comision:1.6},
    b:{pct:50,anios:5,interesAhorro:0.05,interesPrestamo:0.95,plazoPrestamo:10,comision:1.6},
    banco:{pct:0,anios:0,interesAhorro:0,interesPrestamo:3.5,tilgungInicial:2,comision:0,zinsbindung:10},
    refi:{
      importeOriginal:200000,interesOriginal:3.0,plazoOriginal:25,fechaInicio:isoDateYearsAgo(5),fechaRefi:isoDateYearsAgo(-5),compraNueva:false,
      banco:{interesPrestamo:3.5,tilgungInicial:2,comision:0,zinsbindung:10},
      a:{pct:40,interesAhorro:0.05,interesPrestamo:1.75,plazoPrestamo:10,comision:1.6},
      b:{pct:50,interesAhorro:0.05,interesPrestamo:0.95,plazoPrestamo:10,comision:1.6}
    }
  };
}

// Plazo del préstamo del Bausparvertrag, en años — lo que el cliente de verdad entiende y puede
// elegir, aunque por debajo el dato guardado siga siendo el Tilgungsbeitrag fijo en ‰ (así
// calculan las Bausparkassen reales: la cuota no depende del plazo elegido, es al revés — el
// plazo es la consecuencia de la cuota fija). Esta función solo hace la lectura inversa, para
// mostrar el plazo actual en el campo.
// Rango de ‰ que el propio control "Plazo del préstamo" (1-40 años, ver data-inm-plazo más
// abajo) puede llegar a producir para este cfg concreto — se usa para saber si un valor
// guardado es corrupto de verdad o simplemente un plazo válido que ese control ya permite.
function tilgungsbeitragRango(bausparsumme,cfg){
  var capitalPrestamo=(bausparsumme||0)*(1-(cfg.pct||0)/100);
  if(capitalPrestamo<=0||!bausparsumme) return null;
  var factor=capitalPrestamo/bausparsumme*1000;
  return {
    min: annuityQuota(1,cfg.interesPrestamo,480)*factor, // 40 años -> cuota mínima -> ‰ mínimo
    max: annuityQuota(1,cfg.interesPrestamo,12)*factor   // 1 año -> cuota máxima -> ‰ máximo
  };
}

function bausparPlazoActual(bausparsumme,cfg){
  var capitalPrestamo=(bausparsumme||0)*(1-(cfg.pct||0)/100);
  if(capitalPrestamo<=0) return 0;
  var cuota=(bausparsumme||0)*(cfg.tilgungsbeitragPerMille||0)/1000;
  return Math.round((monthsToPayoff(capitalPrestamo,cfg.interesPrestamo,cuota)/12)*10)/10;
}

// Si la fecha de refinanciación quedó en el pasado (o antes de que el crédito empezara),
// se trata como "hoy" — proyectar hacia atrás no tiene sentido y antes daba un saldo
// engañoso (el importe original completo, en vez del saldo real de hoy).
function fechaRefiEfectiva(refi){
  var hoy=todayISO();
  return (refi.fechaRefi&&refi.fechaRefi>hoy)?refi.fechaRefi:hoy;
}

// Cuánto le queda al cliente por pagar hasta ser dueño del 100% — durante el ahorro, precio
// menos lo ahorrado hasta ese momento (interés compuesto sobre las cuotas ya hechas); una vez
// arranca el préstamo, capital menos lo ya amortizado. Reutiliza balanceTrasMeses, la misma
// fórmula que ya usa Refinanciar para el saldo pendiente — no es un cálculo nuevo, es el mismo
// aplicado mes a mes en vez de a una única fecha.
function inmuebleCurvaSaldo(precio,r,cfg){
  // Valor exacto en un mes cualquiera: la gráfica se dibuja cada 3 meses (más los cambios de tramo), pero los hitos y las
  // etiquetas piden meses sueltos (p. ej. 43) y NO deben salir interpolados entre dos puntos de la rejilla.
  function pend(t){
    if(t>=r.mesesTotal) return 0;
    var pendiente;
    if(r.mesesAhorro>0 && t<=r.mesesAhorro){
      var ahorroAcum=ahorroSaldoEn(r.cuotaAhorro,r.sonderAhorro,cfg.interesAhorro,t);
      pendiente=precio-Math.min(ahorroAcum,r.objetivoAhorro);
    }else{
      var tp=t-r.mesesAhorro;
      pendiente=(r.saldos&&tp>0)?(tp>r.saldos.length?0:r.saldos[tp-1]):balanceTrasMeses(r.capitalPrestamo,cfg.interesPrestamo,r.cuotaPrestamo,tp);
    }
    return Math.max(0,pendiente);
  }
  var puntos=inmuebleCurvaPuntos(pend,r.mesesTotal,[r.mesesAhorro]);
  puntos.exacto=pend;
  return puntos;
}
// Rejilla de la gráfica: cada 3 meses, más los meses donde cambia el tramo (asignación, refinanciación…) y el final, para que
// el quiebre se dibuje en su sitio y no a mitad de un segmento.
function inmuebleCurvaPuntos(pend,totalMeses,quiebres){
  var ts=[], t;
  for(t=0;t<=totalMeses;t+=3) ts.push(t);
  (quiebres||[]).concat([totalMeses]).forEach(function(q){ q=Math.round(q); if(q>0&&q<=totalMeses&&ts.indexOf(q)<0) ts.push(q); });
  ts.sort(function(x,y){ return x-y; });
  return ts.map(function(m){ return {meses:m,pendiente:pend(m)}; });
}

// Banco directo/refinanciar con banco NO es un peligro — es la otra opción financiera legítima —
// así que ya no se dibuja en rojo (leía como "alarma"); usa el dorado oscuro de marca. Y dos
// líneas bajando solas no cuentan nada: se añaden dos avisos con la cifra exacta en el momento
// en que el Bausparvertrag termina de pagar (cuánto le falta al banco justo entonces) y una
// franja sombreada de ahí en adelante — la ventaja ya conseguida, en positivo, no la deuda.
// Valor de una serie de puntos {meses,pendiente} en un mes dado (interpolación lineal entre puntos).
function inmuebleValorEn(pts,meses){
  if(pts.exacto) return pts.exacto(meses);
  for(var i=1;i<pts.length;i++){
    if(pts[i].meses>=meses){
      var a=pts[i-1],b=pts[i];
      if(b.meses===a.meses) return b.pendiente;
      var f=(meses-a.meses)/(b.meses-a.meses);
      return a.pendiente+(b.pendiente-a.pendiente)*f;
    }
  }
  return pts[pts.length-1].pendiente;
}

// Versión de la curva para Refinanciar: antes de la fecha de refinanciación el crédito ACTUAL
// sigue vivo para las dos opciones por igual (misma cuota, mismo saldo) — la diferencia es que
// en la estrategia Badenia el ahorro corre EN PARALELO a esos pagos (no después, como en
// Comprar), así que lo que de verdad queda por pagar es el saldo del crédito menos lo ya
// ahorrado. En "Refinanciar con banco" no hay esa fase de ahorro, así que su línea hasta la
// fecha de refinanciación es sencillamente el crédito actual amortizándose solo.
// Hitos del gráfico (Comprar): Zuteilung, fin de la Zinsbindung, Bausparvertrag pagado y banco pagado, con lo que debe cada camino y lo
// ahorrado en ese momento. Los valores salen de las mismas curvas que el gráfico.
// ÚNICA fuente de la duración total DESDE HOY de una opción (titular, tarjetas, hitos y gráfica leen esto; nadie vuelve a sumar fases por su cuenta).
// Comprar (espera 0): ahorro + préstamo. Refinanciar: durante la espera sigue el crédito actual; una opción con ahorro (Badenia) ahorra EN
// PARALELO en esa espera, así que no se suma aparte; una sin ahorro (banco) empieza su préstamo cuando acaba la espera.
function inmuebleMesesDesdeHoy(r,esperaMeses){
  esperaMeses=esperaMeses||0;
  if(!(esperaMeses>0)) return r.mesesTotal;
  var mesesAhorro=r.mesesTotal-r.mesesPrestamo;
  return (mesesAhorro>0?Math.max(esperaMeses,mesesAhorro):esperaMeses)+r.mesesPrestamo;
}

function inmuebleHitosComprar(precio,rEst,rk,ptsEst,ptsBanco,zMeses){
  var rows=[];
  function ahorroEn(m){ return (rEst.mesesAhorro>0 && m<=rEst.mesesAhorro)?Math.max(0,precio-inmuebleValorEn(ptsEst,m)):(rEst.objetivoAhorro||0); }
  function add(n,m){ rows.push({n:n,m:m,banco:(m>=rk.mesesTotal)?0:inmuebleValorEn(ptsBanco,m),baus:(m>=rEst.mesesTotal)?0:inmuebleValorEn(ptsEst,m),ahorro:(rEst.mesesAhorro>0)?ahorroEn(m):0}); }
  if(rEst.mesesAhorro>0) add('Asignación del Bausparvertrag',rEst.mesesAhorro);
  if(zMeses>0 && zMeses<rk.mesesTotal) add('Fin del tipo fijo',zMeses);
  add('Bausparvertrag pagado',inmuebleMesesDesdeHoy(rEst,0));
  add('Banco pagado',inmuebleMesesDesdeHoy(rk,0));
  return rows.sort(function(a,b){ return a.m-b.m; });
}

function inmuebleHitosRefi(refi,mesesHastaRefi,rEst,rBanco,ptsEst,ptsBanco){
  var rows=[], zMeses=Math.round((refi.banco.zinsbindung||0)*12), finEst=inmuebleMesesDesdeHoy(rEst,mesesHastaRefi), finBanco=inmuebleMesesDesdeHoy(rBanco,mesesHastaRefi);
  function add(n,m){ rows.push({n:n,m:m,banco:(m>=finBanco)?0:inmuebleValorEn(ptsBanco,m),baus:(m>=finEst)?0:inmuebleValorEn(ptsEst,m),ahorro:(rEst.cuotaAhorro>0&&m>=mesesHastaRefi)?rEst.objetivoAhorro:0}); }
  add('Refinanciación (asignación de Badenia)',mesesHastaRefi);
  if(zMeses>0 && mesesHastaRefi+zMeses<finBanco) add('Fin del tipo fijo',mesesHastaRefi+zMeses);
  add('Badenia pagada',finEst);
  add('Banco pagado',finBanco);
  return rows.sort(function(a,b){ return a.m-b.m; });
}

function inmuebleCurvaSaldoRefi(rem,refi,mesesHastaRefi,rNew,cfgNew,tieneAhorroParalelo){
  var totalMeses=inmuebleMesesDesdeHoy(rNew,mesesHastaRefi);
  function pend(t){
    if(t>=totalMeses) return 0;
    var pendiente;
    if(t<=mesesHastaRefi){
      var tCredito=Math.min(t,rem.mesesRestantes);
      var saldoCredito=balanceTrasMeses(rem.saldoPendiente,refi.interesOriginal,rem.cuotaOriginal,tCredito);
      var ahorroAcum=0;
      if(tieneAhorroParalelo){
        ahorroAcum=ahorroSaldoEn(rNew.cuotaAhorro,rNew.sonderAhorro,cfgNew.interesAhorro,t);
        ahorroAcum=Math.min(ahorroAcum,rNew.objetivoAhorro);
      }
      pendiente=saldoCredito-ahorroAcum;
    }else{
      var tq=t-mesesHastaRefi;
      pendiente=(rNew.saldos&&tq>0)?(tq>rNew.saldos.length?0:rNew.saldos[tq-1]):balanceTrasMeses(rNew.capitalPrestamo,cfgNew.interesPrestamo,rNew.cuotaPrestamo,tq);
    }
    return Math.max(0,pendiente);
  }
  var puntos=inmuebleCurvaPuntos(pend,totalMeses,[mesesHastaRefi,rem.mesesRestantes]);
  puntos.exacto=pend;
  return puntos;
}

// Fecha de refinanciación (Comprar, mes y año) = mes de inicio + Zinsbindung del banco: es otra forma
// de verla (misma fuente de verdad, banco.zinsbindung), no un dato aparte.
function inmuebleFechaRefiYM(inm){
  var d=inmuebleInicioDate(inm&&inm.inicio); d.setMonth(d.getMonth()+Math.round((inm.banco.zinsbindung||0)*12));
  return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2);
}

function inmuebleSyncFechaRefi(inm){ var e=document.getElementById('inm-fecha-refi'); if(e&&document.activeElement!==e) e.value=inmuebleFechaRefiYM(inm); }

function inmuebleInicioDate(ini){
  var m=/^(\d{4})-(\d{2})$/.exec(ini||''), d=new Date(); d.setDate(1);
  if(m){ d.setFullYear(+m[1],+m[2]-1,1); }
  return d;
}

// Fichas guardadas con el esquema anterior (plazoPrestamo en años + anualidad) migran a la
// cuota fija real (Tilgung inicial % para banco, Tilgungsbeitrag ‰ para Bausparvertrag) SIN
// cambiar el número que el asesor ya veía: se deriva la cuota que daba el plazoPrestamo
// guardado y se reexpresa como el dato equivalente en el nuevo esquema, para no perder ni
// silenciar lo que ya había introducido.
// Redondeado a 2 decimales: es un valor derivado por matemática de coma flotante, no una
// cifra que el asesor haya escrito — sin redondear salían cosas como "1,5802237179106289%"
// en el campo, ilegible y que parecía un dato roto en vez de una migración automática.
function migrateBancoTilgung(cfg){
  if(cfg.tilgungInicial!=null||cfg.plazoPrestamo==null) return;
  var quotaPerUnit=annuityQuota(1,cfg.interesPrestamo,Math.max(1,Math.round((cfg.plazoPrestamo||0)*12)));
  cfg.tilgungInicial=Math.round(Math.max(0,quotaPerUnit*12*100-(cfg.interesPrestamo||0))*100)/100;
}

// Plazo del banco <-> Tilgung inicial: una hipoteca alemana fija la Tilgung, el plazo es consecuencia. Para poder decir "a 30 años" se
// calcula la Tilgung inicial que da exactamente ese plazo con el interés actual (misma anualidad que la migración de arriba).
function tilgungParaPlazo(interesPct,anios){
  var q=annuityQuota(1,interesPct,Math.max(1,Math.round(anios*12)));
  return Math.round(Math.max(0,q*12*100-(interesPct||0))*100)/100;
}

function bancoPlazoActual(cfg){
  if(cfg.plazoObjetivo>0) return cfg.plazoObjetivo;
  var r=cfg.interesPrestamo||0, t=(cfg.tilgungInicial==null?2:cfg.tilgungInicial);
  return Math.round(monthsToPayoff(1,r,(r+t)/1200)/12*10)/10;
}

function migrateBausparTilgungsbeitrag(cfg,bausparsumme){
  if(cfg.tilgungsbeitragPerMille!=null) return;
  if(cfg.plazoPrestamo==null||!(bausparsumme>0)){ cfg.tilgungsbeitragPerMille=6; return; }
  var capitalPrestamo=bausparsumme*(1-(cfg.pct||0)/100);
  var quotaPerUnit=annuityQuota(1,cfg.interesPrestamo,Math.max(1,Math.round((cfg.plazoPrestamo||0)*12)));
  cfg.tilgungsbeitragPerMille=Math.ceil(Math.max(0,quotaPerUnit*capitalPrestamo/bausparsumme*1000)*10000-1e-6)/10000;
}

// Importe a financiar en Comprar: precio + gastos de compra (% del precio) - capital propio. Con los valores por defecto (0 y 0)
// es el precio, es decir, el comportamiento de siempre. Todo el cálculo (Bausparsumme, préstamo, banco) parte de este importe.
function inmuebleFin(inm){
  var p=Math.max(0,inm.precio||0), g=Math.max(0,inm.gastosPct||0), c=Math.max(0,inm.capitalPropio||0);
  return Math.max(0,Math.round((p*(1+g/100)-c)*100)/100);
}

// Límites de los campos numéricos: solo evitan valores absurdos (negativos, miles de millones…); no son recomendaciones.
var INM_LIMITES={
  precio:[0,1e8], ingresoNeto:[0,1e6], capitalPropio:[0,1e8], gastosPct:[0,30], pagoIgual:[0,1e6],
  interesPrestamo:[0,20], interesAhorro:[0,20], interesOriginal:[0,20], recargoST:[0,5], comision:[0,10],
  zinsbindung:[0,40], plazoOriginal:[0,60], pct:[0,100], anios:[0,40], marcaAnios:[0,40], topeST:[0,100],
  sondertilgung:[0,1e7], sonderAhorro:[0,1e6], pagoAhorro:[0,1e6], pagoPrestamo:[0,1e6], pagoPre:[0,1e6],
  cuotaActual:[0,1e6], saldoHoy:[0,1e8], importeOriginal:[0,1e8]
};
// Devuelve {v: valor dentro de límites, recortado: true si hubo que cambiarlo}. Texto vacío o no numérico = 0 (sin recorte).
function inmuebleLimitar(campo,valor){
  var v=(typeof valor==='number')?valor:parseFloat(valor), l=INM_LIMITES[campo];
  if(isNaN(v)) return {v:0,recortado:false};
  if(!l) return {v:v,recortado:false};
  var r=Math.min(l[1],Math.max(l[0],v));
  return {v:r,recortado:(r!==v)};
}

// Datos de la ficha del cliente que el Proyecto inmobiliario puede traer solo, tal como los guarda analisis.html en
// rec.data.fields: neto mensual del hogar de trabajo (por cuenta ajena + propia, Persona A y B), precio de la vivienda
// objetivo (S.7) y el margen mensual (todos los ingresos netos menos los gastos, sin el alquiler/hipoteca actual, que
// dejaría de pagarse). Sin ficha o sin esos datos devuelve ceros/null y no se toca nada.
function inmuebleDatosCliente(rec){
  var f=(rec&&rec.data&&rec.data.fields)||{}, n=function(k){ var v=parseFloat(f[k]); return v>0?v:0; };
  var ingreso=0; ['salarioNeto','autonomoNeto'].forEach(function(k){ ingreso+=n('inc:'+k+'_A')+n('inc:'+k+'_B'); });
  var total=0; ['salarioNeto','autonomoNeto','alquiler','intereses','ayudas','otros'].forEach(function(k){ total+=n('inc:'+k+'_A')+n('inc:'+k+'_B'); });
  var gastos=0, vivienda=0;
  if(rec&&rec.data&&rec.data.expMode==='total') gastos=n('exptotal:');
  else Object.keys(f).forEach(function(k){ if(k.indexOf('exp:')===0){ var v=n(k); gastos+=v; if(k==='exp:alquilerHipoteca') vivienda+=v; } });
  // Ahorro de libre disposición (cuenta + Tagesgeld, igual que el "corto plazo" de Análisis financiero): por persona A+B si hay,
  // y si no, el total de la ficha. No cuenta ETF ni el saldo de Bausparverträge ya existentes.
  function personas(k){ var ab=n('sit:'+k+'_A')+n('sit:'+k+'_B'); return ab>0?ab:n('sit:'+k); }
  var liquido=personas('ahorroLiquido')+personas('tagesgeldSaldo');
  var flujo=(total>0&&gastos>0)?{ ingresoTotal:Math.round(total), gastos:Math.round(gastos-vivienda), libre:Math.round(total-(gastos-vivienda)),
    gastosTotales:Math.round(gastos), libreHoy:Math.round(total-gastos), liquido:Math.round(liquido) }:null;
  // Capital propio que se propone: el ahorro líquido menos 6 meses de gastos totales como reserva de emergencia (el máximo que
  // pide Análisis financiero), a múltiplos de 100 €.
  var capital=flujo?Math.max(0,Math.floor((liquido-6*gastos)/100)*100):0;
  return { ingreso:Math.round(ingreso), precio:n('sit:precioViviendaObjetivo'), capital:capital, flujo:flujo };
}
// Rellena precio, ingreso y capital propio desde la ficha mientras el asesor no los haya cambiado a mano: inm.desdeCliente guarda lo
// último traído, y un campo se actualiza solo si sigue vacío (ingreso o capital 0, precio = el de ejemplo) o igual a ese valor.
// inm.flujo (margen mensual) es un dato derivado: se recalcula en cada carga y se borra si la ficha ya no lo permite.
function inmuebleAplicarDatosCliente(rec,inm){
  var d=inmuebleDatosCliente(rec);
  if(d.flujo) inm.flujo=d.flujo; else delete inm.flujo;
  if(!(d.ingreso>0||d.precio>0||d.capital>0)) return;
  if(!inm.desdeCliente||typeof inm.desdeCliente!=='object') inm.desdeCliente={};
  var vacio={ ingreso:function(v){ return !(v>0); }, capital:function(v){ return !(v>0); }, precio:function(v){ return v===defaultInmueble().precio; } };
  [['ingreso','ingresoNeto'],['precio','precio'],['capital','capitalPropio']].forEach(function(c){
    var v=d[c[0]], cur=inm[c[1]], prev=inm.desdeCliente[c[0]];
    if(!(v>0)||cur===v) { if(v>0) inm.desdeCliente[c[0]]=v; return; }
    if(cur===prev||(prev==null&&vacio[c[0]](cur))){ inm[c[1]]=v; inm.desdeCliente[c[0]]=v; }
  });
}
// Semáforo del capital propio frente al precio: menos del 10 % rojo, del 10 % hasta menos del 15 % amarillo, 15 % o más verde.
// Sin precio no hay semáforo (nivel '').
function inmuebleCapitalNivel(inm){
  var precio=(inm&&inm.precio)||0, cap=Math.max(0,(inm&&inm.capitalPropio)||0);
  if(!(precio>0)) return { pct:0, nivel:'' };
  var pct=cap/precio*100;
  return { pct:pct, nivel:(pct<10)?'rojo':(pct<15?'amarillo':'verde') };
}
// "Cuándo sería sano empezar": con el capital propio indicado y lo que el cliente puede ahorrar cada mes (ingresos menos TODOS los
// gastos, incluido el alquiler, que se sigue pagando mientras se ahorra), cuánto tarda en reunir el 10 % del precio (cubre los
// gastos de compra) y el 20 % (gastos + un 10 % de entrada). Sin interés ni cambios de precio. null si la ficha no tiene ingresos y gastos.
function inmuebleCuandoComprar(inm){
  var fl=inm&&inm.flujo; if(!fl) return null;
  var precio=Math.max(0,inm.precio||0), cap=Math.max(0,inm.capitalPropio||0), ahorroMes=Math.max(0,fl.libreHoy||0);
  var metas=[10,20].map(function(pct){
    var meta=precio*pct/100, faltan=Math.max(0,meta-cap);
    return { pct:pct, meta:Math.round(meta), faltan:Math.round(faltan), meses:(faltan<=0)?0:(ahorroMes>0?Math.ceil(faltan/ahorroMes):null) };
  });
  return { liquido:fl.liquido||0, disp6:Math.max(0,Math.floor(((fl.liquido||0)-6*fl.gastosTotales)/100)*100), disp3:Math.max(0,Math.floor(((fl.liquido||0)-3*fl.gastosTotales)/100)*100),
    ahorroMes:ahorroMes, metas:metas };
}
// Cuota mensual orientativa que cabría según la ficha: lo que sobra al mes, sin pasar del límite de cuota (% del ingreso
// neto), menos lo que ya se paga al banco a la vez (restar: en Refinanciar y en Comprar y refinanciar el ahorro corre en paralelo a la
// cuota del crédito). tope = 0 si no cabe nada. null si la ficha no tiene ingresos y gastos.
function inmuebleCuotaSugerida(inm,restar){
  var fl=inm&&inm.flujo; if(!fl) return null;
  if(!(fl.libre>0)) return { libre:fl.libre, tope:0, restar:0 };
  var lim=(inm.ratioMax||35)/100*(inm.ingresoNeto>0?inm.ingresoNeto:fl.ingresoTotal), ya=Math.max(0,restar||0);
  return { libre:fl.libre, tope:Math.max(0,Math.floor((Math.min(fl.libre,lim)-ya)/10)*10), restar:ya };
}

// "Comprar y refinanciar": se compra ya con una hipoteca bancaria y a la vez se ahorra en un Bausparvertrag, que al terminar
// el tipo fijo sustituye lo que queda de la hipoteca. Es el modo Refinanciar (inm.modo 'refi') con inm.refi.compraNueva = true:
// el "crédito actual" no se escribe, se DERIVA de la compra (importe a financiar, tipo, cuota y Zinsbindung del banco de
// Comprar) y se recalcula en cada carga, así que nada de esto es editable por separado. Fecha de refinanciación = mes de
// inicio + Zinsbindung (la misma que muestra Comprar).
function inmuebleSyncCompraRefi(inm){
  var rf=inm.refi; if(!rf) return;
  // Al volver a Refinanciar se devuelven los datos del crédito que había antes de derivarlos de la compra.
  if(!rf.compraNueva){ if(rf.antes){ Object.assign(rf,rf.antes.rf); if(rf.banco) Object.assign(rf.banco,rf.antes.banco); delete rf.antes; } return; }
  if(!rf.antes){
    var b0=rf.banco||{};
    rf.antes={ rf:{importeOriginal:rf.importeOriginal,interesOriginal:rf.interesOriginal,plazoOriginal:rf.plazoOriginal,fechaInicio:rf.fechaInicio,fechaRefi:rf.fechaRefi,cuotaActual:rf.cuotaActual||0,saldoHoy:rf.saldoHoy||0},
      banco:{tilgungInicial:b0.tilgungInicial,plazoObjetivo:b0.plazoObjetivo,pagoPre:b0.pagoPre} };
  }
  var fin=inmuebleFin(inm), b=inm.banco;
  rf.importeOriginal=fin; rf.interesOriginal=b.interesPrestamo||0; rf.plazoOriginal=Math.max(1,bancoPlazoActual(b)||1);
  rf.cuotaActual=fin>0?calcInmuebleOption(fin,Object.assign({},b,{sondertilgung:0,recargoST:0})).cuotaPrestamo:0; rf.saldoHoy=0;
  rf.fechaInicio=todayISO(); rf.fechaRefi=inmuebleFechaRefiYM(inm)+'-01';
  // Por defecto, refinanciar con banco mantiene la cuota que ya se paga (si no, la Tilgung se reinicia al 2 % y el banco "tarda" más
  // solo por el reinicio, no por el tipo). Se desactiva (rf.mantenerCuota=false) cuando el asesor cambia el plazo o el pago de esa tarjeta.
  if(rf.mantenerCuota!==false&&rf.banco){
    var saldoR=saldoEnFecha(rf,rf.fechaRefi);
    delete rf.banco.plazoObjetivo; rf.banco.pagoPre=0;
    rf.banco.tilgungInicial=Math.min(35,Math.max(0,Math.round((rf.cuotaActual*1200/Math.max(saldoR,1)-(rf.banco.interesPrestamo||0))*100)/100));
  }
}
function normalizeInmueble(rec){
  var def=defaultInmueble();
  // Un registro mal formado (inmueble o un sub-objeto que no es objeto) vuelve al valor por defecto en vez de romper la herramienta.
  var esObj=function(x){ return !!x&&typeof x==='object'&&!Array.isArray(x); };
  if(!esObj(rec.inmueble)) rec.inmueble=defaultInmueble();
  var inm=rec.inmueble;
  ['a','b','banco','refi'].forEach(function(k){ if(!esObj(inm[k])) inm[k]=def[k]; });
  ['a','b','banco'].forEach(function(k){ if(!esObj(inm.refi[k])) inm.refi[k]=def.refi[k]; });
  // Campos de funciones que se quitaron (escenarios de interés tras la Zinsbindung): ya no se usan; se limpian de los proyectos antiguos.
  var huerfano=/^(numEscenarios|tipoPost\d*|nombrePost\d*|pagoPost)$/;
  [inm,inm.a,inm.b,inm.banco,inm.refi,inm.refi.a,inm.refi.b,inm.refi.banco].forEach(function(o){ Object.keys(o).forEach(function(k){ if(huerfano.test(k)) delete o[k]; }); });
  if(!inm.modo) inm.modo='compra';
  [inm.a,inm.b].forEach(function(c){ if(c&&c.anios!=null&&c.anios<BAUSPAR_MIN_ANIOS) c.anios=BAUSPAR_MIN_ANIOS; });
  if(inm.gastosPct==null||isNaN(inm.gastosPct)) inm.gastosPct=0;
  if(inm.capitalPropio==null||isNaN(inm.capitalPropio)) inm.capitalPropio=0;
  if(inm.ingresoNeto==null||isNaN(inm.ingresoNeto)) inm.ingresoNeto=0;
  inmuebleAplicarDatosCliente(rec,inm);
  if(!Array.isArray(inm.curvaOff)) inm.curvaOff=[];
  if(inm.ratioMax==null||isNaN(inm.ratioMax)||inm.ratioMax<=0) inm.ratioMax=35;
  if(!inm.refi) inm.refi=def.refi;
  if(!inm.refi.a) inm.refi.a=def.refi.a;
  if(!inm.refi.b) inm.refi.b=def.refi.b;
  if(!inm.refi.banco) inm.refi.banco=def.refi.banco;
  if(!inm.refi.fechaRefi) inm.refi.fechaRefi=def.refi.fechaRefi;
  // Qué estrategia Bausparvertrag se compara contra el banco — solo una a la vez, para no
  // apretar tres tarjetas y dejar sitio a la línea de tiempo y demás detalle por tarjeta.
  if(inm.estrategia!=='a'&&inm.estrategia!=='b') inm.estrategia='a';
  if(inm.refi.estrategia!=='refiA'&&inm.refi.estrategia!=='refiB') inm.refi.estrategia='refiA';
  // Fichas guardadas antes de existir este campo: años de Zinsbindung real, para la barra de
  // certeza de tipo — 10 es el ejemplo que el propio Lernskript usa como plazo típico fijado.
  if(inm.banco.zinsbindung==null) inm.banco.zinsbindung=def.banco.zinsbindung;
  if(inm.refi.banco.zinsbindung==null) inm.refi.banco.zinsbindung=def.refi.banco.zinsbindung;
  inmuebleSyncCompraRefi(inm);
  // Valores guardados fuera de límites (p. ej. un interés negativo tecleado antes de existir el recorte) se reponen al límite más cercano.
  ['precio','ingresoNeto','capitalPropio','gastosPct','pagoIgual'].forEach(function(k){ if(typeof inm[k]==='number') inm[k]=inmuebleLimitar(k,inm[k]).v; });
  [inm.a,inm.b,inm.banco,inm.refi,inm.refi.a,inm.refi.b,inm.refi.banco].forEach(function(cfg){
    if(!cfg||typeof cfg!=='object') return;
    Object.keys(INM_LIMITES).forEach(function(k){ if(typeof cfg[k]==='number') cfg[k]=inmuebleLimitar(k,cfg[k]).v; });
  });
  migrateBancoTilgung(inm.banco);
  migrateBancoTilgung(inm.refi.banco);
  migrateBausparTilgungsbeitrag(inm.a,inm.precio);
  migrateBausparTilgungsbeitrag(inm.b,inm.precio);
  migrateBausparTilgungsbeitrag(inm.refi.a,inm.refi.importeOriginal);
  migrateBausparTilgungsbeitrag(inm.refi.b,inm.refi.importeOriginal);
  // Redondeo defensivo a 2 decimales, siempre, no solo la primera vez que se migra: fichas
  // que ya se guardaron con el valor migrado SIN redondear (antes de este arreglo) se quedaban
  // con el número de coma flotante feo para siempre, porque la migración solo corre si el
  // campo está vacío. Redondear aquí, en cada carga, limpia también esas fichas ya migradas.
  [inm.banco,inm.refi.banco].forEach(function(c){ if(c.tilgungInicial!=null) c.tilgungInicial=Math.round(c.tilgungInicial*100)/100; });
  // 4 decimales (no 2) para el ‰ del Bausparvertrag: a 2 decimales un plazo de 10 años daba una cuota
  // un poco menor que la exacta y el resultado mostraba 10,1 años aunque el asesor hubiera puesto 10.
  [inm.a,inm.b,inm.refi.a,inm.refi.b].forEach(function(c){ if(c.tilgungsbeitragPerMille!=null) c.tilgungsbeitragPerMille=Math.round(c.tilgungsbeitragPerMille*10000)/10000; });
  // Ahora que este campo ya no se ve ni se puede tocar, un valor guardado fuera del rango que
  // el propio formulario sugería (min/max de cuando aún era editable) ya no tiene forma de
  // corregirse a mano — así que se recorta aquí. Dentro del rango se deja tal cual (un asesor
  // pudo haberlo ajustado antes a una oferta real concreta); solo lo claramente roto (p. ej.
  // 0,2‰, que llevaba el préstamo a 100 años) se repone al valor por defecto.
  [inm.banco,inm.refi.banco].forEach(function(c){ if(c.tilgungInicial!=null && (c.tilgungInicial<0.1||c.tilgungInicial>35)) c.tilgungInicial=1.5; });
  // El rango fijo [1,20]‰ que este recorte usaba antes daba por corrupto cualquier plazo corto
  // (2 años o menos es habitual en un Bausparkasse real) en cuanto se pudo elegir el plazo en
  // años en vez de tocar el ‰ a mano — el control de plazo (1-40 años) genera ‰ fuera de [1,20]
  // sin que el dato esté roto. Ahora el rango se deriva de ESE MISMO control (vía
  // tilgungsbeitragRango), así solo se recorta lo que ningún plazo entre 1 y 40 años podría dar.
  [[inm.a,inm.precio],[inm.b,inm.precio],[inm.refi.a,inm.refi.importeOriginal],[inm.refi.b,inm.refi.importeOriginal]].forEach(function(par){
    var c=par[0], bausparsumme=par[1];
    if(c.tilgungsbeitragPerMille==null) return;
    var rango=tilgungsbeitragRango(bausparsumme,c);
    if(rango && (c.tilgungsbeitragPerMille<rango.min-0.05 || c.tilgungsbeitragPerMille>rango.max+0.05)) c.tilgungsbeitragPerMille=6;
  });
  // 'real' = cada camino con sus propios pagos; 'igual' = el banco paga cada mes lo mismo que la
  // cuota de ahorro del Bausparvertrag (comparación en igualdad de esfuerzo mensual). Solo Comprar.
  if(inm.comparar!=='igual') inm.comparar='real';
  return inm;
}

// Capacidad de pago (regla de la DVAG: la vivienda no debería pasar del 30-35 % del ingreso neto del hogar; préstamo orientativo =
// sueldo neto anual x 8). filas = [[etiqueta, cuota mensual], ...]. Devuelve null si el asesor no indicó el ingreso.
function inmuebleCapacidadDatos(inm,fin,filas){
  var ing=inm.ingresoNeto||0; if(!(ing>0)) return null;
  var lim=inm.ratioMax||35, orient=ing*12*8;
  return {
    ingreso:ing, limite:lim, cuotaMax:ing*lim/100, orientativo:orient, finSuperaOrientativo:fin>orient,
    filas:filas.filter(function(f){ return f[1]>0; }).map(function(f){
      var p=f[1]/ing*100;
      return {label:f[0],cuota:f[1],pct:p,cls:p<=30?'ok':(p<=lim?'mid':'hi'),estado:p<=30?'Dentro':(p<=lim?'Ajustado':'Por encima')};
    })
  };
}

// Líneas finas de la gráfica "Cuánto queda por pagar": otras cuotas mensuales, hasta 4. inm.curvaModo dice qué cuota se
// varía: 'banco' (lo que se paga al banco al mes) o 'bauspar' (lo que se ahorra al mes en el Bausparvertrag). La lista
// de cada modo, editable en Opciones avanzadas, está en inm.curvaCuotas.banco/.bauspar (sin lista = automática, alrededor de
// la cuota actual); inm.curvaOff guarda las cuotas apagadas con los botones.
var INM_CURVA_COLORES=['#4a8c85','#5b7fa6','#b0473a','#7a6aa8'], INM_CURVA_MAX=4;
// Modos: 'banco' (cuota que se paga al banco), 'bauspar' (cuota de ahorro del Bausparvertrag) y 'plazo' (años del préstamo del Bausparvertrag).
function inmuebleCurvaModo(inm){ var m=inm&&inm.curvaModo; return (m==='bauspar'||m==='plazo')?m:'banco'; }
// ‰ de la Bausparsumme que hace que el préstamo (capitalPrestamo) se pague en 'anios' años al interés dado (redondeo hacia arriba: el plazo real nunca pasa del pedido).
function tilgungsbeitragParaPlazo(bausparsumme,capitalPrestamo,interesPct,anios){
  var q=annuityQuota(1,interesPct,Math.max(1,Math.round(anios*12)));
  return Math.ceil(Math.max(0,q*capitalPrestamo/bausparsumme*1000)*10000-1e-6)/10000;
}
function inmuebleCurvaCuotas(inm,base){
  var g=(inm&&inm.curvaCuotas&&Array.isArray(inm.curvaCuotas[inmuebleCurvaModo(inm)]))?inm.curvaCuotas[inmuebleCurvaModo(inm)]:null;
  var modo=inmuebleCurvaModo(inm), tope=(modo==='plazo')?40:1e6;
  var l=g||(base>0?(modo==='plazo'?[0.5,0.75,1.5].map(function(f){ return Math.max(1,Math.round(base*f)); }):(modo==='bauspar'?[0.6,0.8,1.25]:[0.8,1.25,1.5]).map(function(f){ return Math.round(base*f/10)*10; })):[]);
  var out=[]; l.forEach(function(x){ x=Number(x); if(!isNaN(x)&&x>0&&x<=tope&&out.indexOf(x)<0) out.push(x); });
  return out.slice(0,INM_CURVA_MAX);
}
// "800; 1000 1.200" -> [800,1000,1200] (el punto seguido de 3 cifras es de miles; la coma es decimal); texto vacío -> null (automática).
function inmuebleParseCurvaCuotas(texto){
  var s=String(texto==null?'':texto).trim().replace(/\.(?=\d{3}(\D|$))/g,''); if(s==='') return null;
  var out=[]; s.split(/[;\s]+/).forEach(function(p){ var v=parseFloat(p.replace(',','.')); if(!isNaN(v)&&v>0&&v<=1e6&&out.indexOf(v)<0) out.push(v); });
  return out.length?out.slice(0,INM_CURVA_MAX):undefined;
}
function inmuebleToggleCurvaTipo(inm,r){
  var off=(inm.curvaOff||[]).slice(), i=off.indexOf(r); if(i>=0) off.splice(i,1); else off.push(r); inm.curvaOff=off;
}
function inmuebleSetCurvaModo(inm,modo){ inm.curvaModo=(modo==='bauspar'||modo==='plazo')?modo:'banco'; inm.curvaOff=[]; }

if(typeof module!=='undefined'&&module.exports){ module.exports={ inmuebleMesesDesdeHoy, INM_LIMITES, inmuebleLimitar, inmuebleRecargoST, sonderAhorroFV, ahorroSaldoEn, ahorroCuotaConSonder, INM_CURVA_COLORES, inmuebleCurvaModo, inmuebleCurvaCuotas, inmuebleParseCurvaCuotas, inmuebleToggleCurvaTipo, inmuebleSetCurvaModo, inmuebleCuotaSugerida, inmuebleCuandoComprar, inmuebleCapitalNivel, tilgungsbeitragParaPlazo, inmuebleCurvaPuntos, inmuebleCapacidadDatos, fmtISODate, annuityQuota, BAUSPAR_MIN_ANIOS, BAUSPAR_MIN_MESES, effectiveAnnualRate, savingsQuota, monthsToPayoff, simLoan, calcInmuebleOption, isoDateYearsAgo, todayISO, mesesEntreFechas, interesAnualidad, balanceTrasMeses, calcRefiRemaining, saldoEnFecha, defaultInmueble, tilgungsbeitragRango, bausparPlazoActual, fechaRefiEfectiva, inmuebleCurvaSaldo, inmuebleValorEn, inmuebleHitosComprar, inmuebleHitosRefi, inmuebleCurvaSaldoRefi, inmuebleFechaRefiYM, inmuebleSyncFechaRefi, inmuebleInicioDate, migrateBancoTilgung, tilgungParaPlazo, bancoPlazoActual, migrateBausparTilgungsbeitrag, inmuebleFin, normalizeInmueble, inmuebleDatosCliente, inmuebleSyncCompraRefi }; }
