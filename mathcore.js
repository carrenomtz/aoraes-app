/* AORAES · Núcleo matemático puro (AOR-MAT-001/002/003/004).
   Sin DOM, sin estado, sin dependencias. NO está enlazado a ninguna pantalla: ningún motor existente lo usa todavía,
   por lo que su presencia no cambia ningún resultado ni nada visible. Sirve de oráculo para las pruebas y de destino
   para migrar, uno a uno y con prueba, los cálculos que tengan un defecto demostrado.

   CONVENCIONES (explícitas en el nombre del parámetro):
   - Todas las tasas son FRACCIONES (0,06 = 6 %), nunca porcentajes.
   - «ef» = tipo efectivo anual; «nom» = tipo nominal anual convertible mensualmente; «m» = tipo mensual.
   - Los importes y plazos inválidos (NaN, ±Infinity, tipo <= −100 %, plazo no entero >= 0) devuelven null: «no disponible».
     Nunca se convierten en 0. Quien llama decide cómo mostrar un resultado no disponible.
   - momento: 'fin' (aportación al final de cada mes, por defecto) o 'inicio' (al principio). No se mezclan.
   - Sin redondeos intermedios (AOR-MAT-003). El redondeo a céntimos es solo de presentación: redondearEUR(). */
var AORAES_MATH=(function(){
  var EPS=1e-12;

  function fin(x){ return typeof x==='number' && isFinite(x); }
  function plazoOk(n){ return fin(n) && n>=0 && Math.floor(n)===n; }

  // ---------- Conversión de tipos ----------
  // Efectivo anual -> mensual equivalente: (1+ef)^(1/12)-1
  function mensualDesdeEfectiva(ef){ return (fin(ef)&&ef>-1) ? Math.pow(1+ef,1/12)-1 : null; }
  // Nominal anual convertible mensualmente -> mensual: nom/12
  function mensualDesdeNominal(nom){ return (fin(nom)&&nom/12>-1) ? nom/12 : null; }
  function efectivaDesdeNominal(nom){ var m=mensualDesdeNominal(nom); return m===null?null:Math.pow(1+m,12)-1; }
  function nominalDesdeEfectiva(ef){ var m=mensualDesdeEfectiva(ef); return m===null?null:m*12; }
  function mensualOk(r){ return fin(r) && r>-1; }

  // ---------- Valor futuro / presente ----------
  // FV de n aportaciones P. fin: P·((1+r)^n−1)/r ; inicio: lo anterior × (1+r). r=0 -> P·n.
  function fvAnualidad(P,r,n,momento){
    if(!fin(P)||!mensualOk(r)||!plazoOk(n)) return null;
    var fv=(Math.abs(r)<EPS) ? P*n : P*(Math.pow(1+r,n)-1)/r;
    return momento==='inicio' ? fv*(1+r) : fv;
  }
  // Capital inicial C0 + aportaciones: C0·(1+r)^n + FV(aportaciones)
  function fvTotal(C0,P,r,n,momento){
    var a=fvAnualidad(P,r,n,momento);
    if(a===null||!fin(C0)) return null;
    return C0*Math.pow(1+r,n)+a;
  }
  // Valor presente de n pagos P. fin: P·(1−(1+r)^−n)/r ; inicio: × (1+r).
  function vpAnualidad(P,r,n,momento){
    if(!fin(P)||!mensualOk(r)||!plazoOk(n)) return null;
    var vp=(Math.abs(r)<EPS) ? P*n : P*(1-Math.pow(1+r,-n))/r;
    return momento==='inicio' ? vp*(1+r) : vp;
  }

  // ---------- Inflación ----------
  // real_t = nominal_t/(1+i)^t  (t en años, mismo año base para todas las partidas)
  function deflactar(nominal,i,t){ return (fin(nominal)&&fin(i)&&i>-1&&fin(t)&&t>=0) ? nominal/Math.pow(1+i,t) : null; }
  function inflar(real,i,t){ return (fin(real)&&fin(i)&&i>-1&&fin(t)&&t>=0) ? real*Math.pow(1+i,t) : null; }

  // ---------- Préstamos ----------
  // Cuota constante: L·r/(1−(1+r)^−n) ; r=0 -> L/n
  function cuotaPrestamo(L,r,n){
    if(!fin(L)||L<0||!mensualOk(r)||!plazoOk(n)||n===0) return null;
    return Math.abs(r)<EPS ? L/n : L*r/(1-Math.pow(1+r,-n));
  }
  // Saldo tras t meses: B_t = L(1+r)^t − A((1+r)^t−1)/r ; r=0 -> L−A·t. Nunca negativo.
  function saldoPrestamo(L,r,A,t){
    if(!fin(L)||L<0||!fin(A)||A<0||!mensualOk(r)||!plazoOk(t)) return null;
    var b=(Math.abs(r)<EPS) ? L-A*t : L*Math.pow(1+r,t)-A*(Math.pow(1+r,t)-1)/r;
    return Math.max(0,b);
  }
  // Meses hasta amortizar con cuota fija A y última cuota ajustada. Si A no cubre el interés del primer mes, no amortiza.
  // Devuelve {amortiza, meses, ultimaCuota} ; meses=null si no amortiza (o datos inválidos -> null entero).
  function amortizacion(L,r,A,tope){
    if(!fin(L)||L<0||!fin(A)||A<=0||!mensualOk(r)) return null;
    tope=(tope&&plazoOk(tope))?tope:1200;
    if(L===0) return {amortiza:true,meses:0,ultimaCuota:0};
    if(r>0 && A<=L*r+EPS) return {amortiza:false,meses:null,ultimaCuota:null};
    var b=L, k=0, ult=0;
    while(b>EPS && k<tope){
      var interes=b*r, pago=Math.min(A,b+interes);
      b=b+interes-pago; k++; ult=pago;
    }
    return b>1e-9 ? {amortiza:false,meses:null,ultimaCuota:null} : {amortiza:true,meses:k,ultimaCuota:ult};
  }

  // ---------- TIR (flujos equiespaciados) ----------
  // Tipo periódico que anula el VAN de flows[0..n]. Bisección en (−0,99; 10]. null si no hay cambio de signo.
  function tir(flows){
    if(!Array.isArray(flows)||flows.length<2) return null;
    for(var j=0;j<flows.length;j++) if(!fin(flows[j])) return null;
    function van(r){ var s=0; for(var t=0;t<flows.length;t++) s+=flows[t]/Math.pow(1+r,t); return s; }
    var lo=-0.99, hi=10, flo=van(lo), fhi=van(hi);
    if(flo===0) return lo; if(fhi===0) return hi;
    if(flo*fhi>0) return null;
    for(var i=0;i<200;i++){
      var mid=(lo+hi)/2, fm=van(mid);
      if(Math.abs(fm)<1e-10) return mid;
      if((flo<0)===(fm<0)){ lo=mid; flo=fm; } else { hi=mid; }
    }
    return (lo+hi)/2;
  }

  // ---------- Presentación (AOR-MAT-003) ----------
  function redondearEUR(x){ return fin(x) ? Math.round((x+Number.EPSILON)*100)/100 : null; }
  // Igualdad monetaria por tolerancia (por defecto medio céntimo); NO se usa === sobre importes.
  function igualesEUR(a,b,tol){ return fin(a)&&fin(b) ? Math.abs(a-b)<=(tol==null?0.005:tol) : false; }

  // ---------- Traza de cálculo (AOR-MAT-004) ----------
  // Metadatos no personales de un cálculo. Solo admite claves de la lista blanca: así no se cuelan datos del cliente.
  var TRAZA_CLAVES=['motor','versionFormula','versionParametros','ejercicioFiscal','convencionTipos','moneda','baseTemporal','fuentes','incertidumbre'];
  function crearTraza(meta){
    var out={}; meta=meta||{};
    TRAZA_CLAVES.forEach(function(k){ if(meta[k]!==undefined) out[k]=meta[k]; });
    if(out.moneda===undefined) out.moneda='EUR';
    return Object.freeze(out);
  }

  return {
    mensualDesdeEfectiva:mensualDesdeEfectiva, mensualDesdeNominal:mensualDesdeNominal,
    efectivaDesdeNominal:efectivaDesdeNominal, nominalDesdeEfectiva:nominalDesdeEfectiva,
    fvAnualidad:fvAnualidad, fvTotal:fvTotal, vpAnualidad:vpAnualidad,
    deflactar:deflactar, inflar:inflar,
    cuotaPrestamo:cuotaPrestamo, saldoPrestamo:saldoPrestamo, amortizacion:amortizacion,
    tir:tir, redondearEUR:redondearEUR, igualesEUR:igualesEUR,
    crearTraza:crearTraza, TRAZA_CLAVES:TRAZA_CLAVES
  };
})();
if(typeof module!=='undefined'&&module.exports){ module.exports=AORAES_MATH; }
