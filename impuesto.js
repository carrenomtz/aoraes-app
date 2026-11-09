/* Impuesto sobre la renta alemán — tarifa básica del §32a EStG, año 2026. UNA sola copia para todas las herramientas (Jubilación, Análisis…):
   antes cada HTML llevaba la suya y había que mantenerlas «sincronizadas a mano».
   Solo la CUOTA y el tipo marginal sobre un zu versteuerndes Einkommen (zvE) ya dado. Calcular el zvE a partir del bruto (hoy una aproximación del
   78 %), la Kirchensteuer, el Solidaritätszuschlag, la tributación conjunta u otras situaciones es cosa de quien llama: aquí no se modelan.
   Las reglas fiscales cambian cada año y deben revisarse con un Steuerberater: al cambiar de ejercicio se actualiza este fichero y su prueba. */
var AORAES_IMPUESTO=(function(){
  var ANIO=2026, GRUNDFREIBETRAG=12348;
  // Cuota del impuesto para un zvE. La ley redondea el zvE y la cuota hacia abajo a euros enteros.
  function cuota(zve){
    var x=Math.max(0,Math.floor(zve)||0), t;
    if(x<=GRUNDFREIBETRAG) t=0;
    else if(x<=17799){ var y=(x-12348)/10000; t=(914.51*y+1400)*y; }
    else if(x<=69878){ var z=(x-17799)/10000; t=(173.10*z+2397)*z+1034.87; }
    else if(x<=277825) t=0.42*x-11135.63;
    else t=0.45*x-19470.38;
    return Math.max(0,Math.floor(t));
  }
  // Tipo marginal (derivada de la tarifa) sobre un zvE, entre 0 y 0,45.
  function tipoMarginal(zve){
    var x=Math.max(0,zve||0), g;
    if(x<=GRUNDFREIBETRAG) g=0;
    else if(x<=17799){ var y=(x-12348)/10000; g=(2*914.51*y+1400)/10000; }
    else if(x<=69878){ var z=(x-17799)/10000; g=(2*173.10*z+2397)/10000; }
    else if(x<=277825) g=0.42; else g=0.45;
    return Math.min(0.45,Math.max(0,g));
  }
  // Ahorro de impuesto de deducir `ded` euros de un zvE: cuota sin la deducción menos cuota con ella. Como el impuesto es progresivo, es algo menos que
  // deducción × tipo marginal (hasta un ~11 % menos con deducciones grandes). Nunca negativo ni mayor que la cuota total.
  function ahorroPorDeduccion(zve,ded){
    ded=Math.max(0,ded||0);
    return Math.max(0,cuota(zve)-cuota(Math.max(0,zve-ded)));
  }
  // Lo mismo con tributación conjunta (Ehegattensplitting): la cuota del matrimonio es 2 × la de la mitad del zvE conjunto.
  function ahorroPorDeduccionConjunta(zveConjunto,ded){
    ded=Math.max(0,ded||0);
    return Math.max(0,2*cuota(zveConjunto/2)-2*cuota(Math.max(0,zveConjunto-ded)/2));
  }
  // Tipo de Kirchensteuer sobre la cuota del impuesto (AOR-TAX-003): 8 % en Baden-Württemberg y Bayern, 9 % en el resto de Länder. 0 si el contribuyente no
  // pertenece a una Kirchengemeinde (afiliado===false). null si el Bundesland es desconocido: no se inventa un tipo. Todavía NO está conectado a ninguna pantalla
  // (Análisis y Jubilación siguen usando 9 % fijo y lo avisan en su texto); conectarlo cambia cifras y ese texto, así que requiere autorización.
  var LAENDER=['Baden-Württemberg','Bayern','Berlin','Brandenburg','Bremen','Hamburg','Hessen','Mecklenburg-Vorpommern','Niedersachsen','Nordrhein-Westfalen',
    'Rheinland-Pfalz','Saarland','Sachsen','Sachsen-Anhalt','Schleswig-Holstein','Thüringen'];
  function kirchensteuerSatz(bundesland,afiliado){
    if(LAENDER.indexOf(bundesland)<0) return null;
    if(afiliado===false) return 0;
    return (bundesland==='Baden-Württemberg'||bundesland==='Bayern')?0.08:0.09;
  }
  return {ANIO:ANIO,GRUNDFREIBETRAG:GRUNDFREIBETRAG,cuota:cuota,tipoMarginal:tipoMarginal,ahorroPorDeduccion:ahorroPorDeduccion,ahorroPorDeduccionConjunta:ahorroPorDeduccionConjunta,kirchensteuerSatz:kirchensteuerSatz};
})();
if(typeof module!=='undefined'&&module.exports){ module.exports=AORAES_IMPUESTO; }
